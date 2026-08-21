import { HttpResponse, http, type HttpHandler } from 'msw';
import Decimal from 'decimal.js';
import { db, money, totalsFor } from './db';
import {
  applyArchiveFilter,
  filterByCustomer,
  filterByDateRange,
  filterByStatus,
  newId,
  nowIso,
  paginate,
  search,
  sortRows,
  todayIso,
} from './helpers';
import type {
  Customer,
  DocumentItem,
  Invoice,
  PaymentState,
  Product,
  Quotation,
} from '@/types';

/**
 * Mock API implementing the contract in docs/05-api-spec.md.
 *
 * It deliberately mirrors the server's authority rules: totals and document
 * numbers are computed here rather than accepted from the request body, and
 * payment status is derived from payment records. That keeps the frontend
 * honest — it never learns to depend on client-side figures.
 */

const BASE = '*/api';
const LATENCY = 220;

const ok = <T>(data: T) => HttpResponse.json({ data });
const okList = <T>(result: { data: T[]; meta: unknown }) => HttpResponse.json(result);
const fail = (status: number, code: string, message: string, details?: unknown) =>
  HttpResponse.json({ error: { code, message, details }, requestId: newId('req') }, { status });

const delay = (): Promise<void> => new Promise((r) => setTimeout(r, LATENCY));

/* ------------------------------ Calculations ------------------------------ */

/** Server-side recalculation: whatever the client sent for totals is discarded. */
function recalcItems(rawItems: unknown[]): DocumentItem[] {
  return (rawItems as Record<string, unknown>[]).map((raw, index) => {
    const product = db.products.find((p) => p.id === raw['productId']);
    const tax = db.taxes.find((t) => t.id === raw['taxId']);
    const unit = db.units.find((u) => u.id === raw['unitId']);

    const quantity = new Decimal(String(raw['quantity'] ?? 1));
    const unitPrice = new Decimal(String(raw['unitPrice'] ?? 0));
    const lineSubtotal = quantity.times(unitPrice);

    const discountType = (raw['discountType'] as 'percentage' | 'fixed' | null) ?? null;
    const discountValue = new Decimal(String(raw['discountValue'] ?? 0));
    let discount = new Decimal(0);
    if (discountType === 'percentage') discount = lineSubtotal.times(discountValue).dividedBy(100);
    else if (discountType === 'fixed') discount = discountValue;
    if (discount.greaterThan(lineSubtotal)) discount = lineSubtotal;

    const taxable = lineSubtotal.minus(discount);
    const rate = new Decimal(tax?.rate ?? 0);
    const taxAmount = taxable.times(rate).dividedBy(100);

    return {
      id: (raw['id'] as string) ?? newId('i'),
      sortOrder: index,
      source: (raw['source'] as 'catalog' | 'custom') ?? 'catalog',
      productId: (raw['productId'] as string) ?? null,
      name: String(raw['name'] ?? product?.name ?? 'Item'),
      description: (raw['description'] as string) ?? null,
      sku: (raw['sku'] as string) ?? product?.sku ?? null,
      unitId: (raw['unitId'] as string) ?? null,
      unitName: unit?.name ?? product?.unitName ?? null,
      quantity: quantity.toFixed(4),
      unitPrice: money(unitPrice),
      discountType,
      discountValue: discountValue.toFixed(4),
      discountAmount: money(discount),
      taxId: tax?.id ?? null,
      taxName: tax?.name ?? null,
      taxRate: tax?.rate ?? 0,
      taxBreakdown: (tax?.components ?? []).map((c) => ({
        name: c.name,
        rate: c.rate,
        amount: money(taxAmount.times(c.rate).dividedBy(tax?.rate || 1)),
      })),
      lineSubtotal: money(lineSubtotal),
      taxableAmount: money(taxable),
      taxAmount: money(taxAmount),
      lineTotal: money(taxable.plus(taxAmount)),
      notes: (raw['notes'] as string) ?? null,
    };
  });
}

function recalcCharges(rawCharges: unknown[]) {
  return (rawCharges as Record<string, unknown>[]).map((raw) => {
    const tax = db.taxes.find((t) => t.id === raw['taxId']);
    const amount = new Decimal(String(raw['amount'] ?? 0));
    const isTaxable = Boolean(raw['isTaxable']) && Boolean(tax);
    return {
      id: (raw['id'] as string) ?? newId('g'),
      label: String(raw['label'] ?? 'Charge'),
      amount: money(amount),
      isTaxable,
      taxId: tax?.id ?? null,
      taxAmount: money(isTaxable ? amount.times(tax?.rate ?? 0).dividedBy(100) : 0),
    };
  });
}

/** Document number allocation — server side only, never from the client. */
function allocateNumber(documentType: 'quotation' | 'invoice'): string {
  const config = db.numbering.find((n) => n.documentType === documentType);
  const existing =
    documentType === 'quotation'
      ? db.quotations.map((q) => q.quotationNumber)
      : db.invoices.map((i) => i.invoiceNumber);

  const prefix = config?.prefix ?? documentType.slice(0, 3).toUpperCase();
  const sep = config?.separator ?? '-';
  const padding = config?.padding ?? 5;

  let next = (config?.startNumber ?? 1) + existing.length;
  let candidate = '';
  // Retry on collision, exactly as the server does before failing.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const parts: string[] = [prefix];
    if (config?.includeYear) parts.push(String(new Date().getFullYear()));
    if (config?.includeMonth) parts.push(String(new Date().getMonth() + 1).padStart(2, '0'));
    parts.push(String(next).padStart(padding, '0'));
    candidate = parts.join(sep);
    if (!existing.includes(candidate)) return candidate;
    next += 1;
  }
  return candidate;
}

/** Payment status is derived, never trusted from a request body. */
function derivePaymentStatus(invoice: Invoice): PaymentState {
  if (invoice.status === 'cancelled' || invoice.status === 'void') return invoice.paymentStatus;
  const grand = new Decimal(invoice.grandTotal);
  const paid = new Decimal(invoice.amountPaid);
  if (grand.isZero() || paid.greaterThanOrEqualTo(grand)) return 'paid';
  const base: PaymentState = paid.greaterThan(0) ? 'partially_paid' : 'unpaid';
  if (invoice.dueDate && invoice.dueDate < todayIso() && invoice.status !== 'draft') {
    return 'overdue';
  }
  return base;
}

function refreshInvoiceTotals(invoice: Invoice): void {
  const paid = db.payments
    .filter((p) => p.invoiceId === invoice.id && !p.isVoided)
    .reduce((acc, p) => acc.plus(p.amount), new Decimal(0));
  invoice.amountPaid = money(paid);
  invoice.amountDue = money(new Decimal(invoice.grandTotal).minus(paid));
  invoice.paymentStatus = derivePaymentStatus(invoice);
  invoice.paidAt = invoice.paymentStatus === 'paid' ? (invoice.paidAt ?? nowIso()) : null;
}

function logAudit(action: string, entityType: string, entityId: string, entityLabel: string): void {
  db.auditLogs.unshift({
    id: newId('l'),
    userId: db.members[0]!.userId,
    userEmail: db.members[0]!.email,
    action,
    entityType,
    entityId,
    entityLabel,
    metadata: {},
    ipAddress: '198.51.100.24',
    createdAt: nowIso(),
  });
}

function customerRef(customerId: string) {
  const customer = db.customers.find((c) => c.id === customerId);
  return {
    id: customer?.id ?? customerId,
    name: customer?.name ?? 'Unknown',
    companyName: customer?.companyName ?? null,
    email: customer?.email ?? null,
    phone: customer?.phone ?? null,
  };
}

function customerStats(customerId: string) {
  const invoices = db.invoices.filter(
    (i) => i.customerId === customerId && i.status !== 'cancelled' && i.status !== 'void',
  );
  const quotations = db.quotations.filter((q) => q.customerId === customerId);
  const paymentRows = db.payments.filter((p) => p.customerId === customerId && !p.isVoided);
  const totalInvoiced = invoices.reduce((a, i) => a.plus(i.grandTotal), new Decimal(0));
  const totalPaid = paymentRows.reduce((a, p) => a.plus(p.amount), new Decimal(0));
  const dates = [...invoices.map((i) => i.issueDate), ...paymentRows.map((p) => p.paymentDate)].sort();
  return {
    quotationCount: quotations.length,
    invoiceCount: invoices.length,
    totalInvoiced: money(totalInvoiced),
    totalPaid: money(totalPaid),
    outstanding: money(totalInvoiced.minus(totalPaid)),
    lastTransactionAt: dates.at(-1) ?? null,
  };
}

/* -------------------------------- Handlers -------------------------------- */

function collection<T extends { id: string }>(
  path: string,
  store: T[],
  options: {
    searchFields: (keyof T)[];
    sortFallback: keyof T;
    onCreate?: (body: Record<string, unknown>) => T;
    onUpdate?: (existing: T, body: Record<string, unknown>) => T;
    entityName: string;
  },
): HttpHandler[] {
  return [
    http.get(`${BASE}${path}`, async ({ request }) => {
      await delay();
      const url = new URL(request.url);
      let rows = applyArchiveFilter(store as (T & { archivedAt?: string | null })[], url) as T[];
      rows = search(rows, url, options.searchFields);
      rows = sortRows(rows, url, options.sortFallback);
      return okList(paginate(rows, url));
    }),

    http.get(`${BASE}${path}/:id`, async ({ params }) => {
      await delay();
      const row = store.find((r) => r.id === params['id']);
      if (!row) return fail(404, 'NOT_FOUND', `${options.entityName} not found.`);
      return ok(row);
    }),

    http.post(`${BASE}${path}`, async ({ request }) => {
      await delay();
      const body = (await request.json()) as Record<string, unknown>;
      const created = options.onCreate
        ? options.onCreate(body)
        : ({ ...body, id: newId('a'), createdAt: nowIso() } as unknown as T);
      store.unshift(created);
      logAudit(`${options.entityName.toLowerCase()}.created`, options.entityName.toLowerCase(), created.id, String((created as Record<string, unknown>)['name'] ?? created.id));
      return HttpResponse.json({ data: created }, { status: 201 });
    }),

    http.put(`${BASE}${path}/:id`, async ({ params, request }) => {
      await delay();
      const index = store.findIndex((r) => r.id === params['id']);
      if (index === -1) return fail(404, 'NOT_FOUND', `${options.entityName} not found.`);
      const body = (await request.json()) as Record<string, unknown>;
      const existing = store[index]!;
      // business_id, id and timestamps are never taken from the request.
      const { id: _id, businessId: _b, createdAt: _c, ...safe } = body;
      const updated = options.onUpdate
        ? options.onUpdate(existing, body)
        : ({ ...existing, ...safe, updatedAt: nowIso() } as T);
      store[index] = updated;
      logAudit(`${options.entityName.toLowerCase()}.updated`, options.entityName.toLowerCase(), updated.id, String((updated as Record<string, unknown>)['name'] ?? updated.id));
      return ok(updated);
    }),

    http.delete(`${BASE}${path}/:id`, async ({ params }) => {
      await delay();
      const index = store.findIndex((r) => r.id === params['id']);
      if (index === -1) return fail(404, 'NOT_FOUND', `${options.entityName} not found.`);
      store.splice(index, 1);
      return new HttpResponse(null, { status: 204 });
    }),

    http.post(`${BASE}${path}/:id/archive`, async ({ params }) => {
      await delay();
      const row = store.find((r) => r.id === params['id']) as (T & { archivedAt?: string | null; isActive?: boolean }) | undefined;
      if (!row) return fail(404, 'NOT_FOUND', `${options.entityName} not found.`);
      row.archivedAt = nowIso();
      row.isActive = false;
      return ok(row);
    }),

    http.post(`${BASE}${path}/:id/restore`, async ({ params }) => {
      await delay();
      const row = store.find((r) => r.id === params['id']) as (T & { archivedAt?: string | null; isActive?: boolean }) | undefined;
      if (!row) return fail(404, 'NOT_FOUND', `${options.entityName} not found.`);
      row.archivedAt = null;
      row.isActive = true;
      return ok(row);
    }),
  ];
}

export const handlers: HttpHandler[] = [
  /* ------------------------------- Bootstrap ------------------------------ */
  http.get(`${BASE}/bootstrap`, async () => {
    await delay();
    return ok({
      business: db.business,
      settings: db.settings,
      branding: db.branding,
      role: db.roles[0],
      memberships: [{ id: db.business.id, name: db.business.name }],
    });
  }),

  /* ------------------------------- Dashboard ------------------------------ */
  http.get(`${BASE}/dashboard`, async ({ request }) => {
    await delay();
    const url = new URL(request.url);
    const range = url.searchParams.get('range') ?? 'this_month';

    // Presets narrow the window; the shape of the response is identical.
    const windowDays =
      range === 'today' || range === 'yesterday' ? 1
      : range === 'this_week' ? 7
      : range === 'this_month' || range === 'last_month' ? 31
      : range === 'this_quarter' ? 92
      : 365;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - windowDays);
    const cutoffIso = cutoff.toISOString().slice(0, 10);

    const live = db.invoices.filter((i) => i.status !== 'cancelled' && i.status !== 'void');
    const inWindow = live.filter((i) => i.issueDate >= cutoffIso);
    const paymentsInWindow = db.payments.filter((p) => !p.isVoided && p.paymentDate >= cutoffIso);

    const revenue = inWindow.reduce((a, i) => a.plus(i.grandTotal), new Decimal(0));
    const collected = paymentsInWindow.reduce((a, p) => a.plus(p.amount), new Decimal(0));
    const outstanding = live.reduce((a, i) => a.plus(i.amountDue), new Decimal(0));

    const byMonth = new Map<string, { invoiced: Decimal; collected: Decimal }>();
    for (let i = 11; i >= 0; i -= 1) {
      const d = new Date();
      d.setMonth(d.getMonth() - i, 1);
      byMonth.set(d.toISOString().slice(0, 7), { invoiced: new Decimal(0), collected: new Decimal(0) });
    }
    for (const inv of live) {
      const key = inv.issueDate.slice(0, 7);
      const entry = byMonth.get(key);
      if (entry) entry.invoiced = entry.invoiced.plus(inv.grandTotal);
    }
    for (const pay of db.payments.filter((p) => !p.isVoided)) {
      const key = pay.paymentDate.slice(0, 7);
      const entry = byMonth.get(key);
      if (entry) entry.collected = entry.collected.plus(pay.amount);
    }

    const groupCount = <T extends { status: string; grandTotal: string }>(rows: T[]) => {
      const map = new Map<string, { count: number; amount: Decimal }>();
      for (const row of rows) {
        const entry = map.get(row.status) ?? { count: 0, amount: new Decimal(0) };
        entry.count += 1;
        entry.amount = entry.amount.plus(row.grandTotal);
        map.set(row.status, entry);
      }
      return [...map.entries()].map(([status, v]) => ({
        status,
        count: v.count,
        amount: money(v.amount),
      }));
    };

    const customerTotals = new Map<string, { name: string; invoiced: Decimal; paid: Decimal }>();
    for (const inv of live) {
      const key = inv.customerId;
      const entry = customerTotals.get(key) ?? {
        name: inv.customer.companyName ?? inv.customer.name,
        invoiced: new Decimal(0),
        paid: new Decimal(0),
      };
      entry.invoiced = entry.invoiced.plus(inv.grandTotal);
      entry.paid = entry.paid.plus(inv.amountPaid);
      customerTotals.set(key, entry);
    }

    const itemTotals = new Map<string, { name: string; quantity: Decimal; revenue: Decimal }>();
    for (const inv of live) {
      for (const item of inv.items) {
        const key = item.productId ?? item.name;
        const entry = itemTotals.get(key) ?? {
          name: item.name,
          quantity: new Decimal(0),
          revenue: new Decimal(0),
        };
        entry.quantity = entry.quantity.plus(item.quantity);
        entry.revenue = entry.revenue.plus(item.lineTotal);
        itemTotals.set(key, entry);
      }
    }

    const methodTotals = new Map<string, { count: number; amount: Decimal }>();
    for (const pay of db.payments.filter((p) => !p.isVoided)) {
      const key = pay.paymentMethodName ?? 'Other';
      const entry = methodTotals.get(key) ?? { count: 0, amount: new Decimal(0) };
      entry.count += 1;
      entry.amount = entry.amount.plus(pay.amount);
      methodTotals.set(key, entry);
    }

    const overdue = live.filter((i) => i.paymentStatus === 'overdue');
    const expiring = db.quotations.filter(
      (q) =>
        (q.status === 'sent' || q.status === 'viewed') &&
        q.validUntil !== null &&
        q.validUntil >= todayIso() &&
        q.validUntil <= new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10),
    );

    return ok({
      kpis: {
        revenue: money(revenue),
        paymentsReceived: money(collected),
        outstanding: money(outstanding),
        invoiceCount: inWindow.length,
        paidCount: live.filter((i) => i.paymentStatus === 'paid').length,
        pendingCount: live.filter((i) => i.paymentStatus === 'unpaid' || i.paymentStatus === 'partially_paid').length,
        overdueCount: overdue.length,
        quotationCount: db.quotations.length,
        acceptedCount: db.quotations.filter((q) => q.status === 'accepted' || q.status === 'converted').length,
        rejectedCount: db.quotations.filter((q) => q.status === 'rejected').length,
        customerCount: db.customers.filter((c) => !c.archivedAt).length,
        productCount: db.products.filter((p) => !p.archivedAt).length,
      },
      revenueTrend: [...byMonth.entries()].map(([period, v]) => ({
        period,
        invoiced: money(v.invoiced),
        collected: money(v.collected),
      })),
      invoiceStatus: groupCount(live.map((i) => ({ status: i.paymentStatus, grandTotal: i.grandTotal }))),
      quotationStatus: groupCount(db.quotations),
      paymentMethods: [...methodTotals.entries()].map(([method, v]) => ({
        method,
        count: v.count,
        amount: money(v.amount),
      })),
      topCustomers: [...customerTotals.entries()]
        .sort((a, b) => new Decimal(b[1].invoiced).comparedTo(a[1].invoiced))
        .slice(0, 6)
        .map(([customerId, v]) => ({
          customerId,
          name: v.name,
          invoiced: money(v.invoiced),
          paid: money(v.paid),
        })),
      topItems: [...itemTotals.entries()]
        .sort((a, b) => new Decimal(b[1].revenue).comparedTo(a[1].revenue))
        .slice(0, 6)
        .map(([productId, v]) => ({
          productId,
          name: v.name,
          quantity: v.quantity.toFixed(2),
          revenue: money(v.revenue),
        })),
      attention: {
        overdueInvoices: overdue.slice(0, 5).map((i) => ({
          id: i.id,
          number: i.invoiceNumber,
          customer: i.customer.companyName ?? i.customer.name,
          amountDue: i.amountDue,
          dueDate: i.dueDate ?? '',
        })),
        expiringQuotations: expiring.slice(0, 5).map((q) => ({
          id: q.id,
          number: q.quotationNumber,
          customer: q.customer.companyName ?? q.customer.name,
          total: q.grandTotal,
          validUntil: q.validUntil ?? '',
        })),
      },
    });
  }),

  /* ------------------------------- Customers ------------------------------ */
  http.get(`${BASE}/customers`, async ({ request }) => {
    await delay();
    const url = new URL(request.url);
    let rows = applyArchiveFilter(db.customers, url);
    rows = search(rows, url, ['name', 'companyName', 'email', 'phone', 'code']);
    rows = sortRows(rows, url, 'createdAt');
    const paged = paginate(rows, url);
    return okList({
      ...paged,
      data: paged.data.map((c) => ({ ...c, stats: customerStats(c.id) })),
    });
  }),

  http.get(`${BASE}/customers/:id`, async ({ params }) => {
    await delay();
    const customer = db.customers.find((c) => c.id === params['id']);
    if (!customer) return fail(404, 'NOT_FOUND', 'Customer not found.');
    return ok({ ...customer, stats: customerStats(customer.id) });
  }),

  http.post(`${BASE}/customers`, async ({ request }) => {
    await delay();
    const body = (await request.json()) as Record<string, unknown>;
    if (!String(body['name'] ?? '').trim()) {
      return fail(400, 'VALIDATION_ERROR', 'Invalid request body.', [
        { path: 'name', message: 'Customer name is required' },
      ]);
    }
    const customer: Customer = {
      id: newId('k'),
      code: (body['code'] as string) ?? `CUS-${String(db.customers.length + 1).padStart(4, '0')}`,
      name: String(body['name']),
      companyName: (body['companyName'] as string) ?? null,
      email: (body['email'] as string) ?? null,
      phone: (body['phone'] as string) ?? null,
      altPhone: (body['altPhone'] as string) ?? null,
      website: (body['website'] as string) ?? null,
      addressLine1: (body['addressLine1'] as string) ?? null,
      addressLine2: (body['addressLine2'] as string) ?? null,
      city: (body['city'] as string) ?? null,
      state: (body['state'] as string) ?? null,
      country: (body['country'] as string) ?? null,
      postalCode: (body['postalCode'] as string) ?? null,
      taxId: (body['taxId'] as string) ?? null,
      currencyCode: (body['currencyCode'] as string) ?? null,
      paymentTermsDays: (body['paymentTermsDays'] as number) ?? null,
      notes: (body['notes'] as string) ?? null,
      isActive: true,
      archivedAt: null,
      createdAt: nowIso(),
    };
    db.customers.unshift(customer);
    logAudit('customer.created', 'customer', customer.id, customer.companyName ?? customer.name);
    return HttpResponse.json({ data: customer }, { status: 201 });
  }),

  http.put(`${BASE}/customers/:id`, async ({ params, request }) => {
    await delay();
    const index = db.customers.findIndex((c) => c.id === params['id']);
    if (index === -1) return fail(404, 'NOT_FOUND', 'Customer not found.');
    const body = (await request.json()) as Record<string, unknown>;
    const updated = { ...db.customers[index]!, ...body, id: db.customers[index]!.id } as Customer;
    db.customers[index] = updated;
    logAudit('customer.updated', 'customer', updated.id, updated.companyName ?? updated.name);
    return ok(updated);
  }),

  http.delete(`${BASE}/customers/:id`, async ({ params }) => {
    await delay();
    const customer = db.customers.find((c) => c.id === params['id']);
    if (!customer) return fail(404, 'NOT_FOUND', 'Customer not found.');
    const referenced =
      db.invoices.some((i) => i.customerId === customer.id) ||
      db.quotations.some((q) => q.customerId === customer.id);
    if (referenced) {
      return fail(
        422,
        'REFERENCED_RECORD_IN_USE',
        'This customer appears on existing documents and cannot be deleted. Archive it instead.',
      );
    }
    db.customers = db.customers.filter((c) => c.id !== customer.id);
    return new HttpResponse(null, { status: 204 });
  }),

  http.post(`${BASE}/customers/:id/archive`, async ({ params }) => {
    await delay();
    const customer = db.customers.find((c) => c.id === params['id']);
    if (!customer) return fail(404, 'NOT_FOUND', 'Customer not found.');
    customer.archivedAt = nowIso();
    customer.isActive = false;
    logAudit('customer.archived', 'customer', customer.id, customer.companyName ?? customer.name);
    return ok(customer);
  }),

  http.post(`${BASE}/customers/:id/restore`, async ({ params }) => {
    await delay();
    const customer = db.customers.find((c) => c.id === params['id']);
    if (!customer) return fail(404, 'NOT_FOUND', 'Customer not found.');
    customer.archivedAt = null;
    customer.isActive = true;
    return ok(customer);
  }),

  http.get(`${BASE}/customers/:id/quotations`, async ({ params, request }) => {
    await delay();
    const url = new URL(request.url);
    const rows = db.quotations.filter((q) => q.customerId === params['id']);
    return okList(paginate(sortRows(rows, url, 'issueDate'), url));
  }),

  http.get(`${BASE}/customers/:id/invoices`, async ({ params, request }) => {
    await delay();
    const url = new URL(request.url);
    const rows = db.invoices.filter((i) => i.customerId === params['id']);
    return okList(paginate(sortRows(rows, url, 'issueDate'), url));
  }),

  http.get(`${BASE}/customers/:id/payments`, async ({ params, request }) => {
    await delay();
    const url = new URL(request.url);
    const rows = db.payments.filter((p) => p.customerId === params['id']);
    return okList(paginate(sortRows(rows, url, 'paymentDate'), url));
  }),

  http.get(`${BASE}/customers/:id/activity`, async ({ params }) => {
    await delay();
    const customer = db.customers.find((c) => c.id === params['id']);
    const label = customer?.companyName ?? customer?.name;
    const rows = db.auditLogs
      .filter((l) => l.entityLabel === label || l.entityId === params['id'])
      .slice(0, 20);
    return okList({ data: rows, meta: { page: 1, pageSize: 20, total: rows.length, totalPages: 1 } });
  }),

  http.get(`${BASE}/customers/:id/statement`, async ({ params, request }) => {
    await delay();
    const customer = db.customers.find((c) => c.id === params['id']);
    if (!customer) return fail(404, 'NOT_FOUND', 'Customer not found.');
    const url = new URL(request.url);
    const from = url.searchParams.get('from') ?? '1970-01-01';
    const to = url.searchParams.get('to') ?? todayIso();

    const invoiceEntries = db.invoices
      .filter((i) => i.customerId === customer.id && i.status !== 'draft')
      .map((i) => ({
        date: i.issueDate,
        type: 'invoice' as const,
        reference: i.invoiceNumber,
        description: `Invoice ${i.invoiceNumber}`,
        debit: i.grandTotal,
        credit: null,
      }));
    const paymentEntries = db.payments
      .filter((p) => p.customerId === customer.id && !p.isVoided)
      .map((p) => ({
        date: p.paymentDate,
        type: 'payment' as const,
        reference: p.invoiceNumber,
        description: `Payment · ${p.paymentMethodName ?? 'Other'}`,
        debit: null,
        credit: p.amount,
      }));

    const all = [...invoiceEntries, ...paymentEntries].sort((a, b) => a.date.localeCompare(b.date));
    const opening = all
      .filter((e) => e.date < from)
      .reduce((acc, e) => acc.plus(e.debit ?? 0).minus(e.credit ?? 0), new Decimal(0));

    let running = opening;
    const entries = all
      .filter((e) => e.date >= from && e.date <= to)
      .map((e) => {
        running = running.plus(e.debit ?? 0).minus(e.credit ?? 0);
        return { ...e, balance: money(running) };
      });

    return ok({
      customer,
      from,
      to,
      openingBalance: money(opening),
      closingBalance: money(running),
      entries,
    });
  }),

  /* -------------------------------- Catalog ------------------------------- */
  http.get(`${BASE}/products`, async ({ request }) => {
    await delay();
    const url = new URL(request.url);
    let rows = applyArchiveFilter(db.products, url);
    const kind = url.searchParams.get('kind');
    if (kind) rows = rows.filter((p) => p.kind === kind);
    const categoryId = url.searchParams.get('categoryId');
    if (categoryId) rows = rows.filter((p) => p.categoryId === categoryId);
    rows = search(rows, url, ['name', 'sku', 'description']);
    rows = sortRows(rows, url, 'createdAt');
    return okList(paginate(rows, url));
  }),

  http.post(`${BASE}/products`, async ({ request }) => {
    await delay();
    const body = (await request.json()) as Record<string, unknown>;
    if (!String(body['name'] ?? '').trim()) {
      return fail(400, 'VALIDATION_ERROR', 'Invalid request body.', [
        { path: 'name', message: 'Name is required' },
      ]);
    }
    const category = db.categories.find((c) => c.id === body['categoryId']);
    const unit = db.units.find((u) => u.id === body['unitId']);
    const tax = db.taxes.find((t) => t.id === body['taxId']);
    const product: Product = {
      id: newId('p'),
      kind: (body['kind'] as 'product' | 'service') ?? 'service',
      name: String(body['name']),
      sku: (body['sku'] as string) ?? null,
      description: (body['description'] as string) ?? null,
      categoryId: category?.id ?? null,
      categoryName: category?.name ?? null,
      unitId: unit?.id ?? null,
      unitName: unit?.name ?? null,
      costPrice: body['costPrice'] ? money(String(body['costPrice'])) : null,
      sellingPrice: money(String(body['sellingPrice'] ?? 0)),
      taxId: tax?.id ?? null,
      taxName: tax?.name ?? null,
      taxRate: tax?.rate ?? 0,
      notes: (body['notes'] as string) ?? null,
      isActive: body['isActive'] !== false,
      archivedAt: null,
      createdAt: nowIso(),
    };
    db.products.unshift(product);
    logAudit('product.created', 'product', product.id, product.name);
    return HttpResponse.json({ data: product }, { status: 201 });
  }),

  http.put(`${BASE}/products/:id`, async ({ params, request }) => {
    await delay();
    const index = db.products.findIndex((p) => p.id === params['id']);
    if (index === -1) return fail(404, 'NOT_FOUND', 'Product not found.');
    const body = (await request.json()) as Record<string, unknown>;
    const category = db.categories.find((c) => c.id === body['categoryId']);
    const unit = db.units.find((u) => u.id === body['unitId']);
    const tax = db.taxes.find((t) => t.id === body['taxId']);
    const updated: Product = {
      ...db.products[index]!,
      ...body,
      id: db.products[index]!.id,
      categoryName: category?.name ?? null,
      unitName: unit?.name ?? null,
      taxName: tax?.name ?? null,
      taxRate: tax?.rate ?? 0,
      sellingPrice: money(String(body['sellingPrice'] ?? db.products[index]!.sellingPrice)),
    } as Product;
    db.products[index] = updated;
    logAudit('product.updated', 'product', updated.id, updated.name);
    return ok(updated);
  }),

  ...collection('/categories', db.categories, {
    searchFields: ['name', 'description'],
    sortFallback: 'name',
    entityName: 'Category',
    onCreate: (body) => ({
      id: newId('c'),
      name: String(body['name'] ?? ''),
      description: (body['description'] as string) ?? null,
      appliesTo: (body['appliesTo'] as 'product' | 'service' | null) ?? null,
      isActive: body['isActive'] !== false,
    }),
  }),

  ...collection('/units', db.units, {
    searchFields: ['name', 'abbreviation'],
    sortFallback: 'name',
    entityName: 'Unit',
    onCreate: (body) => ({
      id: newId('n'),
      name: String(body['name'] ?? ''),
      abbreviation: String(body['abbreviation'] ?? ''),
      isActive: body['isActive'] !== false,
    }),
  }),

  ...collection('/taxes', db.taxes, {
    searchFields: ['name', 'description'],
    sortFallback: 'rate',
    entityName: 'Tax',
    onCreate: (body) => ({
      id: newId('x'),
      name: String(body['name'] ?? ''),
      rate: Number(body['rate'] ?? 0),
      description: (body['description'] as string) ?? null,
      isActive: body['isActive'] !== false,
      components: (body['components'] as { id: string; name: string; rate: number }[]) ?? [],
    }),
  }),

  ...collection('/payment-methods', db.paymentMethods, {
    searchFields: ['name'],
    sortFallback: 'name',
    entityName: 'Payment method',
    onCreate: (body) => ({
      id: newId('y'),
      name: String(body['name'] ?? ''),
      description: (body['description'] as string) ?? null,
      requiresReference: Boolean(body['requiresReference']),
      isActive: body['isActive'] !== false,
    }),
  }),

  ...collection('/custom-fields', db.customFields, {
    searchFields: ['label', 'key'],
    sortFallback: 'sortOrder',
    entityName: 'Custom field',
    onCreate: (body) => ({
      id: newId('f'),
      entityType: (body['entityType'] as 'customer') ?? 'customer',
      key: String(body['key'] ?? ''),
      label: String(body['label'] ?? ''),
      fieldType: (body['fieldType'] as 'text') ?? 'text',
      options: (body['options'] as string[]) ?? [],
      isRequired: Boolean(body['isRequired']),
      showOnDocument: Boolean(body['showOnDocument']),
      sortOrder: Number(body['sortOrder'] ?? 0),
      isActive: body['isActive'] !== false,
    }),
  }),

  ...collection('/email-templates', db.emailTemplates, {
    searchFields: ['name', 'subject'],
    sortFallback: 'name',
    entityName: 'Email template',
  }),

  ...collection('/reminder-rules', db.reminderRules, {
    searchFields: ['name'],
    sortFallback: 'offsetDays',
    entityName: 'Reminder rule',
    onCreate: (body) => ({
      id: newId('j'),
      name: String(body['name'] ?? ''),
      trigger: (body['trigger'] as 'before_due') ?? 'before_due',
      offsetDays: Number(body['offsetDays'] ?? 0),
      isActive: body['isActive'] !== false,
    }),
  }),

  /* ------------------------------ Quotations ------------------------------ */
  http.get(`${BASE}/quotations`, async ({ request }) => {
    await delay();
    const url = new URL(request.url);
    let rows = filterByStatus(db.quotations, url);
    rows = filterByCustomer(rows, url);
    rows = filterByDateRange(rows, url, 'issueDate');
    rows = search(rows, url, ['quotationNumber', 'reference']);
    const q = url.searchParams.get('q')?.toLowerCase();
    if (q) {
      rows = db.quotations.filter(
        (r) =>
          r.quotationNumber.toLowerCase().includes(q) ||
          (r.customer.companyName ?? '').toLowerCase().includes(q) ||
          r.customer.name.toLowerCase().includes(q),
      );
    }
    rows = sortRows(rows, url, 'issueDate');
    return okList(paginate(rows, url));
  }),

  http.get(`${BASE}/quotations/:id`, async ({ params }) => {
    await delay();
    const row = db.quotations.find((q) => q.id === params['id']);
    if (!row) return fail(404, 'NOT_FOUND', 'Quotation not found.');
    return ok(row);
  }),

  http.post(`${BASE}/quotations`, async ({ request }) => {
    await delay();
    const body = (await request.json()) as Record<string, unknown>;
    if (!body['customerId']) {
      return fail(400, 'VALIDATION_ERROR', 'Invalid request body.', [
        { path: 'customerId', message: 'Select a customer' },
      ]);
    }
    const items = recalcItems((body['items'] as unknown[]) ?? []);
    const charges = recalcCharges((body['charges'] as unknown[]) ?? []);
    const totals = totalsFor(items, charges);
    const issueDate = String(body['issueDate'] ?? todayIso());

    const quotation: Quotation = {
      id: newId('q'),
      quotationNumber: allocateNumber('quotation'),
      status: 'draft',
      customerId: String(body['customerId']),
      customer: customerRef(String(body['customerId'])),
      issueDate,
      validUntil: (body['validUntil'] as string) ?? null,
      currencyCode: db.settings.currencyCode,
      currencySymbol: db.settings.currencySymbol,
      taxMode: (body['taxMode'] as 'exclusive') ?? db.settings.defaultTaxMode,
      discountType: (body['discountType'] as 'percentage' | null) ?? null,
      discountValue: String(body['discountValue'] ?? '0'),
      items,
      charges,
      templateId: (body['templateId'] as string) ?? db.settings.defaultQuotationTemplateId,
      // Absent means "apply the default"; explicit null means the user cleared it.
      customNotes:
        'customNotes' in body ? (body['customNotes'] as string | null) : db.settings.defaultQuotationNotes,
      termsAndConditions:
        'termsAndConditions' in body
          ? (body['termsAndConditions'] as string | null)
          : db.settings.defaultQuotationTerms,
      includeNotes: body['includeNotes'] !== false,
      includeTerms: body['includeTerms'] !== false,
      paymentInstructions:
        (body['paymentInstructions'] as string) ?? db.settings.defaultPaymentInstructions,
      internalNotes: (body['internalNotes'] as string) ?? null,
      reference: (body['reference'] as string) ?? null,
      convertedInvoiceId: null,
      convertedInvoiceNumber: null,
      sentAt: null,
      acceptedAt: null,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      ...totals,
    };
    db.quotations.unshift(quotation);
    logAudit('quotation.created', 'quotation', quotation.id, quotation.quotationNumber);
    return HttpResponse.json({ data: quotation }, { status: 201 });
  }),

  http.put(`${BASE}/quotations/:id`, async ({ params, request }) => {
    await delay();
    const index = db.quotations.findIndex((q) => q.id === params['id']);
    if (index === -1) return fail(404, 'NOT_FOUND', 'Quotation not found.');
    const existing = db.quotations[index]!;
    if (existing.status === 'converted') {
      return fail(409, 'INVALID_STATE_TRANSITION', 'A converted quotation cannot be edited.');
    }
    const body = (await request.json()) as Record<string, unknown>;
    const items = recalcItems((body['items'] as unknown[]) ?? existing.items);
    const charges = recalcCharges((body['charges'] as unknown[]) ?? existing.charges);
    const totals = totalsFor(items, charges);

    const updated: Quotation = {
      ...existing,
      customerId: (body['customerId'] as string) ?? existing.customerId,
      customer: customerRef((body['customerId'] as string) ?? existing.customerId),
      issueDate: (body['issueDate'] as string) ?? existing.issueDate,
      validUntil: 'validUntil' in body ? (body['validUntil'] as string | null) : existing.validUntil,
      taxMode: (body['taxMode'] as 'exclusive') ?? existing.taxMode,
      discountType: 'discountType' in body ? (body['discountType'] as null) : existing.discountType,
      discountValue: String(body['discountValue'] ?? existing.discountValue),
      items,
      charges,
      templateId: (body['templateId'] as string) ?? existing.templateId,
      customNotes: 'customNotes' in body ? (body['customNotes'] as string | null) : existing.customNotes,
      termsAndConditions:
        'termsAndConditions' in body
          ? (body['termsAndConditions'] as string | null)
          : existing.termsAndConditions,
      includeNotes: 'includeNotes' in body ? Boolean(body['includeNotes']) : existing.includeNotes,
      includeTerms: 'includeTerms' in body ? Boolean(body['includeTerms']) : existing.includeTerms,
      paymentInstructions: (body['paymentInstructions'] as string) ?? existing.paymentInstructions,
      internalNotes: (body['internalNotes'] as string) ?? existing.internalNotes,
      reference: (body['reference'] as string) ?? existing.reference,
      updatedAt: nowIso(),
      ...totals,
    };
    db.quotations[index] = updated;
    logAudit('quotation.updated', 'quotation', updated.id, updated.quotationNumber);
    return ok(updated);
  }),

  http.delete(`${BASE}/quotations/:id`, async ({ params }) => {
    await delay();
    const row = db.quotations.find((q) => q.id === params['id']);
    if (!row) return fail(404, 'NOT_FOUND', 'Quotation not found.');
    if (row.status !== 'draft') {
      return fail(422, 'INVALID_STATE_TRANSITION', 'Only draft quotations can be deleted. Cancel it instead.');
    }
    db.quotations = db.quotations.filter((q) => q.id !== row.id);
    return new HttpResponse(null, { status: 204 });
  }),

  http.post(`${BASE}/quotations/:id/status`, async ({ params, request }) => {
    await delay();
    const row = db.quotations.find((q) => q.id === params['id']);
    if (!row) return fail(404, 'NOT_FOUND', 'Quotation not found.');
    const body = (await request.json()) as { status: Quotation['status'] };

    const allowed: Record<string, Quotation['status'][]> = {
      draft: ['sent', 'cancelled'],
      sent: ['viewed', 'accepted', 'rejected', 'expired', 'cancelled'],
      viewed: ['accepted', 'rejected', 'expired', 'cancelled'],
      accepted: ['converted', 'cancelled'],
      rejected: [],
      expired: ['sent'],
      cancelled: [],
      converted: [],
    };
    if (!allowed[row.status]?.includes(body.status)) {
      return fail(
        409,
        'INVALID_STATE_TRANSITION',
        `A ${row.status} quotation cannot move to ${body.status}.`,
      );
    }
    row.status = body.status;
    row.updatedAt = nowIso();
    if (body.status === 'sent') row.sentAt = nowIso();
    if (body.status === 'accepted') row.acceptedAt = nowIso();
    logAudit(`quotation.${body.status}`, 'quotation', row.id, row.quotationNumber);
    return ok(row);
  }),

  http.post(`${BASE}/quotations/:id/send`, async ({ params }) => {
    await delay();
    const row = db.quotations.find((q) => q.id === params['id']);
    if (!row) return fail(404, 'NOT_FOUND', 'Quotation not found.');
    if (!db.settings.emailEnabled) {
      // A failed send must never mark the document as sent.
      return fail(
        422,
        'EMAIL_NOT_CONFIGURED',
        'Email is not configured for this business. Add SMTP settings on the backend, then enable email in Settings.',
      );
    }
    row.status = 'sent';
    row.sentAt = nowIso();
    return ok(row);
  }),

  http.post(`${BASE}/quotations/:id/convert`, async ({ params }) => {
    await delay();
    const quotation = db.quotations.find((q) => q.id === params['id']);
    if (!quotation) return fail(404, 'NOT_FOUND', 'Quotation not found.');
    if (quotation.status === 'converted') {
      return fail(409, 'INVALID_STATE_TRANSITION', 'This quotation has already been converted.');
    }
    if (quotation.status !== 'accepted') {
      return fail(
        409,
        'INVALID_STATE_TRANSITION',
        'Only an accepted quotation can be converted to an invoice.',
      );
    }

    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + db.settings.defaultPaymentTermsDays);

    const invoice: Invoice = {
      id: newId('v'),
      invoiceNumber: allocateNumber('invoice'),
      status: 'draft',
      paymentStatus: 'unpaid',
      customerId: quotation.customerId,
      customer: quotation.customer,
      issueDate: todayIso(),
      dueDate: dueDate.toISOString().slice(0, 10),
      quotationId: quotation.id,
      quotationNumber: quotation.quotationNumber,
      currencyCode: quotation.currencyCode,
      currencySymbol: quotation.currencySymbol,
      taxMode: quotation.taxMode,
      discountType: quotation.discountType,
      discountValue: quotation.discountValue,
      // Deep-copied so later edits to either document cannot affect the other.
      items: quotation.items.map((item) => ({ ...item, id: newId('i') })),
      charges: quotation.charges.map((charge) => ({ ...charge, id: newId('g') })),
      templateId: db.settings.defaultInvoiceTemplateId,
      // The customer accepted these terms — carry the quotation's snapshot, not
      // the current invoice defaults.
      customNotes: quotation.customNotes,
      termsAndConditions: quotation.termsAndConditions,
      includeNotes: quotation.includeNotes,
      includeTerms: quotation.includeTerms,
      paymentInstructions: quotation.paymentInstructions,
      internalNotes: null,
      reference: quotation.reference,
      subtotal: quotation.subtotal,
      itemDiscountTotal: quotation.itemDiscountTotal,
      documentDiscountAmount: quotation.documentDiscountAmount,
      taxableAmount: quotation.taxableAmount,
      taxTotal: quotation.taxTotal,
      additionalChargesTotal: quotation.additionalChargesTotal,
      grandTotal: quotation.grandTotal,
      taxBreakdown: quotation.taxBreakdown,
      amountPaid: money(0),
      amountDue: quotation.grandTotal,
      sentAt: null,
      paidAt: null,
      cancelReason: null,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };

    db.invoices.unshift(invoice);
    quotation.status = 'converted';
    quotation.convertedInvoiceId = invoice.id;
    quotation.convertedInvoiceNumber = invoice.invoiceNumber;
    quotation.updatedAt = nowIso();
    logAudit('quotation.converted', 'quotation', quotation.id, quotation.quotationNumber);
    return HttpResponse.json({ data: invoice }, { status: 201 });
  }),

  http.post(`${BASE}/quotations/:id/cancel`, async ({ params, request }) => {
    await delay();
    const row = db.quotations.find((q) => q.id === params['id']);
    if (!row) return fail(404, 'NOT_FOUND', 'Quotation not found.');
    const body = (await request.json()) as { reason?: string };
    row.status = 'cancelled';
    row.internalNotes = body.reason ?? row.internalNotes;
    row.updatedAt = nowIso();
    logAudit('quotation.cancelled', 'quotation', row.id, row.quotationNumber);
    return ok(row);
  }),

  http.post(`${BASE}/quotations/:id/duplicate`, async ({ params }) => {
    await delay();
    const source = db.quotations.find((q) => q.id === params['id']);
    if (!source) return fail(404, 'NOT_FOUND', 'Quotation not found.');
    const copy: Quotation = {
      ...source,
      id: newId('q'),
      quotationNumber: allocateNumber('quotation'),
      status: 'draft',
      issueDate: todayIso(),
      items: source.items.map((i) => ({ ...i, id: newId('i') })),
      charges: source.charges.map((c) => ({ ...c, id: newId('g') })),
      convertedInvoiceId: null,
      convertedInvoiceNumber: null,
      sentAt: null,
      acceptedAt: null,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    db.quotations.unshift(copy);
    return HttpResponse.json({ data: copy }, { status: 201 });
  }),

  http.get(`${BASE}/quotations/:id/whatsapp`, async ({ params }) => {
    await delay();
    const row = db.quotations.find((q) => q.id === params['id']);
    if (!row) return fail(404, 'NOT_FOUND', 'Quotation not found.');
    const amount = `${row.currencySymbol}${Number(row.grandTotal).toFixed(db.settings.decimalPlaces)}`;
    const message = [
      `Hello ${row.customer.name},`,
      '',
      `Please find quotation ${row.quotationNumber}.`,
      '',
      `Total: ${amount}`,
      '',
      'Thank you,',
      db.business.name,
    ].join('\n');
    const phone = (row.customer.phone ?? '').replace(/\D/g, '');
    return ok({
      url: `https://wa.me/${phone}?text=${encodeURIComponent(message)}`,
      message,
    });
  }),

  // Handled explicitly so the request cannot escape to a real backend carrying
  // this mode's fake session token — that returns 401 and signs the user out,
  // which reads as a random logout rather than "this needs the real API".
  http.get(`${BASE}/quotations/:id/pdf`, async () => {
    await delay();
    return fail(422, 'PDF_UNAVAILABLE', 'PDF generation runs on the server. Set VITE_ENABLE_MOCKS=false and point VITE_API_BASE_URL at the API to download a real PDF.');
  }),

  /* -------------------------------- Invoices ------------------------------ */
  http.get(`${BASE}/invoices`, async ({ request }) => {
    await delay();
    const url = new URL(request.url);
    let rows = db.invoices;
    const paymentStatus = url.searchParams.get('paymentStatus');
    if (paymentStatus) {
      const wanted = new Set(paymentStatus.split(','));
      rows = rows.filter((i) => wanted.has(i.paymentStatus));
    }
    rows = filterByStatus(rows, url);
    rows = filterByCustomer(rows, url);
    rows = filterByDateRange(rows, url, 'issueDate');
    const q = url.searchParams.get('q')?.toLowerCase();
    if (q) {
      rows = rows.filter(
        (r) =>
          r.invoiceNumber.toLowerCase().includes(q) ||
          (r.customer.companyName ?? '').toLowerCase().includes(q) ||
          r.customer.name.toLowerCase().includes(q),
      );
    }
    rows = sortRows(rows, url, 'issueDate');
    return okList(paginate(rows, url));
  }),

  http.get(`${BASE}/invoices/:id`, async ({ params }) => {
    await delay();
    const row = db.invoices.find((i) => i.id === params['id']);
    if (!row) return fail(404, 'NOT_FOUND', 'Invoice not found.');
    return ok(row);
  }),

  http.post(`${BASE}/invoices`, async ({ request }) => {
    await delay();
    const body = (await request.json()) as Record<string, unknown>;
    if (!body['customerId']) {
      return fail(400, 'VALIDATION_ERROR', 'Invalid request body.', [
        { path: 'customerId', message: 'Select a customer' },
      ]);
    }
    const items = recalcItems((body['items'] as unknown[]) ?? []);
    const charges = recalcCharges((body['charges'] as unknown[]) ?? []);
    const totals = totalsFor(items, charges);

    const invoice: Invoice = {
      id: newId('v'),
      invoiceNumber: allocateNumber('invoice'),
      status: 'draft',
      paymentStatus: 'unpaid',
      customerId: String(body['customerId']),
      customer: customerRef(String(body['customerId'])),
      issueDate: String(body['issueDate'] ?? todayIso()),
      dueDate: (body['dueDate'] as string) ?? null,
      quotationId: (body['quotationId'] as string) ?? null,
      quotationNumber: null,
      currencyCode: db.settings.currencyCode,
      currencySymbol: db.settings.currencySymbol,
      taxMode: (body['taxMode'] as 'exclusive') ?? db.settings.defaultTaxMode,
      discountType: (body['discountType'] as 'percentage' | null) ?? null,
      discountValue: String(body['discountValue'] ?? '0'),
      items,
      charges,
      templateId: (body['templateId'] as string) ?? db.settings.defaultInvoiceTemplateId,
      customNotes:
        'customNotes' in body ? (body['customNotes'] as string | null) : db.settings.defaultInvoiceNotes,
      termsAndConditions:
        'termsAndConditions' in body
          ? (body['termsAndConditions'] as string | null)
          : db.settings.defaultInvoiceTerms,
      includeNotes: body['includeNotes'] !== false,
      includeTerms: body['includeTerms'] !== false,
      paymentInstructions:
        (body['paymentInstructions'] as string) ?? db.settings.defaultPaymentInstructions,
      internalNotes: (body['internalNotes'] as string) ?? null,
      reference: (body['reference'] as string) ?? null,
      amountPaid: money(0),
      amountDue: totals.grandTotal,
      sentAt: null,
      paidAt: null,
      cancelReason: null,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      ...totals,
    };
    db.invoices.unshift(invoice);
    logAudit('invoice.created', 'invoice', invoice.id, invoice.invoiceNumber);
    return HttpResponse.json({ data: invoice }, { status: 201 });
  }),

  http.put(`${BASE}/invoices/:id`, async ({ params, request }) => {
    await delay();
    const index = db.invoices.findIndex((i) => i.id === params['id']);
    if (index === -1) return fail(404, 'NOT_FOUND', 'Invoice not found.');
    const existing = db.invoices[index]!;
    if (existing.status === 'cancelled' || existing.status === 'void') {
      return fail(409, 'INVALID_STATE_TRANSITION', 'A cancelled or void invoice cannot be edited.');
    }
    const body = (await request.json()) as Record<string, unknown>;
    const items = recalcItems((body['items'] as unknown[]) ?? existing.items);
    const charges = recalcCharges((body['charges'] as unknown[]) ?? existing.charges);
    const totals = totalsFor(items, charges);

    if (new Decimal(totals.grandTotal).lessThan(existing.amountPaid)) {
      return fail(
        422,
        'VALIDATION_ERROR',
        'The new total is less than the amount already paid. Void a payment first.',
      );
    }

    const updated: Invoice = {
      ...existing,
      customerId: (body['customerId'] as string) ?? existing.customerId,
      customer: customerRef((body['customerId'] as string) ?? existing.customerId),
      issueDate: (body['issueDate'] as string) ?? existing.issueDate,
      dueDate: 'dueDate' in body ? (body['dueDate'] as string | null) : existing.dueDate,
      taxMode: (body['taxMode'] as 'exclusive') ?? existing.taxMode,
      discountType: 'discountType' in body ? (body['discountType'] as null) : existing.discountType,
      discountValue: String(body['discountValue'] ?? existing.discountValue),
      items,
      charges,
      templateId: (body['templateId'] as string) ?? existing.templateId,
      customNotes: 'customNotes' in body ? (body['customNotes'] as string | null) : existing.customNotes,
      termsAndConditions:
        'termsAndConditions' in body
          ? (body['termsAndConditions'] as string | null)
          : existing.termsAndConditions,
      includeNotes: 'includeNotes' in body ? Boolean(body['includeNotes']) : existing.includeNotes,
      includeTerms: 'includeTerms' in body ? Boolean(body['includeTerms']) : existing.includeTerms,
      paymentInstructions: (body['paymentInstructions'] as string) ?? existing.paymentInstructions,
      internalNotes: (body['internalNotes'] as string) ?? existing.internalNotes,
      reference: (body['reference'] as string) ?? existing.reference,
      updatedAt: nowIso(),
      ...totals,
    };
    db.invoices[index] = updated;
    refreshInvoiceTotals(updated);
    logAudit('invoice.updated', 'invoice', updated.id, updated.invoiceNumber);
    return ok(updated);
  }),

  http.delete(`${BASE}/invoices/:id`, async ({ params }) => {
    await delay();
    const row = db.invoices.find((i) => i.id === params['id']);
    if (!row) return fail(404, 'NOT_FOUND', 'Invoice not found.');
    if (row.status !== 'draft') {
      return fail(
        422,
        'INVALID_STATE_TRANSITION',
        'Only draft invoices can be deleted. Issued invoices must be cancelled or voided.',
      );
    }
    db.invoices = db.invoices.filter((i) => i.id !== row.id);
    return new HttpResponse(null, { status: 204 });
  }),

  http.post(`${BASE}/invoices/:id/status`, async ({ params, request }) => {
    await delay();
    const row = db.invoices.find((i) => i.id === params['id']);
    if (!row) return fail(404, 'NOT_FOUND', 'Invoice not found.');
    const body = (await request.json()) as { status: Invoice['status'] };
    row.status = body.status;
    if (body.status === 'sent') row.sentAt = nowIso();
    row.updatedAt = nowIso();
    refreshInvoiceTotals(row);
    logAudit(`invoice.${body.status}`, 'invoice', row.id, row.invoiceNumber);
    return ok(row);
  }),

  http.post(`${BASE}/invoices/:id/send`, async ({ params }) => {
    await delay();
    const row = db.invoices.find((i) => i.id === params['id']);
    if (!row) return fail(404, 'NOT_FOUND', 'Invoice not found.');
    if (!db.settings.emailEnabled) {
      return fail(
        422,
        'EMAIL_NOT_CONFIGURED',
        'Email is not configured for this business. Add SMTP settings on the backend, then enable email in Settings.',
      );
    }
    row.status = 'sent';
    row.sentAt = nowIso();
    refreshInvoiceTotals(row);
    return ok(row);
  }),

  http.post(`${BASE}/invoices/:id/cancel`, async ({ params, request }) => {
    await delay();
    const row = db.invoices.find((i) => i.id === params['id']);
    if (!row) return fail(404, 'NOT_FOUND', 'Invoice not found.');
    const body = (await request.json()) as { reason?: string };
    row.status = 'cancelled';
    row.cancelReason = body.reason ?? null;
    row.updatedAt = nowIso();
    logAudit('invoice.cancelled', 'invoice', row.id, row.invoiceNumber);
    return ok(row);
  }),

  http.post(`${BASE}/invoices/:id/void`, async ({ params, request }) => {
    await delay();
    const row = db.invoices.find((i) => i.id === params['id']);
    if (!row) return fail(404, 'NOT_FOUND', 'Invoice not found.');
    const hasPayments = db.payments.some((p) => p.invoiceId === row.id && !p.isVoided);
    if (hasPayments) {
      return fail(
        422,
        'INVALID_STATE_TRANSITION',
        'This invoice has recorded payments and cannot be voided. Void the payments first.',
      );
    }
    const body = (await request.json()) as { reason?: string };
    row.status = 'void';
    row.cancelReason = body.reason ?? null;
    row.updatedAt = nowIso();
    logAudit('invoice.voided', 'invoice', row.id, row.invoiceNumber);
    return ok(row);
  }),

  http.post(`${BASE}/invoices/:id/duplicate`, async ({ params }) => {
    await delay();
    const source = db.invoices.find((i) => i.id === params['id']);
    if (!source) return fail(404, 'NOT_FOUND', 'Invoice not found.');
    const copy: Invoice = {
      ...source,
      id: newId('v'),
      invoiceNumber: allocateNumber('invoice'),
      status: 'draft',
      paymentStatus: 'unpaid',
      issueDate: todayIso(),
      items: source.items.map((i) => ({ ...i, id: newId('i') })),
      charges: source.charges.map((c) => ({ ...c, id: newId('g') })),
      quotationId: null,
      quotationNumber: null,
      amountPaid: money(0),
      amountDue: source.grandTotal,
      sentAt: null,
      paidAt: null,
      cancelReason: null,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    db.invoices.unshift(copy);
    return HttpResponse.json({ data: copy }, { status: 201 });
  }),

  http.get(`${BASE}/invoices/:id/payments`, async ({ params }) => {
    await delay();
    const rows = db.payments.filter((p) => p.invoiceId === params['id']);
    return okList({ data: rows, meta: { page: 1, pageSize: 100, total: rows.length, totalPages: 1 } });
  }),

  http.get(`${BASE}/invoices/:id/whatsapp`, async ({ params }) => {
    await delay();
    const row = db.invoices.find((i) => i.id === params['id']);
    if (!row) return fail(404, 'NOT_FOUND', 'Invoice not found.');
    const amount = `${row.currencySymbol}${Number(row.amountDue).toFixed(db.settings.decimalPlaces)}`;
    const message = [
      `Hello ${row.customer.name},`,
      '',
      `Please find invoice ${row.invoiceNumber}.`,
      '',
      `Amount: ${amount}`,
      ...(row.dueDate ? [`Due Date: ${row.dueDate}`] : []),
      '',
      'Thank you,',
      db.business.name,
    ].join('\n');
    const phone = (row.customer.phone ?? '').replace(/\D/g, '');
    return ok({
      url: `https://wa.me/${phone}?text=${encodeURIComponent(message)}`,
      message,
    });
  }),

  http.get(`${BASE}/invoices/:id/pdf`, async () => {
    await delay();
    return fail(422, 'PDF_UNAVAILABLE', 'PDF generation runs on the server. Set VITE_ENABLE_MOCKS=false and point VITE_API_BASE_URL at the API to download a real PDF.');
  }),

  /* -------------------------------- Payments ------------------------------ */
  http.get(`${BASE}/payments`, async ({ request }) => {
    await delay();
    const url = new URL(request.url);
    let rows = filterByCustomer(db.payments, url);
    rows = filterByDateRange(rows, url, 'paymentDate');
    const methodId = url.searchParams.get('methodId');
    if (methodId) rows = rows.filter((p) => p.paymentMethodId === methodId);
    rows = search(rows, url, ['invoiceNumber', 'customerName', 'referenceNumber']);
    rows = sortRows(rows, url, 'paymentDate');
    return okList(paginate(rows, url));
  }),

  http.post(`${BASE}/payments`, async ({ request }) => {
    await delay();
    const body = (await request.json()) as Record<string, unknown>;
    const invoice = db.invoices.find((i) => i.id === body['invoiceId']);
    if (!invoice) return fail(404, 'NOT_FOUND', 'Invoice not found.');

    const amount = new Decimal(String(body['amount'] ?? 0));
    if (amount.lessThanOrEqualTo(0)) {
      return fail(400, 'VALIDATION_ERROR', 'Invalid request body.', [
        { path: 'amount', message: 'Amount must be greater than zero' },
      ]);
    }
    // Over-payment is rejected rather than creating a credit balance we cannot represent.
    if (amount.greaterThan(invoice.amountDue)) {
      return fail(422, 'OVERPAYMENT', 'The payment exceeds the outstanding balance.', {
        outstanding: invoice.amountDue,
      });
    }

    const method = db.paymentMethods.find((m) => m.id === body['paymentMethodId']);
    if (method?.requiresReference && !String(body['referenceNumber'] ?? '').trim()) {
      return fail(400, 'VALIDATION_ERROR', 'Invalid request body.', [
        { path: 'referenceNumber', message: `${method.name} requires a reference number` },
      ]);
    }

    const payment = {
      id: newId('z'),
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      customerId: invoice.customerId,
      customerName: invoice.customer.companyName ?? invoice.customer.name,
      amount: money(amount),
      paymentDate: String(body['paymentDate'] ?? todayIso()),
      paymentMethodId: method?.id ?? null,
      paymentMethodName: method?.name ?? null,
      referenceNumber: (body['referenceNumber'] as string) ?? null,
      notes: (body['notes'] as string) ?? null,
      currencyCode: invoice.currencyCode,
      isVoided: false,
      voidReason: null,
      createdAt: nowIso(),
    };
    db.payments.unshift(payment);
    refreshInvoiceTotals(invoice);
    logAudit('payment.created', 'payment', payment.id, invoice.invoiceNumber);
    return HttpResponse.json({ data: payment }, { status: 201 });
  }),

  http.post(`${BASE}/payments/:id/void`, async ({ params, request }) => {
    await delay();
    const payment = db.payments.find((p) => p.id === params['id']);
    if (!payment) return fail(404, 'NOT_FOUND', 'Payment not found.');
    const body = (await request.json()) as { reason?: string };
    payment.isVoided = true;
    payment.voidReason = body.reason ?? null;
    const invoice = db.invoices.find((i) => i.id === payment.invoiceId);
    if (invoice) refreshInvoiceTotals(invoice);
    logAudit('payment.voided', 'payment', payment.id, payment.invoiceNumber);
    return ok(payment);
  }),

  /* --------------------------- Recurring invoices ------------------------- */
  http.get(`${BASE}/recurring-invoices`, async ({ request }) => {
    await delay();
    const url = new URL(request.url);
    const rows = sortRows(search(db.recurringInvoices, url, ['title', 'customerName']), url, 'nextRunDate');
    return okList(paginate(rows, url));
  }),

  http.get(`${BASE}/recurring-invoices/:id`, async ({ params }) => {
    await delay();
    const row = db.recurringInvoices.find((r) => r.id === params['id']);
    if (!row) return fail(404, 'NOT_FOUND', 'Recurring invoice not found.');
    return ok(row);
  }),

  http.post(`${BASE}/recurring-invoices/:id/generate`, async ({ params }) => {
    await delay();
    const schedule = db.recurringInvoices.find((r) => r.id === params['id']);
    if (!schedule) return fail(404, 'NOT_FOUND', 'Recurring invoice not found.');
    if (!schedule.isActive) {
      return fail(422, 'INVALID_STATE_TRANSITION', 'This schedule is paused.');
    }
    if (!schedule.nextRunDate || schedule.nextRunDate > todayIso()) {
      return ok({ generated: 0, invoices: [] });
    }

    const customer = db.customers.find((c) => c.id === schedule.customerId);
    const items = recalcItems([
      {
        productId: db.products[7]?.id,
        name: schedule.title,
        quantity: '1',
        unitPrice: schedule.grandTotal,
        taxId: db.settings.defaultTaxId,
      },
    ]);
    const totals = totalsFor(items, []);
    const due = new Date();
    due.setDate(due.getDate() + db.settings.defaultPaymentTermsDays);

    const invoice: Invoice = {
      id: newId('v'),
      invoiceNumber: allocateNumber('invoice'),
      status: 'draft',
      paymentStatus: 'unpaid',
      customerId: schedule.customerId,
      customer: customerRef(schedule.customerId),
      issueDate: todayIso(),
      dueDate: due.toISOString().slice(0, 10),
      quotationId: null,
      quotationNumber: null,
      currencyCode: db.settings.currencyCode,
      currencySymbol: db.settings.currencySymbol,
      taxMode: db.settings.defaultTaxMode,
      discountType: null,
      discountValue: '0',
      items,
      charges: [],
      templateId: db.settings.defaultInvoiceTemplateId,
      customNotes: db.settings.defaultInvoiceNotes,
      termsAndConditions: db.settings.defaultInvoiceTerms,
      includeNotes: true,
      includeTerms: true,
      paymentInstructions: db.settings.defaultPaymentInstructions,
      internalNotes: `Generated from recurring schedule: ${schedule.title}`,
      reference: null,
      amountPaid: money(0),
      amountDue: totals.grandTotal,
      sentAt: null,
      paidAt: null,
      cancelReason: null,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      ...totals,
    };
    db.invoices.unshift(invoice);

    schedule.occurrencesGenerated += 1;
    schedule.lastRunDate = todayIso();
    const next = new Date();
    const step = { daily: 1, weekly: 7, monthly: 30, quarterly: 91, yearly: 365, custom: 30 }[
      schedule.frequency
    ];
    next.setDate(next.getDate() + step * schedule.intervalCount);
    schedule.nextRunDate = next.toISOString().slice(0, 10);

    logAudit('recurring.generated', 'invoice', invoice.id, invoice.invoiceNumber);
    void customer;
    return ok({ generated: 1, invoices: [invoice] });
  }),

  /* --------------------------------- Reports ------------------------------ */
  http.get(`${BASE}/reports/sales`, async ({ request }) => {
    await delay();
    const url = new URL(request.url);
    const rows = filterByDateRange(
      db.invoices.filter((i) => i.status !== 'draft' && i.status !== 'void'),
      url,
      'issueDate',
    );
    const byPeriod = new Map<string, { count: number; invoiced: Decimal; paid: Decimal }>();
    for (const inv of rows) {
      const key = inv.issueDate.slice(0, 7);
      const entry = byPeriod.get(key) ?? { count: 0, invoiced: new Decimal(0), paid: new Decimal(0) };
      entry.count += 1;
      entry.invoiced = entry.invoiced.plus(inv.grandTotal);
      entry.paid = entry.paid.plus(inv.amountPaid);
      byPeriod.set(key, entry);
    }
    const data = [...byPeriod.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([period, v]) => ({
        period,
        invoiceCount: v.count,
        invoiced: money(v.invoiced),
        paid: money(v.paid),
        outstanding: money(v.invoiced.minus(v.paid)),
      }));
    return okList({ data, meta: { page: 1, pageSize: data.length || 1, total: data.length, totalPages: 1 } });
  }),

  http.get(`${BASE}/reports/invoices`, async ({ request }) => {
    await delay();
    const url = new URL(request.url);
    let rows = filterByStatus(db.invoices, url);
    rows = filterByCustomer(rows, url);
    rows = filterByDateRange(rows, url, 'issueDate');
    return okList(paginate(sortRows(rows, url, 'issueDate'), url));
  }),

  http.get(`${BASE}/reports/quotations`, async ({ request }) => {
    await delay();
    const url = new URL(request.url);
    let rows = filterByStatus(db.quotations, url);
    rows = filterByCustomer(rows, url);
    rows = filterByDateRange(rows, url, 'issueDate');
    return okList(paginate(sortRows(rows, url, 'issueDate'), url));
  }),

  http.get(`${BASE}/reports/payments`, async ({ request }) => {
    await delay();
    const url = new URL(request.url);
    let rows = filterByCustomer(db.payments, url);
    rows = filterByDateRange(rows, url, 'paymentDate');
    return okList(paginate(sortRows(rows, url, 'paymentDate'), url));
  }),

  http.get(`${BASE}/reports/taxes`, async ({ request }) => {
    await delay();
    const url = new URL(request.url);
    const rows = filterByDateRange(
      db.invoices.filter((i) => i.status !== 'draft' && i.status !== 'void' && i.status !== 'cancelled'),
      url,
      'issueDate',
    );
    const map = new Map<string, { name: string; rate: number; taxable: Decimal; tax: Decimal; docs: Set<string> }>();
    for (const inv of rows) {
      for (const line of inv.taxBreakdown) {
        const key = `${line.name}|${line.rate}`;
        const entry = map.get(key) ?? {
          name: line.name,
          rate: line.rate,
          taxable: new Decimal(0),
          tax: new Decimal(0),
          docs: new Set<string>(),
        };
        entry.taxable = entry.taxable.plus(line.taxable);
        entry.tax = entry.tax.plus(line.amount);
        entry.docs.add(inv.id);
        map.set(key, entry);
      }
    }
    const data = [...map.values()]
      .sort((a, b) => b.rate - a.rate)
      .map((v) => ({
        taxName: v.name,
        rate: v.rate,
        taxableAmount: money(v.taxable),
        taxCollected: money(v.tax),
        documentCount: v.docs.size,
      }));
    return okList({ data, meta: { page: 1, pageSize: data.length || 1, total: data.length, totalPages: 1 } });
  }),

  http.get(`${BASE}/reports/customers`, async ({ request }) => {
    await delay();
    const url = new URL(request.url);
    const data = db.customers.map((c) => {
      const stats = customerStats(c.id);
      return {
        customerId: c.id,
        name: c.name,
        companyName: c.companyName,
        invoiceCount: stats.invoiceCount,
        totalInvoiced: stats.totalInvoiced,
        totalPaid: stats.totalPaid,
        outstanding: stats.outstanding,
      };
    });
    return okList(paginate(sortRows(data, url, 'totalInvoiced'), url));
  }),

  /* -------------------------------- Settings ------------------------------ */
  http.get(`${BASE}/settings/numbering`, async () => {
    await delay();
    return okList({
      data: db.numbering,
      meta: { page: 1, pageSize: db.numbering.length, total: db.numbering.length, totalPages: 1 },
    });
  }),

  http.put(`${BASE}/settings/numbering/:id`, async ({ params, request }) => {
    await delay();
    const index = db.numbering.findIndex((n) => n.id === params['id']);
    if (index === -1) return fail(404, 'NOT_FOUND', 'Numbering settings not found.');
    const body = (await request.json()) as Record<string, unknown>;
    const merged = { ...db.numbering[index]!, ...body };
    // Preview is derived server-side so the UI cannot invent a number format.
    const parts = [merged.prefix];
    if (merged.includeYear) parts.push(String(new Date().getFullYear()));
    if (merged.includeMonth) parts.push(String(new Date().getMonth() + 1).padStart(2, '0'));
    parts.push(String(merged.startNumber).padStart(merged.padding, '0'));
    merged.nextNumberPreview = parts.filter(Boolean).join(merged.separator) + merged.suffix;
    db.numbering[index] = merged;
    logAudit('settings.updated', 'settings', merged.id, `${merged.documentType} numbering`);
    return ok(merged);
  }),

  http.put(`${BASE}/settings/business`, async ({ request }) => {
    await delay();
    const body = (await request.json()) as Record<string, unknown>;
    Object.assign(db.business, body);
    logAudit('settings.updated', 'settings', db.business.id, 'Business profile');
    return ok(db.business);
  }),

  http.put(`${BASE}/settings/branding`, async ({ request }) => {
    await delay();
    const body = (await request.json()) as Record<string, unknown>;
    Object.assign(db.branding, body);
    logAudit('settings.updated', 'settings', db.business.id, 'Branding');
    return ok(db.branding);
  }),

  http.put(`${BASE}/settings`, async ({ request }) => {
    await delay();
    const body = (await request.json()) as Record<string, unknown>;
    Object.assign(db.settings, body);
    logAudit('settings.updated', 'settings', db.business.id, 'Settings');
    return ok(db.settings);
  }),

  http.get(`${BASE}/templates`, async () => {
    await delay();
    return okList({
      data: db.documentTemplates,
      meta: { page: 1, pageSize: 20, total: db.documentTemplates.length, totalPages: 1 },
    });
  }),

  http.get(`${BASE}/members`, async () => {
    await delay();
    return okList({
      data: db.members,
      meta: { page: 1, pageSize: 20, total: db.members.length, totalPages: 1 },
    });
  }),

  http.get(`${BASE}/roles`, async () => {
    await delay();
    return okList({
      data: db.roles,
      meta: { page: 1, pageSize: 20, total: db.roles.length, totalPages: 1 },
    });
  }),

  http.get(`${BASE}/audit-logs`, async ({ request }) => {
    await delay();
    const url = new URL(request.url);
    let rows = db.auditLogs;
    const action = url.searchParams.get('action');
    if (action) rows = rows.filter((l) => l.action.startsWith(action));
    const entityType = url.searchParams.get('entityType');
    if (entityType) rows = rows.filter((l) => l.entityType === entityType);
    const userId = url.searchParams.get('userId');
    if (userId) rows = rows.filter((l) => l.userId === userId);
    rows = filterByDateRange(rows, url, 'createdAt');
    rows = search(rows, url, ['action', 'entityLabel', 'userEmail']);
    return okList(paginate(sortRows(rows, url, 'createdAt'), url));
  }),

  http.get(`${BASE}/backups`, async () => {
    await delay();
    return okList({
      data: db.backupJobs,
      meta: { page: 1, pageSize: 20, total: db.backupJobs.length, totalPages: 1 },
    });
  }),

  http.post(`${BASE}/backups`, async ({ request }) => {
    await delay();
    const body = (await request.json()) as { scope: string; format: string };
    const job: {
      id: string;
      status: 'queued' | 'running' | 'completed' | 'failed';
      scope: 'business_export' | 'full_dump';
      format: 'csv_zip' | 'sql';
      sizeBytes: number | null;
      downloadUrl: string | null;
      error: string | null;
      createdAt: string;
      finishedAt: string | null;
    } = {
      id: newId('s'),
      status: 'queued',
      scope: body.scope as 'business_export',
      format: body.format as 'csv_zip',
      sizeBytes: null,
      downloadUrl: null,
      error: null,
      createdAt: nowIso(),
      finishedAt: null,
    };
    db.backupJobs.unshift(job);
    // No real export runs in the frontend-only build, so the job honestly fails
    // rather than reporting a success that produced no artifact.
    setTimeout(() => {
      job.status = 'failed';
      job.error =
        'Backup requires the backend service. Connect the API to run a real pg_dump export.';
      job.finishedAt = nowIso();
    }, 2500);
    return HttpResponse.json({ data: job }, { status: 202 });
  }),

  /* ----------------------------- Notifications ---------------------------- */
  http.get(`${BASE}/notifications`, async ({ request }) => {
    await delay();
    const url = new URL(request.url);
    const unreadOnly = url.searchParams.get('unread') === 'true';
    const rows = unreadOnly ? db.notifications.filter((n) => !n.readAt) : db.notifications;
    return okList({
      data: rows,
      meta: { page: 1, pageSize: 50, total: rows.length, totalPages: 1 },
    });
  }),

  http.post(`${BASE}/notifications/:id/read`, async ({ params }) => {
    await delay();
    const row = db.notifications.find((n) => n.id === params['id']);
    if (row) row.readAt = nowIso();
    return new HttpResponse(null, { status: 204 });
  }),

  http.post(`${BASE}/notifications/read-all`, async () => {
    await delay();
    for (const n of db.notifications) n.readAt ??= nowIso();
    return new HttpResponse(null, { status: 204 });
  }),

  /* --------------------------------- Search ------------------------------- */
  http.get(`${BASE}/search`, async ({ request }) => {
    await delay();
    const q = (new URL(request.url).searchParams.get('q') ?? '').toLowerCase().trim();
    if (!q) {
      return ok({ customers: [], products: [], quotations: [], invoices: [], payments: [] });
    }
    const cap = <T>(rows: T[]): T[] => rows.slice(0, 5);
    return ok({
      customers: cap(
        db.customers
          .filter((c) => `${c.name} ${c.companyName ?? ''} ${c.email ?? ''}`.toLowerCase().includes(q))
          .map((c) => ({ id: c.id, label: c.companyName ?? c.name, sublabel: c.email ?? c.name })),
      ),
      products: cap(
        db.products
          .filter((p) => `${p.name} ${p.sku ?? ''}`.toLowerCase().includes(q))
          .map((p) => ({ id: p.id, label: p.name, sublabel: p.sku ?? p.kind })),
      ),
      quotations: cap(
        db.quotations
          .filter((r) => `${r.quotationNumber} ${r.customer.companyName ?? ''}`.toLowerCase().includes(q))
          .map((r) => ({
            id: r.id,
            label: r.quotationNumber,
            sublabel: r.customer.companyName ?? r.customer.name,
          })),
      ),
      invoices: cap(
        db.invoices
          .filter((r) => `${r.invoiceNumber} ${r.customer.companyName ?? ''}`.toLowerCase().includes(q))
          .map((r) => ({
            id: r.id,
            label: r.invoiceNumber,
            sublabel: r.customer.companyName ?? r.customer.name,
          })),
      ),
      payments: cap(
        db.payments
          .filter((p) => `${p.invoiceNumber} ${p.referenceNumber ?? ''}`.toLowerCase().includes(q))
          .map((p) => ({ id: p.id, label: p.invoiceNumber, sublabel: p.customerName })),
      ),
    });
  }),
];

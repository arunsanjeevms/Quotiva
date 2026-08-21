import { supabaseAdmin } from '../config/supabase.js';
import { d, round } from '../utils/money.js';

function windowDaysFor(range: string): number {
  switch (range) {
    case 'today': case 'yesterday': return 1;
    case 'this_week': return 7;
    case 'this_month': case 'last_month': return 31;
    case 'this_quarter': return 92;
    default: return 365;
  }
}

/**
 * One aggregate call for the whole dashboard — every figure is computed here,
 * server-side, from live invoice/quotation/payment rows (docs/09-modules §9).
 */
export async function getDashboard(businessId: string, range: string) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - windowDaysFor(range));
  const cutoffIso = cutoff.toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);

  const [
    { data: invoices },
    { data: quotations },
    { data: payments },
    { count: customerCount },
    { count: productCount },
  ] = await Promise.all([
    supabaseAdmin.from('invoices').select('id, status, payment_status, grand_total, amount_due, amount_paid, issue_date, due_date, customer_id, invoice_number, customers(name, company_name)').eq('business_id', businessId).not('status', 'in', '("cancelled","void")'),
    supabaseAdmin.from('quotations').select('id, status, grand_total, customer_id, valid_until, quotation_number, customers(name, company_name)').eq('business_id', businessId),
    supabaseAdmin.from('payments').select('amount, payment_date, payment_method_name').eq('business_id', businessId).eq('is_voided', false),
    supabaseAdmin.from('customers').select('id', { count: 'exact', head: true }).eq('business_id', businessId).is('archived_at', null),
    supabaseAdmin.from('products').select('id', { count: 'exact', head: true }).eq('business_id', businessId).is('archived_at', null),
  ]);

  const liveInvoices = invoices ?? [];
  const inWindow = liveInvoices.filter((i) => (i['issue_date'] as string) >= cutoffIso);
  const paymentsInWindow = (payments ?? []).filter((p) => (p['payment_date'] as string) >= cutoffIso);

  const revenue = inWindow.reduce((a, i) => a.plus(i['grand_total'] as string), d('0'));
  const collected = paymentsInWindow.reduce((a, p) => a.plus(p['amount'] as string), d('0'));
  const outstanding = liveInvoices.reduce((a, i) => a.plus(i['amount_due'] as string), d('0'));

  const overdue = liveInvoices.filter((i) => i['payment_status'] === 'overdue');
  const expiringCutoff = new Date();
  expiringCutoff.setDate(expiringCutoff.getDate() + 7);
  const expiring = (quotations ?? []).filter(
    (q) => ['sent', 'viewed'].includes(q['status'] as string) && q['valid_until'] && (q['valid_until'] as string) >= today && (q['valid_until'] as string) <= expiringCutoff.toISOString().slice(0, 10),
  );

  const byMonth = new Map<string, { invoiced: ReturnType<typeof d>; collected: ReturnType<typeof d> }>();
  for (let i = 11; i >= 0; i -= 1) {
    const dt = new Date();
    dt.setMonth(dt.getMonth() - i, 1);
    byMonth.set(dt.toISOString().slice(0, 7), { invoiced: d('0'), collected: d('0') });
  }
  for (const inv of liveInvoices) {
    const entry = byMonth.get((inv['issue_date'] as string).slice(0, 7));
    if (entry) entry.invoiced = entry.invoiced.plus(inv['grand_total'] as string);
  }
  for (const p of payments ?? []) {
    const entry = byMonth.get((p['payment_date'] as string).slice(0, 7));
    if (entry) entry.collected = entry.collected.plus(p['amount'] as string);
  }

  const groupCount = (rows: { status: string; grandTotal: string }[]) => {
    const map = new Map<string, { count: number; amount: ReturnType<typeof d> }>();
    for (const row of rows) {
      const entry = map.get(row.status) ?? { count: 0, amount: d('0') };
      entry.count += 1;
      entry.amount = entry.amount.plus(row.grandTotal);
      map.set(row.status, entry);
    }
    return [...map.entries()].map(([status, v]) => ({ status, count: v.count, amount: round(v.amount, 2) }));
  };

  const customerTotals = new Map<string, { name: string; invoiced: ReturnType<typeof d>; paid: ReturnType<typeof d> }>();
  for (const inv of liveInvoices) {
    const cust = inv['customers'] as unknown as { name: string; company_name: string | null } | null;
    const key = inv['customer_id'] as string;
    const entry = customerTotals.get(key) ?? { name: cust?.company_name ?? cust?.name ?? 'Unknown', invoiced: d('0'), paid: d('0') };
    entry.invoiced = entry.invoiced.plus(inv['grand_total'] as string);
    entry.paid = entry.paid.plus(inv['amount_paid'] as string);
    customerTotals.set(key, entry);
  }

  const methodTotals = new Map<string, { count: number; amount: ReturnType<typeof d> }>();
  for (const p of payments ?? []) {
    const key = (p['payment_method_name'] as string) ?? 'Other';
    const entry = methodTotals.get(key) ?? { count: 0, amount: d('0') };
    entry.count += 1;
    entry.amount = entry.amount.plus(p['amount'] as string);
    methodTotals.set(key, entry);
  }

  return {
    kpis: {
      revenue: round(revenue, 2),
      paymentsReceived: round(collected, 2),
      outstanding: round(outstanding, 2),
      invoiceCount: inWindow.length,
      paidCount: liveInvoices.filter((i) => i['payment_status'] === 'paid').length,
      pendingCount: liveInvoices.filter((i) => ['unpaid', 'partially_paid'].includes(i['payment_status'] as string)).length,
      overdueCount: overdue.length,
      quotationCount: quotations?.length ?? 0,
      acceptedCount: (quotations ?? []).filter((q) => ['accepted', 'converted'].includes(q['status'] as string)).length,
      rejectedCount: (quotations ?? []).filter((q) => q['status'] === 'rejected').length,
      customerCount: customerCount ?? 0,
      productCount: productCount ?? 0,
    },
    revenueTrend: [...byMonth.entries()].map(([period, v]) => ({ period, invoiced: round(v.invoiced, 2), collected: round(v.collected, 2) })),
    invoiceStatus: groupCount(liveInvoices.map((i) => ({ status: i['payment_status'] as string, grandTotal: i['grand_total'] as string }))),
    quotationStatus: groupCount((quotations ?? []).map((q) => ({ status: q['status'] as string, grandTotal: q['grand_total'] as string }))),
    paymentMethods: [...methodTotals.entries()].map(([method, v]) => ({ method, count: v.count, amount: round(v.amount, 2) })),
    topCustomers: [...customerTotals.entries()]
      .sort((a, b) => b[1].invoiced.comparedTo(a[1].invoiced))
      .slice(0, 6)
      .map(([customerId, v]) => ({ customerId, name: v.name, invoiced: round(v.invoiced, 2), paid: round(v.paid, 2) })),
    topItems: [],
    attention: {
      overdueInvoices: overdue.slice(0, 5).map((i) => {
        const cust = i['customers'] as unknown as { name: string; company_name: string | null } | null;
        return { id: i['id'], number: i['invoice_number'], customer: cust?.company_name ?? cust?.name ?? '', amountDue: i['amount_due'], dueDate: i['due_date'] };
      }),
      expiringQuotations: expiring.slice(0, 5).map((q) => {
        const cust = q['customers'] as unknown as { name: string; company_name: string | null } | null;
        return { id: q['id'], number: q['quotation_number'], customer: cust?.company_name ?? cust?.name ?? '', total: q['grand_total'], validUntil: q['valid_until'] };
      }),
    },
  };
}

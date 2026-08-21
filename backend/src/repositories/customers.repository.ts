import Decimal from 'decimal.js';
import { supabaseAdmin } from '../config/supabase.js';
import { AppError } from '../utils/AppError.js';
import { bodyToSnake, rowToCamel, rowsToCamel } from '../utils/case.js';
import { meta, parseListQuery, rangeFor } from '../utils/pagination.js';
import type { Request } from 'express';

const ALLOWED = new Set([
  'code', 'name', 'company_name', 'email', 'phone', 'alt_phone', 'website',
  'address_line1', 'address_line2', 'city', 'state', 'country', 'postal_code',
  'tax_id', 'currency_code', 'payment_terms_days', 'notes', 'is_active',
]);

function sanitize(body: Record<string, unknown>): Record<string, unknown> {
  const snake = bodyToSnake(body);
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(snake)) if (ALLOWED.has(key)) out[key] = value;
  return out;
}

async function statsFor(businessId: string, customerId: string) {
  const [{ data: invoices }, { data: quotations }, { data: payments }] = await Promise.all([
    supabaseAdmin
      .from('invoices')
      .select('grand_total, issue_date, status')
      .eq('business_id', businessId)
      .eq('customer_id', customerId)
      .not('status', 'in', '("cancelled","void")'),
    supabaseAdmin
      .from('quotations')
      .select('id')
      .eq('business_id', businessId)
      .eq('customer_id', customerId),
    supabaseAdmin
      .from('payments')
      .select('amount, payment_date')
      .eq('business_id', businessId)
      .eq('customer_id', customerId)
      .eq('is_voided', false),
  ]);

  const totalInvoiced = (invoices ?? []).reduce((a, r) => a.plus(r['grand_total'] as string), new Decimal(0));
  const totalPaid = (payments ?? []).reduce((a, r) => a.plus(r['amount'] as string), new Decimal(0));
  const dates = [
    ...(invoices ?? []).map((r) => r['issue_date'] as string),
    ...(payments ?? []).map((r) => r['payment_date'] as string),
  ].sort();

  return {
    quotationCount: quotations?.length ?? 0,
    invoiceCount: invoices?.length ?? 0,
    totalInvoiced: totalInvoiced.toFixed(4),
    totalPaid: totalPaid.toFixed(4),
    outstanding: totalInvoiced.minus(totalPaid).toFixed(4),
    lastTransactionAt: dates.at(-1) ?? null,
  };
}

export const customersRepository = {
  async list(businessId: string, req: Request) {
    const list = parseListQuery(req);
    let query = supabaseAdmin.from('customers').select('*', { count: 'exact' }).eq('business_id', businessId);
    if (!list.includeArchived) query = query.is('archived_at', null);
    if (list.q) {
      query = query.or(
        `name.ilike.%${list.q}%,company_name.ilike.%${list.q}%,email.ilike.%${list.q}%,phone.ilike.%${list.q}%`,
      );
    }
    query = query.order(list.sort ?? 'created_at', { ascending: list.order === 'asc' });
    const [from, to] = rangeFor(list);
    const { data, error, count } = await query.range(from, to);
    if (error) throw new AppError(500, 'INTERNAL_ERROR', error.message);

    const withStats = await Promise.all(
      (data ?? []).map(async (row) => ({ ...rowToCamel(row), stats: await statsFor(businessId, row['id'] as string) })),
    );
    return { data: withStats, meta: meta(list, count ?? 0) };
  },

  async get(businessId: string, id: string) {
    const { data, error } = await supabaseAdmin
      .from('customers')
      .select('*')
      .eq('business_id', businessId)
      .eq('id', id)
      .maybeSingle();
    if (error) throw new AppError(500, 'INTERNAL_ERROR', error.message);
    if (!data) throw AppError.notFound('Customer');
    return { ...rowToCamel(data), stats: await statsFor(businessId, id) };
  },

  async create(businessId: string, userId: string, body: Record<string, unknown>) {
    if (!String(body['name'] ?? '').trim()) {
      throw AppError.validation([{ path: 'name', message: 'Customer name is required' }]);
    }
    const payload = { ...sanitize(body), business_id: businessId, created_by: userId };
    const { data, error } = await supabaseAdmin.from('customers').insert(payload).select('*').single();
    if (error) throw new AppError(500, 'INTERNAL_ERROR', error.message);
    return rowToCamel(data);
  },

  async update(businessId: string, id: string, body: Record<string, unknown>) {
    const { data, error } = await supabaseAdmin
      .from('customers')
      .update(sanitize(body))
      .eq('business_id', businessId)
      .eq('id', id)
      .select('*')
      .maybeSingle();
    if (error) throw new AppError(500, 'INTERNAL_ERROR', error.message);
    if (!data) throw AppError.notFound('Customer');
    return rowToCamel(data);
  },

  async remove(businessId: string, id: string) {
    const { error, count } = await supabaseAdmin
      .from('customers')
      .delete({ count: 'exact' })
      .eq('business_id', businessId)
      .eq('id', id);
    if (error) {
      if (error.code === '23503') {
        throw AppError.businessRule(
          'REFERENCED_RECORD_IN_USE',
          'This customer appears on existing documents and cannot be deleted. Archive it instead.',
        );
      }
      throw new AppError(500, 'INTERNAL_ERROR', error.message);
    }
    if (!count) throw AppError.notFound('Customer');
  },

  async archive(businessId: string, id: string) {
    const { data, error } = await supabaseAdmin
      .from('customers')
      .update({ archived_at: new Date().toISOString(), is_active: false })
      .eq('business_id', businessId)
      .eq('id', id)
      .select('*')
      .maybeSingle();
    if (error) throw new AppError(500, 'INTERNAL_ERROR', error.message);
    if (!data) throw AppError.notFound('Customer');
    return rowToCamel(data);
  },

  async restore(businessId: string, id: string) {
    const { data, error } = await supabaseAdmin
      .from('customers')
      .update({ archived_at: null, is_active: true })
      .eq('business_id', businessId)
      .eq('id', id)
      .select('*')
      .maybeSingle();
    if (error) throw new AppError(500, 'INTERNAL_ERROR', error.message);
    if (!data) throw AppError.notFound('Customer');
    return rowToCamel(data);
  },

  async listQuotations(businessId: string, customerId: string, req: Request) {
    const list = parseListQuery(req);
    const [from, to] = rangeFor(list);
    const { data, error, count } = await supabaseAdmin
      .from('quotations')
      .select('*', { count: 'exact' })
      .eq('business_id', businessId)
      .eq('customer_id', customerId)
      .order('issue_date', { ascending: false })
      .range(from, to);
    if (error) throw new AppError(500, 'INTERNAL_ERROR', error.message);
    return { data: rowsToCamel(data ?? []), meta: meta(list, count ?? 0) };
  },

  async listInvoices(businessId: string, customerId: string, req: Request) {
    const list = parseListQuery(req);
    const [from, to] = rangeFor(list);
    const { data, error, count } = await supabaseAdmin
      .from('invoices')
      .select('*', { count: 'exact' })
      .eq('business_id', businessId)
      .eq('customer_id', customerId)
      .order('issue_date', { ascending: false })
      .range(from, to);
    if (error) throw new AppError(500, 'INTERNAL_ERROR', error.message);
    return { data: rowsToCamel(data ?? []), meta: meta(list, count ?? 0) };
  },

  async listPayments(businessId: string, customerId: string, req: Request) {
    const list = parseListQuery(req);
    const [from, to] = rangeFor(list);
    const { data, error, count } = await supabaseAdmin
      .from('payments')
      .select('*', { count: 'exact' })
      .eq('business_id', businessId)
      .eq('customer_id', customerId)
      .order('payment_date', { ascending: false })
      .range(from, to);
    if (error) throw new AppError(500, 'INTERNAL_ERROR', error.message);
    return { data: rowsToCamel(data ?? []), meta: meta(list, count ?? 0) };
  },

  async activity(businessId: string, customerId: string) {
    const { data, error } = await supabaseAdmin
      .from('audit_logs')
      .select('*')
      .eq('business_id', businessId)
      .eq('entity_id', customerId)
      .order('created_at', { ascending: false })
      .limit(20);
    if (error) throw new AppError(500, 'INTERNAL_ERROR', error.message);
    return { data: rowsToCamel(data ?? []), meta: { page: 1, pageSize: 20, total: data?.length ?? 0, totalPages: 1 } };
  },
};

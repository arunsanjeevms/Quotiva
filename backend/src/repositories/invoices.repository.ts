import { supabaseAdmin } from '../config/supabase.js';
import { AppError } from '../utils/AppError.js';
import { rowToCamel, rowsToCamel } from '../utils/case.js';
import { meta, parseListQuery, rangeFor } from '../utils/pagination.js';
import type { Request } from 'express';

const DOC_SELECT = `
  *,
  customers(id, name, company_name, email, phone),
  invoice_items(*),
  invoice_charges(*)
`;

function shape(row: Record<string, unknown>): Record<string, unknown> {
  const customer = row['customers'] as Record<string, unknown> | null;
  const { customers, invoice_items, invoice_charges, ...rest } = row;
  void customers;
  const camel = rowToCamel<Record<string, unknown>>(rest);
  return {
    ...camel,
    customer: customer
      ? { id: customer['id'], name: customer['name'], companyName: customer['company_name'], email: customer['email'], phone: customer['phone'] }
      : null,
    items: rowsToCamel((invoice_items as Record<string, unknown>[] | null) ?? []).sort(
      (a, b) => (a as { sortOrder: number }).sortOrder - (b as { sortOrder: number }).sortOrder,
    ),
    charges: rowsToCamel((invoice_charges as Record<string, unknown>[] | null) ?? []),
  };
}

export const invoicesRepository = {
  async list(businessId: string, req: Request) {
    const list = parseListQuery(req);
    const paymentStatus = (req.query as Record<string, string | undefined>)['paymentStatus'];
    let query = supabaseAdmin
      .from('invoices')
      .select('*, customers(id, name, company_name, email, phone)', { count: 'exact' })
      .eq('business_id', businessId);

    if (list.status) query = query.in('status', list.status.split(','));
    if (paymentStatus) query = query.in('payment_status', paymentStatus.split(','));
    if (list.customerId) query = query.eq('customer_id', list.customerId);
    if (list.from) query = query.gte('issue_date', list.from);
    if (list.to) query = query.lte('issue_date', list.to);
    if (list.q) query = query.or(`invoice_number.ilike.%${list.q}%,reference.ilike.%${list.q}%`);

    const sortCol = list.sort === 'invoiceNumber' ? 'invoice_number' : list.sort === 'grandTotal' ? 'grand_total' : 'issue_date';
    query = query.order(sortCol, { ascending: list.order === 'asc' });
    const [from, to] = rangeFor(list);
    const { data, error, count } = await query.range(from, to);
    if (error) throw new AppError(500, 'INTERNAL_ERROR', error.message);
    return { data: (data ?? []).map(shape), meta: meta(list, count ?? 0) };
  },

  async get(businessId: string, id: string) {
    const { data, error } = await supabaseAdmin.from('invoices').select(DOC_SELECT).eq('business_id', businessId).eq('id', id).maybeSingle();
    if (error) throw new AppError(500, 'INTERNAL_ERROR', error.message);
    if (!data) throw AppError.notFound('Invoice');
    return shape(data);
  },

  async getRaw(businessId: string, id: string) {
    const { data, error } = await supabaseAdmin.from('invoices').select('*').eq('business_id', businessId).eq('id', id).maybeSingle();
    if (error) throw new AppError(500, 'INTERNAL_ERROR', error.message);
    if (!data) throw AppError.notFound('Invoice');
    return data;
  },

  async insertRows(header: Record<string, unknown>, itemRows: Record<string, unknown>[], chargeRows: Record<string, unknown>[]) {
    const { data: invoice, error } = await supabaseAdmin.from('invoices').insert(header).select('id').single();
    if (error) {
      if (error.code === '23505') throw AppError.conflict('DUPLICATE_NUMBER', 'That invoice number is already in use.');
      throw new AppError(500, 'INTERNAL_ERROR', error.message);
    }
    const id = invoice.id as string;
    if (itemRows.length) {
      const { error: itemError } = await supabaseAdmin.from('invoice_items').insert(itemRows.map((r) => ({ ...r, invoice_id: id })));
      if (itemError) throw new AppError(500, 'INTERNAL_ERROR', itemError.message);
    }
    if (chargeRows.length) {
      const { error: chargeError } = await supabaseAdmin.from('invoice_charges').insert(chargeRows.map((r) => ({ ...r, invoice_id: id })));
      if (chargeError) throw new AppError(500, 'INTERNAL_ERROR', chargeError.message);
    }
    return id;
  },

  async replaceRows(businessId: string, id: string, header: Record<string, unknown>, itemRows: Record<string, unknown>[], chargeRows: Record<string, unknown>[]) {
    const { error } = await supabaseAdmin.from('invoices').update(header).eq('business_id', businessId).eq('id', id);
    if (error) throw new AppError(500, 'INTERNAL_ERROR', error.message);
    await supabaseAdmin.from('invoice_items').delete().eq('invoice_id', id);
    await supabaseAdmin.from('invoice_charges').delete().eq('invoice_id', id);
    if (itemRows.length) await supabaseAdmin.from('invoice_items').insert(itemRows.map((r) => ({ ...r, invoice_id: id })));
    if (chargeRows.length) await supabaseAdmin.from('invoice_charges').insert(chargeRows.map((r) => ({ ...r, invoice_id: id })));
  },

  async remove(businessId: string, id: string) {
    const { error, count } = await supabaseAdmin.from('invoices').delete({ count: 'exact' }).eq('business_id', businessId).eq('id', id);
    if (error) throw new AppError(500, 'INTERNAL_ERROR', error.message);
    if (!count) throw AppError.notFound('Invoice');
  },

  async patch(businessId: string, id: string, patch: Record<string, unknown>) {
    const { data, error } = await supabaseAdmin.from('invoices').update(patch).eq('business_id', businessId).eq('id', id).select(DOC_SELECT).maybeSingle();
    if (error) throw new AppError(500, 'INTERNAL_ERROR', error.message);
    if (!data) throw AppError.notFound('Invoice');
    return shape(data);
  },

  async recordStatusHistory(businessId: string, invoiceId: string, fromStatus: string | null, toStatus: string, userId: string, note?: string) {
    await supabaseAdmin.from('invoice_status_history').insert({
      business_id: businessId, invoice_id: invoiceId, from_status: fromStatus, to_status: toStatus, changed_by: userId, note: note ?? null,
    });
  },

  async listPayments(businessId: string, invoiceId: string) {
    const { data, error } = await supabaseAdmin.from('payments').select('*').eq('business_id', businessId).eq('invoice_id', invoiceId).order('payment_date', { ascending: false });
    if (error) throw new AppError(500, 'INTERNAL_ERROR', error.message);
    return rowsToCamel(data ?? []);
  },
};

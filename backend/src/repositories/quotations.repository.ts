import { supabaseAdmin } from '../config/supabase.js';
import { AppError } from '../utils/AppError.js';
import { rowToCamel, rowsToCamel } from '../utils/case.js';
import { meta, parseListQuery, rangeFor } from '../utils/pagination.js';
import type { Request } from 'express';

const DOC_SELECT = `
  *,
  customers(id, name, company_name, email, phone),
  quotation_items(*),
  quotation_charges(*)
`;

function shape(row: Record<string, unknown>): Record<string, unknown> {
  const customer = row['customers'] as Record<string, unknown> | null;
  const { customers, quotation_items, quotation_charges, ...rest } = row;
  void customers;
  const camel = rowToCamel<Record<string, unknown>>(rest);
  return {
    ...camel,
    customer: customer
      ? {
          id: customer['id'],
          name: customer['name'],
          companyName: customer['company_name'],
          email: customer['email'],
          phone: customer['phone'],
        }
      : null,
    items: rowsToCamel((quotation_items as Record<string, unknown>[] | null) ?? []).sort(
      (a, b) => (a as { sortOrder: number }).sortOrder - (b as { sortOrder: number }).sortOrder,
    ),
    charges: rowsToCamel((quotation_charges as Record<string, unknown>[] | null) ?? []),
  };
}

export const quotationsRepository = {
  async list(businessId: string, req: Request) {
    const list = parseListQuery(req);
    let query = supabaseAdmin
      .from('quotations')
      .select('*, customers(id, name, company_name, email, phone)', { count: 'exact' })
      .eq('business_id', businessId);

    if (list.status) query = query.in('status', list.status.split(','));
    if (list.customerId) query = query.eq('customer_id', list.customerId);
    if (list.from) query = query.gte('issue_date', list.from);
    if (list.to) query = query.lte('issue_date', list.to);
    if (list.q) query = query.or(`quotation_number.ilike.%${list.q}%,reference.ilike.%${list.q}%`);

    const sortCol = list.sort === 'quotationNumber' ? 'quotation_number' : list.sort === 'grandTotal' ? 'grand_total' : 'issue_date';
    query = query.order(sortCol, { ascending: list.order === 'asc' });
    const [from, to] = rangeFor(list);
    const { data, error, count } = await query.range(from, to);
    if (error) throw new AppError(500, 'INTERNAL_ERROR', error.message);
    return { data: (data ?? []).map(shape), meta: meta(list, count ?? 0) };
  },

  async get(businessId: string, id: string) {
    const { data, error } = await supabaseAdmin
      .from('quotations')
      .select(DOC_SELECT)
      .eq('business_id', businessId)
      .eq('id', id)
      .maybeSingle();
    if (error) throw new AppError(500, 'INTERNAL_ERROR', error.message);
    if (!data) throw AppError.notFound('Quotation');
    return shape(data);
  },

  async getRaw(businessId: string, id: string) {
    const { data, error } = await supabaseAdmin
      .from('quotations')
      .select('*')
      .eq('business_id', businessId)
      .eq('id', id)
      .maybeSingle();
    if (error) throw new AppError(500, 'INTERNAL_ERROR', error.message);
    if (!data) throw AppError.notFound('Quotation');
    return data;
  },

  /**
   * Not a single atomic transaction (supabase-js issues separate statements) —
   * a partial failure between the header insert and the item insert is
   * possible. Acceptable for Phase 1; a Postgres function would close this
   * gap and is a natural next hardening step (docs/10 roadmap).
   */
  async insertRows(
    quotationHeader: Record<string, unknown>,
    itemRows: Record<string, unknown>[],
    chargeRows: Record<string, unknown>[],
  ) {
    const { data: quotation, error } = await supabaseAdmin.from('quotations').insert(quotationHeader).select('id').single();
    if (error) {
      if (error.code === '23505') throw AppError.conflict('DUPLICATE_NUMBER', 'That quotation number is already in use.');
      throw new AppError(500, 'INTERNAL_ERROR', error.message);
    }
    const id = quotation.id as string;
    if (itemRows.length) {
      const { error: itemError } = await supabaseAdmin.from('quotation_items').insert(itemRows.map((r) => ({ ...r, quotation_id: id })));
      if (itemError) throw new AppError(500, 'INTERNAL_ERROR', itemError.message);
    }
    if (chargeRows.length) {
      const { error: chargeError } = await supabaseAdmin.from('quotation_charges').insert(chargeRows.map((r) => ({ ...r, quotation_id: id })));
      if (chargeError) throw new AppError(500, 'INTERNAL_ERROR', chargeError.message);
    }
    return id;
  },

  async replaceRows(
    businessId: string,
    id: string,
    header: Record<string, unknown>,
    itemRows: Record<string, unknown>[],
    chargeRows: Record<string, unknown>[],
  ) {
    const { error } = await supabaseAdmin.from('quotations').update(header).eq('business_id', businessId).eq('id', id);
    if (error) throw new AppError(500, 'INTERNAL_ERROR', error.message);
    await supabaseAdmin.from('quotation_items').delete().eq('quotation_id', id);
    await supabaseAdmin.from('quotation_charges').delete().eq('quotation_id', id);
    if (itemRows.length) await supabaseAdmin.from('quotation_items').insert(itemRows.map((r) => ({ ...r, quotation_id: id })));
    if (chargeRows.length) await supabaseAdmin.from('quotation_charges').insert(chargeRows.map((r) => ({ ...r, quotation_id: id })));
  },

  async remove(businessId: string, id: string) {
    const { error, count } = await supabaseAdmin.from('quotations').delete({ count: 'exact' }).eq('business_id', businessId).eq('id', id);
    if (error) throw new AppError(500, 'INTERNAL_ERROR', error.message);
    if (!count) throw AppError.notFound('Quotation');
  },

  async patch(businessId: string, id: string, patch: Record<string, unknown>) {
    const { data, error } = await supabaseAdmin
      .from('quotations')
      .update(patch)
      .eq('business_id', businessId)
      .eq('id', id)
      .select(DOC_SELECT)
      .maybeSingle();
    if (error) throw new AppError(500, 'INTERNAL_ERROR', error.message);
    if (!data) throw AppError.notFound('Quotation');
    return shape(data);
  },

  async recordStatusHistory(businessId: string, quotationId: string, fromStatus: string | null, toStatus: string, userId: string, note?: string) {
    await supabaseAdmin.from('quotation_status_history').insert({
      business_id: businessId, quotation_id: quotationId, from_status: fromStatus, to_status: toStatus, changed_by: userId, note: note ?? null,
    });
  },
};

import { supabaseAdmin } from '../config/supabase.js';
import { AppError } from '../utils/AppError.js';
import { bodyToSnake } from '../utils/case.js';
import { meta, parseListQuery, rangeFor } from '../utils/pagination.js';
import type { Request } from 'express';

const ALLOWED = new Set([
  'kind', 'name', 'sku', 'description', 'category_id', 'unit_id',
  'cost_price', 'selling_price', 'tax_id', 'notes', 'is_active',
]);

function sanitize(body: Record<string, unknown>): Record<string, unknown> {
  const snake = bodyToSnake(body);
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(snake)) if (ALLOWED.has(key)) out[key] = value;
  return out;
}

const SELECT = `
  id, kind, name, sku, description, category_id, unit_id, cost_price, selling_price,
  tax_id, notes, is_active, archived_at, created_at,
  categories(name),
  units(name),
  taxes(name, rate)
`;

function shape(row: Record<string, unknown>) {
  const category = row['categories'] as { name: string } | null;
  const unit = row['units'] as { name: string } | null;
  const tax = row['taxes'] as { name: string; rate: number } | null;
  return {
    id: row['id'],
    kind: row['kind'],
    name: row['name'],
    sku: row['sku'],
    description: row['description'],
    categoryId: row['category_id'],
    categoryName: category?.name ?? null,
    unitId: row['unit_id'],
    unitName: unit?.name ?? null,
    costPrice: row['cost_price'],
    sellingPrice: row['selling_price'],
    taxId: row['tax_id'],
    taxName: tax?.name ?? null,
    taxRate: tax?.rate ?? 0,
    notes: row['notes'],
    isActive: row['is_active'],
    archivedAt: row['archived_at'],
    createdAt: row['created_at'],
  };
}

export const productsRepository = {
  async list(businessId: string, req: Request) {
    const list = parseListQuery(req);
    let query = supabaseAdmin.from('products').select(SELECT, { count: 'exact' }).eq('business_id', businessId);
    if (!list.includeArchived) query = query.is('archived_at', null);
    if (list.kind) query = query.eq('kind', list.kind);
    if (list.categoryId) query = query.eq('category_id', list.categoryId);
    if (list.q) query = query.or(`name.ilike.%${list.q}%,sku.ilike.%${list.q}%,description.ilike.%${list.q}%`);
    query = query.order(list.sort ?? 'created_at', { ascending: list.order === 'asc' });
    const [from, to] = rangeFor(list);
    const { data, error, count } = await query.range(from, to);
    if (error) throw new AppError(500, 'INTERNAL_ERROR', error.message);
    return { data: (data ?? []).map(shape), meta: meta(list, count ?? 0) };
  },

  async get(businessId: string, id: string) {
    const { data, error } = await supabaseAdmin
      .from('products')
      .select(SELECT)
      .eq('business_id', businessId)
      .eq('id', id)
      .maybeSingle();
    if (error) throw new AppError(500, 'INTERNAL_ERROR', error.message);
    if (!data) throw AppError.notFound('Product');
    return shape(data);
  },

  async create(businessId: string, userId: string, body: Record<string, unknown>) {
    if (!String(body['name'] ?? '').trim()) {
      throw AppError.validation([{ path: 'name', message: 'Name is required' }]);
    }
    const payload = { ...sanitize(body), business_id: businessId, created_by: userId };
    const { data, error } = await supabaseAdmin.from('products').insert(payload).select('id').single();
    if (error) throw new AppError(500, 'INTERNAL_ERROR', error.message);
    return this.get(businessId, data.id as string);
  },

  async update(businessId: string, id: string, body: Record<string, unknown>) {
    const { error, count } = await supabaseAdmin
      .from('products')
      .update(sanitize(body), { count: 'exact' })
      .eq('business_id', businessId)
      .eq('id', id);
    if (error) throw new AppError(500, 'INTERNAL_ERROR', error.message);
    if (!count) throw AppError.notFound('Product');
    return this.get(businessId, id);
  },

  async archive(businessId: string, id: string) {
    const { error, count } = await supabaseAdmin
      .from('products')
      .update({ archived_at: new Date().toISOString(), is_active: false }, { count: 'exact' })
      .eq('business_id', businessId)
      .eq('id', id);
    if (error) throw new AppError(500, 'INTERNAL_ERROR', error.message);
    if (!count) throw AppError.notFound('Product');
    return this.get(businessId, id);
  },

  async restore(businessId: string, id: string) {
    const { error, count } = await supabaseAdmin
      .from('products')
      .update({ archived_at: null, is_active: true }, { count: 'exact' })
      .eq('business_id', businessId)
      .eq('id', id);
    if (error) throw new AppError(500, 'INTERNAL_ERROR', error.message);
    if (!count) throw AppError.notFound('Product');
    return this.get(businessId, id);
  },
};

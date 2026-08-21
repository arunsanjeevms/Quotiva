import { supabaseAdmin } from '../config/supabase.js';
import { AppError } from '../utils/AppError.js';
import { bodyToSnake, rowToCamel, rowsToCamel } from '../utils/case.js';
import { meta, parseListQuery, rangeFor, type ListQuery } from '../utils/pagination.js';
import type { Request } from 'express';

export interface SimpleCrudOptions {
  table: string;
  entityName: string;
  searchColumns: string[];
  defaultSort: string;
  /** Applied to every insert/update payload after camel->snake conversion. */
  allowedColumns: Set<string>;
  hasArchive?: boolean;
  hasActive?: boolean;
}

/**
 * One implementation shared by the small configuration tables — categories,
 * units, taxes, payment methods — which differ only in their columns
 * (docs/08 §5, mirroring the frontend's CrudTablePage pattern).
 *
 * `business_id` is always taken from the tenant context, never the request
 * body, and every query filters on it explicitly (defense in depth alongside
 * RLS — ADR-002).
 */
export function simpleCrud<T extends Record<string, unknown>>(options: SimpleCrudOptions) {
  const { table, entityName, searchColumns, defaultSort, allowedColumns, hasArchive = true, hasActive = true } = options;

  function sanitize(body: Record<string, unknown>): Record<string, unknown> {
    const snake = bodyToSnake(body);
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(snake)) {
      if (allowedColumns.has(key)) out[key] = value;
    }
    return out;
  }

  return {
    async list(businessId: string, req: Request): Promise<{ data: T[]; meta: ReturnType<typeof meta> }> {
      const list = parseListQuery(req);
      let query = supabaseAdmin.from(table).select('*', { count: 'exact' }).eq('business_id', businessId);

      if (hasArchive && !list.includeArchived) query = query.is('archived_at', null);
      if (list.q) {
        const orClause = searchColumns.map((c) => `${c}.ilike.%${list.q}%`).join(',');
        query = query.or(orClause);
      }

      const sortColumn = list.sort ? snakeSort(list.sort) : defaultSort;
      query = query.order(sortColumn, { ascending: list.order === 'asc' });
      const [from, to] = rangeFor(list);
      query = query.range(from, to);

      const { data, error, count } = await query;
      if (error) throw new AppError(500, 'INTERNAL_ERROR', error.message);
      return { data: rowsToCamel<T>(data ?? []), meta: meta(list, count ?? 0) };
    },

    async get(businessId: string, id: string): Promise<T> {
      const { data, error } = await supabaseAdmin
        .from(table)
        .select('*')
        .eq('business_id', businessId)
        .eq('id', id)
        .maybeSingle();
      if (error) throw new AppError(500, 'INTERNAL_ERROR', error.message);
      if (!data) throw AppError.notFound(entityName);
      return rowToCamel<T>(data);
    },

    async create(businessId: string, userId: string, body: Record<string, unknown>): Promise<T> {
      const payload = { ...sanitize(body), business_id: businessId, created_by: allowedColumns.has('created_by') ? userId : undefined };
      const { data, error } = await supabaseAdmin.from(table).insert(payload).select('*').single();
      if (error) throw mapWriteError(error, entityName);
      return rowToCamel<T>(data);
    },

    async update(businessId: string, id: string, body: Record<string, unknown>): Promise<T> {
      const payload = sanitize(body);
      const { data, error } = await supabaseAdmin
        .from(table)
        .update(payload)
        .eq('business_id', businessId)
        .eq('id', id)
        .select('*')
        .maybeSingle();
      if (error) throw mapWriteError(error, entityName);
      if (!data) throw AppError.notFound(entityName);
      return rowToCamel<T>(data);
    },

    async remove(businessId: string, id: string): Promise<void> {
      const { error, count } = await supabaseAdmin
        .from(table)
        .delete({ count: 'exact' })
        .eq('business_id', businessId)
        .eq('id', id);
      if (error) {
        if (error.code === '23503') {
          throw AppError.businessRule(
            'REFERENCED_RECORD_IN_USE',
            `This ${entityName.toLowerCase()} is used on existing documents and cannot be deleted. Archive it instead.`,
          );
        }
        throw new AppError(500, 'INTERNAL_ERROR', error.message);
      }
      if (!count) throw AppError.notFound(entityName);
    },

    async archive(businessId: string, id: string): Promise<T> {
      const patch: Record<string, unknown> = {};
      if (hasArchive) patch['archived_at'] = new Date().toISOString();
      if (hasActive) patch['is_active'] = false;
      const { data, error } = await supabaseAdmin
        .from(table)
        .update(patch)
        .eq('business_id', businessId)
        .eq('id', id)
        .select('*')
        .maybeSingle();
      if (error) throw new AppError(500, 'INTERNAL_ERROR', error.message);
      if (!data) throw AppError.notFound(entityName);
      return rowToCamel<T>(data);
    },

    async restore(businessId: string, id: string): Promise<T> {
      const patch: Record<string, unknown> = {};
      if (hasArchive) patch['archived_at'] = null;
      if (hasActive) patch['is_active'] = true;
      const { data, error } = await supabaseAdmin
        .from(table)
        .update(patch)
        .eq('business_id', businessId)
        .eq('id', id)
        .select('*')
        .maybeSingle();
      if (error) throw new AppError(500, 'INTERNAL_ERROR', error.message);
      if (!data) throw AppError.notFound(entityName);
      return rowToCamel<T>(data);
    },
  };
}

function snakeSort(sort: string): string {
  return sort.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
}

function mapWriteError(error: { code?: string; message: string }, entityName: string): AppError {
  if (error.code === '23505') {
    return AppError.businessRule('DUPLICATE_NUMBER', `A ${entityName.toLowerCase()} with that name already exists.`);
  }
  return new AppError(500, 'INTERNAL_ERROR', error.message);
}

export type { ListQuery };

import type { Request } from 'express';

export interface ListQuery {
  page: number;
  pageSize: number;
  sort?: string;
  order: 'asc' | 'desc';
  q?: string;
  from?: string;
  to?: string;
  status?: string;
  customerId?: string;
  kind?: string;
  categoryId?: string;
  includeArchived: boolean;
}

/** Parses the list conventions shared by every collection endpoint (docs/05 "List conventions"). */
export function parseListQuery(req: Request): ListQuery {
  const q = req.query as Record<string, string | undefined>;
  return {
    page: Math.max(1, Number(q['page'] ?? 1) || 1),
    pageSize: Math.min(100, Math.max(1, Number(q['pageSize'] ?? 25) || 25)),
    sort: q['sort'],
    order: q['order'] === 'asc' ? 'asc' : 'desc',
    q: q['q']?.trim() || undefined,
    from: q['from'],
    to: q['to'],
    status: q['status'],
    customerId: q['customerId'],
    kind: q['kind'],
    categoryId: q['categoryId'],
    includeArchived: q['includeArchived'] === 'true',
  };
}

export function rangeFor(list: ListQuery): [number, number] {
  const start = (list.page - 1) * list.pageSize;
  return [start, start + list.pageSize - 1];
}

export function meta(list: ListQuery, total: number) {
  return {
    page: list.page,
    pageSize: list.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / list.pageSize)),
  };
}

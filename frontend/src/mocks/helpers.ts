import type { ListMeta } from '@/types';

/** Shared list-shaping used by every mock collection endpoint. */

export interface PagedResult<T> {
  data: T[];
  meta: ListMeta;
}

export function paginate<T>(rows: T[], url: URL): PagedResult<T> {
  const page = Math.max(1, Number(url.searchParams.get('page') ?? 1));
  const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get('pageSize') ?? 25)));
  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const start = (page - 1) * pageSize;
  return {
    data: rows.slice(start, start + pageSize),
    meta: { page, pageSize, total, totalPages },
  };
}

/** Case-insensitive substring match across the given fields. */
export function search<T>(rows: T[], url: URL, fields: (keyof T)[]): T[] {
  const q = url.searchParams.get('q')?.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((row) =>
    fields.some((field) => String(row[field] ?? '').toLowerCase().includes(q)),
  );
}

export function filterByStatus<T extends { status: string }>(rows: T[], url: URL): T[] {
  const raw = url.searchParams.get('status');
  if (!raw) return rows;
  const wanted = new Set(raw.split(',').map((s) => s.trim()).filter(Boolean));
  if (wanted.size === 0) return rows;
  return rows.filter((row) => wanted.has(row.status));
}

export function filterByDateRange<T>(rows: T[], url: URL, field: keyof T): T[] {
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  if (!from && !to) return rows;
  return rows.filter((row) => {
    const value = String(row[field] ?? '').slice(0, 10);
    if (from && value < from) return false;
    if (to && value > to) return false;
    return true;
  });
}

export function filterByCustomer<T extends { customerId: string }>(rows: T[], url: URL): T[] {
  const customerId = url.searchParams.get('customerId');
  return customerId ? rows.filter((row) => row.customerId === customerId) : rows;
}

export function sortRows<T>(rows: T[], url: URL, fallback: keyof T): T[] {
  const sortKey = (url.searchParams.get('sort') ?? String(fallback)) as keyof T;
  const order = url.searchParams.get('order') === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const left = a[sortKey];
    const right = b[sortKey];
    if (left === right) return 0;
    if (left === null || left === undefined) return 1;
    if (right === null || right === undefined) return -1;
    // Numeric-looking strings (money) compare by value, not lexically.
    const ln = Number(left);
    const rn = Number(right);
    if (Number.isFinite(ln) && Number.isFinite(rn) && String(left).trim() !== '') {
      return (ln - rn) * order;
    }
    return String(left).localeCompare(String(right)) * order;
  });
}

/** Archived records are excluded unless explicitly requested. */
export function applyArchiveFilter<T extends { archivedAt?: string | null }>(
  rows: T[],
  url: URL,
): T[] {
  const include = url.searchParams.get('includeArchived') === 'true';
  return include ? rows : rows.filter((row) => !row.archivedAt);
}

export function newId(prefix: string): string {
  return `${prefix}${crypto.randomUUID().slice(1)}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

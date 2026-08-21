import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { ListParams } from '@/types';
import type { SortState } from '@/components/ui/DataTable';

/**
 * List state lives in the URL, so a filtered view is shareable, survives a
 * refresh, and the browser back button behaves as users expect.
 */
export interface ListState {
  params: ListParams;
  page: number;
  pageSize: number;
  q: string;
  sort: SortState | undefined;
  filters: Record<string, string>;
  setPage: (page: number) => void;
  setPageSize: (size: number) => void;
  setQuery: (q: string) => void;
  setSort: (sort: SortState) => void;
  setFilter: (key: string, value: string | undefined) => void;
  clearFilters: () => void;
  hasFilters: boolean;
}

const RESERVED = new Set(['page', 'pageSize', 'q', 'sort', 'order', 'tab']);

export function useListParams(defaults: { sort?: string; order?: 'asc' | 'desc' } = {}): ListState {
  const [searchParams, setSearchParams] = useSearchParams();

  const page = Number(searchParams.get('page') ?? 1);
  const pageSize = Number(searchParams.get('pageSize') ?? 25);
  const q = searchParams.get('q') ?? '';
  const sortKey = searchParams.get('sort') ?? defaults.sort;
  const order = (searchParams.get('order') ?? defaults.order ?? 'desc') as 'asc' | 'desc';

  const filters = useMemo(() => {
    const result: Record<string, string> = {};
    for (const [key, value] of searchParams.entries()) {
      if (!RESERVED.has(key) && value) result[key] = value;
    }
    return result;
  }, [searchParams]);

  const patch = useCallback(
    (updates: Record<string, string | undefined>, resetPage = true) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [key, value] of Object.entries(updates)) {
            if (value === undefined || value === '') next.delete(key);
            else next.set(key, value);
          }
          if (resetPage && !('page' in updates)) next.delete('page');
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const params = useMemo<ListParams>(
    () => ({
      page,
      pageSize,
      ...(q ? { q } : {}),
      ...(sortKey ? { sort: sortKey, order } : {}),
      ...filters,
    }),
    [page, pageSize, q, sortKey, order, filters],
  );

  return {
    params,
    page,
    pageSize,
    q,
    sort: sortKey ? { sort: sortKey, order } : undefined,
    filters,
    setPage: (next) => patch({ page: String(next) }, false),
    setPageSize: (size) => patch({ pageSize: String(size) }),
    setQuery: (next) => patch({ q: next }),
    setSort: (next) => patch({ sort: next.sort, order: next.order }),
    setFilter: (key, value) => patch({ [key]: value }),
    clearFilters: () =>
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams();
          const preserved = prev.get('tab');
          if (preserved) next.set('tab', preserved);
          return next;
        },
        { replace: true },
      ),
    hasFilters: Boolean(q) || Object.keys(filters).length > 0,
  };
}

/** Debounce a fast-changing value, e.g. a search box, before it hits the API. */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

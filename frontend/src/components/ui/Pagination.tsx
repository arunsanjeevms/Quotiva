import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from './Button';
import { NativeSelect } from './Input';
import type { ListMeta } from '@/types';
import { formatNumber } from '@/lib/format';

export interface PaginationProps {
  meta: ListMeta | undefined;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
}

const PAGE_SIZES = [10, 25, 50, 100];

/** Windowed page numbers with ellipses, so a 200-page list stays one row. */
function pageWindow(current: number, total: number): (number | 'gap')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: (number | 'gap')[] = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  if (start > 2) pages.push('gap');
  for (let i = start; i <= end; i += 1) pages.push(i);
  if (end < total - 1) pages.push('gap');
  pages.push(total);
  return pages;
}

export function Pagination({
  meta,
  onPageChange,
  onPageSizeChange,
}: PaginationProps): React.ReactElement | null {
  if (!meta || meta.total === 0) return null;

  const first = (meta.page - 1) * meta.pageSize + 1;
  const last = Math.min(meta.page * meta.pageSize, meta.total);

  return (
    <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
      <p className="text-sm text-content-muted">
        Showing <span className="font-medium text-content-secondary">{formatNumber(first)}</span>–
        <span className="font-medium text-content-secondary">{formatNumber(last)}</span> of{' '}
        <span className="font-medium text-content-secondary">{formatNumber(meta.total)}</span>
      </p>

      <div className="flex items-center gap-2">
        {onPageSizeChange && (
          <NativeSelect
            aria-label="Rows per page"
            value={meta.pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            className="h-8 w-auto text-sm"
          >
            {PAGE_SIZES.map((size) => (
              <option key={size} value={size}>
                {size} / page
              </option>
            ))}
          </NativeSelect>
        )}

        <nav className="flex items-center gap-1" aria-label="Pagination">
          <Button
            variant="secondary"
            size="icon-sm"
            aria-label="Previous page"
            disabled={meta.page <= 1}
            onClick={() => onPageChange(meta.page - 1)}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>

          <div className="hidden items-center gap-1 sm:flex">
            {pageWindow(meta.page, meta.totalPages).map((page, i) =>
              page === 'gap' ? (
                <span key={`gap-${i}`} className="px-1 text-sm text-content-muted">
                  …
                </span>
              ) : (
                <Button
                  key={page}
                  variant={page === meta.page ? 'primary' : 'ghost'}
                  size="icon-sm"
                  aria-current={page === meta.page ? 'page' : undefined}
                  onClick={() => onPageChange(page)}
                >
                  {page}
                </Button>
              ),
            )}
          </div>

          <span className="px-2 text-sm text-content-muted sm:hidden">
            {meta.page} / {meta.totalPages}
          </span>

          <Button
            variant="secondary"
            size="icon-sm"
            aria-label="Next page"
            disabled={meta.page >= meta.totalPages}
            onClick={() => onPageChange(meta.page + 1)}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </nav>
      </div>
    </div>
  );
}

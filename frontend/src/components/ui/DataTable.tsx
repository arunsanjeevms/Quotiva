import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/cn';
import { TableSkeleton } from './Skeleton';
import { ErrorState } from './States';

export interface Column<T> {
  /** Stable key; also the sort field sent to the API when `sortable`. */
  key: string;
  header: React.ReactNode;
  /** Cell renderer. Receives the row and its index. */
  cell: (row: T, index: number) => React.ReactNode;
  sortable?: boolean;
  align?: 'left' | 'right' | 'center';
  /** Tailwind width class, e.g. "w-32". */
  width?: string;
  /** Hide below the given breakpoint on narrow screens. */
  hideBelow?: 'sm' | 'md' | 'lg' | 'xl';
  /** Numeric columns get tabular figures so they align. */
  numeric?: boolean;
  /** In the mobile card layout this column becomes the card title. */
  cardTitle?: boolean;
  /** Omit from the mobile card layout entirely. */
  hideOnCard?: boolean;
}

export interface SortState {
  sort: string;
  order: 'asc' | 'desc';
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[] | undefined;
  rowKey: (row: T) => string;
  loading?: boolean;
  error?: unknown;
  onRetry?: () => void;
  sort?: SortState | undefined;
  onSortChange?: (sort: SortState) => void;
  onRowClick?: (row: T) => void;
  /** Rendered when there are no rows and no error. */
  empty?: React.ReactNode;
  /** Trailing actions column, rendered outside the card body on mobile. */
  actions?: (row: T) => React.ReactNode;
  className?: string;
}

const HIDE_BELOW: Record<NonNullable<Column<unknown>['hideBelow']>, string> = {
  sm: 'hidden sm:table-cell',
  md: 'hidden md:table-cell',
  lg: 'hidden lg:table-cell',
  xl: 'hidden xl:table-cell',
};

const ALIGN: Record<NonNullable<Column<unknown>['align']>, string> = {
  left: 'text-left',
  right: 'text-right',
  center: 'text-center',
};

/**
 * Server-driven table: sorting and pagination are signalled upward, never done
 * in the browser. Below `md` each row collapses into a stacked card so the table
 * stays usable on a phone (docs/07 §3).
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  loading,
  error,
  onRetry,
  sort,
  onSortChange,
  onRowClick,
  empty,
  actions,
  className,
}: DataTableProps<T>): React.ReactElement {
  if (error) return <ErrorState error={error} {...(onRetry ? { onRetry } : {})} />;
  if (loading) return <TableSkeleton columns={Math.min(columns.length, 6)} />;
  if (!rows || rows.length === 0) return <>{empty}</>;

  const toggleSort = (key: string): void => {
    if (!onSortChange) return;
    const nextOrder = sort?.sort === key && sort.order === 'asc' ? 'desc' : 'asc';
    onSortChange({ sort: key, order: nextOrder });
  };

  const titleColumn = columns.find((c) => c.cardTitle) ?? columns[0];

  return (
    <div className={cn('overflow-hidden rounded-lg border border-line bg-surface', className)}>
      {/* Desktop / tablet table */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-line bg-subtle/60">
              {columns.map((col) => (
                <th
                  key={col.key}
                  scope="col"
                  className={cn(
                    'px-4 py-2.5 text-xs uppercase tracking-wide text-content-muted',
                    ALIGN[col.align ?? 'left'],
                    col.width,
                    col.hideBelow && HIDE_BELOW[col.hideBelow],
                  )}
                >
                  {col.sortable && onSortChange ? (
                    <button
                      type="button"
                      onClick={() => toggleSort(col.key)}
                      className={cn(
                        'inline-flex items-center gap-1 rounded transition-colors hover:text-content',
                        col.align === 'right' && 'flex-row-reverse',
                      )}
                    >
                      {col.header}
                      {sort?.sort === col.key ? (
                        sort.order === 'asc' ? (
                          <ArrowUp className="h-3 w-3" />
                        ) : (
                          <ArrowDown className="h-3 w-3" />
                        )
                      ) : (
                        <ChevronsUpDown className="h-3 w-3 opacity-40" />
                      )}
                    </button>
                  ) : (
                    col.header
                  )}
                </th>
              ))}
              {actions && <th scope="col" className="w-12 px-2" />}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr
                key={rowKey(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={cn(
                  'border-b border-line last:border-0 transition-colors',
                  onRowClick && 'cursor-pointer hover:bg-subtle/50',
                )}
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={cn(
                      'px-4 py-2.5 text-sm text-content-secondary align-middle',
                      ALIGN[col.align ?? 'left'],
                      col.numeric && 'tabular',
                      col.hideBelow && HIDE_BELOW[col.hideBelow],
                    )}
                  >
                    {col.cell(row, index)}
                  </td>
                ))}
                {actions && (
                  <td className="px-2 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                    {actions(row)}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="divide-y divide-line md:hidden">
        {rows.map((row, index) => (
          <div
            key={rowKey(row)}
            onClick={onRowClick ? () => onRowClick(row) : undefined}
            className={cn('p-3', onRowClick && 'cursor-pointer active:bg-subtle/50')}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1 text-base font-medium text-content">
                {titleColumn?.cell(row, index)}
              </div>
              {actions && (
                <div onClick={(e) => e.stopPropagation()} className="shrink-0">
                  {actions(row)}
                </div>
              )}
            </div>
            <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5">
              {columns
                .filter((c) => c !== titleColumn && !c.hideOnCard)
                .map((col) => (
                  <div key={col.key} className="min-w-0">
                    <dt className="text-xs uppercase tracking-wide text-content-muted">
                      {col.header}
                    </dt>
                    <dd
                      className={cn(
                        'truncate text-sm text-content-secondary',
                        col.numeric && 'tabular',
                      )}
                    >
                      {col.cell(row, index)}
                    </dd>
                  </div>
                ))}
            </dl>
          </div>
        ))}
      </div>
    </div>
  );
}

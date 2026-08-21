import { cn } from '@/lib/cn';

export function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>): React.ReactElement {
  return <div className={cn('skeleton h-4 w-full', className)} aria-hidden {...props} />;
}

/** Table placeholder that matches the real table's shape, not a spinner. */
export function TableSkeleton({
  rows = 8,
  columns = 5,
}: {
  rows?: number;
  columns?: number;
}): React.ReactElement {
  return (
    <div className="overflow-hidden rounded-lg border border-line bg-surface">
      <div className="flex gap-4 border-b border-line bg-subtle/60 px-4 py-2.5">
        {Array.from({ length: columns }).map((_, i) => (
          <Skeleton key={i} className="h-3 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex items-center gap-4 border-b border-line px-4 py-3 last:border-0">
          {Array.from({ length: columns }).map((_, c) => (
            <Skeleton key={c} className={cn('h-3.5 flex-1', c === 0 && 'max-w-[180px]')} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function StatTileSkeleton({ count = 4 }: { count?: number }): React.ReactElement {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-lg border border-line bg-surface p-4">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="mt-3 h-7 w-28" />
          <Skeleton className="mt-2 h-3 w-16" />
        </div>
      ))}
    </div>
  );
}

export function ChartSkeleton({ className }: { className?: string }): React.ReactElement {
  return (
    <div className={cn('rounded-lg border border-line bg-surface p-4', className)}>
      <Skeleton className="h-3.5 w-32" />
      <div className="mt-6 flex h-48 items-end gap-2">
        {[45, 70, 35, 85, 60, 90, 50, 75, 40, 65, 80, 55].map((h, i) => (
          <div key={i} className="skeleton flex-1 rounded-t" style={{ height: `${h}%` }} />
        ))}
      </div>
    </div>
  );
}

export function FormSkeleton({ fields = 6 }: { fields?: number }): React.ReactElement {
  return (
    <div className="space-y-4">
      {Array.from({ length: fields }).map((_, i) => (
        <div key={i} className="space-y-1.5">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-9 w-full" />
        </div>
      ))}
    </div>
  );
}

export function DetailSkeleton(): React.ReactElement {
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-line bg-surface p-4">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="mt-2 h-3 w-32" />
      </div>
      <StatTileSkeleton count={4} />
      <TableSkeleton rows={5} columns={4} />
    </div>
  );
}

import { cn } from '@/lib/cn';
import { formatDayGroup, formatDateTime } from '@/lib/format';
import { useBusinessOptional } from '@/stores/BusinessContext';

export interface TimelineEntry {
  id: string;
  timestamp: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  actor?: string | null;
  tone?: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'primary';
  icon?: React.ComponentType<{ className?: string }>;
}

const DOT_TONE = {
  default: 'bg-line-strong',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
  info: 'bg-info',
  primary: 'bg-primary',
} as const;

/** Activity feed grouped by day, with relative headers (docs/08 §17). */
export function Timeline({
  entries,
  className,
}: {
  entries: TimelineEntry[];
  className?: string;
}): React.ReactElement {
  const business = useBusinessOptional();
  const dateFormat = business?.business.dateFormat;

  const groups = entries.reduce<Record<string, TimelineEntry[]>>((acc, entry) => {
    const key = formatDayGroup(entry.timestamp, dateFormat);
    (acc[key] ??= []).push(entry);
    return acc;
  }, {});

  return (
    <div className={cn('space-y-5', className)}>
      {Object.entries(groups).map(([day, items]) => (
        <div key={day}>
          <h4 className="mb-2 text-xs uppercase tracking-wide text-content-muted">{day}</h4>
          <ol className="relative space-y-3 border-l border-line pl-4">
            {items.map((entry) => {
              const Icon = entry.icon;
              return (
                <li key={entry.id} className="relative">
                  <span
                    className={cn(
                      'absolute -left-[21px] top-1.5 flex h-2.5 w-2.5 items-center justify-center rounded-full ring-4 ring-app',
                      DOT_TONE[entry.tone ?? 'default'],
                    )}
                  />
                  <div className="flex items-start gap-2">
                    {Icon && <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-content-muted" />}
                    <div className="min-w-0 flex-1">
                      <p className="text-base text-content">{entry.title}</p>
                      {entry.description && (
                        <p className="mt-0.5 text-sm text-content-secondary">{entry.description}</p>
                      )}
                      <p className="mt-0.5 text-xs font-normal text-content-muted">
                        {formatDateTime(entry.timestamp, dateFormat)}
                        {entry.actor ? ` · ${entry.actor}` : ''}
                      </p>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      ))}
    </div>
  );
}

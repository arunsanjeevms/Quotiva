import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Tooltip } from './Menu';

export interface StatTileProps {
  label: string;
  value: React.ReactNode;
  hint?: string;
  icon?: React.ComponentType<{ className?: string }>;
  /** Percentage change vs the comparison period. */
  delta?: number;
  tone?: 'default' | 'success' | 'warning' | 'danger';
  onClick?: () => void;
  className?: string;
}

const TONE_TEXT = {
  default: 'text-content',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
} as const;

export function StatTile({
  label,
  value,
  hint,
  icon: Icon,
  delta,
  tone = 'default',
  onClick,
  className,
}: StatTileProps): React.ReactElement {
  const Wrapper = onClick ? 'button' : 'div';
  return (
    <Wrapper
      {...(onClick ? { type: 'button' as const, onClick } : {})}
      className={cn(
        'rounded-lg border border-line bg-surface p-4 text-left transition-colors',
        onClick && 'hover:border-line-strong hover:bg-subtle/40',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs uppercase tracking-wide text-content-muted">{label}</p>
        {Icon && <Icon className="h-4 w-4 shrink-0 text-content-muted" />}
      </div>
      <p className={cn('mt-2 truncate text-2xl font-semibold tabular', TONE_TEXT[tone])}>{value}</p>
      <div className="mt-1 flex items-center gap-1.5">
        {delta !== undefined && Number.isFinite(delta) && (
          <Tooltip content="Compared with the previous period">
            <span
              className={cn(
                'inline-flex items-center gap-0.5 text-xs font-medium',
                delta >= 0 ? 'text-success' : 'text-danger',
              )}
            >
              {delta >= 0 ? (
                <ArrowUpRight className="h-3 w-3" />
              ) : (
                <ArrowDownRight className="h-3 w-3" />
              )}
              {Math.abs(delta).toFixed(1)}%
            </span>
          </Tooltip>
        )}
        {hint && <span className="truncate text-xs font-normal text-content-muted">{hint}</span>}
      </div>
    </Wrapper>
  );
}

/** Compact key/value strip used on document and customer detail headers. */
export function SummaryStrip({
  items,
  className,
}: {
  items: { label: string; value: React.ReactNode; tone?: StatTileProps['tone'] }[];
  className?: string;
}): React.ReactElement {
  return (
    <div
      className={cn(
        'grid grid-cols-2 divide-line rounded-lg border border-line bg-surface sm:divide-x lg:grid-cols-4',
        className,
      )}
    >
      {items.map((item) => (
        <div key={item.label} className="px-4 py-3">
          <p className="text-xs uppercase tracking-wide text-content-muted">{item.label}</p>
          <p className={cn('mt-1 truncate text-h2 tabular', TONE_TEXT[item.tone ?? 'default'])}>
            {item.value}
          </p>
        </div>
      ))}
    </div>
  );
}

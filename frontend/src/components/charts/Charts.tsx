import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatMoney, humanize } from '@/lib/format';
import { useCurrency } from '@/stores/BusinessContext';
import { EmptyState } from '@/components/ui/States';
import type { CurrencySettings } from '@/types';

/**
 * Categorical palette: the brand primary leads, then hues chosen to stay
 * distinguishable in light backgrounds and to survive greyscale printing.
 */
export const SERIES_COLORS = [
  'rgb(var(--color-primary))',
  '#0D9488',
  '#B45309',
  '#7C3AED',
  '#BE185D',
  '#475569',
];

const AXIS_STYLE = { fontSize: 11, fill: 'rgb(var(--text-muted))' } as const;
const GRID_COLOR = 'rgb(var(--border))';

function ChartTooltip({
  active,
  payload,
  label,
  currency,
  moneyKeys,
}: {
  active?: boolean;
  payload?: { name?: string; value?: number | string; color?: string; dataKey?: string }[];
  label?: string;
  currency: CurrencySettings;
  moneyKeys?: string[];
}): React.ReactElement | null {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-line bg-surface px-2.5 py-2 shadow-lg">
      {label && <p className="mb-1 text-xs uppercase tracking-wide text-content-muted">{label}</p>}
      {payload.map((entry, i) => {
        const isMoney = !moneyKeys || moneyKeys.includes(String(entry.dataKey));
        return (
          <div key={i} className="flex items-center gap-2 text-sm">
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ background: entry.color }}
              aria-hidden
            />
            <span className="text-content-secondary">{entry.name}</span>
            <span className="ml-auto tabular font-medium text-content">
              {isMoney ? formatMoney(String(entry.value ?? 0), currency) : String(entry.value)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** Compact axis labels: 12,400 → 12.4k, so ticks do not collide. */
function shortNumber(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(value / 1_000).toFixed(0)}k`;
  return String(value);
}

export function RevenueTrendChart({
  data,
}: {
  data: { period: string; invoiced: string; collected: string }[];
}): React.ReactElement {
  const currency = useCurrency();
  if (data.length === 0) {
    return <EmptyState title="No revenue yet" description="Issue an invoice to see the trend." />;
  }
  const rows = data.map((d) => ({
    period: d.period.slice(5),
    Invoiced: Number(d.invoiced),
    Collected: Number(d.collected),
  }));

  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="invoicedFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={SERIES_COLORS[0]} stopOpacity={0.18} />
            <stop offset="100%" stopColor={SERIES_COLORS[0]} stopOpacity={0.01} />
          </linearGradient>
        </defs>
        <XAxis dataKey="period" tick={AXIS_STYLE} tickLine={false} axisLine={{ stroke: GRID_COLOR }} />
        <YAxis
          tick={AXIS_STYLE}
          tickLine={false}
          axisLine={false}
          tickFormatter={shortNumber}
          width={44}
        />
        <Tooltip content={<ChartTooltip currency={currency} />} />
        <Legend
          wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
          iconType="circle"
          iconSize={8}
        />
        <Area
          type="monotone"
          dataKey="Invoiced"
          stroke={SERIES_COLORS[0]}
          strokeWidth={2}
          fill="url(#invoicedFill)"
        />
        <Area
          type="monotone"
          dataKey="Collected"
          stroke={SERIES_COLORS[1]}
          strokeWidth={2}
          fill="transparent"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function StatusDonut({
  data,
  emptyLabel,
}: {
  data: { status: string; count: number; amount: string }[];
  emptyLabel: string;
}): React.ReactElement {
  const currency = useCurrency();
  if (data.length === 0) {
    return <EmptyState title={emptyLabel} className="border-0 py-10" />;
  }
  const rows = data.map((d) => ({ name: humanize(d.status), value: d.count, amount: d.amount }));

  return (
    <ResponsiveContainer width="100%" height={220}>
      <PieChart>
        <Pie
          data={rows}
          dataKey="value"
          nameKey="name"
          innerRadius={52}
          outerRadius={78}
          paddingAngle={2}
          stroke="rgb(var(--bg-surface))"
          strokeWidth={2}
        >
          {rows.map((_, i) => (
            <Cell key={i} fill={SERIES_COLORS[i % SERIES_COLORS.length]} />
          ))}
        </Pie>
        <Tooltip content={<ChartTooltip currency={currency} moneyKeys={[]} />} />
        <Legend
          wrapperStyle={{ fontSize: 12 }}
          iconType="circle"
          iconSize={8}
          layout="horizontal"
          verticalAlign="bottom"
        />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function HorizontalBarChart({
  data,
  emptyLabel,
}: {
  data: { name: string; value: string }[];
  emptyLabel: string;
}): React.ReactElement {
  const currency = useCurrency();
  if (data.length === 0) {
    return <EmptyState title={emptyLabel} className="border-0 py-10" />;
  }
  const rows = data.map((d) => ({ name: d.name, Amount: Number(d.value) }));

  return (
    <ResponsiveContainer width="100%" height={Math.max(180, rows.length * 36)}>
      <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 12, left: 0, bottom: 0 }}>
        <XAxis type="number" tick={AXIS_STYLE} tickLine={false} axisLine={false} tickFormatter={shortNumber} />
        <YAxis
          type="category"
          dataKey="name"
          tick={AXIS_STYLE}
          tickLine={false}
          axisLine={false}
          width={130}
        />
        <Tooltip content={<ChartTooltip currency={currency} />} cursor={{ fill: 'rgb(var(--bg-subtle))' }} />
        <Bar dataKey="Amount" radius={[0, 3, 3, 0]} barSize={16}>
          {rows.map((_, i) => (
            <Cell key={i} fill={SERIES_COLORS[i % SERIES_COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

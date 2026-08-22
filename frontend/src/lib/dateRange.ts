import {
  endOfMonth,
  endOfQuarter,
  endOfWeek,
  endOfYear,
  startOfMonth,
  startOfQuarter,
  startOfWeek,
  startOfYear,
  subDays,
  subMonths,
} from 'date-fns';
import { toISODate } from './format';
import type { DateRangeValue } from '@/components/ui/DatePicker';

/**
 * Turns a DateRangePicker value into the concrete `from`/`to` the API filters on.
 *
 * Every list endpoint filters on explicit dates only — it has no concept of a
 * named preset. The picker emits just `{ preset }` for non-custom presets, so
 * without this resolution the dates were dropped and the chosen period was
 * silently ignored, quietly returning unfiltered data.
 */
export function resolveDateRange(value: DateRangeValue): { from?: string; to?: string } {
  const now = new Date();

  switch (value.preset) {
    case 'today':
      return { from: toISODate(now), to: toISODate(now) };
    case 'yesterday': {
      const day = subDays(now, 1);
      return { from: toISODate(day), to: toISODate(day) };
    }
    case 'this_week':
      return { from: toISODate(startOfWeek(now)), to: toISODate(endOfWeek(now)) };
    case 'this_month':
      return { from: toISODate(startOfMonth(now)), to: toISODate(endOfMonth(now)) };
    case 'last_month': {
      const previous = subMonths(now, 1);
      return { from: toISODate(startOfMonth(previous)), to: toISODate(endOfMonth(previous)) };
    }
    case 'this_quarter':
      return { from: toISODate(startOfQuarter(now)), to: toISODate(endOfQuarter(now)) };
    case 'this_year':
      return { from: toISODate(startOfYear(now)), to: toISODate(endOfYear(now)) };
    case 'custom':
    default:
      return {
        ...(value.from ? { from: value.from } : {}),
        ...(value.to ? { to: value.to } : {}),
      };
  }
}

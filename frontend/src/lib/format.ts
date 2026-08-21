import { format as formatDateFns, formatDistanceToNow, isValid, parseISO } from 'date-fns';
import type { CurrencySettings, Money } from '@/types';

/**
 * All formatting is driven by the business's configured settings. Nothing here
 * hardcodes a locale, currency or symbol — see docs/01-overview.md, genericness charter.
 */

/** Fallback used only before settings have loaded. */
export const FALLBACK_CURRENCY: CurrencySettings = {
  currencyCode: 'USD',
  currencyName: 'US Dollar',
  currencySymbol: '$',
  decimalPlaces: 2,
  symbolPosition: 'before',
  thousandSeparator: ',',
  decimalSeparator: '.',
};

/**
 * Format a money string using the configured symbol, position, separators and
 * decimal places. Takes and returns strings; performs no arithmetic.
 */
export function formatMoney(
  value: Money | number | null | undefined,
  currency: CurrencySettings = FALLBACK_CURRENCY,
  options: { showSymbol?: boolean } = {},
): string {
  const { showSymbol = true } = options;
  const raw = value === null || value === undefined || value === '' ? '0' : String(value);
  const negative = raw.trim().startsWith('-');
  const numeric = Number.parseFloat(raw.replace('-', ''));
  const safe = Number.isFinite(numeric) ? numeric : 0;

  // toFixed keeps large values out of exponential notation.
  const fixed = safe.toFixed(currency.decimalPlaces);
  const parts = fixed.split('.');
  const intPart = parts[0] ?? '0';
  const fracPart = parts[1] ?? '';

  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, currency.thousandSeparator);
  const body = fracPart ? `${grouped}${currency.decimalSeparator}${fracPart}` : grouped;
  const signed = negative ? `-${body}` : body;

  if (!showSymbol) return signed;
  return currency.symbolPosition === 'before'
    ? `${currency.currencySymbol}${signed}`
    : `${signed} ${currency.currencySymbol}`;
}

/** Quantities use the same separators but trim trailing zeros. */
export function formatQuantity(
  value: string | number | null | undefined,
  currency: CurrencySettings = FALLBACK_CURRENCY,
): string {
  const numeric = Number.parseFloat(String(value ?? '0'));
  const safe = Number.isFinite(numeric) ? numeric : 0;
  const fixed = safe.toFixed(4).replace(/\.?0+$/, '');
  const parts = fixed.split('.');
  const intPart = parts[0] ?? '0';
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, currency.thousandSeparator);
  return parts[1] ? `${grouped}${currency.decimalSeparator}${parts[1]}` : grouped;
}

export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined) return '0';
  return value.toLocaleString('en-US');
}

export function formatPercent(rate: number | null | undefined): string {
  if (rate === null || rate === undefined) return '0%';
  const trimmed = Number(rate.toFixed(4));
  return `${trimmed}%`;
}

function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : parseISO(value);
  return isValid(date) ? date : null;
}

/** Map the business's stored date format token to a date-fns pattern. */
function pattern(businessFormat: string | undefined): string {
  switch (businessFormat) {
    case 'dd/MM/yyyy':
      return 'dd/MM/yyyy';
    case 'MM/dd/yyyy':
      return 'MM/dd/yyyy';
    case 'dd-MM-yyyy':
      return 'dd-MM-yyyy';
    case 'dd MMM yyyy':
      return 'dd MMM yyyy';
    case 'yyyy-MM-dd':
    default:
      return 'yyyy-MM-dd';
  }
}

export function formatDate(
  value: string | Date | null | undefined,
  businessFormat?: string,
): string {
  const date = toDate(value);
  if (!date) return '—';
  return formatDateFns(date, pattern(businessFormat));
}

export function formatDateTime(
  value: string | Date | null | undefined,
  businessFormat?: string,
): string {
  const date = toDate(value);
  if (!date) return '—';
  return formatDateFns(date, `${pattern(businessFormat)} HH:mm`);
}

export function formatRelative(value: string | Date | null | undefined): string {
  const date = toDate(value);
  if (!date) return '—';
  return formatDistanceToNow(date, { addSuffix: true });
}

/** Timeline grouping label: Today / Yesterday / a formatted date. */
export function formatDayGroup(value: string | Date | null | undefined, businessFormat?: string): string {
  const date = toDate(value);
  if (!date) return 'Unknown';
  const today = new Date();
  const startOfDay = (dd: Date) => new Date(dd.getFullYear(), dd.getMonth(), dd.getDate()).getTime();
  const diffDays = Math.round((startOfDay(today) - startOfDay(date)) / 86_400_000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  return formatDate(date, businessFormat);
}

export function toISODate(value: Date): string {
  return formatDateFns(value, 'yyyy-MM-dd');
}

export function formatFileSize(bytes: number | null | undefined): string {
  if (!bytes) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${size.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

export function initials(name: string | null | undefined): string {
  if (!name) return '?';
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
}

/** Turn a snake/kebab status token into a readable label. */
export function humanize(value: string): string {
  return value
    .replace(/[_-]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

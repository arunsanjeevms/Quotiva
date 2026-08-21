/** Minimal server-side mirror of frontend/src/lib/format.ts money/date formatting, used only by the PDF renderer. */

export interface CurrencyLike {
  currencySymbol: string;
  decimalPlaces: number;
  symbolPosition: 'before' | 'after';
  thousandSeparator: string;
  decimalSeparator: string;
}

export function formatMoney(value: string | number | null | undefined, currency: CurrencyLike): string {
  const raw = value === null || value === undefined || value === '' ? '0' : String(value);
  const negative = raw.trim().startsWith('-');
  const numeric = Number.parseFloat(raw.replace('-', ''));
  const safe = Number.isFinite(numeric) ? numeric : 0;

  const fixed = safe.toFixed(currency.decimalPlaces);
  const [intPart = '0', fracPart = ''] = fixed.split('.');
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, currency.thousandSeparator);
  const body = fracPart ? `${grouped}${currency.decimalSeparator}${fracPart}` : grouped;
  const signed = negative ? `-${body}` : body;

  return currency.symbolPosition === 'before' ? `${currency.currencySymbol}${signed}` : `${signed} ${currency.currencySymbol}`;
}

export function formatQuantity(value: string | number | null | undefined, currency: CurrencyLike): string {
  const numeric = Number.parseFloat(String(value ?? '0'));
  const safe = Number.isFinite(numeric) ? numeric : 0;
  const fixed = safe.toFixed(4).replace(/\.?0+$/, '');
  const [intPart = '0', fracPart] = fixed.split('.');
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, currency.thousandSeparator);
  return fracPart ? `${grouped}${currency.decimalSeparator}${fracPart}` : grouped;
}

export function formatPercent(rate: number | null | undefined): string {
  if (rate === null || rate === undefined) return '0%';
  return `${Number(rate.toFixed(4))}%`;
}

function pattern(businessFormat: string | undefined): { d: 2 | 1; m: 2 | 1 | 'text'; order: 'dmy' | 'mdy' | 'ymd' } {
  switch (businessFormat) {
    case 'MM/dd/yyyy':
      return { d: 2, m: 2, order: 'mdy' };
    case 'dd-MM-yyyy':
      return { d: 2, m: 2, order: 'dmy' };
    case 'dd MMM yyyy':
      return { d: 2, m: 'text', order: 'dmy' };
    case 'dd/MM/yyyy':
      return { d: 2, m: 2, order: 'dmy' };
    case 'yyyy-MM-dd':
    default:
      return { d: 2, m: 2, order: 'ymd' };
  }
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function formatDate(value: string | null | undefined, businessFormat?: string): string {
  if (!value) return '—';
  const date = new Date(value.length <= 10 ? `${value}T00:00:00Z` : value);
  if (Number.isNaN(date.getTime())) return '—';
  const y = date.getUTCFullYear();
  const mNum = date.getUTCMonth() + 1;
  const day = date.getUTCDate();
  const p = pattern(businessFormat);
  const dd = String(day).padStart(2, '0');
  const mm = p.m === 'text' ? MONTHS[date.getUTCMonth()] : String(mNum).padStart(2, '0');
  const sep = p.order === 'dmy' && businessFormat === 'dd-MM-yyyy' ? '-' : p.m === 'text' ? ' ' : '/';
  if (p.order === 'ymd') return `${y}-${mm}-${dd}`;
  if (p.order === 'mdy') return `${mm}/${dd}/${y}`;
  return `${dd}${sep}${mm}${sep}${y}`;
}

export function escapeHtml(value: string | null | undefined): string {
  if (!value) return '';
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

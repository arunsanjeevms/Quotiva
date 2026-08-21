import Decimal from 'decimal.js';
import type { DiscountType, Money, TaxMode } from '@/types';

Decimal.set({ precision: 34, rounding: Decimal.ROUND_HALF_UP });

/**
 * Display-only mirror of the server calculation engine (docs/06-calculation-engine.md).
 *
 * This exists so the document editor can show live totals before saving. It is NEVER
 * authoritative: the server recalculates every figure and its result replaces whatever
 * was computed here. Do not use these functions to persist anything.
 */

export const ZERO = '0';

export function d(value: Money | number | null | undefined): Decimal {
  if (value === null || value === undefined || value === '') return new Decimal(0);
  try {
    return new Decimal(value);
  } catch {
    return new Decimal(0);
  }
}

/** Round half-up to `places`, returned as a fixed-precision string. */
export function round(value: Decimal, places: number): string {
  return value.toDecimalPlaces(places, Decimal.ROUND_HALF_UP).toFixed(places);
}

export interface ItemCalcInput {
  quantity: string;
  unitPrice: string;
  discountType: DiscountType | null;
  discountValue: string;
  taxRate: number;
}

export interface ItemCalcResult {
  lineSubtotal: string;
  discountAmount: string;
  taxableAmount: string;
  taxAmount: string;
  lineTotal: string;
}

/** Item pipeline: qty x price -> discount -> taxable -> tax -> total. */
export function calculateItem(
  input: ItemCalcInput,
  taxMode: TaxMode,
  decimals: number,
): ItemCalcResult {
  const qty = d(input.quantity);
  const price = d(input.unitPrice);
  const lineSubtotal = qty.times(price);

  let discount = new Decimal(0);
  if (input.discountType === 'percentage') {
    discount = lineSubtotal.times(d(input.discountValue)).dividedBy(100);
  } else if (input.discountType === 'fixed') {
    discount = d(input.discountValue);
  }
  // A discount can never exceed the line, so a line total is never negative.
  if (discount.greaterThan(lineSubtotal)) discount = lineSubtotal;

  const discountAmount = round(discount, decimals);
  const net = lineSubtotal.minus(d(discountAmount));
  const rate = new Decimal(input.taxRate || 0);

  let taxableAmount: string;
  let taxAmount: string;

  if (taxMode === 'inclusive' && rate.greaterThan(0)) {
    // Back the tax out of a tax-inclusive net, then derive the base from the
    // rounded tax so that taxable + tax === net exactly.
    const base = net.dividedBy(rate.dividedBy(100).plus(1));
    taxAmount = round(net.minus(base), decimals);
    taxableAmount = round(net.minus(d(taxAmount)), decimals);
  } else if (taxMode === 'none' || rate.lessThanOrEqualTo(0)) {
    taxableAmount = round(net, decimals);
    taxAmount = round(new Decimal(0), decimals);
  } else {
    taxableAmount = round(net, decimals);
    taxAmount = round(d(taxableAmount).times(rate).dividedBy(100), decimals);
  }

  const lineTotal =
    taxMode === 'inclusive'
      ? round(net, decimals)
      : round(d(taxableAmount).plus(d(taxAmount)), decimals);

  return {
    lineSubtotal: round(lineSubtotal, decimals),
    discountAmount,
    taxableAmount,
    taxAmount,
    lineTotal,
  };
}

export interface DocumentCalcInput {
  items: (ItemCalcInput & { taxName?: string | null })[];
  charges: { amount: string; isTaxable: boolean; taxRate: number }[];
  discountType: DiscountType | null;
  discountValue: string;
  taxMode: TaxMode;
  decimals: number;
}

export interface DocumentCalcResult {
  items: ItemCalcResult[];
  subtotal: string;
  itemDiscountTotal: string;
  documentDiscountAmount: string;
  taxableAmount: string;
  taxTotal: string;
  additionalChargesTotal: string;
  grandTotal: string;
  taxBreakdown: { name: string; rate: number; taxable: string; amount: string }[];
}

/**
 * Document pipeline. A document-level discount is allocated back across items in
 * proportion to their taxable amount, then tax is recomputed on the reduced base —
 * otherwise the tax report would not match the tax actually charged.
 */
export function calculateDocument(input: DocumentCalcInput): DocumentCalcResult {
  const { decimals, taxMode } = input;
  const items = input.items.map((i) => calculateItem(i, taxMode, decimals));

  const subtotal = items.reduce((a, i) => a.plus(d(i.lineSubtotal)), new Decimal(0));
  const itemDiscountTotal = items.reduce((a, i) => a.plus(d(i.discountAmount)), new Decimal(0));
  const itemNetTotal = items.reduce((a, i) => a.plus(d(i.lineTotal)), new Decimal(0));

  let documentDiscount = new Decimal(0);
  if (input.discountType === 'percentage') {
    documentDiscount = itemNetTotal.times(d(input.discountValue)).dividedBy(100);
  } else if (input.discountType === 'fixed') {
    documentDiscount = Decimal.min(d(input.discountValue), itemNetTotal);
  }
  const documentDiscountAmount = round(documentDiscount, decimals);

  // Proportional relief factor applied to each item's taxable base and tax.
  const factor = itemNetTotal.greaterThan(0)
    ? itemNetTotal.minus(d(documentDiscountAmount)).dividedBy(itemNetTotal)
    : new Decimal(1);

  const breakdownMap = new Map<string, { name: string; rate: number; taxable: Decimal; amount: Decimal }>();
  let taxableAmount = new Decimal(0);
  let taxTotal = new Decimal(0);

  items.forEach((calc, idx) => {
    const src = input.items[idx];
    if (!src) return;
    const taxable = d(calc.taxableAmount).times(factor);
    const tax = d(calc.taxAmount).times(factor);
    taxableAmount = taxableAmount.plus(taxable);
    taxTotal = taxTotal.plus(tax);

    if (src.taxRate > 0) {
      const key = `${src.taxName ?? 'Tax'}|${src.taxRate}`;
      const entry = breakdownMap.get(key) ?? {
        name: src.taxName ?? 'Tax',
        rate: src.taxRate,
        taxable: new Decimal(0),
        amount: new Decimal(0),
      };
      entry.taxable = entry.taxable.plus(taxable);
      entry.amount = entry.amount.plus(tax);
      breakdownMap.set(key, entry);
    }
  });

  let chargesTotal = new Decimal(0);
  let chargeTax = new Decimal(0);
  for (const c of input.charges) {
    const amount = d(c.amount);
    chargesTotal = chargesTotal.plus(amount);
    if (c.isTaxable && c.taxRate > 0) {
      chargeTax = chargeTax.plus(amount.times(c.taxRate).dividedBy(100));
    }
  }
  taxTotal = taxTotal.plus(chargeTax);

  const grandTotal = itemNetTotal
    .minus(d(documentDiscountAmount))
    .plus(chargesTotal)
    .plus(chargeTax);

  return {
    items,
    subtotal: round(subtotal, decimals),
    itemDiscountTotal: round(itemDiscountTotal, decimals),
    documentDiscountAmount,
    taxableAmount: round(taxableAmount, decimals),
    taxTotal: round(taxTotal, decimals),
    additionalChargesTotal: round(chargesTotal, decimals),
    grandTotal: round(grandTotal, decimals),
    taxBreakdown: [...breakdownMap.values()].map((b) => ({
      name: b.name,
      rate: b.rate,
      taxable: round(b.taxable, decimals),
      amount: round(b.amount, decimals),
    })),
  };
}

/** Sum a list of money strings without touching floating point. */
export function sumMoney(values: (Money | null | undefined)[], decimals = 2): string {
  return round(values.reduce<Decimal>((a, v) => a.plus(d(v)), new Decimal(0)), decimals);
}

export function subtractMoney(a: Money, b: Money, decimals = 2): string {
  return round(d(a).minus(d(b)), decimals);
}

export function isZero(value: Money | null | undefined): boolean {
  return d(value).isZero();
}

export function isPositive(value: Money | null | undefined): boolean {
  return d(value).greaterThan(0);
}

export function compareMoney(a: Money, b: Money): number {
  return d(a).comparedTo(d(b));
}

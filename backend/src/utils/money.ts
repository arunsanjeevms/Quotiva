import Decimal from 'decimal.js';

Decimal.set({ precision: 34, rounding: Decimal.ROUND_HALF_UP });

/**
 * The server-authoritative calculation engine (docs/06-calculation-engine.md).
 * Client-supplied totals are never trusted — every document create/update
 * recomputes every figure here from quantity, price, discount and tax rate.
 */

export function d(value: string | number | null | undefined): Decimal {
  if (value === null || value === undefined || value === '') return new Decimal(0);
  try {
    return new Decimal(value);
  } catch {
    return new Decimal(0);
  }
}

export function round(value: Decimal, places: number): string {
  return value.toDecimalPlaces(places, Decimal.ROUND_HALF_UP).toFixed(places);
}

export type TaxMode = 'exclusive' | 'inclusive' | 'none';
export type DiscountType = 'percentage' | 'fixed' | null;

export interface ItemCalcInput {
  quantity: string;
  unitPrice: string;
  discountType: DiscountType;
  discountValue: string;
  taxRate: number;
}

export interface ItemCalcResult {
  lineSubtotal: string;
  discountAmount: string;
  taxableAmount: string;
  taxAmount: string;
  lineTotal: string;
  discountCapped: boolean;
}

export function calculateItem(input: ItemCalcInput, taxMode: TaxMode, decimals: number): ItemCalcResult {
  const qty = d(input.quantity);
  const price = d(input.unitPrice);
  const lineSubtotal = qty.times(price);

  let discount = new Decimal(0);
  if (input.discountType === 'percentage') {
    discount = lineSubtotal.times(d(input.discountValue)).dividedBy(100);
  } else if (input.discountType === 'fixed') {
    discount = d(input.discountValue);
  }
  const discountCapped = discount.greaterThan(lineSubtotal);
  if (discountCapped) discount = lineSubtotal;

  const discountAmount = round(discount, decimals);
  const net = lineSubtotal.minus(d(discountAmount));
  const rate = new Decimal(input.taxRate || 0);

  let taxableAmount: string;
  let taxAmount: string;

  if (taxMode === 'inclusive' && rate.greaterThan(0)) {
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
    taxMode === 'inclusive' ? round(net, decimals) : round(d(taxableAmount).plus(d(taxAmount)), decimals);

  return { lineSubtotal: round(lineSubtotal, decimals), discountAmount, taxableAmount, taxAmount, lineTotal, discountCapped };
}

export interface ChargeCalcInput {
  amount: string;
  isTaxable: boolean;
  taxRate: number;
}

export interface DocumentCalcInput {
  items: (ItemCalcInput & { taxName?: string | null })[];
  charges: ChargeCalcInput[];
  discountType: DiscountType;
  discountValue: string;
  taxMode: TaxMode;
  decimals: number;
}

export interface DocumentCalcResult {
  items: ItemCalcResult[];
  charges: { amount: string; taxAmount: string }[];
  subtotal: string;
  itemDiscountTotal: string;
  documentDiscountAmount: string;
  taxableAmount: string;
  taxTotal: string;
  additionalChargesTotal: string;
  grandTotal: string;
  taxBreakdown: { name: string; rate: number; taxable: string; amount: string }[];
  adjustments: string[];
}

/**
 * Document pipeline. A document-level discount is allocated back across items
 * in proportion to their taxable amount, then tax is recomputed on the reduced
 * base — otherwise the tax report would not match tax actually charged.
 */
export function calculateDocument(input: DocumentCalcInput): DocumentCalcResult {
  const { decimals, taxMode } = input;
  const adjustments: string[] = [];
  const items = input.items.map((i, idx) => {
    const r = calculateItem(i, taxMode, decimals);
    if (r.discountCapped) adjustments.push(`Item ${idx + 1}: discount reduced to the line subtotal.`);
    return r;
  });

  const subtotal = items.reduce((a, i) => a.plus(i.lineSubtotal), new Decimal(0));
  const itemDiscountTotal = items.reduce((a, i) => a.plus(i.discountAmount), new Decimal(0));
  const itemNetTotal = items.reduce((a, i) => a.plus(i.lineTotal), new Decimal(0));

  let documentDiscount = new Decimal(0);
  if (input.discountType === 'percentage') {
    documentDiscount = itemNetTotal.times(d(input.discountValue)).dividedBy(100);
  } else if (input.discountType === 'fixed') {
    const raw = d(input.discountValue);
    if (raw.greaterThan(itemNetTotal)) adjustments.push('Document discount reduced to the item total.');
    documentDiscount = Decimal.min(raw, itemNetTotal);
  }
  const documentDiscountAmount = round(documentDiscount, decimals);

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

  const charges = input.charges.map((c) => {
    const amount = d(c.amount);
    const tax = c.isTaxable && c.taxRate > 0 ? amount.times(c.taxRate).dividedBy(100) : new Decimal(0);
    return { amount: round(amount, decimals), taxAmount: round(tax, decimals) };
  });
  const additionalChargesTotal = charges.reduce((a, c) => a.plus(c.amount), new Decimal(0));
  const chargeTax = charges.reduce((a, c) => a.plus(c.taxAmount), new Decimal(0));
  taxTotal = taxTotal.plus(chargeTax);

  const grandTotal = itemNetTotal.minus(d(documentDiscountAmount)).plus(additionalChargesTotal).plus(chargeTax);

  return {
    items,
    charges,
    subtotal: round(subtotal, decimals),
    itemDiscountTotal: round(itemDiscountTotal, decimals),
    documentDiscountAmount,
    taxableAmount: round(taxableAmount, decimals),
    taxTotal: round(taxTotal, decimals),
    additionalChargesTotal: round(additionalChargesTotal, decimals),
    grandTotal: round(grandTotal, decimals),
    taxBreakdown: [...breakdownMap.values()].map((b) => ({
      name: b.name,
      rate: b.rate,
      taxable: round(b.taxable, decimals),
      amount: round(b.amount, decimals),
    })),
    adjustments,
  };
}

export type PaymentState = 'unpaid' | 'partially_paid' | 'paid' | 'overdue';

/** Server-derived payment status (docs/06 §6) — never accepted from a client. */
export function derivePaymentStatus(params: {
  grandTotal: string;
  amountPaid: string;
  dueDate: string | null;
  status: 'draft' | 'sent' | 'viewed' | 'cancelled' | 'void';
  today: string;
}): PaymentState {
  const grand = d(params.grandTotal);
  const paid = d(params.amountPaid);

  let state: PaymentState;
  if (grand.isZero() || paid.greaterThanOrEqualTo(grand)) state = 'paid';
  else if (paid.greaterThan(0)) state = 'partially_paid';
  else state = 'unpaid';

  if (
    state !== 'paid' &&
    params.status !== 'draft' &&
    params.status !== 'cancelled' &&
    params.status !== 'void' &&
    params.dueDate &&
    params.dueDate < params.today
  ) {
    state = 'overdue';
  }
  return state;
}

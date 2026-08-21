import { randomUUID } from 'node:crypto';
import { supabaseAdmin } from '../config/supabase.js';
import { AppError } from '../utils/AppError.js';
import { calculateDocument, type DiscountType, type TaxMode } from '../utils/money.js';

export interface ItemInput {
  id?: string;
  source?: 'catalog' | 'custom';
  productId?: string | null;
  name: string;
  description?: string | null;
  sku?: string | null;
  unitId?: string | null;
  quantity: string | number;
  unitPrice: string | number;
  discountType?: DiscountType;
  discountValue?: string | number;
  taxId?: string | null;
  notes?: string | null;
}

export interface ChargeInput {
  id?: string;
  label: string;
  amount: string | number;
  isTaxable?: boolean;
  taxId?: string | null;
}

/**
 * Re-resolves every price-affecting input against the database and runs the
 * calculation engine — the server never trusts a client-sent tax rate, name,
 * or total (docs/06 §1, docs/46 API security).
 */
export async function buildDocumentRows(
  businessId: string,
  items: ItemInput[],
  charges: ChargeInput[],
  taxMode: TaxMode,
  discountType: DiscountType,
  discountValue: string | number,
  decimals: number,
) {
  if (items.length > 500) {
    throw AppError.validation([{ path: 'items', message: 'A document may contain at most 500 items.' }]);
  }

  const taxIds = [...new Set([...items, ...charges].map((i) => i.taxId).filter(Boolean))] as string[];
  const unitIds = [...new Set(items.map((i) => i.unitId).filter(Boolean))] as string[];

  const [taxRows, unitRows] = await Promise.all([
    taxIds.length
      ? supabaseAdmin.from('taxes').select('id, name, rate').eq('business_id', businessId).in('id', taxIds)
      : Promise.resolve({ data: [], error: null }),
    unitIds.length
      ? supabaseAdmin.from('units').select('id, name').eq('business_id', businessId).in('id', unitIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (taxRows.error || unitRows.error) throw new AppError(500, 'INTERNAL_ERROR', 'Failed to resolve tax/unit references.');

  const taxMap = new Map((taxRows.data ?? []).map((t) => [t['id'] as string, t as { id: string; name: string; rate: number }]));
  const unitMap = new Map((unitRows.data ?? []).map((u) => [u['id'] as string, u as { id: string; name: string }]));

  for (const item of items) {
    if (Number(item.quantity) <= 0) {
      throw AppError.validation([{ path: 'items.quantity', message: 'Quantity must be greater than zero' }]);
    }
    if (Number(item.unitPrice) < 0) {
      throw AppError.validation([{ path: 'items.unitPrice', message: 'Price cannot be negative' }]);
    }
    if (item.discountType === 'percentage' && Number(item.discountValue ?? 0) > 100) {
      throw AppError.validation([{ path: 'items.discountValue', message: 'Percentage discount cannot exceed 100' }]);
    }
  }

  const calc = calculateDocument({
    items: items.map((i) => {
      const tax = i.taxId ? taxMap.get(i.taxId) : undefined;
      return {
        quantity: String(i.quantity),
        unitPrice: String(i.unitPrice),
        discountType: i.discountType ?? null,
        discountValue: String(i.discountValue ?? 0),
        taxRate: tax?.rate ?? 0,
        taxName: tax?.name ?? null,
      };
    }),
    charges: charges.map((c) => {
      const tax = c.taxId ? taxMap.get(c.taxId) : undefined;
      return { amount: String(c.amount), isTaxable: Boolean(c.isTaxable), taxRate: tax?.rate ?? 0 };
    }),
    discountType,
    discountValue: String(discountValue ?? 0),
    taxMode,
    decimals,
  });

  const itemRows = items.map((item, idx) => {
    const calcRow = calc.items[idx]!;
    const tax = item.taxId ? taxMap.get(item.taxId) : undefined;
    const unit = item.unitId ? unitMap.get(item.unitId) : undefined;
    return {
      id: item.id ?? randomUUID(),
      business_id: businessId,
      sort_order: idx,
      source: item.source ?? 'catalog',
      product_id: item.productId ?? null,
      name: item.name,
      description: item.description ?? null,
      sku: item.sku ?? null,
      unit_id: item.unitId ?? null,
      unit_name: unit?.name ?? null,
      quantity: String(item.quantity),
      unit_price: String(item.unitPrice),
      discount_type: item.discountType ?? null,
      discount_value: String(item.discountValue ?? 0),
      discount_amount: calcRow.discountAmount,
      tax_id: item.taxId ?? null,
      tax_name: tax?.name ?? null,
      tax_rate: tax?.rate ?? 0,
      tax_breakdown: [],
      line_subtotal: calcRow.lineSubtotal,
      taxable_amount: calcRow.taxableAmount,
      tax_amount: calcRow.taxAmount,
      line_total: calcRow.lineTotal,
      notes: item.notes ?? null,
    };
  });

  const chargeRows = charges.map((charge, idx) => {
    const calcRow = calc.charges[idx]!;
    const tax = charge.taxId ? taxMap.get(charge.taxId) : undefined;
    return {
      id: charge.id ?? randomUUID(),
      business_id: businessId,
      label: charge.label,
      amount: calcRow.amount,
      is_taxable: Boolean(charge.isTaxable) && Boolean(tax),
      tax_id: charge.taxId ?? null,
      tax_amount: calcRow.taxAmount,
      sort_order: idx,
    };
  });

  return {
    itemRows,
    chargeRows,
    totals: {
      subtotal: calc.subtotal,
      item_discount_total: calc.itemDiscountTotal,
      document_discount_amount: calc.documentDiscountAmount,
      taxable_amount: calc.taxableAmount,
      tax_total: calc.taxTotal,
      additional_charges_total: calc.additionalChargesTotal,
      grand_total: calc.grandTotal,
      tax_breakdown: calc.taxBreakdown,
    },
    adjustments: calc.adjustments,
  };
}

/** Server-side, race-safe allocation via the DB function (docs/03 §5, migration 0003). */
export async function allocateDocumentNumber(businessId: string, documentType: 'quotation' | 'invoice'): Promise<string> {
  const { data, error } = await supabaseAdmin.rpc('allocate_document_number', {
    p_business_id: businessId,
    p_document_type: documentType,
  });
  if (error || !data) throw new AppError(500, 'NUMBER_ALLOCATION_FAILED', 'Could not allocate a document number.');
  return data as string;
}

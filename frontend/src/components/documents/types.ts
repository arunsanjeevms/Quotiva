import type { DiscountType, ItemSource, TaxMode } from '@/types';

/** Form shape shared by the quotation and invoice editors. */

export interface EditorItem {
  key: string;
  source: ItemSource;
  productId: string | null;
  name: string;
  description: string | null;
  sku: string | null;
  unitId: string | null;
  quantity: string;
  unitPrice: string;
  discountType: DiscountType | null;
  discountValue: string;
  taxId: string | null;
  notes: string | null;
  /** Custom items only: also create a catalog record on save. */
  saveToCatalog?: boolean;
  catalogKind?: 'product' | 'service';
}

export interface EditorCharge {
  key: string;
  label: string;
  amount: string;
  isTaxable: boolean;
  taxId: string | null;
}

export interface DocumentFormValues {
  customerId: string;
  issueDate: string;
  /** Quotation: valid until. Invoice: due date. */
  secondaryDate: string | null;
  reference: string | null;
  templateId: string | null;
  taxMode: TaxMode;
  discountType: DiscountType | null;
  discountValue: string;
  items: EditorItem[];
  charges: EditorCharge[];
  customNotes: string | null;
  termsAndConditions: string | null;
  includeNotes: boolean;
  includeTerms: boolean;
  paymentInstructions: string | null;
  internalNotes: string | null;
}

export function newItemKey(): string {
  return crypto.randomUUID();
}

export function emptyItem(overrides: Partial<EditorItem> = {}): EditorItem {
  return {
    key: newItemKey(),
    source: 'catalog',
    productId: null,
    name: '',
    description: null,
    sku: null,
    unitId: null,
    quantity: '1',
    unitPrice: '0',
    discountType: null,
    discountValue: '0',
    taxId: null,
    notes: null,
    ...overrides,
  };
}

export function emptyCharge(): EditorCharge {
  return { key: newItemKey(), label: '', amount: '0', isTaxable: false, taxId: null };
}

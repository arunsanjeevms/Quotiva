import { supabaseAdmin } from '../config/supabase.js';
import { AppError } from '../utils/AppError.js';
import { quotationsRepository } from '../repositories/quotations.repository.js';
import { allocateDocumentNumber, buildDocumentRows, type ChargeInput, type ItemInput } from './documentCalc.service.js';
import { getSettings } from './settings.service.js';
import type { DiscountType, TaxMode } from '../utils/money.js';

export interface QuotationInput {
  customerId: string;
  issueDate?: string;
  validUntil?: string | null;
  reference?: string | null;
  templateId?: string | null;
  taxMode?: TaxMode;
  discountType?: DiscountType;
  discountValue?: string | number;
  items: ItemInput[];
  charges?: ChargeInput[];
  customNotes?: string | null;
  termsAndConditions?: string | null;
  includeNotes?: boolean;
  includeTerms?: boolean;
  paymentInstructions?: string | null;
  internalNotes?: string | null;
}

const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  draft: ['sent', 'cancelled'],
  sent: ['viewed', 'accepted', 'rejected', 'expired', 'cancelled'],
  viewed: ['accepted', 'rejected', 'expired', 'cancelled'],
  accepted: ['converted', 'cancelled'],
  rejected: [],
  expired: ['sent'],
  cancelled: [],
  converted: [],
};

async function assertCustomer(businessId: string, customerId: string): Promise<void> {
  const { data } = await supabaseAdmin.from('customers').select('id').eq('business_id', businessId).eq('id', customerId).maybeSingle();
  if (!data) throw AppError.validation([{ path: 'customerId', message: 'Select a valid customer' }]);
}

export const quotationsService = {
  async list(businessId: string, req: Parameters<typeof quotationsRepository.list>[1]) {
    return quotationsRepository.list(businessId, req);
  },

  async get(businessId: string, id: string) {
    return quotationsRepository.get(businessId, id);
  },

  async create(businessId: string, userId: string, input: QuotationInput) {
    if (!input.customerId) throw AppError.validation([{ path: 'customerId', message: 'Select a customer' }]);
    await assertCustomer(businessId, input.customerId);

    const settings = await getSettings(businessId);
    const taxMode = input.taxMode ?? settings.defaultTaxMode;
    const { itemRows, chargeRows, totals } = await buildDocumentRows(
      businessId, input.items, input.charges ?? [], taxMode, input.discountType ?? null, input.discountValue ?? 0, settings.decimalPlaces,
    );

    const number = await allocateDocumentNumber(businessId, 'quotation');

    const header = {
      business_id: businessId,
      customer_id: input.customerId,
      quotation_number: number,
      status: 'draft',
      issue_date: input.issueDate ?? new Date().toISOString().slice(0, 10),
      valid_until: input.validUntil ?? null,
      currency_code: settings.currencyCode,
      currency_symbol: settings.currencySymbol,
      tax_mode: taxMode,
      discount_type: input.discountType ?? null,
      discount_value: String(input.discountValue ?? 0),
      template_id: input.templateId ?? settings.defaultQuotationTemplateId,
      custom_notes: input.customNotes === undefined ? settings.defaultQuotationNotes : input.customNotes,
      terms_and_conditions: input.termsAndConditions === undefined ? settings.defaultQuotationTerms : input.termsAndConditions,
      include_notes: input.includeNotes ?? settings.includeNotesByDefault,
      include_terms: input.includeTerms ?? settings.includeTermsByDefault,
      payment_instructions: input.paymentInstructions ?? settings.defaultPaymentInstructions,
      internal_notes: input.internalNotes ?? null,
      reference: input.reference ?? null,
      created_by: userId,
      updated_by: userId,
      ...totals,
    };

    const id = await quotationsRepository.insertRows(header, itemRows, chargeRows);
    return quotationsRepository.get(businessId, id);
  },

  async update(businessId: string, id: string, userId: string, input: Partial<QuotationInput>) {
    const existing = await quotationsRepository.getRaw(businessId, id);
    if (existing['status'] === 'converted') {
      throw AppError.conflict('INVALID_STATE_TRANSITION', 'A converted quotation cannot be edited.');
    }
    if (input.customerId) await assertCustomer(businessId, input.customerId);

    const settings = await getSettings(businessId);
    const taxMode = input.taxMode ?? (existing['tax_mode'] as TaxMode);
    const items = input.items ?? [];
    const { itemRows, chargeRows, totals } = await buildDocumentRows(
      businessId, items, input.charges ?? [], taxMode,
      input.discountType !== undefined ? input.discountType : (existing['discount_type'] as DiscountType),
      input.discountValue ?? existing['discount_value'] as string, settings.decimalPlaces,
    );

    const header: Record<string, unknown> = {
      updated_by: userId,
      ...totals,
      ...(input.customerId ? { customer_id: input.customerId } : {}),
      ...(input.issueDate ? { issue_date: input.issueDate } : {}),
      ...('validUntil' in input ? { valid_until: input.validUntil } : {}),
      ...(input.taxMode ? { tax_mode: input.taxMode } : {}),
      ...('discountType' in input ? { discount_type: input.discountType } : {}),
      ...(input.discountValue !== undefined ? { discount_value: String(input.discountValue) } : {}),
      ...(input.templateId !== undefined ? { template_id: input.templateId } : {}),
      ...('customNotes' in input ? { custom_notes: input.customNotes } : {}),
      ...('termsAndConditions' in input ? { terms_and_conditions: input.termsAndConditions } : {}),
      ...('includeNotes' in input ? { include_notes: input.includeNotes } : {}),
      ...('includeTerms' in input ? { include_terms: input.includeTerms } : {}),
      ...(input.paymentInstructions !== undefined ? { payment_instructions: input.paymentInstructions } : {}),
      ...(input.internalNotes !== undefined ? { internal_notes: input.internalNotes } : {}),
      ...(input.reference !== undefined ? { reference: input.reference } : {}),
    };

    await quotationsRepository.replaceRows(businessId, id, header, itemRows, chargeRows);
    return quotationsRepository.get(businessId, id);
  },

  async remove(businessId: string, id: string) {
    const existing = await quotationsRepository.getRaw(businessId, id);
    if (existing['status'] !== 'draft') {
      throw AppError.businessRule('INVALID_STATE_TRANSITION', 'Only draft quotations can be deleted. Cancel it instead.');
    }
    await quotationsRepository.remove(businessId, id);
  },

  async setStatus(businessId: string, id: string, userId: string, status: string) {
    const existing = await quotationsRepository.getRaw(businessId, id);
    const from = existing['status'] as string;
    if (!ALLOWED_TRANSITIONS[from]?.includes(status)) {
      throw AppError.conflict('INVALID_STATE_TRANSITION', `A ${from} quotation cannot move to ${status}.`);
    }
    const patch: Record<string, unknown> = { status, updated_by: userId };
    if (status === 'sent') patch['sent_at'] = new Date().toISOString();
    if (status === 'accepted') patch['accepted_at'] = new Date().toISOString();
    if (status === 'rejected') patch['rejected_at'] = new Date().toISOString();
    if (status === 'cancelled') patch['cancelled_at'] = new Date().toISOString();
    const result = await quotationsRepository.patch(businessId, id, patch);
    await quotationsRepository.recordStatusHistory(businessId, id, from, status, userId);
    return result;
  },

  async cancel(businessId: string, id: string, userId: string, reason?: string) {
    const existing = await quotationsRepository.getRaw(businessId, id);
    const from = existing['status'] as string;
    if (['cancelled', 'converted', 'rejected'].includes(from)) {
      throw AppError.conflict('INVALID_STATE_TRANSITION', `A ${from} quotation cannot be cancelled.`);
    }
    const result = await quotationsRepository.patch(businessId, id, {
      status: 'cancelled', cancelled_at: new Date().toISOString(), updated_by: userId,
    });
    await quotationsRepository.recordStatusHistory(businessId, id, from, 'cancelled', userId, reason);
    return result;
  },

  async convert(businessId: string, id: string, userId: string) {
    const quotation = await quotationsRepository.get(businessId, id);
    if (quotation['status'] === 'converted') {
      throw AppError.conflict('INVALID_STATE_TRANSITION', 'This quotation has already been converted.');
    }
    if (quotation['status'] !== 'accepted') {
      throw AppError.conflict('INVALID_STATE_TRANSITION', 'Only an accepted quotation can be converted to an invoice.');
    }

    const settings = await getSettings(businessId);
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + settings.defaultPaymentTermsDays);

    const number = await allocateDocumentNumber(businessId, 'invoice');
    const items = (quotation['items'] as Record<string, unknown>[]).map((i) => ({
      source: i['source'], productId: i['productId'], name: i['name'], description: i['description'],
      sku: i['sku'], unitId: i['unitId'], quantity: i['quantity'], unitPrice: i['unitPrice'],
      discountType: i['discountType'], discountValue: i['discountValue'], taxId: i['taxId'], notes: i['notes'],
    })) as ItemInput[];
    const charges = (quotation['charges'] as Record<string, unknown>[]).map((c) => ({
      label: c['label'], amount: c['amount'], isTaxable: c['isTaxable'], taxId: c['taxId'],
    })) as ChargeInput[];

    const { itemRows, chargeRows, totals } = await buildDocumentRows(
      businessId, items, charges, quotation['taxMode'] as TaxMode,
      quotation['discountType'] as DiscountType, quotation['discountValue'] as string, settings.decimalPlaces,
    );

    const header = {
      business_id: businessId,
      customer_id: (quotation['customer'] as { id: string }).id,
      quotation_id: id,
      invoice_number: number,
      status: 'draft',
      payment_status: 'unpaid',
      issue_date: new Date().toISOString().slice(0, 10),
      due_date: dueDate.toISOString().slice(0, 10),
      currency_code: quotation['currencyCode'],
      currency_symbol: quotation['currencySymbol'],
      tax_mode: quotation['taxMode'],
      discount_type: quotation['discountType'],
      discount_value: quotation['discountValue'],
      template_id: settings.defaultInvoiceTemplateId,
      // The customer accepted these terms — carry the quotation's snapshot.
      custom_notes: quotation['customNotes'],
      terms_and_conditions: quotation['termsAndConditions'],
      include_notes: quotation['includeNotes'],
      include_terms: quotation['includeTerms'],
      payment_instructions: quotation['paymentInstructions'],
      reference: quotation['reference'],
      amount_paid: '0',
      amount_due: totals.grand_total,
      created_by: userId,
      updated_by: userId,
      ...totals,
    };

    const { invoicesRepository } = await import('../repositories/invoices.repository.js');
    const invoiceId = await invoicesRepository.insertRows(header, itemRows, chargeRows);

    await quotationsRepository.patch(businessId, id, {
      status: 'converted', converted_at: new Date().toISOString(), converted_invoice_id: invoiceId, updated_by: userId,
    });
    await quotationsRepository.recordStatusHistory(businessId, id, 'accepted', 'converted', userId);

    return invoicesRepository.get(businessId, invoiceId);
  },

  async duplicate(businessId: string, id: string, userId: string) {
    const quotation = await quotationsRepository.get(businessId, id);
    return this.create(businessId, userId, {
      customerId: (quotation['customer'] as { id: string }).id,
      taxMode: quotation['taxMode'] as TaxMode,
      discountType: quotation['discountType'] as DiscountType,
      discountValue: quotation['discountValue'] as string,
      items: (quotation['items'] as Record<string, unknown>[]).map((i) => ({
        source: i['source'] as 'catalog' | 'custom', productId: i['productId'] as string | null, name: i['name'] as string,
        description: i['description'] as string | null, sku: i['sku'] as string | null, unitId: i['unitId'] as string | null,
        quantity: i['quantity'] as string, unitPrice: i['unitPrice'] as string, discountType: i['discountType'] as DiscountType,
        discountValue: i['discountValue'] as string, taxId: i['taxId'] as string | null, notes: i['notes'] as string | null,
      })),
      charges: (quotation['charges'] as Record<string, unknown>[]).map((c) => ({
        label: c['label'] as string, amount: c['amount'] as string, isTaxable: c['isTaxable'] as boolean, taxId: c['taxId'] as string | null,
      })),
      customNotes: quotation['customNotes'] as string | null,
      termsAndConditions: quotation['termsAndConditions'] as string | null,
      reference: quotation['reference'] as string | null,
    });
  },
};

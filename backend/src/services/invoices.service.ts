import { supabaseAdmin } from '../config/supabase.js';
import { AppError } from '../utils/AppError.js';
import { invoicesRepository } from '../repositories/invoices.repository.js';
import { allocateDocumentNumber, buildDocumentRows, type ChargeInput, type ItemInput } from './documentCalc.service.js';
import { getSettings } from './settings.service.js';
import { d, derivePaymentStatus, round, type DiscountType, type TaxMode } from '../utils/money.js';

export interface InvoiceInput {
  customerId: string;
  issueDate?: string;
  dueDate?: string | null;
  quotationId?: string | null;
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

async function assertCustomer(businessId: string, customerId: string): Promise<void> {
  const { data } = await supabaseAdmin.from('customers').select('id').eq('business_id', businessId).eq('id', customerId).maybeSingle();
  if (!data) throw AppError.validation([{ path: 'customerId', message: 'Select a valid customer' }]);
}

/**
 * Recomputes amount_paid / amount_due / payment_status from the payments
 * table — the only place these fields are written, so a client can never
 * set payment status directly (docs/06 §6).
 */
export async function refreshInvoiceTotals(businessId: string, invoiceId: string): Promise<void> {
  const [{ data: invoice }, { data: payments }] = await Promise.all([
    supabaseAdmin.from('invoices').select('grand_total, due_date, status').eq('business_id', businessId).eq('id', invoiceId).single(),
    supabaseAdmin.from('payments').select('amount').eq('invoice_id', invoiceId).eq('is_voided', false),
  ]);
  if (!invoice) return;

  const decimals = (await getSettings(businessId)).decimalPlaces;
  const paid = (payments ?? []).reduce((a, p) => a.plus(p['amount'] as string), d('0'));
  const amountPaid = round(paid, decimals);
  const amountDue = round(d(invoice['grand_total'] as string).minus(paid), decimals);
  const today = new Date().toISOString().slice(0, 10);
  const paymentStatus = derivePaymentStatus({
    grandTotal: invoice['grand_total'] as string,
    amountPaid,
    dueDate: invoice['due_date'] as string | null,
    status: invoice['status'] as 'draft' | 'sent' | 'viewed' | 'cancelled' | 'void',
    today,
  });

  await supabaseAdmin
    .from('invoices')
    .update({
      amount_paid: amountPaid,
      amount_due: amountDue,
      payment_status: paymentStatus,
      paid_at: paymentStatus === 'paid' ? new Date().toISOString() : null,
    })
    .eq('business_id', businessId)
    .eq('id', invoiceId);
}

export const invoicesService = {
  async list(businessId: string, req: Parameters<typeof invoicesRepository.list>[1]) {
    return invoicesRepository.list(businessId, req);
  },

  async get(businessId: string, id: string) {
    return invoicesRepository.get(businessId, id);
  },

  async create(businessId: string, userId: string, input: InvoiceInput) {
    if (!input.customerId) throw AppError.validation([{ path: 'customerId', message: 'Select a customer' }]);
    await assertCustomer(businessId, input.customerId);

    const settings = await getSettings(businessId);
    const taxMode = input.taxMode ?? settings.defaultTaxMode;
    const { itemRows, chargeRows, totals } = await buildDocumentRows(
      businessId, input.items, input.charges ?? [], taxMode, input.discountType ?? null, input.discountValue ?? 0, settings.decimalPlaces,
    );

    const number = await allocateDocumentNumber(businessId, 'invoice');
    const issueDate = input.issueDate ?? new Date().toISOString().slice(0, 10);
    let dueDate = input.dueDate ?? null;
    if (!dueDate) {
      const due = new Date(issueDate);
      due.setDate(due.getDate() + settings.defaultPaymentTermsDays);
      dueDate = due.toISOString().slice(0, 10);
    }

    const header = {
      business_id: businessId,
      customer_id: input.customerId,
      quotation_id: input.quotationId ?? null,
      invoice_number: number,
      status: 'draft',
      payment_status: 'unpaid',
      issue_date: issueDate,
      due_date: dueDate,
      currency_code: settings.currencyCode,
      currency_symbol: settings.currencySymbol,
      tax_mode: taxMode,
      discount_type: input.discountType ?? null,
      discount_value: String(input.discountValue ?? 0),
      template_id: input.templateId ?? settings.defaultInvoiceTemplateId,
      custom_notes: input.customNotes === undefined ? settings.defaultInvoiceNotes : input.customNotes,
      terms_and_conditions: input.termsAndConditions === undefined ? settings.defaultInvoiceTerms : input.termsAndConditions,
      include_notes: input.includeNotes ?? settings.includeNotesByDefault,
      include_terms: input.includeTerms ?? settings.includeTermsByDefault,
      payment_instructions: input.paymentInstructions ?? settings.defaultPaymentInstructions,
      internal_notes: input.internalNotes ?? null,
      reference: input.reference ?? null,
      amount_paid: '0',
      amount_due: totals.grand_total,
      created_by: userId,
      updated_by: userId,
      ...totals,
    };

    const id = await invoicesRepository.insertRows(header, itemRows, chargeRows);
    return invoicesRepository.get(businessId, id);
  },

  async update(businessId: string, id: string, userId: string, input: Partial<InvoiceInput>) {
    const existing = await invoicesRepository.getRaw(businessId, id);
    if (['cancelled', 'void'].includes(existing['status'] as string)) {
      throw AppError.conflict('INVALID_STATE_TRANSITION', 'A cancelled or void invoice cannot be edited.');
    }

    if (input.customerId) await assertCustomer(businessId, input.customerId);
    const settings = await getSettings(businessId);
    const taxMode = input.taxMode ?? (existing['tax_mode'] as TaxMode);
    const { itemRows, chargeRows, totals } = await buildDocumentRows(
      businessId, input.items ?? [], input.charges ?? [], taxMode,
      input.discountType !== undefined ? input.discountType : (existing['discount_type'] as DiscountType),
      input.discountValue ?? existing['discount_value'] as string, settings.decimalPlaces,
    );

    if (d(totals.grand_total).lessThan(existing['amount_paid'] as string)) {
      throw AppError.businessRule('VALIDATION_ERROR', 'The new total is less than the amount already paid. Void a payment first.');
    }

    const header: Record<string, unknown> = {
      updated_by: userId,
      amount_due: round(d(totals.grand_total).minus(existing['amount_paid'] as string), settings.decimalPlaces),
      ...totals,
      ...(input.customerId ? { customer_id: input.customerId } : {}),
      ...(input.issueDate ? { issue_date: input.issueDate } : {}),
      ...('dueDate' in input ? { due_date: input.dueDate } : {}),
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

    await invoicesRepository.replaceRows(businessId, id, header, itemRows, chargeRows);
    await refreshInvoiceTotals(businessId, id);
    return invoicesRepository.get(businessId, id);
  },

  async remove(businessId: string, id: string) {
    const existing = await invoicesRepository.getRaw(businessId, id);
    if (existing['status'] !== 'draft') {
      throw AppError.businessRule('INVALID_STATE_TRANSITION', 'Only draft invoices can be deleted. Issued invoices must be cancelled or voided.');
    }
    await invoicesRepository.remove(businessId, id);
  },

  async setStatus(businessId: string, id: string, userId: string, status: string) {
    const existing = await invoicesRepository.getRaw(businessId, id);
    const from = existing['status'] as string;
    const patch: Record<string, unknown> = { status, updated_by: userId };
    if (status === 'sent') patch['sent_at'] = new Date().toISOString();
    const result = await invoicesRepository.patch(businessId, id, patch);
    await invoicesRepository.recordStatusHistory(businessId, id, from, status, userId);
    await refreshInvoiceTotals(businessId, id);
    return invoicesRepository.get(businessId, id).catch(() => result);
  },

  async cancel(businessId: string, id: string, userId: string, reason?: string) {
    const existing = await invoicesRepository.getRaw(businessId, id);
    const from = existing['status'] as string;
    if (['cancelled', 'void'].includes(from)) {
      throw AppError.conflict('INVALID_STATE_TRANSITION', `A ${from} invoice cannot be cancelled.`);
    }
    const result = await invoicesRepository.patch(businessId, id, {
      status: 'cancelled', cancel_reason: reason ?? null, updated_by: userId,
    });
    await invoicesRepository.recordStatusHistory(businessId, id, from, 'cancelled', userId, reason);
    return result;
  },

  async void(businessId: string, id: string, userId: string, reason?: string) {
    const { data: payments } = await supabaseAdmin.from('payments').select('id').eq('invoice_id', id).eq('is_voided', false).limit(1);
    if (payments && payments.length > 0) {
      throw AppError.businessRule('INVALID_STATE_TRANSITION', 'This invoice has recorded payments and cannot be voided. Void the payments first.');
    }
    const existing = await invoicesRepository.getRaw(businessId, id);
    const from = existing['status'] as string;
    const result = await invoicesRepository.patch(businessId, id, {
      status: 'void', cancel_reason: reason ?? null, updated_by: userId,
    });
    await invoicesRepository.recordStatusHistory(businessId, id, from, 'void', userId, reason);
    return result;
  },

  async duplicate(businessId: string, id: string, userId: string) {
    const invoice = await invoicesRepository.get(businessId, id);
    return this.create(businessId, userId, {
      customerId: (invoice['customer'] as { id: string }).id,
      taxMode: invoice['taxMode'] as TaxMode,
      discountType: invoice['discountType'] as DiscountType,
      discountValue: invoice['discountValue'] as string,
      items: (invoice['items'] as Record<string, unknown>[]).map((i) => ({
        source: i['source'] as 'catalog' | 'custom', productId: i['productId'] as string | null, name: i['name'] as string,
        description: i['description'] as string | null, sku: i['sku'] as string | null, unitId: i['unitId'] as string | null,
        quantity: i['quantity'] as string, unitPrice: i['unitPrice'] as string, discountType: i['discountType'] as DiscountType,
        discountValue: i['discountValue'] as string, taxId: i['taxId'] as string | null, notes: i['notes'] as string | null,
      })),
      charges: (invoice['charges'] as Record<string, unknown>[]).map((c) => ({
        label: c['label'] as string, amount: c['amount'] as string, isTaxable: c['isTaxable'] as boolean, taxId: c['taxId'] as string | null,
      })),
      customNotes: invoice['customNotes'] as string | null,
      termsAndConditions: invoice['termsAndConditions'] as string | null,
      reference: invoice['reference'] as string | null,
    });
  },

  async listPayments(businessId: string, id: string) {
    return invoicesRepository.listPayments(businessId, id);
  },
};

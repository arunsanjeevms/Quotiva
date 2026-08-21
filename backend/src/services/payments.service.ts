import { supabaseAdmin } from '../config/supabase.js';
import { AppError } from '../utils/AppError.js';
import { rowToCamel, rowsToCamel } from '../utils/case.js';
import { meta, parseListQuery, rangeFor } from '../utils/pagination.js';
import { d, round } from '../utils/money.js';
import { refreshInvoiceTotals } from './invoices.service.js';
import { getSettings } from './settings.service.js';
import type { Request } from 'express';

export const paymentsService = {
  async list(businessId: string, req: Request) {
    const list = parseListQuery(req);
    let query = supabaseAdmin.from('payments').select('*, invoices(invoice_number), customers(name, company_name)', { count: 'exact' }).eq('business_id', businessId);
    if (list.customerId) query = query.eq('customer_id', list.customerId);
    if (list.from) query = query.gte('payment_date', list.from);
    if (list.to) query = query.lte('payment_date', list.to);
    query = query.order(list.sort === 'amount' ? 'amount' : 'payment_date', { ascending: list.order === 'asc' });
    const [from, to] = rangeFor(list);
    const { data, error, count } = await query.range(from, to);
    if (error) throw new AppError(500, 'INTERNAL_ERROR', error.message);
    return {
      data: (data ?? []).map((row) => {
        const invoice = row['invoices'] as { invoice_number: string } | null;
        const customer = row['customers'] as { name: string; company_name: string | null } | null;
        const { invoices, customers, ...rest } = row;
        void invoices; void customers;
        return {
          ...rowToCamel(rest),
          invoiceNumber: invoice?.invoice_number ?? null,
          customerName: customer?.company_name ?? customer?.name ?? null,
        };
      }),
      meta: meta(list, count ?? 0),
    };
  },

  async create(businessId: string, userId: string, body: Record<string, unknown>) {
    const invoiceId = body['invoiceId'] as string;
    const { data: invoice } = await supabaseAdmin.from('invoices').select('id, customer_id, currency_code, amount_due').eq('business_id', businessId).eq('id', invoiceId).maybeSingle();
    if (!invoice) throw AppError.notFound('Invoice');

    const amount = d(body['amount'] as string);
    if (amount.lessThanOrEqualTo(0)) {
      throw AppError.validation([{ path: 'amount', message: 'Amount must be greater than zero' }]);
    }
    if (amount.greaterThan(invoice['amount_due'] as string)) {
      throw AppError.businessRule('OVERPAYMENT', 'The payment exceeds the outstanding balance.', { outstanding: invoice['amount_due'] });
    }

    let methodName: string | null = null;
    if (body['paymentMethodId']) {
      const { data: method } = await supabaseAdmin.from('payment_methods').select('name, requires_reference').eq('business_id', businessId).eq('id', body['paymentMethodId'] as string).maybeSingle();
      if (method) {
        methodName = method['name'] as string;
        if (method['requires_reference'] && !String(body['referenceNumber'] ?? '').trim()) {
          throw AppError.validation([{ path: 'referenceNumber', message: `${methodName} requires a reference number` }]);
        }
      }
    }

    const decimals = (await getSettings(businessId)).decimalPlaces;
    const { data: payment, error } = await supabaseAdmin
      .from('payments')
      .insert({
        business_id: businessId,
        invoice_id: invoiceId,
        customer_id: invoice['customer_id'],
        amount: round(amount, decimals),
        payment_date: body['paymentDate'] ?? new Date().toISOString().slice(0, 10),
        payment_method_id: body['paymentMethodId'] ?? null,
        payment_method_name: methodName,
        reference_number: body['referenceNumber'] ?? null,
        notes: body['notes'] ?? null,
        currency_code: invoice['currency_code'],
        created_by: userId,
      })
      .select('*')
      .single();
    if (error) throw new AppError(500, 'INTERNAL_ERROR', error.message);

    await refreshInvoiceTotals(businessId, invoiceId);
    return rowToCamel(payment);
  },

  async void(businessId: string, id: string, reason?: string) {
    const { data: payment, error } = await supabaseAdmin
      .from('payments')
      .update({ is_voided: true, voided_at: new Date().toISOString(), void_reason: reason ?? null })
      .eq('business_id', businessId)
      .eq('id', id)
      .select('*')
      .maybeSingle();
    if (error) throw new AppError(500, 'INTERNAL_ERROR', error.message);
    if (!payment) throw AppError.notFound('Payment');
    await refreshInvoiceTotals(businessId, payment['invoice_id'] as string);
    return rowToCamel(payment);
  },

  async listForInvoice(businessId: string, invoiceId: string) {
    const { data, error } = await supabaseAdmin.from('payments').select('*').eq('business_id', businessId).eq('invoice_id', invoiceId).order('payment_date', { ascending: false });
    if (error) throw new AppError(500, 'INTERNAL_ERROR', error.message);
    return rowsToCamel(data ?? []);
  },
};

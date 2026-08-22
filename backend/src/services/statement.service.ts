import { supabaseAdmin } from '../config/supabase.js';
import { AppError } from '../utils/AppError.js';
import { rowToCamel } from '../utils/case.js';
import { d, round } from '../utils/money.js';
import { getSettings } from './settings.service.js';

export interface StatementEntry {
  id: string;
  date: string;
  type: 'invoice' | 'payment' | 'adjustment';
  reference: string;
  description: string;
  debit: string | null;
  credit: string | null;
  balance: string;
}

/**
 * Customer account statement (docs/08 §Statements).
 *
 * Issued invoices are debits (the customer owes them) and non-voided payments
 * are credits. Draft, cancelled and void invoices are excluded — they are not
 * receivables, so including them would misstate the balance. The opening
 * balance is the net of everything before `from`, so a date-ranged statement
 * still reconciles to the customer's true outstanding position.
 */
export async function buildCustomerStatement(
  businessId: string,
  customerId: string,
  range: { from?: string; to?: string },
): Promise<Record<string, unknown>> {
  const { data: customer, error: customerError } = await supabaseAdmin
    .from('customers')
    .select('*')
    .eq('business_id', businessId)
    .eq('id', customerId)
    .maybeSingle();
  if (customerError) throw new AppError(500, 'INTERNAL_ERROR', customerError.message);
  if (!customer) throw AppError.notFound('Customer');

  const decimals = (await getSettings(businessId)).decimalPlaces;

  const [{ data: invoices, error: invoiceError }, { data: payments, error: paymentError }] = await Promise.all([
    supabaseAdmin
      .from('invoices')
      .select('id, invoice_number, issue_date, grand_total, status, reference')
      .eq('business_id', businessId)
      .eq('customer_id', customerId)
      .not('status', 'in', '("draft","cancelled","void")'),
    supabaseAdmin
      .from('payments')
      .select('id, payment_date, amount, reference_number, payment_method_name')
      .eq('business_id', businessId)
      .eq('customer_id', customerId)
      .eq('is_voided', false),
  ]);
  if (invoiceError) throw new AppError(500, 'INTERNAL_ERROR', invoiceError.message);
  if (paymentError) throw new AppError(500, 'INTERNAL_ERROR', paymentError.message);

  type Row = { id: string; date: string; type: 'invoice' | 'payment'; reference: string; description: string; debit: string | null; credit: string | null };

  const rows: Row[] = [
    ...(invoices ?? []).map((i) => ({
      id: `invoice-${i['id'] as string}`,
      date: i['issue_date'] as string,
      type: 'invoice' as const,
      reference: (i['invoice_number'] as string) ?? '',
      description: (i['reference'] as string | null) ? `Invoice — ${i['reference'] as string}` : 'Invoice',
      debit: String(i['grand_total']),
      credit: null,
    })),
    ...(payments ?? []).map((p) => ({
      id: `payment-${p['id'] as string}`,
      date: p['payment_date'] as string,
      type: 'payment' as const,
      reference: (p['reference_number'] as string | null) ?? '',
      description: (p['payment_method_name'] as string | null)
        ? `Payment received — ${p['payment_method_name'] as string}`
        : 'Payment received',
      debit: null,
      credit: String(p['amount']),
    })),
  ].sort((a, b) => (a.date === b.date ? (a.type === 'invoice' ? -1 : 1) : a.date < b.date ? -1 : 1));

  const from = range.from;
  const to = range.to;

  let opening = d('0');
  const entries: StatementEntry[] = [];
  let running = d('0');

  for (const row of rows) {
    const delta = row.debit ? d(row.debit) : d(row.credit).negated();

    if (from && row.date < from) {
      opening = opening.plus(delta);
      running = opening;
      continue;
    }
    if (to && row.date > to) continue;

    running = running.plus(delta);
    entries.push({
      id: row.id,
      date: row.date,
      type: row.type,
      reference: row.reference,
      description: row.description,
      debit: row.debit ? round(d(row.debit), decimals) : null,
      credit: row.credit ? round(d(row.credit), decimals) : null,
      balance: round(running, decimals),
    });
  }

  const firstDate = rows[0]?.date ?? new Date().toISOString().slice(0, 10);
  const lastDate = rows[rows.length - 1]?.date ?? new Date().toISOString().slice(0, 10);

  return {
    customer: rowToCamel(customer),
    from: from ?? firstDate,
    to: to ?? lastDate,
    openingBalance: round(opening, decimals),
    closingBalance: round(running, decimals),
    entries,
  };
}

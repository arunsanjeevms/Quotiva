import { Router } from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { authorize } from '../middleware/resolveTenant.js';
import { quotationsService } from '../services/quotations.service.js';
import { invoicesService } from '../services/invoices.service.js';
import { paymentsService } from '../services/payments.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { AppError } from '../utils/AppError.js';
import { d, round } from '../utils/money.js';

export const reportsRouter = Router();

reportsRouter.get('/invoices', authorize('report.read'), asyncHandler(async (req, res) => {
  res.json(await invoicesService.list(req.tenant!.businessId, req));
}));

reportsRouter.get('/quotations', authorize('report.read'), asyncHandler(async (req, res) => {
  res.json(await quotationsService.list(req.tenant!.businessId, req));
}));

reportsRouter.get('/payments', authorize('report.read'), asyncHandler(async (req, res) => {
  res.json(await paymentsService.list(req.tenant!.businessId, req));
}));

reportsRouter.get('/sales', authorize('report.read'), asyncHandler(async (req, res) => {
  const businessId = req.tenant!.businessId;
  const q = req.query as Record<string, string | undefined>;
  let query = supabaseAdmin.from('invoices').select('grand_total, amount_paid, issue_date').eq('business_id', businessId).not('status', 'in', '("draft","void")');
  if (q['from']) query = query.gte('issue_date', q['from']);
  if (q['to']) query = query.lte('issue_date', q['to']);
  const { data, error } = await query;
  if (error) throw new AppError(500, 'INTERNAL_ERROR', error.message);

  const byPeriod = new Map<string, { count: number; invoiced: ReturnType<typeof d>; paid: ReturnType<typeof d> }>();
  for (const row of data ?? []) {
    const key = (row['issue_date'] as string).slice(0, 7);
    const entry = byPeriod.get(key) ?? { count: 0, invoiced: d('0'), paid: d('0') };
    entry.count += 1;
    entry.invoiced = entry.invoiced.plus(row['grand_total'] as string);
    entry.paid = entry.paid.plus(row['amount_paid'] as string);
    byPeriod.set(key, entry);
  }
  const rows = [...byPeriod.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([period, v]) => ({
      period, invoiceCount: v.count, invoiced: round(v.invoiced, 2), paid: round(v.paid, 2), outstanding: round(v.invoiced.minus(v.paid), 2),
    }));
  res.json({ data: rows, meta: { page: 1, pageSize: rows.length || 1, total: rows.length, totalPages: 1 } });
}));

reportsRouter.get('/taxes', authorize('report.read'), asyncHandler(async (req, res) => {
  const businessId = req.tenant!.businessId;
  const q = req.query as Record<string, string | undefined>;
  let query = supabaseAdmin.from('invoices').select('id, tax_breakdown, issue_date').eq('business_id', businessId).not('status', 'in', '("draft","void","cancelled")');
  if (q['from']) query = query.gte('issue_date', q['from']);
  if (q['to']) query = query.lte('issue_date', q['to']);
  const { data, error } = await query;
  if (error) throw new AppError(500, 'INTERNAL_ERROR', error.message);

  const map = new Map<string, { name: string; rate: number; taxable: ReturnType<typeof d>; tax: ReturnType<typeof d>; docs: Set<string> }>();
  for (const row of data ?? []) {
    const breakdown = (row['tax_breakdown'] as { name: string; rate: number; taxable: string; amount: string }[] | null) ?? [];
    for (const line of breakdown) {
      const key = `${line.name}|${line.rate}`;
      const entry = map.get(key) ?? { name: line.name, rate: line.rate, taxable: d('0'), tax: d('0'), docs: new Set<string>() };
      entry.taxable = entry.taxable.plus(line.taxable);
      entry.tax = entry.tax.plus(line.amount);
      entry.docs.add(row['id'] as string);
      map.set(key, entry);
    }
  }
  const rows = [...map.values()]
    .sort((a, b) => b.rate - a.rate)
    .map((v) => ({ taxName: v.name, rate: v.rate, taxableAmount: round(v.taxable, 2), taxCollected: round(v.tax, 2), documentCount: v.docs.size }));
  res.json({ data: rows, meta: { page: 1, pageSize: rows.length || 1, total: rows.length, totalPages: 1 } });
}));

reportsRouter.get('/customers', authorize('report.read'), asyncHandler(async (req, res) => {
  const businessId = req.tenant!.businessId;
  const { data: customers, error } = await supabaseAdmin.from('customers').select('id, name, company_name').eq('business_id', businessId);
  if (error) throw new AppError(500, 'INTERNAL_ERROR', error.message);

  const { data: invoices } = await supabaseAdmin.from('invoices').select('customer_id, grand_total, amount_paid').eq('business_id', businessId).not('status', 'in', '("cancelled","void")');
  const totals = new Map<string, { count: number; invoiced: ReturnType<typeof d>; paid: ReturnType<typeof d> }>();
  for (const inv of invoices ?? []) {
    const key = inv['customer_id'] as string;
    const entry = totals.get(key) ?? { count: 0, invoiced: d('0'), paid: d('0') };
    entry.count += 1;
    entry.invoiced = entry.invoiced.plus(inv['grand_total'] as string);
    entry.paid = entry.paid.plus(inv['amount_paid'] as string);
    totals.set(key, entry);
  }

  const rows = (customers ?? []).map((c) => {
    const t = totals.get(c['id'] as string) ?? { count: 0, invoiced: d('0'), paid: d('0') };
    return {
      customerId: c['id'], name: c['name'], companyName: c['company_name'],
      invoiceCount: t.count, totalInvoiced: round(t.invoiced, 2), totalPaid: round(t.paid, 2), outstanding: round(t.invoiced.minus(t.paid), 2),
    };
  }).sort((a, b) => Number(b.totalInvoiced) - Number(a.totalInvoiced));

  res.json({ data: rows, meta: { page: 1, pageSize: rows.length || 1, total: rows.length, totalPages: 1 } });
}));

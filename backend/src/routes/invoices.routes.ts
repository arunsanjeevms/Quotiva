import { Router } from 'express';
import { z } from 'zod';
import { authorize } from '../middleware/resolveTenant.js';
import { validate } from '../middleware/validate.js';
import { invoicesService } from '../services/invoices.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { AppError } from '../utils/AppError.js';
import { logAudit } from '../utils/audit.js';

const itemSchema = z.object({
  id: z.string().uuid().optional(),
  source: z.enum(['catalog', 'custom']).optional(),
  productId: z.string().uuid().nullable().optional(),
  name: z.string().min(1).max(500),
  description: z.string().max(2000).nullable().optional(),
  sku: z.string().max(100).nullable().optional(),
  unitId: z.string().uuid().nullable().optional(),
  quantity: z.union([z.string(), z.number()]),
  unitPrice: z.union([z.string(), z.number()]),
  discountType: z.enum(['percentage', 'fixed']).nullable().optional(),
  discountValue: z.union([z.string(), z.number()]).optional(),
  taxId: z.string().uuid().nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

const chargeSchema = z.object({
  id: z.string().uuid().optional(),
  label: z.string().min(1).max(200),
  amount: z.union([z.string(), z.number()]),
  isTaxable: z.boolean().optional(),
  taxId: z.string().uuid().nullable().optional(),
});

const documentBody = z.object({
  customerId: z.string().uuid(),
  issueDate: z.string().optional(),
  dueDate: z.string().nullable().optional(),
  quotationId: z.string().uuid().nullable().optional(),
  reference: z.string().max(200).nullable().optional(),
  templateId: z.string().uuid().nullable().optional(),
  taxMode: z.enum(['exclusive', 'inclusive', 'none']).optional(),
  discountType: z.enum(['percentage', 'fixed']).nullable().optional(),
  discountValue: z.union([z.string(), z.number()]).optional(),
  items: z.array(itemSchema).max(500),
  charges: z.array(chargeSchema).max(50).optional(),
  customNotes: z.string().max(20000).nullable().optional(),
  termsAndConditions: z.string().max(50000).nullable().optional(),
  includeNotes: z.boolean().optional(),
  includeTerms: z.boolean().optional(),
  paymentInstructions: z.string().max(2000).nullable().optional(),
  internalNotes: z.string().max(2000).nullable().optional(),
});

const statusBody = z.object({ status: z.string(), note: z.string().max(500).optional() });
const reasonBody = z.object({ reason: z.string().max(500).optional() });

export const invoicesRouter = Router();

invoicesRouter.get('/', authorize('invoice.read'), asyncHandler(async (req, res) => {
  res.json(await invoicesService.list(req.tenant!.businessId, req));
}));

invoicesRouter.get('/:id', authorize('invoice.read'), asyncHandler(async (req, res) => {
  res.json({ data: await invoicesService.get(req.tenant!.businessId, req.params['id']!) });
}));

invoicesRouter.post('/', authorize('invoice.create'), validate({ body: documentBody }), asyncHandler(async (req, res) => {
  const data = await invoicesService.create(req.tenant!.businessId, req.user!.id, req.body);
  void logAudit({ businessId: req.tenant!.businessId, userId: req.user!.id, userEmail: req.user!.email, action: 'invoice.created', entityType: 'invoice', entityId: (data as { id: string }).id, entityLabel: (data as Record<string, unknown>)['invoiceNumber'] as string });
  res.status(201).json({ data });
}));

invoicesRouter.put('/:id', authorize('invoice.update'), validate({ body: documentBody.partial() }), asyncHandler(async (req, res) => {
  const data = await invoicesService.update(req.tenant!.businessId, req.params['id']!, req.user!.id, req.body);
  void logAudit({ businessId: req.tenant!.businessId, userId: req.user!.id, userEmail: req.user!.email, action: 'invoice.updated', entityType: 'invoice', entityId: req.params['id']! });
  res.json({ data });
}));

invoicesRouter.delete('/:id', authorize('invoice.delete'), asyncHandler(async (req, res) => {
  await invoicesService.remove(req.tenant!.businessId, req.params['id']!);
  res.status(204).send();
}));

invoicesRouter.post('/:id/status', authorize('invoice.update'), validate({ body: statusBody }), asyncHandler(async (req, res) => {
  const data = await invoicesService.setStatus(req.tenant!.businessId, req.params['id']!, req.user!.id, req.body.status);
  res.json({ data });
}));

invoicesRouter.post('/:id/send', authorize('invoice.send'), asyncHandler(async () => {
  throw AppError.businessRule('EMAIL_NOT_CONFIGURED', 'Email is not configured for this business. Add SMTP settings on the backend, then enable email in Settings.');
}));

invoicesRouter.post('/:id/cancel', authorize('invoice.cancel'), validate({ body: reasonBody }), asyncHandler(async (req, res) => {
  const data = await invoicesService.cancel(req.tenant!.businessId, req.params['id']!, req.user!.id, req.body.reason);
  res.json({ data });
}));

invoicesRouter.post('/:id/void', authorize('invoice.void'), validate({ body: reasonBody }), asyncHandler(async (req, res) => {
  const data = await invoicesService.void(req.tenant!.businessId, req.params['id']!, req.user!.id, req.body.reason);
  res.json({ data });
}));

invoicesRouter.post('/:id/duplicate', authorize('invoice.create'), asyncHandler(async (req, res) => {
  const data = await invoicesService.duplicate(req.tenant!.businessId, req.params['id']!, req.user!.id);
  res.status(201).json({ data });
}));

invoicesRouter.get('/:id/payments', authorize('payment.read'), asyncHandler(async (req, res) => {
  const data = await invoicesService.listPayments(req.tenant!.businessId, req.params['id']!);
  res.json({ data, meta: { page: 1, pageSize: data.length, total: data.length, totalPages: 1 } });
}));

invoicesRouter.get('/:id/whatsapp', authorize('invoice.read'), asyncHandler(async (req, res) => {
  const invoice = (await invoicesService.get(req.tenant!.businessId, req.params['id']!)) as Record<string, unknown>;
  const customer = invoice['customer'] as { name: string; phone: string | null };
  const symbol = invoice['currencySymbol'] as string;
  const amount = `${symbol}${Number(invoice['amountDue']).toFixed(2)}`;
  const message = [
    `Hello ${customer.name},`, '', `Please find invoice ${invoice['invoiceNumber']}.`, '',
    `Amount: ${amount}`, ...(invoice['dueDate'] ? [`Due Date: ${invoice['dueDate']}`] : []), '', 'Thank you,',
  ].join('\n');
  const phone = (customer.phone ?? '').replace(/\D/g, '');
  res.json({ data: { url: `https://wa.me/${phone}?text=${encodeURIComponent(message)}`, message } });
}));

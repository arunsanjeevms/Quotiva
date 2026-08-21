import { Router } from 'express';
import { z } from 'zod';
import { authorize } from '../middleware/resolveTenant.js';
import { validate } from '../middleware/validate.js';
import { quotationsService } from '../services/quotations.service.js';
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
  saveToCatalog: z.boolean().optional(),
  catalogKind: z.enum(['product', 'service']).optional(),
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
  validUntil: z.string().nullable().optional(),
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

export const quotationsRouter = Router();

quotationsRouter.get('/', authorize('quotation.read'), asyncHandler(async (req, res) => {
  res.json(await quotationsService.list(req.tenant!.businessId, req));
}));

quotationsRouter.get('/:id', authorize('quotation.read'), asyncHandler(async (req, res) => {
  res.json({ data: await quotationsService.get(req.tenant!.businessId, req.params['id']!) });
}));

quotationsRouter.post('/', authorize('quotation.create'), validate({ body: documentBody }), asyncHandler(async (req, res) => {
  const data = await quotationsService.create(req.tenant!.businessId, req.user!.id, req.body);
  void logAudit({ businessId: req.tenant!.businessId, userId: req.user!.id, userEmail: req.user!.email, action: 'quotation.created', entityType: 'quotation', entityId: (data as { id: string }).id, entityLabel: (data as Record<string, unknown>)['quotationNumber'] as string });
  res.status(201).json({ data });
}));

quotationsRouter.put('/:id', authorize('quotation.update'), validate({ body: documentBody.partial() }), asyncHandler(async (req, res) => {
  const data = await quotationsService.update(req.tenant!.businessId, req.params['id']!, req.user!.id, req.body);
  void logAudit({ businessId: req.tenant!.businessId, userId: req.user!.id, userEmail: req.user!.email, action: 'quotation.updated', entityType: 'quotation', entityId: req.params['id']! });
  res.json({ data });
}));

quotationsRouter.delete('/:id', authorize('quotation.delete'), asyncHandler(async (req, res) => {
  await quotationsService.remove(req.tenant!.businessId, req.params['id']!);
  res.status(204).send();
}));

quotationsRouter.post('/:id/status', authorize('quotation.update'), validate({ body: statusBody }), asyncHandler(async (req, res) => {
  const data = await quotationsService.setStatus(req.tenant!.businessId, req.params['id']!, req.user!.id, req.body.status);
  res.json({ data });
}));

quotationsRouter.post('/:id/send', authorize('quotation.send'), asyncHandler(async () => {
  throw AppError.businessRule('EMAIL_NOT_CONFIGURED', 'Email is not configured for this business. Add SMTP settings on the backend, then enable email in Settings.');
}));

quotationsRouter.post('/:id/convert', authorize('quotation.convert'), asyncHandler(async (req, res) => {
  const data = await quotationsService.convert(req.tenant!.businessId, req.params['id']!, req.user!.id);
  void logAudit({ businessId: req.tenant!.businessId, userId: req.user!.id, userEmail: req.user!.email, action: 'quotation.converted', entityType: 'quotation', entityId: req.params['id']! });
  res.status(201).json({ data });
}));

quotationsRouter.post('/:id/cancel', authorize('quotation.cancel'), validate({ body: reasonBody }), asyncHandler(async (req, res) => {
  const data = await quotationsService.cancel(req.tenant!.businessId, req.params['id']!, req.user!.id, req.body.reason);
  res.json({ data });
}));

quotationsRouter.post('/:id/duplicate', authorize('quotation.create'), asyncHandler(async (req, res) => {
  const data = await quotationsService.duplicate(req.tenant!.businessId, req.params['id']!, req.user!.id);
  res.status(201).json({ data });
}));

quotationsRouter.get('/:id/whatsapp', authorize('quotation.read'), asyncHandler(async (req, res) => {
  const quotation = (await quotationsService.get(req.tenant!.businessId, req.params['id']!)) as Record<string, unknown>;
  const customer = quotation['customer'] as { name: string; phone: string | null };
  const symbol = quotation['currencySymbol'] as string;
  const amount = `${symbol}${Number(quotation['grandTotal']).toFixed(2)}`;
  const message = [
    `Hello ${customer.name},`, '', `Please find quotation ${quotation['quotationNumber']}.`, '',
    `Total: ${amount}`, '', 'Thank you,',
  ].join('\n');
  const phone = (customer.phone ?? '').replace(/\D/g, '');
  res.json({ data: { url: `https://wa.me/${phone}?text=${encodeURIComponent(message)}`, message } });
}));

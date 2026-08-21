import { Router } from 'express';
import { z } from 'zod';
import { authorize } from '../middleware/resolveTenant.js';
import { validate } from '../middleware/validate.js';
import { customersRepository } from '../repositories/customers.repository.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { logAudit } from '../utils/audit.js';

const customerBody = z.object({
  code: z.string().max(50).nullable().optional(),
  name: z.string().min(1).max(300),
  companyName: z.string().max(300).nullable().optional(),
  email: z.string().email().nullable().optional().or(z.literal('')),
  phone: z.string().max(50).nullable().optional(),
  altPhone: z.string().max(50).nullable().optional(),
  website: z.string().max(300).nullable().optional(),
  addressLine1: z.string().max(300).nullable().optional(),
  addressLine2: z.string().max(300).nullable().optional(),
  city: z.string().max(100).nullable().optional(),
  state: z.string().max(100).nullable().optional(),
  country: z.string().max(100).nullable().optional(),
  postalCode: z.string().max(30).nullable().optional(),
  taxId: z.string().max(60).nullable().optional(),
  currencyCode: z.string().max(3).nullable().optional(),
  paymentTermsDays: z.number().int().min(0).max(365).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

export const customersRouter = Router();

customersRouter.get('/', authorize('customer.read'), asyncHandler(async (req, res) => {
  res.json(await customersRepository.list(req.tenant!.businessId, req));
}));

customersRouter.get('/:id', authorize('customer.read'), asyncHandler(async (req, res) => {
  res.json({ data: await customersRepository.get(req.tenant!.businessId, req.params['id']!) });
}));

customersRouter.post('/', authorize('customer.create'), validate({ body: customerBody }), asyncHandler(async (req, res) => {
  const data = await customersRepository.create(req.tenant!.businessId, req.user!.id, req.body);
  void logAudit({
    businessId: req.tenant!.businessId, userId: req.user!.id, userEmail: req.user!.email,
    action: 'customer.created', entityType: 'customer', entityId: (data as { id: string }).id,
    entityLabel: String((data as Record<string, unknown>)['companyName'] ?? (data as Record<string, unknown>)['name']),
  });
  res.status(201).json({ data });
}));

customersRouter.put('/:id', authorize('customer.update'), validate({ body: customerBody.partial() }), asyncHandler(async (req, res) => {
  const data = await customersRepository.update(req.tenant!.businessId, req.params['id']!, req.body);
  void logAudit({ businessId: req.tenant!.businessId, userId: req.user!.id, userEmail: req.user!.email, action: 'customer.updated', entityType: 'customer', entityId: req.params['id']! });
  res.json({ data });
}));

customersRouter.delete('/:id', authorize('customer.delete'), asyncHandler(async (req, res) => {
  await customersRepository.remove(req.tenant!.businessId, req.params['id']!);
  res.status(204).send();
}));

customersRouter.post('/:id/archive', authorize('customer.update'), asyncHandler(async (req, res) => {
  res.json({ data: await customersRepository.archive(req.tenant!.businessId, req.params['id']!) });
}));

customersRouter.post('/:id/restore', authorize('customer.update'), asyncHandler(async (req, res) => {
  res.json({ data: await customersRepository.restore(req.tenant!.businessId, req.params['id']!) });
}));

customersRouter.get('/:id/quotations', authorize('customer.read'), asyncHandler(async (req, res) => {
  res.json(await customersRepository.listQuotations(req.tenant!.businessId, req.params['id']!, req));
}));

customersRouter.get('/:id/invoices', authorize('customer.read'), asyncHandler(async (req, res) => {
  res.json(await customersRepository.listInvoices(req.tenant!.businessId, req.params['id']!, req));
}));

customersRouter.get('/:id/payments', authorize('customer.read'), asyncHandler(async (req, res) => {
  res.json(await customersRepository.listPayments(req.tenant!.businessId, req.params['id']!, req));
}));

customersRouter.get('/:id/activity', authorize('customer.read'), asyncHandler(async (req, res) => {
  res.json(await customersRepository.activity(req.tenant!.businessId, req.params['id']!));
}));

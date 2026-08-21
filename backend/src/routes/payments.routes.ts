import { Router } from 'express';
import { z } from 'zod';
import { authorize } from '../middleware/resolveTenant.js';
import { validate } from '../middleware/validate.js';
import { paymentsService } from '../services/payments.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { logAudit } from '../utils/audit.js';

const paymentBody = z.object({
  invoiceId: z.string().uuid(),
  amount: z.union([z.string(), z.number()]),
  paymentDate: z.string().optional(),
  paymentMethodId: z.string().uuid().nullable().optional(),
  referenceNumber: z.string().max(200).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

const voidBody = z.object({ reason: z.string().max(500).optional() });

export const paymentsRouter = Router();

paymentsRouter.get('/', authorize('payment.read'), asyncHandler(async (req, res) => {
  res.json(await paymentsService.list(req.tenant!.businessId, req));
}));

paymentsRouter.post('/', authorize('payment.create'), validate({ body: paymentBody }), asyncHandler(async (req, res) => {
  const data = await paymentsService.create(req.tenant!.businessId, req.user!.id, req.body);
  void logAudit({ businessId: req.tenant!.businessId, userId: req.user!.id, userEmail: req.user!.email, action: 'payment.created', entityType: 'payment', entityId: (data as { id: string }).id });
  res.status(201).json({ data });
}));

paymentsRouter.post('/:id/void', authorize('payment.void'), validate({ body: voidBody }), asyncHandler(async (req, res) => {
  const data = await paymentsService.void(req.tenant!.businessId, req.params['id']!, req.body.reason);
  void logAudit({ businessId: req.tenant!.businessId, userId: req.user!.id, userEmail: req.user!.email, action: 'payment.voided', entityType: 'payment', entityId: req.params['id']! });
  res.json({ data });
}));

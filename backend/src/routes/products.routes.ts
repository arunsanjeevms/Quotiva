import { Router } from 'express';
import { z } from 'zod';
import { authorize } from '../middleware/resolveTenant.js';
import { validate } from '../middleware/validate.js';
import { productsRepository } from '../repositories/products.repository.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { logAudit } from '../utils/audit.js';

const productBody = z.object({
  kind: z.enum(['product', 'service']).optional(),
  name: z.string().min(1).max(300),
  sku: z.string().max(100).nullable().optional(),
  description: z.string().max(2000).nullable().optional(),
  categoryId: z.string().uuid().nullable().optional(),
  unitId: z.string().uuid().nullable().optional(),
  costPrice: z.union([z.string(), z.number()]).nullable().optional(),
  sellingPrice: z.union([z.string(), z.number()]),
  taxId: z.string().uuid().nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  isActive: z.boolean().optional(),
});

export const productsRouter = Router();

productsRouter.get('/', authorize('product.read'), asyncHandler(async (req, res) => {
  res.json(await productsRepository.list(req.tenant!.businessId, req));
}));

productsRouter.get('/:id', authorize('product.read'), asyncHandler(async (req, res) => {
  res.json({ data: await productsRepository.get(req.tenant!.businessId, req.params['id']!) });
}));

productsRouter.post('/', authorize('product.create'), validate({ body: productBody }), asyncHandler(async (req, res) => {
  const data = await productsRepository.create(req.tenant!.businessId, req.user!.id, req.body);
  void logAudit({ businessId: req.tenant!.businessId, userId: req.user!.id, userEmail: req.user!.email, action: 'product.created', entityType: 'product', entityId: (data as { id: string }).id, entityLabel: String((data as Record<string, unknown>)['name']) });
  res.status(201).json({ data });
}));

productsRouter.put('/:id', authorize('product.update'), validate({ body: productBody.partial() }), asyncHandler(async (req, res) => {
  const data = await productsRepository.update(req.tenant!.businessId, req.params['id']!, req.body);
  void logAudit({ businessId: req.tenant!.businessId, userId: req.user!.id, userEmail: req.user!.email, action: 'product.updated', entityType: 'product', entityId: req.params['id']! });
  res.json({ data });
}));

productsRouter.post('/:id/archive', authorize('product.update'), asyncHandler(async (req, res) => {
  res.json({ data: await productsRepository.archive(req.tenant!.businessId, req.params['id']!) });
}));

productsRouter.post('/:id/restore', authorize('product.update'), asyncHandler(async (req, res) => {
  res.json({ data: await productsRepository.restore(req.tenant!.businessId, req.params['id']!) });
}));

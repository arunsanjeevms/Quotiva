import { Router } from 'express';
import type { ZodSchema } from 'zod';
import { authorize } from '../middleware/resolveTenant.js';
import { validate } from '../middleware/validate.js';
import { simpleCrud, type SimpleCrudOptions } from '../repositories/simpleCrud.js';
import { logAudit } from '../utils/audit.js';
import { asyncHandler } from '../utils/asyncHandler.js';

/**
 * Wires a `simpleCrud` repository into the six standard endpoints:
 * list/get/create/update/delete/archive/restore, each gated by the module's
 * permission keys (docs/05 API spec, catalog/tax/settings resources).
 */
export function simpleCrudRouter(
  options: SimpleCrudOptions & { permissionModule: string; createSchema: ZodSchema; updateSchema: ZodSchema },
): Router {
  const repo = simpleCrud(options);
  const router = Router();
  const perm = (action: string) => `${options.permissionModule}.${action}`;

  router.get('/', authorize(perm('read')), asyncHandler(async (req, res) => {
    const result = await repo.list(req.tenant!.businessId, req);
    res.json(result);
  }));

  router.get('/:id', authorize(perm('read')), asyncHandler(async (req, res) => {
    const data = await repo.get(req.tenant!.businessId, req.params['id']!);
    res.json({ data });
  }));

  router.post('/', authorize(perm('create')), validate({ body: options.createSchema }), asyncHandler(async (req, res) => {
    const data = await repo.create(req.tenant!.businessId, req.user!.id, req.body);
    void logAudit({
      businessId: req.tenant!.businessId,
      userId: req.user!.id,
      userEmail: req.user!.email,
      action: `${options.permissionModule}.created`,
      entityType: options.permissionModule,
      entityId: (data as Record<string, unknown>)['id'] as string,
      entityLabel: String((data as Record<string, unknown>)['name'] ?? ''),
    });
    res.status(201).json({ data });
  }));

  router.put('/:id', authorize(perm('update')), validate({ body: options.updateSchema }), asyncHandler(async (req, res) => {
    const data = await repo.update(req.tenant!.businessId, req.params['id']!, req.body);
    void logAudit({
      businessId: req.tenant!.businessId,
      userId: req.user!.id,
      userEmail: req.user!.email,
      action: `${options.permissionModule}.updated`,
      entityType: options.permissionModule,
      entityId: req.params['id']!,
    });
    res.json({ data });
  }));

  router.delete('/:id', authorize(perm('delete')), asyncHandler(async (req, res) => {
    await repo.remove(req.tenant!.businessId, req.params['id']!);
    res.status(204).send();
  }));

  router.post('/:id/archive', authorize(perm('update')), asyncHandler(async (req, res) => {
    const data = await repo.archive(req.tenant!.businessId, req.params['id']!);
    res.json({ data });
  }));

  router.post('/:id/restore', authorize(perm('update')), asyncHandler(async (req, res) => {
    const data = await repo.restore(req.tenant!.businessId, req.params['id']!);
    res.json({ data });
  }));

  return router;
}

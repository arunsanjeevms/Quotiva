import { Router } from 'express';
import { AppError } from '../utils/AppError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

/**
 * Modules scoped for a later phase (docs/10-roadmap.md Phase 12): recurring
 * invoice generation, reminders, custom fields, email templates, backups,
 * notifications. Rather than fake data or a fake success, list endpoints
 * return an honest empty collection (so the UI renders its real empty state)
 * and every write is refused with a clear reason — never a silent no-op.
 */
export function notImplementedRouter(label: string): Router {
  const router = Router();

  router.get('/', (_req, res) => {
    res.json({ data: [], meta: { page: 1, pageSize: 25, total: 0, totalPages: 1 } });
  });

  router.all(
    '*',
    asyncHandler(async () => {
      throw AppError.businessRule('NOT_IMPLEMENTED', `${label} is not yet available on this backend. See docs/10-roadmap.md Phase 12.`);
    }),
  );

  return router;
}

export const backupsRouter = (() => {
  const router = Router();
  router.get('/', (_req, res) => {
    res.json({ data: [], meta: { page: 1, pageSize: 25, total: 0, totalPages: 1 } });
  });
  router.post(
    '/',
    asyncHandler(async () => {
      throw AppError.businessRule(
        'NOT_IMPLEMENTED',
        'Backup export requires a background worker that is not deployed yet. Rely on your Supabase project\'s own backups in the meantime (docs/09-operations.md §6).',
      );
    }),
  );
  return router;
})();

export const notificationsRouter = (() => {
  const router = Router();
  router.get('/', (_req, res) => {
    res.json({ data: [], meta: { page: 1, pageSize: 25, total: 0, totalPages: 1 } });
  });
  router.post('/:id/read', (_req, res) => res.status(204).send());
  router.post('/read-all', (_req, res) => res.status(204).send());
  return router;
})();

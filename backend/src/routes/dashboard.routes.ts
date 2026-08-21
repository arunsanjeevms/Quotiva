import { Router } from 'express';
import { authorize } from '../middleware/resolveTenant.js';
import { getDashboard } from '../services/dashboard.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const dashboardRouter = Router();

dashboardRouter.get('/', authorize('dashboard.read'), asyncHandler(async (req, res) => {
  const range = (req.query['range'] as string | undefined) ?? 'this_month';
  res.json({ data: await getDashboard(req.tenant!.businessId, range) });
}));

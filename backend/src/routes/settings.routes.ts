import { Router } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../config/supabase.js';
import { authorize } from '../middleware/resolveTenant.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { AppError } from '../utils/AppError.js';
import { bodyToSnake, rowToCamel, rowsToCamel } from '../utils/case.js';
import { getBranding, getBusiness, getSettings, updateBranding, updateBusiness, updateSettings } from '../services/settings.service.js';

export const settingsRouter = Router();

settingsRouter.get('/', authorize('settings.read'), asyncHandler(async (req, res) => {
  res.json({ data: await getSettings(req.tenant!.businessId) });
}));
settingsRouter.put('/', authorize('settings.update'), asyncHandler(async (req, res) => {
  res.json({ data: await updateSettings(req.tenant!.businessId, req.body) });
}));

settingsRouter.get('/business', authorize('settings.read'), asyncHandler(async (req, res) => {
  res.json({ data: await getBusiness(req.tenant!.businessId) });
}));
settingsRouter.put('/business', authorize('business.update'), asyncHandler(async (req, res) => {
  res.json({ data: await updateBusiness(req.tenant!.businessId, req.body) });
}));

settingsRouter.get('/branding', authorize('settings.read'), asyncHandler(async (req, res) => {
  res.json({ data: await getBranding(req.tenant!.businessId) });
}));
settingsRouter.put('/branding', authorize('settings.update'), asyncHandler(async (req, res) => {
  res.json({ data: await updateBranding(req.tenant!.businessId, req.body) });
}));

/* ------------------------------- Numbering -------------------------------- */

const numberingSchema = z.object({
  prefix: z.string().max(20).optional(),
  suffix: z.string().max(20).optional(),
  separator: z.string().max(3).optional(),
  padding: z.number().int().min(1).max(12).optional(),
  startNumber: z.number().int().min(0).optional(),
  includeYear: z.boolean().optional(),
  includeMonth: z.boolean().optional(),
  yearFormat: z.enum(['yyyy', 'yy']).optional(),
  resetFrequency: z.enum(['never', 'yearly', 'monthly', 'daily']).optional(),
});

settingsRouter.get('/numbering', authorize('settings.read'), asyncHandler(async (req, res) => {
  const { data, error } = await supabaseAdmin.from('numbering_settings').select('*').eq('business_id', req.tenant!.businessId).order('document_type');
  if (error) throw new AppError(500, 'INTERNAL_ERROR', error.message);
  const rows = rowsToCamel<Record<string, unknown>>(data ?? []).map((row) => ({ ...row, nextNumberPreview: preview(row) }));
  res.json({ data: rows, meta: { page: 1, pageSize: rows.length, total: rows.length, totalPages: 1 } });
}));

settingsRouter.put('/numbering/:id', authorize('settings.update'), validate({ body: numberingSchema }), asyncHandler(async (req, res) => {
  const payload = bodyToSnake(req.body);
  const { data, error } = await supabaseAdmin
    .from('numbering_settings')
    .update(payload)
    .eq('business_id', req.tenant!.businessId)
    .eq('id', req.params['id']!)
    .select('*')
    .maybeSingle();
  if (error) throw new AppError(500, 'INTERNAL_ERROR', error.message);
  if (!data) throw AppError.notFound('Numbering settings');
  const row = rowToCamel<Record<string, unknown>>(data);
  res.json({ data: { ...row, nextNumberPreview: preview(row) } });
}));

function preview(row: Record<string, unknown>): string {
  const parts: string[] = [];
  if (row['prefix']) parts.push(String(row['prefix']));
  if (row['includeYear']) parts.push(new Date().getFullYear().toString());
  if (row['includeMonth']) parts.push(String(new Date().getMonth() + 1).padStart(2, '0'));
  parts.push(String(row['startNumber']).padStart(Number(row['padding']), '0'));
  return parts.join(String(row['separator'] ?? '-')) + String(row['suffix'] ?? '');
}

/* -------------------------------- Templates -------------------------------- */

settingsRouter.get('/templates', authorize('settings.read'), asyncHandler(async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('document_templates')
    .select('*')
    .or(`business_id.is.null,business_id.eq.${req.tenant!.businessId}`)
    .order('document_type');
  if (error) throw new AppError(500, 'INTERNAL_ERROR', error.message);
  const rows = rowsToCamel(data ?? []);
  res.json({ data: rows, meta: { page: 1, pageSize: rows.length, total: rows.length, totalPages: 1 } });
}));


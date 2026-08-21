import { Router } from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { authorize } from '../middleware/resolveTenant.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { AppError } from '../utils/AppError.js';
import { rowsToCamel } from '../utils/case.js';

/** /api/members, /api/roles, /api/audit-logs — top-level, not nested under /settings. */
export const membersRouter = Router();
export const rolesRouter = Router();
export const auditLogsRouter = Router();

membersRouter.get('/', authorize('user.read'), asyncHandler(async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('business_members')
    .select('id, user_id, status, joined_at, roles(name), user_profiles(full_name, email, avatar_url)')
    .eq('business_id', req.tenant!.businessId);
  if (error) throw new AppError(500, 'INTERNAL_ERROR', error.message);
  const rows = (data ?? []).map((row) => {
    const role = row['roles'] as unknown as { name: string } | null;
    const profile = row['user_profiles'] as unknown as { full_name: string | null; email: string; avatar_url: string | null } | null;
    return {
      id: row['id'], userId: row['user_id'], fullName: profile?.full_name ?? null, email: profile?.email ?? '',
      avatarUrl: profile?.avatar_url ?? null, roleId: null, roleName: role?.name ?? '', status: row['status'], joinedAt: row['joined_at'],
    };
  });
  res.json({ data: rows, meta: { page: 1, pageSize: rows.length, total: rows.length, totalPages: 1 } });
}));

rolesRouter.get('/', authorize('settings.read'), asyncHandler(async (req, res) => {
  const { data, error } = await supabaseAdmin.from('roles').select('*').or(`business_id.is.null,business_id.eq.${req.tenant!.businessId}`);
  if (error) throw new AppError(500, 'INTERNAL_ERROR', error.message);
  res.json({ data: rowsToCamel(data ?? []), meta: { page: 1, pageSize: data?.length ?? 0, total: data?.length ?? 0, totalPages: 1 } });
}));

auditLogsRouter.get('/', authorize('audit.read'), asyncHandler(async (req, res) => {
  const q = req.query as Record<string, string | undefined>;
  let query = supabaseAdmin.from('audit_logs').select('*', { count: 'exact' }).eq('business_id', req.tenant!.businessId);
  if (q['action']) query = query.ilike('action', `${q['action']}%`);
  if (q['entityType']) query = query.eq('entity_type', q['entityType']);
  if (q['from']) query = query.gte('created_at', q['from']);
  if (q['to']) query = query.lte('created_at', q['to']);
  if (q['q']) query = query.or(`action.ilike.%${q['q']}%,entity_label.ilike.%${q['q']}%`);
  const page = Math.max(1, Number(q['page'] ?? 1));
  const pageSize = Math.min(100, Math.max(1, Number(q['pageSize'] ?? 25)));
  query = query.order('created_at', { ascending: false }).range((page - 1) * pageSize, page * pageSize - 1);
  const { data, error, count } = await query;
  if (error) throw new AppError(500, 'INTERNAL_ERROR', error.message);
  res.json({ data: rowsToCamel(data ?? []), meta: { page, pageSize, total: count ?? 0, totalPages: Math.max(1, Math.ceil((count ?? 0) / pageSize)) } });
}));

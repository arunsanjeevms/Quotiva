import { Router } from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { AppError } from '../utils/AppError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { rowToCamel } from '../utils/case.js';

interface MembershipRow {
  business_id: string;
  role_id: string;
  businesses: { id: string; name: string } | null;
}

/**
 * The one call the app shell needs on load: resolves (or creates, for a
 * brand-new user) the caller's active business, then returns its settings,
 * branding and the caller's effective permission set (docs/02 architecture,
 * "one call that loads everything").
 */
export const bootstrapRouter = Router();

bootstrapRouter.get('/', asyncHandler(async (req, res) => {
  const userId = req.user!.id;
  const requestedId = (req.query['businessId'] as string | undefined) || undefined;

  const { data: memberships, error } = await supabaseAdmin
    .from('business_members')
    .select('business_id, role_id, businesses(id, name)')
    .eq('user_id', userId)
    .eq('status', 'active');
  if (error) throw new AppError(500, 'INTERNAL_ERROR', error.message);

  let businessId = requestedId && memberships?.some((m) => m.business_id === requestedId)
    ? requestedId
    : (memberships?.[0] as MembershipRow | undefined)?.business_id;

  if (!businessId) {
    // First login: no business yet. Bootstrap one named after the user's email
    // so the app is usable immediately; they rename it from Settings.
    const { data: newId, error: bootstrapError } = await supabaseAdmin.rpc('create_business_bootstrap', {
      p_name: `${(req.user!.email || 'My Business').split('@')[0]}'s Business`,
    });
    if (bootstrapError || !newId) throw new AppError(500, 'INTERNAL_ERROR', 'Could not create your business.');
    businessId = newId as string;
  }

  const [{ data: business }, { data: settings }, { data: branding }, { data: member }, { data: allMemberships }] = await Promise.all([
    supabaseAdmin.from('businesses').select('*').eq('id', businessId).single(),
    supabaseAdmin.from('business_settings').select('*').eq('business_id', businessId).single(),
    supabaseAdmin.from('business_branding').select('*').eq('business_id', businessId).single(),
    supabaseAdmin.from('business_members').select('role_id, roles(id, key, name, permissions)').eq('business_id', businessId).eq('user_id', userId).single(),
    supabaseAdmin.from('business_members').select('business_id, businesses(id, name)').eq('user_id', userId).eq('status', 'active'),
  ]);

  const role = member?.['roles'] as unknown as { id: string; key: string; name: string; permissions: string[] } | null;
  if (!role) throw new AppError(500, 'INTERNAL_ERROR', 'Could not resolve your role for this business.');

  res.json({
    data: {
      business: rowToCamel(business),
      settings: rowToCamel(settings),
      branding: rowToCamel(branding),
      role: { id: role.id, key: role.key, name: role.name, isSystem: true, description: null, permissions: role.permissions },
      memberships: (allMemberships ?? []).map((m) => {
        const b = m['businesses'] as unknown as { id: string; name: string } | null;
        return { id: b?.id ?? m['business_id'], name: b?.name ?? '' };
      }),
    },
  });
}));

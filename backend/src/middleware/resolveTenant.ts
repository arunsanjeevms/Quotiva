import type { NextFunction, Request, Response } from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { AppError } from '../utils/AppError.js';

interface MembershipRow {
  business_id: string;
  status: string;
  roles: { id: string; key: string; name: string; permissions: string[] } | null;
}

/**
 * Resolves X-Business-Id against business_members and attaches the caller's
 * role and effective permission set. Non-membership is 404, never 403, so a
 * caller cannot use the response to probe which businesses exist
 * (docs/05-api-spec.md "Conventions").
 */
export async function resolveTenant(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const businessId = req.header('X-Business-Id');
    if (!req.user) throw new AppError(401, 'UNAUTHENTICATED', 'Not authenticated.');
    if (!businessId) throw new AppError(400, 'VALIDATION_ERROR', 'X-Business-Id header is required.');

    const { data, error } = await supabaseAdmin
      .from('business_members')
      .select('business_id, status, roles(id, key, name, permissions)')
      .eq('business_id', businessId)
      .eq('user_id', req.user.id)
      .maybeSingle<MembershipRow>();

    if (error) throw new AppError(500, 'INTERNAL_ERROR', 'Failed to resolve business membership.');
    if (!data || data.status !== 'active' || !data.roles) {
      throw AppError.notFound('Business');
    }

    req.tenant = {
      businessId,
      role: { id: data.roles.id, key: data.roles.key, name: data.roles.name },
      permissions: new Set(data.roles.permissions),
    };
    next();
  } catch (err) {
    next(err);
  }
}

/** Route-level permission gate. Independent of, and in addition to, RLS. */
export function authorize(permission: string) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.tenant?.permissions.has(permission)) {
      next(AppError.permissionDenied());
      return;
    }
    next();
  };
}

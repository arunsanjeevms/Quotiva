import type { NextFunction, Request, Response } from 'express';
import { supabaseAuth } from '../config/supabase.js';
import { AppError } from '../utils/AppError.js';

/**
 * Verifies the bearer token against Supabase Auth on every request. The
 * frontend's own supabase-js client only manages the session/token — all data
 * access goes through this API (docs/02 §"the secret boundary").
 */
export async function authenticate(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const header = req.header('Authorization');
    const token = header?.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) throw new AppError(401, 'UNAUTHENTICATED', 'Missing or invalid Authorization header.');

    const { data, error } = await supabaseAuth.auth.getUser(token);
    if (error || !data.user) {
      throw new AppError(401, 'UNAUTHENTICATED', 'Your session has expired. Please sign in again.');
    }

    req.user = { id: data.user.id, email: data.user.email ?? '' };
    next();
  } catch (err) {
    next(err);
  }
}

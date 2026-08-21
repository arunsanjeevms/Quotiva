import { createClient } from '@supabase/supabase-js';
import { env } from './env.js';

/**
 * Two clients, deliberately kept separate (docs/02-architecture.md
 * "Two Supabase clients on the backend").
 *
 * - `supabaseAdmin` — service-role key, bypasses RLS. Used by every
 *   repository. Every repository call still filters by business_id: RLS is
 *   defense in depth, not the only control (ADR-002).
 * - `supabaseAuth` — anon key, used only to verify a caller's JWT.
 */
export const supabaseAdmin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

export const supabaseAuth = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

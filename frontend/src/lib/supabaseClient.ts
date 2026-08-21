import { createClient } from '@supabase/supabase-js';

/**
 * The browser's only Supabase client — used exclusively for auth session
 * management (sign in, refresh, sign out). All data access goes through the
 * backend API (docs/02-architecture.md "the secret boundary"). Only the
 * public URL and publishable/anon key ever reach this file.
 */
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const supabase =
  url && key
    ? createClient(url, key, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      })
    : null;

export const supabaseConfigured = Boolean(supabase);

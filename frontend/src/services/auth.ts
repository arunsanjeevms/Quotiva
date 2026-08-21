import { supabase } from '@/lib/supabaseClient';
import type { UserProfile } from '@/types';

/**
 * Auth boundary.
 *
 * The interface below mirrors what Supabase Auth provides. During the
 * frontend-only phase it is backed by `mockAuthProvider`; swapping to real
 * Supabase Auth means implementing `AuthProvider` with supabase-js and
 * exporting that instead — no consumer changes.
 */

export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  user: UserProfile;
}

export interface AuthProvider {
  getSession: () => Promise<AuthSession | null>;
  getAccessToken: () => string | null;
  onAuthStateChange: (handler: (session: AuthSession | null) => void) => () => void;
  signIn: (email: string, password: string, remember: boolean) => Promise<AuthSession>;
  signOut: () => Promise<void>;
  getProfile: () => Promise<UserProfile>;
  updateProfile: (patch: Partial<UserProfile>) => Promise<UserProfile>;
  requestPasswordReset: (email: string) => Promise<void>;
  resetPassword: (token: string, password: string) => Promise<void>;
  changePassword: (current: string, next: string) => Promise<void>;
}

const STORAGE_KEY = 'quotiva.session';

/** Demo credentials, surfaced on the login screen while mocks are enabled. */
export const DEMO_EMAIL = 'demo@quotiva.app';
export const DEMO_PASSWORD = 'demo1234';

const DEMO_USER: UserProfile = {
  id: '11111111-1111-4111-8111-111111111111',
  fullName: 'Arun Sanjeev M S',
  email: DEMO_EMAIL,
  phone: '+1 555 0142',
  avatarUrl: null,
  lastLoginAt: new Date().toISOString(),
  isActive: true,
  createdAt: '2026-01-04T09:12:00.000Z',
};

type Listener = (session: AuthSession | null) => void;

function readStored(): AuthSession | null {
  for (const storage of [window.localStorage, window.sessionStorage]) {
    try {
      const raw = storage.getItem(STORAGE_KEY);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as AuthSession;
      if (parsed.expiresAt > Date.now()) return parsed;
      storage.removeItem(STORAGE_KEY);
    } catch {
      // Corrupt or unavailable storage is treated as "no session".
    }
  }
  return null;
}

function createMockAuthProvider(): AuthProvider {
  let current: AuthSession | null = null;
  const listeners = new Set<Listener>();

  const emit = (session: AuthSession | null): void => {
    current = session;
    for (const listener of listeners) listener(session);
  };

  const persist = (session: AuthSession, remember: boolean): void => {
    const storage = remember ? window.localStorage : window.sessionStorage;
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(session));
    } catch {
      // Private-mode browsers may refuse; the session still works in memory.
    }
  };

  const clear = (): void => {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
      window.sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  };

  const delay = (ms = 350): Promise<void> => new Promise((r) => setTimeout(r, ms));

  return {
    async getSession() {
      current = readStored();
      return current;
    },
    getAccessToken() {
      return current?.accessToken ?? readStored()?.accessToken ?? null;
    },
    onAuthStateChange(handler) {
      listeners.add(handler);
      return () => listeners.delete(handler);
    },
    async signIn(email, password, remember) {
      await delay();
      // Generic failure message — never reveal whether the email exists.
      if (email.trim().toLowerCase() !== DEMO_EMAIL || password !== DEMO_PASSWORD) {
        throw new Error('Invalid email or password.');
      }
      const session: AuthSession = {
        accessToken: `mock.${crypto.randomUUID()}`,
        refreshToken: crypto.randomUUID(),
        expiresAt: Date.now() + 1000 * 60 * 60 * 12,
        user: { ...DEMO_USER, lastLoginAt: new Date().toISOString() },
      };
      persist(session, remember);
      emit(session);
      return session;
    },
    async signOut() {
      await delay(150);
      clear();
      emit(null);
    },
    async getProfile() {
      await delay(120);
      return current?.user ?? DEMO_USER;
    },
    async updateProfile(patch) {
      await delay(250);
      const next = { ...(current?.user ?? DEMO_USER), ...patch };
      if (current) {
        const session = { ...current, user: next };
        persist(session, Boolean(window.localStorage.getItem(STORAGE_KEY)));
        emit(session);
      }
      return next;
    },
    async requestPasswordReset() {
      await delay(400);
      // Always resolves: the response must not distinguish known from unknown
      // addresses, or it becomes an account-enumeration oracle.
    },
    async resetPassword(_token, password) {
      await delay(400);
      if (password.length < 8) throw new Error('Password must be at least 8 characters.');
    },
    async changePassword(currentPassword, next) {
      await delay(400);
      if (currentPassword !== DEMO_PASSWORD) throw new Error('Your current password is incorrect.');
      if (next.length < 8) throw new Error('Password must be at least 8 characters.');
    },
  };
}

/**
 * Real provider backed by Supabase Auth. Implements the same interface as the
 * mock above, so swapping between them is a one-line change with no consumer
 * changes anywhere else in the app.
 */
function createSupabaseAuthProvider(): AuthProvider {
  function toSession(session: import('@supabase/supabase-js').Session | null): AuthSession | null {
    if (!session) return null;
    const authUser = session.user;
    return {
      accessToken: session.access_token,
      refreshToken: session.refresh_token,
      expiresAt: (session.expires_at ?? 0) * 1000,
      user: {
        id: authUser.id,
        email: authUser.email ?? '',
        fullName: (authUser.user_metadata?.['full_name'] as string | undefined) ?? null,
        phone: authUser.phone ?? null,
        avatarUrl: (authUser.user_metadata?.['avatar_url'] as string | undefined) ?? null,
        lastLoginAt: authUser.last_sign_in_at ?? null,
        isActive: true,
        createdAt: authUser.created_at,
      },
    };
  }

  function client() {
    if (!supabase) {
      throw new Error(
        'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY, or enable mocks with VITE_ENABLE_MOCKS=true.',
      );
    }
    return supabase;
  }

  return {
    async getSession() {
      const { data } = await client().auth.getSession();
      currentToken = data.session?.access_token ?? null;
      return toSession(data.session);
    },
    getAccessToken() {
      // supabase-js keeps the current session in memory; callers that need a
      // token synchronously (the API client) rely on this being populated by
      // the time a request fires, which onAuthStateChange guarantees.
      return currentToken;
    },
    onAuthStateChange(handler) {
      const { data } = client().auth.onAuthStateChange((_event, session) => {
        currentToken = session?.access_token ?? null;
        handler(toSession(session));
      });
      return () => data.subscription.unsubscribe();
    },
    async signIn(email, password, remember) {
      void remember; // supabase-js persists to localStorage by default; session-only login is a future refinement.
      const { data, error } = await client().auth.signInWithPassword({ email, password });
      if (error) throw new Error('Invalid email or password.');
      const session = toSession(data.session);
      if (!session) throw new Error('Invalid email or password.');
      currentToken = data.session?.access_token ?? null;
      return session;
    },
    async signOut() {
      await client().auth.signOut();
      currentToken = null;
    },
    async getProfile() {
      const { data } = await client().auth.getUser();
      if (!data.user) throw new Error('Not signed in.');
      return toSession({ user: data.user } as import('@supabase/supabase-js').Session)!.user;
    },
    async updateProfile(patch) {
      const { data, error } = await client().auth.updateUser({
        data: { full_name: patch.fullName, avatar_url: patch.avatarUrl },
        ...(patch.phone !== undefined ? { phone: patch.phone ?? undefined } : {}),
      });
      if (error) throw new Error(error.message);
      return toSession({ user: data.user } as import('@supabase/supabase-js').Session)!.user;
    },
    async requestPasswordReset(email) {
      // Errors are swallowed deliberately: the UI shows the same confirmation
      // whether or not the address exists, so this can't be used to enumerate
      // accounts (docs/08 §1).
      await client().auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
    },
    async resetPassword(_token, password) {
      const { error } = await client().auth.updateUser({ password });
      if (error) throw new Error(error.message);
    },
    async changePassword(currentPassword, next) {
      const { data: sessionData } = await client().auth.getSession();
      const email = sessionData.session?.user.email;
      if (!email) throw new Error('Not signed in.');
      const { error: reauthError } = await client().auth.signInWithPassword({ email, password: currentPassword });
      if (reauthError) throw new Error('Your current password is incorrect.');
      const { error } = await client().auth.updateUser({ password: next });
      if (error) throw new Error(error.message);
    },
  };
}

let currentToken: string | null = null;

/**
 * Mocks are opt-in, not opt-out: only the exact string "true" enables them.
 *
 * This deliberately fails *safe*. The previous `!== 'false'` test meant a
 * missing, blank or misspelled value silently enabled the mock auth provider,
 * which issues fake `mock.<uuid>` access tokens. Any request that then reached
 * the real backend was rejected with `bad_jwt` and logged the user straight
 * out — with every other call faked locally, the app looked fine right up
 * until one unmocked endpoint leaked. Defaulting to the real backend makes a
 * misconfiguration an obvious connection error instead of a silent demo mode.
 */
export const MOCKS_ENABLED = import.meta.env.VITE_ENABLE_MOCKS === 'true';

export const authProvider: AuthProvider = MOCKS_ENABLED
  ? createMockAuthProvider()
  : createSupabaseAuthProvider();

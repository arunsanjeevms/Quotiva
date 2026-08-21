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

export const authProvider: AuthProvider = createMockAuthProvider();

export const MOCKS_ENABLED = import.meta.env.VITE_ENABLE_MOCKS !== 'false';

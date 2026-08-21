import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { configureApiClient } from '@/lib/apiClient';
import { authProvider, type AuthSession } from '@/services/auth';
import type { UserProfile } from '@/types';

interface SessionContextValue {
  session: AuthSession | null;
  user: UserProfile | null;
  loading: boolean;
  signIn: (email: string, password: string, remember: boolean) => Promise<void>;
  signOut: () => Promise<void>;
  requestPasswordReset: (email: string) => Promise<void>;
  resetPassword: (token: string, password: string) => Promise<void>;
  changePassword: (current: string, next: string) => Promise<void>;
  refreshUser: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside <SessionProvider>');
  return ctx;
}

/**
 * Owns the auth session. It is written against the interface Supabase Auth
 * exposes, so replacing the mock provider in services/auth.ts with supabase-js
 * requires no change here or in any consumer.
 */
export function SessionProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    void (async () => {
      const restored = await authProvider.getSession();
      if (!active) return;
      setSession(restored);
      setUser(restored?.user ?? null);
      setLoading(false);
    })();

    const unsubscribe = authProvider.onAuthStateChange((next) => {
      setSession(next);
      setUser(next?.user ?? null);
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  // Wire the API client to this session so every request carries the token.
  useEffect(() => {
    configureApiClient({
      getToken: () => authProvider.getAccessToken(),
      onUnauthorized: () => {
        void authProvider.signOut().then(() => setSession(null));
      },
    });
  }, []);

  const signIn = useCallback(async (email: string, password: string, remember: boolean) => {
    const next = await authProvider.signIn(email, password, remember);
    setSession(next);
    setUser(next.user);
  }, []);

  const signOut = useCallback(async () => {
    await authProvider.signOut();
    setSession(null);
    setUser(null);
  }, []);

  const refreshUser = useCallback(async () => {
    const profile = await authProvider.getProfile();
    setUser(profile);
  }, []);

  const value = useMemo<SessionContextValue>(
    () => ({
      session,
      user,
      loading,
      signIn,
      signOut,
      refreshUser,
      requestPasswordReset: authProvider.requestPasswordReset,
      resetPassword: authProvider.resetPassword,
      changePassword: authProvider.changePassword,
    }),
    [session, user, loading, signIn, signOut, refreshUser],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

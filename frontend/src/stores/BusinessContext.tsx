import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { configureApiClient } from '@/lib/apiClient';
import { getBootstrap, type BootstrapPayload } from '@/services/bootstrap';
import { FALLBACK_CURRENCY } from '@/lib/format';
import type { Business, BusinessBranding, BusinessSettings, CurrencySettings, Role } from '@/types';

interface BusinessContextValue {
  business: Business;
  settings: BusinessSettings;
  branding: BusinessBranding;
  currency: CurrencySettings;
  role: Role;
  permissions: Set<string>;
  memberships: { id: string; name: string }[];
  activeBusinessId: string;
  setActiveBusinessId: (id: string) => void;
  /** Feature flags — unimplemented modules stay hidden rather than stubbed. */
  features: BusinessSettings['features'];
}

const BusinessContext = createContext<BusinessContextValue | null>(null);

export function useBusiness(): BusinessContextValue {
  const ctx = useContext(BusinessContext);
  if (!ctx) throw new Error('useBusiness must be used inside <BusinessProvider>');
  return ctx;
}

/** Non-throwing variant for components that may render outside the app shell. */
export function useBusinessOptional(): BusinessContextValue | null {
  return useContext(BusinessContext);
}

export function useCurrency(): CurrencySettings {
  return useBusinessOptional()?.currency ?? FALLBACK_CURRENCY;
}

/** Gate UI on a permission. The backend enforces the same key independently. */
export function usePermission(permission: string): boolean {
  const ctx = useBusinessOptional();
  return ctx?.permissions.has(permission) ?? false;
}

export function useAnyPermission(...permissions: string[]): boolean {
  const ctx = useBusinessOptional();
  if (!ctx) return false;
  return permissions.some((p) => ctx.permissions.has(p));
}

const ACTIVE_KEY = 'quotiva.activeBusinessId';

export function BusinessProvider({
  children,
  fallback,
}: {
  children: React.ReactNode;
  fallback: React.ReactNode;
}): React.ReactElement {
  const queryClient = useQueryClient();
  const [activeBusinessId, setActiveId] = useState<string | null>(() => {
    try {
      return window.localStorage.getItem(ACTIVE_KEY);
    } catch {
      return null;
    }
  });

  // The API client needs the tenant header before any business-scoped request.
  useEffect(() => {
    configureApiClient({ getBusinessId: () => activeBusinessId });
  }, [activeBusinessId]);

  const { data } = useQuery<BootstrapPayload>({
    queryKey: ['bootstrap', activeBusinessId],
    queryFn: () => getBootstrap(activeBusinessId),
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (data && data.business.id !== activeBusinessId) {
      setActiveId(data.business.id);
      try {
        window.localStorage.setItem(ACTIVE_KEY, data.business.id);
      } catch {
        /* ignore */
      }
    }
  }, [data, activeBusinessId]);

  const value = useMemo<BusinessContextValue | null>(() => {
    if (!data) return null;
    return {
      business: data.business,
      settings: data.settings,
      branding: data.branding,
      currency: data.settings,
      role: data.role,
      permissions: new Set(data.role.permissions),
      memberships: data.memberships,
      activeBusinessId: data.business.id,
      features: data.settings.features,
      setActiveBusinessId: (id: string) => {
        setActiveId(id);
        try {
          window.localStorage.setItem(ACTIVE_KEY, id);
        } catch {
          /* ignore */
        }
        // Every query key is business-scoped, so a switch flushes cleanly.
        void queryClient.invalidateQueries();
      },
    };
  }, [data, queryClient]);

  if (!value) return <>{fallback}</>;
  return <BusinessContext.Provider value={value}>{children}</BusinessContext.Provider>;
}

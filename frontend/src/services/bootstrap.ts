import { api } from '@/lib/apiClient';
import type { Business, BusinessBranding, BusinessSettings, Role } from '@/types';

export interface BootstrapPayload {
  business: Business;
  settings: BusinessSettings;
  branding: BusinessBranding;
  role: Role;
  memberships: { id: string; name: string }[];
}

/**
 * One call that loads everything the app shell needs: the active business, its
 * settings and branding, and the caller's effective permission set.
 */
export async function getBootstrap(businessId: string | null): Promise<BootstrapPayload> {
  const res = await api.get<{ data: BootstrapPayload }>(
    '/bootstrap',
    businessId ? { businessId } : undefined,
  );
  return res.data;
}

export interface AuthenticatedUser {
  id: string;
  email: string;
}

export interface TenantContext {
  businessId: string;
  role: { id: string; key: string; name: string };
  permissions: Set<string>;
}

/**
 * Augments Express's Request with the fields set by authenticate/resolveTenant.
 * Declared once here rather than as a global — imported explicitly by every
 * handler so the dependency is visible at the call site.
 */
export interface AppRequestExtensions {
  user?: AuthenticatedUser;
  tenant?: TenantContext;
  requestId: string;
}

import type { AuthenticatedUser, TenantContext } from './request.js';

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
      tenant?: TenantContext;
      requestId: string;
    }
  }
}

export {};

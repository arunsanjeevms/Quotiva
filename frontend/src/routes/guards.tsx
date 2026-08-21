import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { useSession } from '@/stores/SessionContext';
import { BusinessProvider, usePermission } from '@/stores/BusinessContext';
import { BrandingProvider } from '@/stores/BrandingProvider';
import { EmptyState } from '@/components/ui/States';
import { Skeleton } from '@/components/ui/Skeleton';
import { Button } from '@/components/ui/Button';
import { Link } from 'react-router-dom';

function BootSplash(): React.ReactElement {
  return (
    <div className="flex min-h-screen items-center justify-center bg-app">
      <div className="w-full max-w-sm space-y-3 px-4">
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
      </div>
    </div>
  );
}

/** Requires a session; preserves the intended destination across sign-in. */
export function ProtectedRoute(): React.ReactElement {
  const { session, loading } = useSession();
  const location = useLocation();

  if (loading) return <BootSplash />;
  if (!session) {
    const returnTo = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?returnTo=${returnTo}`} replace />;
  }

  return (
    <BusinessProvider fallback={<BootSplash />}>
      <BrandingProvider>
        <Outlet />
      </BrandingProvider>
    </BusinessProvider>
  );
}

/**
 * Route-level permission gate. The UI hides what a user cannot do, and the
 * backend refuses it independently — this is convenience, not security.
 */
export function PermissionRoute({ permission }: { permission: string }): React.ReactElement {
  const allowed = usePermission(permission);
  if (allowed) return <Outlet />;
  return (
    <EmptyState
      icon={ShieldAlert}
      title="You do not have access to this area"
      description="Your role does not include permission for this section. Ask an administrator if you need access."
      action={
        <Button variant="secondary" asChild>
          <Link to="/">Back to dashboard</Link>
        </Button>
      }
    />
  );
}

export function NotFoundPage(): React.ReactElement {
  return (
    <EmptyState
      title="Page not found"
      description="The page you are looking for does not exist or has moved."
      action={
        <Button variant="primary" asChild>
          <Link to="/">Back to dashboard</Link>
        </Button>
      }
      className="mt-10"
    />
  );
}

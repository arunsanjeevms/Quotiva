import { KeyRound, Monitor, ShieldCheck } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useNavigate } from 'react-router-dom';
import { useSession } from '@/stores/SessionContext';
import { useBusiness } from '@/stores/BusinessContext';
import { formatDateTime } from '@/lib/format';

export function SecuritySettings(): React.ReactElement {
  const navigate = useNavigate();
  const { user } = useSession();
  const { role, business } = useBusiness();

  return (
    <>
      <PageHeader title="Security" description="Your session and access to this business." />

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-content-muted" />
              Password
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-content-secondary">
              Change your password from your profile page. You will need your current password.
            </p>
            <Button variant="secondary" size="sm" className="mt-3" onClick={() => navigate('/profile')}>
              Go to profile
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Monitor className="h-4 w-4 text-content-muted" />
              Current session
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <div>
              <p className="text-xs uppercase tracking-wide text-content-muted">Signed in as</p>
              <p className="mt-0.5 text-base text-content">{user?.email}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-content-muted">Last login</p>
              <p className="mt-0.5 text-base text-content">{formatDateTime(user?.lastLoginAt)}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-content-muted" />
              Access
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-content-secondary">
              You have the <strong>{role.name}</strong> role in {business.name}. Manage roles and
              permissions from Users & Roles.
            </p>
            <Button variant="secondary" size="sm" className="mt-3" onClick={() => navigate('/settings/users')}>
              Users & roles
            </Button>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

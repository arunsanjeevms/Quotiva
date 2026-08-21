import { useState } from 'react';
import { Mail, ShieldCheck, UserPlus } from 'lucide-react';
import { PageHeader, Toolbar } from '@/components/ui/PageHeader';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Field } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/States';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/Toast';
import { useMembers, useRoles } from '@/hooks/queries';
import { useBusiness, usePermission } from '@/stores/BusinessContext';
import { formatDate, initials } from '@/lib/format';
import type { Member } from '@/types';

/**
 * Invitations, role changes and role editing here are UI convenience only —
 * the backend independently enforces every permission key, and the last
 * remaining Super Admin can never be demoted or removed (docs/04 §4).
 */
export function UsersAndRolesSettings(): React.ReactElement {
  const { business } = useBusiness();
  const toast = useToast();
  const confirm = useConfirm();
  const canManage = usePermission('user.manage');
  const canManageRoles = usePermission('role.manage');

  const { data: memberData, isLoading, error, refetch } = useMembers();
  const { data: roleData } = useRoles();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [email, setEmail] = useState('');

  const superAdminCount = (memberData?.data ?? []).filter(
    (m) => roleData?.data.find((r) => r.id === m.roleId)?.key === 'super_admin' && m.status === 'active',
  ).length;

  const columns: Column<Member>[] = [
    {
      key: 'name',
      header: 'Member',
      cardTitle: true,
      cell: (row) => (
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-subtle text-xs font-semibold text-primary">
            {initials(row.fullName ?? row.email)}
          </span>
          <div className="min-w-0">
            <p className="truncate font-medium text-content">{row.fullName ?? row.email}</p>
            <p className="truncate text-sm text-content-muted">{row.email}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'roleName',
      header: 'Role',
      cell: (row) => <Badge tone="primary">{row.roleName}</Badge>,
    },
    {
      key: 'status',
      header: 'Status',
      cell: (row) =>
        row.status === 'active' ? (
          <Badge tone="success">Active</Badge>
        ) : row.status === 'invited' ? (
          <Badge tone="info">Invited</Badge>
        ) : (
          <Badge tone="warning">Suspended</Badge>
        ),
    },
    {
      key: 'joinedAt',
      header: 'Joined',
      hideBelow: 'md',
      cell: (row) => formatDate(row.joinedAt, business.dateFormat),
    },
  ];

  const isLastSuperAdmin = (member: Member): boolean =>
    roleData?.data.find((r) => r.id === member.roleId)?.key === 'super_admin' &&
    member.status === 'active' &&
    superAdminCount <= 1;

  return (
    <>
      <PageHeader
        title="Users & roles"
        description="Who can access this business, and what they can do."
        actions={
          canManage && (
            <Button variant="primary" size="sm" onClick={() => setInviteOpen(true)}>
              <UserPlus className="h-3.5 w-3.5" />
              Invite member
            </Button>
          )
        }
      />

      <Toolbar>
        <span className="text-sm text-content-muted">
          {memberData?.data.length ?? 0} member{memberData?.data.length === 1 ? '' : 's'}
        </span>
      </Toolbar>

      <DataTable
        columns={columns}
        rows={memberData?.data}
        rowKey={(row) => row.id}
        loading={isLoading}
        error={error}
        onRetry={() => void refetch()}
        empty={
          <EmptyState
            icon={UserPlus}
            title="No members yet"
            description="Invite your team to start collaborating on this business."
          />
        }
        actions={(row) => (
          <div className="flex items-center gap-1">
            {isLastSuperAdmin(row) && (
              <span className="text-xs font-normal text-content-muted" title="The last Super Admin cannot be changed">
                Protected
              </span>
            )}
            {canManage && !isLastSuperAdmin(row) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={async () => {
                  const ok = await confirm({
                    title: `Remove ${row.fullName ?? row.email}?`,
                    description: 'They will lose access to this business immediately.',
                    confirmLabel: 'Remove',
                    destructive: true,
                  });
                  if (ok) toast.info('Removing members requires the backend', 'Connect the API to complete this action.');
                }}
              >
                Remove
              </Button>
            )}
          </div>
        )}
      />

      <Card className="mt-5">
        <CardContent className="flex items-start gap-2.5 p-4">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-content-muted" />
          <div>
            <p className="text-base font-medium text-content">Roles</p>
            <p className="mt-0.5 text-sm text-content-muted">
              Super Admin, Administrator and Staff are system templates.
              {canManageRoles ? ' Clone one to create a custom role with its own permissions.' : ''}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {(roleData?.data ?? []).map((role) => (
                <Badge key={role.id} tone={role.isSystem ? 'neutral' : 'primary'}>
                  {role.name}
                </Badge>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Modal
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        title="Invite a member"
        description={`They will receive an email to join ${business.name}.`}
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setInviteOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                setInviteOpen(false);
                setEmail('');
                toast.info('Invitations require the backend', 'Connect the API to send a real invite.');
              }}
            >
              Send invite
            </Button>
          </>
        }
      >
        <Field label="Email address" required>
          {(p) => (
            <Input
              {...p}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="colleague@company.com"
              autoFocus
              prefix={<Mail className="h-3.5 w-3.5" />}
            />
          )}
        </Field>
      </Modal>
    </>
  );
}

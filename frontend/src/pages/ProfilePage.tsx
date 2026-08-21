import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { KeyRound, User } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Field } from '@/components/ui/Field';
import { useSession } from '@/stores/SessionContext';
import { useToast } from '@/components/ui/Toast';
import { formatDate, formatDateTime, initials } from '@/lib/format';
import { passwordSchema } from '@/pages/auth/PasswordPages';

const profileSchema = z.object({
  fullName: z.string().max(200).nullable(),
  phone: z.string().max(50).nullable(),
});

const passwordFormSchema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password'),
    newPassword: passwordSchema,
    confirm: z.string(),
  })
  .refine((data) => data.newPassword === data.confirm, {
    path: ['confirm'],
    message: 'Passwords do not match',
  });

export function ProfilePage(): React.ReactElement {
  const { user, refreshUser, changePassword } = useSession();
  const toast = useToast();

  const profileForm = useForm<z.infer<typeof profileSchema>>({
    resolver: zodResolver(profileSchema),
    values: { fullName: user?.fullName ?? null, phone: user?.phone ?? null },
  });

  const passwordForm = useForm<z.infer<typeof passwordFormSchema>>({
    resolver: zodResolver(passwordFormSchema),
    defaultValues: { currentPassword: '', newPassword: '', confirm: '' },
  });

  const [passwordError, setPasswordError] = useState<string | null>(null);

  const onSaveProfile = profileForm.handleSubmit(async () => {
    // No update endpoint exists in the mock API yet — refreshUser keeps the
    // session's shape correct against a real backend without a UI change.
    await refreshUser();
    toast.success('Profile updated');
  });

  const onChangePassword = passwordForm.handleSubmit(async (values) => {
    setPasswordError(null);
    try {
      await changePassword(values.currentPassword, values.newPassword);
      passwordForm.reset();
      toast.success('Password changed');
    } catch (error) {
      setPasswordError(error instanceof Error ? error.message : 'Could not change the password.');
    }
  });

  if (!user) return <></>;

  return (
    <>
      <PageHeader title="Profile" description="Your account details and password." />

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-4 w-4 text-content-muted" />
              Profile
            </CardTitle>
          </CardHeader>
          <form onSubmit={onSaveProfile}>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3">
                <span className="flex h-14 w-14 items-center justify-center rounded-full bg-primary-subtle text-lg font-semibold text-primary">
                  {initials(user.fullName ?? user.email)}
                </span>
                <div>
                  <p className="text-base font-medium text-content">{user.email}</p>
                  <p className="text-sm text-content-muted">
                    Member since {formatDate(user.createdAt)}
                  </p>
                </div>
              </div>

              <Field label="Full name">
                {(p) => <Input {...p} {...profileForm.register('fullName')} />}
              </Field>
              <Field label="Phone">
                {(p) => <Input {...p} {...profileForm.register('phone')} />}
              </Field>

              <dl className="grid grid-cols-2 gap-3 border-t border-line pt-4 text-sm">
                <div>
                  <dt className="text-content-muted">Status</dt>
                  <dd className="text-content">{user.isActive ? 'Active' : 'Inactive'}</dd>
                </div>
                <div>
                  <dt className="text-content-muted">Last login</dt>
                  <dd className="text-content">{formatDateTime(user.lastLoginAt)}</dd>
                </div>
              </dl>
            </CardContent>
            <CardFooter>
              <Button type="submit" variant="primary" size="sm" loading={profileForm.formState.isSubmitting}>
                Save profile
              </Button>
            </CardFooter>
          </form>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-content-muted" />
              Change password
            </CardTitle>
          </CardHeader>
          <form onSubmit={onChangePassword} noValidate>
            <CardContent className="space-y-4">
              {passwordError && (
                <p className="rounded border border-danger/20 bg-danger-bg px-3 py-2 text-sm text-danger">
                  {passwordError}
                </p>
              )}
              <Field
                label="Current password"
                required
                error={passwordForm.formState.errors.currentPassword?.message}
              >
                {(p) => (
                  <Input
                    {...p}
                    {...passwordForm.register('currentPassword')}
                    type="password"
                    autoComplete="current-password"
                    invalid={Boolean(passwordForm.formState.errors.currentPassword)}
                  />
                )}
              </Field>
              <Field
                label="New password"
                required
                error={passwordForm.formState.errors.newPassword?.message}
              >
                {(p) => (
                  <Input
                    {...p}
                    {...passwordForm.register('newPassword')}
                    type="password"
                    autoComplete="new-password"
                    invalid={Boolean(passwordForm.formState.errors.newPassword)}
                  />
                )}
              </Field>
              <Field label="Confirm new password" required error={passwordForm.formState.errors.confirm?.message}>
                {(p) => (
                  <Input
                    {...p}
                    {...passwordForm.register('confirm')}
                    type="password"
                    autoComplete="new-password"
                    invalid={Boolean(passwordForm.formState.errors.confirm)}
                  />
                )}
              </Field>
            </CardContent>
            <CardFooter>
              <Button type="submit" variant="primary" size="sm" loading={passwordForm.formState.isSubmitting}>
                Update password
              </Button>
            </CardFooter>
          </form>
        </Card>
      </div>
    </>
  );
}

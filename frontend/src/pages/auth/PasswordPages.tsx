import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Field } from '@/components/ui/Field';
import { Card, CardContent } from '@/components/ui/Card';
import { useSession } from '@/stores/SessionContext';

/** Shared policy — mirrored by the backend, never enforced only here. */
export const passwordSchema = z
  .string()
  .min(8, 'Use at least 8 characters')
  .regex(/[A-Za-z]/, 'Include at least one letter')
  .regex(/[0-9]/, 'Include at least one number');

const forgotSchema = z.object({
  email: z.string().min(1, 'Email is required').email('Enter a valid email address'),
});

export function ForgotPasswordPage(): React.ReactElement {
  const { requestPasswordReset } = useSession();
  const [sent, setSent] = useState(false);

  const form = useForm<z.infer<typeof forgotSchema>>({
    resolver: zodResolver(forgotSchema),
    defaultValues: { email: '' },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    await requestPasswordReset(values.email);
    // The same confirmation shows whether or not the address exists, so this
    // screen cannot be used to enumerate accounts.
    setSent(true);
  });

  if (sent) {
    return (
      <Card>
        <CardContent className="p-5 text-center">
          <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-success-bg">
            <CheckCircle2 className="h-5 w-5 text-success" />
          </div>
          <h1 className="text-h2 text-content">Check your email</h1>
          <p className="mt-1.5 text-sm text-content-secondary">
            If an account exists for that address, we have sent a link to reset the password. The
            link expires in one hour.
          </p>
          <Button variant="secondary" className="mt-4 w-full" asChild>
            <Link to="/login">Back to sign in</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-5">
        <h1 className="text-h2 text-content">Reset your password</h1>
        <p className="mt-1 text-sm text-content-muted">
          Enter your email and we will send you a reset link.
        </p>
        <form onSubmit={onSubmit} className="mt-5 space-y-4" noValidate>
          <Field label="Email" required error={form.formState.errors.email?.message}>
            {(props) => (
              <Input
                {...props}
                {...form.register('email')}
                type="email"
                autoComplete="email"
                placeholder="you@company.com"
                invalid={Boolean(form.formState.errors.email)}
              />
            )}
          </Field>
          <Button
            type="submit"
            variant="primary"
            className="w-full"
            loading={form.formState.isSubmitting}
          >
            Send reset link
          </Button>
          <Button variant="ghost" className="w-full" asChild>
            <Link to="/login">Back to sign in</Link>
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

const resetSchema = z
  .object({
    password: passwordSchema,
    confirm: z.string(),
  })
  .refine((data) => data.password === data.confirm, {
    path: ['confirm'],
    message: 'Passwords do not match',
  });

export function ResetPasswordPage(): React.ReactElement {
  const { resetPassword } = useSession();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const token = searchParams.get('token') ?? '';

  const form = useForm<z.infer<typeof resetSchema>>({
    resolver: zodResolver(resetSchema),
    defaultValues: { password: '', confirm: '' },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    try {
      await resetPassword(token, values.password);
      navigate('/login', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reset the password.');
    }
  });

  return (
    <Card>
      <CardContent className="p-5">
        <h1 className="text-h2 text-content">Choose a new password</h1>
        <p className="mt-1 text-sm text-content-muted">
          Use at least 8 characters, including a letter and a number.
        </p>
        <form onSubmit={onSubmit} className="mt-5 space-y-4" noValidate>
          {error && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded border border-danger/20 bg-danger-bg px-3 py-2 text-sm text-content-secondary"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
              {error}
            </div>
          )}
          <Field label="New password" required error={form.formState.errors.password?.message}>
            {(props) => (
              <Input
                {...props}
                {...form.register('password')}
                type="password"
                autoComplete="new-password"
                invalid={Boolean(form.formState.errors.password)}
              />
            )}
          </Field>
          <Field label="Confirm password" required error={form.formState.errors.confirm?.message}>
            {(props) => (
              <Input
                {...props}
                {...form.register('confirm')}
                type="password"
                autoComplete="new-password"
                invalid={Boolean(form.formState.errors.confirm)}
              />
            )}
          </Field>
          <Button
            type="submit"
            variant="primary"
            className="w-full"
            loading={form.formState.isSubmitting}
          >
            Update password
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

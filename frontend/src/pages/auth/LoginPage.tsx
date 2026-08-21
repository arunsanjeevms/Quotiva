import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Field } from '@/components/ui/Field';
import { CheckboxField } from '@/components/ui/Toggle';
import { Card, CardContent } from '@/components/ui/Card';
import { useSession } from '@/stores/SessionContext';
import { DEMO_EMAIL, DEMO_PASSWORD, MOCKS_ENABLED } from '@/services/auth';

const schema = z.object({
  email: z.string().min(1, 'Email is required').email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
  remember: z.boolean(),
});

type FormValues = z.infer<typeof schema>;

export function LoginPage(): React.ReactElement {
  const { session, signIn } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const [formError, setFormError] = useState<string | null>(null);

  const returnTo = new URLSearchParams(location.search).get('returnTo') ?? '/';

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      email: MOCKS_ENABLED ? DEMO_EMAIL : '',
      password: MOCKS_ENABLED ? DEMO_PASSWORD : '',
      remember: true,
    },
  });

  if (session) return <Navigate to={returnTo} replace />;

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null);
    try {
      await signIn(values.email, values.password, values.remember);
      navigate(returnTo, { replace: true });
    } catch (error) {
      // Deliberately generic: never reveal whether the address exists.
      setFormError(error instanceof Error ? error.message : 'Invalid email or password.');
    }
  });

  return (
    <Card>
      <CardContent className="p-5">
        <h1 className="text-h2 text-content">Sign in</h1>
        <p className="mt-1 text-sm text-content-muted">
          Enter your credentials to access your business.
        </p>

        <form onSubmit={onSubmit} className="mt-5 space-y-4" noValidate>
          {formError && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded border border-danger/20 bg-danger-bg px-3 py-2 text-sm text-content-secondary"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
              {formError}
            </div>
          )}

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

          <Field label="Password" required error={form.formState.errors.password?.message}>
            {(props) => (
              <Input
                {...props}
                {...form.register('password')}
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                invalid={Boolean(form.formState.errors.password)}
              />
            )}
          </Field>

          <div className="flex items-center justify-between">
            <CheckboxField
              label="Remember me"
              checked={form.watch('remember')}
              onCheckedChange={(checked) => form.setValue('remember', checked === true)}
            />
            <Link
              to="/forgot-password"
              className="rounded text-sm font-medium text-primary hover:underline"
            >
              Forgot password?
            </Link>
          </div>

          <Button
            type="submit"
            variant="primary"
            className="w-full"
            loading={form.formState.isSubmitting}
          >
            Sign in
          </Button>
        </form>

        {MOCKS_ENABLED && (
          <p className="mt-4 rounded border border-line bg-subtle px-3 py-2 text-xs font-normal text-content-muted">
            Demo mode — the mock API is serving sample data. Sign in with{' '}
            <span className="font-mono text-content-secondary">{DEMO_EMAIL}</span> /{' '}
            <span className="font-mono text-content-secondary">{DEMO_PASSWORD}</span>.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

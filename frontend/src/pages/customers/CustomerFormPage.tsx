import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Save } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Textarea } from '@/components/ui/Input';
import { Field } from '@/components/ui/Field';
import { FormSkeleton } from '@/components/ui/Skeleton';
import { ErrorState } from '@/components/ui/States';
import { useAppMutation, useCustomer } from '@/hooks/queries';
import { customersService } from '@/services/resources';
import { ApiError } from '@/lib/apiClient';
import type { Customer } from '@/types';

/** Only the name is required — everything else varies by business and region. */
const schema = z.object({
  name: z.string().min(1, 'Customer name is required').max(300, 'Keep this under 300 characters'),
  companyName: z.string().max(300).nullable(),
  code: z.string().max(50).nullable(),
  email: z.union([z.string().email('Enter a valid email address'), z.literal('')]).nullable(),
  phone: z.string().max(50).nullable(),
  altPhone: z.string().max(50).nullable(),
  website: z.string().max(200).nullable(),
  addressLine1: z.string().max(200).nullable(),
  addressLine2: z.string().max(200).nullable(),
  city: z.string().max(100).nullable(),
  state: z.string().max(100).nullable(),
  country: z.string().max(100).nullable(),
  postalCode: z.string().max(30).nullable(),
  taxId: z.string().max(60).nullable(),
  paymentTermsDays: z.coerce.number().int().min(0).max(365).nullable(),
  notes: z.string().max(2000).nullable(),
});

type FormValues = z.infer<typeof schema>;

const EMPTY: FormValues = {
  name: '', companyName: null, code: null, email: null, phone: null, altPhone: null,
  website: null, addressLine1: null, addressLine2: null, city: null, state: null,
  country: null, postalCode: null, taxId: null, paymentTermsDays: null, notes: null,
};

export function CustomerFormPage(): React.ReactElement {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isNew = !id;

  const { data: customer, isLoading, error } = useCustomer(id);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: EMPTY,
  });

  useEffect(() => {
    if (!customer) return;
    form.reset({
      name: customer.name,
      companyName: customer.companyName,
      code: customer.code,
      email: customer.email,
      phone: customer.phone,
      altPhone: customer.altPhone,
      website: customer.website,
      addressLine1: customer.addressLine1,
      addressLine2: customer.addressLine2,
      city: customer.city,
      state: customer.state,
      country: customer.country,
      postalCode: customer.postalCode,
      taxId: customer.taxId,
      paymentTermsDays: customer.paymentTermsDays,
      notes: customer.notes,
    });
  }, [customer, form]);

  const save = useAppMutation<Customer, FormValues>({
    mutationFn: (values) => {
      const payload = Object.fromEntries(
        Object.entries(values).map(([key, value]) => [key, value === '' ? null : value]),
      );
      return isNew ? customersService.create(payload) : customersService.update(id, payload);
    },
    invalidate: ['customers', 'customer'],
    successMessage: 'Customer saved',
    suppressErrorToast: true,
    onSuccess: (saved) => navigate(`/customers/${saved.id}`),
  });

  const onSubmit = form.handleSubmit((values) => {
    save.mutate(values, {
      onError: (err) => {
        // Server-side field errors are mapped back onto the form.
        if (err instanceof ApiError) {
          for (const [path, message] of Object.entries(err.fieldErrors)) {
            form.setError(path as keyof FormValues, { message });
          }
        }
      },
    });
  });

  if (error) return <ErrorState error={error} />;
  if (!isNew && isLoading) return <FormSkeleton fields={8} />;

  const err = (key: keyof FormValues): string | undefined =>
    form.formState.errors[key]?.message as string | undefined;

  const text = (key: keyof FormValues, placeholder?: string) => (props: {
    id: string;
    'aria-describedby': string | undefined;
  }) => (
    <Input
      {...props}
      {...form.register(key)}
      value={(form.watch(key) as string) ?? ''}
      onChange={(e) => form.setValue(key, (e.target.value || null) as never, { shouldDirty: true })}
      placeholder={placeholder}
      invalid={Boolean(err(key))}
    />
  );

  return (
    <form onSubmit={onSubmit} noValidate>
      <PageHeader
        title={isNew ? 'New customer' : `Edit ${customer?.companyName ?? customer?.name ?? ''}`}
        breadcrumbs={[
          { label: 'Customers', to: '/customers' },
          { label: isNew ? 'New' : 'Edit' },
        ]}
        actions={
          <>
            <Button variant="ghost" size="sm" type="button" onClick={() => navigate('/customers')}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" type="submit" loading={save.isPending}>
              <Save className="h-3.5 w-3.5" />
              Save customer
            </Button>
          </>
        }
      />

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Identity</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field label="Contact name" required error={err('name')} className="sm:col-span-2">
              {(p) => (
                <Input
                  {...p}
                  {...form.register('name')}
                  placeholder="Who you deal with"
                  invalid={Boolean(err('name'))}
                />
              )}
            </Field>
            <Field label="Company name" error={err('companyName')} className="sm:col-span-2">
              {text('companyName', 'Shown on documents when set')}
            </Field>
            <Field label="Customer code" description="Your own reference." error={err('code')}>
              {text('code', 'Optional')}
            </Field>
            <Field label="Tax ID" description="Any registration identifier." error={err('taxId')}>
              {text('taxId', 'Optional')}
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Contact</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field label="Email" error={err('email')}>{text('email', 'name@company.com')}</Field>
            <Field label="Website" error={err('website')}>{text('website', 'https://')}</Field>
            <Field
              label="Phone"
              description="Include the country code for WhatsApp sharing."
              error={err('phone')}
            >
              {text('phone', '+1 555 0100')}
            </Field>
            <Field label="Alternate phone" error={err('altPhone')}>{text('altPhone')}</Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Address</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field label="Address line 1" error={err('addressLine1')} className="sm:col-span-2">
              {text('addressLine1')}
            </Field>
            <Field label="Address line 2" error={err('addressLine2')} className="sm:col-span-2">
              {text('addressLine2')}
            </Field>
            <Field label="City" error={err('city')}>{text('city')}</Field>
            <Field label="State / region" error={err('state')}>{text('state')}</Field>
            <Field label="Postal code" error={err('postalCode')}>{text('postalCode')}</Field>
            <Field label="Country" error={err('country')}>{text('country')}</Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Preferences</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field
              label="Payment terms (days)"
              description="Leave blank to use the business default."
              error={err('paymentTermsDays')}
            >
              {(p) => (
                <Input
                  {...p}
                  type="number"
                  min={0}
                  value={(form.watch('paymentTermsDays') as number | null) ?? ''}
                  onChange={(e) =>
                    form.setValue(
                      'paymentTermsDays',
                      e.target.value === '' ? null : Number(e.target.value),
                      { shouldDirty: true },
                    )
                  }
                  className="tabular"
                />
              )}
            </Field>
            <Field label="Notes" description="Internal only — never printed." error={err('notes')}>
              {(p) => (
                <Textarea
                  {...p}
                  value={(form.watch('notes') as string) ?? ''}
                  onChange={(e) =>
                    form.setValue('notes', e.target.value || null, { shouldDirty: true })
                  }
                  rows={4}
                />
              )}
            </Field>
          </CardContent>
        </Card>
      </div>
    </form>
  );
}

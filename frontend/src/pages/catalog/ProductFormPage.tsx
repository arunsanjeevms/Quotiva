import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Save } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, NativeSelect, Textarea } from '@/components/ui/Input';
import { Field } from '@/components/ui/Field';
import { SwitchField } from '@/components/ui/Toggle';
import { FormSkeleton } from '@/components/ui/Skeleton';
import { useAppMutation, useCategories, useTaxes, useUnits } from '@/hooks/queries';
import { productsService } from '@/services/resources';
import { useCurrency } from '@/stores/BusinessContext';
import { ApiError } from '@/lib/apiClient';
import type { Product, ProductKind } from '@/types';

interface FormState {
  kind: ProductKind;
  name: string;
  sku: string;
  description: string;
  categoryId: string;
  unitId: string;
  costPrice: string;
  sellingPrice: string;
  taxId: string;
  notes: string;
  isActive: boolean;
}

const EMPTY: FormState = {
  kind: 'service',
  name: '',
  sku: '',
  description: '',
  categoryId: '',
  unitId: '',
  costPrice: '',
  sellingPrice: '0',
  taxId: '',
  notes: '',
  isActive: true,
};

export function ProductFormPage({
  defaultKind = 'product',
}: {
  defaultKind?: ProductKind;
}): React.ReactElement {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const currency = useCurrency();
  const isNew = !id;

  const { data: categoryData } = useCategories();
  const { data: unitData } = useUnits();
  const { data: taxData } = useTaxes();

  const { data: product, isLoading } = useQuery({
    queryKey: ['product', id],
    queryFn: () => productsService.get(id!),
    enabled: Boolean(id),
  });

  const [values, setValues] = useState<FormState>({ ...EMPTY, kind: defaultKind });
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!product) return;
    setValues({
      kind: product.kind,
      name: product.name,
      sku: product.sku ?? '',
      description: product.description ?? '',
      categoryId: product.categoryId ?? '',
      unitId: product.unitId ?? '',
      costPrice: product.costPrice ? String(Number(product.costPrice)) : '',
      sellingPrice: String(Number(product.sellingPrice)),
      taxId: product.taxId ?? '',
      notes: product.notes ?? '',
      isActive: product.isActive,
    });
  }, [product]);

  const save = useAppMutation<Product, void>({
    mutationFn: () => {
      const payload = {
        kind: values.kind,
        name: values.name,
        sku: values.sku || null,
        description: values.description || null,
        categoryId: values.categoryId || null,
        unitId: values.unitId || null,
        costPrice: values.costPrice || null,
        sellingPrice: values.sellingPrice || '0',
        taxId: values.taxId || null,
        notes: values.notes || null,
        isActive: values.isActive,
      };
      return isNew ? productsService.create(payload) : productsService.update(id!, payload);
    },
    invalidate: ['products', 'product'],
    successMessage: 'Saved',
    suppressErrorToast: true,
    onSuccess: (saved) => navigate(saved.kind === 'service' ? '/services' : '/products'),
  });

  const submit = (event: React.FormEvent): void => {
    event.preventDefault();
    const next: Record<string, string> = {};
    if (!values.name.trim()) next['name'] = 'Name is required';
    if (Number(values.sellingPrice) < 0) next['sellingPrice'] = 'Price cannot be negative';
    if (values.costPrice && Number(values.costPrice) < 0) next['costPrice'] = 'Cost cannot be negative';
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    save.mutate(undefined, {
      onError: (error) => {
        if (error instanceof ApiError) setErrors(error.fieldErrors);
      },
    });
  };

  if (!isNew && isLoading) return <FormSkeleton fields={8} />;

  const categories = (categoryData?.data ?? []).filter(
    (c) => c.isActive && (c.appliesTo === null || c.appliesTo === values.kind),
  );

  return (
    <form onSubmit={submit} noValidate>
      <PageHeader
        title={isNew ? `New ${values.kind}` : `Edit ${product?.name ?? ''}`}
        breadcrumbs={[
          { label: values.kind === 'service' ? 'Services' : 'Products', to: values.kind === 'service' ? '/services' : '/products' },
          { label: isNew ? 'New' : 'Edit' },
        ]}
        actions={
          <>
            <Button variant="ghost" size="sm" type="button" onClick={() => navigate(-1)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" type="submit" loading={save.isPending}>
              <Save className="h-3.5 w-3.5" />
              Save
            </Button>
          </>
        }
      />

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field label="Type" required>
              {(p) => (
                <NativeSelect
                  {...p}
                  value={values.kind}
                  onChange={(e) => setValues({ ...values, kind: e.target.value as ProductKind })}
                >
                  <option value="product">Product</option>
                  <option value="service">Service</option>
                </NativeSelect>
              )}
            </Field>
            <Field label="Code / SKU" error={errors['sku']}>
              {(p) => (
                <Input
                  {...p}
                  value={values.sku}
                  onChange={(e) => setValues({ ...values, sku: e.target.value })}
                  placeholder="Optional"
                />
              )}
            </Field>
            <Field label="Name" required error={errors['name']} className="sm:col-span-2">
              {(p) => (
                <Input
                  {...p}
                  value={values.name}
                  onChange={(e) => setValues({ ...values, name: e.target.value })}
                  invalid={Boolean(errors['name'])}
                />
              )}
            </Field>
            <Field
              label="Description"
              description="Printed under the item name on documents."
              className="sm:col-span-2"
            >
              {(p) => (
                <Textarea
                  {...p}
                  value={values.description}
                  onChange={(e) => setValues({ ...values, description: e.target.value })}
                  rows={3}
                />
              )}
            </Field>
            <Field label="Category">
              {(p) => (
                <NativeSelect
                  {...p}
                  value={values.categoryId}
                  onChange={(e) => setValues({ ...values, categoryId: e.target.value })}
                >
                  <option value="">Uncategorised</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </NativeSelect>
              )}
            </Field>
            <Field label="Unit">
              {(p) => (
                <NativeSelect
                  {...p}
                  value={values.unitId}
                  onChange={(e) => setValues({ ...values, unitId: e.target.value })}
                >
                  <option value="">None</option>
                  {(unitData?.data ?? []).filter((u) => u.isActive).map((u) => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </NativeSelect>
              )}
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Pricing</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Selling price"
                required
                error={errors['sellingPrice']}
                description="The default price on new document lines."
              >
                {(p) => (
                  <Input
                    {...p}
                    value={values.sellingPrice}
                    onChange={(e) => setValues({ ...values, sellingPrice: e.target.value })}
                    inputMode="decimal"
                    prefix={currency.symbolPosition === 'before' ? currency.currencySymbol : undefined}
                    className="tabular"
                    invalid={Boolean(errors['sellingPrice'])}
                  />
                )}
              </Field>
              <Field
                label="Cost price"
                error={errors['costPrice']}
                description="Internal only — never printed."
              >
                {(p) => (
                  <Input
                    {...p}
                    value={values.costPrice}
                    onChange={(e) => setValues({ ...values, costPrice: e.target.value })}
                    inputMode="decimal"
                    prefix={currency.symbolPosition === 'before' ? currency.currencySymbol : undefined}
                    className="tabular"
                  />
                )}
              </Field>
            </div>

            <Field label="Default tax" description="Applied when this item is added to a document.">
              {(p) => (
                <NativeSelect
                  {...p}
                  value={values.taxId}
                  onChange={(e) => setValues({ ...values, taxId: e.target.value })}
                >
                  <option value="">No tax</option>
                  {(taxData?.data ?? []).filter((t) => t.isActive).map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </NativeSelect>
              )}
            </Field>

            <Field label="Internal notes">
              {(p) => (
                <Textarea
                  {...p}
                  value={values.notes}
                  onChange={(e) => setValues({ ...values, notes: e.target.value })}
                  rows={3}
                />
              )}
            </Field>

            <div className="border-t border-line pt-4">
              <SwitchField
                label="Active"
                description="Inactive items are hidden when adding lines to a document."
                checked={values.isActive}
                onCheckedChange={(checked) => setValues({ ...values, isActive: checked })}
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </form>
  );
}

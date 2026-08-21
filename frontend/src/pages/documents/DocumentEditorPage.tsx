import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Eye, Save, Send } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, NativeSelect } from '@/components/ui/Input';
import { Field } from '@/components/ui/Field';
import { Combobox } from '@/components/ui/Combobox';
import { DatePicker } from '@/components/ui/DatePicker';
import { FormSkeleton } from '@/components/ui/Skeleton';
import { ErrorState } from '@/components/ui/States';
import { LineItemEditor } from '@/components/documents/LineItemEditor';
import { TotalsPanel } from '@/components/documents/TotalsPanel';
import { AdditionalInformation } from '@/components/documents/AdditionalInformation';
import { DocumentPreview } from '@/components/documents/DocumentPreview';
import { Modal } from '@/components/ui/Modal';
import type { DocumentFormValues, EditorCharge, EditorItem } from '@/components/documents/types';
import {
  useAppMutation,
  useCustomers,
  useInvoice,
  useProducts,
  useQuotation,
  useTaxes,
  useTemplates,
  useUnits,
} from '@/hooks/queries';
import { invoicesService, quotationsService } from '@/services/resources';
import { toISODate } from '@/lib/format';
import { ApiError } from '@/lib/apiClient';
import type { Invoice, Quotation } from '@/types';

export type DocumentEditorMode = 'quotation' | 'invoice';

function toEditorItems(items: (Quotation | Invoice)['items']): EditorItem[] {
  return items.map((item) => ({
    key: item.id,
    source: item.source,
    productId: item.productId,
    name: item.name,
    description: item.description,
    sku: item.sku,
    unitId: item.unitId,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    discountType: item.discountType,
    discountValue: item.discountValue,
    taxId: item.taxId,
    notes: item.notes,
  }));
}

function toEditorCharges(charges: (Quotation | Invoice)['charges']): EditorCharge[] {
  return charges.map((c) => ({
    key: c.id,
    label: c.label,
    amount: c.amount,
    isTaxable: c.isTaxable,
    taxId: c.taxId,
  }));
}

function emptyForm(customerId = ''): DocumentFormValues {
  return {
    customerId,
    issueDate: toISODate(new Date()),
    secondaryDate: null,
    reference: null,
    templateId: null,
    taxMode: 'exclusive',
    discountType: null,
    discountValue: '0',
    items: [],
    charges: [],
    customNotes: undefined as unknown as null, // undefined signals "use default" on create
    termsAndConditions: undefined as unknown as null,
    includeNotes: true,
    includeTerms: true,
    paymentInstructions: null,
    internalNotes: null,
  };
}

export function DocumentEditorPage({ mode }: { mode: DocumentEditorMode }): React.ReactElement {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const isNew = !id;
  const isQuotation = mode === 'quotation';

  const quotationQuery = useQuotation(isQuotation ? id : undefined);
  const invoiceQuery = useInvoice(!isQuotation ? id : undefined);
  const existing = isQuotation ? quotationQuery.data : invoiceQuery.data;
  const isLoading = isQuotation ? quotationQuery.isLoading : invoiceQuery.isLoading;
  const loadError = isQuotation ? quotationQuery.error : invoiceQuery.error;

  const { data: customerData } = useCustomers({ pageSize: 100 });
  const { data: productData } = useProducts({ pageSize: 200 });
  const { data: unitData } = useUnits();
  const { data: taxData } = useTaxes();
  const { data: templateData } = useTemplates();

  const [values, setValues] = useState<DocumentFormValues>(() =>
    emptyForm(searchParams.get('customerId') ?? ''),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [previewOpen, setPreviewOpen] = useState(false);

  useEffect(() => {
    if (!existing) return;
    setValues({
      customerId: existing.customerId,
      issueDate: existing.issueDate,
      secondaryDate: isQuotation
        ? (existing as Quotation).validUntil
        : (existing as Invoice).dueDate,
      reference: existing.reference,
      templateId: existing.templateId,
      taxMode: existing.taxMode,
      discountType: existing.discountType,
      discountValue: existing.discountValue,
      items: toEditorItems(existing.items),
      charges: toEditorCharges(existing.charges),
      customNotes: existing.customNotes,
      termsAndConditions: existing.termsAndConditions,
      includeNotes: existing.includeNotes,
      includeTerms: existing.includeTerms,
      paymentInstructions: existing.paymentInstructions,
      internalNotes: existing.internalNotes,
    });
  }, [existing, isQuotation]);

  const locked = existing
    ? isQuotation
      ? (existing as Quotation).status === 'converted'
      : ['cancelled', 'void'].includes((existing as Invoice).status)
    : false;

  const buildPayload = (): Record<string, unknown> => {
    const payload: Record<string, unknown> = {
      customerId: values.customerId,
      issueDate: values.issueDate,
      reference: values.reference,
      templateId: values.templateId,
      taxMode: values.taxMode,
      discountType: values.discountType,
      discountValue: values.discountValue,
      items: values.items.map((item) => ({
        id: item.key.length === 36 && existing ? item.key : undefined,
        source: item.source,
        productId: item.productId,
        name: item.name,
        description: item.description,
        sku: item.sku,
        unitId: item.unitId,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        discountType: item.discountType,
        discountValue: item.discountValue,
        taxId: item.taxId,
        notes: item.notes,
        saveToCatalog: item.saveToCatalog,
        catalogKind: item.catalogKind,
      })),
      charges: values.charges.map((c) => ({
        id: c.key.length === 36 && existing ? c.key : undefined,
        label: c.label,
        amount: c.amount,
        isTaxable: c.isTaxable,
        taxId: c.taxId,
      })),
      includeNotes: values.includeNotes,
      includeTerms: values.includeTerms,
      paymentInstructions: values.paymentInstructions,
      internalNotes: values.internalNotes,
    };
    // Absent key = "apply the business default"; explicit null = "cleared".
    if (values.customNotes !== undefined) payload['customNotes'] = values.customNotes;
    if (values.termsAndConditions !== undefined) payload['termsAndConditions'] = values.termsAndConditions;

    if (isQuotation) payload['validUntil'] = values.secondaryDate;
    else payload['dueDate'] = values.secondaryDate;

    return payload;
  };

  const saveQuotation = useAppMutation<Quotation, void>({
    mutationFn: () => {
      const payload = buildPayload();
      return isNew || !id
        ? quotationsService.create(payload)
        : quotationsService.update(id, payload);
    },
    invalidate: ['quotations', 'quotation'],
    successMessage: isNew ? 'Quotation created' : 'Quotation saved',
    suppressErrorToast: true,
    onSuccess: (saved) => navigate(`/quotations/${saved.id}`),
  });

  const saveInvoice = useAppMutation<Invoice, void>({
    mutationFn: () => {
      const payload = buildPayload();
      return isNew || !id ? invoicesService.create(payload) : invoicesService.update(id, payload);
    },
    invalidate: ['invoices', 'invoice'],
    successMessage: isNew ? 'Invoice created' : 'Invoice saved',
    suppressErrorToast: true,
    onSuccess: (saved) => navigate(`/invoices/${saved.id}`),
  });

  const save = isQuotation ? saveQuotation : saveInvoice;

  const submit = (): void => {
    const next: Record<string, string> = {};
    if (!values.customerId) next['customerId'] = 'Select a customer';
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    save.mutate(undefined, {
      onError: (error) => {
        if (error instanceof ApiError) setErrors(error.fieldErrors);
      },
    });
  };

  const previewDoc = useMemo(() => {
    if (existing) return existing;
    return null;
  }, [existing]);

  if (loadError) return <ErrorState error={loadError} />;
  if (!isNew && isLoading) return <FormSkeleton fields={10} />;

  const activeTemplates = (templateData?.data ?? []).filter(
    (t) => t.documentType === (isQuotation ? 'quotation' : 'invoice'),
  );

  return (
    <>
      <PageHeader
        title={
          isNew
            ? `New ${isQuotation ? 'quotation' : 'invoice'}`
            : isQuotation
              ? (existing as Quotation)?.quotationNumber
              : (existing as Invoice)?.invoiceNumber
        }
        breadcrumbs={[
          { label: isQuotation ? 'Quotations' : 'Invoices', to: isQuotation ? '/quotations' : '/invoices' },
          { label: isNew ? 'New' : 'Edit' },
        ]}
        actions={
          <>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setPreviewOpen(true)}
              disabled={!previewDoc}
            >
              <Eye className="h-3.5 w-3.5" />
              Preview
            </Button>
            <Button variant="secondary" size="sm" onClick={submit} loading={save.isPending} disabled={locked}>
              <Save className="h-3.5 w-3.5" />
              Save draft
            </Button>
            <Button variant="primary" size="sm" onClick={submit} loading={save.isPending} disabled={locked}>
              <Send className="h-3.5 w-3.5" />
              Save
            </Button>
          </>
        }
      />

      {locked && (
        <div className="mb-4 rounded-lg border border-warning/20 bg-warning-bg px-3 py-2.5 text-sm text-content-secondary">
          This document is {isQuotation ? 'converted' : 'cancelled or void'} and can no longer be
          edited.
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <Field label="Customer" required error={errors['customerId']} className="sm:col-span-2">
                {() => (
                  <Combobox
                    options={(customerData?.data ?? []).map((c) => ({
                      value: c.id,
                      label: c.companyName ?? c.name,
                      description: c.companyName ? c.name : c.email ?? undefined,
                    }))}
                    value={values.customerId || null}
                    onChange={(customerId) => setValues({ ...values, customerId })}
                    placeholder="Search customers…"
                    disabled={locked}
                    createAction={{
                      label: 'New customer',
                      onSelect: () => navigate('/customers/new'),
                    }}
                  />
                )}
              </Field>

              <Field label={isQuotation ? 'Quotation date' : 'Invoice date'} required>
                {() => (
                  <DatePicker
                    value={values.issueDate}
                    onChange={(v) => setValues({ ...values, issueDate: v ?? values.issueDate })}
                    clearable={false}
                    disabled={locked}
                  />
                )}
              </Field>

              <Field label={isQuotation ? 'Valid until' : 'Due date'}>
                {() => (
                  <DatePicker
                    value={values.secondaryDate}
                    onChange={(v) => setValues({ ...values, secondaryDate: v })}
                    disabled={locked}
                  />
                )}
              </Field>

              <Field label="Reference">
                {(p) => (
                  <Input
                    {...p}
                    value={values.reference ?? ''}
                    onChange={(e) => setValues({ ...values, reference: e.target.value || null })}
                    placeholder="PO number, project code…"
                    disabled={locked}
                  />
                )}
              </Field>

              <Field label="Template">
                {(p) => (
                  <NativeSelect
                    {...p}
                    value={values.templateId ?? ''}
                    onChange={(e) => setValues({ ...values, templateId: e.target.value || null })}
                    disabled={locked}
                  >
                    {activeTemplates.map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </NativeSelect>
                )}
              </Field>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Items</CardTitle>
            </CardHeader>
            <CardContent>
              <LineItemEditor
                items={values.items}
                onChange={(items) => setValues({ ...values, items })}
                products={productData?.data ?? []}
                taxes={taxData?.data ?? []}
                units={unitData?.data ?? []}
                taxMode={values.taxMode}
                disabled={locked}
              />
            </CardContent>
          </Card>

          <AdditionalInformation
            documentType={mode}
            customNotes={values.customNotes ?? null}
            termsAndConditions={values.termsAndConditions ?? null}
            includeNotes={values.includeNotes}
            includeTerms={values.includeTerms}
            onChange={(patch) => setValues({ ...values, ...patch })}
            disabled={locked}
          />
        </div>

        <div className="lg:sticky lg:top-[4.5rem] lg:self-start">
          <TotalsPanel
            items={values.items}
            charges={values.charges}
            onChargesChange={(charges) => setValues({ ...values, charges })}
            discountType={values.discountType}
            discountValue={values.discountValue}
            onDiscountChange={(discountType, discountValue) =>
              setValues({ ...values, discountType, discountValue })
            }
            taxMode={values.taxMode}
            onTaxModeChange={(taxMode) => setValues({ ...values, taxMode })}
            taxes={taxData?.data ?? []}
            disabled={locked}
          />
        </div>
      </div>

      {previewDoc && (
        <Modal
          open={previewOpen}
          onOpenChange={setPreviewOpen}
          title="Preview"
          size="xl"
          footer={
            <Button variant="secondary" size="sm" onClick={() => setPreviewOpen(false)}>
              Close
            </Button>
          }
        >
          <div className="rounded-lg bg-subtle p-4">
            <DocumentPreview doc={previewDoc} />
          </div>
        </Modal>
      )}

      <p className="mt-4 text-xs text-content-muted">
        Add at least one item and save before requesting a full preview — new items appear in the
        preview only after the document has been created once.
      </p>
    </>
  );
}

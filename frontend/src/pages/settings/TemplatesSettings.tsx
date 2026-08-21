import { Check, FileText } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { useAppMutation, useTemplates } from '@/hooks/queries';
import { settingsService } from '@/services/resources';
import { useBusiness } from '@/stores/BusinessContext';
import { EmptyState } from '@/components/ui/States';
import { cn } from '@/lib/cn';

/**
 * Five templates ship for each document type (docs/07 §8): Classic, Modern,
 * Minimal, Professional, Compact. All render from the same view model, so
 * switching one here changes only presentation, never data.
 */
export function TemplatesSettings(): React.ReactElement {
  const { settings } = useBusiness();
  const { data, isLoading } = useTemplates();

  const setDefault = useAppMutation<unknown, { type: 'invoice' | 'quotation'; templateId: string }>({
    mutationFn: ({ type, templateId }) =>
      settingsService.updateSettings(
        type === 'invoice'
          ? { defaultInvoiceTemplateId: templateId }
          : { defaultQuotationTemplateId: templateId },
      ),
    invalidate: ['bootstrap'],
    successMessage: 'Default template updated',
  });

  const invoiceTemplates = (data?.data ?? []).filter((t) => t.documentType === 'invoice');
  const quotationTemplates = (data?.data ?? []).filter((t) => t.documentType === 'quotation');

  const Gallery = ({
    title,
    templates,
    currentId,
    type,
  }: {
    title: string;
    templates: typeof invoiceTemplates;
    currentId: string | null;
    type: 'invoice' | 'quotation';
  }): React.ReactElement => (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {templates.length === 0 ? (
          <EmptyState icon={FileText} title="No templates available" className="border-0 py-8" />
        ) : (
          <div className="grid gap-3 sm:grid-cols-3">
            {templates.map((template) => {
              const active = template.id === currentId;
              return (
                <button
                  key={template.id}
                  type="button"
                  onClick={() => setDefault.mutate({ type, templateId: template.id })}
                  className={cn(
                    'rounded-lg border p-3 text-left transition-colors',
                    active ? 'border-primary bg-primary-subtle' : 'border-line hover:border-line-strong hover:bg-subtle',
                  )}
                >
                  <div className="mb-2 flex aspect-[3/4] items-center justify-center rounded border border-line bg-surface">
                    <FileText className="h-8 w-8 text-content-muted" />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-base font-medium text-content">{template.name}</span>
                    {active && <Check className="h-3.5 w-3.5 text-primary" />}
                  </div>
                  <p className="mt-0.5 text-sm text-content-muted">{template.description}</p>
                </button>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );

  return (
    <>
      <PageHeader title="Templates" description="Choose the default look for new documents." />
      {isLoading ? (
        <p className="text-sm text-content-muted">Loading templates…</p>
      ) : (
        <div className="space-y-4">
          <Gallery
            title="Invoice templates"
            templates={invoiceTemplates}
            currentId={settings.defaultInvoiceTemplateId}
            type="invoice"
          />
          <Gallery
            title="Quotation templates"
            templates={quotationTemplates}
            currentId={settings.defaultQuotationTemplateId}
            type="quotation"
          />
        </div>
      )}
    </>
  );
}

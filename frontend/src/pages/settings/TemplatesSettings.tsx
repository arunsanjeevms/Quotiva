import { Check, FileText } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { useAppMutation, useTemplates } from '@/hooks/queries';
import { settingsService } from '@/services/resources';
import { useBusiness } from '@/stores/BusinessContext';
import { EmptyState } from '@/components/ui/States';
import { cn } from '@/lib/cn';
import { hexToRgbTriplet, resolveTemplateKey, TEMPLATE_THEMES } from '@/components/documents/templateThemes';

/**
 * Five templates ship for each document type (docs/07 §8): Classic, Modern,
 * Minimal, Professional, Compact. All render from the same view model, so
 * switching one here changes only presentation, never data. Every swatch uses
 * the business's own brand color, so the gallery previews exactly what a
 * document will look like once selected.
 */
export function TemplatesSettings(): React.ReactElement {
  const { settings, branding } = useBusiness();
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
              const theme = TEMPLATE_THEMES[resolveTemplateKey(template.key)];
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
                  <TemplateSwatch theme={theme} accent={branding.primaryColor} />
                  <div className="mt-2 flex items-center gap-1.5">
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
      <PageHeader
        title="Templates"
        description="Choose the default look for new documents. Every template uses your brand color from Settings → Branding."
      />
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

/** A miniature stand-in for the real document layout, built from the same theme tokens. */
function TemplateSwatch({
  theme,
  accent,
}: {
  theme: (typeof TEMPLATE_THEMES)[keyof typeof TEMPLATE_THEMES];
  accent: string;
}): React.ReactElement {
  const rgb = hexToRgbTriplet(accent);
  const compact = theme.density === 'compact';

  return (
    <div className="aspect-[3/4] overflow-hidden rounded border border-line bg-white">
      <div className="flex h-full flex-col gap-1 p-2">
        {/* header */}
        {theme.header === 'band' ? (
          <div className="h-3.5 rounded-sm" style={{ background: accent }} />
        ) : theme.header === 'panel' ? (
          <div
            className="h-3.5 rounded-sm"
            style={{ background: `rgba(${rgb}, 0.15)`, borderLeft: `2px solid ${accent}` }}
          />
        ) : theme.header === 'ruled' ? (
          <div className="h-2 border-b-2" style={{ borderColor: accent }} />
        ) : theme.header === 'compact' ? (
          <div className="h-1.5 border-b" style={{ borderColor: accent }} />
        ) : (
          <div className="h-2" />
        )}

        {/* two label/value lines */}
        <div className="mt-1 flex justify-between">
          <div className="h-1 w-8 rounded-full bg-gray-200" />
          <div className="h-1 w-6 rounded-full bg-gray-200" />
        </div>
        <div className="flex justify-between">
          <div className="h-1 w-10 rounded-full bg-gray-200" />
          <div className="h-1 w-6 rounded-full bg-gray-200" />
        </div>

        {/* item table */}
        <div className={cn('mt-1 flex-1 space-y-1', compact && 'space-y-0.5')}>
          <div
            className="h-1.5 rounded-sm"
            style={
              theme.tableHeader === 'band'
                ? { background: accent }
                : theme.tableHeader === 'panel'
                  ? { background: `rgba(${rgb}, 0.15)` }
                  : { background: '#e2e8f0' }
            }
          />
          {Array.from({ length: compact ? 5 : 4 }).map((_, i) => (
            <div key={i} className="flex gap-1">
              <div className="h-1 flex-1 rounded-full bg-gray-100" />
              <div className="h-1 w-3 rounded-full bg-gray-100" />
              <div className="h-1 w-4 rounded-full bg-gray-100" />
            </div>
          ))}
        </div>

        {/* grand total */}
        <div
          className={cn('h-2 rounded-sm', theme.accent === 'panel' && 'px-1')}
          style={
            theme.accent === 'panel'
              ? { background: `rgba(${rgb}, 0.15)` }
              : theme.accent === 'rule'
                ? { borderTop: `1.5px solid ${accent}` }
                : { borderTop: '1.5px solid #0f172a' }
          }
        />
      </div>
    </div>
  );
}

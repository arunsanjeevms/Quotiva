import { Check, FileText, Palette } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/States';
import { useAppMutation, useTemplates } from '@/hooks/queries';
import { settingsService } from '@/services/resources';
import { useBusiness } from '@/stores/BusinessContext';
import { cn } from '@/lib/cn';
import {
  COLOR_SCHEMES,
  darken,
  hexToRgbTriplet,
  resolveAccent,
  resolveTemplateKey,
  TEMPLATE_THEMES,
  type TemplateTheme,
} from '@/components/documents/templateThemes';

/**
 * Design and colour are chosen independently (docs/07 §8): nine layouts, any
 * accent colour. Every swatch renders in the currently selected accent, so the
 * gallery previews exactly what a document will look like once chosen.
 */
export function TemplatesSettings(): React.ReactElement {
  const { settings, branding } = useBusiness();
  const { data, isLoading } = useTemplates();
  const accent = resolveAccent(branding);

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

  const setAccent = useAppMutation<unknown, string | null>({
    mutationFn: (color) => settingsService.updateBranding({ documentAccentColor: color }),
    invalidate: ['bootstrap'],
    successMessage: 'Document colour updated',
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
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {templates.map((template) => {
              const active = template.id === currentId;
              const theme = TEMPLATE_THEMES[resolveTemplateKey(template.key)];
              return (
                <button
                  key={template.id}
                  type="button"
                  onClick={() => setDefault.mutate({ type, templateId: template.id })}
                  aria-pressed={active}
                  className={cn(
                    'rounded-lg border p-2.5 text-left transition-colors',
                    active
                      ? 'border-primary bg-primary-subtle'
                      : 'border-line hover:border-line-strong hover:bg-subtle',
                  )}
                >
                  <TemplateSwatch theme={theme} accent={accent} />
                  <div className="mt-2 flex items-center gap-1.5">
                    <span className="text-base font-medium text-content">{template.name}</span>
                    {active && <Check className="h-3.5 w-3.5 shrink-0 text-primary" />}
                  </div>
                  <p className="mt-0.5 text-sm leading-snug text-content-muted">
                    {template.description}
                  </p>
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
        description="Pick a layout and an accent colour. Any design works with any colour."
      />

      {isLoading ? (
        <p className="text-sm text-content-muted">Loading templates…</p>
      ) : (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Palette className="h-4 w-4 text-content-muted" />
                Document accent colour
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-3 text-sm text-content-muted">
                Applies to every document template. Leave it on your brand colour to keep documents
                and the app consistent, or pick a different accent just for documents.
              </p>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setAccent.mutate(null)}
                  aria-pressed={branding.documentAccentColor === null}
                  className={cn(
                    'flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors',
                    branding.documentAccentColor === null
                      ? 'border-primary bg-primary-subtle text-primary'
                      : 'border-line text-content-secondary hover:border-line-strong hover:bg-subtle',
                  )}
                >
                  <span
                    className="h-4 w-4 shrink-0 rounded-full ring-1 ring-inset ring-black/10"
                    style={{ background: branding.primaryColor }}
                  />
                  Brand colour
                  {branding.documentAccentColor === null && <Check className="h-3.5 w-3.5" />}
                </button>

                {COLOR_SCHEMES.map((scheme) => {
                  const active = branding.documentAccentColor?.toLowerCase() === scheme.color.toLowerCase();
                  return (
                    <button
                      key={scheme.key}
                      type="button"
                      onClick={() => setAccent.mutate(scheme.color)}
                      aria-pressed={active}
                      title={scheme.name}
                      className={cn(
                        'flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors',
                        active
                          ? 'border-primary bg-primary-subtle text-primary'
                          : 'border-line text-content-secondary hover:border-line-strong hover:bg-subtle',
                      )}
                    >
                      <span
                        className="h-4 w-4 shrink-0 rounded-full ring-1 ring-inset ring-black/10"
                        style={{ background: scheme.color }}
                      />
                      {scheme.name}
                      {active && <Check className="h-3.5 w-3.5" />}
                    </button>
                  );
                })}
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-line pt-4">
                <label className="text-xs font-medium text-content-secondary" htmlFor="custom-accent">
                  Custom colour
                </label>
                <input
                  id="custom-accent"
                  type="color"
                  value={accent}
                  onChange={(e) => setAccent.mutate(e.target.value)}
                  className="h-8 w-12 cursor-pointer rounded border border-line"
                />
                <span className="font-mono text-sm text-content-muted">{accent}</span>
                {branding.documentAccentColor !== null && (
                  <Button variant="ghost" size="sm" onClick={() => setAccent.mutate(null)}>
                    Reset to brand colour
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

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

/** A miniature stand-in for the real layout, built from the same theme tokens. */
function TemplateSwatch({
  theme,
  accent,
}: {
  theme: TemplateTheme;
  accent: string;
}): React.ReactElement {
  const rgb = hexToRgbTriplet(accent);
  const compact = theme.density === 'compact';
  const rows = compact ? 6 : 4;

  const table = (
    <div className={cn('flex-1 space-y-1', compact && 'space-y-0.5')}>
      <div
        className="h-1.5 rounded-sm"
        style={
          theme.tableHeader === 'band'
            ? { background: accent }
            : theme.tableHeader === 'panel'
              ? { background: `rgba(${rgb}, 0.16)` }
              : theme.tableHeader === 'underline'
                ? { borderBottom: `1.5px solid ${accent}` }
                : { background: '#e2e8f0' }
        }
      />
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="flex gap-1 rounded-sm"
          style={theme.zebra && i % 2 === 1 ? { background: `rgba(${rgb}, 0.07)` } : undefined}
        >
          <div className="h-1 flex-1 rounded-full bg-gray-200" />
          <div className="h-1 w-3 rounded-full bg-gray-200" />
          <div className="h-1 w-4 rounded-full bg-gray-200" />
        </div>
      ))}
    </div>
  );

  const total = (
    <div
      className={cn('h-2 rounded-sm', theme.accent === 'panel' && 'px-1')}
      style={
        theme.accent === 'panel'
          ? { background: `rgba(${rgb}, 0.16)` }
          : theme.accent === 'none'
            ? { borderTop: '1.5px solid #cbd5e1' }
            : { borderTop: `1.5px solid ${accent}` }
      }
    />
  );

  // The Sidebar design is structurally different, so its swatch is too.
  if (theme.header === 'sidebar') {
    return (
      <div className="flex aspect-[3/4] overflow-hidden rounded border border-line bg-white">
        <div
          className="w-1/4 shrink-0 space-y-1 p-1.5"
          style={{ background: `rgba(${rgb}, 0.1)`, borderRight: `2px solid ${accent}` }}
        >
          <div className="h-2 w-2 rounded-sm" style={{ background: accent }} />
          <div className="h-0.5 w-full rounded-full bg-gray-300" />
          <div className="h-0.5 w-3/4 rounded-full bg-gray-200" />
          <div className="h-0.5 w-full rounded-full bg-gray-200" />
        </div>
        <div className="flex flex-1 flex-col gap-1 p-2">
          <div className="h-1.5 w-2/3 rounded-full" style={{ background: accent }} />
          <div className="h-1 w-1/2 rounded-full bg-gray-200" />
          <div className="mt-1 flex flex-1 flex-col">{table}</div>
          {total}
        </div>
      </div>
    );
  }

  return (
    <div className="aspect-[3/4] overflow-hidden rounded border border-line bg-white">
      <div className={cn('flex h-full flex-col gap-1', compact ? 'p-1.5' : 'p-2')}>
        {/* header */}
        {theme.header === 'band' ? (
          <div
            className="h-4 rounded-sm"
            style={{ background: `linear-gradient(100deg, ${accent}, ${darken(accent, 34)})` }}
          />
        ) : theme.header === 'panel' ? (
          <div
            className="h-4 rounded-sm"
            style={{ background: `rgba(${rgb}, 0.16)`, borderLeft: `2px solid ${accent}` }}
          />
        ) : theme.header === 'stripe' ? (
          <>
            <div className="h-1 rounded-full" style={{ background: accent }} />
            <div className="flex items-end justify-between">
              <div className="h-1.5 w-8 rounded-full bg-gray-300" />
              <div className="h-2 w-7 rounded-sm" style={{ background: `rgba(${rgb}, 0.35)` }} />
            </div>
          </>
        ) : theme.header === 'centered' ? (
          <div className="flex flex-col items-center gap-1 pb-0.5">
            <div className="h-2 w-2 rounded-sm bg-gray-300" />
            <div className="h-1 w-10 rounded-full bg-gray-300" />
            <div className="flex w-full items-center gap-1">
              <span className="h-px flex-1" style={{ background: accent }} />
              <span className="h-1 w-5 rounded-full" style={{ background: accent }} />
              <span className="h-px flex-1" style={{ background: accent }} />
            </div>
          </div>
        ) : theme.header === 'ruled' ? (
          <div className="h-3 border-b-2" style={{ borderColor: accent }} />
        ) : theme.header === 'compact' ? (
          <div className="h-2 border-b" style={{ borderColor: accent }} />
        ) : (
          <div className="h-3 border-b border-gray-200" />
        )}

        {/* meta lines */}
        <div className="mt-0.5 flex justify-between">
          <div className="h-1 w-8 rounded-full bg-gray-200" />
          <div className="h-1 w-6 rounded-full bg-gray-200" />
        </div>

        {table}
        {total}
      </div>
    </div>
  );
}

import { useRef } from 'react';
import { Building2, Upload } from 'lucide-react';
import { SettingsPanel, useDraft } from './shared';
import { Field } from '@/components/ui/Field';
import { SwitchField } from '@/components/ui/Toggle';
import { Button } from '@/components/ui/Button';
import { contrastRatio } from '@/stores/BrandingProvider';
import { useAppMutation } from '@/hooks/queries';
import { useToast } from '@/components/ui/Toast';
import { settingsService } from '@/services/resources';
import { useBusiness } from '@/stores/BusinessContext';

interface Draft {
  primaryColor: string;
  secondaryColor: string;
  showLogoOnDocuments: boolean;
}

function toRgbTriplet(hex: string): string | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match?.[1]) return null;
  const value = Number.parseInt(match[1], 16);
  return `${(value >> 16) & 255} ${(value >> 8) & 255} ${value & 255}`;
}

/**
 * Colors are applied at runtime as CSS custom properties (docs/07 §2) — this
 * screen is the only place they are set, and the change is visible immediately
 * on save, not after a rebuild.
 */
export function BrandingSettings(): React.ReactElement {
  const { branding, business } = useBusiness();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const { draft, setDraft, dirty, reset } = useDraft<Draft>({
    primaryColor: branding.primaryColor,
    secondaryColor: branding.secondaryColor,
    showLogoOnDocuments: branding.showLogoOnDocuments,
  });

  const save = useAppMutation<unknown, void>({
    mutationFn: () => settingsService.updateBranding(draft),
    invalidate: ['bootstrap'],
    successMessage: 'Branding saved',
  });

  const primaryRgb = toRgbTriplet(draft.primaryColor);
  const contrast = primaryRgb ? contrastRatio(primaryRgb, '255 255 255') : null;
  const contrastOk = contrast !== null && contrast >= 4.5;

  const handleFile = (kind: 'logo' | 'favicon') => (e: React.ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error('File too large', 'Logos and favicons must be under 2 MB.');
      return;
    }
    if (!['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml', 'image/x-icon'].includes(file.type)) {
      toast.error('Unsupported file type', 'Use PNG, JPEG, WebP, SVG or ICO.');
      return;
    }
    toast.info('Upload requires the backend', `Connect the API to store the ${kind}.`);
    e.target.value = '';
  };

  return (
    <div className="space-y-4">
      <SettingsPanel
        title="Logo & favicon"
        description="Shown in the app and, when enabled, on generated documents."
        dirty={dirty}
        saving={save.isPending}
        onSave={() => save.mutate()}
        onReset={reset}
      >
        <div className="flex flex-wrap gap-6">
          <div>
            <p className="mb-2 text-xs font-medium text-content-secondary">Logo</p>
            <div className="flex h-20 w-20 items-center justify-center rounded-lg border border-dashed border-line-strong bg-subtle">
              {branding.logoUrl ? (
                <img src={branding.logoUrl} alt="" className="h-full w-full rounded-lg object-contain" />
              ) : (
                <Building2 className="h-6 w-6 text-content-muted" />
              )}
            </div>
            <Button
              variant="secondary"
              size="sm"
              className="mt-2"
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="h-3.5 w-3.5" />
              Upload
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              className="hidden"
              onChange={handleFile('logo')}
            />
          </div>

          <div className="max-w-xs flex-1">
            <SwitchField
              className="mt-6"
              label="Show logo on documents"
              description="When off, quotations and invoices show your business name only."
              checked={draft.showLogoOnDocuments}
              onCheckedChange={(checked) => setDraft({ ...draft, showLogoOnDocuments: checked })}
            />
          </div>
        </div>
      </SettingsPanel>

      <SettingsPanel
        title="Colors"
        description="Applied throughout the app immediately after saving."
        dirty={dirty}
        saving={save.isPending}
        onSave={() => save.mutate()}
        onReset={reset}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Primary color">
            {(p) => (
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={draft.primaryColor}
                  onChange={(e) => setDraft({ ...draft, primaryColor: e.target.value })}
                  className="h-9 w-12 shrink-0 cursor-pointer rounded border border-line"
                  aria-label="Primary color"
                />
                <input
                  {...p}
                  value={draft.primaryColor}
                  onChange={(e) => setDraft({ ...draft, primaryColor: e.target.value })}
                  className="h-9 flex-1 rounded border border-line px-2.5 font-mono text-sm"
                />
              </div>
            )}
          </Field>
          <Field label="Secondary color">
            {(p) => (
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={draft.secondaryColor}
                  onChange={(e) => setDraft({ ...draft, secondaryColor: e.target.value })}
                  className="h-9 w-12 shrink-0 cursor-pointer rounded border border-line"
                  aria-label="Secondary color"
                />
                <input
                  {...p}
                  value={draft.secondaryColor}
                  onChange={(e) => setDraft({ ...draft, secondaryColor: e.target.value })}
                  className="h-9 flex-1 rounded border border-line px-2.5 font-mono text-sm"
                />
              </div>
            )}
          </Field>
        </div>

        {!contrastOk && (
          <p className="mt-3 rounded border border-warning/20 bg-warning-bg px-3 py-2 text-sm text-content-secondary">
            This primary color does not meet 4.5:1 contrast against white. Button labels will
            automatically switch to a dark color so text stays readable.
          </p>
        )}

        <div className="mt-4 flex items-center gap-3 rounded-lg border border-line p-4">
          <div
            className="flex h-8 items-center rounded px-3 text-sm font-medium"
            style={{
              background: draft.primaryColor,
              color: contrastOk ? '#fff' : '#0f172a',
            }}
          >
            Primary button
          </div>
          <span className="text-sm text-content-muted">Preview for {business.name}</span>
        </div>
      </SettingsPanel>
    </div>
  );
}

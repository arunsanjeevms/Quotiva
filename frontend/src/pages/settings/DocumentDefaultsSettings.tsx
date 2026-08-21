import { SettingsPanel, useDraft } from './shared';
import { Field } from '@/components/ui/Field';
import { NativeSelect } from '@/components/ui/Input';
import { useAppMutation, useTaxes } from '@/hooks/queries';
import { settingsService } from '@/services/resources';
import { useBusiness } from '@/stores/BusinessContext';
import type { TaxMode } from '@/types';

interface QuotationDraft {
  quotationValidityDays: number;
  defaultTaxMode: TaxMode;
  defaultTaxId: string;
}

/** Settings → Quotation Settings */
export function QuotationSettingsPage(): React.ReactElement {
  const { settings } = useBusiness();
  const { data: taxData } = useTaxes();

  const { draft, setDraft, dirty, reset } = useDraft<QuotationDraft>({
    quotationValidityDays: settings.quotationValidityDays,
    defaultTaxMode: settings.defaultTaxMode,
    defaultTaxId: settings.defaultTaxId ?? '',
  });

  const save = useAppMutation<unknown, void>({
    mutationFn: () =>
      settingsService.updateSettings({ ...draft, defaultTaxId: draft.defaultTaxId || null }),
    invalidate: ['bootstrap'],
    successMessage: 'Quotation settings saved',
  });

  return (
    <SettingsPanel
      title="Quotation defaults"
      description="Applied to every new quotation. Each one can still be adjusted individually."
      dirty={dirty}
      saving={save.isPending}
      onSave={() => save.mutate()}
      onReset={reset}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Validity period (days)" description="How long a new quotation stays valid.">
          {(p) => (
            <NativeSelect
              {...p}
              value={draft.quotationValidityDays}
              onChange={(e) => setDraft({ ...draft, quotationValidityDays: Number(e.target.value) })}
            >
              {[7, 14, 15, 30, 45, 60, 90].map((n) => (
                <option key={n} value={n}>{n} days</option>
              ))}
            </NativeSelect>
          )}
        </Field>
        <Field label="Default tax treatment">
          {(p) => (
            <NativeSelect
              {...p}
              value={draft.defaultTaxMode}
              onChange={(e) => setDraft({ ...draft, defaultTaxMode: e.target.value as TaxMode })}
            >
              <option value="exclusive">Tax exclusive</option>
              <option value="inclusive">Tax inclusive</option>
              <option value="none">No tax</option>
            </NativeSelect>
          )}
        </Field>
        <Field label="Default tax" description="Pre-selected for new items." className="sm:col-span-2">
          {(p) => (
            <NativeSelect
              {...p}
              value={draft.defaultTaxId}
              onChange={(e) => setDraft({ ...draft, defaultTaxId: e.target.value })}
            >
              <option value="">No default</option>
              {(taxData?.data ?? []).filter((t) => t.isActive).map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </NativeSelect>
          )}
        </Field>
      </div>
    </SettingsPanel>
  );
}

interface InvoiceDraft {
  defaultPaymentTermsDays: number;
  pageSize: 'A4' | 'Letter';
}

/** Settings → Invoice Settings */
export function InvoiceSettingsPage(): React.ReactElement {
  const { settings } = useBusiness();

  const { draft, setDraft, dirty, reset } = useDraft<InvoiceDraft>({
    defaultPaymentTermsDays: settings.defaultPaymentTermsDays,
    pageSize: settings.pageSize,
  });

  const save = useAppMutation<unknown, void>({
    mutationFn: () => settingsService.updateSettings(draft),
    invalidate: ['bootstrap'],
    successMessage: 'Invoice settings saved',
  });

  return (
    <SettingsPanel
      title="Invoice defaults"
      description="Applied to every new invoice. Each one can still be adjusted individually."
      dirty={dirty}
      saving={save.isPending}
      onSave={() => save.mutate()}
      onReset={reset}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Payment terms (days)" description="Used to calculate the due date.">
          {(p) => (
            <NativeSelect
              {...p}
              value={draft.defaultPaymentTermsDays}
              onChange={(e) => setDraft({ ...draft, defaultPaymentTermsDays: Number(e.target.value) })}
            >
              {[0, 7, 14, 15, 30, 45, 60, 90].map((n) => (
                <option key={n} value={n}>{n === 0 ? 'Due on receipt' : `${n} days`}</option>
              ))}
            </NativeSelect>
          )}
        </Field>
        <Field label="Page size">
          {(p) => (
            <NativeSelect
              {...p}
              value={draft.pageSize}
              onChange={(e) => setDraft({ ...draft, pageSize: e.target.value as 'A4' | 'Letter' })}
            >
              <option value="A4">A4</option>
              <option value="Letter">Letter</option>
            </NativeSelect>
          )}
        </Field>
      </div>
    </SettingsPanel>
  );
}

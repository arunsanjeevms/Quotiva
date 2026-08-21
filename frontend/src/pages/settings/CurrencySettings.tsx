import { SettingsPanel, useDraft } from './shared';
import { Field } from '@/components/ui/Field';
import { Input, NativeSelect } from '@/components/ui/Input';
import { useAppMutation } from '@/hooks/queries';
import { settingsService } from '@/services/resources';
import { useBusiness } from '@/stores/BusinessContext';
import { formatMoney } from '@/lib/format';
import type { CurrencySettings as CurrencySettingsType } from '@/types';

/**
 * Nothing here assumes any particular currency. The defaults shown when a
 * business is created are suggestions, not a code-level assumption — this
 * screen is where they are actually set.
 */
export function CurrencySettings(): React.ReactElement {
  const { settings } = useBusiness();

  const { draft, setDraft, dirty, reset } = useDraft<CurrencySettingsType>({
    currencyCode: settings.currencyCode,
    currencyName: settings.currencyName,
    currencySymbol: settings.currencySymbol,
    decimalPlaces: settings.decimalPlaces,
    symbolPosition: settings.symbolPosition,
    thousandSeparator: settings.thousandSeparator,
    decimalSeparator: settings.decimalSeparator,
  });

  const save = useAppMutation<unknown, void>({
    mutationFn: () => settingsService.updateSettings(draft),
    invalidate: ['bootstrap'],
    successMessage: 'Currency settings saved',
  });

  return (
    <SettingsPanel
      title="Currency"
      description="How money is displayed throughout the app and on documents."
      dirty={dirty}
      saving={save.isPending}
      onSave={() => save.mutate()}
      onReset={reset}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Currency code" description="ISO code, e.g. USD, EUR, INR.">
          {(p) => (
            <Input
              {...p}
              value={draft.currencyCode}
              onChange={(e) => setDraft({ ...draft, currencyCode: e.target.value.toUpperCase() })}
              maxLength={3}
              className="uppercase"
            />
          )}
        </Field>
        <Field label="Currency name">
          {(p) => (
            <Input
              {...p}
              value={draft.currencyName}
              onChange={(e) => setDraft({ ...draft, currencyName: e.target.value })}
            />
          )}
        </Field>
        <Field label="Symbol">
          {(p) => (
            <Input
              {...p}
              value={draft.currencySymbol}
              onChange={(e) => setDraft({ ...draft, currencySymbol: e.target.value })}
              maxLength={5}
            />
          )}
        </Field>
        <Field label="Symbol position">
          {(p) => (
            <NativeSelect
              {...p}
              value={draft.symbolPosition}
              onChange={(e) =>
                setDraft({ ...draft, symbolPosition: e.target.value as 'before' | 'after' })
              }
            >
              <option value="before">Before amount ($100)</option>
              <option value="after">After amount (100$)</option>
            </NativeSelect>
          )}
        </Field>
        <Field label="Decimal places">
          {(p) => (
            <NativeSelect
              {...p}
              value={draft.decimalPlaces}
              onChange={(e) => setDraft({ ...draft, decimalPlaces: Number(e.target.value) })}
            >
              {[0, 1, 2, 3, 4].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </NativeSelect>
          )}
        </Field>
        <Field label="Thousand separator">
          {(p) => (
            <NativeSelect
              {...p}
              value={draft.thousandSeparator}
              onChange={(e) => setDraft({ ...draft, thousandSeparator: e.target.value })}
            >
              <option value=",">Comma (1,000)</option>
              <option value=".">Period (1.000)</option>
              <option value=" ">Space (1 000)</option>
              <option value="">None (1000)</option>
            </NativeSelect>
          )}
        </Field>
        <Field label="Decimal separator">
          {(p) => (
            <NativeSelect
              {...p}
              value={draft.decimalSeparator}
              onChange={(e) => setDraft({ ...draft, decimalSeparator: e.target.value })}
            >
              <option value=".">Period (10.50)</option>
              <option value=",">Comma (10,50)</option>
            </NativeSelect>
          )}
        </Field>
      </div>

      <div className="mt-4 rounded-lg border border-line bg-subtle/50 p-3">
        <p className="text-xs font-medium text-content-secondary">Preview</p>
        <p className="mt-1 tabular text-h2 text-content">{formatMoney('12345.6', draft)}</p>
      </div>
    </SettingsPanel>
  );
}

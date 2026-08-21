import { Plus, Trash2 } from 'lucide-react';
import { SettingsPanel, useDraft } from './shared';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { useAppMutation } from '@/hooks/queries';
import { settingsService } from '@/services/resources';
import { useBusiness } from '@/stores/BusinessContext';
import type { Business } from '@/types';

type Draft = Omit<Business, 'id' | 'timezone' | 'locale' | 'dateFormat'>;

/**
 * Nothing here is required except the business name, and no field carries a
 * jurisdiction-specific label in code — registrationExtra lets an admin record
 * whatever identifier their jurisdiction actually uses (docs/01 charter).
 */
export function BusinessProfileSettings(): React.ReactElement {
  const { business } = useBusiness();

  const { draft, setDraft, dirty, reset } = useDraft<Draft>({
    name: business.name,
    legalName: business.legalName,
    email: business.email,
    altEmail: business.altEmail,
    phone: business.phone,
    altPhone: business.altPhone,
    website: business.website,
    addressLine1: business.addressLine1,
    addressLine2: business.addressLine2,
    city: business.city,
    state: business.state,
    country: business.country,
    postalCode: business.postalCode,
    taxRegistrationNumber: business.taxRegistrationNumber,
    businessRegistrationNumber: business.businessRegistrationNumber,
    registrationExtra: business.registrationExtra,
  });

  const save = useAppMutation<unknown, void>({
    mutationFn: () => settingsService.updateBusiness(draft),
    invalidate: ['bootstrap'],
    successMessage: 'Business profile saved',
  });

  const field = (key: keyof Draft, label: string, placeholder?: string, required?: boolean) => (
    <Field label={label} required={required}>
      {(p) => (
        <Input
          {...p}
          value={(draft[key] as string) ?? ''}
          onChange={(e) => setDraft({ ...draft, [key]: e.target.value || null })}
          placeholder={placeholder}
        />
      )}
    </Field>
  );

  return (
    <div className="space-y-4">
      <SettingsPanel
        title="Business identity"
        description="Your name and how customers reach you. Shown on every document."
        dirty={dirty}
        saving={save.isPending}
        onSave={() => save.mutate()}
        onReset={reset}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          {field('name', 'Business name', undefined, true)}
          {field('legalName', 'Legal name')}
          {field('email', 'Email')}
          {field('altEmail', 'Alternate email')}
          {field('phone', 'Phone')}
          {field('altPhone', 'Alternate phone')}
          {field('website', 'Website', 'https://')}
        </div>
      </SettingsPanel>

      <SettingsPanel
        title="Address"
        dirty={dirty}
        saving={save.isPending}
        onSave={() => save.mutate()}
        onReset={reset}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">{field('addressLine1', 'Address line 1')}</div>
          <div className="sm:col-span-2">{field('addressLine2', 'Address line 2')}</div>
          {field('city', 'City')}
          {field('state', 'State / region')}
          {field('postalCode', 'Postal code')}
          {field('country', 'Country')}
        </div>
      </SettingsPanel>

      <SettingsPanel
        title="Registration information"
        description="Optional. Nothing here is mandatory — record whatever identifiers apply to your business and jurisdiction."
        dirty={dirty}
        saving={save.isPending}
        onSave={() => save.mutate()}
        onReset={reset}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          {field('taxRegistrationNumber', 'Tax registration number', 'e.g. VAT no., GSTIN, ABN, EIN…')}
          {field('businessRegistrationNumber', 'Business registration number')}
        </div>

        <div className="mt-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-content-secondary">
              Additional registration identifiers
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                setDraft({
                  ...draft,
                  registrationExtra: [...draft.registrationExtra, { label: '', value: '' }],
                })
              }
            >
              <Plus className="h-3.5 w-3.5" />
              Add
            </Button>
          </div>
          {draft.registrationExtra.length === 0 ? (
            <p className="text-sm text-content-muted">No additional identifiers recorded.</p>
          ) : (
            draft.registrationExtra.map((entry, index) => (
              <div key={index} className="flex gap-2">
                <Input
                  value={entry.label}
                  onChange={(e) => {
                    const next = [...draft.registrationExtra];
                    next[index] = { ...entry, label: e.target.value };
                    setDraft({ ...draft, registrationExtra: next });
                  }}
                  placeholder="Label, e.g. State licence"
                  className="flex-1"
                />
                <Input
                  value={entry.value}
                  onChange={(e) => {
                    const next = [...draft.registrationExtra];
                    next[index] = { ...entry, value: e.target.value };
                    setDraft({ ...draft, registrationExtra: next });
                  }}
                  placeholder="Value"
                  className="flex-1"
                />
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() =>
                    setDraft({
                      ...draft,
                      registrationExtra: draft.registrationExtra.filter((_, i) => i !== index),
                    })
                  }
                  aria-label="Remove"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))
          )}
        </div>
      </SettingsPanel>
    </div>
  );
}

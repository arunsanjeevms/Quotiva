import { CreditCard } from 'lucide-react';
import { SettingsPanel, useDraft } from './shared';
import { Field } from '@/components/ui/Field';
import { Input, Textarea } from '@/components/ui/Input';
import { SwitchField } from '@/components/ui/Toggle';
import { CrudTablePage } from '@/pages/catalog/CrudTablePage';
import { Badge } from '@/components/ui/Badge';
import { useAppMutation, usePaymentMethods } from '@/hooks/queries';
import { paymentMethodsService, settingsService } from '@/services/resources';
import { useBusiness, usePermission } from '@/stores/BusinessContext';
import type { ListParams, PaymentMethod } from '@/types';

interface Draft {
  bankName: string;
  bankAccountName: string;
  bankAccountNumber: string;
  bankIfscSwift: string;
  bankBranch: string;
  upiId: string;
  defaultPaymentInstructions: string;
  showPaymentDetailsOnDocuments: boolean;
}

export function PaymentSettings(): React.ReactElement {
  const { settings } = useBusiness();
  const canCreate = usePermission('settings.update');
  const canUpdate = usePermission('settings.update');
  const canDelete = usePermission('settings.update');

  const { draft, setDraft, dirty, reset } = useDraft<Draft>({
    bankName: settings.bankName ?? '',
    bankAccountName: settings.bankAccountName ?? '',
    bankAccountNumber: settings.bankAccountNumber ?? '',
    bankIfscSwift: settings.bankIfscSwift ?? '',
    bankBranch: settings.bankBranch ?? '',
    upiId: settings.upiId ?? '',
    defaultPaymentInstructions: settings.defaultPaymentInstructions ?? '',
    showPaymentDetailsOnDocuments: settings.showPaymentDetailsOnDocuments,
  });

  const save = useAppMutation<unknown, void>({
    mutationFn: () =>
      settingsService.updateSettings({
        ...draft,
        bankName: draft.bankName || null,
        bankAccountName: draft.bankAccountName || null,
        bankAccountNumber: draft.bankAccountNumber || null,
        bankIfscSwift: draft.bankIfscSwift || null,
        bankBranch: draft.bankBranch || null,
        upiId: draft.upiId || null,
        defaultPaymentInstructions: draft.defaultPaymentInstructions || null,
      }),
    invalidate: ['bootstrap'],
    successMessage: 'Payment settings saved',
  });

  const text = (key: keyof Draft, label: string, placeholder?: string) => (
    <Field label={label}>
      {(p) => (
        <Input
          {...p}
          value={draft[key] as string}
          onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
          placeholder={placeholder}
        />
      )}
    </Field>
  );

  return (
    <div className="space-y-4">
      <SettingsPanel
        title="Bank & payment details"
        description="Optional. Shown on documents when enabled below, so customers know how to pay you."
        dirty={dirty}
        saving={save.isPending}
        onSave={() => save.mutate()}
        onReset={reset}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          {text('bankName', 'Bank name')}
          {text('bankAccountName', 'Account name')}
          {text('bankAccountNumber', 'Account number')}
          {text('bankIfscSwift', 'IFSC / SWIFT')}
          {text('bankBranch', 'Branch')}
          {text('upiId', 'UPI ID', 'Optional — any similar payment handle')}
        </div>

        <div className="mt-4">
          <Field label="Payment instructions" description="Printed alongside the details above.">
            {(p) => (
              <Textarea
                {...p}
                value={draft.defaultPaymentInstructions}
                onChange={(e) => setDraft({ ...draft, defaultPaymentInstructions: e.target.value })}
                rows={3}
              />
            )}
          </Field>
        </div>

        <div className="mt-4 border-t border-line pt-4">
          <SwitchField
            label="Show payment details on documents"
            checked={draft.showPaymentDetailsOnDocuments}
            onCheckedChange={(checked) => setDraft({ ...draft, showPaymentDetailsOnDocuments: checked })}
          />
        </div>
      </SettingsPanel>

      <CrudTablePage<PaymentMethod>
        title="Payment methods"
        description="How customers can pay you — entirely up to your business."
        singular="Payment method"
        icon={CreditCard}
        emptyDescription="Add the ways your customers can pay, e.g. bank transfer, card, cash."
        // eslint-disable-next-line react-hooks/rules-of-hooks
        useList={(params: ListParams) => {
          const query = usePaymentMethods();
          void params;
          return {
            data: query.data,
            isLoading: query.isLoading,
            error: query.error,
            refetch: () => void query.refetch(),
          };
        }}
        service={paymentMethodsService}
        invalidate={['payment-methods']}
        canCreate={canCreate}
        canUpdate={canUpdate}
        canDelete={canDelete}
        columns={[
          { key: 'name', header: 'Name', sortable: true, cardTitle: true, cell: (row) => row.name },
          { key: 'description', header: 'Description', hideBelow: 'md', cell: (row) => row.description ?? '—' },
          {
            key: 'requiresReference',
            header: 'Needs reference',
            hideBelow: 'lg',
            cell: (row) => (row.requiresReference ? 'Yes' : 'No'),
          },
          {
            key: 'isActive',
            header: 'Status',
            cell: (row) =>
              row.isActive ? <Badge tone="success">Active</Badge> : <Badge tone="neutral">Inactive</Badge>,
          },
        ]}
        fields={[
          { key: 'name', label: 'Name', type: 'text', required: true },
          { key: 'description', label: 'Description', type: 'textarea' },
          {
            key: 'requiresReference',
            label: 'Requires a reference number',
            type: 'switch',
            read: (row) => row.requiresReference,
          },
          { key: 'isActive', label: 'Active', type: 'switch', read: (row) => row.isActive },
        ]}
      />
    </div>
  );
}

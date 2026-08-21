import { SettingsPanel, useDraft } from './shared';
import { SwitchField } from '@/components/ui/Toggle';
import { useAppMutation } from '@/hooks/queries';
import { settingsService } from '@/services/resources';
import { useBusiness } from '@/stores/BusinessContext';

interface Draft {
  notifyOnPayment: boolean;
  notifyOnQuotationAccept: boolean;
  notifyOnOverdue: boolean;
}

export function NotificationsSettings(): React.ReactElement {
  const { settings } = useBusiness();

  const { draft, setDraft, dirty, reset } = useDraft<Draft>({
    notifyOnPayment: settings.notifyOnPayment,
    notifyOnQuotationAccept: settings.notifyOnQuotationAccept,
    notifyOnOverdue: settings.notifyOnOverdue,
  });

  const save = useAppMutation<unknown, void>({
    mutationFn: () => settingsService.updateSettings(draft),
    invalidate: ['bootstrap'],
    successMessage: 'Notification settings saved',
  });

  return (
    <SettingsPanel
      title="In-app notifications"
      description="Choose which events create a notification for your team."
      dirty={dirty}
      saving={save.isPending}
      onSave={() => save.mutate()}
      onReset={reset}
    >
      <div className="divide-y divide-line">
        <div className="py-3 first:pt-0">
          <SwitchField
            label="Payment received"
            description="Notify when a payment is recorded against an invoice."
            checked={draft.notifyOnPayment}
            onCheckedChange={(checked) => setDraft({ ...draft, notifyOnPayment: checked })}
          />
        </div>
        <div className="py-3">
          <SwitchField
            label="Quotation accepted"
            description="Notify when a customer accepts a quotation."
            checked={draft.notifyOnQuotationAccept}
            onCheckedChange={(checked) => setDraft({ ...draft, notifyOnQuotationAccept: checked })}
          />
        </div>
        <div className="py-3 last:pb-0">
          <SwitchField
            label="Invoice overdue"
            description="Notify when an invoice passes its due date unpaid."
            checked={draft.notifyOnOverdue}
            onCheckedChange={(checked) => setDraft({ ...draft, notifyOnOverdue: checked })}
          />
        </div>
      </div>
    </SettingsPanel>
  );
}

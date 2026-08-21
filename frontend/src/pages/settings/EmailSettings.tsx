import { Lock, Mail } from 'lucide-react';
import { SettingsPanel, useDraft } from './shared';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { SwitchField } from '@/components/ui/Toggle';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { useAppMutation } from '@/hooks/queries';
import { settingsService } from '@/services/resources';
import { useBusiness } from '@/stores/BusinessContext';

interface Draft {
  emailFromName: string;
  emailReplyTo: string;
  emailEnabled: boolean;
}

/**
 * SMTP host, port, username and password are backend environment variables,
 * never settings rows — this screen shows the sender identity only and never
 * renders a password field (docs/09-operations.md §5).
 */
export function EmailSettings(): React.ReactElement {
  const { settings } = useBusiness();
  const toast = useToast();

  const { draft, setDraft, dirty, reset } = useDraft<Draft>({
    emailFromName: settings.emailFromName ?? '',
    emailReplyTo: settings.emailReplyTo ?? '',
    emailEnabled: settings.emailEnabled,
  });

  const save = useAppMutation<unknown, void>({
    mutationFn: () =>
      settingsService.updateSettings({
        ...draft,
        emailFromName: draft.emailFromName || null,
        emailReplyTo: draft.emailReplyTo || null,
      }),
    invalidate: ['bootstrap'],
    successMessage: 'Email settings saved',
  });

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 rounded-lg border border-line bg-subtle/50 px-3 py-2.5 text-sm text-content-secondary">
        <Lock className="mt-0.5 h-4 w-4 shrink-0 text-content-muted" />
        <span>
          SMTP host, port and credentials are configured in the backend environment and are never
          shown or entered here — that boundary keeps them out of the browser entirely.
        </span>
      </div>

      <SettingsPanel
        title="Sender identity"
        dirty={dirty}
        saving={save.isPending}
        onSave={() => save.mutate()}
        onReset={reset}
        footerNote={
          <span className="inline-flex items-center gap-1">
            <Mail className="h-3.5 w-3.5" />
            SMTP host: <span className="font-mono text-content-secondary">configured on backend</span>
          </span>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="From name" description="Shown as the sender in the customer's inbox.">
            {(p) => (
              <Input
                {...p}
                value={draft.emailFromName}
                onChange={(e) => setDraft({ ...draft, emailFromName: e.target.value })}
              />
            )}
          </Field>
          <Field label="Reply-to address">
            {(p) => (
              <Input
                {...p}
                type="email"
                value={draft.emailReplyTo}
                onChange={(e) => setDraft({ ...draft, emailReplyTo: e.target.value })}
              />
            )}
          </Field>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
          <SwitchField
            label="Email sending enabled"
            description="Off until SMTP is configured on the backend."
            checked={draft.emailEnabled}
            onCheckedChange={(checked) => setDraft({ ...draft, emailEnabled: checked })}
          />
          <Button
            variant="secondary"
            size="sm"
            onClick={() =>
              toast.info('Test email requires the backend', 'Connect the API to send a real test message.')
            }
          >
            Send test email
          </Button>
        </div>
      </SettingsPanel>
    </div>
  );
}

import { useState } from 'react';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/Card';
import { Field } from '@/components/ui/Field';
import { Input, NativeSelect } from '@/components/ui/Input';
import { SwitchField } from '@/components/ui/Toggle';
import { Button } from '@/components/ui/Button';
import { FormSkeleton } from '@/components/ui/Skeleton';
import { ErrorState } from '@/components/ui/States';
import { useAppMutation, useNumbering } from '@/hooks/queries';
import { settingsService } from '@/services/resources';
import { usePermission } from '@/stores/BusinessContext';
import { humanize } from '@/lib/format';
import type { NumberingSettings as NumberingRow } from '@/types';

/**
 * Server-side, race-safe number allocation is documented in
 * docs/03-database-schema.md §5 — this screen only edits the format, never
 * generates a number itself. The preview is a sample the server computes,
 * shown here so an admin can see the effect before saving.
 */
export function NumberingSettings(): React.ReactElement {
  const { data, isLoading, error, refetch } = useNumbering();
  const canEdit = usePermission('settings.update');

  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />;
  if (isLoading || !data) return <FormSkeleton fields={4} />;

  return (
    <div className="space-y-4">
      {data.data.map((row) => (
        <NumberingCard key={row.id} row={row} canEdit={canEdit} />
      ))}
    </div>
  );
}

function NumberingCard({ row, canEdit }: { row: NumberingRow; canEdit: boolean }): React.ReactElement {
  const [draft, setDraft] = useState(row);
  const dirty = JSON.stringify(draft) !== JSON.stringify(row);

  const save = useAppMutation<NumberingRow, void>({
    mutationFn: () => settingsService.updateNumbering(row.id, draft),
    invalidate: ['numbering'],
    successMessage: 'Numbering saved',
    onSuccess: (saved) => setDraft(saved),
  });

  const preview = (() => {
    const parts: string[] = [draft.prefix];
    if (draft.includeYear) parts.push(String(new Date().getFullYear()));
    if (draft.includeMonth) parts.push(String(new Date().getMonth() + 1).padStart(2, '0'));
    parts.push(String(draft.startNumber).padStart(draft.padding, '0'));
    return parts.filter(Boolean).join(draft.separator) + draft.suffix;
  })();

  return (
    <Card>
      <CardHeader>
        <CardTitle>{humanize(row.documentType)} numbering</CardTitle>
      </CardHeader>
      <CardContent>
        <fieldset disabled={!canEdit} className={!canEdit ? 'opacity-70' : undefined}>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Prefix">
              {(p) => (
                <Input {...p} value={draft.prefix} onChange={(e) => setDraft({ ...draft, prefix: e.target.value })} />
              )}
            </Field>
            <Field label="Separator">
              {(p) => (
                <Input {...p} value={draft.separator} onChange={(e) => setDraft({ ...draft, separator: e.target.value })} maxLength={2} />
              )}
            </Field>
            <Field label="Suffix">
              {(p) => (
                <Input {...p} value={draft.suffix} onChange={(e) => setDraft({ ...draft, suffix: e.target.value })} />
              )}
            </Field>
            <Field label="Number padding" description="Digits, e.g. 5 → 00001">
              {(p) => (
                <NativeSelect {...p} value={draft.padding} onChange={(e) => setDraft({ ...draft, padding: Number(e.target.value) })}>
                  {[3, 4, 5, 6, 7, 8].map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </NativeSelect>
              )}
            </Field>
            <Field label="Starting number">
              {(p) => (
                <Input
                  {...p}
                  type="number"
                  min={0}
                  value={draft.startNumber}
                  onChange={(e) => setDraft({ ...draft, startNumber: Number(e.target.value) })}
                  className="tabular"
                />
              )}
            </Field>
            <Field label="Reset frequency">
              {(p) => (
                <NativeSelect
                  {...p}
                  value={draft.resetFrequency}
                  onChange={(e) => setDraft({ ...draft, resetFrequency: e.target.value as NumberingRow['resetFrequency'] })}
                >
                  <option value="never">Never</option>
                  <option value="yearly">Every year</option>
                  <option value="monthly">Every month</option>
                  <option value="daily">Every day</option>
                </NativeSelect>
              )}
            </Field>
          </div>

          <div className="mt-4 flex flex-wrap gap-6">
            <SwitchField
              label="Include year"
              checked={draft.includeYear}
              onCheckedChange={(checked) => setDraft({ ...draft, includeYear: checked })}
            />
            <SwitchField
              label="Include month"
              checked={draft.includeMonth}
              onCheckedChange={(checked) => setDraft({ ...draft, includeMonth: checked })}
            />
          </div>

          <div className="mt-4 rounded-lg border border-line bg-subtle/50 p-3">
            <p className="text-xs font-medium text-content-secondary">Preview</p>
            <p className="mt-1 font-mono text-h3 text-content">{preview}</p>
            <p className="mt-1 text-xs font-normal text-content-muted">
              Changing this format never renumbers existing documents.
            </p>
          </div>
        </fieldset>
      </CardContent>
      {dirty && canEdit && (
        <CardFooter>
          <Button variant="ghost" size="sm" onClick={() => setDraft(row)}>
            Discard
          </Button>
          <Button variant="primary" size="sm" loading={save.isPending} onClick={() => save.mutate()}>
            Save
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}

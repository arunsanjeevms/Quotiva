import { useEffect, useState } from 'react';
import { Save } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { usePermission } from '@/stores/BusinessContext';
import { cn } from '@/lib/cn';

/**
 * Settings panel with a save bar that only appears once something changed, so
 * a read-only visit shows no call to action.
 */
export function SettingsPanel({
  title,
  description,
  children,
  dirty,
  saving,
  onSave,
  onReset,
  footerNote,
  className,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  dirty: boolean;
  saving: boolean;
  onSave: () => void;
  onReset?: () => void;
  footerNote?: React.ReactNode;
  className?: string;
}): React.ReactElement {
  const canEdit = usePermission('settings.update');

  return (
    <Card className={className}>
      <CardHeader>
        <div>
          <CardTitle>{title}</CardTitle>
          {description && <p className="mt-0.5 text-sm text-content-muted">{description}</p>}
        </div>
      </CardHeader>
      <CardContent>
        <fieldset disabled={!canEdit} className={cn(!canEdit && 'opacity-70')}>
          {children}
        </fieldset>
        {!canEdit && (
          <p className="mt-4 rounded border border-line bg-subtle px-3 py-2 text-sm text-content-muted">
            You have read-only access to settings. Ask an administrator to make changes.
          </p>
        )}
      </CardContent>
      {(dirty || footerNote) && canEdit && (
        <CardFooter className="justify-between">
          <span className="text-sm text-content-muted">{footerNote}</span>
          <span className="flex gap-2">
            {dirty && onReset && (
              <Button variant="ghost" size="sm" onClick={onReset}>
                Discard
              </Button>
            )}
            {dirty && (
              <Button variant="primary" size="sm" loading={saving} onClick={onSave}>
                <Save className="h-3.5 w-3.5" />
                Save changes
              </Button>
            )}
          </span>
        </CardFooter>
      )}
    </Card>
  );
}

/** Local draft state that resets whenever the server value changes. */
export function useDraft<T>(source: T): {
  draft: T;
  setDraft: (next: T | ((prev: T) => T)) => void;
  dirty: boolean;
  reset: () => void;
} {
  const [draft, setDraft] = useState<T>(source);
  const [baseline, setBaseline] = useState<T>(source);

  useEffect(() => {
    setDraft(source);
    setBaseline(source);
  }, [source]);

  return {
    draft,
    setDraft,
    dirty: JSON.stringify(draft) !== JSON.stringify(baseline),
    reset: () => setDraft(baseline),
  };
}

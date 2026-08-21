import { AlertTriangle, Database, Info } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/States';
import { useAppMutation, useBackups } from '@/hooks/queries';
import { settingsService } from '@/services/resources';
import { usePermission } from '@/stores/BusinessContext';
import { formatDateTime, formatFileSize } from '@/lib/format';
import type { BackupJob } from '@/types';

/**
 * Every job here reflects a real attempt: it reaches "completed" only once an
 * artifact exists, and a failure shows the real error rather than a fake
 * success (docs/08 §19, docs/09 §6). Nothing on this screen simulates a result.
 */
export function BackupSettings(): React.ReactElement {
  const canCreate = usePermission('backup.create');
  const { data, isLoading } = useBackups();

  const createBackup = useAppMutation<BackupJob, { scope: string; format: string }>({
    mutationFn: (body) => settingsService.createBackup(body),
    invalidate: ['backups'],
    successMessage: 'Backup started — this may take a few minutes',
  });

  const statusTone = (status: BackupJob['status']) =>
    status === 'completed' ? 'success' : status === 'failed' ? 'danger' : status === 'running' ? 'info' : 'neutral';

  return (
    <>
      <PageHeader title="Backup" description="Export your data, or rely on your database provider's managed backups." />

      <div className="mb-4 flex items-start gap-2 rounded-lg border border-info/20 bg-info-bg px-3 py-2.5 text-sm text-content-secondary">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-info" />
        <span>
          This exports your data through the backend using server-held credentials — never database
          passwords in the browser. It is a convenience for portability, not a substitute for your
          database provider's own backup and point-in-time recovery.
        </span>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Start a backup</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            <Button
              variant="primary"
              disabled={!canCreate}
              loading={createBackup.isPending}
              onClick={() => createBackup.mutate({ scope: 'business_export', format: 'csv_zip' })}
            >
              <Database className="h-3.5 w-3.5" />
              Export this business (CSV)
            </Button>
          </div>
          {!canCreate && (
            <p className="mt-3 text-sm text-content-muted">
              Backups require the Super Admin role.
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Backup history</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 text-sm text-content-muted">Loading…</div>
          ) : !data?.data.length ? (
            <EmptyState
              icon={Database}
              title="No backups yet"
              description="Backups you start will appear here with their real status."
              className="border-0"
            />
          ) : (
            <ul className="divide-y divide-line">
              {data.data.map((job) => (
                <li key={job.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Badge tone={statusTone(job.status)}>{job.status}</Badge>
                      <span className="text-sm text-content-secondary">
                        {job.scope === 'business_export' ? 'Business export' : 'Full dump'}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-content-muted">
                      Started {formatDateTime(job.createdAt)}
                      {job.finishedAt && ` · finished ${formatDateTime(job.finishedAt)}`}
                    </p>
                    {job.error && (
                      <p className="mt-1 flex items-start gap-1.5 text-sm text-danger">
                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        {job.error}
                      </p>
                    )}
                  </div>
                  {job.status === 'completed' && (
                    <span className="shrink-0 text-sm text-content-muted">
                      {formatFileSize(job.sizeBytes)}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  );
}

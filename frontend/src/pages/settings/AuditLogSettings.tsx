import { useState } from 'react';
import { ChevronDown, ChevronRight, ScrollText } from 'lucide-react';
import { PageHeader, Toolbar } from '@/components/ui/PageHeader';
import { Input } from '@/components/ui/Input';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Pagination } from '@/components/ui/Pagination';
import { EmptyState, NoResultsState } from '@/components/ui/States';
import { DateRangePicker, FilterReset, type DateRangeValue } from '@/components/ui/DatePicker';
import { useAuditLogs } from '@/hooks/queries';
import { useListParams } from '@/hooks/useListParams';
import { useBusiness } from '@/stores/BusinessContext';
import { formatDateTime, humanize } from '@/lib/format';
import type { AuditLog } from '@/types';

/**
 * Read-only by construction: audit_logs is insert-only in the backend schema
 * (docs/03 §13), so nothing on this screen can edit or delete an entry.
 */
export function AuditLogSettings(): React.ReactElement {
  const { business } = useBusiness();
  const list = useListParams({ sort: 'createdAt', order: 'desc' });
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data, isLoading, error, refetch } = useAuditLogs(list.params);

  const range: DateRangeValue = {
    preset: (list.filters['range'] as DateRangeValue['preset']) ?? 'this_month',
    from: list.filters['from'],
    to: list.filters['to'],
  };

  const columns: Column<AuditLog>[] = [
    {
      key: 'createdAt',
      header: 'When',
      cardTitle: true,
      cell: (row) => formatDateTime(row.createdAt, business.dateFormat),
    },
    { key: 'userEmail', header: 'User', cell: (row) => row.userEmail ?? 'System' },
    {
      key: 'action',
      header: 'Action',
      cell: (row) => humanize(row.action.replace(/\./g, ' ')),
    },
    { key: 'entityLabel', header: 'Record', hideBelow: 'md', cell: (row) => row.entityLabel ?? '—' },
    {
      key: 'expand',
      header: '',
      width: 'w-8',
      hideOnCard: true,
      cell: (row) =>
        expanded === row.id ? (
          <ChevronDown className="h-4 w-4 text-content-muted" />
        ) : (
          <ChevronRight className="h-4 w-4 text-content-muted" />
        ),
    },
  ];

  return (
    <>
      <PageHeader title="Audit logs" description="A record of every action taken in this business." />

      <Toolbar>
        <Input
          value={list.q}
          onChange={(e) => list.setQuery(e.target.value)}
          placeholder="Search action, record or user…"
          className="h-8 sm:w-64"
          aria-label="Search audit logs"
        />
        <DateRangePicker
          value={range}
          onChange={(next) => {
            list.setFilter('range', next.preset);
            list.setFilter('from', next.from);
            list.setFilter('to', next.to);
          }}
        />
        {list.hasFilters && <FilterReset onClick={list.clearFilters} />}
      </Toolbar>

      <DataTable
        columns={columns}
        rows={data?.data}
        rowKey={(row) => row.id}
        loading={isLoading}
        error={error}
        onRetry={() => void refetch()}
        onRowClick={(row) => setExpanded(expanded === row.id ? null : row.id)}
        empty={
          list.hasFilters ? (
            <NoResultsState onClear={list.clearFilters} />
          ) : (
            <EmptyState
              icon={ScrollText}
              title="No activity recorded yet"
              description="Every mutation in the app will be logged here."
            />
          )
        }
      />

      {expanded && data && (
        <div className="mt-3 rounded-lg border border-line bg-subtle/40 p-3">
          {(() => {
            const row = data.data.find((r) => r.id === expanded);
            if (!row) return null;
            return (
              <dl className="grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-content-muted">Entity type</dt>
                  <dd className="text-content">{row.entityType ?? '—'}</dd>
                </div>
                <div>
                  <dt className="text-content-muted">Entity ID</dt>
                  <dd className="font-mono text-xs text-content">{row.entityId ?? '—'}</dd>
                </div>
                <div>
                  <dt className="text-content-muted">IP address</dt>
                  <dd className="text-content">{row.ipAddress ?? '—'}</dd>
                </div>
                <div>
                  <dt className="text-content-muted">Metadata</dt>
                  <dd className="font-mono text-xs text-content">
                    {Object.keys(row.metadata).length > 0 ? JSON.stringify(row.metadata) : '—'}
                  </dd>
                </div>
              </dl>
            );
          })()}
        </div>
      )}

      <div className="mt-4">
        <Pagination meta={data?.meta} onPageChange={list.setPage} onPageSizeChange={list.setPageSize} />
      </div>
    </>
  );
}

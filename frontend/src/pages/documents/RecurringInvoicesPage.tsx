import { Info, Play, Repeat } from 'lucide-react';
import { PageHeader, Toolbar } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Pagination } from '@/components/ui/Pagination';
import { EmptyState, NoResultsState } from '@/components/ui/States';
import { Badge } from '@/components/ui/Badge';
import { FilterReset } from '@/components/ui/DatePicker';
import { useAppMutation, useRecurringInvoices } from '@/hooks/queries';
import { recurringService } from '@/services/resources';
import { useListParams } from '@/hooks/useListParams';
import { useBusiness, useCurrency, usePermission } from '@/stores/BusinessContext';
import { formatDate, formatMoney, humanize } from '@/lib/format';
import type { Invoice, RecurringInvoice } from '@/types';

/**
 * Recurring schedules with manual generation.
 *
 * No scheduler is deployed in this build, so the UI says plainly that
 * generation is manual rather than implying automation that does not exist
 * (ADR-012). The generation call itself is the exact entry point a cron job
 * would use later.
 */
export function RecurringInvoicesPage(): React.ReactElement {
  const currency = useCurrency();
  const { business } = useBusiness();
  const list = useListParams({ sort: 'nextRunDate', order: 'asc' });
  const canGenerate = usePermission('recurring.generate');

  const { data, isLoading, error, refetch } = useRecurringInvoices(list.params);

  const generate = useAppMutation<{ generated: number; invoices: Invoice[] }, string>({
    mutationFn: (id) => recurringService.generate(id),
    invalidate: ['recurring', 'invoices', 'dashboard'],
    successMessage: (result) =>
      result.generated > 0
        ? `Generated ${result.generated} invoice${result.generated > 1 ? 's' : ''}`
        : 'Nothing is due yet for this schedule',
  });

  const today = new Date().toISOString().slice(0, 10);

  const columns: Column<RecurringInvoice>[] = [
    {
      key: 'title',
      header: 'Schedule',
      sortable: true,
      cardTitle: true,
      cell: (row) => (
        <div className="min-w-0">
          <span className="block truncate font-medium text-content">{row.title}</span>
          <span className="block truncate text-sm text-content-muted">{row.customerName}</span>
        </div>
      ),
    },
    {
      key: 'frequency',
      header: 'Frequency',
      cell: (row) =>
        row.intervalCount > 1
          ? `Every ${row.intervalCount} × ${humanize(row.frequency).toLowerCase()}`
          : humanize(row.frequency),
    },
    {
      key: 'nextRunDate',
      header: 'Next run',
      sortable: true,
      cell: (row) => {
        if (!row.nextRunDate) return <span className="text-content-muted">—</span>;
        const due = row.nextRunDate <= today;
        return (
          <span className={due ? 'font-medium text-warning' : ''}>
            {formatDate(row.nextRunDate, business.dateFormat)}
            {due && ' · due'}
          </span>
        );
      },
    },
    {
      key: 'occurrencesGenerated',
      header: 'Generated',
      align: 'right',
      numeric: true,
      hideBelow: 'lg',
      cell: (row) =>
        row.maxOccurrences
          ? `${row.occurrencesGenerated} / ${row.maxOccurrences}`
          : String(row.occurrencesGenerated),
    },
    {
      key: 'grandTotal',
      header: 'Amount',
      align: 'right',
      numeric: true,
      cell: (row) => formatMoney(row.grandTotal, currency),
    },
    {
      key: 'isActive',
      header: 'Status',
      cell: (row) =>
        row.isActive ? <Badge tone="success">Active</Badge> : <Badge tone="neutral">Paused</Badge>,
    },
  ];

  return (
    <>
      <PageHeader
        title="Recurring invoices"
        description="Schedules for work you bill on a repeating basis."
      />

      <div className="mb-4 flex items-start gap-2 rounded-lg border border-info/20 bg-info-bg px-3 py-2.5 text-sm text-content-secondary">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-info" />
        <span>
          Generation is manual in this build — use <strong>Generate</strong> on a schedule that is
          due. Automatic scheduling is not running, so nothing is created without you asking.
        </span>
      </div>

      <Toolbar>
        <Input
          value={list.q}
          onChange={(e) => list.setQuery(e.target.value)}
          placeholder="Search schedules…"
          className="h-8 sm:w-64"
          aria-label="Search recurring invoices"
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
        sort={list.sort}
        onSortChange={list.setSort}
        empty={
          list.hasFilters ? (
            <NoResultsState onClear={list.clearFilters} />
          ) : (
            <EmptyState
              icon={Repeat}
              title="No recurring invoices"
              description="Set up a schedule for retainers, subscriptions or any work you bill repeatedly."
            />
          )
        }
        actions={(row) => {
          const due = Boolean(row.nextRunDate && row.nextRunDate <= today && row.isActive);
          return canGenerate ? (
            <Button
              variant={due ? 'primary' : 'ghost'}
              size="sm"
              disabled={!row.isActive}
              loading={generate.isPending && generate.variables === row.id}
              onClick={() => generate.mutate(row.id)}
            >
              <Play className="h-3.5 w-3.5" />
              Generate
            </Button>
          ) : null;
        }}
      />

      <div className="mt-4">
        <Pagination meta={data?.meta} onPageChange={list.setPage} onPageSizeChange={list.setPageSize} />
      </div>
    </>
  );
}

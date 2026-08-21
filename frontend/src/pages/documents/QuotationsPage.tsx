import { Link, useNavigate } from 'react-router-dom';
import { FilePlus2, FileText, MoreHorizontal } from 'lucide-react';
import { PageHeader, Toolbar } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Input, NativeSelect } from '@/components/ui/Input';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Pagination } from '@/components/ui/Pagination';
import { EmptyState, NoResultsState } from '@/components/ui/States';
import { QuotationStatusBadge } from '@/components/ui/Badge';
import { Menu, MenuContent, MenuItem, MenuTrigger } from '@/components/ui/Menu';
import { DateRangePicker, FilterReset, type DateRangeValue } from '@/components/ui/DatePicker';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { useAppMutation, useCustomers, useQuotations } from '@/hooks/queries';
import { quotationsService } from '@/services/resources';
import { useListParams } from '@/hooks/useListParams';
import { useBusiness, useCurrency, usePermission } from '@/stores/BusinessContext';
import { formatDate, formatMoney } from '@/lib/format';
import type { Quotation } from '@/types';

export function QuotationsPage(): React.ReactElement {
  const navigate = useNavigate();
  const currency = useCurrency();
  const confirm = useConfirm();
  const { business } = useBusiness();
  const list = useListParams({ sort: 'issueDate', order: 'desc' });

  const canCreate = usePermission('quotation.create');

  const { data, isLoading, error, refetch } = useQuotations(list.params);
  const { data: customerData } = useCustomers({ pageSize: 100 });

  const range: DateRangeValue = {
    preset: (list.filters['range'] as DateRangeValue['preset']) ?? 'this_year',
    from: list.filters['from'],
    to: list.filters['to'],
  };

  const duplicate = useAppMutation<Quotation, string>({
    mutationFn: (id) => quotationsService.duplicate(id),
    invalidate: ['quotations'],
    successMessage: 'Quotation duplicated',
    onSuccess: (saved) => navigate(`/quotations/${saved.id}`),
  });

  const cancel = useAppMutation<Quotation, string>({
    mutationFn: (id) => quotationsService.cancel(id, 'Cancelled from the list'),
    invalidate: ['quotations'],
    successMessage: 'Quotation cancelled',
  });

  const columns: Column<Quotation>[] = [
    {
      key: 'quotationNumber',
      header: 'Number',
      sortable: true,
      cardTitle: true,
      cell: (row) => (
        <Link
          to={`/quotations/${row.id}`}
          className="rounded font-medium text-content hover:text-primary hover:underline"
        >
          {row.quotationNumber}
        </Link>
      ),
    },
    {
      key: 'customer',
      header: 'Customer',
      cell: (row) => (
        <span className="block truncate">{row.customer.companyName ?? row.customer.name}</span>
      ),
    },
    {
      key: 'issueDate',
      header: 'Date',
      sortable: true,
      hideBelow: 'md',
      cell: (row) => formatDate(row.issueDate, business.dateFormat),
    },
    {
      key: 'validUntil',
      header: 'Valid until',
      hideBelow: 'lg',
      cell: (row) => formatDate(row.validUntil, business.dateFormat),
    },
    { key: 'status', header: 'Status', cell: (row) => <QuotationStatusBadge status={row.status} /> },
    {
      key: 'grandTotal',
      header: 'Total',
      sortable: true,
      align: 'right',
      numeric: true,
      cell: (row) => (
        <span className="font-medium text-content">{formatMoney(row.grandTotal, currency)}</span>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Quotations"
        description="Everything you have proposed to customers."
        actions={
          canCreate && (
            <Button variant="primary" size="sm" asChild>
              <Link to="/quotations/new">
                <FilePlus2 className="h-3.5 w-3.5" />
                New quotation
              </Link>
            </Button>
          )
        }
      />

      <Toolbar>
        <Input
          value={list.q}
          onChange={(e) => list.setQuery(e.target.value)}
          placeholder="Search number, customer or reference…"
          className="h-8 sm:w-64"
          aria-label="Search quotations"
        />
        <NativeSelect
          value={list.filters['status'] ?? ''}
          onChange={(e) => list.setFilter('status', e.target.value || undefined)}
          className="h-8 w-auto text-sm"
          aria-label="Filter by status"
        >
          <option value="">All statuses</option>
          <option value="draft">Draft</option>
          <option value="sent">Sent</option>
          <option value="viewed">Viewed</option>
          <option value="accepted">Accepted</option>
          <option value="rejected">Rejected</option>
          <option value="expired">Expired</option>
          <option value="converted">Converted</option>
          <option value="cancelled">Cancelled</option>
        </NativeSelect>
        <NativeSelect
          value={list.filters['customerId'] ?? ''}
          onChange={(e) => list.setFilter('customerId', e.target.value || undefined)}
          className="h-8 w-auto max-w-48 text-sm"
          aria-label="Filter by customer"
        >
          <option value="">All customers</option>
          {(customerData?.data ?? []).map((customer) => (
            <option key={customer.id} value={customer.id}>
              {customer.companyName ?? customer.name}
            </option>
          ))}
        </NativeSelect>
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
        sort={list.sort}
        onSortChange={list.setSort}
        onRowClick={(row) => navigate(`/quotations/${row.id}`)}
        empty={
          list.hasFilters ? (
            <NoResultsState onClear={list.clearFilters} />
          ) : (
            <EmptyState
              icon={FileText}
              title="No quotations yet"
              description="Create your first quotation to start proposing work to customers."
              action={
                canCreate && (
                  <Button variant="primary" asChild>
                    <Link to="/quotations/new">Create quotation</Link>
                  </Button>
                )
              }
            />
          )
        }
        actions={(row) => (
          <Menu>
            <MenuTrigger asChild>
              <button
                type="button"
                aria-label={`Actions for ${row.quotationNumber}`}
                className="rounded p-1.5 text-content-muted hover:bg-subtle hover:text-content"
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
            </MenuTrigger>
            <MenuContent>
              <MenuItem onSelect={() => navigate(`/quotations/${row.id}`)}>View</MenuItem>
              {row.status === 'draft' && (
                <MenuItem onSelect={() => navigate(`/quotations/${row.id}/edit`)}>Edit</MenuItem>
              )}
              <MenuItem onSelect={() => duplicate.mutate(row.id)}>Duplicate</MenuItem>
              {!['cancelled', 'converted', 'rejected'].includes(row.status) && (
                <MenuItem
                  destructive
                  onSelect={async () => {
                    const ok = await confirm({
                      title: `Cancel ${row.quotationNumber}?`,
                      description: 'The quotation and its number are kept for your records.',
                      confirmLabel: 'Cancel quotation',
                      destructive: true,
                    });
                    if (ok) cancel.mutate(row.id);
                  }}
                >
                  Cancel
                </MenuItem>
              )}
            </MenuContent>
          </Menu>
        )}
      />

      <div className="mt-4">
        <Pagination meta={data?.meta} onPageChange={list.setPage} onPageSizeChange={list.setPageSize} />
      </div>
    </>
  );
}

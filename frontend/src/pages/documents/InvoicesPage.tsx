import { Link, useNavigate } from 'react-router-dom';
import { MoreHorizontal, Receipt } from 'lucide-react';
import { PageHeader, Toolbar } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Input, NativeSelect } from '@/components/ui/Input';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Pagination } from '@/components/ui/Pagination';
import { EmptyState, NoResultsState } from '@/components/ui/States';
import { InvoiceStatusBadge, PaymentStatusBadge } from '@/components/ui/Badge';
import { Menu, MenuContent, MenuItem, MenuTrigger } from '@/components/ui/Menu';
import { DateRangePicker, FilterReset, type DateRangeValue } from '@/components/ui/DatePicker';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { useAppMutation, useCustomers, useInvoices } from '@/hooks/queries';
import { invoicesService } from '@/services/resources';
import { useListParams } from '@/hooks/useListParams';
import { useBusiness, useCurrency, usePermission } from '@/stores/BusinessContext';
import { formatDate, formatMoney } from '@/lib/format';
import type { Invoice } from '@/types';

export function InvoicesPage(): React.ReactElement {
  const navigate = useNavigate();
  const currency = useCurrency();
  const confirm = useConfirm();
  const { business } = useBusiness();
  const list = useListParams({ sort: 'issueDate', order: 'desc' });

  const canCreate = usePermission('invoice.create');

  const { data, isLoading, error, refetch } = useInvoices(list.params);
  const { data: customerData } = useCustomers({ pageSize: 100 });

  const range: DateRangeValue = {
    preset: (list.filters['range'] as DateRangeValue['preset']) ?? 'this_year',
    from: list.filters['from'],
    to: list.filters['to'],
  };

  const duplicate = useAppMutation<Invoice, string>({
    mutationFn: (id) => invoicesService.duplicate(id),
    invalidate: ['invoices'],
    successMessage: 'Invoice duplicated',
    onSuccess: (saved) => navigate(`/invoices/${saved.id}`),
  });

  const cancel = useAppMutation<Invoice, string>({
    mutationFn: (id) => invoicesService.cancel(id, 'Cancelled from the list'),
    invalidate: ['invoices'],
    successMessage: 'Invoice cancelled',
  });

  const columns: Column<Invoice>[] = [
    {
      key: 'invoiceNumber',
      header: 'Number',
      sortable: true,
      cardTitle: true,
      cell: (row) => (
        <Link
          to={`/invoices/${row.id}`}
          className="rounded font-medium text-content hover:text-primary hover:underline"
        >
          {row.invoiceNumber}
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
      key: 'dueDate',
      header: 'Due',
      hideBelow: 'lg',
      cell: (row) => formatDate(row.dueDate, business.dateFormat),
    },
    { key: 'status', header: 'Status', hideBelow: 'xl', cell: (row) => <InvoiceStatusBadge status={row.status} /> },
    { key: 'paymentStatus', header: 'Payment', cell: (row) => <PaymentStatusBadge status={row.paymentStatus} /> },
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
    {
      key: 'amountDue',
      header: 'Due',
      align: 'right',
      numeric: true,
      hideBelow: 'lg',
      cell: (row) => formatMoney(row.amountDue, currency),
    },
  ];

  return (
    <>
      <PageHeader
        title="Invoices"
        description="Everything you have billed to customers."
        actions={
          canCreate && (
            <Button variant="primary" size="sm" asChild>
              <Link to="/invoices/new">
                <Receipt className="h-3.5 w-3.5" />
                New invoice
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
          aria-label="Search invoices"
        />
        <NativeSelect
          value={list.filters['paymentStatus'] ?? ''}
          onChange={(e) => list.setFilter('paymentStatus', e.target.value || undefined)}
          className="h-8 w-auto text-sm"
          aria-label="Filter by payment status"
        >
          <option value="">All payment states</option>
          <option value="unpaid">Unpaid</option>
          <option value="partially_paid">Partially paid</option>
          <option value="paid">Paid</option>
          <option value="overdue">Overdue</option>
        </NativeSelect>
        <NativeSelect
          value={list.filters['status'] ?? ''}
          onChange={(e) => list.setFilter('status', e.target.value || undefined)}
          className="h-8 w-auto text-sm"
          aria-label="Filter by status"
        >
          <option value="">All statuses</option>
          <option value="draft">Draft</option>
          <option value="sent">Sent</option>
          <option value="cancelled">Cancelled</option>
          <option value="void">Void</option>
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
        onRowClick={(row) => navigate(`/invoices/${row.id}`)}
        empty={
          list.hasFilters ? (
            <NoResultsState onClear={list.clearFilters} />
          ) : (
            <EmptyState
              icon={Receipt}
              title="No invoices yet"
              description="Create your first invoice to start tracking your business transactions."
              action={
                canCreate && (
                  <Button variant="primary" asChild>
                    <Link to="/invoices/new">Create invoice</Link>
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
                aria-label={`Actions for ${row.invoiceNumber}`}
                className="rounded p-1.5 text-content-muted hover:bg-subtle hover:text-content"
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
            </MenuTrigger>
            <MenuContent>
              <MenuItem onSelect={() => navigate(`/invoices/${row.id}`)}>View</MenuItem>
              {row.status === 'draft' && (
                <MenuItem onSelect={() => navigate(`/invoices/${row.id}/edit`)}>Edit</MenuItem>
              )}
              <MenuItem onSelect={() => duplicate.mutate(row.id)}>Duplicate</MenuItem>
              {!['cancelled', 'void'].includes(row.status) && (
                <MenuItem
                  destructive
                  onSelect={async () => {
                    const ok = await confirm({
                      title: `Cancel ${row.invoiceNumber}?`,
                      description: 'The invoice and its number are kept for your records.',
                      confirmLabel: 'Cancel invoice',
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

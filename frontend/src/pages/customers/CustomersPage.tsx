import { Link, useNavigate } from 'react-router-dom';
import { Archive, Download, MoreHorizontal, Pencil, UserPlus, Users } from 'lucide-react';
import { PageHeader, Toolbar } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Input, NativeSelect } from '@/components/ui/Input';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Pagination } from '@/components/ui/Pagination';
import { EmptyState, NoResultsState } from '@/components/ui/States';
import { Badge } from '@/components/ui/Badge';
import { Menu, MenuContent, MenuItem, MenuTrigger } from '@/components/ui/Menu';
import { FilterReset } from '@/components/ui/DatePicker';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/Toast';
import { useAppMutation, useCustomers } from '@/hooks/queries';
import { customersService } from '@/services/resources';
import { useListParams } from '@/hooks/useListParams';
import { useCurrency, usePermission } from '@/stores/BusinessContext';
import { formatDate, formatMoney } from '@/lib/format';
import type { Customer } from '@/types';

export function CustomersPage(): React.ReactElement {
  const navigate = useNavigate();
  const currency = useCurrency();
  const confirm = useConfirm();
  const toast = useToast();
  const list = useListParams({ sort: 'createdAt', order: 'desc' });

  const canCreate = usePermission('customer.create');
  const canUpdate = usePermission('customer.update');
  const canExport = usePermission('customer.export');

  const { data, isLoading, error, refetch } = useCustomers(list.params);

  const archive = useAppMutation<Customer, string>({
    mutationFn: (id) => customersService.archive(id),
    invalidate: ['customers', 'customer'],
    successMessage: 'Customer archived',
  });

  const restore = useAppMutation<Customer, string>({
    mutationFn: (id) => customersService.restore(id),
    invalidate: ['customers', 'customer'],
    successMessage: 'Customer restored',
  });

  const columns: Column<Customer>[] = [
    {
      key: 'name',
      header: 'Customer',
      sortable: true,
      cardTitle: true,
      cell: (row) => (
        <div className="min-w-0">
          <Link
            to={`/customers/${row.id}`}
            className="block truncate rounded font-medium text-content hover:text-primary hover:underline"
          >
            {row.companyName ?? row.name}
          </Link>
          {row.companyName && (
            <span className="block truncate text-sm text-content-muted">{row.name}</span>
          )}
        </div>
      ),
    },
    {
      key: 'email',
      header: 'Contact',
      hideBelow: 'md',
      cell: (row) => (
        <div className="min-w-0">
          {row.email && <span className="block truncate">{row.email}</span>}
          {row.phone && <span className="block truncate text-content-muted">{row.phone}</span>}
          {!row.email && !row.phone && '—'}
        </div>
      ),
    },
    { key: 'city', header: 'Location', hideBelow: 'xl', cell: (row) => row.city ?? '—' },
    {
      key: 'invoiced',
      header: 'Invoiced',
      align: 'right',
      numeric: true,
      hideBelow: 'lg',
      cell: (row) => formatMoney(row.stats?.totalInvoiced ?? '0', currency),
    },
    {
      key: 'outstanding',
      header: 'Outstanding',
      align: 'right',
      numeric: true,
      cell: (row) => {
        const value = row.stats?.outstanding ?? '0';
        return (
          <span className={Number(value) > 0 ? 'font-medium text-content' : 'text-content-muted'}>
            {formatMoney(value, currency)}
          </span>
        );
      },
    },
    {
      key: 'lastTransaction',
      header: 'Last activity',
      hideBelow: 'xl',
      cell: (row) => formatDate(row.stats?.lastTransactionAt),
    },
    {
      key: 'status',
      header: 'Status',
      hideBelow: 'lg',
      cell: (row) =>
        row.archivedAt ? <Badge tone="neutral">Archived</Badge> : <Badge tone="success">Active</Badge>,
    },
  ];

  return (
    <>
      <PageHeader
        title="Customers"
        description="Everyone you quote, invoice and collect from."
        actions={
          <>
            {canExport && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() =>
                  toast.info(
                    'Export runs on the backend',
                    'Connect the API to download a CSV or Excel file.',
                  )
                }
              >
                <Download className="h-3.5 w-3.5" />
                Export
              </Button>
            )}
            {canCreate && (
              <Button variant="primary" size="sm" asChild>
                <Link to="/customers/new">
                  <UserPlus className="h-3.5 w-3.5" />
                  New customer
                </Link>
              </Button>
            )}
          </>
        }
      />

      <Toolbar>
        <Input
          value={list.q}
          onChange={(e) => list.setQuery(e.target.value)}
          placeholder="Search name, company, email or phone…"
          className="h-8 sm:w-72"
          aria-label="Search customers"
        />
        <NativeSelect
          value={list.filters['includeArchived'] ?? ''}
          onChange={(e) => list.setFilter('includeArchived', e.target.value || undefined)}
          className="h-8 w-auto text-sm"
          aria-label="Filter by status"
        >
          <option value="">Active only</option>
          <option value="true">Include archived</option>
        </NativeSelect>
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
        onRowClick={(row) => navigate(`/customers/${row.id}`)}
        empty={
          list.hasFilters ? (
            <NoResultsState onClear={list.clearFilters} />
          ) : (
            <EmptyState
              icon={Users}
              title="No customers yet"
              description="Add your first customer to start creating quotations and invoices."
              action={
                canCreate && (
                  <Button variant="primary" asChild>
                    <Link to="/customers/new">Add customer</Link>
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
                aria-label={`Actions for ${row.companyName ?? row.name}`}
                className="rounded p-1.5 text-content-muted hover:bg-subtle hover:text-content"
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
            </MenuTrigger>
            <MenuContent>
              <MenuItem onSelect={() => navigate(`/customers/${row.id}`)}>View</MenuItem>
              {canUpdate && (
                <MenuItem onSelect={() => navigate(`/customers/${row.id}/edit`)}>
                  <Pencil className="h-3.5 w-3.5" />
                  Edit
                </MenuItem>
              )}
              {canUpdate &&
                (row.archivedAt ? (
                  <MenuItem onSelect={() => restore.mutate(row.id)}>Restore</MenuItem>
                ) : (
                  <MenuItem
                    destructive
                    onSelect={async () => {
                      const ok = await confirm({
                        title: `Archive ${row.companyName ?? row.name}?`,
                        description:
                          'Archived customers stay on their existing documents but no longer appear when creating new ones.',
                        confirmLabel: 'Archive',
                        destructive: true,
                      });
                      if (ok) archive.mutate(row.id);
                    }}
                  >
                    <Archive className="h-3.5 w-3.5" />
                    Archive
                  </MenuItem>
                ))}
            </MenuContent>
          </Menu>
        )}
      />

      <div className="mt-4">
        <Pagination
          meta={data?.meta}
          onPageChange={list.setPage}
          onPageSizeChange={list.setPageSize}
        />
      </div>
    </>
  );
}

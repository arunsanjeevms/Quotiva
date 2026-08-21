import { Link, useNavigate } from 'react-router-dom';
import { Archive, MoreHorizontal, Package, Pencil, Plus, Wrench } from 'lucide-react';
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
import { useAppMutation, useCategories, useProducts } from '@/hooks/queries';
import { productsService } from '@/services/resources';
import { useListParams } from '@/hooks/useListParams';
import { useCurrency, usePermission } from '@/stores/BusinessContext';
import { formatMoney, formatPercent } from '@/lib/format';
import type { Product, ProductKind } from '@/types';

/**
 * Products and services share one table and one form — the only difference is
 * the `kind` filter and the wording, so a service-only business never sees
 * product vocabulary it does not use (ADR-008).
 */
export function ProductsPage({ kind }: { kind: ProductKind }): React.ReactElement {
  const navigate = useNavigate();
  const currency = useCurrency();
  const confirm = useConfirm();
  const list = useListParams({ sort: 'createdAt', order: 'desc' });

  const canCreate = usePermission('product.create');
  const canUpdate = usePermission('product.update');

  const { data, isLoading, error, refetch } = useProducts({ ...list.params, kind });
  const { data: categoryData } = useCategories();

  const archive = useAppMutation<Product, string>({
    mutationFn: (id) => productsService.archive(id),
    invalidate: ['products'],
    successMessage: 'Item archived',
  });

  const restore = useAppMutation<Product, string>({
    mutationFn: (id) => productsService.restore(id),
    invalidate: ['products'],
    successMessage: 'Item restored',
  });

  const isService = kind === 'service';
  const label = isService ? 'Service' : 'Product';
  const basePath = isService ? '/services' : '/products';

  const columns: Column<Product>[] = [
    {
      key: 'name',
      header: 'Name',
      sortable: true,
      cardTitle: true,
      cell: (row) => (
        <div className="min-w-0">
          <Link
            to={`/products/${row.id}`}
            className="block truncate rounded font-medium text-content hover:text-primary hover:underline"
          >
            {row.name}
          </Link>
          {row.description && (
            <span className="block truncate text-sm text-content-muted">{row.description}</span>
          )}
        </div>
      ),
    },
    { key: 'sku', header: 'Code', hideBelow: 'md', cell: (row) => row.sku ?? '—' },
    { key: 'categoryName', header: 'Category', hideBelow: 'lg', cell: (row) => row.categoryName ?? '—' },
    { key: 'unitName', header: 'Unit', hideBelow: 'xl', cell: (row) => row.unitName ?? '—' },
    {
      key: 'sellingPrice',
      header: 'Price',
      sortable: true,
      align: 'right',
      numeric: true,
      cell: (row) => (
        <span className="font-medium text-content">{formatMoney(row.sellingPrice, currency)}</span>
      ),
    },
    {
      key: 'taxName',
      header: 'Tax',
      hideBelow: 'lg',
      cell: (row) =>
        row.taxName ? `${row.taxName} (${formatPercent(row.taxRate ?? 0)})` : 'No tax',
    },
    {
      key: 'status',
      header: 'Status',
      hideBelow: 'md',
      cell: (row) =>
        row.archivedAt ? (
          <Badge tone="neutral">Archived</Badge>
        ) : row.isActive ? (
          <Badge tone="success">Active</Badge>
        ) : (
          <Badge tone="warning">Inactive</Badge>
        ),
    },
  ];

  return (
    <>
      <PageHeader
        title={isService ? 'Services' : 'Products'}
        description={
          isService
            ? 'Work you sell by time or engagement.'
            : 'Goods you sell, with their codes and prices.'
        }
        actions={
          canCreate && (
            <Button variant="primary" size="sm" asChild>
              <Link to={`${basePath}/new`}>
                <Plus className="h-3.5 w-3.5" />
                New {label.toLowerCase()}
              </Link>
            </Button>
          )
        }
      />

      <Toolbar>
        <Input
          value={list.q}
          onChange={(e) => list.setQuery(e.target.value)}
          placeholder="Search name, code or description…"
          className="h-8 sm:w-72"
          aria-label={`Search ${label.toLowerCase()}s`}
        />
        <NativeSelect
          value={list.filters['categoryId'] ?? ''}
          onChange={(e) => list.setFilter('categoryId', e.target.value || undefined)}
          className="h-8 w-auto max-w-48 text-sm"
          aria-label="Filter by category"
        >
          <option value="">All categories</option>
          {(categoryData?.data ?? [])
            .filter((c) => c.isActive && (c.appliesTo === null || c.appliesTo === kind))
            .map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
        </NativeSelect>
        <NativeSelect
          value={list.filters['includeArchived'] ?? ''}
          onChange={(e) => list.setFilter('includeArchived', e.target.value || undefined)}
          className="h-8 w-auto text-sm"
          aria-label="Filter archived"
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
        onRowClick={(row) => navigate(`/products/${row.id}`)}
        empty={
          list.hasFilters ? (
            <NoResultsState onClear={list.clearFilters} />
          ) : (
            <EmptyState
              icon={isService ? Wrench : Package}
              title={`No ${label.toLowerCase()}s yet`}
              description={
                isService
                  ? 'Add the services you offer so they are one click away in a quotation.'
                  : 'Add the products you sell so they are one click away in a quotation.'
              }
              action={
                canCreate && (
                  <Button variant="primary" asChild>
                    <Link to={`${basePath}/new`}>Add {label.toLowerCase()}</Link>
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
                aria-label={`Actions for ${row.name}`}
                className="rounded p-1.5 text-content-muted hover:bg-subtle hover:text-content"
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
            </MenuTrigger>
            <MenuContent>
              {canUpdate && (
                <MenuItem onSelect={() => navigate(`/products/${row.id}`)}>
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
                        title: `Archive ${row.name}?`,
                        description:
                          'Archived items stay on existing documents but no longer appear when adding new lines.',
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
        <Pagination meta={data?.meta} onPageChange={list.setPage} onPageSizeChange={list.setPageSize} />
      </div>
    </>
  );
}

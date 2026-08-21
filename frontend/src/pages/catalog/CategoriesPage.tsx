import { FolderTree } from 'lucide-react';
import { CrudTablePage } from './CrudTablePage';
import { Badge } from '@/components/ui/Badge';
import { categoriesService } from '@/services/resources';
import { useCategories } from '@/hooks/queries';
import { usePermission } from '@/stores/BusinessContext';
import type { Category, ListParams } from '@/types';

export function CategoriesPage(): React.ReactElement {
  const canCreate = usePermission('catalog.create');
  const canUpdate = usePermission('catalog.update');
  const canDelete = usePermission('catalog.delete');

  return (
    <CrudTablePage<Category>
      title="Categories"
      description="Group your products and services however suits your business."
      singular="Category"
      icon={FolderTree}
      emptyDescription="Categories are optional, but they make long catalogs easier to filter."
      // eslint-disable-next-line react-hooks/rules-of-hooks
      useList={(params: ListParams) => {
        const query = useCategories();
        void params;
        return {
          data: query.data,
          isLoading: query.isLoading,
          error: query.error,
          refetch: () => void query.refetch(),
        };
      }}
      service={categoriesService}
      invalidate={['categories']}
      canCreate={canCreate}
      canUpdate={canUpdate}
      canDelete={canDelete}
      columns={[
        { key: 'name', header: 'Name', sortable: true, cardTitle: true, cell: (row) => row.name },
        {
          key: 'description',
          header: 'Description',
          hideBelow: 'md',
          cell: (row) => row.description ?? '—',
        },
        {
          key: 'appliesTo',
          header: 'Applies to',
          cell: (row) =>
            row.appliesTo === null ? 'Products and services' : row.appliesTo === 'product' ? 'Products' : 'Services',
        },
        {
          key: 'isActive',
          header: 'Status',
          cell: (row) =>
            row.isActive ? <Badge tone="success">Active</Badge> : <Badge tone="neutral">Inactive</Badge>,
        },
      ]}
      fields={[
        { key: 'name', label: 'Name', type: 'text', required: true, colSpan: 2 },
        { key: 'description', label: 'Description', type: 'textarea' },
        {
          key: 'appliesTo',
          label: 'Applies to',
          type: 'select',
          options: [
            { value: '', label: 'Products and services' },
            { value: 'product', label: 'Products only' },
            { value: 'service', label: 'Services only' },
          ],
          read: (row) => row.appliesTo ?? '',
        },
        { key: 'isActive', label: 'Active', type: 'switch', read: (row) => row.isActive },
      ]}
    />
  );
}

import { Calculator } from 'lucide-react';
import { CrudTablePage } from './CrudTablePage';
import { Badge } from '@/components/ui/Badge';
import { taxesService } from '@/services/resources';
import { useTaxes } from '@/hooks/queries';
import { usePermission } from '@/stores/BusinessContext';
import { formatPercent } from '@/lib/format';
import type { ListParams, Tax } from '@/types';

/**
 * Tax names and rates are data, never code. There is no built-in notion of any
 * particular tax regime — an administrator defines whatever applies to them.
 */
export function TaxesPage(): React.ReactElement {
  const canCreate = usePermission('tax.create');
  const canUpdate = usePermission('tax.update');
  const canDelete = usePermission('tax.delete');

  return (
    <CrudTablePage<Tax>
      title="Taxes"
      description="Define the tax rates that apply to your business. Names and rates are entirely yours."
      singular="Tax"
      icon={Calculator}
      emptyDescription="Add a rate — or a single zero-rate entry if your business does not charge tax."
      // eslint-disable-next-line react-hooks/rules-of-hooks
      useList={(params: ListParams) => {
        const query = useTaxes();
        void params;
        return {
          data: query.data,
          isLoading: query.isLoading,
          error: query.error,
          refetch: () => void query.refetch(),
        };
      }}
      service={taxesService}
      invalidate={['taxes']}
      canCreate={canCreate}
      canUpdate={canUpdate}
      canDelete={canDelete}
      columns={[
        { key: 'name', header: 'Name', sortable: true, cardTitle: true, cell: (row) => row.name },
        {
          key: 'rate',
          header: 'Rate',
          sortable: true,
          align: 'right',
          numeric: true,
          cell: (row) => formatPercent(row.rate),
        },
        {
          key: 'components',
          header: 'Components',
          hideBelow: 'md',
          cell: (row) =>
            row.components.length === 0
              ? 'Single rate'
              : row.components.map((c) => `${c.name} ${formatPercent(c.rate)}`).join(' + '),
        },
        {
          key: 'description',
          header: 'Description',
          hideBelow: 'xl',
          cell: (row) => row.description ?? '—',
        },
        {
          key: 'isActive',
          header: 'Status',
          cell: (row) =>
            row.isActive ? <Badge tone="success">Active</Badge> : <Badge tone="neutral">Inactive</Badge>,
        },
      ]}
      fields={[
        { key: 'name', label: 'Name', type: 'text', required: true, placeholder: 'e.g. Standard rate' },
        {
          key: 'rate',
          label: 'Rate (%)',
          type: 'number',
          required: true,
          description: 'A number between 0 and 100.',
        },
        { key: 'description', label: 'Description', type: 'textarea' },
        { key: 'isActive', label: 'Active', type: 'switch', read: (row) => row.isActive },
      ]}
    />
  );
}

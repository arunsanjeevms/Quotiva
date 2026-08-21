import { Ruler } from 'lucide-react';
import { CrudTablePage } from './CrudTablePage';
import { Badge } from '@/components/ui/Badge';
import { unitsService } from '@/services/resources';
import { useUnits } from '@/hooks/queries';
import { usePermission } from '@/stores/BusinessContext';
import type { ListParams, Unit } from '@/types';

/**
 * Units are entirely admin-defined. Hours, kilograms, licences, or something
 * specific to this business — nothing here assumes an industry.
 */
export function UnitsPage(): React.ReactElement {
  const canCreate = usePermission('catalog.create');
  const canUpdate = usePermission('catalog.update');
  const canDelete = usePermission('catalog.delete');

  return (
    <CrudTablePage<Unit>
      title="Units"
      description="The units you sell in — time, weight, licences, or anything else."
      singular="Unit"
      icon={Ruler}
      emptyDescription="Add the units your business measures work or goods in."
      // eslint-disable-next-line react-hooks/rules-of-hooks
      useList={(params: ListParams) => {
        const query = useUnits();
        void params;
        return {
          data: query.data,
          isLoading: query.isLoading,
          error: query.error,
          refetch: () => void query.refetch(),
        };
      }}
      service={unitsService}
      invalidate={['units']}
      canCreate={canCreate}
      canUpdate={canUpdate}
      canDelete={canDelete}
      columns={[
        { key: 'name', header: 'Name', sortable: true, cardTitle: true, cell: (row) => row.name },
        { key: 'abbreviation', header: 'Abbreviation', cell: (row) => row.abbreviation },
        {
          key: 'isActive',
          header: 'Status',
          cell: (row) =>
            row.isActive ? <Badge tone="success">Active</Badge> : <Badge tone="neutral">Inactive</Badge>,
        },
      ]}
      fields={[
        { key: 'name', label: 'Name', type: 'text', required: true, placeholder: 'e.g. Hour' },
        {
          key: 'abbreviation',
          label: 'Abbreviation',
          type: 'text',
          required: true,
          placeholder: 'e.g. hr',
          description: 'Shown in compact tables.',
        },
        { key: 'isActive', label: 'Active', type: 'switch', read: (row) => row.isActive },
      ]}
    />
  );
}

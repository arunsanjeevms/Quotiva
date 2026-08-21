import { SlidersHorizontal } from 'lucide-react';
import { CrudTablePage } from '@/pages/catalog/CrudTablePage';
import { Badge } from '@/components/ui/Badge';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { customFieldsService } from '@/services/resources';
import { useCustomFields } from '@/hooks/queries';
import { usePermission } from '@/stores/BusinessContext';
import { humanize } from '@/lib/format';
import type { CustomFieldDefinition, ListParams } from '@/types';

/**
 * Dynamic custom fields per entity (docs/08 §14) — the way this app adds a
 * business-specific field without a code change or a schema migration.
 */
export function CustomFieldsSettings(): React.ReactElement {
  const canCreate = usePermission('settings.update');
  const canUpdate = usePermission('settings.update');
  const canDelete = usePermission('settings.update');

  return (
    <CrudTablePage<CustomFieldDefinition>
      title="Custom fields"
      description="Add fields specific to your business, for customers, products, quotations or invoices."
      singular="Custom field"
      icon={SlidersHorizontal}
      emptyDescription="Define a field once and it appears on the relevant forms automatically."
      // eslint-disable-next-line react-hooks/rules-of-hooks
      useList={(params: ListParams) => {
        const query = useCustomFields();
        void params;
        return {
          data: query.data,
          isLoading: query.isLoading,
          error: query.error,
          refetch: () => void query.refetch(),
        };
      }}
      service={customFieldsService}
      invalidate={['custom-fields']}
      canCreate={canCreate}
      canUpdate={canUpdate}
      canDelete={canDelete}
      columns={[
        { key: 'label', header: 'Label', sortable: true, cardTitle: true, cell: (row) => row.label },
        { key: 'entityType', header: 'Applies to', cell: (row) => humanize(row.entityType) },
        { key: 'fieldType', header: 'Type', hideBelow: 'md', cell: (row) => humanize(row.fieldType) },
        {
          key: 'showOnDocument',
          header: 'On document',
          hideBelow: 'lg',
          cell: (row) => (row.showOnDocument ? 'Yes' : 'No'),
        },
        {
          key: 'isActive',
          header: 'Status',
          cell: (row) =>
            row.isActive ? <Badge tone="success">Active</Badge> : <Badge tone="neutral">Inactive</Badge>,
        },
      ]}
      fields={[
        { key: 'label', label: 'Label', type: 'text', required: true, placeholder: 'e.g. Purchase order' },
        {
          key: 'key',
          label: 'Field key',
          type: 'text',
          required: true,
          description: 'Lowercase, no spaces — used internally.',
          placeholder: 'purchase_order',
        },
        {
          key: 'entityType',
          label: 'Applies to',
          type: 'select',
          options: [
            { value: 'customer', label: 'Customers' },
            { value: 'product', label: 'Products & services' },
            { value: 'quotation', label: 'Quotations' },
            { value: 'invoice', label: 'Invoices' },
            { value: 'business', label: 'Business' },
          ],
        },
        {
          key: 'fieldType',
          label: 'Field type',
          type: 'select',
          options: [
            { value: 'text', label: 'Text' },
            { value: 'number', label: 'Number' },
            { value: 'date', label: 'Date' },
            { value: 'dropdown', label: 'Dropdown' },
            { value: 'checkbox', label: 'Checkbox' },
            { value: 'email', label: 'Email' },
            { value: 'phone', label: 'Phone' },
          ],
        },
        {
          key: 'isRequired',
          label: 'Required',
          type: 'switch',
          read: (row) => row.isRequired,
        },
        {
          key: 'showOnDocument',
          label: 'Show on document',
          type: 'switch',
          description: 'Prints in the document details block.',
          read: (row) => row.showOnDocument,
        },
        { key: 'isActive', label: 'Active', type: 'switch', read: (row) => row.isActive },
      ]}
      renderExtra={(values, setValues) =>
        values['fieldType'] === 'dropdown' ? (
          <Field label="Dropdown options" description="Comma-separated list of choices.">
            {(p) => (
              <Input
                {...p}
                value={Array.isArray(values['options']) ? (values['options'] as string[]).join(', ') : ''}
                onChange={(e) =>
                  setValues({
                    ...values,
                    options: e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
                  })
                }
                placeholder="Enterprise, Mid-market, Small business"
              />
            )}
          </Field>
        ) : null
      }
    />
  );
}

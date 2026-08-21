import { useEffect, useState } from 'react';
import { MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react';
import { PageHeader, Toolbar } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Input, NativeSelect, Textarea } from '@/components/ui/Input';
import { Field } from '@/components/ui/Field';
import { SwitchField } from '@/components/ui/Toggle';
import { Modal } from '@/components/ui/Modal';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { EmptyState, NoResultsState } from '@/components/ui/States';
import { Menu, MenuContent, MenuItem, MenuTrigger } from '@/components/ui/Menu';
import { FilterReset } from '@/components/ui/DatePicker';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { useAppMutation } from '@/hooks/queries';
import { useListParams } from '@/hooks/useListParams';
import { ApiError } from '@/lib/apiClient';
import type { ApiListResponse, ListParams } from '@/types';

export interface CrudFieldDef<T> {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'number' | 'select' | 'switch';
  required?: boolean;
  description?: string;
  placeholder?: string;
  options?: { value: string; label: string }[];
  /** Read the value out of an existing record when opening the edit form. */
  read?: (row: T) => string | boolean | number | null | undefined;
  colSpan?: 1 | 2;
}

export interface CrudTablePageProps<T extends { id: string }> {
  title: string;
  description: string;
  singular: string;
  icon: React.ComponentType<{ className?: string }>;
  emptyDescription: string;
  columns: Column<T>[];
  fields: CrudFieldDef<T>[];
  useList: (params: ListParams) => {
    data: ApiListResponse<T> | undefined;
    isLoading: boolean;
    error: unknown;
    refetch: () => void;
  };
  service: {
    create: (body: unknown) => Promise<T>;
    update: (id: string, body: unknown) => Promise<T>;
    remove: (id: string) => Promise<void>;
  };
  invalidate: string[];
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  /** Extra content rendered under the form, e.g. tax components. */
  renderExtra?: (
    values: Record<string, unknown>,
    setValues: (next: Record<string, unknown>) => void,
  ) => React.ReactNode;
}

/**
 * Shared CRUD screen for the small configuration tables — categories, units,
 * taxes and payment methods. They differ only in their fields, so they share
 * one implementation rather than four near-identical pages.
 */
export function CrudTablePage<T extends { id: string }>({
  title,
  description,
  singular,
  icon,
  emptyDescription,
  columns,
  fields,
  useList,
  service,
  invalidate,
  canCreate,
  canUpdate,
  canDelete,
  renderExtra,
}: CrudTablePageProps<T>): React.ReactElement {
  const confirm = useConfirm();
  const list = useListParams();
  const { data, isLoading, error, refetch } = useList(list.params);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<T | null>(null);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  const defaults = (): Record<string, unknown> => {
    const next: Record<string, unknown> = {};
    for (const field of fields) {
      next[field.key] = field.type === 'switch' ? true : field.type === 'number' ? '0' : '';
    }
    return next;
  };

  useEffect(() => {
    if (!open) return;
    if (editing) {
      const next: Record<string, unknown> = {};
      for (const field of fields) {
        const raw = field.read
          ? field.read(editing)
          : (editing as Record<string, unknown>)[field.key];
        next[field.key] = field.type === 'switch' ? Boolean(raw) : (raw ?? '');
      }
      setValues(next);
    } else {
      setValues(defaults());
    }
    setErrors({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing]);

  const save = useAppMutation<T, void>({
    mutationFn: () => (editing ? service.update(editing.id, values) : service.create(values)),
    invalidate,
    successMessage: `${singular} saved`,
    suppressErrorToast: true,
    onSuccess: () => setOpen(false),
  });

  const remove = useAppMutation<void, string>({
    mutationFn: (id) => service.remove(id),
    invalidate,
    successMessage: `${singular} deleted`,
  });

  const submit = (): void => {
    const next: Record<string, string> = {};
    for (const field of fields) {
      if (field.required && !String(values[field.key] ?? '').trim()) {
        next[field.key] = `${field.label} is required`;
      }
    }
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    save.mutate(undefined, {
      onError: (err) => {
        if (err instanceof ApiError) setErrors(err.fieldErrors);
      },
    });
  };

  return (
    <>
      <PageHeader
        title={title}
        description={description}
        actions={
          canCreate && (
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                setEditing(null);
                setOpen(true);
              }}
            >
              <Plus className="h-3.5 w-3.5" />
              New {singular.toLowerCase()}
            </Button>
          )
        }
      />

      <Toolbar>
        <Input
          value={list.q}
          onChange={(e) => list.setQuery(e.target.value)}
          placeholder={`Search ${title.toLowerCase()}…`}
          className="h-8 sm:w-64"
          aria-label={`Search ${title.toLowerCase()}`}
        />
        {list.hasFilters && <FilterReset onClick={list.clearFilters} />}
      </Toolbar>

      <DataTable
        columns={columns}
        rows={data?.data}
        rowKey={(row) => row.id}
        loading={isLoading}
        error={error}
        onRetry={refetch}
        sort={list.sort}
        onSortChange={list.setSort}
        empty={
          list.hasFilters ? (
            <NoResultsState onClear={list.clearFilters} />
          ) : (
            <EmptyState
              icon={icon}
              title={`No ${title.toLowerCase()} yet`}
              description={emptyDescription}
              action={
                canCreate && (
                  <Button
                    variant="primary"
                    onClick={() => {
                      setEditing(null);
                      setOpen(true);
                    }}
                  >
                    Add {singular.toLowerCase()}
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
                aria-label={`Actions for this ${singular.toLowerCase()}`}
                className="rounded p-1.5 text-content-muted hover:bg-subtle hover:text-content"
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
            </MenuTrigger>
            <MenuContent>
              {canUpdate && (
                <MenuItem
                  onSelect={() => {
                    setEditing(row);
                    setOpen(true);
                  }}
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Edit
                </MenuItem>
              )}
              {canDelete && (
                <MenuItem
                  destructive
                  onSelect={async () => {
                    const ok = await confirm({
                      title: `Delete this ${singular.toLowerCase()}?`,
                      description:
                        'If it is used on existing documents, the server will refuse and you can deactivate it instead.',
                      confirmLabel: 'Delete',
                      destructive: true,
                    });
                    if (ok) remove.mutate(row.id);
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete
                </MenuItem>
              )}
            </MenuContent>
          </Menu>
        )}
      />

      <Modal
        open={open}
        onOpenChange={setOpen}
        title={editing ? `Edit ${singular.toLowerCase()}` : `New ${singular.toLowerCase()}`}
        size="md"
        dismissible={false}
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" loading={save.isPending} onClick={submit}>
              Save
            </Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          {fields.map((field) => (
            <Field
              key={field.key}
              label={field.label}
              required={field.required}
              description={field.description}
              error={errors[field.key]}
              className={field.colSpan === 2 || field.type === 'textarea' ? 'sm:col-span-2' : ''}
            >
              {(p) => {
                const value = values[field.key];
                if (field.type === 'switch') {
                  return (
                    <SwitchField
                      label={field.label}
                      description={field.description}
                      checked={Boolean(value)}
                      onCheckedChange={(checked) =>
                        setValues({ ...values, [field.key]: checked })
                      }
                    />
                  );
                }
                if (field.type === 'textarea') {
                  return (
                    <Textarea
                      {...p}
                      value={String(value ?? '')}
                      onChange={(e) => setValues({ ...values, [field.key]: e.target.value })}
                      rows={3}
                      placeholder={field.placeholder}
                    />
                  );
                }
                if (field.type === 'select') {
                  return (
                    <NativeSelect
                      {...p}
                      value={String(value ?? '')}
                      onChange={(e) => setValues({ ...values, [field.key]: e.target.value })}
                    >
                      {field.options?.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </NativeSelect>
                  );
                }
                return (
                  <Input
                    {...p}
                    value={String(value ?? '')}
                    onChange={(e) => setValues({ ...values, [field.key]: e.target.value })}
                    inputMode={field.type === 'number' ? 'decimal' : undefined}
                    placeholder={field.placeholder}
                    invalid={Boolean(errors[field.key])}
                    className={field.type === 'number' ? 'tabular' : undefined}
                  />
                );
              }}
            </Field>
          ))}
          {renderExtra && <div className="sm:col-span-2">{renderExtra(values, setValues)}</div>}
        </div>
      </Modal>
    </>
  );
}

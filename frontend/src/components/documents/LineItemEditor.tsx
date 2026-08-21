import { useState } from 'react';
import { GripVertical, Package, Plus, Sparkles, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input, NativeSelect, Textarea } from '@/components/ui/Input';
import { Combobox } from '@/components/ui/Combobox';
import { CheckboxField } from '@/components/ui/Toggle';
import { Modal } from '@/components/ui/Modal';
import { Field } from '@/components/ui/Field';
import { Tooltip } from '@/components/ui/Menu';
import { EmptyState } from '@/components/ui/States';
import { emptyItem, type EditorItem } from './types';
import { calculateItem } from '@/lib/money';
import { formatMoney } from '@/lib/format';
import { useCurrency } from '@/stores/BusinessContext';
import { cn } from '@/lib/cn';
import type { Product, TaxMode, Tax, Unit } from '@/types';

export interface LineItemEditorProps {
  items: EditorItem[];
  onChange: (items: EditorItem[]) => void;
  products: Product[];
  taxes: Tax[];
  units: Unit[];
  taxMode: TaxMode;
  disabled?: boolean;
}

/**
 * The core of both document editors.
 *
 * Adding an item offers two equal paths: pick a catalog record, or enter a
 * custom item that requires no catalog record at all (docs/08 §6). Both produce
 * the same row shape, so downstream code has one path.
 */
export function LineItemEditor({
  items,
  onChange,
  products,
  taxes,
  units,
  taxMode,
  disabled,
}: LineItemEditorProps): React.ReactElement {
  const currency = useCurrency();
  const [customOpen, setCustomOpen] = useState(false);

  const update = (key: string, patch: Partial<EditorItem>): void => {
    onChange(items.map((item) => (item.key === key ? { ...item, ...patch } : item)));
  };

  const remove = (key: string): void => {
    onChange(items.filter((item) => item.key !== key));
  };

  const addFromCatalog = (productId: string): void => {
    const product = products.find((p) => p.id === productId);
    if (!product) return;
    onChange([
      ...items,
      emptyItem({
        source: 'catalog',
        productId: product.id,
        name: product.name,
        description: product.description,
        sku: product.sku,
        unitId: product.unitId,
        unitPrice: product.sellingPrice,
        taxId: product.taxId,
      }),
    ]);
  };

  const productOptions = products
    .filter((p) => p.isActive && !p.archivedAt)
    .map((p) => ({
      value: p.id,
      label: p.name,
      description: [p.sku, p.categoryName].filter(Boolean).join(' · ') || undefined,
      meta: formatMoney(p.sellingPrice, currency),
    }));

  const anyDiscount = items.some((i) => i.discountType !== null);

  return (
    <div className="space-y-3">
      {items.length === 0 ? (
        <EmptyState
          icon={Package}
          title="No items yet"
          description="Add a product or service from your catalog, or enter a one-off custom item."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <div className="w-64">
                <Combobox
                  options={productOptions}
                  value={null}
                  onChange={addFromCatalog}
                  placeholder="Search catalog…"
                  disabled={disabled}
                />
              </div>
              <Button variant="secondary" onClick={() => setCustomOpen(true)} disabled={disabled}>
                <Sparkles className="h-3.5 w-3.5" />
                Add custom item
              </Button>
            </div>
          }
        />
      ) : (
        <>
          {/* Desktop grid */}
          <div className="hidden overflow-hidden rounded-lg border border-line md:block">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-line bg-subtle/60 text-xs uppercase tracking-wide text-content-muted">
                  <th className="w-8 px-2 py-2" />
                  <th className="px-3 py-2 text-left">Description</th>
                  <th className="w-24 px-2 py-2 text-right">Qty</th>
                  <th className="w-28 px-2 py-2 text-left">Unit</th>
                  <th className="w-32 px-2 py-2 text-right">Price</th>
                  {anyDiscount && <th className="w-32 px-2 py-2 text-right">Discount</th>}
                  <th className="w-36 px-2 py-2 text-left">Tax</th>
                  <th className="w-32 px-3 py-2 text-right">Amount</th>
                  <th className="w-10 px-2 py-2" />
                </tr>
              </thead>
              <tbody>
                {items.map((item, index) => {
                  const tax = taxes.find((t) => t.id === item.taxId);
                  const calc = calculateItem(
                    {
                      quantity: item.quantity,
                      unitPrice: item.unitPrice,
                      discountType: item.discountType,
                      discountValue: item.discountValue,
                      taxRate: tax?.rate ?? 0,
                    },
                    taxMode,
                    currency.decimalPlaces,
                  );
                  return (
                    <tr key={item.key} className="border-b border-line last:border-0 align-top">
                      <td className="px-2 py-2 text-center text-sm text-content-muted">
                        <GripVertical className="mx-auto h-3.5 w-3.5 opacity-40" aria-hidden />
                        <span className="sr-only">Row {index + 1}</span>
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          value={item.name}
                          onChange={(e) => update(item.key, { name: e.target.value })}
                          placeholder="Item name"
                          disabled={disabled}
                          className="h-8"
                          aria-label={`Item ${index + 1} name`}
                        />
                        <Textarea
                          value={item.description ?? ''}
                          onChange={(e) =>
                            update(item.key, { description: e.target.value || null })
                          }
                          placeholder="Description (optional)"
                          rows={1}
                          disabled={disabled}
                          className="mt-1 text-sm"
                          aria-label={`Item ${index + 1} description`}
                        />
                        {item.source === 'custom' && (
                          <span className="mt-1 inline-flex items-center gap-1 text-xs font-normal text-content-muted">
                            <Sparkles className="h-3 w-3" />
                            Custom item
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-2">
                        <Input
                          value={item.quantity}
                          onChange={(e) => update(item.key, { quantity: e.target.value })}
                          inputMode="decimal"
                          disabled={disabled}
                          className="h-8 text-right tabular"
                          aria-label={`Item ${index + 1} quantity`}
                        />
                      </td>
                      <td className="px-2 py-2">
                        <NativeSelect
                          value={item.unitId ?? ''}
                          onChange={(e) => update(item.key, { unitId: e.target.value || null })}
                          disabled={disabled}
                          className="h-8 text-sm"
                          aria-label={`Item ${index + 1} unit`}
                        >
                          <option value="">—</option>
                          {units
                            .filter((u) => u.isActive)
                            .map((u) => (
                              <option key={u.id} value={u.id}>
                                {u.name}
                              </option>
                            ))}
                        </NativeSelect>
                      </td>
                      <td className="px-2 py-2">
                        <Input
                          value={item.unitPrice}
                          onChange={(e) => update(item.key, { unitPrice: e.target.value })}
                          inputMode="decimal"
                          disabled={disabled}
                          className="h-8 text-right tabular"
                          aria-label={`Item ${index + 1} unit price`}
                        />
                      </td>
                      {anyDiscount && (
                        <td className="px-2 py-2">
                          <div className="flex gap-1">
                            <Input
                              value={item.discountValue}
                              onChange={(e) => update(item.key, { discountValue: e.target.value })}
                              inputMode="decimal"
                              disabled={disabled || item.discountType === null}
                              className="h-8 text-right tabular"
                              aria-label={`Item ${index + 1} discount`}
                            />
                            <NativeSelect
                              value={item.discountType ?? ''}
                              onChange={(e) =>
                                update(item.key, {
                                  discountType: (e.target.value || null) as 'percentage' | null,
                                })
                              }
                              disabled={disabled}
                              className="h-8 w-14 px-1 text-sm"
                              aria-label={`Item ${index + 1} discount type`}
                            >
                              <option value="">—</option>
                              <option value="percentage">%</option>
                              <option value="fixed">{currency.currencySymbol}</option>
                            </NativeSelect>
                          </div>
                        </td>
                      )}
                      <td className="px-2 py-2">
                        <NativeSelect
                          value={item.taxId ?? ''}
                          onChange={(e) => update(item.key, { taxId: e.target.value || null })}
                          disabled={disabled}
                          className="h-8 text-sm"
                          aria-label={`Item ${index + 1} tax`}
                        >
                          <option value="">No tax</option>
                          {taxes
                            .filter((t) => t.isActive)
                            .map((t) => (
                              <option key={t.id} value={t.id}>
                                {t.name}
                              </option>
                            ))}
                        </NativeSelect>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <span className="tabular text-base font-medium text-content">
                          {formatMoney(calc.lineTotal, currency)}
                        </span>
                        {calc.taxAmount !== '0.00' && (
                          <span className="block text-xs font-normal text-content-muted">
                            incl. {formatMoney(calc.taxAmount, currency)} tax
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-2 text-right">
                        <Tooltip content="Remove item">
                          <button
                            type="button"
                            onClick={() => remove(item.key)}
                            disabled={disabled}
                            aria-label={`Remove item ${index + 1}`}
                            className="rounded p-1.5 text-content-muted transition-colors hover:bg-danger-bg hover:text-danger disabled:opacity-40"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </Tooltip>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="space-y-2 md:hidden">
            {items.map((item, index) => {
              const tax = taxes.find((t) => t.id === item.taxId);
              const calc = calculateItem(
                {
                  quantity: item.quantity,
                  unitPrice: item.unitPrice,
                  discountType: item.discountType,
                  discountValue: item.discountValue,
                  taxRate: tax?.rate ?? 0,
                },
                taxMode,
                currency.decimalPlaces,
              );
              return (
                <div key={item.key} className="rounded-lg border border-line bg-surface p-3">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-xs uppercase tracking-wide text-content-muted">
                      Item {index + 1}
                    </span>
                    <button
                      type="button"
                      onClick={() => remove(item.key)}
                      disabled={disabled}
                      aria-label={`Remove item ${index + 1}`}
                      className="rounded p-1 text-content-muted hover:bg-danger-bg hover:text-danger"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <Input
                    value={item.name}
                    onChange={(e) => update(item.key, { name: e.target.value })}
                    placeholder="Item name"
                    disabled={disabled}
                    className="mt-2"
                  />
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <Field label="Quantity">
                      {(p) => (
                        <Input
                          {...p}
                          value={item.quantity}
                          onChange={(e) => update(item.key, { quantity: e.target.value })}
                          inputMode="decimal"
                          className="tabular"
                        />
                      )}
                    </Field>
                    <Field label="Unit price">
                      {(p) => (
                        <Input
                          {...p}
                          value={item.unitPrice}
                          onChange={(e) => update(item.key, { unitPrice: e.target.value })}
                          inputMode="decimal"
                          className="tabular"
                        />
                      )}
                    </Field>
                    <Field label="Unit">
                      {(p) => (
                        <NativeSelect
                          {...p}
                          value={item.unitId ?? ''}
                          onChange={(e) => update(item.key, { unitId: e.target.value || null })}
                        >
                          <option value="">—</option>
                          {units.filter((u) => u.isActive).map((u) => (
                            <option key={u.id} value={u.id}>{u.name}</option>
                          ))}
                        </NativeSelect>
                      )}
                    </Field>
                    <Field label="Tax">
                      {(p) => (
                        <NativeSelect
                          {...p}
                          value={item.taxId ?? ''}
                          onChange={(e) => update(item.key, { taxId: e.target.value || null })}
                        >
                          <option value="">No tax</option>
                          {taxes.filter((t) => t.isActive).map((t) => (
                            <option key={t.id} value={t.id}>{t.name}</option>
                          ))}
                        </NativeSelect>
                      )}
                    </Field>
                  </div>
                  <div className="mt-2 flex items-center justify-between border-t border-line pt-2">
                    <span className="text-sm text-content-muted">Amount</span>
                    <span className="tabular text-base font-medium text-content">
                      {formatMoney(calc.lineTotal, currency)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {items.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="w-full sm:w-72">
            <Combobox
              options={productOptions}
              value={null}
              onChange={addFromCatalog}
              placeholder="Add from catalog…"
              searchPlaceholder="Search products and services…"
              disabled={disabled}
            />
          </div>
          <Button variant="secondary" size="sm" onClick={() => setCustomOpen(true)} disabled={disabled}>
            <Plus className="h-3.5 w-3.5" />
            Custom item
          </Button>
          {!anyDiscount && (
            <Button
              variant="ghost"
              size="sm"
              disabled={disabled}
              onClick={() => {
                const first = items[0];
                if (first) update(first.key, { discountType: 'percentage', discountValue: '0' });
              }}
            >
              Add item discounts
            </Button>
          )}
        </div>
      )}

      <CustomItemModal
        open={customOpen}
        onOpenChange={setCustomOpen}
        units={units}
        taxes={taxes}
        onAdd={(item) => onChange([...items, item])}
      />
    </div>
  );
}

/**
 * A custom item needs no catalog record. "Save to catalog" is offered but never
 * required — that is the whole point of the custom path.
 */
function CustomItemModal({
  open,
  onOpenChange,
  units,
  taxes,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  units: Unit[];
  taxes: Tax[];
  onAdd: (item: EditorItem) => void;
}): React.ReactElement {
  const currency = useCurrency();
  const [draft, setDraft] = useState<EditorItem>(() => emptyItem({ source: 'custom' }));
  const [error, setError] = useState<string | null>(null);

  const reset = (): void => {
    setDraft(emptyItem({ source: 'custom' }));
    setError(null);
  };

  const submit = (): void => {
    if (!draft.name.trim()) {
      setError('Enter a name for this item.');
      return;
    }
    if (Number(draft.quantity) <= 0) {
      setError('Quantity must be greater than zero.');
      return;
    }
    onAdd({ ...draft, key: crypto.randomUUID() });
    onOpenChange(false);
    reset();
  };

  return (
    <Modal
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) reset();
      }}
      title="Add custom item"
      description="A one-off line that does not need to exist in your catalog."
      size="lg"
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" onClick={submit}>
            Add item
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && (
          <p className="rounded border border-danger/20 bg-danger-bg px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}

        <Field label="Name" required>
          {(p) => (
            <Input
              {...p}
              autoFocus
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              placeholder="e.g. On-site configuration"
            />
          )}
        </Field>

        <Field label="Description" description="Optional detail printed under the item name.">
          {(p) => (
            <Textarea
              {...p}
              value={draft.description ?? ''}
              onChange={(e) => setDraft({ ...draft, description: e.target.value || null })}
              rows={2}
            />
          )}
        </Field>

        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Quantity" required>
            {(p) => (
              <Input
                {...p}
                value={draft.quantity}
                onChange={(e) => setDraft({ ...draft, quantity: e.target.value })}
                inputMode="decimal"
                className="tabular"
              />
            )}
          </Field>
          <Field label="Unit">
            {(p) => (
              <NativeSelect
                {...p}
                value={draft.unitId ?? ''}
                onChange={(e) => setDraft({ ...draft, unitId: e.target.value || null })}
              >
                <option value="">—</option>
                {units.filter((u) => u.isActive).map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </NativeSelect>
            )}
          </Field>
          <Field label="Unit price" required>
            {(p) => (
              <Input
                {...p}
                value={draft.unitPrice}
                onChange={(e) => setDraft({ ...draft, unitPrice: e.target.value })}
                inputMode="decimal"
                prefix={currency.symbolPosition === 'before' ? currency.currencySymbol : undefined}
                className="tabular"
              />
            )}
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Discount">
            {(p) => (
              <Input
                {...p}
                value={draft.discountValue}
                onChange={(e) => setDraft({ ...draft, discountValue: e.target.value })}
                inputMode="decimal"
                disabled={draft.discountType === null}
                className="tabular"
              />
            )}
          </Field>
          <Field label="Discount type">
            {(p) => (
              <NativeSelect
                {...p}
                value={draft.discountType ?? ''}
                onChange={(e) =>
                  setDraft({ ...draft, discountType: (e.target.value || null) as 'percentage' | null })
                }
              >
                <option value="">No discount</option>
                <option value="percentage">Percentage</option>
                <option value="fixed">Fixed amount</option>
              </NativeSelect>
            )}
          </Field>
          <Field label="Tax">
            {(p) => (
              <NativeSelect
                {...p}
                value={draft.taxId ?? ''}
                onChange={(e) => setDraft({ ...draft, taxId: e.target.value || null })}
              >
                <option value="">No tax</option>
                {taxes.filter((t) => t.isActive).map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </NativeSelect>
            )}
          </Field>
        </div>

        <div className={cn('rounded border border-line bg-subtle/50 p-3')}>
          <CheckboxField
            label="Also save this to my catalog"
            description="Creates a reusable product or service. The line is added either way."
            checked={draft.saveToCatalog ?? false}
            onCheckedChange={(checked) =>
              setDraft({ ...draft, saveToCatalog: checked === true, catalogKind: 'service' })
            }
          />
          {draft.saveToCatalog && (
            <div className="mt-3 max-w-xs">
              <Field label="Save as">
                {(p) => (
                  <NativeSelect
                    {...p}
                    value={draft.catalogKind ?? 'service'}
                    onChange={(e) =>
                      setDraft({ ...draft, catalogKind: e.target.value as 'product' | 'service' })
                    }
                  >
                    <option value="service">Service</option>
                    <option value="product">Product</option>
                  </NativeSelect>
                )}
              </Field>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

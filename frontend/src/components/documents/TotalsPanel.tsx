import { Plus, Trash2 } from 'lucide-react';
import { Input, NativeSelect } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { CheckboxField } from '@/components/ui/Toggle';
import { calculateDocument } from '@/lib/money';
import { formatMoney, formatPercent } from '@/lib/format';
import { useCurrency } from '@/stores/BusinessContext';
import { cn } from '@/lib/cn';
import { emptyCharge, type EditorCharge, type EditorItem } from './types';
import type { DiscountType, Tax, TaxMode } from '@/types';

export interface TotalsPanelProps {
  items: EditorItem[];
  charges: EditorCharge[];
  onChargesChange: (charges: EditorCharge[]) => void;
  discountType: DiscountType | null;
  discountValue: string;
  onDiscountChange: (type: DiscountType | null, value: string) => void;
  taxMode: TaxMode;
  onTaxModeChange: (mode: TaxMode) => void;
  taxes: Tax[];
  disabled?: boolean;
}

/**
 * Live totals for the editor. These figures are an estimate for the user's
 * benefit — the server recalculates on save and its numbers are authoritative
 * (docs/06 §8).
 */
export function TotalsPanel({
  items,
  charges,
  onChargesChange,
  discountType,
  discountValue,
  onDiscountChange,
  taxMode,
  onTaxModeChange,
  taxes,
  disabled,
}: TotalsPanelProps): React.ReactElement {
  const currency = useCurrency();

  const totals = calculateDocument({
    items: items.map((item) => {
      const tax = taxes.find((t) => t.id === item.taxId);
      return {
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        discountType: item.discountType,
        discountValue: item.discountValue,
        taxRate: tax?.rate ?? 0,
        taxName: tax?.name ?? null,
      };
    }),
    charges: charges.map((c) => {
      const tax = taxes.find((t) => t.id === c.taxId);
      return { amount: c.amount, isTaxable: c.isTaxable, taxRate: tax?.rate ?? 0 };
    }),
    discountType,
    discountValue,
    taxMode,
    decimals: currency.decimalPlaces,
  });

  const Row = ({
    label,
    value,
    emphasis,
    muted,
  }: {
    label: React.ReactNode;
    value: string;
    emphasis?: boolean;
    muted?: boolean;
  }): React.ReactElement => (
    <div
      className={cn(
        'flex items-baseline justify-between gap-3 py-1.5',
        emphasis && 'border-t border-line-strong pt-2.5',
      )}
    >
      <span
        className={cn(
          'text-sm',
          emphasis ? 'text-h3 text-content' : muted ? 'text-content-muted' : 'text-content-secondary',
        )}
      >
        {label}
      </span>
      <span
        className={cn(
          'tabular shrink-0',
          emphasis ? 'text-h2 text-content' : 'text-base text-content-secondary',
        )}
      >
        {value}
      </span>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-line bg-surface p-4">
        <div className="mb-3">
          <label className="mb-1 block text-xs font-medium text-content-secondary">
            Tax treatment
          </label>
          <NativeSelect
            value={taxMode}
            onChange={(e) => onTaxModeChange(e.target.value as TaxMode)}
            disabled={disabled}
            className="h-8 text-sm"
          >
            <option value="exclusive">Tax exclusive (added to prices)</option>
            <option value="inclusive">Tax inclusive (contained in prices)</option>
            <option value="none">No tax</option>
          </NativeSelect>
        </div>

        <Row label="Subtotal" value={formatMoney(totals.subtotal, currency)} />

        {totals.itemDiscountTotal !== '0.00' && (
          <Row
            label="Item discounts"
            value={`− ${formatMoney(totals.itemDiscountTotal, currency)}`}
            muted
          />
        )}

        <div className="flex items-center justify-between gap-2 py-1.5">
          <span className="text-sm text-content-secondary">Document discount</span>
          <div className="flex w-40 gap-1">
            <Input
              value={discountValue}
              onChange={(e) => onDiscountChange(discountType, e.target.value)}
              disabled={disabled || discountType === null}
              inputMode="decimal"
              className="h-8 text-right tabular"
              aria-label="Document discount value"
            />
            <NativeSelect
              value={discountType ?? ''}
              onChange={(e) =>
                onDiscountChange((e.target.value || null) as DiscountType | null, discountValue)
              }
              disabled={disabled}
              className="h-8 w-14 px-1 text-sm"
              aria-label="Document discount type"
            >
              <option value="">—</option>
              <option value="percentage">%</option>
              <option value="fixed">{currency.currencySymbol}</option>
            </NativeSelect>
          </div>
        </div>

        {totals.documentDiscountAmount !== '0.00' && (
          <Row
            label="Discount applied"
            value={`− ${formatMoney(totals.documentDiscountAmount, currency)}`}
            muted
          />
        )}

        <Row label="Taxable amount" value={formatMoney(totals.taxableAmount, currency)} />

        {totals.taxBreakdown.map((line) => (
          <Row
            key={`${line.name}-${line.rate}`}
            label={
              <span className="text-content-muted">
                {line.name} ({formatPercent(line.rate)})
              </span>
            }
            value={formatMoney(line.amount, currency)}
          />
        ))}

        {totals.taxBreakdown.length === 0 && totals.taxTotal !== '0.00' && (
          <Row label="Tax" value={formatMoney(totals.taxTotal, currency)} />
        )}

        {totals.additionalChargesTotal !== '0.00' && (
          <Row
            label="Additional charges"
            value={formatMoney(totals.additionalChargesTotal, currency)}
          />
        )}

        <Row label="Grand total" value={formatMoney(totals.grandTotal, currency)} emphasis />

        <p className="mt-2 text-xs font-normal text-content-muted">
          Totals are recalculated by the server when you save.
        </p>
      </div>

      <div className="rounded-lg border border-line bg-surface p-4">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-h3 text-content">Additional charges</h3>
          <Button
            variant="ghost"
            size="sm"
            disabled={disabled}
            onClick={() => onChargesChange([...charges, emptyCharge()])}
          >
            <Plus className="h-3.5 w-3.5" />
            Add
          </Button>
        </div>

        {charges.length === 0 ? (
          <p className="text-sm text-content-muted">
            Delivery, installation or any other line that is not an item.
          </p>
        ) : (
          <div className="space-y-3">
            {charges.map((charge, index) => (
              <div key={charge.key} className="rounded border border-line p-2.5">
                <div className="flex gap-2">
                  <Input
                    value={charge.label}
                    onChange={(e) =>
                      onChargesChange(
                        charges.map((c) =>
                          c.key === charge.key ? { ...c, label: e.target.value } : c,
                        ),
                      )
                    }
                    placeholder="Label"
                    disabled={disabled}
                    className="h-8"
                    aria-label={`Charge ${index + 1} label`}
                  />
                  <Input
                    value={charge.amount}
                    onChange={(e) =>
                      onChargesChange(
                        charges.map((c) =>
                          c.key === charge.key ? { ...c, amount: e.target.value } : c,
                        ),
                      )
                    }
                    inputMode="decimal"
                    disabled={disabled}
                    className="h-8 w-28 text-right tabular"
                    aria-label={`Charge ${index + 1} amount`}
                  />
                  <button
                    type="button"
                    onClick={() => onChargesChange(charges.filter((c) => c.key !== charge.key))}
                    disabled={disabled}
                    aria-label={`Remove charge ${index + 1}`}
                    className="rounded p-1.5 text-content-muted hover:bg-danger-bg hover:text-danger"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="mt-2 flex items-center gap-3">
                  <CheckboxField
                    label="Taxable"
                    checked={charge.isTaxable}
                    onCheckedChange={(checked) =>
                      onChargesChange(
                        charges.map((c) =>
                          c.key === charge.key ? { ...c, isTaxable: checked === true } : c,
                        ),
                      )
                    }
                  />
                  {charge.isTaxable && (
                    <NativeSelect
                      value={charge.taxId ?? ''}
                      onChange={(e) =>
                        onChargesChange(
                          charges.map((c) =>
                            c.key === charge.key ? { ...c, taxId: e.target.value || null } : c,
                          ),
                        )
                      }
                      disabled={disabled}
                      className="h-8 w-40 text-sm"
                      aria-label={`Charge ${index + 1} tax`}
                    >
                      <option value="">Select tax</option>
                      {taxes.filter((t) => t.isActive).map((t) => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </NativeSelect>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

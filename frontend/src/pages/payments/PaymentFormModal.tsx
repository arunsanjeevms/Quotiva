import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Input, NativeSelect, Textarea } from '@/components/ui/Input';
import { Combobox } from '@/components/ui/Combobox';
import { DatePicker } from '@/components/ui/DatePicker';
import { InlineError } from '@/components/ui/States';
import { useAppMutation, useInvoices, usePaymentMethods } from '@/hooks/queries';
import { paymentsService } from '@/services/resources';
import { useCurrency } from '@/stores/BusinessContext';
import { formatMoney, toISODate } from '@/lib/format';
import { subtractMoney } from '@/lib/money';
import { ApiError } from '@/lib/apiClient';
import type { Payment } from '@/types';

export interface PaymentFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pre-selects and locks the invoice, e.g. when opened from an invoice page. */
  invoiceId?: string;
}

/**
 * Record Payment. Amount pre-fills with the outstanding balance; the server
 * still recomputes and rejects over-payment (docs/06 §6) — this form mirrors
 * that check locally only to give immediate feedback.
 */
export function PaymentFormModal({
  open,
  onOpenChange,
  invoiceId,
}: PaymentFormModalProps): React.ReactElement {
  const currency = useCurrency();
  const [searchParams] = useSearchParams();
  const preselected = invoiceId ?? searchParams.get('invoiceId') ?? undefined;

  const { data: invoiceData } = useInvoices({ pageSize: 100, paymentStatus: 'unpaid,partially_paid,overdue' });
  const { data: methodData } = usePaymentMethods();

  const [selectedInvoiceId, setSelectedInvoiceId] = useState(preselected ?? '');
  const [amount, setAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState(toISODate(new Date()));
  const [methodId, setMethodId] = useState('');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const invoice = invoiceData?.data.find((i) => i.id === selectedInvoiceId);
  const method = methodData?.data.find((m) => m.id === methodId);

  useEffect(() => {
    if (open) {
      setSelectedInvoiceId(preselected ?? '');
      setAmount('');
      setPaymentDate(toISODate(new Date()));
      setMethodId('');
      setReference('');
      setNotes('');
      setErrors({});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (invoice) setAmount(Number(invoice.amountDue).toString());
  }, [invoice?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const invoiceOptions = useMemo(
    () =>
      (invoiceData?.data ?? []).map((inv) => ({
        value: inv.id,
        label: inv.invoiceNumber,
        description: inv.customer.companyName ?? inv.customer.name,
        meta: formatMoney(inv.amountDue, currency),
      })),
    [invoiceData, currency],
  );

  const save = useAppMutation<Payment, void>({
    mutationFn: () =>
      paymentsService.create({
        invoiceId: selectedInvoiceId,
        amount,
        paymentDate,
        paymentMethodId: methodId || null,
        referenceNumber: reference || null,
        notes: notes || null,
      }),
    invalidate: ['payments', 'invoices', 'invoice', 'invoice-payments', 'dashboard'],
    successMessage: 'Payment recorded',
    suppressErrorToast: true,
    onSuccess: () => onOpenChange(false),
  });

  const overPaying = invoice && Number(amount || 0) > Number(invoice.amountDue);

  const submit = (): void => {
    const next: Record<string, string> = {};
    if (!selectedInvoiceId) next['invoiceId'] = 'Select an invoice';
    if (!amount || Number(amount) <= 0) next['amount'] = 'Enter an amount greater than zero';
    if (method?.requiresReference && !reference.trim()) {
      next['reference'] = `${method.name} requires a reference number`;
    }
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    save.mutate(undefined, {
      onError: (error) => {
        if (error instanceof ApiError) {
          if (error.code === 'OVERPAYMENT') {
            const outstanding = (error.details as { outstanding?: string })?.outstanding as unknown;
            setErrors({
              amount: `This exceeds the outstanding balance${
                outstanding ? ` of ${formatMoney(String(outstanding), currency)}` : ''
              }.`,
            });
          } else {
            setErrors(error.fieldErrors);
          }
        }
      },
    });
  };

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Record payment"
      size="md"
      dismissible={false}
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" loading={save.isPending} onClick={submit}>
            Record payment
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Invoice" required error={errors['invoiceId']}>
          {() => (
            <Combobox
              options={invoiceOptions}
              value={selectedInvoiceId || null}
              onChange={setSelectedInvoiceId}
              placeholder="Select an invoice"
              disabled={Boolean(invoiceId)}
              emptyMessage="No invoices with an outstanding balance."
            />
          )}
        </Field>

        {invoice && (
          <div className="flex items-center justify-between rounded border border-line bg-subtle/50 px-3 py-2 text-sm">
            <span className="text-content-secondary">Outstanding balance</span>
            <span className="tabular font-medium text-content">
              {formatMoney(invoice.amountDue, currency)}
            </span>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Amount" required error={errors['amount']}>
            {(p) => (
              <Input
                {...p}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                inputMode="decimal"
                prefix={currency.symbolPosition === 'before' ? currency.currencySymbol : undefined}
                className="tabular"
                invalid={Boolean(errors['amount']) || overPaying}
              />
            )}
          </Field>
          <Field label="Payment date" required>
            {() => <DatePicker value={paymentDate} onChange={(v) => setPaymentDate(v ?? paymentDate)} clearable={false} />}
          </Field>
        </div>

        {overPaying && !errors['amount'] && (
          <InlineError
            error={new Error(`This exceeds the outstanding balance of ${formatMoney(invoice!.amountDue, currency)}.`)}
          />
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Payment method">
            {(p) => (
              <NativeSelect {...p} value={methodId} onChange={(e) => setMethodId(e.target.value)}>
                <option value="">Select method</option>
                {(methodData?.data ?? []).filter((m) => m.isActive).map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </NativeSelect>
            )}
          </Field>
          <Field
            label="Reference number"
            required={method?.requiresReference}
            error={errors['reference']}
          >
            {(p) => (
              <Input
                {...p}
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                invalid={Boolean(errors['reference'])}
              />
            )}
          </Field>
        </div>

        <Field label="Notes">
          {(p) => <Textarea {...p} value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />}
        </Field>

        {invoice && amount && !overPaying && (
          <p className="text-sm text-content-muted">
            Remaining balance after this payment:{' '}
            <span className="tabular font-medium text-content">
              {formatMoney(subtractMoney(invoice.amountDue, amount || '0', currency.decimalPlaces), currency)}
            </span>
          </p>
        )}
      </div>
    </Modal>
  );
}

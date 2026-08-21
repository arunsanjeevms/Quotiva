import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Ban, Send, ShieldOff, Wallet } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { InvoiceStatusBadge, PaymentStatusBadge } from '@/components/ui/Badge';
import { SummaryStrip } from '@/components/ui/StatTile';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Menu';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { DetailSkeleton } from '@/components/ui/Skeleton';
import { EmptyState, ErrorState } from '@/components/ui/States';
import { Timeline, type TimelineEntry } from '@/components/ui/Timeline';
import { DocumentPreview } from '@/components/documents/DocumentPreview';
import { DocumentActions } from '@/components/documents/DocumentActions';
import { PaymentFormModal } from '@/pages/payments/PaymentFormModal';
import { useAppMutation, useInvoice, useInvoicePayments } from '@/hooks/queries';
import { invoicesService } from '@/services/resources';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { useBusiness, useCurrency, usePermission } from '@/stores/BusinessContext';
import { formatDate, formatMoney } from '@/lib/format';
import type { Invoice, Payment } from '@/types';

export function InvoiceDetailPage(): React.ReactElement {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const currency = useCurrency();
  const confirm = useConfirm();
  const { business } = useBusiness();
  const [tab, setTab] = useState('preview');
  const [paymentOpen, setPaymentOpen] = useState(false);

  const { data: invoice, isLoading, error, refetch } = useInvoice(id);
  const { data: paymentData } = useInvoicePayments(id);
  const canUpdate = usePermission('invoice.update');
  const canCancel = usePermission('invoice.cancel');
  const canVoid = usePermission('invoice.void');
  const canPay = usePermission('payment.create');

  const setStatus = useAppMutation<Invoice, { status: Invoice['status'] }>({
    mutationFn: ({ status }) => invoicesService.setStatus(id!, status),
    invalidate: ['invoices', 'invoice'],
    successMessage: 'Status updated',
  });

  const cancel = useAppMutation<Invoice, void>({
    mutationFn: () => invoicesService.cancel(id!, 'Cancelled from the detail page'),
    invalidate: ['invoices', 'invoice'],
    successMessage: 'Invoice cancelled',
  });

  const voidInvoice = useAppMutation<Invoice, void>({
    mutationFn: () => invoicesService.void(id!, 'Voided from the detail page'),
    invalidate: ['invoices', 'invoice'],
    successMessage: 'Invoice voided',
  });

  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />;
  if (isLoading || !invoice) return <DetailSkeleton />;

  const hasPayments = (paymentData?.data.filter((p) => !p.isVoided).length ?? 0) > 0;
  const isOverdue = invoice.paymentStatus === 'overdue';

  const paymentColumns: Column<Payment>[] = [
    { key: 'paymentDate', header: 'Date', cardTitle: true, cell: (row) => formatDate(row.paymentDate, business.dateFormat) },
    { key: 'paymentMethodName', header: 'Method', cell: (row) => row.paymentMethodName ?? '—' },
    { key: 'referenceNumber', header: 'Reference', hideBelow: 'lg', cell: (row) => row.referenceNumber ?? '—' },
    {
      key: 'amount',
      header: 'Amount',
      align: 'right',
      numeric: true,
      cell: (row) => (
        <span className={row.isVoided ? 'text-content-muted line-through' : 'font-medium text-content'}>
          {formatMoney(row.amount, currency)}
        </span>
      ),
    },
  ];

  const timelineEntries: TimelineEntry[] = [
    { id: 'created', timestamp: invoice.createdAt, title: `Invoice ${invoice.invoiceNumber} created` },
    ...(invoice.sentAt
      ? [{ id: 'sent', timestamp: invoice.sentAt, title: 'Sent to customer' } satisfies TimelineEntry]
      : []),
    ...(paymentData?.data ?? []).map(
      (p) =>
        ({
          id: p.id,
          timestamp: p.createdAt,
          title: p.isVoided
            ? `Payment of ${formatMoney(p.amount, currency)} voided`
            : `Payment of ${formatMoney(p.amount, currency)} recorded`,
          tone: p.isVoided ? 'warning' : 'success',
        }) satisfies TimelineEntry,
    ),
    ...(invoice.paidAt
      ? [{ id: 'paid', timestamp: invoice.paidAt, title: 'Invoice fully paid', tone: 'success' as const }]
      : []),
    ...(invoice.status === 'cancelled'
      ? [{ id: 'cancelled', timestamp: invoice.updatedAt, title: 'Invoice cancelled', tone: 'danger' as const }]
      : []),
  ].sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  return (
    <>
      <PageHeader
        title={invoice.invoiceNumber}
        breadcrumbs={[{ label: 'Invoices', to: '/invoices' }, { label: invoice.invoiceNumber }]}
        badge={
          <div className="flex gap-1.5">
            <InvoiceStatusBadge status={invoice.status} />
            <PaymentStatusBadge status={invoice.paymentStatus} />
          </div>
        }
        description={invoice.customer.companyName ?? invoice.customer.name}
        actions={
          <>
            <DocumentActions doc={invoice} onEdit={() => navigate(`/invoices/${id}/edit`)} />
            {invoice.status === 'draft' && canUpdate && (
              <Button variant="primary" size="sm" loading={setStatus.isPending} onClick={() => setStatus.mutate({ status: 'sent' })}>
                <Send className="h-3.5 w-3.5" />
                Mark as Sent
              </Button>
            )}
            {canPay && invoice.paymentStatus !== 'paid' && !['cancelled', 'void'].includes(invoice.status) && (
              <Button variant="primary" size="sm" onClick={() => setPaymentOpen(true)}>
                <Wallet className="h-3.5 w-3.5" />
                Record Payment
              </Button>
            )}
            {canCancel && !['cancelled', 'void'].includes(invoice.status) && (
              <Button
                variant="danger-outline"
                size="sm"
                onClick={async () => {
                  const ok = await confirm({
                    title: `Cancel ${invoice.invoiceNumber}?`,
                    description: 'The invoice and its number are kept for your records, and it is excluded from receivables.',
                    confirmLabel: 'Cancel invoice',
                    destructive: true,
                  });
                  if (ok) cancel.mutate();
                }}
              >
                <Ban className="h-3.5 w-3.5" />
                Cancel
              </Button>
            )}
            {canVoid && !hasPayments && !['cancelled', 'void'].includes(invoice.status) && (
              <Button
                variant="danger-outline"
                size="sm"
                onClick={async () => {
                  const ok = await confirm({
                    title: `Void ${invoice.invoiceNumber}?`,
                    description: 'Voiding is only available while no payments exist. This cannot be undone.',
                    confirmLabel: 'Void invoice',
                    destructive: true,
                    typeToConfirm: invoice.invoiceNumber,
                  });
                  if (ok) voidInvoice.mutate();
                }}
              >
                <ShieldOff className="h-3.5 w-3.5" />
                Void
              </Button>
            )}
          </>
        }
      />

      {isOverdue && (
        <div className="mb-4 rounded-lg border border-danger/20 bg-danger-bg px-3 py-2.5 text-sm text-content-secondary">
          This invoice is overdue. Balance of {formatMoney(invoice.amountDue, currency)} due since{' '}
          {formatDate(invoice.dueDate, business.dateFormat)}.
        </div>
      )}

      {invoice.quotationNumber && (
        <div className="mb-4 rounded-lg border border-line bg-subtle/50 px-3 py-2.5 text-sm text-content-secondary">
          Converted from quotation{' '}
          <Link to={`/quotations/${invoice.quotationId}`} className="font-medium text-primary hover:underline">
            {invoice.quotationNumber}
          </Link>
          .
        </div>
      )}

      <SummaryStrip
        className="mb-5"
        items={[
          { label: 'Invoice date', value: formatDate(invoice.issueDate, business.dateFormat) },
          { label: 'Due date', value: formatDate(invoice.dueDate, business.dateFormat) },
          { label: 'Total', value: formatMoney(invoice.grandTotal, currency) },
          {
            label: 'Balance due',
            value: formatMoney(invoice.amountDue, currency),
            tone: Number(invoice.amountDue) > 0 ? (isOverdue ? 'danger' : 'warning') : 'success',
          },
        ]}
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="preview">Preview</TabsTrigger>
          <TabsTrigger value="payments">Payments ({paymentData?.data.length ?? 0})</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>
        <TabsContent value="preview">
          <div className="overflow-x-auto rounded-lg bg-subtle p-4">
            <DocumentPreview doc={invoice} />
          </div>
        </TabsContent>
        <TabsContent value="payments">
          <DataTable
            columns={paymentColumns}
            rows={paymentData?.data}
            rowKey={(row) => row.id}
            empty={
              <EmptyState
                icon={Wallet}
                title="No payments recorded"
                description="Record a payment to track what has been collected against this invoice."
                action={
                  canPay && (
                    <Button variant="primary" onClick={() => setPaymentOpen(true)}>
                      Record payment
                    </Button>
                  )
                }
              />
            }
          />
        </TabsContent>
        <TabsContent value="history">
          <div className="rounded-lg border border-line bg-surface p-4">
            <Timeline entries={timelineEntries} />
          </div>
        </TabsContent>
      </Tabs>

      <PaymentFormModal open={paymentOpen} onOpenChange={setPaymentOpen} invoiceId={invoice.id} />
    </>
  );
}

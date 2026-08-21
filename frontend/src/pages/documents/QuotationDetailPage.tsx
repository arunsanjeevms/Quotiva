import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowRightLeft, Ban, Send } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { QuotationStatusBadge } from '@/components/ui/Badge';
import { SummaryStrip } from '@/components/ui/StatTile';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Menu';
import { DetailSkeleton } from '@/components/ui/Skeleton';
import { ErrorState } from '@/components/ui/States';
import { Timeline, type TimelineEntry } from '@/components/ui/Timeline';
import { DocumentPreview } from '@/components/documents/DocumentPreview';
import { DocumentActions } from '@/components/documents/DocumentActions';
import { useAppMutation, useQuotation } from '@/hooks/queries';
import { quotationsService } from '@/services/resources';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { useBusiness, useCurrency, usePermission } from '@/stores/BusinessContext';
import { formatDate, formatMoney } from '@/lib/format';
import type { Invoice, Quotation, QuotationStatus } from '@/types';

const NEXT_STATUS: Partial<Record<QuotationStatus, { label: string; status: QuotationStatus }[]>> = {
  draft: [{ label: 'Mark as Sent', status: 'sent' }],
  sent: [
    { label: 'Mark as Accepted', status: 'accepted' },
    { label: 'Mark as Rejected', status: 'rejected' },
  ],
  viewed: [
    { label: 'Mark as Accepted', status: 'accepted' },
    { label: 'Mark as Rejected', status: 'rejected' },
  ],
};

export function QuotationDetailPage(): React.ReactElement {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const currency = useCurrency();
  const confirm = useConfirm();
  const { business } = useBusiness();
  const [tab, setTab] = useState('preview');

  const { data: quotation, isLoading, error, refetch } = useQuotation(id);
  const canUpdate = usePermission('quotation.update');
  const canConvert = usePermission('quotation.convert');
  const canCancel = usePermission('quotation.cancel');

  const setStatus = useAppMutation<Quotation, { status: QuotationStatus }>({
    mutationFn: ({ status }) => quotationsService.setStatus(id!, status),
    invalidate: ['quotations', 'quotation'],
    successMessage: 'Status updated',
  });

  const convert = useAppMutation<Invoice, void>({
    mutationFn: () => quotationsService.convert(id!),
    invalidate: ['quotations', 'quotation', 'invoices', 'dashboard'],
    successMessage: 'Converted to invoice',
    onSuccess: (invoice) => navigate(`/invoices/${invoice.id}`),
  });

  const cancel = useAppMutation<Quotation, void>({
    mutationFn: () => quotationsService.cancel(id!, 'Cancelled from the detail page'),
    invalidate: ['quotations', 'quotation'],
    successMessage: 'Quotation cancelled',
  });

  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />;
  if (isLoading || !quotation) return <DetailSkeleton />;

  const timelineEntries: TimelineEntry[] = [
    { id: 'created', timestamp: quotation.createdAt, title: `Quotation ${quotation.quotationNumber} created` },
    ...(quotation.sentAt
      ? [{ id: 'sent', timestamp: quotation.sentAt, title: 'Sent to customer' } satisfies TimelineEntry]
      : []),
    ...(quotation.acceptedAt
      ? [{ id: 'accepted', timestamp: quotation.acceptedAt, title: 'Accepted by customer', tone: 'success' as const }]
      : []),
    ...(quotation.convertedInvoiceNumber
      ? [
          {
            id: 'converted',
            timestamp: quotation.updatedAt,
            title: `Converted to invoice ${quotation.convertedInvoiceNumber}`,
            tone: 'primary' as const,
          } satisfies TimelineEntry,
        ]
      : []),
  ];

  return (
    <>
      <PageHeader
        title={quotation.quotationNumber}
        breadcrumbs={[{ label: 'Quotations', to: '/quotations' }, { label: quotation.quotationNumber }]}
        badge={<QuotationStatusBadge status={quotation.status} />}
        description={quotation.customer.companyName ?? quotation.customer.name}
        actions={
          <>
            <DocumentActions doc={quotation} onEdit={() => navigate(`/quotations/${id}/edit`)} />
            {canUpdate &&
              NEXT_STATUS[quotation.status]?.map((next) => (
                <Button
                  key={next.status}
                  variant={next.status === 'rejected' ? 'secondary' : 'primary'}
                  size="sm"
                  loading={setStatus.isPending}
                  onClick={() => setStatus.mutate({ status: next.status })}
                >
                  <Send className="h-3.5 w-3.5" />
                  {next.label}
                </Button>
              ))}
            {canConvert && quotation.status === 'accepted' && (
              <Button variant="primary" size="sm" loading={convert.isPending} onClick={() => convert.mutate()}>
                <ArrowRightLeft className="h-3.5 w-3.5" />
                Convert to Invoice
              </Button>
            )}
            {canCancel && !['cancelled', 'converted', 'rejected'].includes(quotation.status) && (
              <Button
                variant="danger-outline"
                size="sm"
                onClick={async () => {
                  const ok = await confirm({
                    title: `Cancel ${quotation.quotationNumber}?`,
                    description: 'The quotation and its number are kept for your records.',
                    confirmLabel: 'Cancel quotation',
                    destructive: true,
                  });
                  if (ok) cancel.mutate();
                }}
              >
                <Ban className="h-3.5 w-3.5" />
                Cancel
              </Button>
            )}
          </>
        }
      />

      <SummaryStrip
        className="mb-5"
        items={[
          { label: 'Issue date', value: formatDate(quotation.issueDate, business.dateFormat) },
          { label: 'Valid until', value: formatDate(quotation.validUntil, business.dateFormat) },
          { label: 'Items', value: String(quotation.items.length) },
          { label: 'Total', value: formatMoney(quotation.grandTotal, currency) },
        ]}
      />

      {quotation.convertedInvoiceNumber && (
        <div className="mb-4 rounded-lg border border-primary/20 bg-primary-subtle px-3 py-2.5 text-sm text-content-secondary">
          Converted to invoice{' '}
          <Link to={`/invoices/${quotation.convertedInvoiceId}`} className="font-medium text-primary hover:underline">
            {quotation.convertedInvoiceNumber}
          </Link>
          .
        </div>
      )}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="preview">Preview</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>
        <TabsContent value="preview">
          <div className="overflow-x-auto rounded-lg bg-subtle p-4">
            <DocumentPreview doc={quotation} />
          </div>
        </TabsContent>
        <TabsContent value="history">
          <div className="rounded-lg border border-line bg-surface p-4">
            <Timeline entries={timelineEntries} />
          </div>
        </TabsContent>
      </Tabs>
    </>
  );
}

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { FilePlus2, FileText, Pencil, Receipt, Wallet } from 'lucide-react';
import { PageHeader, DescriptionList, Toolbar } from '@/components/ui/PageHeader';
import { DateRangePicker, type DateRangeValue } from '@/components/ui/DatePicker';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge, InvoiceStatusBadge, PaymentStatusBadge, QuotationStatusBadge } from '@/components/ui/Badge';
import { SummaryStrip } from '@/components/ui/StatTile';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Menu';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { DetailSkeleton } from '@/components/ui/Skeleton';
import { EmptyState, ErrorState } from '@/components/ui/States';
import { Timeline, type TimelineEntry } from '@/components/ui/Timeline';
import { useCustomer, useCustomerStatement } from '@/hooks/queries';
import { customersService } from '@/services/resources';
import { useBusiness, useCurrency, usePermission } from '@/stores/BusinessContext';
import { resolveDateRange } from '@/lib/dateRange';
import { formatDate, formatMoney, humanize } from '@/lib/format';
import type { Invoice, Payment, Quotation, StatementEntry } from '@/types';

/**
 * Account statement: every issued invoice as a debit and every non-voided
 * payment as a credit, in date order with a running balance. The opening
 * balance nets everything before the selected range, so a period statement
 * still reconciles to the customer's true outstanding position.
 */
function StatementTab({ customerId }: { customerId: string }): React.ReactElement {
  const currency = useCurrency();
  const { business } = useBusiness();
  const [range, setRange] = useState<DateRangeValue>({ preset: 'this_year' });

  const resolved = resolveDateRange(range);
  const { data, isLoading, error, refetch } = useCustomerStatement(customerId, resolved);

  const columns: Column<StatementEntry>[] = [
    {
      key: 'date', header: 'Date', cardTitle: true,
      cell: (row) => formatDate(row.date, business.dateFormat),
    },
    {
      key: 'type', header: 'Type',
      cell: (row) => (
        <Badge tone={row.type === 'payment' ? 'success' : 'neutral'}>{humanize(row.type)}</Badge>
      ),
    },
    { key: 'reference', header: 'Reference', cell: (row) => row.reference || '—' },
    { key: 'description', header: 'Description', hideBelow: 'lg', cell: (row) => row.description },
    {
      key: 'debit', header: 'Debit', align: 'right', numeric: true,
      cell: (row) => (row.debit ? formatMoney(row.debit, currency) : '—'),
    },
    {
      key: 'credit', header: 'Credit', align: 'right', numeric: true,
      cell: (row) => (row.credit ? formatMoney(row.credit, currency) : '—'),
    },
    {
      key: 'balance', header: 'Balance', align: 'right', numeric: true,
      cell: (row) => <span className="font-medium text-content">{formatMoney(row.balance, currency)}</span>,
    },
  ];

  return (
    <>
      <Toolbar>
        <DateRangePicker value={range} onChange={setRange} />
      </Toolbar>

      <SummaryStrip
        className="mb-4"
        items={[
          { label: 'Opening balance', value: formatMoney(data?.openingBalance ?? '0', currency) },
          {
            label: 'Closing balance',
            value: formatMoney(data?.closingBalance ?? '0', currency),
            tone: Number(data?.closingBalance ?? 0) > 0 ? 'warning' : 'success',
          },
        ]}
      />

      <DataTable
        columns={columns}
        rows={data?.entries}
        rowKey={(row) => row.id}
        loading={isLoading}
        error={error}
        onRetry={() => void refetch()}
        empty={
          <EmptyState
            icon={FileText}
            title="No activity in this period"
            description="Issued invoices and recorded payments will appear here."
          />
        }
      />
    </>
  );
}

export function CustomerDetailPage(): React.ReactElement {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const currency = useCurrency();
  const { business } = useBusiness();

  const { data: customer, isLoading, error, refetch } = useCustomer(id);
  const canUpdate = usePermission('customer.update');

  const quotations = useQuery({
    queryKey: ['customer-quotations', id],
    queryFn: () => customersService.quotations(id!, { pageSize: 50 }),
    enabled: Boolean(id),
  });
  const invoices = useQuery({
    queryKey: ['customer-invoices', id],
    queryFn: () => customersService.invoices(id!, { pageSize: 50 }),
    enabled: Boolean(id),
  });
  const payments = useQuery({
    queryKey: ['customer-payments', id],
    queryFn: () => customersService.payments(id!, { pageSize: 50 }),
    enabled: Boolean(id),
  });
  const activity = useQuery({
    queryKey: ['customer-activity', id],
    queryFn: () => customersService.activity(id!),
    enabled: Boolean(id),
  });

  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />;
  if (isLoading || !customer) return <DetailSkeleton />;

  const stats = customer.stats;

  const quotationColumns: Column<Quotation>[] = [
    {
      key: 'quotationNumber',
      header: 'Number',
      cardTitle: true,
      cell: (row) => (
        <Link to={`/quotations/${row.id}`} className="font-medium text-content hover:text-primary hover:underline">
          {row.quotationNumber}
        </Link>
      ),
    },
    { key: 'issueDate', header: 'Date', cell: (row) => formatDate(row.issueDate, business.dateFormat) },
    { key: 'status', header: 'Status', cell: (row) => <QuotationStatusBadge status={row.status} /> },
    {
      key: 'grandTotal', header: 'Total', align: 'right', numeric: true,
      cell: (row) => formatMoney(row.grandTotal, currency),
    },
  ];

  const invoiceColumns: Column<Invoice>[] = [
    {
      key: 'invoiceNumber',
      header: 'Number',
      cardTitle: true,
      cell: (row) => (
        <Link to={`/invoices/${row.id}`} className="font-medium text-content hover:text-primary hover:underline">
          {row.invoiceNumber}
        </Link>
      ),
    },
    { key: 'issueDate', header: 'Date', cell: (row) => formatDate(row.issueDate, business.dateFormat) },
    { key: 'dueDate', header: 'Due', hideBelow: 'lg', cell: (row) => formatDate(row.dueDate, business.dateFormat) },
    { key: 'status', header: 'Status', hideBelow: 'xl', cell: (row) => <InvoiceStatusBadge status={row.status} /> },
    { key: 'paymentStatus', header: 'Payment', cell: (row) => <PaymentStatusBadge status={row.paymentStatus} /> },
    {
      key: 'grandTotal', header: 'Total', align: 'right', numeric: true,
      cell: (row) => formatMoney(row.grandTotal, currency),
    },
    {
      key: 'amountDue', header: 'Due', align: 'right', numeric: true, hideBelow: 'lg',
      cell: (row) => formatMoney(row.amountDue, currency),
    },
  ];

  const paymentColumns: Column<Payment>[] = [
    {
      key: 'paymentDate', header: 'Date', cardTitle: true,
      cell: (row) => formatDate(row.paymentDate, business.dateFormat),
    },
    {
      key: 'invoiceNumber', header: 'Invoice',
      cell: (row) => (
        <Link to={`/invoices/${row.invoiceId}`} className="text-content hover:text-primary hover:underline">
          {row.invoiceNumber}
        </Link>
      ),
    },
    { key: 'paymentMethodName', header: 'Method', hideBelow: 'md', cell: (row) => row.paymentMethodName ?? '—' },
    { key: 'referenceNumber', header: 'Reference', hideBelow: 'lg', cell: (row) => row.referenceNumber ?? '—' },
    {
      key: 'amount', header: 'Amount', align: 'right', numeric: true,
      cell: (row) => (
        <span className={row.isVoided ? 'text-content-muted line-through' : 'font-medium text-content'}>
          {formatMoney(row.amount, currency)}
        </span>
      ),
    },
  ];

  const timelineEntries: TimelineEntry[] = (activity.data?.data ?? []).map((log) => ({
    id: log.id,
    timestamp: log.createdAt,
    title: humanize(log.action.replace('.', ' ')),
    description: log.entityLabel ?? undefined,
    actor: log.userEmail,
  }));

  return (
    <>
      <PageHeader
        title={customer.companyName ?? customer.name}
        breadcrumbs={[{ label: 'Customers', to: '/customers' }, { label: customer.companyName ?? customer.name }]}
        badge={customer.archivedAt ? <Badge tone="neutral">Archived</Badge> : undefined}
        description={customer.companyName ? customer.name : undefined}
        actions={
          <>
            <Button variant="secondary" size="sm" asChild>
              <Link to={`/quotations/new?customerId=${customer.id}`}>
                <FilePlus2 className="h-3.5 w-3.5" />
                New quotation
              </Link>
            </Button>
            <Button variant="secondary" size="sm" asChild>
              <Link to={`/invoices/new?customerId=${customer.id}`}>
                <Receipt className="h-3.5 w-3.5" />
                New invoice
              </Link>
            </Button>
            {canUpdate && (
              <Button variant="secondary" size="sm" onClick={() => navigate(`/customers/${customer.id}/edit`)}>
                <Pencil className="h-3.5 w-3.5" />
                Edit
              </Button>
            )}
          </>
        }
      />

      <SummaryStrip
        className="mb-5"
        items={[
          { label: 'Total invoiced', value: formatMoney(stats?.totalInvoiced ?? '0', currency) },
          { label: 'Total paid', value: formatMoney(stats?.totalPaid ?? '0', currency), tone: 'success' },
          {
            label: 'Outstanding',
            value: formatMoney(stats?.outstanding ?? '0', currency),
            tone: Number(stats?.outstanding ?? 0) > 0 ? 'warning' : 'default',
          },
          { label: 'Last activity', value: formatDate(stats?.lastTransactionAt, business.dateFormat) },
        ]}
      />

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="quotations">Quotations ({stats?.quotationCount ?? 0})</TabsTrigger>
          <TabsTrigger value="invoices">Invoices ({stats?.invoiceCount ?? 0})</TabsTrigger>
          <TabsTrigger value="payments">Payments</TabsTrigger>
          <TabsTrigger value="statement">Statement</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Contact</CardTitle>
              </CardHeader>
              <CardContent>
                <DescriptionList
                  items={[
                    { label: 'Contact name', value: customer.name },
                    { label: 'Company', value: customer.companyName },
                    { label: 'Email', value: customer.email },
                    { label: 'Phone', value: customer.phone },
                    { label: 'Alternate phone', value: customer.altPhone },
                    { label: 'Website', value: customer.website },
                  ]}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Address & billing</CardTitle>
              </CardHeader>
              <CardContent>
                <DescriptionList
                  items={[
                    {
                      label: 'Address',
                      value: [customer.addressLine1, customer.addressLine2].filter(Boolean).join(', '),
                    },
                    { label: 'City', value: customer.city },
                    { label: 'State / region', value: customer.state },
                    { label: 'Postal code', value: customer.postalCode },
                    { label: 'Country', value: customer.country },
                    { label: 'Tax ID', value: customer.taxId },
                    { label: 'Customer code', value: customer.code },
                    {
                      label: 'Payment terms',
                      value: customer.paymentTermsDays
                        ? `${customer.paymentTermsDays} days`
                        : 'Business default',
                    },
                  ]}
                />
              </CardContent>
            </Card>

            {customer.notes && (
              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle>Internal notes</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="whitespace-pre-wrap text-base text-content-secondary">
                    {customer.notes}
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        <TabsContent value="quotations">
          <DataTable
            columns={quotationColumns}
            rows={quotations.data?.data}
            rowKey={(row) => row.id}
            loading={quotations.isLoading}
            onRowClick={(row) => navigate(`/quotations/${row.id}`)}
            empty={
              <EmptyState
                icon={FileText}
                title="No quotations for this customer"
                description="Create a quotation to get started."
                action={
                  <Button variant="primary" asChild>
                    <Link to="/quotations/new">New quotation</Link>
                  </Button>
                }
              />
            }
          />
        </TabsContent>

        <TabsContent value="invoices">
          <DataTable
            columns={invoiceColumns}
            rows={invoices.data?.data}
            rowKey={(row) => row.id}
            loading={invoices.isLoading}
            onRowClick={(row) => navigate(`/invoices/${row.id}`)}
            empty={
              <EmptyState
                icon={Receipt}
                title="No invoices for this customer"
                description="Bill this customer to see invoices here."
                action={
                  <Button variant="primary" asChild>
                    <Link to="/invoices/new">New invoice</Link>
                  </Button>
                }
              />
            }
          />
        </TabsContent>

        <TabsContent value="payments">
          <DataTable
            columns={paymentColumns}
            rows={payments.data?.data}
            rowKey={(row) => row.id}
            loading={payments.isLoading}
            empty={
              <EmptyState
                icon={Wallet}
                title="No payments recorded"
                description="Payments against this customer's invoices will appear here."
              />
            }
          />
        </TabsContent>

        <TabsContent value="statement">
          <StatementTab customerId={customer.id} />
        </TabsContent>

        <TabsContent value="activity">
          <Card>
            <CardContent>
              {timelineEntries.length === 0 ? (
                <EmptyState
                  title="No activity yet"
                  description="Changes to this customer and their documents will appear here."
                  className="border-0"
                />
              ) : (
                <Timeline entries={timelineEntries} />
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </>
  );
}

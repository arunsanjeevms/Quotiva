import { Link } from 'react-router-dom';
import { BarChart3, Download } from 'lucide-react';
import { PageHeader, Toolbar } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { NativeSelect } from '@/components/ui/Input';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Pagination } from '@/components/ui/Pagination';
import { EmptyState, NoResultsState } from '@/components/ui/States';
import { StatTile } from '@/components/ui/StatTile';
import { InvoiceStatusBadge, PaymentStatusBadge, QuotationStatusBadge } from '@/components/ui/Badge';
import { DateRangePicker, FilterReset, type DateRangeValue } from '@/components/ui/DatePicker';
import { useToast } from '@/components/ui/Toast';
import { reportQueries, useCustomers } from '@/hooks/queries';
import { useListParams } from '@/hooks/useListParams';
import { useBusiness, useCurrency, usePermission } from '@/stores/BusinessContext';
import { formatDate, formatMoney, formatNumber, formatPercent } from '@/lib/format';
import type {
  CustomerReportRow,
  Invoice,
  ListParams,
  Payment,
  Quotation,
  SalesReportRow,
  TaxReportRow,
} from '@/types';

/** Shared shell: title, date range, export, table, pagination. */
function ReportShell<T extends object>({
  title,
  description,
  columns,
  rows,
  meta,
  isLoading,
  error,
  onRetry,
  list,
  extraFilters,
  summary,
  rowKey,
}: {
  title: string;
  description: string;
  columns: Column<T>[];
  rows: T[] | undefined;
  meta: { page: number; pageSize: number; total: number; totalPages: number } | undefined;
  isLoading: boolean;
  error: unknown;
  onRetry: () => void;
  list: ReturnType<typeof useListParams>;
  extraFilters?: React.ReactNode;
  summary?: React.ReactNode;
  rowKey: (row: T, index: number) => string;
}): React.ReactElement {
  const toast = useToast();
  const canExport = usePermission('report.export');

  const range: DateRangeValue = {
    preset: (list.filters['range'] as DateRangeValue['preset']) ?? 'this_year',
    from: list.filters['from'],
    to: list.filters['to'],
  };

  return (
    <>
      <PageHeader
        title={title}
        description={description}
        breadcrumbs={[{ label: 'Reports', to: '/reports/sales' }, { label: title }]}
        actions={
          canExport && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() =>
                toast.info(
                  'Export runs on the backend',
                  'Connect the API to download this report as CSV, Excel or PDF.',
                )
              }
            >
              <Download className="h-3.5 w-3.5" />
              Export
            </Button>
          )
        }
      />

      {summary && <div className="mb-4">{summary}</div>}

      <Toolbar>
        <DateRangePicker
          value={range}
          onChange={(next) => {
            list.setFilter('range', next.preset);
            list.setFilter('from', next.from);
            list.setFilter('to', next.to);
          }}
        />
        {extraFilters}
        {list.hasFilters && <FilterReset onClick={list.clearFilters} />}
      </Toolbar>

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(row) => rowKey(row, 0)}
        loading={isLoading}
        error={error}
        onRetry={onRetry}
        sort={list.sort}
        onSortChange={list.setSort}
        empty={
          list.hasFilters ? (
            <NoResultsState onClear={list.clearFilters} />
          ) : (
            <EmptyState
              icon={BarChart3}
              title="Nothing to report yet"
              description="Once you have documents in this period, the figures will appear here."
            />
          )
        }
      />

      <div className="mt-4">
        <Pagination meta={meta} onPageChange={list.setPage} onPageSizeChange={list.setPageSize} />
      </div>
    </>
  );
}

function useCustomerFilter(list: ReturnType<typeof useListParams>): React.ReactElement {
  const { data } = useCustomers({ pageSize: 100 });
  return (
    <NativeSelect
      value={list.filters['customerId'] ?? ''}
      onChange={(e) => list.setFilter('customerId', e.target.value || undefined)}
      className="h-8 w-auto max-w-48 text-sm"
      aria-label="Filter by customer"
    >
      <option value="">All customers</option>
      {(data?.data ?? []).map((customer) => (
        <option key={customer.id} value={customer.id}>
          {customer.companyName ?? customer.name}
        </option>
      ))}
    </NativeSelect>
  );
}

export function SalesReportPage(): React.ReactElement {
  const currency = useCurrency();
  const list = useListParams();
  const { data, isLoading, error, refetch } = reportQueries.useSales(list.params as ListParams);

  const rows = data?.data ?? [];
  const totals = rows.reduce(
    (acc, row) => ({
      invoiced: acc.invoiced + Number(row.invoiced),
      paid: acc.paid + Number(row.paid),
      outstanding: acc.outstanding + Number(row.outstanding),
      count: acc.count + row.invoiceCount,
    }),
    { invoiced: 0, paid: 0, outstanding: 0, count: 0 },
  );

  const columns: Column<SalesReportRow>[] = [
    { key: 'period', header: 'Period', cardTitle: true, cell: (row) => row.period },
    {
      key: 'invoiceCount',
      header: 'Invoices',
      align: 'right',
      numeric: true,
      cell: (row) => formatNumber(row.invoiceCount),
    },
    {
      key: 'invoiced',
      header: 'Invoiced',
      align: 'right',
      numeric: true,
      cell: (row) => formatMoney(row.invoiced, currency),
    },
    {
      key: 'paid',
      header: 'Paid',
      align: 'right',
      numeric: true,
      cell: (row) => <span className="text-success">{formatMoney(row.paid, currency)}</span>,
    },
    {
      key: 'outstanding',
      header: 'Outstanding',
      align: 'right',
      numeric: true,
      cell: (row) => formatMoney(row.outstanding, currency),
    },
  ];

  return (
    <ReportShell
      title="Sales"
      description="Revenue, collections and outstanding balance by period."
      columns={columns}
      rows={rows}
      meta={data?.meta}
      isLoading={isLoading}
      error={error}
      onRetry={() => void refetch()}
      list={list}
      rowKey={(row) => row.period}
      summary={
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile label="Invoiced" value={formatMoney(String(totals.invoiced), currency)} />
          <StatTile label="Collected" value={formatMoney(String(totals.paid), currency)} tone="success" />
          <StatTile
            label="Outstanding"
            value={formatMoney(String(totals.outstanding), currency)}
            tone={totals.outstanding > 0 ? 'warning' : 'default'}
          />
          <StatTile label="Invoices" value={formatNumber(totals.count)} />
        </div>
      }
    />
  );
}

export function InvoiceReportPage(): React.ReactElement {
  const currency = useCurrency();
  const { business } = useBusiness();
  const list = useListParams({ sort: 'issueDate', order: 'desc' });
  const { data, isLoading, error, refetch } = reportQueries.useInvoices(list.params as ListParams);
  const customerFilter = useCustomerFilter(list);

  const columns: Column<Invoice>[] = [
    {
      key: 'invoiceNumber',
      header: 'Number',
      sortable: true,
      cardTitle: true,
      cell: (row) => (
        <Link to={`/invoices/${row.id}`} className="font-medium text-content hover:text-primary hover:underline">
          {row.invoiceNumber}
        </Link>
      ),
    },
    { key: 'customer', header: 'Customer', cell: (row) => row.customer.companyName ?? row.customer.name },
    { key: 'issueDate', header: 'Date', sortable: true, cell: (row) => formatDate(row.issueDate, business.dateFormat) },
    { key: 'dueDate', header: 'Due', hideBelow: 'lg', cell: (row) => formatDate(row.dueDate, business.dateFormat) },
    { key: 'status', header: 'Status', hideBelow: 'xl', cell: (row) => <InvoiceStatusBadge status={row.status} /> },
    { key: 'paymentStatus', header: 'Payment', cell: (row) => <PaymentStatusBadge status={row.paymentStatus} /> },
    { key: 'grandTotal', header: 'Total', align: 'right', numeric: true, sortable: true, cell: (row) => formatMoney(row.grandTotal, currency) },
    { key: 'amountDue', header: 'Due', align: 'right', numeric: true, cell: (row) => formatMoney(row.amountDue, currency) },
  ];

  return (
    <ReportShell
      title="Invoices"
      description="Every invoice in the period, with its document and payment status."
      columns={columns}
      rows={data?.data}
      meta={data?.meta}
      isLoading={isLoading}
      error={error}
      onRetry={() => void refetch()}
      list={list}
      rowKey={(row) => row.id}
      extraFilters={
        <>
          {customerFilter}
          <NativeSelect
            value={list.filters['paymentStatus'] ?? ''}
            onChange={(e) => list.setFilter('paymentStatus', e.target.value || undefined)}
            className="h-8 w-auto text-sm"
            aria-label="Filter by payment status"
          >
            <option value="">All payment states</option>
            <option value="unpaid">Unpaid</option>
            <option value="partially_paid">Partially paid</option>
            <option value="paid">Paid</option>
            <option value="overdue">Overdue</option>
          </NativeSelect>
        </>
      }
    />
  );
}

export function QuotationReportPage(): React.ReactElement {
  const currency = useCurrency();
  const { business } = useBusiness();
  const list = useListParams({ sort: 'issueDate', order: 'desc' });
  const { data, isLoading, error, refetch } = reportQueries.useQuotations(list.params as ListParams);
  const customerFilter = useCustomerFilter(list);

  const columns: Column<Quotation>[] = [
    {
      key: 'quotationNumber',
      header: 'Number',
      sortable: true,
      cardTitle: true,
      cell: (row) => (
        <Link to={`/quotations/${row.id}`} className="font-medium text-content hover:text-primary hover:underline">
          {row.quotationNumber}
        </Link>
      ),
    },
    { key: 'customer', header: 'Customer', cell: (row) => row.customer.companyName ?? row.customer.name },
    { key: 'issueDate', header: 'Date', sortable: true, cell: (row) => formatDate(row.issueDate, business.dateFormat) },
    { key: 'validUntil', header: 'Valid until', hideBelow: 'lg', cell: (row) => formatDate(row.validUntil, business.dateFormat) },
    { key: 'status', header: 'Status', cell: (row) => <QuotationStatusBadge status={row.status} /> },
    { key: 'grandTotal', header: 'Total', align: 'right', numeric: true, sortable: true, cell: (row) => formatMoney(row.grandTotal, currency) },
  ];

  return (
    <ReportShell
      title="Quotations"
      description="Quotation pipeline and conversion outcomes."
      columns={columns}
      rows={data?.data}
      meta={data?.meta}
      isLoading={isLoading}
      error={error}
      onRetry={() => void refetch()}
      list={list}
      rowKey={(row) => row.id}
      extraFilters={
        <>
          {customerFilter}
          <NativeSelect
            value={list.filters['status'] ?? ''}
            onChange={(e) => list.setFilter('status', e.target.value || undefined)}
            className="h-8 w-auto text-sm"
            aria-label="Filter by status"
          >
            <option value="">All statuses</option>
            <option value="draft">Draft</option>
            <option value="sent">Sent</option>
            <option value="accepted">Accepted</option>
            <option value="rejected">Rejected</option>
            <option value="expired">Expired</option>
            <option value="converted">Converted</option>
          </NativeSelect>
        </>
      }
    />
  );
}

export function PaymentReportPage(): React.ReactElement {
  const currency = useCurrency();
  const { business } = useBusiness();
  const list = useListParams({ sort: 'paymentDate', order: 'desc' });
  const { data, isLoading, error, refetch } = reportQueries.usePayments(list.params as ListParams);
  const customerFilter = useCustomerFilter(list);

  const total = (data?.data ?? [])
    .filter((p) => !p.isVoided)
    .reduce((acc, p) => acc + Number(p.amount), 0);

  const columns: Column<Payment>[] = [
    { key: 'paymentDate', header: 'Date', sortable: true, cardTitle: true, cell: (row) => formatDate(row.paymentDate, business.dateFormat) },
    {
      key: 'invoiceNumber',
      header: 'Invoice',
      cell: (row) => (
        <Link to={`/invoices/${row.invoiceId}`} className="text-content hover:text-primary hover:underline">
          {row.invoiceNumber}
        </Link>
      ),
    },
    { key: 'customerName', header: 'Customer', cell: (row) => row.customerName },
    { key: 'paymentMethodName', header: 'Method', hideBelow: 'md', cell: (row) => row.paymentMethodName ?? '—' },
    { key: 'referenceNumber', header: 'Reference', hideBelow: 'lg', cell: (row) => row.referenceNumber ?? '—' },
    {
      key: 'amount',
      header: 'Amount',
      align: 'right',
      numeric: true,
      sortable: true,
      cell: (row) => (
        <span className={row.isVoided ? 'text-content-muted line-through' : ''}>
          {formatMoney(row.amount, currency)}
        </span>
      ),
    },
  ];

  return (
    <ReportShell
      title="Payments"
      description="Everything collected in the period, by method and customer."
      columns={columns}
      rows={data?.data}
      meta={data?.meta}
      isLoading={isLoading}
      error={error}
      onRetry={() => void refetch()}
      list={list}
      rowKey={(row) => row.id}
      extraFilters={customerFilter}
      summary={
        <div className="grid gap-3 sm:grid-cols-2">
          <StatTile label="Collected in view" value={formatMoney(String(total), currency)} tone="success" />
          <StatTile label="Payments" value={formatNumber(data?.meta.total ?? 0)} />
        </div>
      }
    />
  );
}

export function TaxReportPage(): React.ReactElement {
  const currency = useCurrency();
  const list = useListParams();
  const { data, isLoading, error, refetch } = reportQueries.useTaxes(list.params as ListParams);

  const rows = data?.data ?? [];
  const totalTax = rows.reduce((acc, row) => acc + Number(row.taxCollected), 0);
  const totalBase = rows.reduce((acc, row) => acc + Number(row.taxableAmount), 0);

  const columns: Column<TaxReportRow>[] = [
    { key: 'taxName', header: 'Tax', cardTitle: true, cell: (row) => row.taxName },
    { key: 'rate', header: 'Rate', align: 'right', numeric: true, cell: (row) => formatPercent(row.rate) },
    {
      key: 'taxableAmount',
      header: 'Taxable amount',
      align: 'right',
      numeric: true,
      cell: (row) => formatMoney(row.taxableAmount, currency),
    },
    {
      key: 'taxCollected',
      header: 'Tax collected',
      align: 'right',
      numeric: true,
      cell: (row) => <span className="font-medium text-content">{formatMoney(row.taxCollected, currency)}</span>,
    },
    {
      key: 'documentCount',
      header: 'Documents',
      align: 'right',
      numeric: true,
      hideBelow: 'md',
      cell: (row) => formatNumber(row.documentCount),
    },
  ];

  return (
    <ReportShell
      title="Taxes"
      description="Taxable base and tax collected per rate. Discounts are already allocated back to items, so these figures match what was actually charged."
      columns={columns}
      rows={rows}
      meta={data?.meta}
      isLoading={isLoading}
      error={error}
      onRetry={() => void refetch()}
      list={list}
      rowKey={(row) => `${row.taxName}-${row.rate}`}
      summary={
        <div className="grid gap-3 sm:grid-cols-2">
          <StatTile label="Taxable base" value={formatMoney(String(totalBase), currency)} />
          <StatTile label="Tax collected" value={formatMoney(String(totalTax), currency)} />
        </div>
      }
    />
  );
}

export function CustomerReportPage(): React.ReactElement {
  const currency = useCurrency();
  const list = useListParams({ sort: 'totalInvoiced', order: 'desc' });
  const { data, isLoading, error, refetch } = reportQueries.useCustomers(list.params as ListParams);

  const columns: Column<CustomerReportRow>[] = [
    {
      key: 'name',
      header: 'Customer',
      cardTitle: true,
      cell: (row) => (
        <Link to={`/customers/${row.customerId}`} className="font-medium text-content hover:text-primary hover:underline">
          {row.companyName ?? row.name}
        </Link>
      ),
    },
    {
      key: 'invoiceCount',
      header: 'Invoices',
      align: 'right',
      numeric: true,
      hideBelow: 'md',
      cell: (row) => formatNumber(row.invoiceCount),
    },
    {
      key: 'totalInvoiced',
      header: 'Invoiced',
      align: 'right',
      numeric: true,
      sortable: true,
      cell: (row) => formatMoney(row.totalInvoiced, currency),
    },
    {
      key: 'totalPaid',
      header: 'Paid',
      align: 'right',
      numeric: true,
      cell: (row) => <span className="text-success">{formatMoney(row.totalPaid, currency)}</span>,
    },
    {
      key: 'outstanding',
      header: 'Outstanding',
      align: 'right',
      numeric: true,
      cell: (row) => (
        <span className={Number(row.outstanding) > 0 ? 'font-medium text-content' : 'text-content-muted'}>
          {formatMoney(row.outstanding, currency)}
        </span>
      ),
    },
  ];

  return (
    <ReportShell
      title="Customers"
      description="What each customer has been invoiced, has paid, and still owes."
      columns={columns}
      rows={data?.data}
      meta={data?.meta}
      isLoading={isLoading}
      error={error}
      onRetry={() => void refetch()}
      list={list}
      rowKey={(row) => row.customerId}
    />
  );
}

import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  CircleDollarSign,
  Clock,
  FilePlus2,
  FileText,
  Receipt,
  ShoppingBag,
  UserPlus,
  Users,
  Wallet,
} from 'lucide-react';
import { PageHeader, SectionHeader } from '@/components/ui/PageHeader';
import { StatTile } from '@/components/ui/StatTile';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { DateRangePicker, type DateRangeValue } from '@/components/ui/DatePicker';
import { ChartSkeleton, StatTileSkeleton } from '@/components/ui/Skeleton';
import { ErrorState } from '@/components/ui/States';
import { HorizontalBarChart, RevenueTrendChart, StatusDonut } from '@/components/charts/Charts';
import { useDashboard } from '@/hooks/queries';
import { useAnyPermission, useCurrency } from '@/stores/BusinessContext';
import { formatDate, formatMoney, formatNumber } from '@/lib/format';

export function DashboardPage(): React.ReactElement {
  const currency = useCurrency();
  const [range, setRange] = useState<DateRangeValue>({ preset: 'this_month' });

  const { data, isLoading, error, refetch } = useDashboard({
    range: range.preset,
    ...(range.from ? { from: range.from } : {}),
    ...(range.to ? { to: range.to } : {}),
  });

  const canQuote = useAnyPermission('quotation.create');
  const canInvoice = useAnyPermission('invoice.create');
  const canCustomer = useAnyPermission('customer.create');
  const canProduct = useAnyPermission('product.create');
  const canPayment = useAnyPermission('payment.create');

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Business performance at a glance."
        actions={<DateRangePicker value={range} onChange={setRange} />}
      />

      <div className="mb-5 flex flex-wrap gap-2">
        {canQuote && (
          <Button variant="primary" size="sm" asChild>
            <Link to="/quotations/new">
              <FilePlus2 className="h-3.5 w-3.5" />
              New Quotation
            </Link>
          </Button>
        )}
        {canInvoice && (
          <Button variant="secondary" size="sm" asChild>
            <Link to="/invoices/new">
              <Receipt className="h-3.5 w-3.5" />
              New Invoice
            </Link>
          </Button>
        )}
        {canCustomer && (
          <Button variant="secondary" size="sm" asChild>
            <Link to="/customers/new">
              <UserPlus className="h-3.5 w-3.5" />
              Add Customer
            </Link>
          </Button>
        )}
        {canProduct && (
          <Button variant="secondary" size="sm" asChild>
            <Link to="/products/new">
              <ShoppingBag className="h-3.5 w-3.5" />
              Add Product/Service
            </Link>
          </Button>
        )}
        {canPayment && (
          <Button variant="secondary" size="sm" asChild>
            <Link to="/payments/new">
              <Wallet className="h-3.5 w-3.5" />
              Record Payment
            </Link>
          </Button>
        )}
      </div>

      {error ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : isLoading || !data ? (
        <div className="space-y-4">
          <StatTileSkeleton count={4} />
          <ChartSkeleton />
        </div>
      ) : (
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile
              label="Revenue"
              value={formatMoney(data.kpis.revenue, currency)}
              hint={`${formatNumber(data.kpis.invoiceCount)} invoices in period`}
              icon={CircleDollarSign}
            />
            <StatTile
              label="Payments received"
              value={formatMoney(data.kpis.paymentsReceived, currency)}
              icon={Wallet}
              tone="success"
            />
            <StatTile
              label="Outstanding"
              value={formatMoney(data.kpis.outstanding, currency)}
              hint={`${formatNumber(data.kpis.pendingCount)} awaiting payment`}
              icon={Clock}
            />
            <StatTile
              label="Overdue"
              value={formatNumber(data.kpis.overdueCount)}
              hint="invoices past due date"
              icon={AlertTriangle}
              tone={data.kpis.overdueCount > 0 ? 'danger' : 'default'}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile label="Quotations" value={formatNumber(data.kpis.quotationCount)} icon={FileText} />
            <StatTile
              label="Accepted"
              value={formatNumber(data.kpis.acceptedCount)}
              hint={`${formatNumber(data.kpis.rejectedCount)} rejected`}
              tone="success"
            />
            <StatTile label="Customers" value={formatNumber(data.kpis.customerCount)} icon={Users} />
            <StatTile
              label="Products & services"
              value={formatNumber(data.kpis.productCount)}
              icon={ShoppingBag}
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Revenue trend</CardTitle>
            </CardHeader>
            <CardContent>
              <RevenueTrendChart data={data.revenueTrend} />
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle>Payment status</CardTitle>
              </CardHeader>
              <CardContent>
                <StatusDonut data={data.invoiceStatus} emptyLabel="No invoices yet" />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Quotation status</CardTitle>
              </CardHeader>
              <CardContent>
                <StatusDonut data={data.quotationStatus} emptyLabel="No quotations yet" />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Payment methods</CardTitle>
              </CardHeader>
              <CardContent>
                <StatusDonut
                  data={data.paymentMethods.map((m) => ({
                    status: m.method,
                    count: m.count,
                    amount: m.amount,
                  }))}
                  emptyLabel="No payments yet"
                />
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Top customers</CardTitle>
              </CardHeader>
              <CardContent>
                <HorizontalBarChart
                  data={data.topCustomers.map((c) => ({ name: c.name, value: c.invoiced }))}
                  emptyLabel="No customer revenue yet"
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Top products & services</CardTitle>
              </CardHeader>
              <CardContent>
                <HorizontalBarChart
                  data={data.topItems.map((i) => ({ name: i.name, value: i.revenue }))}
                  emptyLabel="No item revenue yet"
                />
              </CardContent>
            </Card>
          </div>

          {(data.attention.overdueInvoices.length > 0 ||
            data.attention.expiringQuotations.length > 0) && (
            <div>
              <SectionHeader title="Needs attention" />
              <div className="grid gap-4 lg:grid-cols-2">
                {data.attention.overdueInvoices.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        Overdue invoices
                        <Badge tone="danger">{data.attention.overdueInvoices.length}</Badge>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                      <ul className="divide-y divide-line">
                        {data.attention.overdueInvoices.map((item) => (
                          <li key={item.id}>
                            <Link
                              to={`/invoices/${item.id}`}
                              className="flex items-center justify-between gap-3 px-4 py-2.5 transition-colors hover:bg-subtle"
                            >
                              <div className="min-w-0">
                                <p className="truncate text-base font-medium text-content">
                                  {item.number}
                                </p>
                                <p className="truncate text-sm text-content-muted">{item.customer}</p>
                              </div>
                              <div className="shrink-0 text-right">
                                <p className="tabular text-base font-medium text-danger">
                                  {formatMoney(item.amountDue, currency)}
                                </p>
                                <p className="text-xs font-normal text-content-muted">
                                  Due {formatDate(item.dueDate)}
                                </p>
                              </div>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                )}

                {data.attention.expiringQuotations.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        Quotations expiring soon
                        <Badge tone="warning">{data.attention.expiringQuotations.length}</Badge>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                      <ul className="divide-y divide-line">
                        {data.attention.expiringQuotations.map((item) => (
                          <li key={item.id}>
                            <Link
                              to={`/quotations/${item.id}`}
                              className="flex items-center justify-between gap-3 px-4 py-2.5 transition-colors hover:bg-subtle"
                            >
                              <div className="min-w-0">
                                <p className="truncate text-base font-medium text-content">
                                  {item.number}
                                </p>
                                <p className="truncate text-sm text-content-muted">{item.customer}</p>
                              </div>
                              <div className="shrink-0 text-right">
                                <p className="tabular text-base font-medium text-content">
                                  {formatMoney(item.total, currency)}
                                </p>
                                <p className="text-xs font-normal text-content-muted">
                                  Valid to {formatDate(item.validUntil)}
                                </p>
                              </div>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}

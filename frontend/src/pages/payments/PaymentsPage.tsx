import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Wallet } from 'lucide-react';
import { PageHeader, Toolbar } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Input, NativeSelect } from '@/components/ui/Input';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Pagination } from '@/components/ui/Pagination';
import { EmptyState, NoResultsState } from '@/components/ui/States';
import { Badge } from '@/components/ui/Badge';
import { FilterReset } from '@/components/ui/DatePicker';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { PaymentFormModal } from './PaymentFormModal';
import { useAppMutation, useCustomers, usePaymentMethods, usePayments } from '@/hooks/queries';
import { paymentsService } from '@/services/resources';
import { useListParams } from '@/hooks/useListParams';
import { useBusiness, useCurrency, usePermission } from '@/stores/BusinessContext';
import { formatDate, formatMoney } from '@/lib/format';
import type { Payment } from '@/types';

export function PaymentsPage(): React.ReactElement {
  const location = useLocation();
  const navigate = useNavigate();
  const currency = useCurrency();
  const confirm = useConfirm();
  const { business } = useBusiness();
  const list = useListParams({ sort: 'paymentDate', order: 'desc' });

  const canCreate = usePermission('payment.create');
  const canVoid = usePermission('payment.void');

  // /payments/new opens the modal over the list rather than a separate page.
  const [modalOpen, setModalOpen] = useState(location.pathname.endsWith('/new'));

  useEffect(() => {
    if (location.pathname.endsWith('/new')) setModalOpen(true);
  }, [location.pathname]);

  const { data, isLoading, error, refetch } = usePayments(list.params);
  const { data: customerData } = useCustomers({ pageSize: 100 });
  const { data: methodData } = usePaymentMethods();

  const voidPayment = useAppMutation<Payment, string>({
    mutationFn: (id) => paymentsService.void(id, 'Voided from the payments list'),
    invalidate: ['payments', 'invoices', 'invoice', 'dashboard'],
    successMessage: 'Payment voided',
  });

  const columns: Column<Payment>[] = [
    {
      key: 'paymentDate',
      header: 'Date',
      sortable: true,
      cardTitle: true,
      cell: (row) => formatDate(row.paymentDate, business.dateFormat),
    },
    {
      key: 'invoiceNumber',
      header: 'Invoice',
      cell: (row) => (
        <Link
          to={`/invoices/${row.invoiceId}`}
          className="rounded font-medium text-content hover:text-primary hover:underline"
        >
          {row.invoiceNumber}
        </Link>
      ),
    },
    {
      key: 'customerName',
      header: 'Customer',
      cell: (row) => <span className="block truncate">{row.customerName}</span>,
    },
    {
      key: 'paymentMethodName',
      header: 'Method',
      hideBelow: 'md',
      cell: (row) => row.paymentMethodName ?? '—',
    },
    {
      key: 'referenceNumber',
      header: 'Reference',
      hideBelow: 'lg',
      cell: (row) => row.referenceNumber ?? '—',
    },
    {
      key: 'amount',
      header: 'Amount',
      sortable: true,
      align: 'right',
      numeric: true,
      cell: (row) => (
        <span
          className={row.isVoided ? 'text-content-muted line-through' : 'font-medium text-content'}
        >
          {formatMoney(row.amount, currency)}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      hideBelow: 'md',
      cell: (row) =>
        row.isVoided ? <Badge tone="neutral">Voided</Badge> : <Badge tone="success">Recorded</Badge>,
    },
  ];

  return (
    <>
      <PageHeader
        title="Payments"
        description="Everything you have collected, and against which invoice."
        actions={
          canCreate && (
            <Button variant="primary" size="sm" onClick={() => setModalOpen(true)}>
              <Wallet className="h-3.5 w-3.5" />
              Record payment
            </Button>
          )
        }
      />

      <Toolbar>
        <Input
          value={list.q}
          onChange={(e) => list.setQuery(e.target.value)}
          placeholder="Search invoice, customer or reference…"
          className="h-8 sm:w-72"
          aria-label="Search payments"
        />
        <NativeSelect
          value={list.filters['customerId'] ?? ''}
          onChange={(e) => list.setFilter('customerId', e.target.value || undefined)}
          className="h-8 w-auto max-w-48 text-sm"
          aria-label="Filter by customer"
        >
          <option value="">All customers</option>
          {(customerData?.data ?? []).map((customer) => (
            <option key={customer.id} value={customer.id}>
              {customer.companyName ?? customer.name}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect
          value={list.filters['methodId'] ?? ''}
          onChange={(e) => list.setFilter('methodId', e.target.value || undefined)}
          className="h-8 w-auto text-sm"
          aria-label="Filter by payment method"
        >
          <option value="">All methods</option>
          {(methodData?.data ?? []).map((method) => (
            <option key={method.id} value={method.id}>
              {method.name}
            </option>
          ))}
        </NativeSelect>
        {list.hasFilters && <FilterReset onClick={list.clearFilters} />}
      </Toolbar>

      <DataTable
        columns={columns}
        rows={data?.data}
        rowKey={(row) => row.id}
        loading={isLoading}
        error={error}
        onRetry={() => void refetch()}
        sort={list.sort}
        onSortChange={list.setSort}
        empty={
          list.hasFilters ? (
            <NoResultsState onClear={list.clearFilters} />
          ) : (
            <EmptyState
              icon={Wallet}
              title="No payments yet"
              description="Record a payment against an invoice to start tracking what you have collected."
              action={
                canCreate && (
                  <Button variant="primary" onClick={() => setModalOpen(true)}>
                    Record payment
                  </Button>
                )
              }
            />
          )
        }
        actions={(row) =>
          !row.isVoided && canVoid ? (
            <button
              type="button"
              onClick={async () => {
                const ok = await confirm({
                  title: 'Void this payment?',
                  description:
                    'Payments are voided rather than deleted so the record stays explicable. The invoice balance is recalculated.',
                  confirmLabel: 'Void payment',
                  destructive: true,
                });
                if (ok) voidPayment.mutate(row.id);
              }}
              className="rounded px-2 py-1 text-sm font-medium text-danger hover:bg-danger-bg"
            >
              Void
            </button>
          ) : null
        }
      />

      <div className="mt-4">
        <Pagination meta={data?.meta} onPageChange={list.setPage} onPageSizeChange={list.setPageSize} />
      </div>

      <PaymentFormModal
        open={modalOpen}
        onOpenChange={(open) => {
          setModalOpen(open);
          if (!open && location.pathname.endsWith('/new')) navigate('/payments', { replace: true });
        }}
      />
    </>
  );
}

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import { useBusinessOptional } from '@/stores/BusinessContext';
import { useToast } from '@/components/ui/Toast';
import { ApiError } from '@/lib/apiClient';
import {
  categoriesService,
  customersService,
  customFieldsService,
  dashboardService,
  emailTemplatesService,
  invoicesService,
  notificationsService,
  paymentMethodsService,
  paymentsService,
  productsService,
  quotationsService,
  recurringService,
  reminderRulesService,
  reportsService,
  settingsService,
  taxesService,
  unitsService,
} from '@/services/resources';
import type {
  ApiListResponse,
  Category,
  Customer,
  CustomerStatement,
  CustomFieldDefinition,
  DashboardData,
  EmailTemplate,
  Invoice,
  ListParams,
  Payment,
  PaymentMethod,
  Product,
  Quotation,
  RecurringInvoice,
  ReminderRule,
  Tax,
  Unit,
} from '@/types';

/**
 * Query keys are business-scoped so switching business flushes the cache
 * cleanly and one tenant's data can never be served to another.
 */
function useScope(): string {
  return useBusinessOptional()?.activeBusinessId ?? 'anonymous';
}

const STALE = 30_000;

/* --------------------------------- Lists ---------------------------------- */

export function useCustomers(params: ListParams): UseQueryResult<ApiListResponse<Customer>> {
  const scope = useScope();
  return useQuery({
    queryKey: ['customers', scope, params],
    queryFn: () => customersService.list(params),
    staleTime: STALE,
  });
}

export function useCustomer(id: string | undefined): UseQueryResult<Customer> {
  const scope = useScope();
  return useQuery({
    queryKey: ['customer', scope, id],
    queryFn: () => customersService.get(id!),
    enabled: Boolean(id),
  });
}

export function useProducts(params: ListParams): UseQueryResult<ApiListResponse<Product>> {
  const scope = useScope();
  return useQuery({
    queryKey: ['products', scope, params],
    queryFn: () => productsService.list(params),
    staleTime: STALE,
  });
}

export function useCategories(): UseQueryResult<ApiListResponse<Category>> {
  const scope = useScope();
  return useQuery({
    queryKey: ['categories', scope],
    queryFn: () => categoriesService.list({ pageSize: 100 }),
    staleTime: 5 * 60_000,
  });
}

export function useUnits(): UseQueryResult<ApiListResponse<Unit>> {
  const scope = useScope();
  return useQuery({
    queryKey: ['units', scope],
    queryFn: () => unitsService.list({ pageSize: 100 }),
    staleTime: 5 * 60_000,
  });
}

export function useTaxes(): UseQueryResult<ApiListResponse<Tax>> {
  const scope = useScope();
  return useQuery({
    queryKey: ['taxes', scope],
    queryFn: () => taxesService.list({ pageSize: 100 }),
    staleTime: 5 * 60_000,
  });
}

export function usePaymentMethods(): UseQueryResult<ApiListResponse<PaymentMethod>> {
  const scope = useScope();
  return useQuery({
    queryKey: ['payment-methods', scope],
    queryFn: () => paymentMethodsService.list({ pageSize: 100 }),
    staleTime: 5 * 60_000,
  });
}

export function useQuotations(params: ListParams): UseQueryResult<ApiListResponse<Quotation>> {
  const scope = useScope();
  return useQuery({
    queryKey: ['quotations', scope, params],
    queryFn: () => quotationsService.list(params),
    staleTime: STALE,
  });
}

export function useQuotation(id: string | undefined): UseQueryResult<Quotation> {
  const scope = useScope();
  return useQuery({
    queryKey: ['quotation', scope, id],
    queryFn: () => quotationsService.get(id!),
    enabled: Boolean(id),
  });
}

export function useInvoices(params: ListParams): UseQueryResult<ApiListResponse<Invoice>> {
  const scope = useScope();
  return useQuery({
    queryKey: ['invoices', scope, params],
    queryFn: () => invoicesService.list(params),
    staleTime: STALE,
  });
}

export function useInvoice(id: string | undefined): UseQueryResult<Invoice> {
  const scope = useScope();
  return useQuery({
    queryKey: ['invoice', scope, id],
    queryFn: () => invoicesService.get(id!),
    enabled: Boolean(id),
  });
}

export function useInvoicePayments(id: string | undefined): UseQueryResult<ApiListResponse<Payment>> {
  const scope = useScope();
  return useQuery({
    queryKey: ['invoice-payments', scope, id],
    queryFn: () => invoicesService.payments(id!),
    enabled: Boolean(id),
  });
}

export function usePayments(params: ListParams): UseQueryResult<ApiListResponse<Payment>> {
  const scope = useScope();
  return useQuery({
    queryKey: ['payments', scope, params],
    queryFn: () => paymentsService.list(params),
    staleTime: STALE,
  });
}

export function useRecurringInvoices(
  params: ListParams,
): UseQueryResult<ApiListResponse<RecurringInvoice>> {
  const scope = useScope();
  return useQuery({
    queryKey: ['recurring', scope, params],
    queryFn: () => recurringService.list(params),
    staleTime: STALE,
  });
}

export function useDashboard(params: {
  range: string;
  from?: string;
  to?: string;
}): UseQueryResult<DashboardData> {
  const scope = useScope();
  return useQuery({
    queryKey: ['dashboard', scope, params],
    queryFn: () => dashboardService.get(params),
    staleTime: STALE,
  });
}

export function useCustomerStatement(
  id: string | undefined,
  range: { from?: string; to?: string },
): UseQueryResult<CustomerStatement> {
  const scope = useScope();
  return useQuery({
    queryKey: ['statement', scope, id, range],
    queryFn: () => customersService.statement(id!, range),
    enabled: Boolean(id),
  });
}

export function useCustomFields(): UseQueryResult<ApiListResponse<CustomFieldDefinition>> {
  const scope = useScope();
  return useQuery({
    queryKey: ['custom-fields', scope],
    queryFn: () => customFieldsService.list({ pageSize: 100 }),
    staleTime: 5 * 60_000,
  });
}

export function useEmailTemplates(): UseQueryResult<ApiListResponse<EmailTemplate>> {
  const scope = useScope();
  return useQuery({
    queryKey: ['email-templates', scope],
    queryFn: () => emailTemplatesService.list({ pageSize: 50 }),
    staleTime: 5 * 60_000,
  });
}

export function useReminderRules(): UseQueryResult<ApiListResponse<ReminderRule>> {
  const scope = useScope();
  return useQuery({
    queryKey: ['reminder-rules', scope],
    queryFn: () => reminderRulesService.list({ pageSize: 50 }),
    staleTime: 5 * 60_000,
  });
}

export function useNotifications() {
  const scope = useScope();
  return useQuery({
    queryKey: ['notifications', scope],
    queryFn: () => notificationsService.list(),
    refetchInterval: 60_000,
  });
}

export function useNumbering() {
  const scope = useScope();
  return useQuery({
    queryKey: ['numbering', scope],
    queryFn: () => settingsService.getNumbering(),
    staleTime: 5 * 60_000,
  });
}

export function useMembers() {
  const scope = useScope();
  return useQuery({ queryKey: ['members', scope], queryFn: () => settingsService.members() });
}

export function useRoles() {
  const scope = useScope();
  return useQuery({ queryKey: ['roles', scope], queryFn: () => settingsService.roles() });
}

export function useTemplates() {
  const scope = useScope();
  return useQuery({
    queryKey: ['templates', scope],
    queryFn: () => settingsService.templates(),
    staleTime: 10 * 60_000,
  });
}

export function useAuditLogs(params: ListParams) {
  const scope = useScope();
  return useQuery({
    queryKey: ['audit-logs', scope, params],
    queryFn: () => settingsService.auditLogs(params),
  });
}

export function useBackups() {
  const scope = useScope();
  return useQuery({
    queryKey: ['backups', scope],
    queryFn: () => settingsService.backups(),
    refetchInterval: 5_000,
  });
}

export const reportQueries = {
  useSales: (params: ListParams) => {
    const scope = useScope();
    return useQuery({ queryKey: ['report-sales', scope, params], queryFn: () => reportsService.sales(params) });
  },
  useInvoices: (params: ListParams) => {
    const scope = useScope();
    return useQuery({ queryKey: ['report-invoices', scope, params], queryFn: () => reportsService.invoices(params) });
  },
  useQuotations: (params: ListParams) => {
    const scope = useScope();
    return useQuery({ queryKey: ['report-quotations', scope, params], queryFn: () => reportsService.quotations(params) });
  },
  usePayments: (params: ListParams) => {
    const scope = useScope();
    return useQuery({ queryKey: ['report-payments', scope, params], queryFn: () => reportsService.payments(params) });
  },
  useTaxes: (params: ListParams) => {
    const scope = useScope();
    return useQuery({ queryKey: ['report-taxes', scope, params], queryFn: () => reportsService.taxes(params) });
  },
  useCustomers: (params: ListParams) => {
    const scope = useScope();
    return useQuery({ queryKey: ['report-customers', scope, params], queryFn: () => reportsService.customers(params) });
  },
};

/* ------------------------------- Mutations -------------------------------- */

/**
 * Shared mutation wrapper: invalidates the listed key prefixes, toasts on
 * success, and turns an ApiError into a readable message on failure.
 */
export function useAppMutation<TData, TVariables>(options: {
  mutationFn: (variables: TVariables) => Promise<TData>;
  invalidate?: string[];
  successMessage?: string | ((data: TData) => string);
  onSuccess?: (data: TData, variables: TVariables) => void;
  /** Handled by the caller (e.g. mapped onto form fields) — skips the toast. */
  suppressErrorToast?: boolean;
}): UseMutationResult<TData, unknown, TVariables> {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation<TData, unknown, TVariables>({
    mutationFn: options.mutationFn,
    onSuccess: (data, variables) => {
      for (const key of options.invalidate ?? []) {
        void queryClient.invalidateQueries({ queryKey: [key] });
      }
      if (options.successMessage) {
        const message =
          typeof options.successMessage === 'function'
            ? options.successMessage(data)
            : options.successMessage;
        toast.success(message);
      }
      options.onSuccess?.(data, variables);
    },
    onError: (error) => {
      if (options.suppressErrorToast) return;
      if (error instanceof ApiError) {
        toast.error(error.message, error.requestId ? `Reference ${error.requestId}` : undefined);
      } else {
        toast.error('Something went wrong', 'Please try again.');
      }
    },
  });
}

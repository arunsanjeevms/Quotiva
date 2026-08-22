import { api } from '@/lib/apiClient';
import type {
  ApiItemResponse,
  ApiListResponse,
  AuditLog,
  BackupJob,
  Category,
  Customer,
  CustomerStatement,
  CustomFieldDefinition,
  CustomerReportRow,
  DashboardData,
  DocumentTemplate,
  EmailTemplate,
  Invoice,
  ListParams,
  Member,
  Notification,
  NumberingSettings,
  Payment,
  PaymentMethod,
  Product,
  Quotation,
  RecurringInvoice,
  ReminderRule,
  Role,
  SalesReportRow,
  Tax,
  TaxReportRow,
  Unit,
} from '@/types';

/**
 * Thin, typed wrappers over the REST contract in docs/05-api-spec.md.
 * Components never call `api` directly — they go through these or the hooks
 * built on top of them.
 */

function crud<T>(path: string) {
  return {
    list: (params?: ListParams) => api.get<ApiListResponse<T>>(path, params),
    get: (id: string) => api.get<ApiItemResponse<T>>(`${path}/${id}`).then((r) => r.data),
    create: (body: unknown) => api.post<ApiItemResponse<T>>(path, body).then((r) => r.data),
    update: (id: string, body: unknown) =>
      api.put<ApiItemResponse<T>>(`${path}/${id}`, body).then((r) => r.data),
    remove: (id: string) => api.delete<void>(`${path}/${id}`),
    archive: (id: string) =>
      api.post<ApiItemResponse<T>>(`${path}/${id}/archive`).then((r) => r.data),
    restore: (id: string) =>
      api.post<ApiItemResponse<T>>(`${path}/${id}/restore`).then((r) => r.data),
  };
}

export const customersService = {
  ...crud<Customer>('/customers'),
  quotations: (id: string, params?: ListParams) =>
    api.get<ApiListResponse<Quotation>>(`/customers/${id}/quotations`, params),
  invoices: (id: string, params?: ListParams) =>
    api.get<ApiListResponse<Invoice>>(`/customers/${id}/invoices`, params),
  payments: (id: string, params?: ListParams) =>
    api.get<ApiListResponse<Payment>>(`/customers/${id}/payments`, params),
  activity: (id: string) =>
    api.get<ApiListResponse<AuditLog>>(`/customers/${id}/activity`),
  statement: (id: string, params: { from?: string; to?: string }) =>
    api
      .get<ApiItemResponse<CustomerStatement>>(`/customers/${id}/statement`, params)
      .then((r) => r.data),
};

export const productsService = crud<Product>('/products');
export const categoriesService = crud<Category>('/categories');
export const unitsService = crud<Unit>('/units');
export const taxesService = crud<Tax>('/taxes');
export const paymentMethodsService = crud<PaymentMethod>('/payment-methods');
export const customFieldsService = crud<CustomFieldDefinition>('/custom-fields');
export const emailTemplatesService = crud<EmailTemplate>('/email-templates');
export const reminderRulesService = crud<ReminderRule>('/reminder-rules');

export const quotationsService = {
  ...crud<Quotation>('/quotations'),
  setStatus: (id: string, status: string, note?: string) =>
    api
      .post<ApiItemResponse<Quotation>>(`/quotations/${id}/status`, { status, note })
      .then((r) => r.data),
  send: (id: string, body: unknown) =>
    api.post<ApiItemResponse<Quotation>>(`/quotations/${id}/send`, body).then((r) => r.data),
  convert: (id: string, body?: unknown) =>
    api.post<ApiItemResponse<Invoice>>(`/quotations/${id}/convert`, body).then((r) => r.data),
  duplicate: (id: string) =>
    api.post<ApiItemResponse<Quotation>>(`/quotations/${id}/duplicate`).then((r) => r.data),
  cancel: (id: string, reason: string) =>
    api.post<ApiItemResponse<Quotation>>(`/quotations/${id}/cancel`, { reason }).then((r) => r.data),
  pdf: (id: string) => api.blob(`/quotations/${id}/pdf`),
  whatsapp: (id: string) =>
    api
      .get<ApiItemResponse<{ url: string; message: string }>>(`/quotations/${id}/whatsapp`)
      .then((r) => r.data),
};

export const invoicesService = {
  ...crud<Invoice>('/invoices'),
  setStatus: (id: string, status: string, note?: string) =>
    api
      .post<ApiItemResponse<Invoice>>(`/invoices/${id}/status`, { status, note })
      .then((r) => r.data),
  send: (id: string, body: unknown) =>
    api.post<ApiItemResponse<Invoice>>(`/invoices/${id}/send`, body).then((r) => r.data),
  duplicate: (id: string) =>
    api.post<ApiItemResponse<Invoice>>(`/invoices/${id}/duplicate`).then((r) => r.data),
  cancel: (id: string, reason: string) =>
    api.post<ApiItemResponse<Invoice>>(`/invoices/${id}/cancel`, { reason }).then((r) => r.data),
  void: (id: string, reason: string) =>
    api.post<ApiItemResponse<Invoice>>(`/invoices/${id}/void`, { reason }).then((r) => r.data),
  payments: (id: string) => api.get<ApiListResponse<Payment>>(`/invoices/${id}/payments`),
  pdf: (id: string) => api.blob(`/invoices/${id}/pdf`),
  whatsapp: (id: string) =>
    api
      .get<ApiItemResponse<{ url: string; message: string }>>(`/invoices/${id}/whatsapp`)
      .then((r) => r.data),
};

export const paymentsService = {
  ...crud<Payment>('/payments'),
  void: (id: string, reason: string) =>
    api.post<ApiItemResponse<Payment>>(`/payments/${id}/void`, { reason }).then((r) => r.data),
};

export const recurringService = {
  ...crud<RecurringInvoice>('/recurring-invoices'),
  generate: (id: string) =>
    api
      .post<ApiItemResponse<{ generated: number; invoices: Invoice[] }>>(
        `/recurring-invoices/${id}/generate`,
      )
      .then((r) => r.data),
};

export const dashboardService = {
  get: (params: { range: string; from?: string; to?: string }) =>
    api.get<ApiItemResponse<DashboardData>>('/dashboard', params).then((r) => r.data),
};

export const reportsService = {
  sales: (params: ListParams) => api.get<ApiListResponse<SalesReportRow>>('/reports/sales', params),
  invoices: (params: ListParams) => api.get<ApiListResponse<Invoice>>('/reports/invoices', params),
  quotations: (params: ListParams) =>
    api.get<ApiListResponse<Quotation>>('/reports/quotations', params),
  payments: (params: ListParams) => api.get<ApiListResponse<Payment>>('/reports/payments', params),
  taxes: (params: ListParams) => api.get<ApiListResponse<TaxReportRow>>('/reports/taxes', params),
  customers: (params: ListParams) =>
    api.get<ApiListResponse<CustomerReportRow>>('/reports/customers', params),
};

export const settingsService = {
  getNumbering: () => api.get<ApiListResponse<NumberingSettings>>('/settings/numbering'),
  updateNumbering: (id: string, body: unknown) =>
    api.put<ApiItemResponse<NumberingSettings>>(`/settings/numbering/${id}`, body).then((r) => r.data),
  updateBusiness: (body: unknown) => api.put<ApiItemResponse<unknown>>('/settings/business', body),
  updateSettings: (body: unknown) => api.put<ApiItemResponse<unknown>>('/settings', body),
  updateBranding: (body: unknown) => api.put<ApiItemResponse<unknown>>('/settings/branding', body),
  uploadBrandingAsset: (kind: 'logo' | 'favicon', file: File) => {
    const form = new FormData();
    form.append('file', file);
    return api.post<ApiItemResponse<unknown>>(`/settings/branding/${kind}`, form).then((r) => r.data);
  },
  templates: () => api.get<ApiListResponse<DocumentTemplate>>('/settings/templates'),
  members: () => api.get<ApiListResponse<Member>>('/members'),
  roles: () => api.get<ApiListResponse<Role>>('/roles'),
  auditLogs: (params?: ListParams) => api.get<ApiListResponse<AuditLog>>('/audit-logs', params),
  backups: () => api.get<ApiListResponse<BackupJob>>('/backups'),
  createBackup: (body: { scope: string; format: string }) =>
    api.post<ApiItemResponse<BackupJob>>('/backups', body).then((r) => r.data),
};

export const notificationsService = {
  list: (params?: ListParams) => api.get<ApiListResponse<Notification>>('/notifications', params),
  markRead: (id: string) => api.post<void>(`/notifications/${id}/read`),
  markAllRead: () => api.post<void>('/notifications/read-all'),
};

export interface SearchResults {
  customers: { id: string; label: string; sublabel: string }[];
  products: { id: string; label: string; sublabel: string }[];
  quotations: { id: string; label: string; sublabel: string }[];
  invoices: { id: string; label: string; sublabel: string }[];
  payments: { id: string; label: string; sublabel: string }[];
}

export const searchService = {
  query: (q: string) =>
    api.get<ApiItemResponse<SearchResults>>('/search', { q }).then((r) => r.data),
};

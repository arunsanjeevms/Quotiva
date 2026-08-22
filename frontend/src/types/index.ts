/** Shared domain types mirroring the API contract in docs/05-api-spec.md. */

/** Money always crosses the wire as a string. Never do arithmetic on it in the UI. */
export type Money = string;
export type UUID = string;
export type ISODate = string;

export type QuotationStatus =
  | 'draft' | 'sent' | 'viewed' | 'accepted'
  | 'rejected' | 'expired' | 'cancelled' | 'converted';

export type InvoiceStatus = 'draft' | 'sent' | 'viewed' | 'cancelled' | 'void';
export type PaymentState = 'unpaid' | 'partially_paid' | 'paid' | 'overdue';
export type DiscountType = 'percentage' | 'fixed';
export type TaxMode = 'exclusive' | 'inclusive' | 'none';
export type ItemSource = 'catalog' | 'custom';
export type ProductKind = 'product' | 'service';
export type MemberStatus = 'active' | 'invited' | 'suspended';
export type NumberingReset = 'never' | 'yearly' | 'monthly' | 'daily';
export type RecurrenceFrequency = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly' | 'custom';
export type CustomFieldType =
  | 'text' | 'number' | 'date' | 'dropdown' | 'checkbox' | 'email' | 'phone';
export type CustomFieldEntity = 'customer' | 'product' | 'quotation' | 'invoice' | 'business';

export interface UserProfile {
  id: UUID;
  fullName: string | null;
  email: string;
  phone: string | null;
  avatarUrl: string | null;
  lastLoginAt: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface Business {
  id: UUID;
  name: string;
  legalName: string | null;
  email: string | null;
  altEmail: string | null;
  phone: string | null;
  altPhone: string | null;
  website: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  postalCode: string | null;
  taxRegistrationNumber: string | null;
  businessRegistrationNumber: string | null;
  registrationExtra: { label: string; value: string }[];
  timezone: string;
  locale: string;
  dateFormat: string;
}

export interface CurrencySettings {
  currencyCode: string;
  currencyName: string;
  currencySymbol: string;
  decimalPlaces: number;
  symbolPosition: 'before' | 'after';
  thousandSeparator: string;
  decimalSeparator: string;
}

export interface BusinessSettings extends CurrencySettings {
  businessId: UUID;
  defaultInvoiceTemplateId: UUID | null;
  defaultQuotationTemplateId: UUID | null;
  defaultTaxId: UUID | null;
  defaultTaxMode: TaxMode;
  defaultPaymentTermsDays: number;
  quotationValidityDays: number;
  /** The four independent rich-text defaults — see docs/12-notes-and-terms.md. */
  defaultQuotationNotes: string | null;
  defaultInvoiceNotes: string | null;
  defaultQuotationTerms: string | null;
  defaultInvoiceTerms: string | null;
  includeNotesByDefault: boolean;
  includeTermsByDefault: boolean;
  defaultFooter: string | null;
  defaultPaymentInstructions: string | null;
  pageSize: 'A4' | 'Letter';
  bankName: string | null;
  bankAccountName: string | null;
  bankAccountNumber: string | null;
  bankIfscSwift: string | null;
  bankBranch: string | null;
  upiId: string | null;
  paymentQrUrl: string | null;
  showPaymentDetailsOnDocuments: boolean;
  emailFromName: string | null;
  emailReplyTo: string | null;
  emailEnabled: boolean;
  notifyOnPayment: boolean;
  notifyOnQuotationAccept: boolean;
  notifyOnOverdue: boolean;
  features: { inventory: boolean; recurring: boolean; reminders: boolean };
}

export interface BusinessBranding {
  businessId: UUID;
  logoUrl: string | null;
  faviconUrl: string | null;
  primaryColor: string;
  secondaryColor: string;
  /** Document accent. Null means "follow the primary brand colour". */
  documentAccentColor: string | null;
  showLogoOnDocuments: boolean;
}

export interface Customer {
  id: UUID;
  code: string | null;
  name: string;
  companyName: string | null;
  email: string | null;
  phone: string | null;
  altPhone: string | null;
  website: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  postalCode: string | null;
  taxId: string | null;
  currencyCode: string | null;
  paymentTermsDays: number | null;
  notes: string | null;
  isActive: boolean;
  archivedAt: string | null;
  createdAt: string;
  stats?: CustomerStats;
}

export interface CustomerStats {
  quotationCount: number;
  invoiceCount: number;
  totalInvoiced: Money;
  totalPaid: Money;
  outstanding: Money;
  lastTransactionAt: string | null;
}

export interface Category {
  id: UUID;
  name: string;
  description: string | null;
  appliesTo: ProductKind | null;
  isActive: boolean;
}

export interface Unit {
  id: UUID;
  name: string;
  abbreviation: string;
  isActive: boolean;
}

export interface TaxComponent { id: UUID; name: string; rate: number }

export interface Tax {
  id: UUID;
  name: string;
  rate: number;
  description: string | null;
  isActive: boolean;
  components: TaxComponent[];
}

export interface Product {
  id: UUID;
  kind: ProductKind;
  name: string;
  sku: string | null;
  description: string | null;
  categoryId: UUID | null;
  categoryName: string | null;
  unitId: UUID | null;
  unitName: string | null;
  costPrice: Money | null;
  sellingPrice: Money;
  taxId: UUID | null;
  taxName: string | null;
  taxRate: number | null;
  notes: string | null;
  isActive: boolean;
  archivedAt: string | null;
  createdAt: string;
}

export interface DocumentItem {
  id: UUID;
  sortOrder: number;
  source: ItemSource;
  productId: UUID | null;
  name: string;
  description: string | null;
  sku: string | null;
  unitId: UUID | null;
  unitName: string | null;
  quantity: string;
  unitPrice: Money;
  discountType: DiscountType | null;
  discountValue: string;
  discountAmount: Money;
  taxId: UUID | null;
  taxName: string | null;
  taxRate: number;
  taxBreakdown: { name: string; rate: number; amount: Money }[];
  lineSubtotal: Money;
  taxableAmount: Money;
  taxAmount: Money;
  lineTotal: Money;
  notes: string | null;
}

export interface DocumentCharge {
  id: UUID;
  label: string;
  amount: Money;
  isTaxable: boolean;
  taxId: UUID | null;
  taxAmount: Money;
}

export interface DocumentTotals {
  subtotal: Money;
  itemDiscountTotal: Money;
  documentDiscountAmount: Money;
  taxableAmount: Money;
  taxTotal: Money;
  additionalChargesTotal: Money;
  grandTotal: Money;
  taxBreakdown: { name: string; rate: number; taxable: Money; amount: Money }[];
}

interface DocumentBase extends DocumentTotals {
  id: UUID;
  customerId: UUID;
  customer: Pick<Customer, 'id' | 'name' | 'companyName' | 'email' | 'phone'>;
  issueDate: ISODate;
  currencyCode: string;
  currencySymbol: string;
  taxMode: TaxMode;
  discountType: DiscountType | null;
  discountValue: string;
  items: DocumentItem[];
  charges: DocumentCharge[];
  templateId: UUID | null;
  /** Snapshots — never re-read from settings when rendering. */
  customNotes: string | null;
  termsAndConditions: string | null;
  includeNotes: boolean;
  includeTerms: boolean;
  paymentInstructions: string | null;
  internalNotes: string | null;
  reference: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Quotation extends DocumentBase {
  quotationNumber: string;
  status: QuotationStatus;
  validUntil: ISODate | null;
  convertedInvoiceId: UUID | null;
  convertedInvoiceNumber: string | null;
  sentAt: string | null;
  acceptedAt: string | null;
}

export interface Invoice extends DocumentBase {
  invoiceNumber: string;
  status: InvoiceStatus;
  paymentStatus: PaymentState;
  dueDate: ISODate | null;
  quotationId: UUID | null;
  quotationNumber: string | null;
  amountPaid: Money;
  amountDue: Money;
  sentAt: string | null;
  paidAt: string | null;
  cancelReason: string | null;
}

export interface PaymentMethod {
  id: UUID;
  name: string;
  description: string | null;
  requiresReference: boolean;
  isActive: boolean;
}

export interface Payment {
  id: UUID;
  invoiceId: UUID;
  invoiceNumber: string;
  customerId: UUID;
  customerName: string;
  amount: Money;
  paymentDate: ISODate;
  paymentMethodId: UUID | null;
  paymentMethodName: string | null;
  referenceNumber: string | null;
  notes: string | null;
  currencyCode: string;
  isVoided: boolean;
  voidReason: string | null;
  createdAt: string;
}

export interface RecurringInvoice {
  id: UUID;
  customerId: UUID;
  customerName: string;
  title: string;
  frequency: RecurrenceFrequency;
  intervalCount: number;
  startDate: ISODate;
  endDate: ISODate | null;
  maxOccurrences: number | null;
  occurrencesGenerated: number;
  nextRunDate: ISODate | null;
  lastRunDate: ISODate | null;
  isActive: boolean;
  autoSend: boolean;
  currencyCode: string;
  grandTotal: Money;
}

export interface NumberingSettings {
  id: UUID;
  documentType: 'quotation' | 'invoice' | 'payment';
  prefix: string;
  suffix: string;
  separator: string;
  padding: number;
  startNumber: number;
  includeYear: boolean;
  includeMonth: boolean;
  yearFormat: 'yyyy' | 'yy';
  resetFrequency: NumberingReset;
  format: string;
  nextNumberPreview: string;
}

export interface CustomFieldDefinition {
  id: UUID;
  entityType: CustomFieldEntity;
  key: string;
  label: string;
  fieldType: CustomFieldType;
  options: string[];
  isRequired: boolean;
  showOnDocument: boolean;
  sortOrder: number;
  isActive: boolean;
}

export interface Role {
  id: UUID;
  key: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  permissions: string[];
}

export interface Member {
  id: UUID;
  userId: UUID;
  fullName: string | null;
  email: string;
  avatarUrl: string | null;
  roleId: UUID;
  roleName: string;
  status: MemberStatus;
  joinedAt: string | null;
}

export interface AuditLog {
  id: UUID;
  userId: UUID | null;
  userEmail: string | null;
  action: string;
  entityType: string | null;
  entityId: UUID | null;
  entityLabel: string | null;
  metadata: Record<string, unknown>;
  ipAddress: string | null;
  createdAt: string;
}

export interface Notification {
  id: UUID;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  severity: 'info' | 'success' | 'warning' | 'error';
  readAt: string | null;
  createdAt: string;
}

export interface DocumentTemplate {
  id: UUID;
  key: string;
  name: string;
  documentType: 'invoice' | 'quotation' | 'statement' | 'receipt';
  description: string;
}

export interface EmailTemplate {
  id: UUID;
  key: string;
  name: string;
  subject: string;
  bodyHtml: string;
  isActive: boolean;
}

export interface ReminderRule {
  id: UUID;
  name: string;
  trigger: 'before_due' | 'on_due' | 'after_due';
  offsetDays: number;
  isActive: boolean;
}

export interface BackupJob {
  id: UUID;
  status: 'queued' | 'running' | 'completed' | 'failed';
  scope: 'business_export' | 'full_dump';
  format: 'csv_zip' | 'sql';
  sizeBytes: number | null;
  downloadUrl: string | null;
  error: string | null;
  createdAt: string;
  finishedAt: string | null;
}

/* ---------- API envelope ---------- */

export interface ListMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface ApiListResponse<T> { data: T[]; meta: ListMeta }
export interface ApiItemResponse<T> { data: T }

export interface ApiErrorBody {
  error: { code: string; message: string; details?: { path: string; message: string }[] };
  requestId?: string;
}

export interface ListParams {
  page?: number;
  pageSize?: number;
  sort?: string;
  order?: 'asc' | 'desc';
  q?: string;
  from?: string;
  to?: string;
  status?: string;
  customerId?: string;
  kind?: ProductKind;
  includeArchived?: boolean;
  [key: string]: unknown;
}

/* ---------- Dashboard & reports ---------- */

export type DateRangePreset =
  | 'today' | 'yesterday' | 'this_week' | 'this_month'
  | 'last_month' | 'this_quarter' | 'this_year' | 'custom';

export interface DashboardData {
  kpis: {
    revenue: Money;
    paymentsReceived: Money;
    outstanding: Money;
    invoiceCount: number;
    paidCount: number;
    pendingCount: number;
    overdueCount: number;
    quotationCount: number;
    acceptedCount: number;
    rejectedCount: number;
    customerCount: number;
    productCount: number;
  };
  revenueTrend: { period: string; invoiced: Money; collected: Money }[];
  invoiceStatus: { status: string; count: number; amount: Money }[];
  quotationStatus: { status: string; count: number; amount: Money }[];
  paymentMethods: { method: string; count: number; amount: Money }[];
  topCustomers: { customerId: UUID; name: string; invoiced: Money; paid: Money }[];
  topItems: { productId: UUID | null; name: string; quantity: string; revenue: Money }[];
  attention: {
    overdueInvoices: { id: UUID; number: string; customer: string; amountDue: Money; dueDate: ISODate }[];
    expiringQuotations: { id: UUID; number: string; customer: string; total: Money; validUntil: ISODate }[];
  };
}

export interface StatementEntry {
  id: string;
  date: ISODate;
  type: 'invoice' | 'payment' | 'adjustment';
  reference: string;
  description: string;
  debit: Money | null;
  credit: Money | null;
  balance: Money;
}

export interface CustomerStatement {
  customer: Customer;
  from: ISODate;
  to: ISODate;
  openingBalance: Money;
  closingBalance: Money;
  entries: StatementEntry[];
}

export interface SalesReportRow {
  period: string;
  invoiceCount: number;
  invoiced: Money;
  paid: Money;
  outstanding: Money;
}

export interface TaxReportRow {
  taxName: string;
  rate: number;
  taxableAmount: Money;
  taxCollected: Money;
  documentCount: number;
}

export interface CustomerReportRow {
  customerId: UUID;
  name: string;
  companyName: string | null;
  invoiceCount: number;
  totalInvoiced: Money;
  totalPaid: Money;
  outstanding: Money;
}

import Decimal from 'decimal.js';
import { TEMPLATE_ORDER, TEMPLATE_THEMES } from '@/components/documents/templateThemes';
import type {
  AuditLog,
  BackupJob,
  Business,
  BusinessBranding,
  BusinessSettings,
  Category,
  Customer,
  CustomFieldDefinition,
  DocumentCharge,
  DocumentItem,
  DocumentTemplate,
  EmailTemplate,
  Invoice,
  InvoiceStatus,
  Member,
  Notification,
  NumberingSettings,
  Payment,
  PaymentMethod,
  PaymentState,
  Product,
  Quotation,
  QuotationStatus,
  RecurringInvoice,
  ReminderRule,
  Role,
  Tax,
  Unit,
} from '@/types';

/**
 * Seeded in-memory dataset backing the MSW mock API.
 *
 * The data is deliberately business-neutral: a mixed product/service catalog,
 * a configurable currency, admin-named taxes and units. Nothing here implies an
 * industry, and every value it contains is one an administrator could change.
 */

const uid = (n: number, prefix = 'a'): string =>
  `${prefix}${String(n).padStart(7, '0')}-0000-4000-8000-${String(n).padStart(12, '0')}`;

const today = new Date();
const iso = (d: Date): string => d.toISOString().slice(0, 10);
const daysFromNow = (n: number): string => {
  const d = new Date(today);
  d.setDate(d.getDate() + n);
  return iso(d);
};
const stampFromNow = (n: number, hour = 10): string => {
  const d = new Date(today);
  d.setDate(d.getDate() + n);
  d.setHours(hour, (n * 7) % 60, 0, 0);
  return d.toISOString();
};

const money = (v: Decimal | number | string): string => new Decimal(v).toFixed(4);

/* ------------------------------- Identity -------------------------------- */

export const BUSINESS_ID = uid(1, 'b');
export const USER_ID = '11111111-1111-4111-8111-111111111111';

export const business: Business = {
  id: BUSINESS_ID,
  name: 'Northwind Studio',
  legalName: 'Northwind Studio LLC',
  email: 'hello@northwindstudio.example',
  altEmail: 'accounts@northwindstudio.example',
  phone: '+1 555 0180',
  altPhone: null,
  website: 'https://northwindstudio.example',
  addressLine1: '18 Harbour Lane',
  addressLine2: 'Suite 400',
  city: 'Portland',
  state: 'Oregon',
  country: 'United States',
  postalCode: '97204',
  taxRegistrationNumber: 'TRN-8842-11',
  businessRegistrationNumber: 'REG-2019-44871',
  registrationExtra: [{ label: 'State licence', value: 'OR-4471-B' }],
  timezone: 'America/Los_Angeles',
  locale: 'en',
  dateFormat: 'dd MMM yyyy',
};

export const branding: BusinessBranding = {
  businessId: BUSINESS_ID,
  logoUrl: null,
  faviconUrl: null,
  primaryColor: '#2563EB',
  secondaryColor: '#475569',
  documentAccentColor: null,
  showLogoOnDocuments: true,
};

export const settings: BusinessSettings = {
  businessId: BUSINESS_ID,
  currencyCode: 'INR',
  currencyName: 'Indian Rupee',
  currencySymbol: 'Rs.',
  decimalPlaces: 2,
  symbolPosition: 'before',
  thousandSeparator: ',',
  decimalSeparator: '.',
  // Invoice uses Classic, quotation uses Modern — different by default so the
  // demo shows two designs without touching settings.
  defaultInvoiceTemplateId: uid(1, 't'),
  defaultQuotationTemplateId: uid(102, 't'),
  defaultTaxId: uid(2, 'x'),
  defaultTaxMode: 'exclusive',
  defaultPaymentTermsDays: 30,
  quotationValidityDays: 30,
  defaultQuotationNotes:
    '<p>Thank you for the opportunity to quote on this work. Please get in touch if you would like any part of the scope adjusted.</p>',
  defaultInvoiceNotes:
    '<p>Thank you for your business. Please quote the invoice number when making payment.</p>',
  defaultQuotationTerms:
    '<ol><li>This quotation is valid for the period shown above.</li><li>Prices are subject to the applicable taxes.</li><li>Any additional work outside the agreed scope may be charged separately.</li><li>Payment terms are as specified in this quotation.</li></ol>',
  defaultInvoiceTerms:
    '<ol><li>Payment is due by the specified due date.</li><li>Please mention the invoice number when making payment.</li><li>Late payments may be subject to applicable charges.</li><li>All disputes are subject to the applicable terms and jurisdiction.</li></ol>',
  includeNotesByDefault: true,
  includeTermsByDefault: true,
  defaultFooter: 'Northwind Studio LLC · Registered in Oregon, United States',
  defaultPaymentInstructions:
    'Payment by bank transfer is preferred. Please include the invoice number as the payment reference.',
  pageSize: 'A4',
  bankName: 'Harbour Commercial Bank',
  bankAccountName: 'Northwind Studio LLC',
  bankAccountNumber: '0044 8812 5590',
  bankIfscSwift: 'HRBCUS33',
  bankBranch: 'Portland Central',
  upiId: null,
  paymentQrUrl: null,
  showPaymentDetailsOnDocuments: true,
  emailFromName: 'Northwind Studio',
  emailReplyTo: 'accounts@northwindstudio.example',
  emailEnabled: false,
  notifyOnPayment: true,
  notifyOnQuotationAccept: true,
  notifyOnOverdue: true,
  features: { inventory: false, recurring: true, reminders: true },
};

const ALL_PERMISSIONS = [
  'dashboard.read',
  'customer.read', 'customer.create', 'customer.update', 'customer.delete', 'customer.export',
  'product.read', 'product.create', 'product.update', 'product.delete', 'product.import',
  'catalog.read', 'catalog.create', 'catalog.update', 'catalog.delete',
  'tax.read', 'tax.create', 'tax.update', 'tax.delete',
  'quotation.read', 'quotation.create', 'quotation.update', 'quotation.delete',
  'quotation.send', 'quotation.convert', 'quotation.cancel',
  'invoice.read', 'invoice.create', 'invoice.update', 'invoice.delete',
  'invoice.send', 'invoice.cancel', 'invoice.void',
  'payment.read', 'payment.create', 'payment.update', 'payment.void',
  'recurring.read', 'recurring.create', 'recurring.update', 'recurring.delete', 'recurring.generate',
  'report.read', 'report.export',
  'settings.read', 'settings.update', 'business.update',
  'user.read', 'user.manage', 'role.manage',
  'audit.read', 'backup.read', 'backup.create',
  'attachment.read', 'attachment.create', 'attachment.delete',
];

export const roles: Role[] = [
  {
    id: uid(1, 'r'),
    key: 'super_admin',
    name: 'Super Admin',
    description: 'Full access, including roles, security and backups.',
    isSystem: true,
    permissions: ALL_PERMISSIONS,
  },
  {
    id: uid(2, 'r'),
    key: 'administrator',
    name: 'Administrator',
    description: 'Everything except role management and backups.',
    isSystem: true,
    permissions: ALL_PERMISSIONS.filter((p) => p !== 'role.manage' && p !== 'backup.create'),
  },
  {
    id: uid(3, 'r'),
    key: 'staff',
    name: 'Staff',
    description: 'Day-to-day sales work. Cannot change settings or delete records.',
    isSystem: true,
    permissions: [
      'dashboard.read', 'customer.read', 'customer.create', 'customer.update',
      'product.read', 'product.create', 'product.update', 'catalog.read', 'tax.read',
      'quotation.read', 'quotation.create', 'quotation.update', 'quotation.send',
      'invoice.read', 'invoice.create', 'invoice.update', 'invoice.send',
      'payment.read', 'payment.create', 'report.read', 'settings.read',
    ],
  },
];

export const members: Member[] = [
  {
    id: uid(1, 'm'),
    userId: USER_ID,
    fullName: 'Arun Sanjeev M S',
    email: 'demo@quotiva.app',
    avatarUrl: null,
    roleId: roles[0]!.id,
    roleName: 'Super Admin',
    status: 'active',
    joinedAt: '2026-01-04T09:12:00.000Z',
  },
  {
    id: uid(2, 'm'),
    userId: uid(2, 'u'),
    fullName: 'Priya Raman',
    email: 'priya@northwindstudio.example',
    avatarUrl: null,
    roleId: roles[1]!.id,
    roleName: 'Administrator',
    status: 'active',
    joinedAt: '2026-02-11T08:30:00.000Z',
  },
  {
    id: uid(3, 'm'),
    userId: uid(3, 'u'),
    fullName: 'Sam Okafor',
    email: 'sam@northwindstudio.example',
    avatarUrl: null,
    roleId: roles[2]!.id,
    roleName: 'Staff',
    status: 'active',
    joinedAt: '2026-03-02T11:45:00.000Z',
  },
  {
    id: uid(4, 'm'),
    userId: uid(4, 'u'),
    fullName: null,
    email: 'noor@northwindstudio.example',
    avatarUrl: null,
    roleId: roles[2]!.id,
    roleName: 'Staff',
    status: 'invited',
    joinedAt: null,
  },
];

/* -------------------------------- Catalog -------------------------------- */

export const units: Unit[] = [
  { id: uid(1, 'n'), name: 'Piece', abbreviation: 'pc', isActive: true },
  { id: uid(2, 'n'), name: 'Hour', abbreviation: 'hr', isActive: true },
  { id: uid(3, 'n'), name: 'Day', abbreviation: 'day', isActive: true },
  { id: uid(4, 'n'), name: 'Licence', abbreviation: 'lic', isActive: true },
  { id: uid(5, 'n'), name: 'Month', abbreviation: 'mo', isActive: true },
  { id: uid(6, 'n'), name: 'Kilogram', abbreviation: 'kg', isActive: false },
];

export const categories: Category[] = [
  { id: uid(1, 'c'), name: 'Consulting', description: 'Advisory and strategy engagements', appliesTo: 'service', isActive: true },
  { id: uid(2, 'c'), name: 'Implementation', description: 'Build and delivery work', appliesTo: 'service', isActive: true },
  { id: uid(3, 'c'), name: 'Hardware', description: 'Physical goods resold to clients', appliesTo: 'product', isActive: true },
  { id: uid(4, 'c'), name: 'Software licences', description: null, appliesTo: 'product', isActive: true },
  { id: uid(5, 'c'), name: 'Support', description: 'Ongoing maintenance and retainers', appliesTo: null, isActive: true },
];

export const taxes: Tax[] = [
  { id: uid(1, 'x'), name: 'No Tax', rate: 0, description: 'Zero-rated', isActive: true, components: [] },
  { id: uid(2, 'x'), name: 'Standard 10%', rate: 10, description: 'Standard rate', isActive: true, components: [] },
  { id: uid(3, 'x'), name: 'Reduced 5%', rate: 5, description: 'Reduced rate', isActive: true, components: [] },
  {
    id: uid(4, 'x'),
    name: 'Combined 18%',
    rate: 18,
    description: 'Split across two components',
    isActive: true,
    components: [
      { id: uid(41, 'x'), name: 'Component A', rate: 9 },
      { id: uid(42, 'x'), name: 'Component B', rate: 9 },
    ],
  },
];

const PRODUCT_SEED: [string, 'product' | 'service', string, number, number, string, string][] = [
  ['Discovery workshop', 'service', 'SVC-DISC', 1200, 2, uid(1, 'c'), uid(3, 'n')],
  ['Solution architecture', 'service', 'SVC-ARCH', 165, 2, uid(1, 'c'), uid(2, 'n')],
  ['Senior developer', 'service', 'SVC-DEV1', 140, 2, uid(2, 'c'), uid(2, 'n')],
  ['Developer', 'service', 'SVC-DEV2', 105, 2, uid(2, 'c'), uid(2, 'n')],
  ['UX design', 'service', 'SVC-UX', 125, 2, uid(2, 'c'), uid(2, 'n')],
  ['QA and testing', 'service', 'SVC-QA', 95, 2, uid(2, 'c'), uid(2, 'n')],
  ['Data migration', 'service', 'SVC-MIGR', 3400, 2, uid(2, 'c'), uid(1, 'n')],
  ['Support retainer — standard', 'service', 'SVC-RET1', 850, 2, uid(5, 'c'), uid(5, 'n')],
  ['Support retainer — priority', 'service', 'SVC-RET2', 1650, 2, uid(5, 'c'), uid(5, 'n')],
  ['Onboarding and training', 'service', 'SVC-TRAIN', 780, 3, uid(1, 'c'), uid(3, 'n')],
  ['Platform licence — team', 'product', 'LIC-TEAM', 480, 2, uid(4, 'c'), uid(4, 'n')],
  ['Platform licence — enterprise', 'product', 'LIC-ENT', 1450, 2, uid(4, 'c'), uid(4, 'n')],
  ['Monitoring add-on', 'product', 'LIC-MON', 220, 2, uid(4, 'c'), uid(4, 'n')],
  ['Edge gateway unit', 'product', 'HW-GW01', 1290, 4, uid(3, 'c'), uid(1, 'n')],
  ['Rack mount kit', 'product', 'HW-RM02', 145, 4, uid(3, 'c'), uid(1, 'n')],
  ['Backup appliance', 'product', 'HW-BK03', 2650, 4, uid(3, 'c'), uid(1, 'n')],
  ['Network switch — 24 port', 'product', 'HW-SW24', 690, 4, uid(3, 'c'), uid(1, 'n')],
  ['Cable set', 'product', 'HW-CBL', 38, 4, uid(3, 'c'), uid(1, 'n')],
  ['Legacy adapter', 'product', 'HW-LEG', 210, 4, uid(3, 'c'), uid(1, 'n')],
  ['Content audit', 'service', 'SVC-AUD', 1950, 2, uid(1, 'c'), uid(1, 'n')],
];

export const products: Product[] = PRODUCT_SEED.map((seed, i) => {
  const [name, kind, sku, price, taxIdx, categoryId, unitId] = seed;
  const tax = taxes[taxIdx];
  const category = categories.find((c) => c.id === categoryId);
  const unit = units.find((u) => u.id === unitId);
  return {
    id: uid(i + 1, 'p'),
    kind,
    name,
    sku,
    description:
      kind === 'service'
        ? 'Delivered by our team against the agreed statement of work.'
        : 'Supplied with the manufacturer standard warranty.',
    categoryId,
    categoryName: category?.name ?? null,
    unitId,
    unitName: unit?.name ?? null,
    costPrice: money(new Decimal(price).times(0.62)),
    sellingPrice: money(price),
    taxId: tax?.id ?? null,
    taxName: tax?.name ?? null,
    taxRate: tax?.rate ?? 0,
    notes: null,
    // One archived item so the archived filter has something to show.
    isActive: name !== 'Legacy adapter',
    archivedAt: name === 'Legacy adapter' ? stampFromNow(-120) : null,
    createdAt: stampFromNow(-200 + i * 3),
  };
});

/* ------------------------------- Customers -------------------------------- */

const CUSTOMER_SEED: [string, string, string, string, string][] = [
  ['Alder & Finch', 'Maya Alder', 'maya@alderfinch.example', '+1 555 0110', 'Seattle'],
  ['Beacon Logistics', 'Tom Beacon', 'tom@beaconlog.example', '+1 555 0111', 'Denver'],
  ['Corvus Retail Group', 'Ines Cardoso', 'ines@corvusretail.example', '+1 555 0112', 'Austin'],
  ['Delta Fabrication', 'Rahul Menon', 'rahul@deltafab.example', '+1 555 0113', 'Chicago'],
  ['Everline Health', 'Sara Whitfield', 'sara@everline.example', '+1 555 0114', 'Boston'],
  ['Fernwood Property', 'Jonas Fern', 'jonas@fernwood.example', '+1 555 0115', 'Portland'],
  ['Gaslight Media', 'Amara Odili', 'amara@gaslight.example', '+1 555 0116', 'New York'],
  ['Halcyon Foods', 'Peter Nguyen', 'peter@halcyonfoods.example', '+1 555 0117', 'San Diego'],
  ['Ironvale Engineering', 'Lucia Moreno', 'lucia@ironvale.example', '+1 555 0118', 'Pittsburgh'],
  ['Juniper Labs', 'Ade Balogun', 'ade@juniperlabs.example', '+1 555 0119', 'Raleigh'],
  ['Kestrel Marine', 'Nils Haugen', 'nils@kestrelmarine.example', '+1 555 0120', 'Norfolk'],
  ['Lantern Education Trust', 'Grace Ellery', 'grace@lanterntrust.example', '+1 555 0121', 'Madison'],
  ['Meridian Partners', 'Omar Haddad', 'omar@meridianpartners.example', '+1 555 0122', 'Miami'],
  ['Northgate Civic', 'Ruth Adeyemi', 'ruth@northgatecivic.example', '+1 555 0123', 'Cleveland'],
];

export const customers: Customer[] = CUSTOMER_SEED.map((seed, i) => {
  const [company, contact, email, phone, city] = seed;
  return {
    id: uid(i + 1, 'k'),
    code: `CUS-${String(i + 1).padStart(4, '0')}`,
    name: contact,
    companyName: company,
    email,
    phone,
    altPhone: null,
    website: `https://${company.toLowerCase().replace(/[^a-z]+/g, '')}.example`,
    addressLine1: `${100 + i * 7} Market Street`,
    addressLine2: null,
    city,
    state: null,
    country: 'United States',
    postalCode: `9${String(1000 + i * 37).slice(0, 4)}`,
    taxId: i % 3 === 0 ? `TX-${4400 + i}` : null,
    currencyCode: null,
    paymentTermsDays: i % 4 === 0 ? 14 : null,
    notes: null,
    isActive: company !== 'Northgate Civic',
    archivedAt: company === 'Northgate Civic' ? stampFromNow(-60) : null,
    createdAt: stampFromNow(-240 + i * 12),
  };
});

/* --------------------------- Document generation -------------------------- */

/** Deterministic pseudo-random so the demo dataset is stable across reloads. */
function seeded(n: number): number {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

function buildItems(seed: number, count: number): DocumentItem[] {
  return Array.from({ length: count }, (_, i) => {
    const product = products[Math.floor(seeded(seed + i * 3) * products.length)]!;
    const quantity = new Decimal(Math.max(1, Math.floor(seeded(seed + i * 5) * 8) + 1));
    const unitPrice = new Decimal(product.sellingPrice);
    const lineSubtotal = quantity.times(unitPrice);
    const hasDiscount = seeded(seed + i * 7) > 0.75;
    const discountValue = hasDiscount ? new Decimal(5) : new Decimal(0);
    const discountAmount = hasDiscount ? lineSubtotal.times(0.05) : new Decimal(0);
    const taxable = lineSubtotal.minus(discountAmount);
    const rate = new Decimal(product.taxRate ?? 0);
    const taxAmount = taxable.times(rate).dividedBy(100);
    return {
      id: uid(seed * 100 + i, 'i'),
      sortOrder: i,
      source: 'catalog' as const,
      productId: product.id,
      name: product.name,
      description: product.description,
      sku: product.sku,
      unitId: product.unitId,
      unitName: product.unitName,
      quantity: quantity.toFixed(4),
      unitPrice: money(unitPrice),
      discountType: hasDiscount ? ('percentage' as const) : null,
      discountValue: discountValue.toFixed(4),
      discountAmount: money(discountAmount),
      taxId: product.taxId,
      taxName: product.taxName,
      taxRate: product.taxRate ?? 0,
      taxBreakdown: [],
      lineSubtotal: money(lineSubtotal),
      taxableAmount: money(taxable),
      taxAmount: money(taxAmount),
      lineTotal: money(taxable.plus(taxAmount)),
      notes: null,
    };
  });
}

function totalsFor(items: DocumentItem[], charges: DocumentCharge[]) {
  const subtotal = items.reduce((a, i) => a.plus(i.lineSubtotal), new Decimal(0));
  const itemDiscountTotal = items.reduce((a, i) => a.plus(i.discountAmount), new Decimal(0));
  const taxableAmount = items.reduce((a, i) => a.plus(i.taxableAmount), new Decimal(0));
  const taxTotal = items.reduce((a, i) => a.plus(i.taxAmount), new Decimal(0));
  const chargesTotal = charges.reduce((a, c) => a.plus(c.amount), new Decimal(0));
  const grandTotal = taxableAmount.plus(taxTotal).plus(chargesTotal);

  const map = new Map<string, { name: string; rate: number; taxable: Decimal; amount: Decimal }>();
  for (const item of items) {
    if (item.taxRate <= 0) continue;
    const key = `${item.taxName}|${item.taxRate}`;
    const entry = map.get(key) ?? {
      name: item.taxName ?? 'Tax',
      rate: item.taxRate,
      taxable: new Decimal(0),
      amount: new Decimal(0),
    };
    entry.taxable = entry.taxable.plus(item.taxableAmount);
    entry.amount = entry.amount.plus(item.taxAmount);
    map.set(key, entry);
  }

  return {
    subtotal: money(subtotal),
    itemDiscountTotal: money(itemDiscountTotal),
    documentDiscountAmount: money(0),
    taxableAmount: money(taxableAmount),
    taxTotal: money(taxTotal),
    additionalChargesTotal: money(chargesTotal),
    grandTotal: money(grandTotal),
    taxBreakdown: [...map.values()].map((b) => ({
      name: b.name,
      rate: b.rate,
      taxable: money(b.taxable),
      amount: money(b.amount),
    })),
  };
}

const QUOTATION_STATUSES: QuotationStatus[] = [
  'draft', 'sent', 'viewed', 'accepted', 'accepted', 'rejected',
  'expired', 'converted', 'converted', 'sent', 'cancelled', 'accepted',
];

export const quotations: Quotation[] = Array.from({ length: 26 }, (_, i) => {
  const customer = customers[i % customers.length]!;
  const items = buildItems(i + 1, 2 + Math.floor(seeded(i) * 4));
  const charges: DocumentCharge[] =
    seeded(i + 50) > 0.7
      ? [{ id: uid(i, 'g'), label: 'Delivery', amount: money(85), isTaxable: false, taxId: null, taxAmount: money(0) }]
      : [];
  const totals = totalsFor(items, charges);
  const status = QUOTATION_STATUSES[i % QUOTATION_STATUSES.length]!;
  const issue = -150 + i * 6;

  return {
    id: uid(i + 1, 'q'),
    quotationNumber: `QUO-${String(i + 1).padStart(5, '0')}`,
    status,
    customerId: customer.id,
    customer: {
      id: customer.id,
      name: customer.name,
      companyName: customer.companyName,
      email: customer.email,
      phone: customer.phone,
    },
    issueDate: daysFromNow(issue),
    validUntil: daysFromNow(issue + 30),
    currencyCode: settings.currencyCode,
    currencySymbol: settings.currencySymbol,
    taxMode: 'exclusive',
    discountType: null,
    discountValue: '0',
    items,
    charges,
    templateId: settings.defaultQuotationTemplateId,
    customNotes: settings.defaultQuotationNotes,
    termsAndConditions: settings.defaultQuotationTerms,
    includeNotes: true,
    includeTerms: true,
    paymentInstructions: settings.defaultPaymentInstructions,
    internalNotes: null,
    reference: seeded(i + 9) > 0.6 ? `PO-${4400 + i}` : null,
    convertedInvoiceId: null,
    convertedInvoiceNumber: null,
    sentAt: status === 'draft' ? null : stampFromNow(issue + 1),
    acceptedAt: ['accepted', 'converted'].includes(status) ? stampFromNow(issue + 4) : null,
    createdAt: stampFromNow(issue),
    updatedAt: stampFromNow(issue + 2),
    ...totals,
  };
});

const INVOICE_STATUSES: InvoiceStatus[] = [
  'sent', 'sent', 'sent', 'draft', 'sent', 'sent', 'cancelled', 'sent', 'sent', 'sent',
];

export const invoices: Invoice[] = Array.from({ length: 32 }, (_, i) => {
  const customer = customers[(i * 3) % customers.length]!;
  const items = buildItems(i + 200, 2 + Math.floor(seeded(i + 30) * 5));
  const charges: DocumentCharge[] =
    seeded(i + 80) > 0.75
      ? [{ id: uid(i + 200, 'g'), label: 'Installation', amount: money(240), isTaxable: true, taxId: taxes[2]!.id, taxAmount: money(24) }]
      : [];
  const totals = totalsFor(items, charges);
  const status = INVOICE_STATUSES[i % INVOICE_STATUSES.length]!;
  const issue = -140 + i * 4;
  const due = issue + (i % 4 === 0 ? 14 : 30);

  // Payment state is derived from the seeded payments below, mirroring the
  // rule that the server owns payment status.
  let paid = new Decimal(0);
  const grand = new Decimal(totals.grandTotal);
  const roll = seeded(i + 300);
  if (status !== 'draft' && status !== 'cancelled') {
    if (roll > 0.62) paid = grand;
    else if (roll > 0.38) paid = grand.times(0.4).toDecimalPlaces(2);
  }
  const amountDue = grand.minus(paid);

  let paymentStatus: PaymentState = 'unpaid';
  if (grand.isZero() || paid.greaterThanOrEqualTo(grand)) paymentStatus = 'paid';
  else if (paid.greaterThan(0)) paymentStatus = 'partially_paid';
  if (
    paymentStatus !== 'paid' &&
    status !== 'draft' &&
    status !== 'cancelled' &&
    due < 0
  ) {
    paymentStatus = 'overdue';
  }

  const linkedQuotation = i % 5 === 0 ? quotations[i % quotations.length] : undefined;

  return {
    id: uid(i + 1, 'v'),
    invoiceNumber: `INV-${String(i + 1).padStart(5, '0')}`,
    status,
    paymentStatus,
    customerId: customer.id,
    customer: {
      id: customer.id,
      name: customer.name,
      companyName: customer.companyName,
      email: customer.email,
      phone: customer.phone,
    },
    issueDate: daysFromNow(issue),
    dueDate: daysFromNow(due),
    quotationId: linkedQuotation?.id ?? null,
    quotationNumber: linkedQuotation?.quotationNumber ?? null,
    currencyCode: settings.currencyCode,
    currencySymbol: settings.currencySymbol,
    taxMode: 'exclusive',
    discountType: null,
    discountValue: '0',
    items,
    charges,
    templateId: settings.defaultInvoiceTemplateId,
    customNotes: settings.defaultInvoiceNotes,
    termsAndConditions: settings.defaultInvoiceTerms,
    includeNotes: true,
    includeTerms: true,
    paymentInstructions: settings.defaultPaymentInstructions,
    internalNotes: null,
    reference: null,
    amountPaid: money(paid),
    amountDue: money(amountDue),
    sentAt: status === 'draft' ? null : stampFromNow(issue + 1),
    paidAt: paymentStatus === 'paid' ? stampFromNow(issue + 12) : null,
    cancelReason: status === 'cancelled' ? 'Order withdrawn by the customer.' : null,
    createdAt: stampFromNow(issue),
    updatedAt: stampFromNow(issue + 1),
    ...totals,
  };
});

export const paymentMethods: PaymentMethod[] = [
  { id: uid(1, 'y'), name: 'Bank transfer', description: 'Direct deposit', requiresReference: true, isActive: true },
  { id: uid(2, 'y'), name: 'Card', description: 'Card payment', requiresReference: true, isActive: true },
  { id: uid(3, 'y'), name: 'Cash', description: null, requiresReference: false, isActive: true },
  { id: uid(4, 'y'), name: 'Cheque', description: null, requiresReference: true, isActive: true },
  { id: uid(5, 'y'), name: 'Other', description: null, requiresReference: false, isActive: true },
];

export const payments: Payment[] = invoices
  .filter((inv) => new Decimal(inv.amountPaid).greaterThan(0))
  .map((inv, i) => {
    const method = paymentMethods[i % 4]!;
    return {
      id: uid(i + 1, 'z'),
      invoiceId: inv.id,
      invoiceNumber: inv.invoiceNumber,
      customerId: inv.customerId,
      customerName: inv.customer.companyName ?? inv.customer.name,
      amount: inv.amountPaid,
      paymentDate: inv.paidAt ? inv.paidAt.slice(0, 10) : inv.issueDate,
      paymentMethodId: method.id,
      paymentMethodName: method.name,
      referenceNumber: method.requiresReference ? `REF-${90000 + i * 13}` : null,
      notes: null,
      currencyCode: inv.currencyCode,
      isVoided: false,
      voidReason: null,
      createdAt: inv.paidAt ?? inv.createdAt,
    };
  });

export const recurringInvoices: RecurringInvoice[] = [
  {
    id: uid(1, 'e'),
    customerId: customers[4]!.id,
    customerName: customers[4]!.companyName!,
    title: 'Priority support retainer',
    frequency: 'monthly',
    intervalCount: 1,
    startDate: daysFromNow(-120),
    endDate: null,
    maxOccurrences: null,
    occurrencesGenerated: 4,
    nextRunDate: daysFromNow(6),
    lastRunDate: daysFromNow(-24),
    isActive: true,
    autoSend: false,
    currencyCode: settings.currencyCode,
    grandTotal: money(1815),
  },
  {
    id: uid(2, 'e'),
    customerId: customers[9]!.id,
    customerName: customers[9]!.companyName!,
    title: 'Platform licences — quarterly',
    frequency: 'quarterly',
    intervalCount: 1,
    startDate: daysFromNow(-200),
    endDate: daysFromNow(160),
    maxOccurrences: 8,
    occurrencesGenerated: 2,
    nextRunDate: daysFromNow(-3),
    lastRunDate: daysFromNow(-93),
    isActive: true,
    autoSend: false,
    currencyCode: settings.currencyCode,
    grandTotal: money(5280),
  },
  {
    id: uid(3, 'e'),
    customerId: customers[1]!.id,
    customerName: customers[1]!.companyName!,
    title: 'Standard support retainer',
    frequency: 'monthly',
    intervalCount: 1,
    startDate: daysFromNow(-300),
    endDate: daysFromNow(-30),
    maxOccurrences: null,
    occurrencesGenerated: 9,
    nextRunDate: null,
    lastRunDate: daysFromNow(-31),
    isActive: false,
    autoSend: false,
    currencyCode: settings.currencyCode,
    grandTotal: money(935),
  },
];

export const numbering: NumberingSettings[] = [
  {
    id: uid(1, 'w'), documentType: 'quotation', prefix: 'QUO', suffix: '', separator: '-',
    padding: 5, startNumber: 1, includeYear: false, includeMonth: false, yearFormat: 'yyyy',
    resetFrequency: 'never', format: '{prefix}{sep}{number}', nextNumberPreview: 'QUO-00027',
  },
  {
    id: uid(2, 'w'), documentType: 'invoice', prefix: 'INV', suffix: '', separator: '-',
    padding: 5, startNumber: 1, includeYear: false, includeMonth: false, yearFormat: 'yyyy',
    resetFrequency: 'never', format: '{prefix}{sep}{number}', nextNumberPreview: 'INV-00033',
  },
  {
    id: uid(3, 'w'), documentType: 'payment', prefix: 'PAY', suffix: '', separator: '-',
    padding: 5, startNumber: 1, includeYear: true, includeMonth: false, yearFormat: 'yyyy',
    resetFrequency: 'yearly', format: '{prefix}{sep}{year}{sep}{number}', nextNumberPreview: 'PAY-2026-00019',
  },
];

/**
 * Derived from the theme registry so a new design is added in exactly one place.
 * Each design exists once per document type.
 */
export const documentTemplates: DocumentTemplate[] = (
  ['invoice', 'quotation'] as const
).flatMap((documentType, typeIndex) =>
  TEMPLATE_ORDER.map((key, designIndex) => {
    const theme = TEMPLATE_THEMES[key];
    return {
      id: uid(typeIndex * 100 + designIndex + 1, 't'),
      key,
      name: theme.name,
      documentType,
      description: theme.description,
    };
  }),
);

export const emailTemplates: EmailTemplate[] = [
  {
    id: uid(1, 'h'), key: 'quotation_send', name: 'Send quotation',
    subject: 'Quotation {{document_number}} from {{business_name}}',
    bodyHtml: '<p>Hello {{customer_name}},</p><p>Please find quotation {{document_number}} attached, valid until {{valid_until}}.</p><p>{{business_name}}</p>',
    isActive: true,
  },
  {
    id: uid(2, 'h'), key: 'invoice_send', name: 'Send invoice',
    subject: 'Invoice {{document_number}} from {{business_name}}',
    bodyHtml: '<p>Hello {{customer_name}},</p><p>Please find invoice {{document_number}} attached. The balance of {{amount_due}} is due by {{due_date}}.</p><p>{{business_name}}</p>',
    isActive: true,
  },
  {
    id: uid(3, 'h'), key: 'payment_receipt', name: 'Payment receipt',
    subject: 'Receipt for {{document_number}}',
    bodyHtml: '<p>Hello {{customer_name}},</p><p>We have received your payment of {{amount}}. Thank you.</p><p>{{business_name}}</p>',
    isActive: true,
  },
  {
    id: uid(4, 'h'), key: 'reminder_overdue', name: 'Overdue reminder',
    subject: 'Invoice {{document_number}} is now overdue',
    bodyHtml: '<p>Hello {{customer_name}},</p><p>Invoice {{document_number}} for {{amount_due}} was due on {{due_date}}.</p><p>{{business_name}}</p>',
    isActive: true,
  },
];

export const reminderRules: ReminderRule[] = [
  { id: uid(1, 'j'), name: 'Three days before due', trigger: 'before_due', offsetDays: 3, isActive: true },
  { id: uid(2, 'j'), name: 'On the due date', trigger: 'on_due', offsetDays: 0, isActive: true },
  { id: uid(3, 'j'), name: 'Seven days overdue', trigger: 'after_due', offsetDays: 7, isActive: true },
  { id: uid(4, 'j'), name: 'Thirty days overdue', trigger: 'after_due', offsetDays: 30, isActive: false },
];

export const customFields: CustomFieldDefinition[] = [
  {
    id: uid(1, 'f'), entityType: 'customer', key: 'account_manager', label: 'Account manager',
    fieldType: 'text', options: [], isRequired: false, showOnDocument: false, sortOrder: 0, isActive: true,
  },
  {
    id: uid(2, 'f'), entityType: 'customer', key: 'segment', label: 'Segment',
    fieldType: 'dropdown', options: ['Enterprise', 'Mid-market', 'Small business'],
    isRequired: false, showOnDocument: false, sortOrder: 1, isActive: true,
  },
  {
    id: uid(3, 'f'), entityType: 'invoice', key: 'purchase_order', label: 'Purchase order',
    fieldType: 'text', options: [], isRequired: false, showOnDocument: true, sortOrder: 0, isActive: true,
  },
  {
    id: uid(4, 'f'), entityType: 'quotation', key: 'project_code', label: 'Project code',
    fieldType: 'text', options: [], isRequired: false, showOnDocument: true, sortOrder: 0, isActive: true,
  },
  {
    id: uid(5, 'f'), entityType: 'product', key: 'warranty_months', label: 'Warranty (months)',
    fieldType: 'number', options: [], isRequired: false, showOnDocument: false, sortOrder: 0, isActive: true,
  },
];

export const notifications: Notification[] = [
  {
    id: uid(1, 'o'), type: 'invoice.overdue', title: 'Invoice INV-00007 is overdue',
    body: 'Corvus Retail Group · 14 days past due', link: '/invoices', severity: 'warning',
    readAt: null, createdAt: stampFromNow(-1, 9),
  },
  {
    id: uid(2, 'o'), type: 'payment.received', title: 'Payment received',
    body: 'Everline Health paid invoice INV-00012', link: '/payments', severity: 'success',
    readAt: null, createdAt: stampFromNow(-1, 14),
  },
  {
    id: uid(3, 'o'), type: 'quotation.accepted', title: 'Quotation QUO-00019 accepted',
    body: 'Juniper Labs accepted the quotation', link: '/quotations', severity: 'success',
    readAt: null, createdAt: stampFromNow(-2, 11),
  },
  {
    id: uid(4, 'o'), type: 'quotation.expiring', title: 'Quotation QUO-00022 expires in 3 days',
    body: 'Meridian Partners', link: '/quotations', severity: 'info',
    readAt: stampFromNow(-3), createdAt: stampFromNow(-3, 16),
  },
  {
    id: uid(5, 'o'), type: 'email.failed', title: 'Email delivery failed',
    body: 'Invoice INV-00021 could not be sent. SMTP is not configured.', link: '/settings/email',
    severity: 'error', readAt: stampFromNow(-4), createdAt: stampFromNow(-4, 10),
  },
];

const AUDIT_ACTIONS: [string, string, string][] = [
  ['invoice.created', 'invoice', 'INV-00032'],
  ['invoice.sent', 'invoice', 'INV-00032'],
  ['payment.created', 'payment', 'INV-00030'],
  ['quotation.accepted', 'quotation', 'QUO-00024'],
  ['quotation.converted', 'quotation', 'QUO-00024'],
  ['customer.updated', 'customer', 'Alder & Finch'],
  ['settings.updated', 'settings', 'Document settings'],
  ['product.created', 'product', 'Monitoring add-on'],
  ['auth.login', 'auth', 'demo@quotiva.app'],
  ['invoice.cancelled', 'invoice', 'INV-00007'],
  ['customer.created', 'customer', 'Kestrel Marine'],
  ['tax.updated', 'tax', 'Combined 18%'],
  ['user.invited', 'user', 'noor@northwindstudio.example'],
  ['quotation.created', 'quotation', 'QUO-00026'],
  ['payment.voided', 'payment', 'INV-00019'],
];

export const auditLogs: AuditLog[] = Array.from({ length: 45 }, (_, i) => {
  const entry = AUDIT_ACTIONS[i % AUDIT_ACTIONS.length]!;
  const actor = members[i % 3]!;
  return {
    id: uid(i + 1, 'l'),
    userId: actor.userId,
    userEmail: actor.email,
    action: entry[0],
    entityType: entry[1],
    entityId: uid(i + 1, 'v'),
    entityLabel: entry[2],
    metadata: {},
    ipAddress: '198.51.100.24',
    createdAt: stampFromNow(-Math.floor(i / 2), 8 + (i % 9)),
  };
});

export const backupJobs: BackupJob[] = [
  {
    id: uid(1, 's'), status: 'completed', scope: 'business_export', format: 'csv_zip',
    sizeBytes: 2_418_176, downloadUrl: null, error: null,
    createdAt: stampFromNow(-6, 3), finishedAt: stampFromNow(-6, 3),
  },
  {
    id: uid(2, 's'), status: 'failed', scope: 'business_export', format: 'csv_zip',
    sizeBytes: null, downloadUrl: null,
    error: 'Export aborted: storage quota exceeded.',
    createdAt: stampFromNow(-13, 3), finishedAt: stampFromNow(-13, 3),
  },
];

/** Mutable store — MSW handlers read and write this. */
export const db = {
  business,
  branding,
  settings,
  roles,
  members,
  units,
  categories,
  taxes,
  products,
  customers,
  quotations,
  invoices,
  payments,
  paymentMethods,
  recurringInvoices,
  numbering,
  documentTemplates,
  emailTemplates,
  reminderRules,
  customFields,
  notifications,
  auditLogs,
  backupJobs,
};

export { money, daysFromNow, stampFromNow, totalsFor, uid };

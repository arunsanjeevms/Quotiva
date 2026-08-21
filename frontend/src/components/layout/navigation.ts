import {
  BarChart3,
  Building2,
  Calculator,
  CalendarClock,
  CreditCard,
  Database,
  FileText,
  FolderTree,
  Gauge,
  LayoutDashboard,
  Mail,
  Palette,
  Receipt,
  Ruler,
  ScrollText,
  Settings2,
  ShieldCheck,
  ShoppingBag,
  SlidersHorizontal,
  Users,
  Wrench,
} from 'lucide-react';

export interface NavItem {
  label: string;
  to: string;
  icon?: React.ComponentType<{ className?: string }>;
  /** Item is hidden entirely when the user lacks this permission. */
  permission?: string;
  end?: boolean;
}

export interface NavGroup {
  id: string;
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  to?: string;
  items?: NavItem[];
  permission?: string;
}

/** The sidebar tree from docs/07 §4, in that exact order. */
export const NAVIGATION: NavGroup[] = [
  { id: 'dashboard', label: 'Dashboard', to: '/', icon: LayoutDashboard, permission: 'dashboard.read' },
  {
    id: 'sales',
    label: 'Sales',
    icon: Receipt,
    items: [
      { label: 'Quotations', to: '/quotations', permission: 'quotation.read' },
      { label: 'Invoices', to: '/invoices', permission: 'invoice.read' },
      { label: 'Payments', to: '/payments', permission: 'payment.read' },
      { label: 'Recurring Invoices', to: '/recurring-invoices', permission: 'recurring.read' },
    ],
  },
  { id: 'customers', label: 'Customers', to: '/customers', icon: Users, permission: 'customer.read' },
  {
    id: 'catalog',
    label: 'Catalog',
    icon: ShoppingBag,
    items: [
      { label: 'Products', to: '/products', permission: 'product.read' },
      { label: 'Services', to: '/services', permission: 'product.read' },
      { label: 'Categories', to: '/categories', permission: 'catalog.read' },
      { label: 'Units', to: '/units', permission: 'catalog.read' },
      { label: 'Taxes', to: '/taxes', permission: 'tax.read' },
    ],
  },
  {
    id: 'reports',
    label: 'Reports',
    icon: BarChart3,
    permission: 'report.read',
    items: [
      { label: 'Sales', to: '/reports/sales' },
      { label: 'Invoices', to: '/reports/invoices' },
      { label: 'Quotations', to: '/reports/quotations' },
      { label: 'Payments', to: '/reports/payments' },
      { label: 'Customers', to: '/reports/customers' },
      { label: 'Taxes', to: '/reports/taxes' },
    ],
  },
  {
    id: 'settings',
    label: 'Settings',
    icon: Settings2,
    permission: 'settings.read',
    items: [
      { label: 'Business Profile', to: '/settings/business' },
      { label: 'Branding', to: '/settings/branding' },
      { label: 'Invoice Settings', to: '/settings/invoices' },
      { label: 'Quotation Settings', to: '/settings/quotations' },
      { label: 'Notes & Terms', to: '/settings/documents' },
      { label: 'Numbering', to: '/settings/numbering' },
      { label: 'Currency', to: '/settings/currency' },
      { label: 'Payment Settings', to: '/settings/payments' },
      { label: 'Email', to: '/settings/email' },
      { label: 'Notifications', to: '/settings/notifications' },
      { label: 'Templates', to: '/settings/templates' },
      { label: 'Custom Fields', to: '/settings/custom-fields' },
      { label: 'Users & Roles', to: '/settings/users' },
      { label: 'Security', to: '/settings/security' },
      { label: 'Audit Logs', to: '/settings/audit' },
      { label: 'Backup', to: '/settings/backup' },
    ],
  },
];

/** Icons for the secondary nav inside the Settings shell. */
export const SETTINGS_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  '/settings/business': Building2,
  '/settings/branding': Palette,
  '/settings/invoices': FileText,
  '/settings/quotations': ScrollText,
  '/settings/documents': ScrollText,
  '/settings/numbering': Calculator,
  '/settings/currency': Gauge,
  '/settings/payments': CreditCard,
  '/settings/email': Mail,
  '/settings/notifications': CalendarClock,
  '/settings/templates': FolderTree,
  '/settings/custom-fields': SlidersHorizontal,
  '/settings/users': Users,
  '/settings/security': ShieldCheck,
  '/settings/audit': ScrollText,
  '/settings/backup': Database,
};

export const CATALOG_ICONS = { Ruler, Wrench };

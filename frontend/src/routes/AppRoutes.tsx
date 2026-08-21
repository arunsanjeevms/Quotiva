import { Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from '@/layouts/AppLayout';
import { AuthLayout } from '@/layouts/AuthLayout';
import { SettingsLayout } from '@/layouts/SettingsLayout';
import { ProtectedRoute, PermissionRoute, NotFoundPage } from './guards';

import { LoginPage } from '@/pages/auth/LoginPage';
import { ForgotPasswordPage, ResetPasswordPage } from '@/pages/auth/PasswordPages';
import { DashboardPage } from '@/pages/DashboardPage';
import { ProfilePage } from '@/pages/ProfilePage';

import { CustomersPage } from '@/pages/customers/CustomersPage';
import { CustomerDetailPage } from '@/pages/customers/CustomerDetailPage';
import { CustomerFormPage } from '@/pages/customers/CustomerFormPage';

import { ProductsPage } from '@/pages/catalog/ProductsPage';
import { ProductFormPage } from '@/pages/catalog/ProductFormPage';
import { CategoriesPage } from '@/pages/catalog/CategoriesPage';
import { UnitsPage } from '@/pages/catalog/UnitsPage';
import { TaxesPage } from '@/pages/catalog/TaxesPage';

import { QuotationsPage } from '@/pages/documents/QuotationsPage';
import { QuotationDetailPage } from '@/pages/documents/QuotationDetailPage';
import { InvoicesPage } from '@/pages/documents/InvoicesPage';
import { InvoiceDetailPage } from '@/pages/documents/InvoiceDetailPage';
import { DocumentEditorPage } from '@/pages/documents/DocumentEditorPage';
import { RecurringInvoicesPage } from '@/pages/documents/RecurringInvoicesPage';

import { PaymentsPage } from '@/pages/payments/PaymentsPage';

import {
  CustomerReportPage,
  InvoiceReportPage,
  PaymentReportPage,
  QuotationReportPage,
  SalesReportPage,
  TaxReportPage,
} from '@/pages/reports/ReportPages';

import { BusinessProfileSettings } from '@/pages/settings/BusinessProfileSettings';
import { BrandingSettings } from '@/pages/settings/BrandingSettings';
import { CurrencySettings } from '@/pages/settings/CurrencySettings';
import { NumberingSettings } from '@/pages/settings/NumberingSettings';
import { PaymentSettings } from '@/pages/settings/PaymentSettings';
import { EmailSettings } from '@/pages/settings/EmailSettings';
import { NotificationsSettings } from '@/pages/settings/NotificationsSettings';
import { TemplatesSettings } from '@/pages/settings/TemplatesSettings';
import { CustomFieldsSettings } from '@/pages/settings/CustomFieldsSettings';
import { UsersAndRolesSettings } from '@/pages/settings/UsersAndRolesSettings';
import { SecuritySettings } from '@/pages/settings/SecuritySettings';
import { AuditLogSettings } from '@/pages/settings/AuditLogSettings';
import { BackupSettings } from '@/pages/settings/BackupSettings';
import { NotesAndTermsSettings } from '@/pages/settings/NotesAndTermsSettings';
import { InvoiceSettingsPage, QuotationSettingsPage } from '@/pages/settings/DocumentDefaultsSettings';

export function AppRoutes(): React.ReactElement {
  return (
    <Routes>
      {/* Public */}
      <Route element={<AuthLayout />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
      </Route>

      {/* Authenticated */}
      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route index element={<DashboardPage />} />
          <Route path="profile" element={<ProfilePage />} />

          <Route element={<PermissionRoute permission="customer.read" />}>
            <Route path="customers" element={<CustomersPage />} />
            <Route path="customers/new" element={<CustomerFormPage />} />
            <Route path="customers/:id" element={<CustomerDetailPage />} />
            <Route path="customers/:id/edit" element={<CustomerFormPage />} />
          </Route>

          <Route element={<PermissionRoute permission="product.read" />}>
            <Route path="products" element={<ProductsPage kind="product" />} />
            <Route path="products/new" element={<ProductFormPage defaultKind="product" />} />
            <Route path="products/:id" element={<ProductFormPage defaultKind="product" />} />
            <Route path="services" element={<ProductsPage kind="service" />} />
            <Route path="services/new" element={<ProductFormPage defaultKind="service" />} />
          </Route>
          <Route element={<PermissionRoute permission="catalog.read" />}>
            <Route path="categories" element={<CategoriesPage />} />
            <Route path="units" element={<UnitsPage />} />
          </Route>
          <Route element={<PermissionRoute permission="tax.read" />}>
            <Route path="taxes" element={<TaxesPage />} />
          </Route>

          <Route element={<PermissionRoute permission="quotation.read" />}>
            <Route path="quotations" element={<QuotationsPage />} />
            <Route path="quotations/new" element={<DocumentEditorPage mode="quotation" />} />
            <Route path="quotations/:id" element={<QuotationDetailPage />} />
            <Route path="quotations/:id/edit" element={<DocumentEditorPage mode="quotation" />} />
          </Route>

          <Route element={<PermissionRoute permission="invoice.read" />}>
            <Route path="invoices" element={<InvoicesPage />} />
            <Route path="invoices/new" element={<DocumentEditorPage mode="invoice" />} />
            <Route path="invoices/:id" element={<InvoiceDetailPage />} />
            <Route path="invoices/:id/edit" element={<DocumentEditorPage mode="invoice" />} />
          </Route>

          <Route element={<PermissionRoute permission="payment.read" />}>
            <Route path="payments" element={<PaymentsPage />} />
            <Route path="payments/new" element={<PaymentsPage />} />
          </Route>

          <Route element={<PermissionRoute permission="recurring.read" />}>
            <Route path="recurring-invoices" element={<RecurringInvoicesPage />} />
          </Route>

          <Route element={<PermissionRoute permission="report.read" />}>
            <Route path="reports/sales" element={<SalesReportPage />} />
            <Route path="reports/invoices" element={<InvoiceReportPage />} />
            <Route path="reports/quotations" element={<QuotationReportPage />} />
            <Route path="reports/payments" element={<PaymentReportPage />} />
            <Route path="reports/taxes" element={<TaxReportPage />} />
            <Route path="reports/customers" element={<CustomerReportPage />} />
          </Route>

          <Route element={<PermissionRoute permission="settings.read" />}>
            <Route path="settings" element={<SettingsLayout />}>
              <Route index element={<Navigate to="business" replace />} />
              <Route path="business" element={<BusinessProfileSettings />} />
              <Route path="branding" element={<BrandingSettings />} />
              <Route path="invoices" element={<InvoiceSettingsPage />} />
              <Route path="quotations" element={<QuotationSettingsPage />} />
              <Route path="documents" element={<NotesAndTermsSettings />} />
              <Route path="numbering" element={<NumberingSettings />} />
              <Route path="currency" element={<CurrencySettings />} />
              <Route path="payments" element={<PaymentSettings />} />
              <Route path="email" element={<EmailSettings />} />
              <Route path="notifications" element={<NotificationsSettings />} />
              <Route path="templates" element={<TemplatesSettings />} />
              <Route path="custom-fields" element={<CustomFieldsSettings />} />
              <Route path="users" element={<UsersAndRolesSettings />} />
              <Route path="security" element={<SecuritySettings />} />
              <Route path="audit" element={<AuditLogSettings />} />
              <Route path="backup" element={<BackupSettings />} />
            </Route>
          </Route>

          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

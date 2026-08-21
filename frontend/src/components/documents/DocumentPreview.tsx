import { Building2 } from 'lucide-react';
import { RichTextView, hasContent } from '@/components/ui/RichTextEditor';
import { formatDate, formatMoney, formatPercent, formatQuantity } from '@/lib/format';
import { useBusiness } from '@/stores/BusinessContext';
import { cn } from '@/lib/cn';
import type { Invoice, Quotation } from '@/types';

type Doc = Quotation | Invoice;

function isInvoice(doc: Doc): doc is Invoice {
  return 'invoiceNumber' in doc;
}

/**
 * On-screen preview of the generated document.
 *
 * In the finished system the backend renders one HTML template that feeds both
 * this preview and the Puppeteer PDF, so the two cannot drift. This component
 * mirrors that template's block order exactly — header, parties, meta, items,
 * totals, payment, notes, terms, footer — so the placement a user sees here is
 * the placement they get in the PDF.
 */
export function DocumentPreview({ doc }: { doc: Doc }): React.ReactElement {
  const { business, settings, branding, currency } = useBusiness();
  const invoice = isInvoice(doc) ? doc : null;
  const quotation = isInvoice(doc) ? null : (doc as Quotation);

  const showNotes = doc.includeNotes && hasContent(doc.customNotes);
  const showTerms = doc.includeTerms && hasContent(doc.termsAndConditions);
  const anyDiscount = doc.items.some((i) => i.discountAmount !== '0.0000' && Number(i.discountAmount) > 0);

  const addressLines = [
    business.addressLine1,
    business.addressLine2,
    [business.city, business.state, business.postalCode].filter(Boolean).join(', '),
    business.country,
  ].filter(Boolean);

  const customerAddress = [
    doc.customer.companyName,
    doc.customer.email,
    doc.customer.phone,
  ].filter(Boolean);

  return (
    <div className="mx-auto w-full max-w-[820px] bg-white p-8 text-[13px] leading-relaxed text-gray-900 shadow-sm print:shadow-none sm:p-10">
      {/* header */}
      <header className="flex flex-wrap items-start justify-between gap-6 border-b-2 border-gray-900 pb-5">
        <div className="flex items-start gap-3">
          {branding.showLogoOnDocuments &&
            (branding.logoUrl ? (
              <img src={branding.logoUrl} alt="" className="h-12 w-12 rounded object-contain" />
            ) : (
              <div className="flex h-12 w-12 items-center justify-center rounded bg-gray-100 text-gray-400">
                <Building2 className="h-5 w-5" />
              </div>
            ))}
          <div>
            <h1 className="text-lg font-semibold">{business.name}</h1>
            {addressLines.map((line) => (
              <p key={line} className="text-gray-600">
                {line}
              </p>
            ))}
            {business.phone && <p className="text-gray-600">{business.phone}</p>}
            {business.email && <p className="text-gray-600">{business.email}</p>}
            {business.website && <p className="text-gray-600">{business.website}</p>}
          </div>
        </div>

        <div className="text-right">
          <p className="text-xl font-semibold uppercase tracking-wide">
            {invoice ? 'Invoice' : 'Quotation'}
          </p>
          <p className="mt-0.5 font-mono text-base">
            {invoice ? invoice.invoiceNumber : quotation?.quotationNumber}
          </p>
          {business.taxRegistrationNumber && (
            <p className="mt-1 text-gray-600">Tax reg. {business.taxRegistrationNumber}</p>
          )}
        </div>
      </header>

      {/* parties + meta */}
      <section className="mt-5 flex flex-wrap justify-between gap-6">
        <div className="min-w-[220px]">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
            {invoice ? 'Bill to' : 'Prepared for'}
          </p>
          <p className="font-medium">{doc.customer.name}</p>
          {customerAddress.map((line) => (
            <p key={line} className="text-gray-600">
              {line}
            </p>
          ))}
        </div>

        <dl className="min-w-[220px] space-y-1">
          <MetaRow label={invoice ? 'Invoice date' : 'Quotation date'} value={formatDate(doc.issueDate, business.dateFormat)} />
          {invoice?.dueDate && <MetaRow label="Due date" value={formatDate(invoice.dueDate, business.dateFormat)} />}
          {quotation?.validUntil && (
            <MetaRow label="Valid until" value={formatDate(quotation.validUntil, business.dateFormat)} />
          )}
          <MetaRow label="Currency" value={`${doc.currencyCode} (${doc.currencySymbol})`} />
          {doc.reference && <MetaRow label="Reference" value={doc.reference} />}
          {invoice?.quotationNumber && <MetaRow label="From quotation" value={invoice.quotationNumber} />}
        </dl>
      </section>

      {/* items */}
      <section className="mt-6">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-y border-gray-300 bg-gray-50 text-[11px] uppercase tracking-wide text-gray-600">
              <th className="px-2 py-2 text-left font-semibold">Description</th>
              <th className="w-20 px-2 py-2 text-right font-semibold">Qty</th>
              <th className="w-20 px-2 py-2 text-left font-semibold">Unit</th>
              <th className="w-24 px-2 py-2 text-right font-semibold">Price</th>
              {anyDiscount && <th className="w-24 px-2 py-2 text-right font-semibold">Discount</th>}
              <th className="w-20 px-2 py-2 text-right font-semibold">Tax</th>
              <th className="w-28 px-2 py-2 text-right font-semibold">Amount</th>
            </tr>
          </thead>
          <tbody>
            {doc.items.map((item) => (
              <tr key={item.id} className="border-b border-gray-200 align-top">
                <td className="px-2 py-2">
                  <p className="font-medium">{item.name}</p>
                  {item.description && <p className="text-gray-600">{item.description}</p>}
                </td>
                <td className="px-2 py-2 text-right tabular">{formatQuantity(item.quantity, currency)}</td>
                <td className="px-2 py-2 text-gray-600">{item.unitName ?? '—'}</td>
                <td className="px-2 py-2 text-right tabular">{formatMoney(item.unitPrice, currency)}</td>
                {anyDiscount && (
                  <td className="px-2 py-2 text-right tabular text-gray-600">
                    {Number(item.discountAmount) > 0 ? `− ${formatMoney(item.discountAmount, currency)}` : '—'}
                  </td>
                )}
                <td className="px-2 py-2 text-right tabular text-gray-600">
                  {item.taxRate > 0 ? formatPercent(item.taxRate) : '—'}
                </td>
                <td className="px-2 py-2 text-right tabular font-medium">
                  {formatMoney(item.lineTotal, currency)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* totals */}
      <section className="mt-4 flex justify-end">
        <dl className="w-full max-w-xs space-y-1">
          <TotalRow label="Subtotal" value={formatMoney(doc.subtotal, currency)} />
          {Number(doc.itemDiscountTotal) > 0 && (
            <TotalRow label="Item discounts" value={`− ${formatMoney(doc.itemDiscountTotal, currency)}`} />
          )}
          {Number(doc.documentDiscountAmount) > 0 && (
            <TotalRow label="Discount" value={`− ${formatMoney(doc.documentDiscountAmount, currency)}`} />
          )}
          <TotalRow label="Taxable amount" value={formatMoney(doc.taxableAmount, currency)} />
          {doc.taxBreakdown.map((line) => (
            <TotalRow
              key={`${line.name}-${line.rate}`}
              label={`${line.name} (${formatPercent(line.rate)})`}
              value={formatMoney(line.amount, currency)}
            />
          ))}
          {doc.charges.map((charge) => (
            <TotalRow key={charge.id} label={charge.label} value={formatMoney(charge.amount, currency)} />
          ))}
          <TotalRow label="Grand total" value={formatMoney(doc.grandTotal, currency)} emphasis />
          {invoice && Number(invoice.amountPaid) > 0 && (
            <>
              <TotalRow label="Paid" value={`− ${formatMoney(invoice.amountPaid, currency)}`} />
              <TotalRow label="Balance due" value={formatMoney(invoice.amountDue, currency)} emphasis />
            </>
          )}
        </dl>
      </section>

      {/* payment information */}
      {settings.showPaymentDetailsOnDocuments && (settings.bankName || doc.paymentInstructions) && (
        <section className="mt-6 break-inside-avoid rounded border border-gray-200 bg-gray-50 p-3">
          <h2 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
            Payment information
          </h2>
          <div className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
            {settings.bankName && <PayRow label="Bank" value={settings.bankName} />}
            {settings.bankAccountName && <PayRow label="Account name" value={settings.bankAccountName} />}
            {settings.bankAccountNumber && <PayRow label="Account number" value={settings.bankAccountNumber} />}
            {settings.bankIfscSwift && <PayRow label="IFSC / SWIFT" value={settings.bankIfscSwift} />}
            {settings.bankBranch && <PayRow label="Branch" value={settings.bankBranch} />}
            {settings.upiId && <PayRow label="UPI" value={settings.upiId} />}
          </div>
          {doc.paymentInstructions && (
            <p className="mt-2 text-gray-700">{doc.paymentInstructions}</p>
          )}
        </section>
      )}

      {/*
        Notes and Terms are the last content blocks before the footer. In the PDF
        the group carries `break-inside: avoid-page`, so it moves whole to a new
        page rather than splitting away from the totals.
      */}
      {(showNotes || showTerms) && (
        <div className="mt-6 space-y-5 break-inside-avoid">
          {showNotes && (
            <section className="break-inside-avoid">
              <h2 className="mb-1.5 border-b border-gray-200 pb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                Notes
              </h2>
              <RichTextView html={doc.customNotes} className="text-[13px] text-gray-700" />
            </section>
          )}

          {showTerms && (
            <section className="break-inside-avoid">
              <h2 className="mb-1.5 border-b border-gray-200 pb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                Terms &amp; Conditions
              </h2>
              <RichTextView html={doc.termsAndConditions} className="text-[13px] text-gray-700" />
            </section>
          )}
        </div>
      )}

      {/* footer */}
      <footer className="mt-8 border-t border-gray-200 pt-3 text-center text-[11px] text-gray-500">
        {settings.defaultFooter && <p>{settings.defaultFooter}</p>}
        <p className={cn(settings.defaultFooter && 'mt-1')}>
          Designed and Developed by Arun Sanjeev M S
        </p>
      </footer>
    </div>
  );
}

function MetaRow({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-gray-500">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}

function TotalRow({
  label,
  value,
  emphasis,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}): React.ReactElement {
  return (
    <div
      className={cn(
        'flex justify-between gap-4 py-0.5',
        emphasis && 'mt-1 border-t border-gray-900 pt-1.5 text-base font-semibold',
      )}
    >
      <dt className={emphasis ? '' : 'text-gray-600'}>{label}</dt>
      <dd className="tabular">{value}</dd>
    </div>
  );
}

function PayRow({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-gray-500">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

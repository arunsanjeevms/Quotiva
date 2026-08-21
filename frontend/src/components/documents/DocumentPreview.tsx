import { Building2 } from 'lucide-react';
import { RichTextView, hasContent } from '@/components/ui/RichTextEditor';
import { formatDate, formatMoney, formatPercent, formatQuantity } from '@/lib/format';
import { useBusiness } from '@/stores/BusinessContext';
import { useTemplates } from '@/hooks/queries';
import { cn } from '@/lib/cn';
import { hexToRgbTriplet, readableOn, resolveTemplateKey, TEMPLATE_THEMES } from './templateThemes';
import type { Invoice, Quotation } from '@/types';

type Doc = Quotation | Invoice;

function isInvoice(doc: Doc): doc is Invoice {
  return 'invoiceNumber' in doc;
}

/**
 * On-screen preview of the generated document.
 *
 * In the finished system the backend renders one HTML template per template
 * key that feeds both this preview and the Puppeteer PDF, so the two cannot
 * drift. This component mirrors that template's block order exactly — header,
 * parties, meta, items, totals, payment, notes, terms, footer — for every
 * template, and varies only presentation (docs/07 §8, docs/12 §7).
 *
 * The accent color is always the business's own branding color, never a color
 * baked into the template — five templates × any brand color is the real
 * combinatorial space.
 */
export function DocumentPreview({ doc }: { doc: Doc }): React.ReactElement {
  const { business, settings, branding, currency } = useBusiness();
  const { data: templateData } = useTemplates();
  const invoice = isInvoice(doc) ? doc : null;
  const quotation = isInvoice(doc) ? null : (doc as Quotation);

  const templateKey = resolveTemplateKey(
    templateData?.data.find((t) => t.id === doc.templateId)?.key,
  );
  const theme = TEMPLATE_THEMES[templateKey];
  const accent = branding.primaryColor;
  const accentRgb = hexToRgbTriplet(accent);
  const accentLabel = readableOn(accent);
  const compact = theme.density === 'compact';
  const serif = theme.headingFont === 'serif';

  const showNotes = doc.includeNotes && hasContent(doc.customNotes);
  const showTerms = doc.includeTerms && hasContent(doc.termsAndConditions);
  const anyDiscount = doc.items.some((i) => i.discountAmount !== '0.0000' && Number(i.discountAmount) > 0);

  const customerAddress = [
    doc.customer.companyName,
    doc.customer.email,
    doc.customer.phone,
  ].filter(Boolean);

  const docTypeLabel = invoice ? 'Invoice' : 'Quotation';

  return (
    <div
      className={cn(
        'mx-auto w-full max-w-[820px] bg-white text-gray-900 shadow-sm print:shadow-none',
        serif && 'font-serif',
        compact ? 'p-6 text-[12px] leading-snug sm:p-8' : 'p-8 text-[13px] leading-relaxed sm:p-10',
      )}
    >
      {/* header — the one block whose whole markup varies by theme, not just color */}
      {theme.header === 'band' ? (
        <header
          className={cn('-mx-8 -mt-8 flex flex-wrap items-start justify-between gap-6 px-8 py-6 sm:-mx-10 sm:-mt-10 sm:px-10', compact && '-mx-6 -mt-6 px-6 py-4 sm:-mx-8 sm:-mt-8 sm:px-8')}
          style={{ background: accent, color: accentLabel }}
        >
          <BusinessBlock business={business} branding={branding} labelColor={accentLabel} onAccent />
          <div className="text-right">
            <p className={cn('text-xl font-semibold uppercase tracking-wide', compact && 'text-base')}>
              {docTypeLabel}
            </p>
            <p className="mt-0.5 font-mono text-base opacity-90">
              {invoice ? invoice.invoiceNumber : quotation?.quotationNumber}
            </p>
          </div>
        </header>
      ) : theme.header === 'panel' ? (
        <header
          className="flex flex-wrap items-start justify-between gap-6 rounded-lg p-4"
          style={{ background: `rgba(${accentRgb}, 0.07)`, borderLeft: `4px solid ${accent}` }}
        >
          <BusinessBlock business={business} branding={branding} />
          <div className="text-right">
            <p className="text-xl font-semibold uppercase tracking-wide" style={{ color: accent }}>
              {docTypeLabel}
            </p>
            <p className="mt-0.5 font-mono text-base">
              {invoice ? invoice.invoiceNumber : quotation?.quotationNumber}
            </p>
            {business.taxRegistrationNumber && (
              <p className="mt-1 text-gray-600">Tax reg. {business.taxRegistrationNumber}</p>
            )}
          </div>
        </header>
      ) : theme.header === 'compact' ? (
        <header className="flex flex-wrap items-center justify-between gap-4 border-b pb-3" style={{ borderColor: accent }}>
          <BusinessBlock business={business} branding={branding} compact />
          <div className="text-right">
            <p className="text-base font-semibold uppercase tracking-wide" style={{ color: accent }}>
              {docTypeLabel} {invoice ? invoice.invoiceNumber : quotation?.quotationNumber}
            </p>
          </div>
        </header>
      ) : (
        <header
          className={cn(
            'flex flex-wrap items-start justify-between gap-6 pb-5',
            theme.header === 'ruled' && 'border-b-2',
            theme.header === 'plain' && 'pb-6',
          )}
          style={theme.header === 'ruled' ? { borderColor: accent } : undefined}
        >
          <BusinessBlock business={business} branding={branding} />
          <div className="text-right">
            <p className={cn('text-xl font-semibold uppercase tracking-wide', theme.header === 'plain' && 'font-normal')}>
              {docTypeLabel}
            </p>
            <p className="mt-0.5 font-mono text-base">
              {invoice ? invoice.invoiceNumber : quotation?.quotationNumber}
            </p>
            {business.taxRegistrationNumber && (
              <p className="mt-1 text-gray-600">Tax reg. {business.taxRegistrationNumber}</p>
            )}
          </div>
        </header>
      )}

      {/* parties + meta */}
      <section className={cn('flex flex-wrap justify-between gap-6', compact ? 'mt-4' : 'mt-5')}>
        <div className="min-w-[220px]">
          <p
            className="mb-1 text-[11px] font-semibold uppercase tracking-wide"
            style={{ color: theme.accent === 'text' ? accent : undefined }}
          >
            <span className={theme.accent === 'text' ? undefined : 'text-gray-500'}>
              {invoice ? 'Bill to' : 'Prepared for'}
            </span>
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
      <section className={compact ? 'mt-4' : 'mt-6'}>
        <table className="w-full border-collapse">
          <thead>
            <tr
              className={cn(
                'text-[11px] uppercase tracking-wide',
                theme.tableHeader === 'line' && 'border-y border-gray-300 bg-gray-50 text-gray-600',
                theme.tableHeader === 'plain' && 'border-b border-gray-200 text-gray-500',
                theme.tableHeader === 'compact' && 'border-b border-gray-300 text-gray-500',
                theme.tableHeader === 'panel' && 'text-gray-700',
              )}
              style={
                theme.tableHeader === 'band'
                  ? { background: accent, color: accentLabel }
                  : theme.tableHeader === 'panel'
                    ? { background: `rgba(${accentRgb}, 0.09)` }
                    : undefined
              }
            >
              <th className={cn('px-2 text-left font-semibold', compact ? 'py-1.5' : 'py-2')}>Description</th>
              <th className={cn('w-20 px-2 text-right font-semibold', compact ? 'py-1.5' : 'py-2')}>Qty</th>
              <th className={cn('w-20 px-2 text-left font-semibold', compact ? 'py-1.5' : 'py-2')}>Unit</th>
              <th className={cn('w-24 px-2 text-right font-semibold', compact ? 'py-1.5' : 'py-2')}>Price</th>
              {anyDiscount && (
                <th className={cn('w-24 px-2 text-right font-semibold', compact ? 'py-1.5' : 'py-2')}>Discount</th>
              )}
              <th className={cn('w-20 px-2 text-right font-semibold', compact ? 'py-1.5' : 'py-2')}>Tax</th>
              <th className={cn('w-28 px-2 text-right font-semibold', compact ? 'py-1.5' : 'py-2')}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {doc.items.map((item) => (
              <tr key={item.id} className="border-b border-gray-200 align-top">
                <td className={cn('px-2', compact ? 'py-1.5' : 'py-2')}>
                  <p className="font-medium">{item.name}</p>
                  {item.description && !compact && <p className="text-gray-600">{item.description}</p>}
                </td>
                <td className={cn('px-2 text-right tabular', compact ? 'py-1.5' : 'py-2')}>
                  {formatQuantity(item.quantity, currency)}
                </td>
                <td className={cn('px-2 text-gray-600', compact ? 'py-1.5' : 'py-2')}>{item.unitName ?? '—'}</td>
                <td className={cn('px-2 text-right tabular', compact ? 'py-1.5' : 'py-2')}>
                  {formatMoney(item.unitPrice, currency)}
                </td>
                {anyDiscount && (
                  <td className={cn('px-2 text-right tabular text-gray-600', compact ? 'py-1.5' : 'py-2')}>
                    {Number(item.discountAmount) > 0 ? `− ${formatMoney(item.discountAmount, currency)}` : '—'}
                  </td>
                )}
                <td className={cn('px-2 text-right tabular text-gray-600', compact ? 'py-1.5' : 'py-2')}>
                  {item.taxRate > 0 ? formatPercent(item.taxRate) : '—'}
                </td>
                <td className={cn('px-2 text-right tabular font-medium', compact ? 'py-1.5' : 'py-2')}>
                  {formatMoney(item.lineTotal, currency)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* totals */}
      <section className={cn('flex justify-end', compact ? 'mt-3' : 'mt-4')}>
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
          <TotalRow
            label="Grand total"
            value={formatMoney(doc.grandTotal, currency)}
            emphasis
            accent={theme.accent === 'panel' || theme.accent === 'rule' ? accent : undefined}
            panel={theme.accent === 'panel'}
            accentRgb={accentRgb}
          />
          {invoice && Number(invoice.amountPaid) > 0 && (
            <>
              <TotalRow label="Paid" value={`− ${formatMoney(invoice.amountPaid, currency)}`} />
              <TotalRow
                label="Balance due"
                value={formatMoney(invoice.amountDue, currency)}
                emphasis
                accent={theme.accent === 'panel' || theme.accent === 'rule' ? accent : undefined}
                panel={theme.accent === 'panel'}
                accentRgb={accentRgb}
              />
            </>
          )}
        </dl>
      </section>

      {/* payment information */}
      {settings.showPaymentDetailsOnDocuments && (settings.bankName || doc.paymentInstructions) && (
        <section
          className={cn('mt-6 break-inside-avoid rounded p-3', compact && 'mt-4 p-2.5')}
          style={{ background: `rgba(${accentRgb}, 0.05)`, border: `1px solid rgba(${accentRgb}, 0.18)` }}
        >
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
        page rather than splitting away from the totals (docs/12 §9).
      */}
      {(showNotes || showTerms) && (
        <div className={cn('space-y-5 break-inside-avoid', compact ? 'mt-4' : 'mt-6')}>
          {showNotes && (
            <section className="break-inside-avoid">
              <SectionHeading label="Notes" theme={theme} accent={accent} />
              <RichTextView html={doc.customNotes} className="text-[13px] text-gray-700" />
            </section>
          )}

          {showTerms && (
            <section className="break-inside-avoid">
              <SectionHeading label="Terms &amp; Conditions" theme={theme} accent={accent} />
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

function BusinessBlock({
  business,
  branding,
  compact,
  onAccent,
  labelColor,
}: {
  business: ReturnType<typeof useBusiness>['business'];
  branding: ReturnType<typeof useBusiness>['branding'];
  compact?: boolean;
  onAccent?: boolean;
  labelColor?: string;
}): React.ReactElement {
  const addressLines = [
    business.addressLine1,
    business.addressLine2,
    [business.city, business.state, business.postalCode].filter(Boolean).join(', '),
    business.country,
  ].filter(Boolean);

  return (
    <div className="flex items-start gap-3">
      {branding.showLogoOnDocuments &&
        (branding.logoUrl ? (
          <img src={branding.logoUrl} alt="" className="h-12 w-12 rounded object-contain" />
        ) : (
          <div
            className={cn(
              'flex h-12 w-12 items-center justify-center rounded',
              onAccent ? 'bg-white/15' : 'bg-gray-100 text-gray-400',
            )}
            style={onAccent ? { color: labelColor } : undefined}
          >
            <Building2 className="h-5 w-5" />
          </div>
        ))}
      <div style={onAccent ? { color: labelColor } : undefined}>
        <h1 className="text-lg font-semibold">{business.name}</h1>
        {!compact &&
          addressLines.map((line) => (
            <p key={line} className={onAccent ? 'opacity-90' : 'text-gray-600'}>
              {line}
            </p>
          ))}
        {!compact && business.phone && <p className={onAccent ? 'opacity-90' : 'text-gray-600'}>{business.phone}</p>}
        {!compact && business.email && <p className={onAccent ? 'opacity-90' : 'text-gray-600'}>{business.email}</p>}
      </div>
    </div>
  );
}

function SectionHeading({
  label,
  theme,
  accent,
}: {
  label: string;
  theme: (typeof TEMPLATE_THEMES)[keyof typeof TEMPLATE_THEMES];
  accent: string;
}): React.ReactElement {
  if (theme.accent === 'panel') {
    return (
      <h2
        className="mb-1.5 rounded px-2 py-1 text-[11px] font-semibold uppercase tracking-wide"
        style={{ background: `rgba(${hexToRgbTriplet(accent)}, 0.09)`, color: accent }}
        dangerouslySetInnerHTML={{ __html: label }}
      />
    );
  }
  if (theme.accent === 'text') {
    return (
      <h2
        className="mb-1.5 border-b border-gray-200 pb-1 text-[11px] font-semibold uppercase tracking-wide"
        style={{ color: accent }}
        dangerouslySetInnerHTML={{ __html: label }}
      />
    );
  }
  return (
    <h2
      className="mb-1.5 border-b border-gray-200 pb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500"
      dangerouslySetInnerHTML={{ __html: label }}
    />
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
  accent,
  panel,
  accentRgb,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
  accent?: string;
  panel?: boolean;
  accentRgb?: string;
}): React.ReactElement {
  return (
    <div
      className={cn(
        'flex justify-between gap-4 py-0.5',
        emphasis && 'mt-1 pt-1.5 text-base font-semibold',
        emphasis && !panel && 'border-t',
        emphasis && panel && 'rounded px-2 py-1.5',
      )}
      style={
        emphasis
          ? panel
            ? { background: `rgba(${accentRgb}, 0.09)`, color: accent }
            : { borderColor: accent ?? '#0f172a' }
          : undefined
      }
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

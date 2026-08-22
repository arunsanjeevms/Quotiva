import { escapeHtml, formatDate, formatMoney, formatPercent, formatQuantity, type CurrencyLike } from '../utils/pdfFormat.js';
import {
  darken,
  hexToRgbTriplet,
  readableOn,
  resolveAccent,
  resolveTemplateKey,
  TEMPLATE_THEMES,
} from '../utils/templateThemes.js';
import type { BusinessSettings } from './settings.service.js';

interface DocItem {
  id: string;
  name: string;
  description: string | null;
  unitName?: string | null;
  quantity: string;
  unitPrice: string;
  discountAmount: string;
  taxRate: number;
  lineTotal: string;
}

interface DocCharge {
  id: string;
  label: string;
  amount: string;
}

interface DocTaxLine {
  name: string;
  rate: number;
  amount: string;
}

export interface PdfDocument {
  templateKey?: string | null;
  customer: { name: string; companyName: string | null; email: string | null; phone: string | null };
  issueDate: string;
  dueDate?: string | null;
  validUntil?: string | null;
  reference?: string | null;
  currencyCode: string;
  currencySymbol: string;
  quotationNumber?: string;
  invoiceNumber?: string;
  items: DocItem[];
  charges: DocCharge[];
  subtotal: string;
  itemDiscountTotal: string;
  documentDiscountAmount: string;
  taxableAmount: string;
  taxBreakdown: DocTaxLine[];
  grandTotal: string;
  amountPaid?: string;
  amountDue?: string;
  customNotes?: string | null;
  termsAndConditions?: string | null;
  includeNotes?: boolean;
  includeTerms?: boolean;
  paymentInstructions?: string | null;
}

export interface PdfBusiness {
  name: string;
  dateFormat?: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
  phone: string | null;
  email: string | null;
  taxRegistrationNumber: string | null;
}

export interface PdfBranding {
  documentAccentColor: string | null;
  primaryColor: string;
  showLogoOnDocuments: boolean;
  logoUrl?: string | null;
}

function templateHeader(
  headerKind: string,
  business: PdfBusiness,
  docTypeLabel: string,
  docNumber: string,
  accent: string,
  accentRgb: string,
  wideTitle: boolean,
): string {
  const addressLines = [
    business.addressLine1,
    business.addressLine2,
    [business.city, business.state, business.postalCode].filter(Boolean).join(', '),
    business.country,
  ].filter(Boolean) as string[];

  const businessBlock = (onAccentColor?: string) => `
    <div class="biz-block">
      <h1 style="${onAccentColor ? `color:${onAccentColor}` : ''}">${escapeHtml(business.name)}</h1>
      ${addressLines.map((l) => `<p style="${onAccentColor ? `color:${onAccentColor};opacity:.9` : ''}">${escapeHtml(l)}</p>`).join('')}
      ${business.phone ? `<p style="${onAccentColor ? `color:${onAccentColor};opacity:.9` : ''}">${escapeHtml(business.phone)}</p>` : ''}
      ${business.email ? `<p style="${onAccentColor ? `color:${onAccentColor};opacity:.9` : ''}">${escapeHtml(business.email)}</p>` : ''}
    </div>
  `;

  const title = `<p class="doc-title${wideTitle ? ' wide' : ''}">${docTypeLabel}</p>`;

  switch (headerKind) {
    case 'band': {
      const label = readableOn(accent);
      return `
        <header class="hdr hdr-band" style="background:linear-gradient(100deg, ${accent}, ${darken(accent, 34)}); color:${label}">
          ${businessBlock(label)}
          <div class="hdr-right">${title}<p class="doc-number" style="opacity:.9">${escapeHtml(docNumber)}</p></div>
        </header>`;
    }
    case 'panel':
      return `
        <header class="hdr hdr-panel" style="background:rgba(${accentRgb},0.07); border-left:4px solid ${accent}">
          ${businessBlock()}
          <div class="hdr-right" style="color:${accent}">${title}<p class="doc-number" style="color:#0f172a">${escapeHtml(docNumber)}</p>
          ${business.taxRegistrationNumber ? `<p class="tax-reg">Tax reg. ${escapeHtml(business.taxRegistrationNumber)}</p>` : ''}</div>
        </header>`;
    case 'stripe':
      return `
        <header class="hdr hdr-stripe">
          <div class="stripe" style="background:${accent}"></div>
          <div class="hdr-stripe-row">
            ${businessBlock()}
            <div class="hdr-right"><div style="color:${accent}">${title}</div><p class="doc-number">${escapeHtml(docNumber)}</p></div>
          </div>
        </header>`;
    case 'centered':
      return `
        <header class="hdr hdr-centered">
          <div class="biz-centered">${businessBlock()}</div>
          <div class="rule-row">
            <span class="rule" style="background:${accent}"></span>
            <span class="rule-label" style="color:${accent}">${docTypeLabel}</span>
            <span class="rule" style="background:${accent}"></span>
          </div>
          <p class="doc-number center">${escapeHtml(docNumber)}</p>
        </header>`;
    case 'sidebar':
      return `
        <header class="hdr hdr-sidebar" style="border-bottom:2px solid ${accent}">
          <div style="color:${accent}">${title}</div>
          <p class="doc-number">${escapeHtml(docNumber)}</p>
        </header>`;
    case 'compact':
      return `
        <header class="hdr hdr-compact" style="border-color:${accent}">
          ${businessBlock()}
          <div class="hdr-right" style="color:${accent}"><p class="doc-title-inline">${docTypeLabel} ${escapeHtml(docNumber)}</p></div>
        </header>`;
    case 'ruled':
      return `
        <header class="hdr hdr-ruled" style="border-color:${accent}">
          ${businessBlock()}
          <div class="hdr-right">${title}<p class="doc-number">${escapeHtml(docNumber)}</p>
          ${business.taxRegistrationNumber ? `<p class="tax-reg">Tax reg. ${escapeHtml(business.taxRegistrationNumber)}</p>` : ''}</div>
        </header>`;
    case 'plain':
    default:
      return `
        <header class="hdr hdr-plain">
          ${businessBlock()}
          <div class="hdr-right"><p class="doc-title-plain">${docTypeLabel}</p><p class="doc-number">${escapeHtml(docNumber)}</p></div>
        </header>`;
  }
}

export function renderDocumentHtml(params: {
  doc: PdfDocument;
  business: PdfBusiness;
  branding: PdfBranding;
  settings: BusinessSettings;
  docTypeLabel: 'Quotation' | 'Invoice';
}): string {
  const { doc, business, branding, settings, docTypeLabel } = params;
  const currency: CurrencyLike = {
    currencySymbol: doc.currencySymbol,
    decimalPlaces: settings.decimalPlaces,
    symbolPosition: settings.symbolPosition,
    thousandSeparator: settings.thousandSeparator,
    decimalSeparator: settings.decimalSeparator,
  };

  const theme = TEMPLATE_THEMES[resolveTemplateKey(doc.templateKey)];
  const accent = resolveAccent(branding);
  const accentRgb = hexToRgbTriplet(accent);
  const accentLabel = readableOn(accent);
  const compact = theme.density === 'compact';
  const serif = theme.headingFont === 'serif';

  const docNumber = docTypeLabel === 'Invoice' ? (doc.invoiceNumber ?? '') : (doc.quotationNumber ?? '');
  const anyDiscount = doc.items.some((i) => Number(i.discountAmount) > 0);
  const showNotes = doc.includeNotes && !!doc.customNotes;
  const showTerms = doc.includeTerms && !!doc.termsAndConditions;
  const customerLines = [doc.customer.companyName, doc.customer.email, doc.customer.phone].filter(Boolean) as string[];

  const headerHtml = templateHeader(theme.header, business, docTypeLabel, docNumber, accent, accentRgb, theme.wideTitle);

  const tableHeaderStyle =
    theme.tableHeader === 'band'
      ? `background:${accent};color:${accentLabel}`
      : theme.tableHeader === 'panel'
        ? `background:rgba(${accentRgb},0.09)`
        : theme.tableHeader === 'underline'
          ? `border-bottom:2px solid ${accent}`
          : '';

  const itemsRows = doc.items
    .map(
      (item, idx) => `
      <tr class="item-row ${theme.zebra && idx % 2 === 1 ? 'zebra' : ''}" style="${theme.zebra && idx % 2 === 1 ? `background:rgba(${accentRgb},0.035)` : ''}">
        <td class="cell name-cell">
          <p class="item-name">${escapeHtml(item.name)}</p>
          ${item.description && !compact ? `<p class="item-desc">${escapeHtml(item.description)}</p>` : ''}
        </td>
        <td class="cell num">${formatQuantity(item.quantity, currency)}</td>
        <td class="cell muted">${item.unitName ? escapeHtml(item.unitName) : '—'}</td>
        <td class="cell num">${formatMoney(item.unitPrice, currency)}</td>
        ${anyDiscount ? `<td class="cell num muted">${Number(item.discountAmount) > 0 ? `− ${formatMoney(item.discountAmount, currency)}` : '—'}</td>` : ''}
        <td class="cell num muted">${item.taxRate > 0 ? formatPercent(item.taxRate) : '—'}</td>
        <td class="cell num strong">${formatMoney(item.lineTotal, currency)}</td>
      </tr>`,
    )
    .join('');

  const totalRows: string[] = [
    `<div class="total-row"><span>Subtotal</span><span>${formatMoney(doc.subtotal, currency)}</span></div>`,
  ];
  if (Number(doc.itemDiscountTotal) > 0) totalRows.push(`<div class="total-row"><span>Item discounts</span><span>− ${formatMoney(doc.itemDiscountTotal, currency)}</span></div>`);
  if (Number(doc.documentDiscountAmount) > 0) totalRows.push(`<div class="total-row"><span>Discount</span><span>− ${formatMoney(doc.documentDiscountAmount, currency)}</span></div>`);
  totalRows.push(`<div class="total-row"><span>Taxable amount</span><span>${formatMoney(doc.taxableAmount, currency)}</span></div>`);
  for (const line of doc.taxBreakdown) {
    totalRows.push(`<div class="total-row"><span>${escapeHtml(line.name)} (${formatPercent(line.rate)})</span><span>${formatMoney(line.amount, currency)}</span></div>`);
  }
  for (const charge of doc.charges) {
    totalRows.push(`<div class="total-row"><span>${escapeHtml(charge.label)}</span><span>${formatMoney(charge.amount, currency)}</span></div>`);
  }
  const emphasisStyle =
    theme.accent === 'panel'
      ? `background:rgba(${accentRgb},0.1);color:${accent};border-radius:4px;padding:6px 8px;border-top:none`
      : theme.accent === 'rule' || theme.accent === 'text'
        ? `border-top:1px solid ${accent}`
        : `border-top:1px solid #0f172a`;
  totalRows.push(`<div class="total-row emphasis" style="${emphasisStyle}"><span>Grand total</span><span>${formatMoney(doc.grandTotal, currency)}</span></div>`);
  if (docTypeLabel === 'Invoice' && Number(doc.amountPaid) > 0) {
    totalRows.push(`<div class="total-row"><span>Paid</span><span>− ${formatMoney(doc.amountPaid, currency)}</span></div>`);
    totalRows.push(`<div class="total-row emphasis" style="${emphasisStyle}"><span>Balance due</span><span>${formatMoney(doc.amountDue, currency)}</span></div>`);
  }

  const paymentSection =
    settings.showPaymentDetailsOnDocuments && (settings.bankName || doc.paymentInstructions)
      ? `
    <section class="pay-block" style="background:rgba(${accentRgb},0.05);border:1px solid rgba(${accentRgb},0.18)">
      <h2 class="section-label">Payment information</h2>
      <div class="pay-grid">
        ${settings.bankName ? `<div class="pay-row"><span>Bank</span><span>${escapeHtml(settings.bankName)}</span></div>` : ''}
        ${settings.bankAccountName ? `<div class="pay-row"><span>Account name</span><span>${escapeHtml(settings.bankAccountName)}</span></div>` : ''}
        ${settings.bankAccountNumber ? `<div class="pay-row"><span>Account number</span><span>${escapeHtml(settings.bankAccountNumber)}</span></div>` : ''}
        ${settings.bankIfscSwift ? `<div class="pay-row"><span>IFSC / SWIFT</span><span>${escapeHtml(settings.bankIfscSwift)}</span></div>` : ''}
        ${settings.bankBranch ? `<div class="pay-row"><span>Branch</span><span>${escapeHtml(settings.bankBranch)}</span></div>` : ''}
        ${settings.upiId ? `<div class="pay-row"><span>UPI</span><span>${escapeHtml(settings.upiId)}</span></div>` : ''}
      </div>
      ${doc.paymentInstructions ? `<p class="pay-note">${escapeHtml(doc.paymentInstructions)}</p>` : ''}
    </section>`
      : '';

  const sectionHeading = (label: string) => {
    if (theme.accent === 'panel') return `<h2 class="section-label panel" style="background:rgba(${accentRgb},0.09);color:${accent}">${label}</h2>`;
    if (theme.accent === 'text') return `<h2 class="section-label text" style="color:${accent}">${label}</h2>`;
    if (theme.accent === 'rule') return `<h2 class="section-label rule" style="border-color:${accent}">${label}</h2>`;
    return `<h2 class="section-label">${label}</h2>`;
  };

  const notesTerms =
    showNotes || showTerms
      ? `<div class="notes-terms">
          ${showNotes ? `<section>${sectionHeading('Notes')}<div class="rich">${doc.customNotes}</div></section>` : ''}
          ${showTerms ? `<section>${sectionHeading('Terms &amp; Conditions')}<div class="rich">${doc.termsAndConditions}</div></section>` : ''}
        </div>`
      : '';

  const isSidebar = theme.header === 'sidebar';
  const sidebarAside = isSidebar
    ? `
    <aside class="sidebar-aside" style="background:rgba(${accentRgb},0.08);border-right:3px solid ${accent}">
      <h1 class="sidebar-name" style="color:${accent}">${escapeHtml(business.name)}</h1>
      <div class="sidebar-lines">
        ${[business.addressLine1, business.addressLine2, [business.city, business.state, business.postalCode].filter(Boolean).join(', '), business.country]
          .filter(Boolean)
          .map((l) => `<p>${escapeHtml(l as string)}</p>`)
          .join('')}
        ${business.phone ? `<p>${escapeHtml(business.phone)}</p>` : ''}
        ${business.email ? `<p>${escapeHtml(business.email)}</p>` : ''}
      </div>
      ${business.taxRegistrationNumber ? `<div class="sidebar-taxreg"><p class="label">Tax reg.</p><p>${escapeHtml(business.taxRegistrationNumber)}</p></div>` : ''}
    </aside>`
    : '';

  const body = `
    ${headerHtml}
    <section class="parties">
      <div>
        <p class="party-label" style="${theme.accent === 'text' ? `color:${accent}` : ''}">${docTypeLabel === 'Invoice' ? 'Bill to' : 'Prepared for'}</p>
        <p class="party-name">${escapeHtml(doc.customer.name)}</p>
        ${customerLines.map((l) => `<p class="party-line">${escapeHtml(l)}</p>`).join('')}
      </div>
      <dl class="meta">
        <div class="meta-row"><dt>${docTypeLabel === 'Invoice' ? 'Invoice date' : 'Quotation date'}</dt><dd>${formatDate(doc.issueDate, business.dateFormat ?? undefined)}</dd></div>
        ${doc.dueDate ? `<div class="meta-row"><dt>Due date</dt><dd>${formatDate(doc.dueDate, business.dateFormat ?? undefined)}</dd></div>` : ''}
        ${doc.validUntil ? `<div class="meta-row"><dt>Valid until</dt><dd>${formatDate(doc.validUntil, business.dateFormat ?? undefined)}</dd></div>` : ''}
        <div class="meta-row"><dt>Currency</dt><dd>${escapeHtml(doc.currencyCode)} (${escapeHtml(doc.currencySymbol)})</dd></div>
        ${doc.reference ? `<div class="meta-row"><dt>Reference</dt><dd>${escapeHtml(doc.reference)}</dd></div>` : ''}
      </dl>
    </section>

    <section class="items-section">
      <table class="items-table">
        <thead>
          <tr style="${tableHeaderStyle}">
            <th class="th name-cell">Description</th>
            <th class="th num">Qty</th>
            <th class="th">Unit</th>
            <th class="th num">Price</th>
            ${anyDiscount ? '<th class="th num">Discount</th>' : ''}
            <th class="th num">Tax</th>
            <th class="th num">Amount</th>
          </tr>
        </thead>
        <tbody>${itemsRows}</tbody>
      </table>
    </section>

    <section class="totals-section"><div class="totals-box">${totalRows.join('')}</div></section>

    ${paymentSection}
    ${notesTerms}

    ${settings.defaultFooter ? `<footer class="doc-footer"><p>${escapeHtml(settings.defaultFooter)}</p></footer>` : ''}
  `;

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>
  @page { margin: 0; }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 28px 34px; color: #0f172a; background: #fff;
    font-family: ${serif ? "Georgia, 'Times New Roman', serif" : "-apple-system, 'Segoe UI', Arial, sans-serif"};
    font-size: ${compact ? '12px' : '13px'}; line-height: ${compact ? '1.35' : '1.55'};
  }
  .doc-root { display: flex; }
  .doc-main { flex: 1; min-width: 0; }
  p { margin: 0; }
  table { width: 100%; border-collapse: collapse; }
  .hdr { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 24px; }
  .hdr-band, .hdr-panel, .hdr-ruled { padding-bottom: 16px; }
  .hdr-band { border-radius: 6px; padding: 16px 20px; margin-bottom: 4px; }
  .hdr-panel { border-radius: 8px; padding: 16px; }
  .hdr-ruled { border-bottom: 2px solid; padding-bottom: 20px; }
  .hdr-plain { padding-bottom: 24px; }
  .hdr-compact { border-bottom: 1px solid; padding-bottom: 12px; align-items: center; }
  .hdr-sidebar { display: flex; justify-content: space-between; align-items: flex-end; padding-bottom: 12px; }
  .hdr-stripe .stripe { height: 8px; border-radius: 999px; margin-bottom: 16px; }
  .hdr-stripe-row { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: flex-end; gap: 24px; }
  .hdr-centered { text-align: center; }
  .biz-centered { display: flex; justify-content: center; }
  .biz-block h1 { font-size: 18px; font-weight: 600; margin-bottom: 2px; }
  .biz-block p { color: #475569; }
  .hdr-right { text-align: right; }
  .doc-title { font-weight: 600; text-transform: uppercase; font-size: ${compact ? '15px' : '20px'}; letter-spacing: 0.05em; }
  .doc-title.wide { letter-spacing: 0.18em; }
  .doc-title-plain { font-size: 20px; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; font-weight: 400; }
  .doc-title-inline { font-size: 16px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; }
  .doc-number { margin-top: 4px; font-family: 'Courier New', monospace; font-size: 15px; }
  .doc-number.center { margin-top: 4px; text-align: center; font-family: 'Courier New', monospace; }
  .tax-reg { margin-top: 4px; color: #475569; }
  .rule-row { display: flex; align-items: center; gap: 12px; max-width: 380px; margin: 16px auto 0; }
  .rule { height: 1px; flex: 1; }
  .rule-label { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.28em; }

  .parties { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 24px; margin-top: 20px; }
  .party-label { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; margin-bottom: 4px; }
  .party-name { font-weight: 500; }
  .party-line { color: #475569; }
  .meta { min-width: 200px; }
  .meta-row { display: flex; justify-content: space-between; gap: 16px; padding: 1px 0; }
  .meta-row dt { color: #64748b; margin: 0; }
  .meta-row dd { font-weight: 500; margin: 0; }

  .items-section { margin-top: ${compact ? '16px' : '24px'}; }
  .th { text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.03em; font-weight: 600; padding: ${compact ? '6px 8px' : '8px'}; }
  .th.num, td.num { text-align: right; }
  .items-table thead tr { border-bottom: 1px solid #cbd5e1; }
  .item-row { border-bottom: 1px solid #e2e8f0; vertical-align: top; }
  .cell { padding: ${compact ? '6px 8px' : '8px'}; }
  .item-name { font-weight: 500; }
  .item-desc { color: #475569; }
  .muted { color: #475569; }
  .strong { font-weight: 500; }
  .tabular { font-variant-numeric: tabular-nums; }

  .totals-section { display: flex; justify-content: flex-end; margin-top: ${compact ? '12px' : '16px'}; }
  .totals-box { width: 100%; max-width: 300px; }
  .total-row { display: flex; justify-content: space-between; gap: 16px; padding: 2px 0; color: #334155; }
  .total-row.emphasis { margin-top: 4px; padding-top: 6px; font-size: 15px; font-weight: 600; color: #0f172a; }

  .pay-block { border-radius: 6px; padding: ${compact ? '10px' : '12px'}; margin-top: ${compact ? '16px' : '24px'}; page-break-inside: avoid; }
  .section-label { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; margin-bottom: 6px; }
  .section-label.panel { border-radius: 4px; padding: 4px 8px; display: inline-block; }
  .section-label.rule { border-bottom: 1px solid; padding-bottom: 4px; color: #475569; }
  .section-label.text { border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; }
  .pay-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 2px 24px; }
  .pay-row { display: flex; justify-content: space-between; gap: 12px; }
  .pay-row span:first-child { color: #64748b; }
  .pay-row span:last-child { font-weight: 500; }
  .pay-note { margin-top: 8px; color: #334155; }

  .notes-terms { margin-top: ${compact ? '16px' : '24px'}; page-break-inside: avoid; }
  .notes-terms section { page-break-inside: avoid; margin-bottom: 20px; }
  .rich { color: #334155; font-size: 13px; }
  .rich p { margin: 0 0 6px; }

  .doc-footer { margin-top: 32px; border-top: 1px solid #e2e8f0; padding-top: 12px; text-align: center; font-size: 11px; color: #64748b; }
  .doc-footer p + p { margin-top: 4px; }

  .sidebar-aside { width: 170px; flex-shrink: 0; padding: 20px; }
  .sidebar-name { font-size: 15px; font-weight: 600; margin-bottom: 10px; }
  .sidebar-lines p { color: #475569; font-size: 11px; margin-bottom: 2px; }
  .sidebar-taxreg { border-top: 1px solid rgba(0,0,0,0.12); margin-top: 10px; padding-top: 8px; font-size: 11px; }
  .sidebar-taxreg .label { font-weight: 500; color: #334155; }
</style>
</head>
<body>
  ${isSidebar ? `<div class="doc-root">${sidebarAside}<div class="doc-main">${body}</div></div>` : `<div class="doc-main">${body}</div>`}
</body>
</html>`;
}

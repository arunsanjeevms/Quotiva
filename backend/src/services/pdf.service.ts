import puppeteer, { type Browser } from 'puppeteer';
import { AppError } from '../utils/AppError.js';
import { supabaseAdmin } from '../config/supabase.js';
import { getBranding, getBusiness, getSettings } from './settings.service.js';
import { renderDocumentHtml, type PdfDocument } from './pdfHtml.service.js';

let browserPromise: Promise<Browser> | null = null;

/**
 * One shared headless Chromium instance per process, launched lazily on the
 * first PDF request and reused after — a fresh launch per request is too slow
 * on a free-tier instance. If the browser crashes, the next call relaunches it.
 */
async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = puppeteer
      .launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
      })
      .catch((err) => {
        browserPromise = null;
        throw err;
      });
  }
  return browserPromise;
}

async function resolveTemplateKey(businessId: string, templateId: string | null | undefined): Promise<string | null> {
  if (!templateId) return null;
  const { data } = await supabaseAdmin.from('document_templates').select('key').eq('business_id', businessId).eq('id', templateId).maybeSingle();
  return (data?.['key'] as string | undefined) ?? null;
}

export async function generateDocumentPdf(params: {
  businessId: string;
  doc: Record<string, unknown>;
  docTypeLabel: 'Quotation' | 'Invoice';
}): Promise<Buffer> {
  const { businessId, doc, docTypeLabel } = params;

  const [business, branding, settings, templateKey] = await Promise.all([
    getBusiness(businessId),
    getBranding(businessId),
    getSettings(businessId),
    resolveTemplateKey(businessId, doc['templateId'] as string | null),
  ]);

  const html = renderDocumentHtml({
    doc: { ...doc, templateKey } as unknown as PdfDocument,
    business: business as never,
    branding: branding as never,
    settings,
    docTypeLabel,
  });

  let browser: Browser;
  try {
    browser = await getBrowser();
  } catch {
    throw AppError.businessRule('PDF_UNAVAILABLE', 'PDF rendering is temporarily unavailable. Try again in a moment.');
  }

  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdf = await page.pdf({
      format: settings.pageSize === 'Letter' ? 'letter' : 'a4',
      printBackground: true,
      margin: { top: '0', bottom: '0', left: '0', right: '0' },
    });
    return Buffer.from(pdf);
  } finally {
    await page.close();
  }
}

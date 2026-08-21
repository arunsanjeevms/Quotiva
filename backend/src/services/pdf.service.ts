import puppeteer, { type Browser } from 'puppeteer-core';
import chromium from '@sparticuz/chromium';
import { AppError } from '../utils/AppError.js';
import { supabaseAdmin } from '../config/supabase.js';
import { getBranding, getBusiness, getSettings } from './settings.service.js';
import { renderDocumentHtml, type PdfDocument } from './pdfHtml.service.js';

let browserPromise: Promise<Browser> | null = null;

/** Rejects a promise if it hasn't settled within `ms` — prevents any single stage from hanging the request forever. */
function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(message)), ms)),
  ]);
}

function log(step: string, extra?: Record<string, unknown>): void {
  console.log(`[pdf] ${step}`, extra ?? '');
}

/**
 * One shared headless Chromium instance per process, launched lazily on the
 * first PDF request and reused after — a fresh launch per request is too slow
 * on a free-tier instance. If the browser crashes, the next call relaunches it.
 *
 * Uses @sparticuz/chromium's self-contained binary rather than Puppeteer's
 * bundled Chromium: Render's Node runtime lacks several shared libraries
 * (libnss3, libatk-bridge, …) that a normal desktop Chromium build needs,
 * which made launches hang indefinitely instead of failing fast.
 */
async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = (async () => {
      log('resolving chromium executablePath');
      const executablePath = await withTimeout(chromium.executablePath(), 15_000, 'chromium.executablePath() timed out');
      log('executablePath resolved', { executablePath });
      const browser = await withTimeout(
        puppeteer.launch({
          executablePath,
          headless: true,
          args: [...chromium.args, '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
        }),
        20_000,
        'Browser launch timed out',
      );
      log('browser launched');
      return browser;
    })().catch((err) => {
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

  log('start', { businessId, docTypeLabel });

  const [business, branding, settings, templateKey] = await withTimeout(
    Promise.all([
      getBusiness(businessId),
      getBranding(businessId),
      getSettings(businessId),
      resolveTemplateKey(businessId, doc['templateId'] as string | null),
    ]),
    10_000,
    'Fetching business/branding/settings timed out',
  ).catch((err) => {
    console.error('[pdf] business/branding/settings fetch failed', err);
    throw AppError.businessRule('PDF_UNAVAILABLE', 'Could not load business details for the PDF. Try again in a moment.');
  });
  log('loaded business context');

  const html = renderDocumentHtml({
    doc: { ...doc, templateKey } as unknown as PdfDocument,
    business: business as never,
    branding: branding as never,
    settings,
    docTypeLabel,
  });
  log('html built', { length: html.length });

  let browser: Browser;
  try {
    browser = await getBrowser();
  } catch (err) {
    console.error('[pdf] Chromium launch failed', err);
    throw AppError.businessRule('PDF_UNAVAILABLE', 'PDF rendering is temporarily unavailable. Try again in a moment.');
  }

  let page;
  try {
    page = await withTimeout(browser.newPage(), 10_000, 'newPage() timed out');
  } catch (err) {
    console.error('[pdf] newPage failed', err);
    browserPromise = null;
    void browser.close().catch(() => {});
    throw AppError.businessRule('PDF_UNAVAILABLE', 'PDF rendering is temporarily unavailable. Try again in a moment.');
  }

  try {
    const result = await withTimeout(
      (async () => {
        await page.setContent(html, { waitUntil: 'networkidle0', timeout: 15_000 });
        log('content set');
        const pdf = await page.pdf({
          format: settings.pageSize === 'Letter' ? 'letter' : 'a4',
          printBackground: true,
          margin: { top: '0', bottom: '0', left: '0', right: '0' },
        });
        log('pdf rendered', { bytes: pdf.length });
        return Buffer.from(pdf);
      })(),
      20_000,
      'PDF rendering timed out',
    );
    return result;
  } catch (err) {
    console.error('[pdf] rendering failed', err);
    throw AppError.businessRule('PDF_UNAVAILABLE', 'PDF rendering is temporarily unavailable. Try again in a moment.');
  } finally {
    await page.close().catch(() => {});
  }
}

import crypto from 'node:crypto';
import { supabaseAdmin } from '../config/supabase.js';
import { AppError } from '../utils/AppError.js';
import { bodyToSnake, rowToCamel } from '../utils/case.js';

export interface BusinessSettings {
  businessId: string;
  currencyCode: string; currencyName: string; currencySymbol: string;
  decimalPlaces: number; symbolPosition: 'before' | 'after';
  thousandSeparator: string; decimalSeparator: string;
  defaultInvoiceTemplateId: string | null; defaultQuotationTemplateId: string | null;
  defaultTaxId: string | null; defaultTaxMode: 'exclusive' | 'inclusive' | 'none';
  defaultPaymentTermsDays: number; quotationValidityDays: number;
  defaultQuotationNotes: string | null; defaultInvoiceNotes: string | null;
  defaultQuotationTerms: string | null; defaultInvoiceTerms: string | null;
  includeNotesByDefault: boolean; includeTermsByDefault: boolean;
  defaultFooter: string | null; defaultPaymentInstructions: string | null;
  pageSize: 'A4' | 'Letter';
  bankName: string | null; bankAccountName: string | null; bankAccountNumber: string | null;
  bankIfscSwift: string | null; bankBranch: string | null; upiId: string | null;
  showPaymentDetailsOnDocuments: boolean;
  emailFromName: string | null; emailReplyTo: string | null; emailEnabled: boolean;
  [key: string]: unknown;
}

/** Cached per request-lifetime would be nice; kept simple as a direct read for Phase 1. */
export async function getSettings(businessId: string): Promise<BusinessSettings> {
  const { data, error } = await supabaseAdmin.from('business_settings').select('*').eq('business_id', businessId).maybeSingle();
  if (error) throw new AppError(500, 'INTERNAL_ERROR', error.message);
  if (!data) throw AppError.notFound('Business settings');
  return rowToCamel<BusinessSettings>(data);
}

/**
 * The `business-assets` bucket is private (docs/04 "storage buckets") — the
 * browser never gets a storage token, so every logo/favicon URL sent to the
 * frontend is a short-lived signed URL generated here, never the raw path.
 */
const ASSET_BUCKET = 'business-assets';
const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days — refreshed on every branding fetch

async function signedAssetUrl(path: string | null): Promise<string | null> {
  if (!path) return null;
  const { data, error } = await supabaseAdmin.storage.from(ASSET_BUCKET).createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (error || !data) return null;
  return data.signedUrl;
}

export async function attachSignedUrls(branding: Record<string, unknown>): Promise<Record<string, unknown>> {
  const [logoUrl, faviconUrl] = await Promise.all([
    signedAssetUrl(branding['logoPath'] as string | null),
    signedAssetUrl(branding['faviconPath'] as string | null),
  ]);
  return { ...branding, logoUrl, faviconUrl };
}

export async function getBranding(businessId: string) {
  const { data, error } = await supabaseAdmin.from('business_branding').select('*').eq('business_id', businessId).maybeSingle();
  if (error) throw new AppError(500, 'INTERNAL_ERROR', error.message);
  if (!data) throw AppError.notFound('Branding');
  return attachSignedUrls(rowToCamel(data));
}

const ASSET_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
  'image/x-icon': 'ico',
};

/** Uploads a logo/favicon to storage, updates the business_branding row, and returns it with a fresh signed URL. */
export async function uploadBrandingAsset(
  businessId: string,
  kind: 'logo' | 'favicon',
  file: { buffer: Buffer; mimetype: string },
): Promise<Record<string, unknown>> {
  const ext = ASSET_EXT[file.mimetype];
  if (!ext) throw new AppError(422, 'VALIDATION_ERROR', 'Unsupported file type. Use PNG, JPEG, WebP, SVG or ICO.');

  const { data: existing } = await supabaseAdmin.from('business_branding').select('logo_path, favicon_path').eq('business_id', businessId).maybeSingle();
  const column = kind === 'logo' ? 'logo_path' : 'favicon_path';
  const previousPath = existing?.[column] as string | null | undefined;

  const path = `${businessId}/branding/${kind}-${crypto.randomUUID()}.${ext}`;
  const { error: uploadError } = await supabaseAdmin.storage
    .from(ASSET_BUCKET)
    .upload(path, file.buffer, { contentType: file.mimetype, upsert: false });
  if (uploadError) throw new AppError(500, 'INTERNAL_ERROR', `Could not upload ${kind}: ${uploadError.message}`);

  const { data, error } = await supabaseAdmin
    .from('business_branding')
    .update({ [column]: path })
    .eq('business_id', businessId)
    .select('*')
    .maybeSingle();
  if (error) throw new AppError(500, 'INTERNAL_ERROR', error.message);
  if (!data) throw AppError.notFound('Branding');

  if (previousPath) void supabaseAdmin.storage.from(ASSET_BUCKET).remove([previousPath]);

  return attachSignedUrls(rowToCamel(data));
}

export async function getBusiness(businessId: string) {
  const { data, error } = await supabaseAdmin.from('businesses').select('*').eq('id', businessId).maybeSingle();
  if (error) throw new AppError(500, 'INTERNAL_ERROR', error.message);
  if (!data) throw AppError.notFound('Business');
  return rowToCamel(data);
}

const SETTINGS_COLUMNS = new Set([
  'currency_code', 'currency_name', 'currency_symbol', 'decimal_places', 'symbol_position',
  'thousand_separator', 'decimal_separator', 'default_invoice_template_id', 'default_quotation_template_id',
  'default_tax_id', 'default_tax_mode', 'default_payment_terms_days', 'quotation_validity_days',
  'default_quotation_notes', 'default_invoice_notes', 'default_quotation_terms', 'default_invoice_terms',
  'include_notes_by_default', 'include_terms_by_default', 'default_footer', 'default_payment_instructions',
  'page_size', 'bank_name', 'bank_account_name', 'bank_account_number', 'bank_ifsc_swift', 'bank_branch',
  'upi_id', 'show_payment_details_on_documents', 'email_from_name', 'email_reply_to', 'email_enabled',
  'notify_on_payment', 'notify_on_quotation_accept', 'notify_on_overdue',
]);

export async function updateSettings(businessId: string, body: Record<string, unknown>) {
  const snake = bodyToSnake(body);
  const payload: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(snake)) if (SETTINGS_COLUMNS.has(key)) payload[key] = value;
  const { data, error } = await supabaseAdmin.from('business_settings').update(payload).eq('business_id', businessId).select('*').maybeSingle();
  if (error) throw new AppError(500, 'INTERNAL_ERROR', error.message);
  if (!data) throw AppError.notFound('Business settings');
  return rowToCamel(data);
}

const BRANDING_COLUMNS = new Set(['primary_color', 'secondary_color', 'document_accent_color', 'show_logo_on_documents', 'logo_path', 'favicon_path']);

export async function updateBranding(businessId: string, body: Record<string, unknown>) {
  const snake = bodyToSnake(body);
  const payload: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(snake)) if (BRANDING_COLUMNS.has(key)) payload[key] = value;
  const { data, error } = await supabaseAdmin.from('business_branding').update(payload).eq('business_id', businessId).select('*').maybeSingle();
  if (error) throw new AppError(500, 'INTERNAL_ERROR', error.message);
  if (!data) throw AppError.notFound('Branding');
  return attachSignedUrls(rowToCamel(data));
}

const BUSINESS_COLUMNS = new Set([
  'name', 'legal_name', 'email', 'alt_email', 'phone', 'alt_phone', 'website',
  'address_line1', 'address_line2', 'city', 'state', 'country', 'postal_code',
  'tax_registration_number', 'business_registration_number', 'registration_extra',
]);

export async function updateBusiness(businessId: string, body: Record<string, unknown>) {
  const snake = bodyToSnake(body);
  const payload: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(snake)) if (BUSINESS_COLUMNS.has(key)) payload[key] = value;
  const { data, error } = await supabaseAdmin.from('businesses').update(payload).eq('id', businessId).select('*').maybeSingle();
  if (error) throw new AppError(500, 'INTERNAL_ERROR', error.message);
  if (!data) throw AppError.notFound('Business');
  return rowToCamel(data);
}

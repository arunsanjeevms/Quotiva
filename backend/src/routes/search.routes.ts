import { Router } from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { asyncHandler } from '../utils/asyncHandler.js';

/** Global search across the modules the caller can read (docs/08 §20). */
export const searchRouter = Router();

searchRouter.get('/', asyncHandler(async (req, res) => {
  const q = String(req.query['q'] ?? '').trim();
  const businessId = req.tenant!.businessId;
  const perms = req.tenant!.permissions;
  const empty = { customers: [], products: [], quotations: [], invoices: [], payments: [] };
  if (!q) {
    res.json({ data: empty });
    return;
  }

  const cap = <T,>(rows: T[]): T[] => rows.slice(0, 5);

  const [customers, products, quotations, invoices, payments] = await Promise.all([
    perms.has('customer.read')
      ? supabaseAdmin.from('customers').select('id, name, company_name, email').eq('business_id', businessId).or(`name.ilike.%${q}%,company_name.ilike.%${q}%,email.ilike.%${q}%`).limit(5)
      : Promise.resolve({ data: [] }),
    perms.has('product.read')
      ? supabaseAdmin.from('products').select('id, name, sku, kind').eq('business_id', businessId).or(`name.ilike.%${q}%,sku.ilike.%${q}%`).limit(5)
      : Promise.resolve({ data: [] }),
    perms.has('quotation.read')
      ? supabaseAdmin.from('quotations').select('id, quotation_number, customers(name, company_name)').eq('business_id', businessId).ilike('quotation_number', `%${q}%`).limit(5)
      : Promise.resolve({ data: [] }),
    perms.has('invoice.read')
      ? supabaseAdmin.from('invoices').select('id, invoice_number, customers(name, company_name)').eq('business_id', businessId).ilike('invoice_number', `%${q}%`).limit(5)
      : Promise.resolve({ data: [] }),
    perms.has('payment.read')
      ? supabaseAdmin.from('payments').select('id, reference_number, invoices(invoice_number)').eq('business_id', businessId).ilike('reference_number', `%${q}%`).limit(5)
      : Promise.resolve({ data: [] }),
  ]);

  res.json({
    data: {
      customers: cap((customers.data ?? []).map((c) => ({ id: c['id'], label: c['company_name'] ?? c['name'], sublabel: c['email'] ?? c['name'] }))),
      products: cap((products.data ?? []).map((p) => ({ id: p['id'], label: p['name'], sublabel: p['sku'] ?? p['kind'] }))),
      quotations: cap((quotations.data ?? []).map((r) => {
        const c = r['customers'] as unknown as { name: string; company_name: string | null } | null;
        return { id: r['id'], label: r['quotation_number'], sublabel: c?.company_name ?? c?.name ?? '' };
      })),
      invoices: cap((invoices.data ?? []).map((r) => {
        const c = r['customers'] as unknown as { name: string; company_name: string | null } | null;
        return { id: r['id'], label: r['invoice_number'], sublabel: c?.company_name ?? c?.name ?? '' };
      })),
      payments: cap((payments.data ?? []).map((p) => {
        const inv = p['invoices'] as unknown as { invoice_number: string } | null;
        return { id: p['id'], label: inv?.invoice_number ?? '', sublabel: p['reference_number'] ?? '' };
      })),
    },
  });
}));

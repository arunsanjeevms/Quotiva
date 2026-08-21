-- Fixes create_business_bootstrap for backend-orchestrated calls (docs/02
-- "the secret boundary": the frontend never calls Supabase directly for
-- data, so this RPC is only ever invoked by the backend's service-role
-- client on the caller's behalf — routes/bootstrap.routes.ts). That client
-- carries no user JWT, so auth.uid() was always NULL and every brand-new
-- real user's first login failed bootstrap with "Not authenticated".
--
-- Fix: accept the user id as an explicit parameter instead of relying on
-- auth.uid(), and restrict EXECUTE to service_role only — since only the
-- trusted backend calls it, trusting the passed-in id is safe; granting it
-- to `authenticated` directly would let any signed-in user create a
-- business "as" an arbitrary other user id.

drop function if exists public.create_business_bootstrap(text);

create or replace function public.create_business_bootstrap(p_name text, p_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business_id uuid;
  v_user_id uuid := p_user_id;
  v_role_super uuid;
  v_role_admin uuid;
  v_role_staff uuid;
  v_all_perms text[] := array[
    'dashboard.read',
    'customer.read','customer.create','customer.update','customer.delete','customer.export',
    'product.read','product.create','product.update','product.delete','product.import',
    'catalog.read','catalog.create','catalog.update','catalog.delete',
    'tax.read','tax.create','tax.update','tax.delete',
    'quotation.read','quotation.create','quotation.update','quotation.delete',
    'quotation.send','quotation.convert','quotation.cancel',
    'invoice.read','invoice.create','invoice.update','invoice.delete',
    'invoice.send','invoice.cancel','invoice.void',
    'payment.read','payment.create','payment.update','payment.void',
    'report.read','report.export',
    'settings.read','settings.update','business.update',
    'user.read','user.manage','role.manage',
    'audit.read','backup.read','backup.create',
    'attachment.read','attachment.create','attachment.delete'
  ];
  v_staff_perms text[] := array[
    'dashboard.read','customer.read','customer.create','customer.update',
    'product.read','product.create','product.update','catalog.read','tax.read',
    'quotation.read','quotation.create','quotation.update','quotation.send',
    'invoice.read','invoice.create','invoice.update','invoice.send',
    'payment.read','payment.create','report.read','settings.read'
  ];
  v_invoice_tpl uuid;
  v_quotation_tpl uuid;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  insert into businesses (name, owner_id) values (p_name, v_user_id)
  returning id into v_business_id;

  insert into roles (business_id, key, name, description, is_system, permissions) values
    (v_business_id, 'super_admin', 'Super Admin', 'Full access, including roles, security and backups.', true, v_all_perms)
    returning id into v_role_super;
  insert into roles (business_id, key, name, description, is_system, permissions) values
    (v_business_id, 'administrator', 'Administrator', 'Everything except role management and backups.', true,
     array(select unnest(v_all_perms) except select unnest(array['role.manage','backup.create'])))
    returning id into v_role_admin;
  insert into roles (business_id, key, name, description, is_system, permissions) values
    (v_business_id, 'staff', 'Staff', 'Day-to-day sales work. Cannot change settings or delete records.', true, v_staff_perms)
    returning id into v_role_staff;

  insert into business_members (business_id, user_id, role_id, status, joined_at)
    values (v_business_id, v_user_id, v_role_super, 'active', now());

  insert into business_settings (business_id) values (v_business_id);
  insert into business_branding (business_id) values (v_business_id);

  insert into numbering_settings (business_id, document_type, prefix)
    values (v_business_id, 'quotation', 'QUO'),
           (v_business_id, 'invoice', 'INV'),
           (v_business_id, 'payment', 'PAY');

  insert into units (business_id, name, abbreviation) values
    (v_business_id, 'Piece', 'pc'), (v_business_id, 'Hour', 'hr'), (v_business_id, 'Day', 'day');
  insert into taxes (business_id, name, rate, description) values
    (v_business_id, 'No Tax', 0, 'Zero-rated');
  insert into payment_methods (business_id, name, requires_reference) values
    (v_business_id, 'Bank transfer', true), (v_business_id, 'Cash', false), (v_business_id, 'Card', true);

  insert into document_templates (business_id, key, name, document_type, description, is_system) values
    (null, 'classic', 'Classic', 'invoice', 'Serif headings, ruled table, formal.', true),
    (null, 'modern', 'Modern', 'invoice', 'Brand-colour header band, airy spacing.', true),
    (null, 'minimal', 'Minimal', 'invoice', 'No rules, whitespace-led.', true),
    (null, 'professional', 'Professional', 'invoice', 'Tinted panels, strong hierarchy.', true),
    (null, 'compact', 'Compact', 'invoice', 'Tighter rows for long item lists.', true),
    (null, 'bold', 'Bold', 'invoice', 'Oversized title, heavy accent stripe.', true),
    (null, 'elegant', 'Elegant', 'invoice', 'Centred serif masthead, hairline rules.', true),
    (null, 'sidebar', 'Sidebar', 'invoice', 'Vertical accent column.', true),
    (null, 'letterhead', 'Letterhead', 'invoice', 'Slim stripe, corporate feel.', true),
    (null, 'classic', 'Classic', 'quotation', 'Serif headings, ruled table, formal.', true),
    (null, 'modern', 'Modern', 'quotation', 'Brand-colour header band, airy spacing.', true),
    (null, 'minimal', 'Minimal', 'quotation', 'No rules, whitespace-led.', true),
    (null, 'professional', 'Professional', 'quotation', 'Tinted panels, strong hierarchy.', true),
    (null, 'compact', 'Compact', 'quotation', 'Tighter rows for long item lists.', true),
    (null, 'bold', 'Bold', 'quotation', 'Oversized title, heavy accent stripe.', true),
    (null, 'elegant', 'Elegant', 'quotation', 'Centred serif masthead, hairline rules.', true),
    (null, 'sidebar', 'Sidebar', 'quotation', 'Vertical accent column.', true),
    (null, 'letterhead', 'Letterhead', 'quotation', 'Slim stripe, corporate feel.', true)
  on conflict do nothing;

  select id into v_invoice_tpl from document_templates
    where business_id is null and document_type = 'invoice' and key = 'classic' limit 1;
  select id into v_quotation_tpl from document_templates
    where business_id is null and document_type = 'quotation' and key = 'modern' limit 1;

  update business_settings
    set default_invoice_template_id = v_invoice_tpl,
        default_quotation_template_id = v_quotation_tpl
    where business_id = v_business_id;

  return v_business_id;
end;
$$;

revoke execute on function public.create_business_bootstrap(text, uuid) from public;
revoke execute on function public.create_business_bootstrap(text, uuid) from anon;
revoke execute on function public.create_business_bootstrap(text, uuid) from authenticated;
grant  execute on function public.create_business_bootstrap(text, uuid) to service_role;

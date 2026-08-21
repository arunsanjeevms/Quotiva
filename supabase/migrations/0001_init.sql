-- InvoQuo initial schema.
-- Mirrors docs/03-database-schema.md and docs/04-rls-and-security.md, trimmed
-- to the tables the Phase-1 backend actually uses. Money is numeric(18,4),
-- never float. Every tenant table carries business_id. Apply with the
-- Supabase CLI (`supabase db push`) or paste into the SQL editor in order.

create extension if not exists pgcrypto;

-- ============================================================ enums ======
create type quotation_status as enum
  ('draft','sent','viewed','accepted','rejected','expired','cancelled','converted');
create type invoice_status as enum ('draft','sent','viewed','cancelled','void');
create type payment_state as enum ('unpaid','partially_paid','paid','overdue');
create type discount_type as enum ('percentage','fixed');
create type tax_mode as enum ('exclusive','inclusive','none');
create type item_source as enum ('catalog','custom');
create type product_kind as enum ('product','service');
create type member_status as enum ('active','invited','suspended');
create type numbering_reset as enum ('never','yearly','monthly','daily');

-- ==================================================== shared trigger =====
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ============================================================ identity ===
create table public.user_profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  full_name     text,
  email         text not null,
  phone         text,
  avatar_url    text,
  last_login_at timestamptz,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.user_profiles (id, email, full_name)
  values (new.id, new.email, new.raw_user_meta_data->>'full_name')
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create trigger trg_user_profiles_updated_at
  before update on public.user_profiles
  for each row execute function public.set_updated_at();

create table public.businesses (
  id            uuid primary key default gen_random_uuid(),
  name          text not null check (length(trim(name)) between 1 and 200),
  legal_name    text,
  owner_id      uuid not null references auth.users(id),
  email         text,
  alt_email     text,
  phone         text,
  alt_phone     text,
  website       text,
  address_line1 text,
  address_line2 text,
  city          text,
  state         text,
  country       text,
  postal_code   text,
  tax_registration_number      text,
  business_registration_number text,
  registration_extra jsonb not null default '[]'::jsonb,
  timezone      text not null default 'UTC',
  locale        text not null default 'en',
  date_format   text not null default 'yyyy-MM-dd',
  is_active     boolean not null default true,
  archived_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create trigger trg_businesses_updated_at before update on public.businesses
  for each row execute function public.set_updated_at();

create table public.roles (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid references public.businesses(id) on delete cascade,
  key         text not null,
  name        text not null,
  description text,
  is_system   boolean not null default false,
  permissions text[] not null default '{}',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique nulls not distinct (business_id, key)
);
create trigger trg_roles_updated_at before update on public.roles
  for each row execute function public.set_updated_at();

create table public.business_members (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  role_id     uuid not null references public.roles(id),
  status      member_status not null default 'active',
  invited_by  uuid references auth.users(id),
  invited_at  timestamptz,
  joined_at   timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (business_id, user_id)
);
create index on public.business_members (user_id);
create index on public.business_members (business_id, status);
create trigger trg_members_updated_at before update on public.business_members
  for each row execute function public.set_updated_at();

-- ===================================================== settings/brand ====
create table public.business_settings (
  business_id uuid primary key references public.businesses(id) on delete cascade,
  currency_code       text not null default 'USD',
  currency_name       text not null default 'US Dollar',
  currency_symbol     text not null default '$',
  decimal_places      smallint not null default 2 check (decimal_places between 0 and 4),
  symbol_position     text not null default 'before' check (symbol_position in ('before','after')),
  thousand_separator  text not null default ',',
  decimal_separator   text not null default '.',
  default_invoice_template_id   uuid,
  default_quotation_template_id uuid,
  default_tax_id      uuid,
  default_tax_mode    tax_mode not null default 'exclusive',
  default_payment_terms_days integer not null default 30,
  quotation_validity_days    integer not null default 30,
  default_quotation_notes text,
  default_invoice_notes   text,
  default_quotation_terms text,
  default_invoice_terms   text,
  include_notes_by_default boolean not null default true,
  include_terms_by_default boolean not null default true,
  default_footer text,
  default_payment_instructions text,
  page_size text not null default 'A4' check (page_size in ('A4','Letter')),
  bank_name text, bank_account_name text, bank_account_number text,
  bank_ifsc_swift text, bank_branch text, upi_id text, payment_qr_url text,
  show_payment_details_on_documents boolean not null default true,
  email_from_name text, email_reply_to text, email_enabled boolean not null default false,
  notify_on_payment boolean not null default true,
  notify_on_quotation_accept boolean not null default true,
  notify_on_overdue boolean not null default true,
  features jsonb not null default '{"inventory": false, "recurring": true, "reminders": true}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_settings_updated_at before update on public.business_settings
  for each row execute function public.set_updated_at();

create table public.business_branding (
  business_id     uuid primary key references public.businesses(id) on delete cascade,
  logo_path       text,
  favicon_path    text,
  primary_color   text not null default '#2563EB' check (primary_color ~ '^#[0-9A-Fa-f]{6}$'),
  secondary_color text not null default '#475569' check (secondary_color ~ '^#[0-9A-Fa-f]{6}$'),
  document_accent_color text check (document_accent_color is null or document_accent_color ~ '^#[0-9A-Fa-f]{6}$'),
  show_logo_on_documents boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_branding_updated_at before update on public.business_branding
  for each row execute function public.set_updated_at();

-- ========================================================== catalog ======
create table public.categories (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name        text not null,
  description text,
  applies_to  product_kind,
  is_active   boolean not null default true,
  archived_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (business_id, lower(name))
);
create trigger trg_categories_updated_at before update on public.categories
  for each row execute function public.set_updated_at();

create table public.units (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references public.businesses(id) on delete cascade,
  name         text not null,
  abbreviation text not null,
  is_active    boolean not null default true,
  archived_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (business_id, lower(abbreviation))
);
create trigger trg_units_updated_at before update on public.units
  for each row execute function public.set_updated_at();

create table public.taxes (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name        text not null,
  rate        numeric(9,4) not null default 0 check (rate >= 0 and rate <= 100),
  description text,
  is_active   boolean not null default true,
  archived_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (business_id, lower(name))
);
create trigger trg_taxes_updated_at before update on public.taxes
  for each row execute function public.set_updated_at();

create table public.tax_components (
  id          uuid primary key default gen_random_uuid(),
  tax_id      uuid not null references public.taxes(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  name        text not null,
  rate        numeric(9,4) not null check (rate >= 0 and rate <= 100),
  sort_order  integer not null default 0
);

create table public.products (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid not null references public.businesses(id) on delete cascade,
  kind          product_kind not null default 'product',
  name          text not null check (length(trim(name)) between 1 and 300),
  sku           text,
  description   text,
  category_id   uuid references public.categories(id) on delete set null,
  unit_id       uuid references public.units(id) on delete set null,
  cost_price    numeric(18,4) check (cost_price >= 0),
  selling_price numeric(18,4) not null default 0 check (selling_price >= 0),
  tax_id        uuid references public.taxes(id) on delete set null,
  notes         text,
  is_active     boolean not null default true,
  archived_at   timestamptz,
  track_inventory boolean not null default false,
  stock_quantity  numeric(18,4) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  unique (business_id, lower(sku)) where sku is not null
);
create index on public.products (business_id, kind, is_active);
create index on public.products using gin (
  to_tsvector('simple', coalesce(name,'') || ' ' || coalesce(sku,'') || ' ' || coalesce(description,''))
);
create trigger trg_products_updated_at before update on public.products
  for each row execute function public.set_updated_at();

-- ========================================================= customers =====
create table public.customers (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid not null references public.businesses(id) on delete cascade,
  code          text,
  name          text not null check (length(trim(name)) between 1 and 300),
  company_name  text,
  email         text,
  phone         text,
  alt_phone     text,
  website       text,
  address_line1 text,
  address_line2 text,
  city text, state text, country text, postal_code text,
  tax_id        text,
  currency_code text,
  payment_terms_days integer,
  notes         text,
  is_active     boolean not null default true,
  archived_at   timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  unique (business_id, lower(code)) where code is not null
);
create index on public.customers (business_id, is_active);
create index on public.customers using gin (
  to_tsvector('simple', coalesce(name,'') || ' ' || coalesce(company_name,'') ||
                        ' ' || coalesce(email,'') || ' ' || coalesce(phone,''))
);
create trigger trg_customers_updated_at before update on public.customers
  for each row execute function public.set_updated_at();

-- ========================================================= numbering =====
create table public.numbering_settings (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid not null references public.businesses(id) on delete cascade,
  document_type text not null check (document_type in ('quotation','invoice','payment')),
  prefix text not null default '', suffix text not null default '',
  separator text not null default '-',
  padding smallint not null default 5 check (padding between 1 and 12),
  start_number integer not null default 1 check (start_number >= 0),
  include_year boolean not null default false,
  include_month boolean not null default false,
  year_format text not null default 'yyyy' check (year_format in ('yyyy','yy')),
  reset_frequency numbering_reset not null default 'never',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, document_type)
);
create trigger trg_numbering_updated_at before update on public.numbering_settings
  for each row execute function public.set_updated_at();

create table public.numbering_sequences (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid not null references public.businesses(id) on delete cascade,
  document_type text not null,
  period_key    text not null,
  current_value integer not null default 0,
  updated_at    timestamptz not null default now(),
  unique (business_id, document_type, period_key)
);

create table public.document_templates (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid references public.businesses(id) on delete cascade,
  key          text not null,
  name         text not null,
  document_type text not null check (document_type in ('invoice','quotation')),
  description  text not null default '',
  is_system    boolean not null default true,
  created_at timestamptz not null default now()
);

-- ========================================================= quotations ====
create table public.quotations (
  id             uuid primary key default gen_random_uuid(),
  business_id    uuid not null references public.businesses(id) on delete cascade,
  customer_id    uuid not null references public.customers(id) on delete restrict,
  quotation_number text not null,
  status         quotation_status not null default 'draft',
  issue_date     date not null default current_date,
  valid_until    date,
  currency_code  text not null,
  currency_symbol text not null,
  tax_mode       tax_mode not null default 'exclusive',
  discount_type  discount_type,
  discount_value numeric(18,4) not null default 0 check (discount_value >= 0),
  subtotal numeric(18,4) not null default 0,
  item_discount_total numeric(18,4) not null default 0,
  document_discount_amount numeric(18,4) not null default 0,
  taxable_amount numeric(18,4) not null default 0,
  tax_total numeric(18,4) not null default 0,
  additional_charges_total numeric(18,4) not null default 0,
  grand_total numeric(18,4) not null default 0,
  tax_breakdown jsonb not null default '[]'::jsonb,
  template_id    uuid references public.document_templates(id) on delete set null,
  custom_notes         text,
  terms_and_conditions text,
  include_notes boolean not null default true,
  include_terms boolean not null default true,
  payment_instructions text,
  internal_notes text,
  reference      text,
  converted_invoice_id uuid,
  sent_at timestamptz, viewed_at timestamptz, accepted_at timestamptz,
  rejected_at timestamptz, converted_at timestamptz, cancelled_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id)
);
create unique index uq_quotations_number on public.quotations (business_id, quotation_number);
create index on public.quotations (business_id, status, issue_date desc);
create index on public.quotations (business_id, customer_id);
create trigger trg_quotations_updated_at before update on public.quotations
  for each row execute function public.set_updated_at();

create table public.quotation_items (
  id            uuid primary key default gen_random_uuid(),
  quotation_id  uuid not null references public.quotations(id) on delete cascade,
  business_id   uuid not null references public.businesses(id) on delete cascade,
  sort_order    integer not null default 0,
  source        item_source not null default 'catalog',
  product_id    uuid references public.products(id) on delete set null,
  name          text not null check (length(trim(name)) between 1 and 500),
  description   text, sku text,
  unit_name     text,
  unit_id       uuid references public.units(id) on delete set null,
  quantity      numeric(18,4) not null check (quantity > 0),
  unit_price    numeric(18,4) not null check (unit_price >= 0),
  discount_type   discount_type,
  discount_value  numeric(18,4) not null default 0 check (discount_value >= 0),
  discount_amount numeric(18,4) not null default 0,
  tax_id        uuid references public.taxes(id) on delete set null,
  tax_name      text,
  tax_rate      numeric(9,4) not null default 0,
  tax_breakdown jsonb not null default '[]'::jsonb,
  line_subtotal   numeric(18,4) not null default 0,
  taxable_amount  numeric(18,4) not null default 0,
  tax_amount      numeric(18,4) not null default 0,
  line_total      numeric(18,4) not null default 0,
  notes text,
  created_at timestamptz not null default now()
);
create index on public.quotation_items (quotation_id, sort_order);

create table public.quotation_charges (
  id           uuid primary key default gen_random_uuid(),
  quotation_id uuid not null references public.quotations(id) on delete cascade,
  business_id  uuid not null references public.businesses(id) on delete cascade,
  label text not null, amount numeric(18,4) not null,
  is_taxable boolean not null default false,
  tax_id uuid references public.taxes(id) on delete set null,
  tax_amount numeric(18,4) not null default 0,
  sort_order integer not null default 0
);

create table public.quotation_status_history (
  id           uuid primary key default gen_random_uuid(),
  quotation_id uuid not null references public.quotations(id) on delete cascade,
  business_id  uuid not null references public.businesses(id) on delete cascade,
  from_status  quotation_status, to_status quotation_status not null,
  note text, changed_by uuid references auth.users(id),
  changed_at timestamptz not null default now()
);

-- ========================================================== invoices =====
create table public.invoices (
  id             uuid primary key default gen_random_uuid(),
  business_id    uuid not null references public.businesses(id) on delete cascade,
  customer_id    uuid not null references public.customers(id) on delete restrict,
  quotation_id   uuid references public.quotations(id) on delete set null,
  invoice_number text not null,
  status         invoice_status not null default 'draft',
  payment_status payment_state not null default 'unpaid',
  issue_date     date not null default current_date,
  due_date       date,
  currency_code   text not null,
  currency_symbol text not null,
  tax_mode       tax_mode not null default 'exclusive',
  discount_type  discount_type,
  discount_value numeric(18,4) not null default 0 check (discount_value >= 0),
  subtotal numeric(18,4) not null default 0,
  item_discount_total numeric(18,4) not null default 0,
  document_discount_amount numeric(18,4) not null default 0,
  taxable_amount numeric(18,4) not null default 0,
  tax_total numeric(18,4) not null default 0,
  additional_charges_total numeric(18,4) not null default 0,
  grand_total numeric(18,4) not null default 0,
  amount_paid numeric(18,4) not null default 0,
  amount_due  numeric(18,4) not null default 0,
  tax_breakdown jsonb not null default '[]'::jsonb,
  template_id    uuid references public.document_templates(id) on delete set null,
  custom_notes         text,
  terms_and_conditions text,
  include_notes boolean not null default true,
  include_terms boolean not null default true,
  payment_instructions text,
  internal_notes text,
  reference      text,
  sent_at timestamptz, viewed_at timestamptz, paid_at timestamptz,
  cancelled_at timestamptz, cancel_reason text, voided_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  check (amount_paid >= 0), check (grand_total >= 0)
);
create unique index uq_invoices_number on public.invoices (business_id, invoice_number);
create index on public.invoices (business_id, status, issue_date desc);
create index on public.invoices (business_id, payment_status);
create index on public.invoices (business_id, customer_id);
create index on public.invoices (business_id, due_date)
  where payment_status in ('unpaid','partially_paid');
create trigger trg_invoices_updated_at before update on public.invoices
  for each row execute function public.set_updated_at();

create table public.invoice_items (
  id            uuid primary key default gen_random_uuid(),
  invoice_id    uuid not null references public.invoices(id) on delete cascade,
  business_id   uuid not null references public.businesses(id) on delete cascade,
  sort_order    integer not null default 0,
  source        item_source not null default 'catalog',
  product_id    uuid references public.products(id) on delete set null,
  name          text not null check (length(trim(name)) between 1 and 500),
  description   text, sku text,
  unit_name     text,
  unit_id       uuid references public.units(id) on delete set null,
  quantity      numeric(18,4) not null check (quantity > 0),
  unit_price    numeric(18,4) not null check (unit_price >= 0),
  discount_type   discount_type,
  discount_value  numeric(18,4) not null default 0 check (discount_value >= 0),
  discount_amount numeric(18,4) not null default 0,
  tax_id        uuid references public.taxes(id) on delete set null,
  tax_name      text,
  tax_rate      numeric(9,4) not null default 0,
  tax_breakdown jsonb not null default '[]'::jsonb,
  line_subtotal   numeric(18,4) not null default 0,
  taxable_amount  numeric(18,4) not null default 0,
  tax_amount      numeric(18,4) not null default 0,
  line_total      numeric(18,4) not null default 0,
  notes text,
  created_at timestamptz not null default now()
);
create index on public.invoice_items (invoice_id, sort_order);

create table public.invoice_charges (
  id         uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  label text not null, amount numeric(18,4) not null,
  is_taxable boolean not null default false,
  tax_id uuid references public.taxes(id) on delete set null,
  tax_amount numeric(18,4) not null default 0,
  sort_order integer not null default 0
);

create table public.invoice_status_history (
  id          uuid primary key default gen_random_uuid(),
  invoice_id  uuid not null references public.invoices(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  from_status invoice_status, to_status invoice_status not null,
  note text, changed_by uuid references auth.users(id),
  changed_at timestamptz not null default now()
);

-- ========================================================== payments =====
create table public.payment_methods (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null, description text,
  requires_reference boolean not null default false,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, lower(name))
);
create trigger trg_payment_methods_updated_at before update on public.payment_methods
  for each row execute function public.set_updated_at();

create table public.payments (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid not null references public.businesses(id) on delete cascade,
  invoice_id    uuid not null references public.invoices(id) on delete restrict,
  customer_id   uuid not null references public.customers(id) on delete restrict,
  amount        numeric(18,4) not null check (amount > 0),
  payment_date  date not null default current_date,
  payment_method_id uuid references public.payment_methods(id) on delete set null,
  payment_method_name text,
  reference_number text,
  notes text,
  currency_code text not null,
  is_voided boolean not null default false,
  voided_at timestamptz, void_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);
create index on public.payments (business_id, payment_date desc);
create index on public.payments (invoice_id) where is_voided = false;
create index on public.payments (business_id, customer_id);
create trigger trg_payments_updated_at before update on public.payments
  for each row execute function public.set_updated_at();

-- ========================================================= audit log =====
create table public.audit_logs (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid references public.businesses(id) on delete cascade,
  user_id     uuid references auth.users(id) on delete set null,
  user_email  text,
  action      text not null,
  entity_type text, entity_id uuid, entity_label text,
  metadata    jsonb not null default '{}'::jsonb,
  ip_address  inet,
  created_at  timestamptz not null default now()
);
create index on public.audit_logs (business_id, created_at desc);
create index on public.audit_logs (business_id, entity_type, entity_id, created_at desc);

-- =================================================== RLS: helpers ========
create or replace function public.is_business_member(p_business_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.business_members m
    where m.business_id = p_business_id and m.user_id = auth.uid() and m.status = 'active'
  );
$$;

create or replace function public.has_permission(p_business_id uuid, p_permission text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.business_members m
    join public.roles r on r.id = m.role_id
    where m.business_id = p_business_id and m.user_id = auth.uid() and m.status = 'active'
      and p_permission = any(r.permissions)
  );
$$;

revoke execute on function public.is_business_member(uuid) from public;
grant  execute on function public.is_business_member(uuid) to authenticated;
revoke execute on function public.has_permission(uuid, text) from public;
grant  execute on function public.has_permission(uuid, text) to authenticated;

-- ============================================== RLS: standard policies ===
-- Applied identically to every tenant table: read = membership, write =
-- permission. The backend uses the service role and additionally filters by
-- business_id in every query (defense in depth, docs/04 §2 and ADR-002).
do $$
declare
  t record;
  tables text[] := array[
    'categories','units','taxes','products','customers',
    'numbering_settings','quotations','quotation_items','quotation_charges',
    'invoices','invoice_items','invoice_charges',
    'payment_methods','payments'
  ];
  modules text[] := array[
    'catalog','catalog','tax','product','customer',
    'settings','quotation','quotation','quotation',
    'invoice','invoice','invoice',
    'settings','payment'
  ];
begin
  for i in 1 .. array_length(tables, 1) loop
    execute format('alter table public.%I enable row level security', tables[i]);
    execute format('alter table public.%I force row level security', tables[i]);
    execute format(
      'create policy "%1$s_select" on public.%1$s for select to authenticated using (public.is_business_member(business_id))',
      tables[i]);
    execute format(
      'create policy "%1$s_insert" on public.%1$s for insert to authenticated with check (public.has_permission(business_id, %2$L))',
      tables[i], modules[i] || '.create');
    execute format(
      'create policy "%1$s_update" on public.%1$s for update to authenticated using (public.has_permission(business_id, %2$L)) with check (public.has_permission(business_id, %2$L))',
      tables[i], modules[i] || '.update');
    execute format(
      'create policy "%1$s_delete" on public.%1$s for delete to authenticated using (public.has_permission(business_id, %2$L))',
      tables[i], modules[i] || '.delete');
  end loop;
end $$;

-- businesses
alter table public.businesses enable row level security;
create policy "business_select" on public.businesses for select to authenticated
  using (public.is_business_member(id));
create policy "business_insert" on public.businesses for insert to authenticated
  with check (owner_id = auth.uid());
create policy "business_update" on public.businesses for update to authenticated
  using (public.has_permission(id, 'business.update'))
  with check (public.has_permission(id, 'business.update'));

-- business_members
alter table public.business_members enable row level security;
create policy "members_select" on public.business_members for select to authenticated
  using (public.is_business_member(business_id));
create policy "members_write" on public.business_members for all to authenticated
  using (public.has_permission(business_id, 'user.manage'))
  with check (public.has_permission(business_id, 'user.manage'));

-- roles
alter table public.roles enable row level security;
create policy "roles_select" on public.roles for select to authenticated
  using (business_id is null or public.is_business_member(business_id));
create policy "roles_write" on public.roles for all to authenticated
  using (business_id is not null and public.has_permission(business_id, 'role.manage') and is_system = false)
  with check (business_id is not null and public.has_permission(business_id, 'role.manage') and is_system = false);

-- settings/branding: select on membership, write on settings.update
alter table public.business_settings enable row level security;
create policy "settings_select" on public.business_settings for select to authenticated
  using (public.is_business_member(business_id));
create policy "settings_write" on public.business_settings for all to authenticated
  using (public.has_permission(business_id, 'settings.update'))
  with check (public.has_permission(business_id, 'settings.update'));

alter table public.business_branding enable row level security;
create policy "branding_select" on public.business_branding for select to authenticated
  using (public.is_business_member(business_id));
create policy "branding_write" on public.business_branding for all to authenticated
  using (public.has_permission(business_id, 'settings.update'))
  with check (public.has_permission(business_id, 'settings.update'));

-- child rows (items/charges/history) follow their parent document's permission
alter table public.quotation_status_history enable row level security;
alter table public.quotation_status_history force row level security;
create policy "qsh_select" on public.quotation_status_history for select to authenticated
  using (public.is_business_member(business_id));
create policy "qsh_insert" on public.quotation_status_history for insert to authenticated
  with check (public.has_permission(business_id, 'quotation.update'));

alter table public.invoice_status_history enable row level security;
alter table public.invoice_status_history force row level security;
create policy "ish_select" on public.invoice_status_history for select to authenticated
  using (public.is_business_member(business_id));
create policy "ish_insert" on public.invoice_status_history for insert to authenticated
  with check (public.has_permission(business_id, 'invoice.update'));

-- numbering_sequences: no policy for `authenticated` at all -> service role only
alter table public.numbering_sequences enable row level security;
alter table public.numbering_sequences force row level security;

-- document_templates: system templates (business_id null) readable by all members
alter table public.document_templates enable row level security;
create policy "templates_select" on public.document_templates for select to authenticated
  using (business_id is null or public.is_business_member(business_id));

-- audit_logs: insert-only from the service role, readable with audit.read
alter table public.audit_logs enable row level security;
alter table public.audit_logs force row level security;
create policy "audit_select" on public.audit_logs for select to authenticated
  using (public.has_permission(business_id, 'audit.read'));

-- user_profiles: self, plus co-members can read basic profile
alter table public.user_profiles enable row level security;
create policy "profile_self_select" on public.user_profiles for select to authenticated
  using (id = auth.uid() or exists (
    select 1 from public.business_members a
    join public.business_members b on a.business_id = b.business_id
    where a.user_id = auth.uid() and a.status = 'active' and b.user_id = user_profiles.id));
create policy "profile_self_update" on public.user_profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- financial-document delete guard: only drafts may be deleted. Replaces the
-- generic delete policy the loop above created with a status-checked one.
drop policy "quotations_delete" on public.quotations;
create policy "quotations_delete" on public.quotations for delete to authenticated
  using (public.has_permission(business_id, 'quotation.delete') and status = 'draft');

drop policy "invoices_delete" on public.invoices;
create policy "invoices_delete" on public.invoices for delete to authenticated
  using (public.has_permission(business_id, 'invoice.delete') and status = 'draft');

-- payments are voided, never deleted, by any role: drop the generic delete
-- policy the loop created and add none back, so `delete` is refused outright.
drop policy "payments_delete" on public.payments;

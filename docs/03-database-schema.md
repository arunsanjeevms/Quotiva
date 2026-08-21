# 03 — Database Schema

Target: Supabase Postgres. This document is the normative schema; Phase 1 lifts it verbatim into
`supabase/migrations/`. RLS policies are specified separately in `04-rls-and-security.md`.

## Conventions

- **Primary keys** — `uuid primary key default gen_random_uuid()`.
- **Tenancy** — every business-owned table carries
  `business_id uuid not null references businesses(id) on delete cascade`.
- **Timestamps** — `created_at timestamptz not null default now()`,
  `updated_at timestamptz not null default now()` maintained by a shared trigger.
- **Actor columns** — `created_by uuid references auth.users(id)`, `updated_by` where useful.
- **Soft state** — no hard deletes on financial documents. `archived_at timestamptz` on master data;
  status enums on documents.
- **Money** — `numeric(18,4)`. **Never** `float`, `real`, or `double precision`.
- **Quantity** — `numeric(18,4)` (supports 0.25 hours, 1.5 kg).
- **Rates** — `numeric(9,4)` (a percentage: `18.0000` means 18%).
- **Text** — `text` throughout; length limits enforced by Zod + `check` constraints where they
  matter, not by `varchar(n)` guesses.
- **Enums** — Postgres enum types for closed sets; lookup *tables* for anything a business may edit.

### Shared trigger

```sql
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- applied per table:
create trigger trg_<table>_updated_at
  before update on public.<table>
  for each row execute function public.set_updated_at();
```

### Enum types

```sql
create type quotation_status as enum
  ('draft','sent','viewed','accepted','rejected','expired','cancelled','converted');

create type invoice_status as enum
  ('draft','sent','viewed','cancelled','void');

create type payment_state as enum
  ('unpaid','partially_paid','paid','overdue');   -- derived, stored denormalised

create type discount_type as enum ('percentage','fixed');

create type tax_mode as enum ('exclusive','inclusive','none');

create type item_source as enum ('catalog','custom');

create type product_kind as enum ('product','service');

create type custom_field_type as enum
  ('text','number','date','dropdown','checkbox','email','phone');

create type custom_field_entity as enum
  ('customer','product','quotation','invoice','business');

create type numbering_reset as enum ('never','yearly','monthly','daily');

create type recurrence_frequency as enum
  ('daily','weekly','monthly','quarterly','yearly','custom');

create type member_status as enum ('active','invited','suspended');
```

`product_kind` distinguishes products from services on one table — they share every field, so
splitting them into two tables would duplicate the catalog for no gain. The sidebar renders two
filtered views over the same table.

---

## Rounding rule (normative, referenced everywhere)

Money is stored at 4 decimal places and **rounded half-up to the business's configured display
decimals** (`currency_settings.decimal_places`, default 2) at exactly two boundaries:

1. after computing each **item total**, and
2. after computing each **document total component** (subtotal, discount, tax per rate, charges,
   grand total).

Intermediate values (line subtotal, taxable amount, per-component tax) are carried at full 4dp
precision. Document totals are the sum of *rounded* item totals, so the printed line items always
add up to the printed subtotal. Full derivation and worked examples: `06-calculation-engine.md`.

---

## 1. Identity & tenancy

```sql
create table public.user_profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  full_name    text,
  email        text not null,
  phone        text,
  avatar_url   text,
  last_login_at timestamptz,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
-- Row created by an after-insert trigger on auth.users.

create table public.businesses (
  id            uuid primary key default gen_random_uuid(),
  name          text not null check (length(trim(name)) between 1 and 200),
  slug          text unique,
  owner_id      uuid not null references auth.users(id),
  legal_name    text,
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
  tax_registration_number     text,   -- generic: VAT no., GSTIN, ABN, EIN…
  business_registration_number text,
  registration_extra jsonb not null default '{}'::jsonb,  -- additional labelled reg. IDs
  timezone      text not null default 'UTC',
  locale        text not null default 'en',
  date_format   text not null default 'yyyy-MM-dd',
  is_active     boolean not null default true,
  archived_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
```

None of the address or registration fields are required. `registration_extra` holds
`[{label, value}]` pairs so a business in any jurisdiction can record whatever identifiers it needs
without a migration.

```sql
create table public.roles (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid references public.businesses(id) on delete cascade, -- null = system template
  key           text not null,            -- 'super_admin' | 'administrator' | 'staff' | custom
  name          text not null,
  description   text,
  is_system     boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique nulls not distinct (business_id, key)
);

create table public.permissions (
  key         text primary key,           -- 'invoice.create', 'settings.manage', …
  module      text not null,
  description text not null
);

create table public.role_permissions (
  role_id        uuid not null references public.roles(id) on delete cascade,
  permission_key text not null references public.permissions(key) on delete cascade,
  primary key (role_id, permission_key)
);

create table public.business_members (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references public.businesses(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  role_id      uuid not null references public.roles(id),
  status       member_status not null default 'active',
  invited_by   uuid references auth.users(id),
  invited_at   timestamptz,
  joined_at    timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (business_id, user_id)
);
create index on public.business_members (user_id);
create index on public.business_members (business_id, status);
```

`business_members` is the join that every RLS policy pivots on.

---

## 2. Settings & branding

```sql
create table public.business_settings (
  business_id uuid primary key references public.businesses(id) on delete cascade,

  -- currency
  currency_code       text not null default 'USD',
  currency_name       text not null default 'US Dollar',
  currency_symbol     text not null default '$',
  decimal_places      smallint not null default 2 check (decimal_places between 0 and 4),
  symbol_position     text not null default 'before' check (symbol_position in ('before','after')),
  thousand_separator  text not null default ',',
  decimal_separator   text not null default '.',

  -- document defaults
  default_invoice_template_id   uuid,
  default_quotation_template_id uuid,
  default_tax_id                uuid,
  default_tax_mode              tax_mode not null default 'exclusive',
  default_payment_terms_days    integer not null default 30,
  quotation_validity_days       integer not null default 30,

  -- Four independent rich-text defaults. See 12-notes-and-terms.md.
  -- Stored as sanitized HTML; never rendered without passing the sanitizer.
  default_quotation_notes       text,
  default_invoice_notes         text,
  default_quotation_terms       text,
  default_invoice_terms         text,
  include_notes_by_default      boolean not null default true,
  include_terms_by_default      boolean not null default true,

  default_footer                text,
  default_payment_instructions  text,
  page_size                     text not null default 'A4' check (page_size in ('A4','Letter')),

  -- payment / bank details, all optional
  bank_name        text,
  bank_account_name text,
  bank_account_number text,
  bank_ifsc_swift  text,
  bank_branch      text,
  upi_id           text,
  payment_qr_url   text,
  show_payment_details_on_documents boolean not null default true,

  -- email
  email_from_name  text,
  email_reply_to   text,
  email_enabled    boolean not null default false,

  -- notifications & reminders
  notify_on_payment          boolean not null default true,
  notify_on_quotation_accept boolean not null default true,
  notify_on_overdue          boolean not null default true,

  -- feature flags (extension seam; UI does not read unimplemented keys)
  features jsonb not null default '{"inventory": false, "recurring": true, "reminders": true}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

The defaults above exist so the row is insertable; they are **not** an assertion that USD is
correct. Onboarding asks the admin to confirm currency before the first document is created.

```sql
create table public.business_branding (
  business_id     uuid primary key references public.businesses(id) on delete cascade,
  logo_path       text,          -- storage object path, not a URL
  favicon_path    text,
  primary_color   text not null default '#2563EB' check (primary_color ~ '^#[0-9A-Fa-f]{6}$'),
  secondary_color text not null default '#475569' check (secondary_color ~ '^#[0-9A-Fa-f]{6}$'),
  document_accent_color text,
  show_logo_on_documents boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

Storage **paths** are stored, never URLs — signed URLs are minted per request so bucket privacy and
expiry stay under our control.

---

## 3. Catalog

```sql
create table public.categories (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name        text not null,
  description text,
  applies_to  product_kind,        -- null = both products and services
  is_active   boolean not null default true,
  archived_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (business_id, lower(name))
);

create table public.units (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references public.businesses(id) on delete cascade,
  name         text not null,        -- 'Hour', 'Kilogram', anything
  abbreviation text not null,        -- 'hr', 'kg'
  is_active    boolean not null default true,
  archived_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (business_id, lower(abbreviation))
);

create table public.taxes (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name        text not null,             -- admin-chosen label
  rate        numeric(9,4) not null default 0 check (rate >= 0 and rate <= 100),
  description text,
  is_compound boolean not null default false,
  is_active   boolean not null default true,
  archived_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (business_id, lower(name))
);

-- Multi-component taxes: a tax may be composed of sub-rates that print separately.
create table public.tax_components (
  id         uuid primary key default gen_random_uuid(),
  tax_id     uuid not null references public.taxes(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  name       text not null,
  rate       numeric(9,4) not null check (rate >= 0 and rate <= 100),
  sort_order integer not null default 0
);
```

A tax with no components is a single-rate tax using `taxes.rate`. A tax with components has
`taxes.rate` equal to the sum of component rates (maintained by the service layer and asserted by a
check in the calculation engine). This lets a business model a split tax without the schema knowing
what the split means.

```sql
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
  tax_mode      tax_mode,                -- null = inherit business default
  notes         text,
  is_active     boolean not null default true,
  archived_at   timestamptz,
  -- inventory seam: unused until features.inventory is enabled
  track_inventory boolean not null default false,
  stock_quantity  numeric(18,4) not null default 0,
  low_stock_threshold numeric(18,4),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  unique (business_id, lower(sku)) where sku is not null
);
create index on public.products (business_id, kind, is_active);
create index on public.products (business_id, category_id);
```

---

## 4. Customers

```sql
create table public.customers (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid not null references public.businesses(id) on delete cascade,
  code          text,                -- human-facing customer id, optional, unique per business
  name          text not null check (length(trim(name)) between 1 and 300),
  company_name  text,
  email         text,
  phone         text,
  alt_phone     text,
  website       text,
  address_line1 text,
  address_line2 text,
  city          text,
  state         text,
  country       text,
  postal_code   text,
  tax_id        text,
  currency_code text,                -- null = business default
  payment_terms_days integer,        -- null = business default
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
```

Archived customers stay visible on their historical documents; they are excluded from the customer
picker on new documents.

---

## 5. Numbering

```sql
create table public.numbering_settings (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid not null references public.businesses(id) on delete cascade,
  document_type text not null check (document_type in ('quotation','invoice','payment','recurring')),
  prefix        text not null default '',
  suffix        text not null default '',
  separator     text not null default '-',
  padding       smallint not null default 5 check (padding between 1 and 12),
  start_number  integer not null default 1 check (start_number >= 0),
  include_year  boolean not null default false,
  include_month boolean not null default false,
  year_format   text not null default 'yyyy' check (year_format in ('yyyy','yy')),
  reset_frequency numbering_reset not null default 'never',
  format        text not null default '{prefix}{sep}{number}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, document_type)
);

create table public.numbering_sequences (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid not null references public.businesses(id) on delete cascade,
  document_type text not null,
  period_key    text not null,       -- 'ALL' | '2026' | '2026-08' | '2026-08-21'
  current_value integer not null default 0,
  updated_at    timestamptz not null default now(),
  unique (business_id, document_type, period_key)
);
```

`format` is a token string the admin edits; supported tokens are `{prefix}`, `{suffix}`, `{sep}`,
`{year}`, `{month}`, `{number}`. Examples the admin can build with no code change:

```
{prefix}{sep}{number}                     → QUO-00001
{prefix}{sep}{year}{sep}{number}          → QUOTE-2026-00001
{prefix}{sep}{year}{sep}{month}{sep}{number} → Q-2026-08-0001
{year}{sep}{prefix}{sep}{number}          → 2026-INV-00001
```

### Race-safe allocation

Allocation happens inside the same transaction as the document insert:

```sql
-- 1. atomically claim the next value (row lock via UPDATE)
insert into public.numbering_sequences (business_id, document_type, period_key, current_value)
values ($1, $2, $3, greatest($4, 1))          -- $4 = start_number
on conflict (business_id, document_type, period_key)
do update set current_value = public.numbering_sequences.current_value + 1,
              updated_at = now()
returning current_value;
```

`on conflict do update` takes a row-level lock, so two concurrent transactions serialise and can
never receive the same value. The formatted string is then built in the service layer and inserted
with the document. The unique index below is the final guarantee:

```sql
create unique index uq_invoices_number   on public.invoices   (business_id, invoice_number);
create unique index uq_quotations_number on public.quotations (business_id, quotation_number);
```

If the insert still hits a unique violation (e.g. an admin manually created that number), the
service retries the allocation up to 3 times, then fails with `NUMBER_ALLOCATION_FAILED`.

`period_key` is derived from `reset_frequency` at allocation time, so changing reset frequency
starts a fresh counter rather than corrupting the old one.

---

## 6. Quotations

```sql
create table public.quotations (
  id             uuid primary key default gen_random_uuid(),
  business_id    uuid not null references public.businesses(id) on delete cascade,
  branch_id      uuid,                       -- reserved
  customer_id    uuid not null references public.customers(id) on delete restrict,
  quotation_number text not null,
  status         quotation_status not null default 'draft',
  issue_date     date not null default current_date,
  valid_until    date,

  currency_code  text not null,
  currency_symbol text not null,
  exchange_rate  numeric(18,8) not null default 1,

  tax_mode       tax_mode not null default 'exclusive',
  discount_type  discount_type,
  discount_value numeric(18,4) not null default 0 check (discount_value >= 0),

  subtotal          numeric(18,4) not null default 0,
  item_discount_total numeric(18,4) not null default 0,
  document_discount_amount numeric(18,4) not null default 0,
  taxable_amount    numeric(18,4) not null default 0,
  tax_total         numeric(18,4) not null default 0,
  additional_charges_total numeric(18,4) not null default 0,
  grand_total       numeric(18,4) not null default 0,

  template_id    uuid references public.document_templates(id) on delete set null,

  -- Snapshot of notes/terms at save time. Independent fields, sanitized HTML.
  -- Never re-read from business_settings when rendering. See 12-notes-and-terms.md.
  custom_notes         text,
  terms_and_conditions text,
  include_notes        boolean not null default true,
  include_terms        boolean not null default true,

  payment_instructions text,
  internal_notes text,

  reference      text,
  public_token   uuid,                      -- reserved for public links
  public_enabled boolean not null default false,

  sent_at        timestamptz,
  viewed_at      timestamptz,
  accepted_at    timestamptz,
  rejected_at    timestamptz,
  converted_at   timestamptz,
  cancelled_at   timestamptz,
  archived_at    timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id)
);
create index on public.quotations (business_id, status, issue_date desc);
create index on public.quotations (business_id, customer_id);
create index on public.quotations (business_id, valid_until) where status in ('sent','viewed');
```

Currency symbol and code are **copied onto the document** so a later settings change does not
retroactively rewrite historical documents. The same applies to the item snapshot fields below.

```sql
create table public.quotation_items (
  id            uuid primary key default gen_random_uuid(),
  quotation_id  uuid not null references public.quotations(id) on delete cascade,
  business_id   uuid not null references public.businesses(id) on delete cascade,
  sort_order    integer not null default 0,

  source        item_source not null default 'catalog',
  product_id    uuid references public.products(id) on delete set null,

  -- snapshot: valid even if the product is later renamed, repriced or archived
  name          text not null check (length(trim(name)) between 1 and 500),
  description   text,
  sku           text,
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
  tax_breakdown jsonb not null default '[]'::jsonb,  -- [{name, rate, amount}] for components

  line_subtotal   numeric(18,4) not null default 0,
  taxable_amount  numeric(18,4) not null default 0,
  tax_amount      numeric(18,4) not null default 0,
  line_total      numeric(18,4) not null default 0,

  notes text,
  created_at timestamptz not null default now()
);
create index on public.quotation_items (quotation_id, sort_order);
```

`source = 'custom'` with `product_id is null` is the **mandatory custom line item**: a free-text
item that requires no catalog record. Every other column behaves identically, so the calculation
engine has one code path.

```sql
create table public.quotation_charges (
  id           uuid primary key default gen_random_uuid(),
  quotation_id uuid not null references public.quotations(id) on delete cascade,
  business_id  uuid not null references public.businesses(id) on delete cascade,
  label        text not null,           -- 'Shipping', 'Installation', anything
  amount       numeric(18,4) not null,
  is_taxable   boolean not null default false,
  tax_id       uuid references public.taxes(id) on delete set null,
  tax_amount   numeric(18,4) not null default 0,
  sort_order   integer not null default 0
);

create table public.quotation_status_history (
  id           uuid primary key default gen_random_uuid(),
  quotation_id uuid not null references public.quotations(id) on delete cascade,
  business_id  uuid not null references public.businesses(id) on delete cascade,
  from_status  quotation_status,
  to_status    quotation_status not null,
  note         text,
  changed_by   uuid references auth.users(id),
  changed_at   timestamptz not null default now()
);
create index on public.quotation_status_history (quotation_id, changed_at desc);
```

---

## 7. Invoices

Structurally parallel to quotations. Differences are the date fields, the payment columns, and the
quotation link.

```sql
create table public.invoices (
  id             uuid primary key default gen_random_uuid(),
  business_id    uuid not null references public.businesses(id) on delete cascade,
  branch_id      uuid,
  customer_id    uuid not null references public.customers(id) on delete restrict,
  quotation_id   uuid references public.quotations(id) on delete set null,
  invoice_number text not null,
  status         invoice_status not null default 'draft',
  payment_status payment_state not null default 'unpaid',   -- server-derived, never client-set

  issue_date     date not null default current_date,
  due_date       date,

  currency_code   text not null,
  currency_symbol text not null,
  exchange_rate   numeric(18,8) not null default 1,

  tax_mode       tax_mode not null default 'exclusive',
  discount_type  discount_type,
  discount_value numeric(18,4) not null default 0 check (discount_value >= 0),

  subtotal                 numeric(18,4) not null default 0,
  item_discount_total      numeric(18,4) not null default 0,
  document_discount_amount numeric(18,4) not null default 0,
  taxable_amount           numeric(18,4) not null default 0,
  tax_total                numeric(18,4) not null default 0,
  additional_charges_total numeric(18,4) not null default 0,
  grand_total              numeric(18,4) not null default 0,
  amount_paid              numeric(18,4) not null default 0,
  amount_due               numeric(18,4) not null default 0,

  template_id    uuid references public.document_templates(id) on delete set null,

  -- Snapshot; see 12-notes-and-terms.md
  custom_notes         text,
  terms_and_conditions text,
  include_notes        boolean not null default true,
  include_terms        boolean not null default true,

  payment_instructions text,
  internal_notes text,
  reference      text,

  recurring_invoice_id uuid references public.recurring_invoices(id) on delete set null,
  public_token   uuid,
  public_enabled boolean not null default false,

  sent_at      timestamptz,
  viewed_at    timestamptz,
  paid_at      timestamptz,
  cancelled_at timestamptz,
  cancel_reason text,
  voided_at    timestamptz,
  archived_at  timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),

  check (amount_paid >= 0),
  check (grand_total >= 0)
);
create index on public.invoices (business_id, status, issue_date desc);
create index on public.invoices (business_id, payment_status);
create index on public.invoices (business_id, customer_id);
create index on public.invoices (business_id, due_date)
  where payment_status in ('unpaid','partially_paid');
create index on public.invoices (business_id, quotation_id);
```

`amount_paid`, `amount_due` and `payment_status` are **denormalised caches**, recomputed by the
service layer inside the same transaction as any payment insert/update/delete, and by the overdue
sweep. They exist so list and dashboard queries do not aggregate payments on every read. They are
never accepted from a request body.

```sql
create table public.invoice_items ( … identical shape to quotation_items,
  invoice_id uuid not null references public.invoices(id) on delete cascade, … );

create table public.invoice_charges ( … identical shape to quotation_charges … );

create table public.invoice_status_history (
  id          uuid primary key default gen_random_uuid(),
  invoice_id  uuid not null references public.invoices(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  from_status invoice_status,
  to_status   invoice_status not null,
  note        text,
  changed_by  uuid references auth.users(id),
  changed_at  timestamptz not null default now()
);
```

---

## 8. Payments

```sql
create table public.payment_methods (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name        text not null,           -- entirely admin-defined
  description text,
  requires_reference boolean not null default false,
  is_active   boolean not null default true,
  sort_order  integer not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, lower(name))
);

create table public.payments (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid not null references public.businesses(id) on delete cascade,
  invoice_id    uuid not null references public.invoices(id) on delete restrict,
  customer_id   uuid not null references public.customers(id) on delete restrict,
  payment_number text,
  amount        numeric(18,4) not null check (amount > 0),
  payment_date  date not null default current_date,
  payment_method_id uuid references public.payment_methods(id) on delete set null,
  payment_method_name text,          -- snapshot
  reference_number text,
  notes         text,
  currency_code text not null,
  is_voided     boolean not null default false,
  voided_at     timestamptz,
  void_reason   text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);
create index on public.payments (business_id, payment_date desc);
create index on public.payments (invoice_id) where is_voided = false;
create index on public.payments (business_id, customer_id);
```

Payments are voided, never deleted, so a receipt already sent to a customer remains explicable.
Over-payment is rejected by the service layer (`amount <= invoice.amount_due`) rather than a DB
constraint, because the rule needs the sum of sibling rows.

---

## 9. Recurring invoices

```sql
create table public.recurring_invoices (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid not null references public.businesses(id) on delete cascade,
  customer_id   uuid not null references public.customers(id) on delete restrict,
  title         text not null,
  frequency     recurrence_frequency not null,
  interval_count integer not null default 1 check (interval_count > 0),
  start_date    date not null,
  end_date      date,
  max_occurrences integer check (max_occurrences > 0),
  occurrences_generated integer not null default 0,
  next_run_date date,
  last_run_date date,
  payment_terms_days integer,
  auto_send     boolean not null default false,
  is_active     boolean not null default true,
  -- document defaults copied onto each generated invoice
  currency_code text not null,
  tax_mode      tax_mode not null default 'exclusive',
  discount_type discount_type,
  discount_value numeric(18,4) not null default 0,
  custom_notes text, terms_and_conditions text,
  include_notes boolean not null default true,
  include_terms boolean not null default true,
  payment_instructions text,
  template_id uuid references public.document_templates(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);
create index on public.recurring_invoices (business_id, is_active, next_run_date);

create table public.recurring_invoice_items ( … same shape as invoice_items,
  recurring_invoice_id uuid not null references public.recurring_invoices(id) on delete cascade, … );
```

Generation is a service function (`recurringService.generateDue(businessId, asOf)`) invoked manually
from the UI in this build. `next_run_date` and the idempotency key
`unique (recurring_invoice_id, occurrence_index)` on generated invoices make it safe to attach a
scheduler later without redesign.

---

## 10. Reminders

Kept structurally independent of the invoice module.

```sql
create table public.reminder_rules (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name        text not null,
  trigger     text not null check (trigger in ('before_due','on_due','after_due')),
  offset_days integer not null default 0 check (offset_days >= 0),
  email_template_id uuid references public.email_templates(id) on delete set null,
  is_active   boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.reminder_logs (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  invoice_id  uuid not null references public.invoices(id) on delete cascade,
  rule_id     uuid references public.reminder_rules(id) on delete set null,
  channel     text not null default 'email',
  status      text not null check (status in ('sent','failed','skipped')),
  error       text,
  sent_at     timestamptz not null default now(),
  unique (invoice_id, rule_id, (sent_at::date))
);
```

---

## 11. Templates

```sql
create table public.document_templates (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid references public.businesses(id) on delete cascade,  -- null = system template
  key          text not null,    -- 'classic','modern','minimal','professional','compact'
  name         text not null,
  document_type text not null check (document_type in ('invoice','quotation','statement','receipt')),
  is_system    boolean not null default false,
  options      jsonb not null default '{}'::jsonb,  -- per-business overrides: accent, density…
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.email_templates (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid not null references public.businesses(id) on delete cascade,
  key           text not null,   -- 'quotation_send','invoice_send','payment_receipt','reminder_*'
  name          text not null,
  subject       text not null,
  body_html     text not null,
  body_text     text,
  is_active     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, key)
);
```

Template *markup* lives in the backend repo (`backend/src/templates/documents/<key>/`); the table
records availability and per-business options only.

---

## 12. Custom fields (EAV)

```sql
create table public.custom_field_definitions (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references public.businesses(id) on delete cascade,
  entity_type  custom_field_entity not null,
  key          text not null check (key ~ '^[a-z][a-z0-9_]{0,49}$'),
  label        text not null,
  field_type   custom_field_type not null,
  options      jsonb not null default '[]'::jsonb,   -- dropdown choices
  is_required  boolean not null default false,
  show_on_document boolean not null default false,
  sort_order   integer not null default 0,
  is_active    boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, entity_type, key)
);
```

One value table per entity, all the same shape:

```sql
create table public.customer_custom_fields (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references public.businesses(id) on delete cascade,
  definition_id uuid not null references public.custom_field_definitions(id) on delete cascade,
  customer_id  uuid not null references public.customers(id) on delete cascade,
  value_text   text,
  value_number numeric(18,4),
  value_date   date,
  value_bool   boolean,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (definition_id, customer_id)
);
-- identical: product_custom_fields, quotation_custom_fields, invoice_custom_fields,
--            business_custom_fields
```

Typed columns rather than a single `text` value so numeric and date custom fields can be filtered
and sorted in SQL. The service layer maps `field_type → column`.

---

## 13. Attachments, notifications, audit

```sql
create table public.attachments (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  entity_type text not null,      -- 'invoice','quotation','customer','payment'
  entity_id   uuid not null,
  bucket      text not null,
  path        text not null,
  file_name   text not null,
  mime_type   text not null,
  size_bytes  bigint not null check (size_bytes > 0),
  uploaded_by uuid references auth.users(id),
  created_at  timestamptz not null default now()
);
create index on public.attachments (business_id, entity_type, entity_id);

create table public.notifications (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  user_id     uuid references auth.users(id) on delete cascade,  -- null = whole business
  type        text not null,       -- 'invoice.overdue','payment.received','quotation.accepted'…
  title       text not null,
  body        text,
  link        text,
  severity    text not null default 'info' check (severity in ('info','success','warning','error')),
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index on public.notifications (business_id, user_id, read_at, created_at desc);

create table public.audit_logs (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid references public.businesses(id) on delete cascade,
  user_id     uuid references auth.users(id) on delete set null,
  user_email  text,
  action      text not null,       -- 'invoice.created','auth.login','settings.updated'…
  entity_type text,
  entity_id   uuid,
  entity_label text,               -- e.g. the invoice number, for readable history
  metadata    jsonb not null default '{}'::jsonb,   -- {before, after, diff}
  ip_address  inet,
  user_agent  text,
  created_at  timestamptz not null default now()
);
create index on public.audit_logs (business_id, created_at desc);
create index on public.audit_logs (business_id, entity_type, entity_id, created_at desc);
create index on public.audit_logs (business_id, user_id, created_at desc);
```

`audit_logs` is insert-only: no update or delete policy exists for any role.

```sql
create table public.backup_jobs (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  status      text not null check (status in ('queued','running','completed','failed')),
  scope       text not null check (scope in ('business_export','full_dump')),
  format      text not null check (format in ('csv_zip','sql')),
  bucket      text,
  path        text,
  size_bytes  bigint,
  error       text,
  requested_by uuid references auth.users(id),
  started_at  timestamptz,
  finished_at timestamptz,
  created_at  timestamptz not null default now()
);
```

A row reaches `completed` only after an artifact exists in storage. See `09-operations.md`.

---

## 14. Index summary

Beyond the indexes declared inline above:

```sql
create index on public.invoices    (business_id, created_at desc);
create index on public.quotations  (business_id, created_at desc);
create index on public.invoice_items   (invoice_id, sort_order);
create index on public.invoice_items   (business_id, product_id);   -- top products report
create index on public.quotation_items (business_id, product_id);
create index on public.payments        (business_id, payment_method_id);
create index on public.products using gin (
  to_tsvector('simple', coalesce(name,'') || ' ' || coalesce(sku,'') || ' ' || coalesce(description,''))
);
create index on public.notifications (business_id, created_at desc) where read_at is null;
```

Rationale: every list endpoint filters by `business_id` first, then by status/date; every report
aggregates by `business_id` + date range; global search hits the two GIN indexes.

---

## 15. Business bootstrap

Creating a business runs one transaction (`businessService.create`) that inserts:

1. `businesses` row, `business_settings` row, `business_branding` row.
2. Three roles from the system templates (`super_admin`, `administrator`, `staff`) with their
   `role_permissions`.
3. A `business_members` row making the creator `super_admin`.
4. `numbering_settings` rows for `quotation` and `invoice` with neutral defaults
   (`prefix` empty, `padding` 5, `reset_frequency` `never`) — the admin sets these in onboarding.
5. **Suggested, editable defaults**, each an ordinary row:
   - units: a small set the admin can delete outright
   - taxes: one zero-rate entry so a tax-free business can transact immediately
   - payment methods: a few common ones
   - email templates: one per key, with neutral placeholder copy
   - `document_templates` selections pointing at the system `classic` templates

No code path may assume any of these rows still exists — every lookup handles "no units defined",
"no taxes defined", "no payment methods defined" as valid states with an appropriate empty state.

---

## 16. Manual schema verification

After applying migrations, run in the Supabase SQL editor:

```sql
-- every tenant table has business_id
select t.table_name
from information_schema.tables t
where t.table_schema = 'public'
  and t.table_name not in ('user_profiles','permissions','roles','role_permissions')
  and not exists (
    select 1 from information_schema.columns c
    where c.table_schema='public' and c.table_name=t.table_name and c.column_name='business_id')
order by 1;   -- expect: only the excluded global tables

-- every table has RLS enabled
select relname from pg_class
where relnamespace = 'public'::regnamespace and relkind='r' and not relrowsecurity;
-- expect: zero rows

-- no float money columns anywhere
select table_name, column_name, data_type from information_schema.columns
where table_schema='public' and data_type in ('real','double precision');
-- expect: zero rows
```

RLS policy verification is in `04-rls-and-security.md`.

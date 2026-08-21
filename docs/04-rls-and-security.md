# 04 — Row Level Security, RBAC & Application Security

## 1. Helper functions

Every policy pivots on membership. Two `security definer` helpers keep policies short and avoid
recursive RLS evaluation on `business_members`.

```sql
create or replace function public.is_business_member(p_business_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.business_members m
    where m.business_id = p_business_id
      and m.user_id = auth.uid()
      and m.status = 'active'
  );
$$;

create or replace function public.has_permission(p_business_id uuid, p_permission text)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.business_members m
    join public.role_permissions rp on rp.role_id = m.role_id
    where m.business_id = p_business_id
      and m.user_id = auth.uid()
      and m.status = 'active'
      and rp.permission_key = p_permission
  );
$$;

create or replace function public.my_business_ids()
returns setof uuid
language sql stable security definer set search_path = public as $$
  select business_id from public.business_members
  where user_id = auth.uid() and status = 'active';
$$;

revoke execute on function public.is_business_member(uuid) from public;
grant   execute on function public.is_business_member(uuid) to authenticated;
-- same revoke/grant pattern for the other two
```

`security definer` is required so that reading `business_members` inside a policy does not re-enter
`business_members`' own policy. `set search_path = public` prevents search-path hijacking.

## 2. The standard policy quartet

Applied to every tenant-owned table. `<table>` and `<module>` substituted per table:

```sql
alter table public.<table> enable row level security;
alter table public.<table> force row level security;

create policy "<table>_select" on public.<table>
  for select to authenticated
  using (public.is_business_member(business_id));

create policy "<table>_insert" on public.<table>
  for insert to authenticated
  with check (public.has_permission(business_id, '<module>.create'));

create policy "<table>_update" on public.<table>
  for update to authenticated
  using      (public.has_permission(business_id, '<module>.update'))
  with check (public.has_permission(business_id, '<module>.update'));

create policy "<table>_delete" on public.<table>
  for delete to authenticated
  using (public.has_permission(business_id, '<module>.delete'));
```

`force row level security` matters: without it the table owner bypasses policies.

### Per-table module mapping

| Table(s) | module key | Deviations |
|---|---|---|
| `customers`, `customer_custom_fields` | `customer` | — |
| `products`, `product_custom_fields` | `product` | — |
| `categories`, `units` | `catalog` | — |
| `taxes`, `tax_components` | `tax` | — |
| `quotations`, `quotation_items`, `quotation_charges` | `quotation` | delete allowed only when `status = 'draft'` (see below) |
| `quotation_status_history` | `quotation` | insert only; no update/delete policy |
| `invoices`, `invoice_items`, `invoice_charges` | `invoice` | delete allowed only when `status = 'draft'` |
| `invoice_status_history` | `invoice` | insert only |
| `payments` | `payment` | no delete policy at all — payments are voided |
| `payment_methods` | `settings` | — |
| `recurring_invoices`, `recurring_invoice_items` | `recurring` | — |
| `reminder_rules` | `settings` | — |
| `reminder_logs` | `settings` | insert only |
| `numbering_settings` | `settings` | — |
| `numbering_sequences` | — | **no client policies**; service-role only |
| `business_settings`, `business_branding` | `settings` | select requires membership only |
| `document_templates`, `email_templates` | `settings` | select also allows `business_id is null` (system templates) |
| `custom_field_definitions` | `settings` | select requires membership only |
| `attachments` | `attachment` | — |
| `notifications` | — | see §3 |
| `audit_logs` | `audit` | select requires `audit.read`; **no insert/update/delete policy** |
| `backup_jobs` | `backup` | insert/select only |

### Financial-document delete guard

```sql
create policy "invoices_delete" on public.invoices
  for delete to authenticated
  using (
    public.has_permission(business_id, 'invoice.delete')
    and status = 'draft'
  );
```

An issued invoice cannot be deleted by any role through any client path. Cancelling and voiding are
`update`s that set `cancelled_at` / `voided_at`, recorded in `invoice_status_history`.
`payments` has **no delete policy**, so `delete from payments` fails for every authenticated caller.

Child rows are additionally guarded so a child cannot outlive its parent's state:

```sql
create policy "invoice_items_write" on public.invoice_items
  for all to authenticated
  using (
    public.has_permission(business_id, 'invoice.update')
    and exists (select 1 from public.invoices i
                where i.id = invoice_id and i.status in ('draft','sent'))
  )
  with check (public.has_permission(business_id, 'invoice.update'));
```

## 3. Non-standard tables

```sql
-- user_profiles: a user sees and edits only their own; co-members may read basic profile
alter table public.user_profiles enable row level security;
create policy "profile_self_select" on public.user_profiles for select to authenticated
  using (id = auth.uid()
         or exists (select 1 from public.business_members a
                    join public.business_members b on a.business_id = b.business_id
                    where a.user_id = auth.uid() and a.status='active'
                      and b.user_id = user_profiles.id));
create policy "profile_self_update" on public.user_profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- businesses
alter table public.businesses enable row level security;
create policy "business_select" on public.businesses for select to authenticated
  using (public.is_business_member(id));
create policy "business_insert" on public.businesses for insert to authenticated
  with check (owner_id = auth.uid());
create policy "business_update" on public.businesses for update to authenticated
  using (public.has_permission(id, 'business.update'))
  with check (public.has_permission(id, 'business.update'));
-- no delete policy: businesses are archived

-- business_members: read your own business's members; manage requires permission
alter table public.business_members enable row level security;
create policy "members_select" on public.business_members for select to authenticated
  using (business_id in (select public.my_business_ids()));
create policy "members_write" on public.business_members for all to authenticated
  using (public.has_permission(business_id, 'user.manage'))
  with check (public.has_permission(business_id, 'user.manage'));

-- roles / role_permissions: system templates readable by all; business roles by members
alter table public.roles enable row level security;
create policy "roles_select" on public.roles for select to authenticated
  using (business_id is null or public.is_business_member(business_id));
create policy "roles_write" on public.roles for all to authenticated
  using (business_id is not null and public.has_permission(business_id, 'role.manage')
         and is_system = false)
  with check (business_id is not null and public.has_permission(business_id, 'role.manage')
              and is_system = false);

-- permissions: global catalogue, read-only to all authenticated
alter table public.permissions enable row level security;
create policy "permissions_select" on public.permissions for select to authenticated using (true);

-- notifications: business-wide (user_id null) or addressed to you; you may only mark read
alter table public.notifications enable row level security;
create policy "notifications_select" on public.notifications for select to authenticated
  using (public.is_business_member(business_id)
         and (user_id is null or user_id = auth.uid()));
create policy "notifications_update" on public.notifications for update to authenticated
  using (public.is_business_member(business_id)
         and (user_id is null or user_id = auth.uid()))
  with check (public.is_business_member(business_id));
-- inserts come from the backend service role only

-- audit_logs: read-only, permission-gated. Writes are service-role only.
alter table public.audit_logs enable row level security;
create policy "audit_select" on public.audit_logs for select to authenticated
  using (public.has_permission(business_id, 'audit.read'));

-- numbering_sequences: no policies at all → service role only
alter table public.numbering_sequences enable row level security;
alter table public.numbering_sequences force row level security;
```

Tables with RLS enabled and **no policy** are completely inaccessible to `authenticated`, which is
exactly right for `numbering_sequences`: number allocation must go through the backend.

## 4. Permission catalogue

Seeded into `permissions`. Keys are `<module>.<action>`.

| Module | Keys |
|---|---|
| dashboard | `dashboard.read` |
| customer | `customer.read` `customer.create` `customer.update` `customer.delete` `customer.export` |
| product | `product.read` `product.create` `product.update` `product.delete` `product.import` |
| catalog | `catalog.read` `catalog.create` `catalog.update` `catalog.delete` |
| tax | `tax.read` `tax.create` `tax.update` `tax.delete` |
| quotation | `quotation.read` `quotation.create` `quotation.update` `quotation.delete` `quotation.send` `quotation.convert` `quotation.cancel` |
| invoice | `invoice.read` `invoice.create` `invoice.update` `invoice.delete` `invoice.send` `invoice.cancel` `invoice.void` |
| payment | `payment.read` `payment.create` `payment.update` `payment.void` |
| recurring | `recurring.read` `recurring.create` `recurring.update` `recurring.delete` `recurring.generate` |
| report | `report.read` `report.export` |
| settings | `settings.read` `settings.update` |
| business | `business.update` |
| user | `user.read` `user.manage` |
| role | `role.manage` |
| audit | `audit.read` |
| backup | `backup.read` `backup.create` |
| attachment | `attachment.read` `attachment.create` `attachment.delete` |

### Role templates

| Role | Grant |
|---|---|
| **Super Admin** | every key, including `role.manage`, `business.update`, `backup.*`. Cannot be removed from the business if last remaining. |
| **Administrator** | everything except `role.manage` and `backup.create` |
| **Staff** | `dashboard.read`, `customer.*` (not delete), `product.read/create/update`, `catalog.read`, `tax.read`, `quotation.*` (not delete/cancel), `invoice.read/create/update/send`, `payment.read/create`, `report.read`, `settings.read` |

Custom roles: an admin clones a template into a business-scoped `roles` row and edits its
`role_permissions`. `is_system` rows are immutable (enforced by the `roles_write` policy above).

## 5. Backend enforcement (independent of RLS)

RLS protects direct-client paths. The REST API uses the service role, so it enforces the same rules
itself. Both must hold.

```ts
// middleware/authenticate.ts   → verifies bearer token via supabaseAuth.auth.getUser
// middleware/resolveTenant.ts  → reads X-Business-Id, loads business_members row,
//                                 attaches { business, membership, permissions:Set<string> },
//                                 404s (not 403) on non-membership to avoid tenant enumeration
// middleware/authorize.ts      → authorize('invoice.create') checks req.permissions
// middleware/validate.ts       → validate({ body, params, query }) with Zod, strips unknown keys
```

Non-negotiable service-layer rules:

1. **Every repository method takes `businessId` and includes `.eq('business_id', businessId)`.** A
   lint rule and code review check this; there is no repository method without it.
2. **Ownership re-check on nested ids.** A request referencing `customer_id`, `product_id`,
   `tax_id`, `invoice_id` must verify each belongs to `req.business.id` before use. A caller cannot
   attach another tenant's customer to their invoice.
3. **`business_id` is taken from `req.business.id`, never from the request body.** Zod schemas
   `.strip()` any `business_id`, `id`, `created_by`, or total field a client sends.
4. **All monetary results are recomputed server-side** (`06-calculation-engine.md`); client totals
   are discarded before persistence.
5. **Status transitions go through a state machine** in the service, which rejects illegal moves
   (e.g. `paid → draft`, converting a non-accepted quotation twice).

## 6. Storage

Four private buckets. None is public.

| Bucket | Contents | Max size | Allowed MIME |
|---|---|---|---|
| `business-assets` | logos, favicons, payment QR codes | 2 MB | `image/png`, `image/jpeg`, `image/webp`, `image/svg+xml`*, `image/x-icon` |
| `avatars` | user avatars | 1 MB | `image/png`, `image/jpeg`, `image/webp` |
| `documents` | generated PDFs, backup artifacts | 25 MB | `application/pdf`, `application/zip`, `application/sql` |
| `attachments` | user-uploaded files on documents/customers | 10 MB | pdf, images, csv, xlsx, docx, txt |

\* SVG is accepted for logos but **sanitized server-side** (strip `<script>`, `on*` handlers,
`xlink:href` to external resources) before storage, because an SVG rendered inline in a PDF template
is an XSS vector.

### Path convention

```
business-assets/{business_id}/logo/{uuid}.{ext}
business-assets/{business_id}/favicon/{uuid}.{ext}
avatars/{user_id}/{uuid}.{ext}
documents/{business_id}/invoices/{invoice_id}/{uuid}.pdf
documents/{business_id}/backups/{job_id}.zip
attachments/{business_id}/{entity_type}/{entity_id}/{uuid}.{ext}
```

The first path segment is the tenancy key, which is what storage policies test.

### Storage policies

```sql
-- read: members of the business that owns the prefix
create policy "business_assets_read" on storage.objects for select to authenticated
using (
  bucket_id = 'business-assets'
  and public.is_business_member(((storage.foldername(name))[1])::uuid)
);

-- write: only via backend service role. No insert policy for authenticated on any bucket.
```

**Uploads never go direct from the browser.** The frontend posts the file to
`POST /api/uploads/:kind`; the backend validates, sanitizes and uploads with the service role. This
gives one place to enforce extension + sniffed MIME + size + ownership, and means no authenticated
insert policy is needed at all.

### Upload validation (backend, in order)

1. Multer memory storage with a hard `limits.fileSize` per bucket → rejects oversize before buffering
   completes.
2. Extension allowlist against the original filename.
3. **Magic-byte sniffing** (`file-type`) — the declared `Content-Type` is not trusted.
4. Cross-check sniffed type against the bucket allowlist; mismatch → `INVALID_FILE_TYPE`.
5. SVG sanitization if applicable.
6. Filename discarded; a fresh UUID + canonical extension is used for the storage key. The original
   name is stored in `attachments.file_name` as data only.
7. Path built from `req.business.id` — never from user input.

Reads are served as **signed URLs** minted on demand (default TTL 1 hour; 5 minutes for backup
artifacts), returned by the API alongside the record. Paths, not URLs, are stored in the DB.

## 7. Application security checklist

| Control | Implementation |
|---|---|
| Auth | Supabase Auth, email/password. Tokens verified server-side on every request. |
| Session | supabase-js auto-refresh; a 401 from the API triggers one refresh attempt then a redirect to login with `returnTo`. |
| Password reset | Supabase `resetPasswordForEmail` with a redirect to `/reset-password`; the app never handles or stores password material. Reset endpoint responds identically for known and unknown emails (no account enumeration). |
| Password change | Requires an active session; re-auth by current password before `updateUser`. |
| Headers | `helmet()` with a restrictive CSP on API responses; `X-Frame-Options: DENY` except the preview iframe route which uses `frame-ancestors 'self'`. |
| CORS | Explicit origin allowlist from `APP_ORIGIN`, `credentials: true`. No `*`. |
| Rate limiting | Global 300 req/15 min per IP+user; `/api/auth/*` 10/15 min per IP; `/api/*/send` (email) 30/hour per business; `/api/*/pdf` 60/hour per business; uploads 60/hour. |
| Body limits | `express.json({ limit: '1mb' })`; import endpoints use multipart with their own caps. |
| Input validation | Zod on body, params (uuid format), and query for **every** route. Unknown keys stripped. |
| SQL injection | All access through supabase-js query builder / parameterized RPC. No string-concatenated SQL anywhere, including reports. |
| XSS — app | React escapes by default; `dangerouslySetInnerHTML` is banned except the document-preview iframe, which uses `srcdoc` with `sandbox="allow-same-origin allow-modals"`. |
| XSS — PDF/email | Template rendering escapes every interpolation by default (`{{ }}` escapes, `{{{ }}}` unavailable). Customer names, item descriptions, notes and terms are user content rendered into HTML — this is the highest-risk surface and is escaped without exception. |
| SSRF | Puppeteer runs with network access disabled for the rendered page (request interception aborts all non-`data:` requests); images are inlined as data URIs by the backend before rendering. |
| IDOR | Ownership re-check on every nested id (§5.2) plus RLS. |
| Tenant enumeration | Non-membership returns 404, not 403. |
| Mass assignment | Zod strips; totals/status/business_id/ids never accepted from clients. |
| Secrets | `02-architecture.md` boundary; CI grep guards `frontend/`. |
| Audit | Every mutating service writes an `audit_logs` row in the same transaction. Insert-only table. |
| Dependency hygiene | `npm audit` in CI; lockfiles committed. |
| Logging | Structured logs with a request id. Never log tokens, passwords, SMTP credentials, or full request bodies of auth routes. |

## 8. Manual RLS verification

Run after every migration that touches policies. Requires two test users.

**Setup** (SQL editor, service role):

```sql
-- assume auth users A (uuid :ua) and B (uuid :ub) exist
insert into businesses (name, owner_id) values ('Alpha Co', :ua) returning id;  -- :ba
insert into businesses (name, owner_id) values ('Beta Co',  :ub) returning id;  -- :bb
-- bootstrap roles/members/settings for each via businessService.create, then:
insert into customers (business_id, name) values (:ba, 'Alpha Customer') returning id; -- :ca
insert into customers (business_id, name) values (:bb, 'Beta Customer')  returning id; -- :cb
```

**Test** — obtain an access token for user A (Supabase JS sign-in, or the SQL editor's
`set request.jwt.claims`), then run each as user A:

```sql
set local role authenticated;
set local request.jwt.claims = '{"sub":"<uuid of A>","role":"authenticated"}';

-- 1. sees only own customers
select count(*) from customers;                 -- expect 1 (Alpha Customer)
select * from customers where id = :cb;         -- expect 0 rows

-- 2. cannot write into another business
insert into customers (business_id, name) values (:bb, 'Injected');
-- expect: new row violates row-level security policy

-- 3. cannot update another business's record
update customers set name = 'Hacked' where id = :cb;   -- expect 0 rows updated

-- 4. cannot delete another business's record
delete from customers where id = :cb;                  -- expect 0 rows deleted

-- 5. cannot read another business's invoices/quotations/payments/audit
select count(*) from invoices   where business_id = :bb;  -- 0
select count(*) from quotations where business_id = :bb;  -- 0
select count(*) from payments   where business_id = :bb;  -- 0
select count(*) from audit_logs where business_id = :bb;  -- 0

-- 6. numbering sequences are unreachable
select count(*) from numbering_sequences;       -- expect 0 rows (no policy)

-- 7. audit logs are insert-proof
insert into audit_logs (business_id, action) values (:ba, 'forged');
-- expect: violates row-level security policy

-- 8. issued invoices cannot be deleted
update invoices set status='sent' where id = :ia;   -- as service role, first
delete from invoices where id = :ia;                -- as user A: expect 0 rows deleted

-- 9. payments cannot be deleted at all
delete from payments where business_id = :ba;       -- expect 0 rows deleted

-- 10. staff cannot exceed their role
-- reassign A to the 'staff' role, then:
delete from customers where id = :ca;               -- expect 0 rows deleted
```

Then repeat 1–5 as user B with the roles swapped. Record the run in `docs/10-roadmap.md`'s phase
gate. Any deviation blocks the phase.

**Storage check** — as user A, attempt
`supabase.storage.from('business-assets').list('<beta business uuid>/logo')` → expect empty, and
`.upload()` to any path → expect a policy error (no insert policy exists for `authenticated`).

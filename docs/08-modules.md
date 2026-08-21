# 08 — Module Functional Specifications

Each module states screens, behaviour, validation, permissions and acceptance criteria. API details
in `05-api-spec.md`; math in `06`; UI vocabulary in `07`.

---

## 1. Authentication & Profile

**Screens** — Login, Forgot Password, Reset Password, Profile, Change Password.

Login: email, password, "Remember me", submit; links to Forgot Password. "Remember me" selects
Supabase persistent vs session storage for the refresh token. Errors are generic
("Invalid email or password") — no distinction between unknown email and wrong password.

Forgot Password sends a reset link via Supabase and shows the **same** confirmation regardless of
whether the email exists. Reset Password validates the recovery token from the URL, enforces the
password policy (min 8, at least one letter and one number, checked against a common-password
list), then redirects to login.

Profile shows name, email, avatar, phone, role, account status, created date, last login. Editable:
name, phone, avatar. Email changes go through Supabase's verification flow. Change Password requires
the current password (re-auth) before `updateUser`.

Protected routes: `<ProtectedRoute>` redirects unauthenticated users to `/login?returnTo=…`;
`<PermissionRoute permission="…">` renders a 403 page for authenticated users lacking the key.
Session expiry mid-session: the API client attempts one silent refresh, then redirects to login
preserving the current path, with a toast explaining why.

**Acceptance** — login/logout/reset/change all work; `auth.login` and `auth.logout` reach the audit
log; `last_login_at` updates; expired sessions recover gracefully; no password material ever
reaches our database.

---

## 2. Business, Members & Roles

**Screens** — Business switcher (topbar, only when >1 membership), Settings → Business Profile,
Settings → Users & Roles.

Creating a business runs the bootstrap transaction (`03-database-schema.md` §15) and drops the user
into a short onboarding: business name → currency → numbering prefixes → optional logo. Every step
is skippable and re-editable in Settings.

Business Profile: name, legal name, both phones, both emails, website, full address, timezone,
locale, date format, tax registration number, business registration number, plus repeatable
label/value rows for any other registration identifier. **No registration field is required and none
is labelled with a jurisdiction-specific name in the code** — labels come from the admin's input.

Users & Roles: member list (name, email, role, status, joined), invite by email (creates an invited
member; the invitee signs up and is linked on first login), change role, suspend, remove. Guard: the
last active Super Admin cannot be removed, demoted or suspended. Role editor lists permission keys
grouped by module with checkboxes; system role templates are read-only and must be cloned to edit.

**Acceptance** — a second business is fully isolated; role changes take effect on the next request;
the last-super-admin guard holds; every change is audited.

---

## 3. Settings

Sections per the sidebar tree. All gated by `settings.read` / `settings.update` (Business Profile by
`business.update`).

- **Branding** — logo and favicon upload (validated per `04` §6), primary/secondary color pickers
  with a live preview and the contrast guard, "show logo on documents" toggle, default template
  selection for invoices and quotations.
- **Currency** — code, name, symbol, decimal places, symbol position, thousand and decimal
  separators, with a live sample rendering (`₹ 10,000.00`, `$1,000.00`, `1.000,00 €` are *previews
  of configuration*, not defaults baked into code).
- **Invoice / Quotation Settings** — default template, default tax and tax mode, payment terms days,
  quotation validity days, default payment instructions, page size.
- **Document Settings → Notes / Terms** — the four rich-text defaults and include flags; see
  `12-notes-and-terms.md`.
- **Numbering** — per document type: prefix, suffix, separator, padding, start number, include
  year/month, year format, reset frequency, and a token-string format field with a **live preview**
  of the next number. Changing settings never renumbers existing documents.
- **Payment Settings** — payment methods CRUD (name, description, requires-reference, active,
  order), bank name/account name/account number/IFSC-SWIFT/branch, UPI ID, payment QR upload,
  payment instructions, "show payment details on documents".
- **Email** — sender name, reply-to, enable toggle, and a Send Test Email action. SMTP host,
  port, user and password are **backend environment variables**, not settings rows; the UI shows the
  configured host read-only and never a password field.
- **Notifications** — per-event toggles.
- **Templates** — document template gallery with previews; email template editor per key with a
  token reference panel.
- **Custom Fields** — definitions per entity (see §14).
- **Localization** — timezone, locale, date format.
- **Security** — session info, active memberships, password change entry point.
- **Audit Logs** — see §18. **Backup** — see §19.

---

## 4. Customers

List: name, company, email, phone, outstanding, last transaction, status. Toolbar with search
(name/company/email/phone), active/archived filter, sort, export, Import, New Customer.

Detail: header with name, company and outstanding badge; stat strip (total quotations, total
invoices, total invoiced, total paid, outstanding, last transaction); tabs **Overview · Quotations ·
Invoices · Payments · Activity**. Overview shows contact and address blocks plus custom fields.
Activity is an audit-derived timeline grouped by day ("Today / Yesterday / Aug 18").

Create/Edit: all fields from the brief, all optional except name. Optional per-customer currency and
payment terms override the business defaults on new documents. Customer code is optional and unique
per business when present.

Delete/Archive: a customer referenced by any document cannot be deleted — the action archives
instead, with an explanatory dialog. Archived customers keep appearing on historical documents and
disappear from new-document pickers.

**Acceptance** — CRUD, search, filter, sort, pagination, export, archive, and correct stats;
archived customers behave as described; very long names (300 chars) render without breaking layout.

---

## 5. Catalog: Products & Services

One table, two filtered views (`kind = product | service`) so a service business never sees product
vocabulary it does not use.

Fields: name, kind, SKU, description, category, unit, cost price, selling price, default tax, active
flag, notes, custom fields. Only name is required.

List: name, SKU, category, unit, selling price, tax, status; search across name/SKU/description;
filters by category, kind and status; bulk activate/deactivate; export; import.

Deletion is blocked when the product appears on a document (item snapshots keep the document intact,
but we preserve the link) — archive instead.

**Categories** — name, description, applies-to (product/service/both), status; create, edit,
archive, search. **Units** — name, abbreviation, status. Both are per business, fully admin-defined;
the suggested seed rows are ordinary deletable rows.

**Taxes** — name, rate, description, active, and optional components (name + rate) for split taxes.
The rate sum of components must equal the parent rate; the form enforces it. Taxes in use cannot be
deleted, only deactivated — historical documents hold their own rate snapshot regardless.

---

## 6. Quotations

**List** — number, customer, issue date, valid until, status badge, total; filters by status, date
range and customer; search by number/customer/reference.

**Editor** — per `07` §5. Customer combobox (with inline "New Customer"), issue date, valid until
(defaulted from `quotation_validity_days`), currency (customer → business default), reference,
template, item rows, additional charges, document discount, and the Additional Information section
(`12-notes-and-terms.md`).

**Custom items are mandatory and first-class.** The add-item control offers "Search catalog" and
"Add custom item" in one popover. A custom item needs only a name, quantity and price — no catalog
record. It supports unit, discount, tax and notes identically, and offers "Save as Product/Service"
which creates a catalog row on save (requires `product.create`; skipped with a warning otherwise).

**Status** — draft → sent → viewed → accepted/rejected/expired/cancelled → converted. Transitions
go through a server state machine; illegal moves return `INVALID_STATE_TRANSITION`. Every change
writes `quotation_status_history` with actor, timestamp and optional note, rendered as a timeline on
the detail page. Expiry: quotations past `valid_until` in `sent`/`viewed` are marked `expired` by
the same sweep that handles overdue invoices.

**Actions** — Preview, Download PDF, Print, Email, Share via WhatsApp, Duplicate, Convert to
Invoice, Cancel, Archive. Drafts may be deleted; anything issued may not.

**Conversion** — enabled only from `accepted`. Copies customer, items (full snapshot), charges,
discounts, taxes, notes and terms into a new invoice; sets `invoices.quotation_id`; marks the
quotation `converted`; leaves every quotation figure untouched. Both documents show a link to the
other. A second conversion attempt is refused unless explicitly forced.

---

## 7. Invoices

Mirrors quotations with: due date (defaulted from payment terms), optional source quotation,
payment status, and a Payments tab.

Editing is blocked once the invoice is cancelled, void, or fully paid; partially paid invoices may
be edited only if the new grand total remains ≥ amount already paid (otherwise the user is told to
void a payment first).

**Cancel** requires a reason, keeps the record and its number, excludes it from receivables and
reports' revenue lines, and is fully audited. **Void** is available only when no payments exist.
Neither is a delete; only drafts delete.

**Actions** — Preview, PDF, Print, Email, WhatsApp, Record Payment, Duplicate, Cancel, Void,
Archive, plus Send Reminder when overdue.

---

## 8. Payments

Record Payment opens from an invoice or from the Payments list. Fields: invoice (locked when opened
from an invoice), amount (pre-filled with the outstanding balance), payment date, payment method,
reference number (required when the method demands it), notes.

The server recomputes `amount_paid`, `amount_due` and `payment_status` in the same transaction, and
rejects over-payment with the exact outstanding amount in the error (`06` §6). Multiple partial
payments are the normal case.

Payments are **voided, never deleted**, with a reason; voiding reverses the invoice recomputation.
Each payment can produce a receipt PDF and a receipt email.

List: date, invoice number, customer, method, reference, amount, status; filters by date range,
customer and method; export.

---

## 9. Dashboard

Date-range selector (today, yesterday, this week, this month, last month, this quarter, this year,
custom) applied to every widget and reflected in the URL.

KPI tiles: revenue, payments received, outstanding, invoice count, paid / pending / overdue counts,
quotation count, accepted / rejected counts, customers, products & services.

Charts: revenue trend (invoiced vs collected over time), invoice status donut, quotation status
donut, payment method breakdown, top customers bar, top products/services bar.

Quick actions: New Quotation, New Invoice, Add Customer, Add Product/Service, Record Payment.
Plus a recent-activity list and an "attention" strip (overdue invoices, quotations expiring within
7 days).

All figures come from one `/api/dashboard` call computed in SQL; the client performs no aggregation.

---

## 10. Reports

Sales, Invoices, Quotations, Payments, Taxes, Customers — each with its own filter set (`05`), a
summary strip, a detail table, pagination and export to CSV, Excel and PDF where meaningful. Every
report is a parameterized SQL aggregate; none loads a full table into Node.

The Tax report groups by tax rate and component, showing taxable base and tax collected — correct
only because document-level discounts are allocated back to items (`06` §4).

---

## 11. Customer Statement

Per customer, for a date range: opening balance, chronological invoices and payments with a running
balance, adjustments (cancellations/voids), closing balance. Actions: Download PDF, Print, Email,
Share via WhatsApp. Rendered by the same template pipeline as invoices, so it inherits pagination,
footers and branding.

---

## 12. Recurring Invoices

Template record: customer, title, items, frequency (daily/weekly/monthly/quarterly/yearly/custom
with an interval count), start date, end date or max occurrences, payment terms, notes/terms,
template, auto-send flag.

`next_run_date` is maintained by the service. **Generation is manual in this build** — a Generate
Due action on the list and per record — because no scheduler is deployed; the UI says so plainly
rather than implying automation. The generation function is idempotent per occurrence index, so
attaching a cron later requires no schema change.

History tab lists generated invoices with links.

---

## 13. Payment Reminders

Deliberately separate from the invoice module. Admins define rules: trigger (before due / on due /
after due), offset days, email template, active. `/reminders/due` lists invoices currently matching
any active rule; `/reminders/run` sends them and writes `reminder_logs` (one per invoice per rule
per day, enforced by a unique index, so a re-run cannot spam a customer). Manual invocation, same
rationale as recurring.

---

## 14. Custom Fields

Definitions per entity (customer, product, quotation, invoice, business): key, label, type (text,
number, date, dropdown, checkbox, email, phone), options for dropdowns, required flag,
show-on-document flag, sort order, active.

Definitions render as an extra section on the relevant create/edit form, validated by a Zod schema
built at runtime from the definitions. Values store in the typed columns of the per-entity value
tables (`03` §12), so numeric and date custom fields are filterable and sortable in SQL. Fields
marked show-on-document appear in the template's meta block.

Deactivating a definition hides it from forms while preserving existing values.

---

## 15. Import / Export

Import for customers and products/services:

```
Upload (CSV/XLSX, ≤5 MB, ≤5,000 rows)
   ↓ Map columns → detected headers matched to fields, user-correctable
   ↓ Validate  → per-row Zod + duplicate detection (email/SKU/code) + FK resolution
   ↓ Preview   → first 50 rows, valid/invalid counts, per-row error list, downloadable error CSV
   ↓ Confirm
   ↓ Import    → batched inserts in a transaction; partial import only if the user opts in
```

Nothing is written before Confirm. A downloadable template file is offered on the upload step.

Export: customers, products, quotations, invoices, payments and every report, as CSV and XLSX (and
PDF for reports). Exports respect the current filters and the caller's permissions, and are
generated server-side with streaming for large sets.

---

## 16. Notifications

In-app only. Generated server-side for: invoice overdue, payment received, quotation accepted,
quotation expiring soon, email send failed, backup completed or failed, recurring invoice generated.
Bell in the topbar with unread count; dropdown list; mark one/all as read; a full page with filters.
Business-wide notifications (`user_id is null`) are visible to all members; targeted ones only to
their recipient. Realtime delivery via Supabase Realtime on the notifications table is used where
it works, with polling fallback.

---

## 17. Activity Timeline

Customer detail and every document detail page show a timeline built from `audit_logs` and the
status-history tables, grouped by day with relative headers:

```
Today      Invoice INV-00025 created            by Priya
Today      Invoice sent by email to acme@…      by Priya
Yesterday  Payment of 5,000.00 recorded         by Sam
Aug 18     Quotation QUO-00019 accepted         by Sam
```

---

## 18. Audit Logs

Every mutating service writes a row in the same transaction: user, business, action, entity type,
entity id, human-readable entity label, metadata (before/after diff, redacted for large text such as
notes and terms, which log content hashes instead), IP and user agent.

Recorded actions include login, logout, customer/product/quotation/invoice/payment create-update-
cancel-void, settings changes, user and permission changes, imports, exports, backups, email sends.

Viewer: filters by entity type, entity id, user, action and date range; expandable diff view;
export. Insert-only — no update or delete policy exists for any role (`04` §3).

---

## 19. Backup

Real export or nothing. `POST /backups` creates a `backup_jobs` row and runs the export in a
background worker in the API process; the job reaches `completed` only after an artifact exists in
the private `documents` bucket, and the UI shows `queued → running → completed/failed` from the real
row. A failed job shows the error. There is no client-side success simulation anywhere.

Two scopes: **business export** (all of this tenant's tables as a CSV bundle, tenant-safe, available
to admins) and **full dump** (`pg_dump`, super-admin only, operator-oriented). Database credentials
stay in backend env and are never exposed. Downloads are 5-minute signed URLs. Operational guidance,
including Supabase's own PITR/daily backups, is in `09-operations.md`.

---

## 20. Search

Global palette (`⌘K`) and per-module search. Server-side across customers, products, quotations,
invoices and payments, using the GIN indexes from `03` §14 plus prefix matching on document numbers.
Results grouped by type, each group filtered by the caller's read permission, capped at 5 per type
in the palette with a "see all" link into the module list carrying the query.

---

## 21. WhatsApp & Email sharing

**WhatsApp** — builds a `wa.me/<digits>?text=<encoded>` link from the customer's phone (digits only,
country code required — the UI prompts when it looks absent) and a message assembled from the
business name, customer name, document number, formatted amount and due date. Opens in a new tab.
Copy is honest: it opens WhatsApp with a prepared message and does not attach the PDF. Message
content excludes terms (`12-notes-and-terms.md` §12).

**Email** — backend SMTP with the PDF attached, subject and body from the editable email template
for that key, token substitution, a send dialog allowing to/cc/subject/body edits before sending,
and a recorded outcome (audit entry, notification on failure, `sent_at` stamped only on success).

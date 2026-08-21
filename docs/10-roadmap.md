# 10 — Build Roadmap, Phase Gates & Edge-Case Matrix

Build module by module. Never generate the application as one giant file or component. Each phase
ends at a gate; a failing gate blocks the next phase.

## The standard gate

Run at the end of **every** phase:

1. `npm run typecheck` — strict, zero errors, both packages.
2. `npm run build --workspace frontend` — clean.
3. `npm run build --workspace backend` — clean.
4. `npm run test` — all unit tests pass.
5. Migrations apply cleanly to a fresh project; schema checks in `03` §16 pass.
6. RLS verification script (`04` §8) passes in full.
7. Every new endpoint smoke-tested with a real token (happy path + unauthorized + wrong tenant).
8. Validation verified: bad body → 400 with field paths; missing permission → 403; other tenant → 404.
9. This phase's edge cases (§ matrix below) exercised.
10. Errors fixed before starting the next phase.

---

## Phase 1 — Foundation

Monorepo, npm workspaces. Vite + React + TS strict + Tailwind + React Router + TanStack Query +
RHF + Zod + Recharts + Lucide. Express + TS + helmet/cors/rate-limit, `config/env.ts` Zod-parsed,
layered folders, `AppError` + error middleware, `/api/health`. Supabase project created, buckets
made, `.env.example` files. Design tokens and the first UI primitives (Button, Input, Card,
Skeleton, Toast).

*Exit:* both apps boot, `/api/health` green from the browser, tokens render, secret-grep clean.

## Phase 2 — Authentication

Supabase Auth wiring, `SessionContext`, login/forgot/reset/change-password screens, AuthLayout,
`ProtectedRoute`, profile page, avatar upload, `authenticate` middleware, `/auth/me`,
`user_profiles` trigger, login/logout audit entries.

*Exit:* full auth cycle works; expired session recovers; no password material in our DB.

## Phase 3 — Multi-tenant foundation

`businesses`, `business_members`, `roles`, `permissions`, `role_permissions`; bootstrap transaction;
`resolveTenant` and `authorize` middleware; `BusinessContext`; business switcher; Users & Roles UI;
**all RLS policies and helper functions**; the `04` §8 verification script.

*Exit:* two businesses fully isolated at the DB and API layers; role changes take effect; last-super-
admin guard holds. **This is the most important gate in the project — do not proceed past a partial
pass.**

## Phase 4 — Business configuration

Settings shell and nav. Business Profile, Branding (uploads + runtime CSS variables + contrast
guard), Currency (+ formatter), Taxes and components, Numbering settings with live preview and the
race-safe allocator, `document_templates` and `email_templates` seeding, Payment Settings and
payment methods, Document Settings (notes/terms defaults — `12` §4).

*Exit:* every configurable value in the genericness charter (`01`) is editable from the UI; the
number allocator survives the concurrency test.

## Phase 5 — Customers

CRUD, list with server-side search/filter/sort/pagination, detail page with stats and tabs, archive
semantics, activity timeline, export.

## Phase 6 — Catalog

Products/Services CRUD with the two filtered views, Categories, Units, tax assignment,
archive-instead-of-delete when referenced.

## Phase 7 — Quotation engine

**The calculation engine first**, with its full fixture suite (`06` §7) green before any UI. Then
the line-item editor with custom items, charges, discounts, document create/update, numbering,
status machine and history, document templates, preview, PDF (including the notes/terms
final-page pagination from `12` §9), email send, WhatsApp share.

*Exit:* `06` fixtures pass; PDF fixtures (`12` §9) pass for all five templates × A4/Letter; a
quotation round-trips create → send → accept.

## Phase 8 — Invoice engine

Invoice editor (reusing the Phase 7 components wholesale), numbering, status, templates, preview,
PDF, email, WhatsApp, and quotation → invoice conversion with snapshot copying.

## Phase 9 — Payments

Recording, partial and multiple payments, over-payment rejection, void, server-derived payment
status, overdue sweep, receipts, payments list and export.

## Phase 10 — Dashboard

`/api/dashboard` SQL aggregates, KPI tiles, all charts, date range filter, quick actions, attention
strip.

## Phase 11 — Reports

Sales, Invoices, Quotations, Payments, Taxes, Customers; customer statement with PDF/print/email/
WhatsApp; CSV/XLSX/PDF export.

## Phase 12 — Advanced

Recurring invoices (manual generation), reminder rules and manual run, custom fields end-to-end,
audit log viewer, import/export wizards, notifications with realtime, backup jobs with a real
artifact.

## Phase 13 — Hardening

Full edge-case sweep (§ matrix), accessibility pass, responsive pass on real devices, rate-limit
tuning, README and `.env.example` finalization, restore rehearsal per `09` §6.

---

## Edge-case matrix

Every case from the brief, mapped to the phase that must demonstrate it. A phase gate is not passed
until its rows are exercised.

| # | Edge case | Phase | Expected behaviour |
|---|---|---|---|
| 1 | Duplicate invoice number | 8 | unique index rejects; service retries then `DUPLICATE_NUMBER` |
| 2 | Duplicate quotation number | 7 | same |
| 3 | Two users creating invoices simultaneously | 4, 8 | distinct numbers; verified by a concurrent-request test (see below) |
| 4 | Negative quantity | 7 | `VALIDATION_ERROR`, no document created |
| 5 | Zero quantity | 7 | `VALIDATION_ERROR` |
| 6 | Negative price | 7 | `VALIDATION_ERROR` |
| 7 | Zero price | 7 | **accepted** — a free line item is legitimate; line total 0 |
| 8 | Large quantities (999,999) | 7 | computes exactly, no exponential formatting |
| 9 | Large monetary values | 7 | `numeric(18,4)` holds; `decimal.js` precision 34; `06` E9 |
| 10 | Decimal prices | 7 | 4 dp preserved, rounded to display decimals at boundaries |
| 11 | Decimal tax rates (7.5%) | 7 | `06` E3 exact |
| 12 | Percentage discount > 100% | 7 | **rejected**, not clamped |
| 13 | Fixed discount > subtotal | 7 | capped at subtotal, reported in `meta.adjustments`, never negative |
| 14 | Multiple taxes / components | 7 | largest-remainder allocation sums exactly; `06` E4 |
| 15 | Partial payments | 9 | status `partially_paid`, balance correct; `06` E8 |
| 16 | Payment > outstanding | 9 | `OVERPAYMENT` with `details.outstanding` |
| 17 | Overdue invoices | 9 | derived by sweep, never client-set |
| 18 | Cancelled invoices | 8 | excluded from receivables and revenue; record and number retained |
| 19 | Archived customer | 5 | hidden from pickers, still shown on historical documents |
| 20 | Archived product | 6 | same; item snapshots keep documents intact |
| 21 | Custom quotation item | 7 | no catalog record required; optional save-to-catalog works |
| 22 | Empty quotation | 7 | draft allowed with zero items; send/convert rejected |
| 23 | Empty invoice | 8 | same |
| 24 | Very long customer name (300 chars) | 5 | stored, truncated with ellipsis + tooltip in lists, wraps in PDF |
| 25 | Very long item description | 7 | wraps in the PDF table, no overflow, no clipped row |
| 26 | Hundreds of invoice items | 8 | 500-item cap enforced; 500-item PDF renders with repeated headers |
| 27 | Multi-page PDF | 7 | headers repeat, footer on every page, totals not split |
| 28 | Missing logo | 7 | text fallback, layout intact |
| 29 | Large logo file | 4 | rejected at 2 MB with `FILE_TOO_LARGE` |
| 30 | Invalid logo format | 4 | magic-byte sniff rejects a renamed file with `INVALID_FILE_TYPE` |
| 31 | Email failure | 7 | `EMAIL_SEND_FAILED`, notification, audit, `sent_at` **not** set |
| 32 | PDF generation failure | 7 | `PDF_GENERATION_FAILED`, toast with retry, no partial download |
| 33 | WhatsApp unavailable / no phone | 7 | action disabled with an explanatory tooltip; no broken link |
| 34 | Unauthorized user (missing permission) | 3 | 403, UI hides the action, backend refuses independently |
| 35 | User accessing another business's data | 3 | 404 at the API; RLS denies at the DB; script `04` §8 |
| 36 | Expired session | 2 | one silent refresh, then redirect to login preserving `returnTo` |
| 37 | Concurrent requests on one invoice | 9 | payment recomputation is transactional; last-write-wins guarded by `updated_at` optimistic check |
| 38 | Database failure | 1 | `INTERNAL_ERROR` + request id, no stack trace to the client, error state in UI with Retry |
| 39 | Notes/terms longer than one page | 12 | flows across pages, `is-long` applied, footer correct on each |
| 40 | Notes/terms don't fit remaining space | 12 | whole group moves to a new page |
| 41 | Empty notes/terms | 12 | no heading, no box, no gap |
| 42 | Malicious HTML in notes/terms | 12 | stripped server-side; sanitizer suite passes |
| 43 | Default terms changed after a document exists | 12 | old document unchanged; new documents get the new text |

### Concurrency test (cases 3 and 37)

```bash
# 20 parallel invoice creations for one business
seq 1 20 | xargs -P20 -I{} curl -s -XPOST "$API/invoices" \
  -H "Authorization: Bearer $TOKEN" -H "X-Business-Id: $BIZ" \
  -H 'Content-Type: application/json' -d @fixtures/minimal-invoice.json \
  | jq -r '.data.invoice_number' | sort | uniq -d
# expect: no output (no duplicates)
```

Run the same against two different user tokens in the same business. Repeat for quotations.

---

## Coverage: brief section → documentation

| Brief §§ | Where specified |
|---|---|
| 1 stack, 67 structure | `02` |
| 2 objective, 63 generic, 65 future | `01`, `02` §extension seams |
| 3 design, 4 responsive, 56 states, 59 sidebar, 58 footer | `07` |
| 5 login, 6 profile | `08` §1 |
| 7 multi-tenant, 43 RLS, 44 storage, 46 API security, 49 RBAC, 57 security | `04` |
| 8 business profile, 9 branding, 10 document settings, 11 currency, 50 settings nav | `08` §2–3, `03` §2 |
| 12 customers | `08` §4 |
| 13 products, 14 categories, 15 taxes, 64 inventory seam | `08` §5, `03` §3 |
| 16 discounts, 47 calculations, 25 payment status | `06` |
| 17–20 quotations, 60 UX | `08` §6, `03` §6, `05` |
| 21–23 invoices + conversion, 61–62 UX | `08` §7, `03` §7 |
| 24 payments, 26 payment info | `08` §8, `03` §8 |
| 27–30 templates, PDF, preview | `07` §8, `12` §7–10, `02` |
| 31 WhatsApp, 32 email | `08` §21, `12` §11–12, `09` §5 |
| 33 dashboard, 34 reports, 35 statement | `08` §9–11 |
| 36 recurring, 37 reminders | `08` §12–13, `03` §9–10 |
| 38 custom fields | `08` §14, `03` §12 |
| 39 import/export, 40 archiving, 41 audit, 52 notifications, 53 timeline, 54 search | `08` §15–20 |
| 42 database design, 48 numbering | `03` |
| 45 API endpoints | `05` |
| 51 backup | `08` §19, `09` §6 |
| 55 validation | `05`, `07` §6, `04` §5 |
| 66 code quality, 68 order, 69 module-by-module, 70 edge cases | `10` (this file) |
| Add-on: notes & terms (23 acceptance criteria) | `12` |

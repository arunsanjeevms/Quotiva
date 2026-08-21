# 11 — Architecture Decision Record

Append-only. Each entry: context, decision, consequences. Supersede rather than edit.

---

## ADR-001 — Express API in front of Supabase, not direct-from-browser

**Context.** Supabase exposes PostgREST, so a React app can query the database directly with RLS as
the only control. The brief also mandates a Node/Express layer.

**Decision.** All data access goes through the Express API. The browser's Supabase client is used
**only** for auth session management (sign-in, refresh, sign-out). No feature queries tables
directly.

**Consequences.** One place enforces recalculated totals, server-generated numbers, permission
checks, audit writes and business-rule state machines — none of which RLS can express. Costs an
extra hop and means we must implement pagination/filtering ourselves. RLS is still enabled and
enforced (ADR-002).

---

## ADR-002 — RLS enabled everywhere despite the API using the service role

**Context.** The API authenticates with the service-role key, which bypasses RLS. One could argue
RLS is then redundant.

**Decision.** Enable and `force` RLS on every table anyway, with full policies, and additionally
require every repository method to filter by `business_id`.

**Consequences.** Two independent controls. A forgotten repository filter is a bug rather than a
breach for user-scoped paths; Storage and any future Realtime or direct access are governed; SQL
editor sessions authenticating as a user are constrained. Cost: policies must be maintained
alongside repository code, and the `04` §8 script must run at every phase gate.

---

## ADR-003 — Puppeteer for PDF generation

**Context.** Options were `@react-pdf/renderer` (React component DSL, light deploy), browser
`window.print()` (no server), or headless Chromium.

**Decision.** Server-side Puppeteer rendering the same HTML/CSS template used for the on-screen
preview.

**Consequences.** Preview and PDF cannot diverge, because both come from one render. Real CSS paged
media gives repeated table headers, `break-inside: avoid-page`, orphans/widows and header/footer
templates — which is what makes the notes/terms final-page requirement (`12` §9) tractable at all.
Cost: the backend image needs Chromium (~300 MB) and ~512 MB RAM headroom per concurrent render, so
the PDF endpoint is pooled, timed out and rate-limited. `@react-pdf` would have meant authoring
every template twice or accepting a preview that lies.

---

## ADR-004 — `decimal.js` for all money; money crosses the wire as strings

**Context.** JavaScript numbers are IEEE-754 doubles. `0.1 + 0.2 !== 0.3`, and cent-level drift on
invoices is unacceptable.

**Decision.** All monetary arithmetic uses `decimal.js` in a single calculation service. Money is
stored as `numeric(18,4)` and serialized in JSON as strings. The frontend formats and never sums.

**Consequences.** Correct arithmetic and exact `taxable + tax = total` identities. Requires
discipline — no `+` on money anywhere — enforced by review and by keeping the engine the only place
arithmetic happens. String money means the frontend cannot casually compute; the display-only mirror
(`06` §8) covers live editor totals and is explicitly not authoritative.

---

## ADR-005 — `numbering_sequences` row lock, not Postgres sequences

**Context.** Document numbers must be unique per business, gapless-ish, prefixed, padded, and
resettable yearly/monthly/daily.

**Decision.** A `numbering_sequences` table keyed `(business_id, document_type, period_key)`,
incremented with `insert … on conflict do update … returning`, inside the document's transaction,
backed by a unique index on the formatted number.

**Consequences.** Per-tenant, per-period counters with configurable formatting — none of which a
Postgres `SEQUENCE` provides (sequences are global objects, cannot reset per period without DDL, and
cannot be enumerated per tenant). Concurrent creates serialise on one row lock, which is cheap
because the lock is held only for the transaction's remainder. Verified by the concurrency test in
`10`.

---

## ADR-006 — Item snapshots on documents

**Context.** An invoice references a product; the product is later renamed, repriced or archived.

**Decision.** Copy name, description, SKU, unit name, price, tax name and tax rate onto the document
item row at save time, keeping `product_id` as a soft link.

**Consequences.** A reprinted invoice from last year shows what was actually billed. Archiving or
editing catalog records never rewrites history. Costs denormalized storage and means "top products"
reporting joins on the soft link, which may be null for custom items — accepted.

---

## ADR-007 — EAV custom fields with typed value columns

**Context.** Custom fields are needed for five entity types with seven field types. Alternatives: a
`jsonb` blob per row, or hardcoded spare columns.

**Decision.** `custom_field_definitions` plus per-entity value tables with `value_text`,
`value_number`, `value_date`, `value_bool`.

**Consequences.** Numeric and date custom fields are filterable and sortable in SQL, which a `jsonb`
blob makes awkward and a text-only EAV makes wrong. Costs a join per entity load and a runtime-built
Zod schema. Hardcoded columns were rejected outright — they contradict the genericness charter.

---

## ADR-008 — One `products` table for products and services

**Context.** The brief lists Products and Services as separate sidebar entries.

**Decision.** One table with a `kind` enum; two filtered views in the UI.

**Consequences.** Zero duplication in schema, API, validation and the item editor — a quotation line
does not care which it is. Service-only businesses simply never see the Products view populated.
Reversing this later would be a painful split, but no field differs between the two, so the risk is
low.

---

## ADR-009 — Hosted Supabase with hand-applied migrations

**Context.** The user creates a hosted Supabase project; there is no local Docker stack in this
workflow.

**Decision.** Migrations are authored as ordered SQL files in `supabase/migrations/` and applied by
the user via the Supabase CLI or dashboard. Schema and RLS correctness is verified by explicit
scripts (`03` §16, `04` §8) rather than by an automated test run against a live database.

**Consequences.** The verification scripts are load-bearing, not optional — they are the only proof
the schema and policies are right, so they run at every phase gate. Migrations must never be edited
after application; fixes go forward as new files.

---

## ADR-010 — Notes and Terms as separate sanitized-HTML snapshots

**Context.** The add-on requires four business-level defaults and two per-document values, rendered
as rich text at the end of the PDF, with historical documents immune to later default changes.

**Decision.** Six independent fields (`12` §1). Stored as HTML sanitized server-side on write.
Defaults are resolved once at document creation; renderers never consult settings. Include flags are
separate booleans so disabling a section preserves its content.

**Consequences.** Historical accuracy is structural, not conventional — there is no code path that
could retroactively change an issued document's terms. HTML storage makes this the app's primary
stored-XSS surface, which is why sanitization is centralized in one function used by every write
path and why templates expose exactly one audited raw-HTML seam. Separate include flags cost two
columns per table and remove the "clear the text to hide it, then retype it later" failure mode.

---

## ADR-011 — TipTap for rich text, with a locked-down schema

**Context.** Notes and terms need headings, lists, bold/italic/underline and links. Most editors
ship their own visual theme.

**Decision.** TipTap (headless ProseMirror), wrapped once as a design-system component, with a fixed
minimal toolbar and an allowlist schema matching the server sanitizer exactly. No colors, fonts,
sizes, images or tables.

**Consequences.** The editor inherits our design tokens, satisfying the "no inconsistent UI
libraries" constraint. A constrained schema means document templates keep control of typography and
long or exotic markup cannot break PDF layout. Client-side constraint is UX only — the server
sanitizer is the actual control.

---

## ADR-012 — Manual invocation for recurring invoices and reminders

**Context.** Both features imply scheduling, but no scheduler is deployed in this build, and the
brief forbids fake functionality.

**Decision.** Implement the full data model and generation/send logic, expose them as explicit user
actions (Generate Due, Run Reminders), and say so plainly in the UI. Generation is idempotent per
occurrence; reminder sends are unique per invoice/rule/day.

**Consequences.** Nothing pretends to be automatic. Attaching a cron or Supabase scheduled function
later is a single call to an already-tested function, with no schema or logic change. Users must
remember to click until then, which the UI states rather than hides.

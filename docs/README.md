# InvoQuo — Documentation

**InvoQuo** is a multi-tenant Quotation, Invoice, Customer, Product/Service and Payment management
system. A business signs up, configures its own identity, currency, taxes, numbering, templates,
notes and terms, then runs the full quote-to-cash cycle: quotation → accepted → invoice → payment →
reports. It is deliberately domain-neutral — the same deployment serves a freelancer, an agency, a
distributor or a repair shop, and **nothing about a business is hardcoded**.

Stack: React · TypeScript · Vite · Tailwind · TanStack Query · React Hook Form · Zod · Recharts ·
Node · Express · Supabase (Postgres, Auth, Storage, RLS). Light theme, server-authoritative money,
server-generated document numbers, Puppeteer PDFs.

**Status: Phase 0 — documentation.** No application code exists yet. These documents are the
contract every build phase is written and reviewed against.

## The document set

| Doc | Purpose |
|---|---|
| [01-overview.md](01-overview.md) | Product scope, target users, document lifecycle, the genericness charter, non-goals and the two honesty rules |
| [02-architecture.md](02-architecture.md) | Repo layout, request path, the secret boundary, why RLS plus repository filtering, one-template-two-outputs rendering, extension seams |
| [03-database-schema.md](03-database-schema.md) | Full Postgres DDL, money types, rounding rule, race-safe numbering, EAV custom fields, indexes, bootstrap and seed policy |
| [04-rls-and-security.md](04-rls-and-security.md) | RLS helpers and per-table policies, RBAC matrix, storage buckets and upload validation, the app security checklist, **the manual RLS verification script** |
| [05-api-spec.md](05-api-spec.md) | Every endpoint: method, path, permission, body, response, error codes, list conventions |
| [06-calculation-engine.md](06-calculation-engine.md) | Normative money math — item and document pipelines, inclusive tax, multi-component allocation, payment-status derivation, ten worked fixtures |
| [07-frontend-design-system.md](07-frontend-design-system.md) | Tokens, runtime branding, typography, component inventory, layout, page patterns, states, templates, formatting, accessibility |
| [08-modules.md](08-modules.md) | Per-module functional spec: screens, fields, rules, permissions, acceptance criteria |
| [09-operations.md](09-operations.md) | Env var reference, Supabase setup, local dev, deployment (Chromium), email, **real backup architecture and production guidance**, observability |
| [10-roadmap.md](10-roadmap.md) | 13 phases with exit gates, the full edge-case matrix, and the brief→docs coverage table |
| [11-decisions.md](11-decisions.md) | ADR log — twelve decisions with context and consequences |
| [12-notes-and-terms.md](12-notes-and-terms.md) | The Custom Notes & Terms add-on: six independent fields, snapshots, rich-text sanitization, final-page PDF pagination, preview parity |

## Start here

- **Implementing a phase** → [10-roadmap.md](10-roadmap.md) for scope and the gate, then
  [03](03-database-schema.md) + [05](05-api-spec.md) for the contract, then the relevant section of
  [08](08-modules.md).
- **Writing frontend code** → [07-frontend-design-system.md](07-frontend-design-system.md) first;
  build the primitive before the page.
- **Touching money** → [06-calculation-engine.md](06-calculation-engine.md). Nothing else computes a
  total.
- **Touching tenancy, auth or uploads** → [04-rls-and-security.md](04-rls-and-security.md), and run
  its §8 script before you call the phase done.
- **Reviewing** → [10-roadmap.md](10-roadmap.md) edge-case matrix and each module's acceptance
  criteria in [08](08-modules.md) / [12](12-notes-and-terms.md) §15.
- **Deploying or operating** → [09-operations.md](09-operations.md).
- **Wondering why something is built that way** → [11-decisions.md](11-decisions.md).

## Invariants

Every phase is reviewed against these. A change that breaks one is a defect, not a trade-off.

1. **No business specifics in code.** No currency, tax rate, tax regime name, prefix, unit,
   category, payment method or business identity as a literal. All of it is data (`01` §charter).
2. **The database enforces isolation.** RLS on every table plus `business_id` filtering in every
   repository method. `business_id` comes from the verified membership, never a request body.
3. **The server owns money.** Client-supplied prices, discounts, taxes, totals and payment status
   are recalculated or ignored. Money is `decimal.js` and `numeric(18,4)`, never a float.
4. **The server owns document numbers**, allocated under a row lock with a unique index behind it.
5. **No secrets in the browser.** Service-role key, SMTP password and `DATABASE_URL` are backend-only
   and grep-guarded in CI.
6. **Financial documents are never deleted.** Drafts delete; issued documents cancel, void or
   archive. Payments void. Audit logs are insert-only.
7. **Documents are snapshots.** Item details, currency, notes and terms are copied at save time.
   Changing a setting never rewrites an issued document.
8. **Nothing is faked.** Unbuilt features are absent, not stubbed. Backup produces a real artifact or
   reports failure. WhatsApp opens a message; it does not send the PDF.
9. **Every module ships all five states** — skeleton, empty, error, success, content — and works on
   mobile.
10. **Every authenticated page footer reads exactly** *Designed and Developed by Arun Sanjeev M S*,
    distinct from the configurable business footer on documents.

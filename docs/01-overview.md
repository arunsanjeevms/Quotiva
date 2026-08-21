# 01 — Product Overview & Scope

## What InvoQuo is

InvoQuo is a multi-tenant business document system. A business signs up, configures its own
identity, currency, taxes, numbering and templates, then runs the quote-to-cash cycle:

```
Business
   └── Customers
   └── Catalog (Products / Services)
          └── Quotations ──convert──> Invoices ──> Payments ──> Reports
```

It is deliberately **domain-neutral**. The same deployment serves a freelance designer billing by
the hour, an IT consultancy quoting fixed-price projects, a distributor selling boxed goods by the
kilogram, and a repair shop charging for labour plus parts. No screen, column, default, or label
assumes an industry.

## Target users

Freelancers · consultants · IT companies · agencies · retail businesses · service providers ·
contractors · manufacturers · distributors · repair businesses · professional service firms · SMBs.

The practical implication: a business may sell **only services**, **only products**, or both. Units
may be hours, days, pieces, kilograms, metres, boxes, or something the admin invents. Tax may be a
single rate, several components, inclusive or exclusive, or absent entirely.

## Document lifecycle

```
Quotation:  Draft → Sent → Viewed → Accepted → Converted
                              ↘ Rejected
                              ↘ Expired
                              ↘ Cancelled

Invoice:    Draft → Sent → (Viewed) → Cancelled / Void
Payment:    derived → Unpaid → Partially Paid → Paid
                                  ↘ Overdue (due_date passed, balance > 0)
```

Two independent axes on an invoice: **document status** (draft / sent / cancelled / void) and
**payment status** (derived from payment records, never submitted by a client). See
`06-calculation-engine.md`.

Conversion is one-directional and non-destructive: converting a quotation copies its customer,
items, quantities, prices, discounts, taxes, notes and terms into a new invoice, marks the quotation
`converted`, and records `invoices.quotation_id`. The quotation's own figures are never mutated.

## The genericness charter

The following must **never** appear as a literal in application source code. Each one is a row in a
database table or a field in `business_settings`, editable from Settings by an administrator.

| Category | Examples of what is forbidden as a code literal |
|---|---|
| Business identity | name, logo, phone, email, website, address, registration numbers |
| Currency | code, symbol, decimal places, symbol position, separators |
| Taxes | any named regime (GST, VAT, sales tax), any rate, any component structure |
| Numbering | prefixes, separators, padding, starting numbers, reset frequency |
| Catalog | product categories, units of measure, SKU formats |
| Payments | payment method names, bank fields, payment instructions |
| Documents | terms, notes, footers, email copy, template choice |
| Roles | permission assignments beyond the three seeded role templates |

Where the docs mention `GST`, `VAT`, `INR`, `18%`, `QUO-`, or `Piece`, they are **illustrations of
configured values**, never specifications. A reviewer should be able to grep the finished source for
any of these strings and find only test fixtures and seed rows.

### Seed data policy

A newly created business receives a small set of *suggested defaults* — a handful of units, a
"No Tax" entry, a few payment methods, one document template selection. These are **inserted rows**,
fully editable and deletable by the admin. They are not constants in code and no code path may
assume they still exist. Details in `03-database-schema.md`.

## Non-goals for this build

These are **architected for but not implemented**. No stub UI, no fake success state, no menu entry
that leads nowhere.

- Inventory / stock tracking (a `features.inventory` flag and reserved columns exist; module absent)
- Purchase management, expenses, credit notes, debit notes
- Online payment gateways, recurring card payments, subscription billing
- Customer portal, public invoice/quotation links
- WhatsApp Business API (see below)
- Multi-currency *transactions* (per-document `currency_code` is stored; FX conversion is not)
- Multi-branch (`branch_id` reserved on document tables; no branch module)
- Webhooks, public API keys, mobile app, PWA

### Two honesty rules that constrain the UI

1. **WhatsApp sharing opens WhatsApp with a pre-filled text message** via a `wa.me` deep link. It
   does not transmit the PDF. UI copy says "Share via WhatsApp" and the message contains document
   details — never a claim that the file was sent.
2. **Backup performs a real export.** The backend runs a genuine `pg_dump`-based export with
   server-held credentials and returns a signed download link, or it reports a failure. There is no
   button that prints "Backup completed" without producing an artifact. See `09-operations.md`.

## Cross-cutting requirements

- **Tenant isolation** enforced in the database via RLS, not in React. `04-rls-and-security.md`.
- **Server-authoritative money.** Prices, discounts, taxes and totals sent by a client are
  recalculated server-side and the client's numbers discarded. `06-calculation-engine.md`.
- **Server-generated document numbers** under a row lock, unique per business at the DB level.
- **No secrets in the browser.** Service-role key, SMTP password and database credentials exist only
  in backend environment variables. `02-architecture.md`.
- **Financial documents are not deleted.** Drafts may be deleted; issued documents are cancelled,
  voided or archived, preserving history. Audit log records every mutation.
- **Light theme, professional density.** `07-frontend-design-system.md`.
- Every authenticated page footer reads exactly: **Designed and Developed by Arun Sanjeev M S**.
  This is fixed application chrome and is distinct from the configurable business footer that
  appears on documents.

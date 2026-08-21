# 05 — REST API Specification

Base path `/api`. All routes except `/api/health` and the auth helpers require a bearer token.

## Conventions

### Request headers

```
Authorization: Bearer <supabase access_token>
X-Business-Id: <uuid>          # required on every business-scoped route
Content-Type: application/json
```

`X-Business-Id` is resolved against `business_members`; non-membership returns **404**, not 403, so
a caller cannot probe for the existence of other tenants.

### Response envelope

```jsonc
// success
{ "data": { ... } }
{ "data": [ ... ], "meta": { "page": 1, "pageSize": 25, "total": 137, "totalPages": 6 } }

// error
{ "error": { "code": "VALIDATION_ERROR", "message": "Invalid request body",
             "details": [ { "path": "items.0.quantity", "message": "must be greater than 0" } ] },
  "requestId": "0f3c…" }
```

Status codes: `200` read/update, `201` create, `204` no content, `400` validation,
`401` unauthenticated, `403` permission denied, `404` not found / not a member, `409` conflict
(state machine, duplicate number), `422` business-rule violation, `429` rate limited, `500` internal.

### Error codes

| Code | Meaning |
|---|---|
| `VALIDATION_ERROR` | Zod rejection; `details` lists field paths |
| `UNAUTHENTICATED` | missing/invalid/expired token |
| `PERMISSION_DENIED` | authenticated, lacks the permission key |
| `NOT_FOUND` | record absent or belongs to another business |
| `INVALID_STATE_TRANSITION` | e.g. converting an unaccepted quotation |
| `DUPLICATE_NUMBER` | unique violation on document number |
| `NUMBER_ALLOCATION_FAILED` | retries exhausted |
| `OVERPAYMENT` | payment exceeds outstanding balance |
| `REFERENCED_RECORD_IN_USE` | delete blocked by an FK (e.g. tax used on documents) |
| `INVALID_FILE_TYPE` / `FILE_TOO_LARGE` | upload validation |
| `PDF_GENERATION_FAILED` | Puppeteer failure or timeout |
| `EMAIL_SEND_FAILED` | SMTP failure; includes the transport message in `details` |
| `EMAIL_NOT_CONFIGURED` | SMTP not set up for the business |
| `RATE_LIMITED` | throttle hit |
| `INTERNAL_ERROR` | unexpected; detail logged, not returned |

### List conventions

Every collection endpoint accepts:

```
?page=1&pageSize=25          pageSize max 100
&sort=issue_date&order=desc  sort restricted to an allowlist per resource
&q=acme                      server-side search
&from=2026-01-01&to=2026-12-31
&status=sent,viewed          CSV of enum values
&customerId=<uuid>
&includeArchived=false
```

Filtering, sorting, searching and pagination are **always server-side**. No endpoint returns an
unbounded collection.

---

## Auth & profile

| Method | Path | Permission | Notes |
|---|---|---|---|
| `GET` | `/auth/me` | authenticated | user profile + memberships + active business + permission set |
| `PUT` | `/auth/profile` | authenticated | name, phone; email changes go through Supabase |
| `POST` | `/auth/avatar` | authenticated | multipart; validated per `04` §6 |
| `POST` | `/auth/change-password` | authenticated | re-auths with current password first |
| `POST` | `/auth/logout` | authenticated | audit `auth.logout`; token revocation via Supabase |

Sign-in, sign-up, password-reset email and reset-completion happen **client-side against Supabase
Auth**. The backend records `auth.login` when the client first calls `/auth/me` with a new session.

## Businesses & members

```
GET    /businesses                       list businesses the user belongs to
POST   /businesses                       create + bootstrap (03 §15)
GET    /businesses/:id                   business.read (membership)
PUT    /businesses/:id                   business.update
GET    /businesses/:id/members           user.read
POST   /businesses/:id/members           user.manage   (invite by email)
PUT    /businesses/:id/members/:memberId user.manage   (role / status)
DELETE /businesses/:id/members/:memberId user.manage   (blocked for the last super admin)
GET    /roles                            role.manage | settings.read
POST   /roles                            role.manage
PUT    /roles/:id                        role.manage   (system roles rejected)
DELETE /roles/:id                        role.manage   (blocked if assigned)
GET    /permissions                      authenticated (catalogue)
```

## Dashboard

```
GET /dashboard?range=this_month&from=&to=
```
`range` ∈ `today | yesterday | this_week | this_month | last_month | this_quarter | this_year | custom`.

```jsonc
{ "data": {
  "kpis": { "revenue": "…", "paymentsReceived": "…", "outstanding": "…",
            "invoiceCount": 0, "paidCount": 0, "pendingCount": 0, "overdueCount": 0,
            "quotationCount": 0, "acceptedCount": 0, "rejectedCount": 0,
            "customerCount": 0, "productCount": 0 },
  "revenueTrend":   [ { "period": "2026-08", "invoiced": "…", "collected": "…" } ],
  "invoiceStatus":  [ { "status": "paid", "count": 12, "amount": "…" } ],
  "quotationStatus":[ { "status": "accepted", "count": 5, "amount": "…" } ],
  "topCustomers":   [ { "customerId": "…", "name": "…", "invoiced": "…", "paid": "…" } ],
  "topItems":       [ { "productId": "…", "name": "…", "quantity": "…", "revenue": "…" } ],
  "recentActivity": [ … ]
} }
```

All money values are **strings** in every response, to survive JSON's float representation. The
frontend formats them with the business's currency settings and never does arithmetic on them.

## Customers

```
GET    /customers                     customer.read
POST   /customers                     customer.create
GET    /customers/:id                 customer.read     (includes stats block)
PUT    /customers/:id                 customer.update
DELETE /customers/:id                 customer.delete   (archives if referenced, else deletes)
POST   /customers/:id/archive         customer.update
POST   /customers/:id/restore         customer.update
GET    /customers/:id/quotations      customer.read | quotation.read
GET    /customers/:id/invoices        customer.read | invoice.read
GET    /customers/:id/payments        customer.read | payment.read
GET    /customers/:id/activity        customer.read     (audit-derived timeline)
GET    /customers/:id/statement?from&to        report.read
GET    /customers/:id/statement/pdf?from&to    report.read
POST   /customers/:id/statement/send           report.read + invoice.send
GET    /customers/export?format=csv|xlsx       customer.export
POST   /customers/import/validate              product.import (multipart)
POST   /customers/import/commit                product.import
```

`GET /customers/:id` stats block: `quotationCount`, `invoiceCount`, `totalInvoiced`, `totalPaid`,
`outstanding`, `lastTransactionAt` — all computed server-side.

## Catalog

```
GET|POST         /products                    product.read | product.create
GET|PUT|DELETE   /products/:id                product.read | product.update | product.delete
POST             /products/:id/archive        product.update
GET              /products/export             customer.export
POST             /products/import/validate    product.import
POST             /products/import/commit      product.import

GET|POST         /categories                  catalog.*
GET|PUT|DELETE   /categories/:id              catalog.*
GET|POST         /units                       catalog.*
GET|PUT|DELETE   /units/:id                   catalog.*
GET|POST         /taxes                       tax.*
GET|PUT|DELETE   /taxes/:id                   tax.*
```

`?kind=product|service` filters `/products` for the two sidebar entries. Deleting a category, unit
or tax that is referenced by a document returns `REFERENCED_RECORD_IN_USE`; the client is offered
archive instead.

## Quotations

```
GET    /quotations                    quotation.read
POST   /quotations                    quotation.create
GET    /quotations/:id                quotation.read   (items, charges, history, custom fields)
PUT    /quotations/:id                quotation.update (blocked once converted)
DELETE /quotations/:id                quotation.delete (draft only)
POST   /quotations/:id/duplicate      quotation.create
POST   /quotations/:id/status         quotation.update  { status, note }
POST   /quotations/:id/send           quotation.send    { to[], cc[], subject, body, attachPdf }
POST   /quotations/:id/convert        quotation.convert { issueDate?, dueDate?, overrides? }
POST   /quotations/:id/cancel         quotation.cancel  { reason }
POST   /quotations/:id/archive        quotation.update
GET    /quotations/:id/preview        quotation.read    → text/html
GET    /quotations/:id/pdf            quotation.read    → application/pdf
GET    /quotations/:id/whatsapp       quotation.read    → { url, message }
GET    /quotations/export             report.export
```

### Create/update body

```jsonc
{
  "customerId": "uuid",
  "issueDate": "2026-08-21",
  "validUntil": "2026-09-20",
  "currencyCode": "…",              // optional; defaults to customer → business
  "taxMode": "exclusive",
  "templateId": "uuid",
  "reference": "PO-4471",
  "discountType": "percentage",     // document-level
  "discountValue": "5",
  "items": [
    { "source": "catalog", "productId": "uuid", "quantity": "2", "unitPrice": "150.00",
      "discountType": "fixed", "discountValue": "10", "taxId": "uuid", "notes": "…" },
    { "source": "custom",  "name": "On-site configuration", "description": "…",
      "unitId": "uuid", "quantity": "3.5", "unitPrice": "80", "taxId": "uuid",
      "saveToCatalog": true, "catalogKind": "service" }
  ],
  "charges": [ { "label": "Delivery", "amount": "25", "isTaxable": true, "taxId": "uuid" } ],
  "customNotes": "<p>…</p>",        // absent → business default; null → cleared (doc 12)
  "termsAndConditions": "<ol>…</ol>",
  "includeNotes": true,
  "includeTerms": true,
  "paymentInstructions": "…",
  "internalNotes": "…",
  "customFields": { "project_code": "X-19" }
}
```

**Ignored if sent:** `id`, `businessId`, `quotationNumber`, `status`, any total field, any
`line_total`/`tax_amount` on items. Totals are recomputed (`06`); the number is allocated
server-side (`03` §5).

`saveToCatalog: true` on a custom item additionally creates a `products` row (requires
`product.create`; silently skipped without it, with a warning in the response `meta`).

`POST /:id/convert` requires `status = 'accepted'`, is idempotent per quotation (a second call
returns the existing invoice with `409 INVALID_STATE_TRANSITION` unless `?force=true` and
`quotation.convert`), copies the item snapshot and the notes/terms snapshot, sets
`invoices.quotation_id`, and moves the quotation to `converted`.

## Invoices

```
GET    /invoices                      invoice.read
POST   /invoices                      invoice.create
GET    /invoices/:id                  invoice.read
PUT    /invoices/:id                  invoice.update  (blocked when cancelled/void or fully paid)
DELETE /invoices/:id                  invoice.delete  (draft only)
POST   /invoices/:id/duplicate        invoice.create
POST   /invoices/:id/status           invoice.update
POST   /invoices/:id/send             invoice.send
POST   /invoices/:id/cancel           invoice.cancel  { reason }
POST   /invoices/:id/void             invoice.void    { reason }  (blocked if payments exist)
POST   /invoices/:id/archive          invoice.update
GET    /invoices/:id/preview          invoice.read → text/html
GET    /invoices/:id/pdf              invoice.read → application/pdf
GET    /invoices/:id/whatsapp         invoice.read → { url, message }
GET    /invoices/:id/payments         payment.read
POST   /invoices/:id/reminders/send   invoice.send
GET    /invoices/export               report.export
```

Body mirrors quotations, plus `dueDate` and `quotationId`, minus `validUntil`. Same notes/terms
semantics with invoice defaults.

## Payments

```
GET    /payments                      payment.read
POST   /payments                      payment.create  { invoiceId, amount, paymentDate,
                                                        paymentMethodId, referenceNumber, notes }
GET    /payments/:id                  payment.read
PUT    /payments/:id                  payment.update  (amount/date/method/reference)
POST   /payments/:id/void             payment.void    { reason }
GET    /payments/:id/receipt/pdf      payment.read
POST   /payments/:id/receipt/send     payment.read + invoice.send
GET    /payments/export               report.export

GET|POST       /payment-methods       settings.read | settings.update
PUT|DELETE     /payment-methods/:id   settings.update
```

`POST /payments` recomputes the invoice's `amount_paid`, `amount_due` and `payment_status` in the
same transaction and rejects `amount > amount_due` with `OVERPAYMENT` (`details.outstanding` tells
the client the maximum). Voiding a payment reverses the same recomputation.

## Recurring invoices & reminders

```
GET|POST        /recurring-invoices               recurring.read | recurring.create
GET|PUT|DELETE  /recurring-invoices/:id           recurring.*
POST            /recurring-invoices/:id/generate  recurring.generate  → creates due invoice(s)
POST            /recurring-invoices/:id/pause     recurring.update
GET             /recurring-invoices/:id/history   recurring.read

GET|POST        /reminder-rules                   settings.read | settings.update
PUT|DELETE      /reminder-rules/:id               settings.update
GET             /reminders/due                    invoice.read   → invoices matching active rules
POST            /reminders/run                    invoice.send   → sends due reminders, logs each
```

`/reminders/run` is manual in this build; it is the exact entry point a scheduler would call later.

## Reports

```
GET /reports/sales?range&from&to&groupBy=day|week|month|customer
GET /reports/invoices?from&to&customerId&status&paymentStatus
GET /reports/quotations?from&to&customerId&status
GET /reports/payments?from&to&customerId&methodId
GET /reports/taxes?from&to                → per tax rate: taxable base, tax collected, doc count
GET /reports/customers?from&to            → invoiced, paid, outstanding per customer
```

All require `report.read`. Each accepts `&format=json|csv|xlsx|pdf` (`report.export` for non-json).
Every report is computed in SQL with parameterized queries and paginated; none loads a full table
into Node.

## Settings

```
GET|PUT /settings                     settings.read | settings.update  (whole object)
GET|PUT /settings/business            business.update
GET|PUT /settings/branding            settings.update
GET|PUT /settings/currency            settings.update
GET|PUT /settings/documents           settings.update   ← notes/terms defaults (doc 12)
GET     /settings/documents/defaults?type=quotation|invoice   settings.read
GET|PUT /settings/numbering           settings.update
GET     /settings/numbering/preview?documentType=invoice      settings.read → sample number
GET|PUT /settings/payment             settings.update
GET|PUT /settings/email               settings.update
POST    /settings/email/test          settings.update   → sends a test email
GET|PUT /settings/notifications       settings.update
GET|PUT /settings/templates           settings.update
GET     /templates                    settings.read     (available document templates)
GET|POST|PUT|DELETE /email-templates[/:id]              settings.*
GET|POST|PUT|DELETE /custom-fields[/:id]                settings.*
```

## Uploads, notifications, audit, backup, search

```
POST   /uploads/:kind                 kind ∈ logo|favicon|payment-qr|avatar|attachment
                                      multipart; validated per 04 §6; returns { path, signedUrl }
DELETE /attachments/:id               attachment.delete

GET    /notifications?unread=true     authenticated
POST   /notifications/:id/read        authenticated
POST   /notifications/read-all        authenticated

GET    /audit-logs?entityType&entityId&userId&action&from&to    audit.read
GET    /audit-logs/export                                       audit.read + report.export

GET    /backups                       backup.read
POST   /backups                       backup.create  { scope, format } → 202 + job id
GET    /backups/:id                   backup.read    → status, signed download URL when completed

GET    /search?q=…&types=customers,invoices,quotations,products,payments   authenticated
       → grouped results, each honouring the caller's per-module read permission
```

`GET /health` is unauthenticated and returns build info plus a DB round-trip check.

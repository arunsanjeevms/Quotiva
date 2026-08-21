# 02 — System Architecture

## Repository layout

```
InvoQuo/
├── docs/                          # this documentation set
├── frontend/
│   ├── public/
│   ├── src/
│   │   ├── components/
│   │   │   ├── ui/                # design-system primitives (Button, Table, Modal…)
│   │   │   ├── forms/             # composed form controls bound to RHF
│   │   │   ├── documents/         # line-item editor, totals panel, preview frame
│   │   │   └── charts/            # Recharts wrappers
│   │   ├── layouts/               # AppLayout, AuthLayout, SettingsLayout
│   │   ├── pages/                 # one folder per module
│   │   ├── routes/                # route tree, ProtectedRoute, PermissionRoute
│   │   ├── hooks/                 # useAuth, useBusiness, useBranding, useCurrency…
│   │   ├── services/              # one module per API resource, typed
│   │   ├── lib/                   # apiClient, supabaseClient, formatters, utils
│   │   ├── schemas/               # Zod schemas shared with forms
│   │   ├── stores/                # React Contexts (session, business, ui)
│   │   ├── types/                 # shared TS types mirroring API contracts
│   │   └── styles/
│   ├── index.html
│   ├── tailwind.config.ts
│   ├── vite.config.ts
│   └── package.json
├── backend/
│   ├── src/
│   │   ├── routes/                # express Routers, no logic
│   │   ├── controllers/           # HTTP in/out, delegates to services
│   │   ├── services/              # business logic
│   │   ├── repositories/          # all Supabase/Postgres access
│   │   ├── middleware/            # auth, tenant, permissions, validate, errors, rateLimit
│   │   ├── validators/            # Zod request schemas
│   │   ├── templates/             # document HTML/CSS + email templates
│   │   ├── utils/                 # money, dates, csv, numbering helpers
│   │   ├── config/                # env parsing, supabase clients, constants
│   │   ├── types/
│   │   ├── app.ts
│   │   └── server.ts
│   ├── Dockerfile                 # includes Chromium for Puppeteer
│   └── package.json
├── supabase/
│   ├── migrations/                # numbered SQL migrations
│   ├── seed/                      # optional dev seed
│   └── config.toml
├── .env.example
├── package.json                   # workspace root (scripts only)
└── README.md
```

Root `package.json` uses npm workspaces with scripts `dev`, `build`, `typecheck`, `lint` that fan
out to both packages.

## Request path

```
 Browser (React)
   │  supabase-js: sign in / refresh / sign out  ────────────────► Supabase Auth
   │  (session only — never data queries)
   │
   │  fetch via lib/apiClient.ts
   │  Authorization: Bearer <supabase access_token>
   │  X-Business-Id: <uuid>
   ▼
 Express
   ├─ helmet · cors(allowlist) · json limit · requestId · rateLimit
   ├─ authenticate      → verifies JWT with Supabase, loads user
   ├─ resolveTenant     → checks business_members, attaches req.business + req.role
   ├─ authorize(perm)   → checks role_permissions
   ├─ validate(schema)  → Zod on body / params / query
   ▼
 Controller           HTTP concerns only: parse req, call service, shape response
   ▼
 Service              business logic, calculations, transactions, audit, notifications
   ▼
 Repository           the only layer that touches Supabase/Postgres
   ▼
 Supabase Postgres    RLS enforced, constraints enforced
```

**Rule:** no business logic in routes or controllers; no Supabase client imported outside
`repositories/` (and `config/supabase.ts`).

## The secret boundary

| Where | Variable | Notes |
|---|---|---|
| Frontend (`VITE_` prefix, shipped to browser) | `VITE_SUPABASE_URL` | public |
| | `VITE_SUPABASE_PUBLISHABLE_KEY` | anon/publishable key, RLS-constrained |
| | `VITE_API_BASE_URL` | public |
| Backend only (never `VITE_`) | `SUPABASE_URL` | |
| | `SUPABASE_SERVICE_ROLE_KEY` | full DB access, bypasses RLS |
| | `SUPABASE_JWT_SECRET` *(optional, local verify)* | |
| | `DATABASE_URL` | used by backup/pg_dump only |
| | `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASSWORD` / `SMTP_SECURE` | |
| | `MAIL_FROM_NAME` / `MAIL_FROM_EMAIL` | |
| | `APP_ORIGIN`, `PORT`, `NODE_ENV` | |

Enforcement: Vite only exposes `VITE_`-prefixed vars, so the boundary is structural. A CI grep for
`SERVICE_ROLE|SMTP_PASSWORD|DATABASE_URL` under `frontend/` guards against regression.

## Two Supabase clients on the backend

- **`supabaseAdmin`** — service-role key. Used by repositories for all data access. Bypasses RLS, so
  every repository method takes `businessId` and filters on it. This filtering is mandatory and is
  the primary isolation mechanism at the API layer.
- **`supabaseAuth`** — anon key, used to verify a caller's JWT (`auth.getUser(token)`) and for
  auth-related flows.

### Why RLS is still mandatory

The service-role key bypasses RLS, so RLS is not what protects the REST API — repository-level
`business_id` filtering is. RLS exists because:

1. **Defense in depth.** A repository method that forgets its `business_id` filter is a bug; RLS
   turns some classes of that bug into a denial rather than a leak (for any code path that uses a
   user-scoped client).
2. **Direct client access.** The frontend's supabase-js client holds a user JWT. Any present or
   future direct usage (Realtime subscriptions, Storage reads) is governed only by RLS.
3. **Storage.** Bucket policies are the only control on object access.
4. **Ad-hoc access.** SQL editor sessions and future integrations authenticating as a user.

So: **repository filtering AND RLS**, both, always.

## Frontend state

- **Server state** — TanStack Query. One query-key factory per resource
  (`['invoices', businessId, filters]`). Mutations invalidate narrowly. Business id is part of every
  key so switching business flushes cleanly.
- **Session** — `SessionContext` wraps supabase-js `onAuthStateChange`; exposes user, session,
  loading, and `signIn/signOut/resetPassword/updatePassword`.
- **Business** — `BusinessContext` holds the active business, membership role, permission set, and
  settings. Powers `usePermission('invoice.create')` for conditional UI.
- **Branding** — `BrandingProvider` writes primary/secondary colors into CSS custom properties on
  `:root` at runtime and swaps the favicon. Branding is therefore data, not build config.
- **UI** — toast queue, confirm dialog, sidebar collapse state (persisted to localStorage).

No Redux; no global mutable store beyond these contexts.

## Document rendering: one template, two outputs

Templates live in `backend/src/templates/documents/` as HTML + CSS producing a complete standalone
page.

```
 Template (HTML + CSS, {{data}})
        │
        ├─► GET /api/invoices/:id/preview  → HTML string → rendered in an <iframe srcdoc>
        │
        └─► GET /api/invoices/:id/pdf      → Puppeteer page.setContent → page.pdf()
```

The same string feeds both, so **preview cannot drift from the PDF**. Print from the preview uses
the iframe's own print, which uses the same CSS.

Multi-page handling is CSS, specified once in the shared template base:
`thead { display: table-header-group }` repeats item headers, `tr { break-inside: avoid }`,
`.totals { break-inside: avoid }`, and Puppeteer `headerTemplate`/`footerTemplate` carry the page
counter. Page size (`A4` | `Letter`) and margins come from business settings.

Puppeteer runs a shared, lazily-launched browser instance with a page pool cap and a hard timeout;
failures return a typed `PDF_GENERATION_FAILED` error rather than a partial file.

## Extension seams

Built now so later features do not require migrations that rewrite existing tables:

| Future feature | Seam present from day one |
|---|---|
| Inventory | `business_settings.features` jsonb with `inventory: false`; `products.track_inventory`, `products.stock_quantity` columns exist and are ignored |
| Multi-currency | `currency_code`, `exchange_rate` (default 1) stored per document, not only per business |
| Multi-branch | `branch_id uuid null` on quotations/invoices/payments; no FK target yet |
| Public links | `public_token uuid null` + `public_enabled boolean` on documents |
| Webhooks | `audit_logs` already carries a machine-readable `action` + `metadata`; an outbox consumer can be added over it |
| Credit/debit notes | document tables share a common column shape, making a `document_type` sibling table straightforward |
| Customer portal | RBAC permission keys are strings, so a `portal:*` role slots in |

Nothing in the UI references these until the corresponding module is built.

## Error handling

A single `AppError { code, httpStatus, message, details? }` type. Services throw it; a terminal
Express error middleware serializes it to the standard envelope and logs with the request id.
Unexpected errors become `INTERNAL_ERROR` with the detail withheld from the response but logged.
The frontend `apiClient` unwraps the envelope, throws a typed `ApiError`, and TanStack Query surfaces
it to the per-module error state.

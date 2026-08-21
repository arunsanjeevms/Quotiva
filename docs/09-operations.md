# 09 — Operations, Environment & Backup

## 1. Environment variables

### Frontend — `frontend/.env` (shipped to the browser)

| Variable | Purpose |
|---|---|
| `VITE_SUPABASE_URL` | Supabase project URL — public by design |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | anon / publishable key; RLS-constrained |
| `VITE_API_BASE_URL` | e.g. `http://localhost:4000/api` |
| `VITE_APP_NAME` | app shell title fallback before branding loads |

**Nothing else.** Vite only exposes `VITE_`-prefixed variables, so the boundary is structural. If a
value must not be public, it must not carry the prefix — and must not live in `frontend/` at all.

### Backend — `backend/.env` (never sent to a browser)

| Variable | Purpose |
|---|---|
| `NODE_ENV`, `PORT` | runtime |
| `APP_ORIGIN` | CORS allowlist, comma-separated |
| `SUPABASE_URL` | |
| `SUPABASE_SERVICE_ROLE_KEY` | **secret** — full DB access, bypasses RLS |
| `SUPABASE_ANON_KEY` | used to verify caller JWTs |
| `DATABASE_URL` | **secret** — direct Postgres connection, used only by backup/`pg_dump` |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE` | mail transport |
| `SMTP_USER`, `SMTP_PASSWORD` | **secret** |
| `MAIL_FROM_NAME`, `MAIL_FROM_EMAIL` | envelope defaults; per-business overrides live in settings |
| `PUPPETEER_EXECUTABLE_PATH` | Chromium path in container images |
| `PDF_TIMEOUT_MS` | default 30000 |
| `RATE_LIMIT_*` | overrides for the limits in `04` §7 |
| `LOG_LEVEL` | |

`backend/src/config/env.ts` parses this with Zod at boot and **exits on missing or malformed
required values** — no lazy `process.env.X!` reads scattered through the code.

### Guardrail

CI runs, and it must return nothing:

```bash
grep -rInE "SERVICE_ROLE|SMTP_PASSWORD|DATABASE_URL|SUPABASE_SERVICE" frontend/src frontend/.env* \
  || echo "clean"
```

`.env` files are gitignored; `.env.example` files at repo root and in each package list every
variable with placeholder values and a comment marking the secrets.

---

## 2. Supabase project setup

1. Create a project at supabase.com. Record the project URL, anon key and service-role key.
2. Settings → Database → note the connection string for `DATABASE_URL` (use the **session** pooler
   URI for `pg_dump`; the transaction pooler does not support it).
3. Authentication → Providers → Email: enable, decide on email confirmation, set the site URL and
   add `<APP_ORIGIN>/reset-password` to the redirect allowlist.
4. Authentication → Email Templates: adjust the reset/confirm copy.
5. Storage → create four **private** buckets: `business-assets`, `avatars`, `documents`,
   `attachments`. Leave "Public bucket" off for all four.
6. Apply migrations (§3).
7. Verify: run the schema checks in `03-database-schema.md` §16 and the RLS script in
   `04-rls-and-security.md` §8. Both must pass before any application traffic.

### Applying migrations

Preferred — Supabase CLI:

```bash
npm i -g supabase
supabase link --project-ref <ref>
supabase db push            # applies supabase/migrations in order
```

Alternative — dashboard SQL editor: paste each file from `supabase/migrations/` in filename order,
one at a time, checking for errors. Migrations are ordered, additive and idempotent where possible
(`create table if not exists`, `create policy` guarded by a prior `drop policy if exists`).

Never edit an applied migration. Fix forward with a new numbered file.

---

## 3. Local development

```bash
# once
cp .env.example .env
cp frontend/.env.example frontend/.env
cp backend/.env.example backend/.env
npm install                     # workspaces install both packages

# every day
npm run dev                     # concurrently: vite (5173) + backend (4000, tsx watch)

# individually
npm run dev --workspace frontend
npm run dev --workspace backend

# quality gates
npm run typecheck               # tsc --noEmit, strict, both packages
npm run lint
npm run test                    # vitest; calculation-engine fixtures live here
npm run build                   # vite build + tsc build
```

TypeScript is `strict: true` in both packages, plus `noUncheckedIndexedAccess`,
`exactOptionalPropertyTypes` and `noImplicitOverride`.

---

## 4. Deployment

**Frontend** — static build (`frontend/dist`) on any static host (Vercel, Netlify, Cloudflare
Pages, S3+CDN). SPA fallback to `index.html`. Set the three `VITE_` variables at build time; they
are baked in, which is fine because all three are public.

**Backend** — a container, because Puppeteer needs Chromium.

```dockerfile
FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
      chromium fonts-liberation fonts-noto-color-emoji ca-certificates postgresql-client \
    && rm -rf /var/lib/apt/lists/*
ENV PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
WORKDIR /app
COPY package*.json ./ ; COPY backend/package*.json backend/
RUN npm ci --workspace backend --omit=dev
COPY backend/ backend/
RUN npm run build --workspace backend
USER node
EXPOSE 4000
CMD ["node", "backend/dist/server.js"]
```

`postgresql-client` is included for `pg_dump` (§6). Run Chromium with `--no-sandbox` only if the
platform forbids user namespaces; prefer a platform that allows the sandbox.

Sizing: Chromium wants ~512 MB headroom per concurrent render. The PDF service keeps one browser
instance with a bounded page pool (default 3) and a `PDF_TIMEOUT_MS` per render; queued requests
beyond the pool wait, and the endpoint is rate-limited per business.

Health check: `GET /api/health` returns build info and a DB round-trip.

---

## 5. Email

SMTP credentials are backend environment variables. The Settings → Email screen exposes only sender
name, reply-to, an enable toggle and a Send Test Email button; it shows the configured host
read-only and **never renders a password field**, because the app does not store SMTP passwords per
business in this build.

Send failures are surfaced honestly: the API returns `EMAIL_SEND_FAILED` with the transport message,
a notification is created, an audit entry is written, and the document's `sent_at` is **not** set —
a failed send never marks a document as sent.

---

## 6. Backup

### What the application does

`POST /api/backups` inserts a `backup_jobs` row (`queued`) and hands it to an in-process worker.
The job reaches `completed` **only after an artifact exists in storage**, and the UI reflects the
real row state. A failed job stores its error and shows it. There is no simulated success anywhere
in the codebase.

Two scopes:

| Scope | Who | What it produces |
|---|---|---|
| `business_export` | business admin (`backup.create`) | a ZIP of CSVs — every table for **that tenant only**, generated through the same tenant-filtered repositories, so it can never leak another business's rows |
| `full_dump` | operator / super admin | `pg_dump --no-owner --no-privileges` of the whole database, using `DATABASE_URL` from backend env |

Artifacts land in `documents/{business_id}/backups/{job_id}.{zip|sql}` in the **private** bucket.
Download links are signed URLs with a **5-minute** TTL, minted per click, never stored. Credentials
are never exposed to the client under any scope.

Retention: artifacts older than 7 days are purged by a maintenance routine; `backup_jobs` rows are
kept for the audit trail with `path` nulled.

### Production backup guidance (the part that actually matters)

Application-initiated export is a convenience for data portability. It is **not** the disaster
recovery strategy. Operators must:

1. **Rely on Supabase's managed backups.** Paid plans provide daily backups; Pro and above offer
   Point-in-Time Recovery. Enable PITR and confirm the retention window meets your RPO. Free-tier
   projects have no managed backup — do not run production on free tier.
2. **Take off-platform copies.** Schedule `pg_dump` from a machine you control (CI job, small VM,
   cron) to storage in a different provider. A backup that lives only inside the same account as the
   database is not an off-site backup.
3. **Encrypt at rest** — `gpg` or your object store's SSE-KMS — and restrict access to the bucket.
4. **Test restores.** An untested backup is a hypothesis. Restore into a scratch project quarterly
   and run the verification queries from `03` §16 and `04` §8 against it.
5. **Back up Storage objects too.** `pg_dump` captures rows, not files. Logos, attachments and
   generated PDFs live in Storage and need their own sync (`supabase storage cp -r` or the S3
   protocol endpoint).
6. **Record the recovery runbook**: where dumps live, how to restore, who holds the keys, expected
   RTO/RPO. Keep it outside the system it describes.

---

## 7. Observability

Structured JSON logs with a per-request id (`X-Request-Id`, generated when absent and echoed in
every error response). Logged: method, path, status, duration, user id, business id, request id.
**Never logged**: tokens, passwords, SMTP credentials, service-role key, full auth request bodies,
or the contents of notes/terms fields.

Errors carry the request id so a user-reported failure maps to a log line. Recommended additions in
production: an error tracker (Sentry) with PII scrubbing, uptime checks against `/api/health`, and
alerts on PDF and email failure rates.

---

## 8. Operational runbook stubs

| Situation | First action |
|---|---|
| PDFs failing | check `PDF_GENERATION_FAILED` rate, container memory, Chromium presence (`chromium --version` in the container) |
| Emails failing | Send Test Email from Settings; check SMTP credentials and provider rate limits |
| Duplicate document numbers | should be impossible; check the unique indexes exist and inspect `numbering_sequences` for the tenant |
| Cross-tenant data reported | treat as a sev-1: re-run `04` §8 immediately, audit the repository method involved |
| Slow lists/reports | check the indexes in `03` §14 exist and inspect `pg_stat_statements` |
| Storage quota | purge old backup artifacts and generated PDFs (regenerable on demand) |

# Deploying Quotiva (Supabase + Render, free tier)

This is the fastest path from a fresh clone to a working, hosted app: database
on Supabase, **both the API and the frontend on Render** as two free-tier
services in one project. Follow in order.

## 1. Supabase project

1. [supabase.com](https://supabase.com) → New project. Pick a region close to
   where you'll deploy the API.
2. **Settings → API** — copy the **Project URL**, the **anon/publishable key**,
   and the **service_role key**. The service-role key is a secret; never put
   it anywhere that ships to a browser.
3. **Settings → Database** — under "Connection string", copy the **URI**
   (session pooler). Not required for Phase 1, but useful later for backups.
4. Apply the schema, in order:
   ```bash
   npm i -g supabase
   supabase login
   supabase link --project-ref <your-project-ref>
   supabase db push
   ```
   This runs `supabase/migrations/0001_init.sql` → `0003_numbering.sql`.
   No local Docker/Postgres needed — `db push` runs directly against your
   hosted project.

   Alternative: open the Supabase SQL editor and paste each migration file's
   contents, in filename order, one at a time.
5. Verify: **Table Editor** should show `businesses`, `customers`,
   `quotations`, `invoices`, etc. Run the checks in
   `docs/03-database-schema.md` §16 and `docs/04-rls-and-security.md` §8 in
   the SQL editor to confirm RLS is actually enforcing isolation before you
   put real data in.
6. **Authentication → URL Configuration** — set the Site URL to your deployed
   frontend URL once you have one (step 2 below), and add
   `<frontend-url>/reset-password` as a redirect URL.

## 2. Deploy both services with the Blueprint (recommended)

Push this repo (including `render.yaml`) to GitHub, then in Render:
**New → Blueprint** → pick the repo. Render reads `render.yaml` and creates
**both** services in one go:

- **`quotiva-api`** — Express backend, root `backend/`
- **`quotiva-frontend`** — static Vite build, root `frontend/`, with a
  catch-all rewrite to `index.html` so React Router's client-side routes
  (e.g. `/invoices/123`) work on a hard refresh, not just 404s.

Render will prompt you to fill in every variable marked `sync: false` in
`render.yaml` before the first deploy — leave the two cross-service URL
fields (`APP_ORIGIN`, `VITE_API_BASE_URL`) blank for now, deploy, then come
back once both services have URLs:

1. **`quotiva-api` → Environment**:
   - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY` — from step 1.2
   - `APP_ORIGIN` — the `quotiva-frontend` service's URL, e.g.
     `https://quotiva-frontend.onrender.com` (no trailing slash)
2. **`quotiva-frontend` → Environment**:
   - `VITE_SUPABASE_URL` — same value as `SUPABASE_URL` above
   - `VITE_SUPABASE_PUBLISHABLE_KEY` — the **anon** key, never the service-role key
   - `VITE_API_BASE_URL` — the `quotiva-api` service's URL + `/api`, e.g.
     `https://quotiva-api.onrender.com/api`
   - `VITE_ENABLE_MOCKS` — set to `false` once the three values above are in,
     so the app switches from the MSW demo to your real backend and Supabase Auth

Saving an environment variable triggers a redeploy of that service
automatically. Once both are live:
- `https://quotiva-api.onrender.com/api/health` → `{"status":"ok",...}`
- `https://quotiva-frontend.onrender.com` → the app (still in demo/mock mode
  until you flip `VITE_ENABLE_MOCKS`)

Then go back to Supabase **Authentication → URL Configuration** and set the
Site URL to the frontend's URL, plus `<frontend-url>/reset-password` as a
redirect URL.

> Free-tier Render web services spin down after 15 minutes idle and take
> ~30–60s to wake on the next request. The static frontend doesn't spin
> down, but its first API call after a backend cold-start will be slow.
> Fine for a demo; for anything real, upgrade the API service's plan or add
> an uptime pinger.

### Manual setup (if you'd rather not use the Blueprint)

Two separate services, same repo:

| | `quotiva-api` | `quotiva-frontend` |
|---|---|---|
| Type | Web Service | Static Site |
| Root directory | `backend` | `frontend` |
| Build command | `npm install && npm run build` | `npm install && npm run build` |
| Start / publish | `npm run start` | Publish directory: `dist` |
| Health check | `/api/health` | — |
| Rewrite rule | — | `/*` → `/index.html` |

Environment variables are the same as listed above.

## 4. Create your first account

Open the deployed frontend → the login screen won't have demo credentials
once `VITE_ENABLE_MOCKS=false`. Use **Forgot password** is not a signup flow —
for now, create the first user directly:

- **Supabase Dashboard → Authentication → Users → Add user** (set email +
  password), or
- Enable email signups in **Authentication → Providers → Email** and add a
  sign-up form later (not built in Phase 1 — this build assumes an
  admin-provisioned first user, per `docs/10-roadmap.md` Phase 2).

Sign in with that user. On first login the backend automatically bootstraps a
business for them (`create_business_bootstrap`), seeded with starter units, a
zero-rate tax, common payment methods and the five-then-nine document
templates — all ordinary, editable rows, per `docs/03-database-schema.md`
§15.

## What's live vs. not yet

This backend implements: auth, multi-tenant bootstrap + RLS, customers,
catalog (products/services/categories/units/taxes), quotations, invoices
(with conversion), payments (with server-derived status), dashboard, six
reports, business/branding/currency/numbering settings, PDF generation
(server-side Puppeteer, mirrors the on-screen preview's 9 templates), and
global search — all with server-recalculated totals and race-safe document
numbering.

**Not yet wired** (return an honest "not implemented" rather than fake data):
email sending, recurring invoice generation, reminders, custom fields, and
real backup export. These are scoped for a later phase — see
`docs/10-roadmap.md` Phase 12 — and the UI says so rather than pretending.

> PDF generation launches a headless Chromium (Puppeteer) inside the
> `quotiva-api` process. `npm install` downloads it automatically during
> Render's build — no extra config needed on the free-tier Node runtime. The
> first PDF request after a cold start is slower (browser launch); after that
> the browser instance is reused.

## Local development against the real backend

```bash
cp backend/.env.example backend/.env      # fill in your Supabase values
cp frontend/.env.example frontend/.env    # fill in the same public values
# in frontend/.env set VITE_ENABLE_MOCKS=false and VITE_API_BASE_URL=http://localhost:4000/api

npm install
npm run dev:backend     # :4000
npm run dev             # :5173 (or next free port)
```

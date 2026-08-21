# Deploying Quotiva (Supabase + Render, free tier)

This is the fastest path from a fresh clone to a working, hosted app: database
on Supabase, API on Render, frontend on any static host. Follow in order.

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
   frontend URL once you have one (step 3 below), and add
   `<frontend-url>/reset-password` as a redirect URL.

## 2. Backend on Render (free tier)

**Option A — Blueprint (recommended).** Push this repo (including
`render.yaml`) to GitHub, then in Render: **New → Blueprint**, pick the repo.
Render reads `render.yaml` and creates the `quotiva-api` web service pointed
at `backend/`.

**Option B — manual.** New → Web Service → connect the repo:

| Setting | Value |
|---|---|
| Root directory | `backend` |
| Build command | `npm install && npm run build` |
| Start command | `npm run start` |
| Health check path | `/api/health` |

Either way, set these environment variables on the service (Render dashboard
→ your service → **Environment**):

| Variable | Value |
|---|---|
| `APP_ORIGIN` | your frontend's URL, e.g. `https://quotiva.vercel.app` (comma-separate if more than one) |
| `SUPABASE_URL` | from step 1.2 |
| `SUPABASE_SERVICE_ROLE_KEY` | from step 1.2 — **secret** |
| `SUPABASE_ANON_KEY` | from step 1.2 |

Deploy. Once live, `https://quotiva-api.onrender.com/api/health` should
return `{"status":"ok",...}`.

> Free-tier Render web services spin down after 15 minutes idle and take
> ~30–60s to wake on the next request. Fine for a demo; for anything real,
> upgrade the plan or add an uptime pinger.

## 3. Frontend

Any static host works (Vercel, Netlify, Render Static Site, Cloudflare
Pages). Build settings:

| Setting | Value |
|---|---|
| Root directory | `frontend` |
| Build command | `npm install && npm run build` |
| Publish directory | `frontend/dist` |

Environment variables (all public — these are safe to expose):

| Variable | Value |
|---|---|
| `VITE_API_BASE_URL` | `https://quotiva-api.onrender.com/api` (your Render URL + `/api`) |
| `VITE_SUPABASE_URL` | same as `SUPABASE_URL` above |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | the **anon** key, never the service-role key |
| `VITE_ENABLE_MOCKS` | `false` — this switches off the MSW mock API and the demo auth provider, so the app talks to your real backend and Supabase Auth |

Deploy, then go back to Supabase **Authentication → URL Configuration** and
set the Site URL to this frontend's actual URL if you hadn't yet.

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
reports, business/branding/currency/numbering settings, and global search —
all with server-recalculated totals and race-safe document numbering.

**Not yet wired** (return an honest "not implemented" rather than fake data):
PDF generation, email sending, recurring invoice generation, reminders,
custom fields, and real backup export. These are scoped for a later phase —
see `docs/10-roadmap.md` Phase 12 — and the UI says so rather than pretending.

## Local development against the real backend

```bash
cp backend/.env.example backend/.env      # fill in your Supabase values
cp frontend/.env.example frontend/.env    # fill in the same public values
# in frontend/.env set VITE_ENABLE_MOCKS=false and VITE_API_BASE_URL=http://localhost:4000/api

npm install
npm run dev:backend     # :4000
npm run dev             # :5173 (or next free port)
```

# ShelleyAutomationLab

An internal lab project-management and equipment-tracking tool for Shelley Automation.

- **Frontend:** React 18 + TypeScript, built with Vite
- **Styling:** Tailwind CSS (PostCSS + Autoprefixer)
- **Icons:** lucide-react
- **Backend:** Supabase (Auth, Postgres, Storage)
- **Deploy target:** Vercel

Navigation is intentionally simple — state-based (`currentPage` + `viewingProjectId`),
no router library.

## Features

- **Dashboard** — your active assigned projects, active equipment loans, and an
  overdue-equipment alert banner, plus quick actions.
- **Projects** — searchable/filterable/sortable project grid with inline status
  changes, create/edit modal (tags, assignments, file uploads with client-side
  image compression), and a project detail overlay.
- **Equipment Loans** — loans grouped into batches per submission, with
  return/return-all/delete-batch actions and file attachments.
- **Activity Log** — paginated, filterable audit trail of all create/update/delete
  actions.
- **Deleted Projects** — soft-deleted projects you can recover.

All file access uses **private** Supabase Storage buckets with 1-hour signed URLs.

---

## 1. Create a Supabase project

1. Go to <https://supabase.com> → **New project**.
2. Once provisioned, open **Settings → API** and copy:
   - **Project URL** → `VITE_SUPABASE_URL`
   - **anon public** key → `VITE_SUPABASE_ANON_KEY`

### Recommended: disable email confirmation (internal use)

For easy internal signup, go to **Authentication → Providers → Email** (or
**Authentication → Sign In / Providers**) and turn **Confirm email** OFF. New users
can then sign in immediately after signing up. (If you leave it on, users must click
the confirmation link in their email before they can sign in.)

## 2. Run the database setup script

Open **SQL Editor** in your Supabase dashboard, paste the entire contents of
[`supabase/setup_database.sql`](supabase/setup_database.sql), and **Run** it.

This creates every table, enables Row Level Security with all policies, adds
triggers and indexes, seeds the labs (Toronto, Cambridge, Windsor, Vancouver,
Calgary), and creates the two **private** storage buckets (`project-files`,
`equipment-loan-files`) with their access policies. It is safe to re-run.

## 3. Configure environment variables (local)

Copy the example file and fill in your values:

```bash
cp .env.example .env
```

```dotenv
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-public-key
```

The app throws a clear error at startup if either variable is missing.

## 4. Install and run locally

```bash
npm install
npm run dev
```

Open the printed URL (default <http://localhost:5173>). Create an account on the
auth screen, then sign in.

Useful scripts:

```bash
npm run typecheck   # TypeScript, no emit
npm run build       # tsc -b && vite build → dist/
npm run preview     # preview the production build
```

---

## 5. Deploy to Vercel

1. Push this repository to GitHub/GitLab/Bitbucket.
2. In Vercel, **Add New… → Project** and import the repo.
3. Vercel auto-detects Vite. The included [`vercel.json`](vercel.json) already sets:
   - **Build command:** `vite build`
   - **Output directory:** `dist`
   - SPA rewrite (`/(.*) → /index.html`)
   - Security headers (`X-Frame-Options`, `X-XSS-Protection`,
     `X-Content-Type-Options`, `Referrer-Policy`)
4. **Set Environment Variables** under **Project → Settings → Environment Variables**.
   Add both, for **Production** _and_ **Preview**:

   | Name                     | Value                          |
   | ------------------------ | ------------------------------ |
   | `VITE_SUPABASE_URL`      | your Supabase project URL      |
   | `VITE_SUPABASE_ANON_KEY` | your Supabase anon public key  |

   > These are `VITE_`-prefixed so they are embedded into the client bundle at
   > build time. The anon key is safe to expose publicly — your data is protected
   > by Row Level Security, not by hiding the key.
5. **Deploy.** Subsequent pushes redeploy automatically.

After the first deploy, add your Vercel domain to Supabase under
**Authentication → URL Configuration** (Site URL / Redirect URLs) if you use any
email-based auth flows.

> This project deploys to **Vercel**, not Netlify — there is intentionally no
> `netlify.toml`.

---

## Project structure

```
src/
  components/   AuthPage, Layout, Modal, Spinner, ProjectForm, ProjectDetail, EquipmentLoanForm
  contexts/     AuthContext, NavigationContext
  lib/          supabase.ts, database.types.ts, utils.ts
  pages/        Dashboard, Projects, Equipment, ActivityLog, DeletedProjects
  App.tsx       state-based navigation shell
  main.tsx      entry point
supabase/
  setup_database.sql   one-paste schema + RLS + storage
vercel.json     SPA rewrite + security headers
```

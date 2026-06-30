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

- **Dashboard** — active projects you're assigned to **or created**, active
  equipment loans, an overdue-equipment alert banner, and quick actions.
- **Projects** — **server-side** searchable/filterable/sortable, paginated project
  grid with inline status changes, create/edit modal (tags, assignments, file
  uploads with client-side image compression), and a project detail overlay.
  Updates appear live across users via Supabase realtime.
- **Equipment** — two tabs:
  - **Loans** — loans grouped into batches per submission, with
    return/return-all/delete-batch actions and file attachments. Returns and
    deletions restock inventory automatically. Live-updating.
  - **Catalog** — add/edit/delete equipment and set per-lab quantities; shows
    "available / total" stock.
- **Inventory tracking** — loaning decrements available stock (and blocks
  over-loaning); returning or deleting a loan restocks it.
- **Activity Log** — paginated, filterable audit trail; card layout on mobile.
- **Deleted Projects** — soft-deleted projects you can recover.
- **Toast notifications** for every create/update/delete/return action.

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
Calgary), creates the two **private** storage buckets (`project-files`,
`equipment-loan-files`) with their access policies, and enables **realtime** on
the `projects` and `equipment_loans` tables (so the live-updating views work). It
is safe to re-run.

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

## Optional: overdue equipment email reminders

A Supabase Edge Function emails contacts whose equipment is past its return date.

1. Create a free [Resend](https://resend.com) account and an API key.
2. Deploy and configure the function (requires the
   [Supabase CLI](https://supabase.com/docs/guides/cli)):
   ```bash
   supabase functions deploy overdue-reminders
   supabase secrets set RESEND_API_KEY=re_xxx FROM_EMAIL=lab@yourdomain.com
   ```
3. Schedule it: edit `supabase/schedule_overdue_reminders.sql` (fill in your
   project ref and key) and run it in the SQL Editor. It runs daily at 9am UTC.

If you skip this, the in-app overdue banner and red "Overdue" badges still work —
you just won't get automated emails.

## Optional: refresh the cropped logo

The nav/login logos load from `public/shelley-icon.png` and
`public/shelley-title.png`, which are whitespace-trimmed versions of your source
JPGs. If you replace the source images, regenerate the trimmed PNGs with:

```bash
npm run crop-logos
```

## Project structure

```
src/
  components/   AuthPage, Layout, Logo, Modal, Spinner, Skeleton, Toast (in context),
                ProjectForm, ProjectDetail, EquipmentLoanForm, EquipmentForm, EquipmentCatalog
  contexts/     AuthContext, NavigationContext, ToastContext
  lib/          supabase.ts, database.types.ts, utils.ts, inventory.ts
  pages/        Dashboard, Projects, Equipment, ActivityLog, DeletedProjects
  App.tsx       state-based navigation shell (pages are lazy-loaded / code-split)
  main.tsx      entry point
public/         logo images (source .jpg + cropped .png)
scripts/        crop-logos.mjs
supabase/
  setup_database.sql              one-paste schema + RLS + storage + realtime
  functions/overdue-reminders/    Edge Function for overdue emails
  schedule_overdue_reminders.sql  cron schedule for the function
vercel.json     SPA rewrite + security headers
```

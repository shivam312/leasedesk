# Architecture

One Next.js web app on Supabase Postgres, with background jobs for billing runs, reminders and alert digests. No microservices. A solo developer must be able to run, understand and deploy all of it.

## Stack

| Layer | Choice | Notes |
| --- | --- | --- |
| Runtime | Node.js 24 LTS | Pinned in `.nvmrc` |
| Framework | Next.js 16, App Router, TypeScript strict | Server components by default; client components only for interactivity. `cacheComponents` is on (see D8) |
| Package manager | pnpm | |
| UI | Tailwind CSS 4 + shadcn/ui (Radix) | Components copied into `src/components/ui`; icons from lucide-react |
| Database | Supabase Postgres, Mumbai region | Row-level security on every table |
| ORM | Drizzle + drizzle-kit | Schema in TypeScript, SQL migrations in `drizzle/` |
| Auth | Supabase Auth (@supabase/ssr, cookie sessions) | Email + password (built); Google login waits for an OAuth client (human task); invites. `src/proxy.ts` refreshes the session and sends signed-out visitors to `/login`; `requireMember()` in `src/lib/auth.ts` checks again in every page and action |
| File storage | Supabase Storage | Lease PDFs, invoice PDFs, TDS certificates, imports |
| Validation | Zod | Every server action validates its input |
| Background jobs | Inngest | Monthly billing run, reminders, daily digests |
| PDF | @react-pdf/renderer | Invoice and report PDFs |
| Email | Resend | Invoices and reminders, delivery status stored |
| Excel | SheetJS | Import templates, report exports, bank statements |
| Tests | Vitest (unit), Playwright (end-to-end) | Unit tests sit next to code in `__tests__/`. Playwright runs at 375px and 1280px against a production build |
| Hosting | Vercel + Supabase | Daily database backups |
| Monitoring | Sentry | Added in Milestone 8 |

## Folder layout

This is the target layout. What exists at the end of M3: the app shell; sign-up, login and invites under `(auth)/`; Settings (business details, billing rules, team), Leases (lease list, `leases/new` for the four-step form, also used to copy (`?copy=<id>`) and renew (`?renew=<id>`), the lease page `leases/[id]` with End early, and buildings, units and stacking plan), and Tenants under `(app)/`; `lib/billing/`, `lib/settings/`, `lib/auth/`, `lib/db/` (schema, `scoped.ts`, `activity-log.ts`), `lib/india/`, `lib/property/`, `lib/tenants/`, `lib/leases/`, `lib/supabase/`, `lib/today.ts`; `server/actions/`; `proxy.ts`; error and not-found pages for the signed-in app. Invoices, payments, imports, exports, alerts and jobs arrive with their milestones.

```
src/
  app/
    (auth)/                  login, signup, invite acceptance
    (app)/                   signed-in app, shared layout with the 5-item nav
      today/                 home screen: needs-attention list
      leases/                buildings, units, leases (stacking plan lives here)
      tenants/
      billing/               invoices, payments, TDS, bank matching
      reports/
      settings/              organization, buildings defaults, users
  components/
    ui/                      shadcn components (don't edit by hand unless needed)
    shell/                   app shell: nav (sidebar on laptop, bottom tabs on phone), page header
    shell/                   also RequirePermission + NoAccess: pages show "who can change this" instead of a form the user can't save
    forms/                   SimpleForm: labelled fields, inline errors, "More options"
    <feature>/               feature components, e.g. property/UnitList.tsx, tenants/TenantList.tsx, settings/
  lib/
    billing/                 PURE billing engine (no DB, no network, no clock)
      types.ts               engine input and output types
      money.ts               paise helpers, rounding
      dates.ts               plain-date helpers, months, days in month, FY
      charges.ts             monthly amount of a charge (fixed, per sq ft, per slot), charge defaults
      rent-free.ts           rent-free periods and rent commencement
      escalation.ts          escalation schedule from rules
      proration.ts           part-month and part-quarter calculations
      schedule.ts            full rent schedule for a lease
      invoice-lines.ts       lease + month -> invoice lines
      explain.ts             "Explain this amount" text for a line
      gst.ts                 CGST/SGST/IGST split, round-off
      tds.ts                 expected TDS on an invoice
      draft-invoice.ts       lease + month -> whole draft invoice (lines, GST, totals, TDS)
      __tests__/
    db/
      schema/                one file per table group
      index.ts               Drizzle client (postgres.js, prepare: false, snake_case; D12)
      url.ts                 which database to use; the local-only guard for scripts
      scoped.ts              org-scoped query helpers (withOrg, runScoped; runAsSystem for background jobs, D22)
      activity-log.ts        audit logging helper (insertLogged, updateLogged)
      rows.ts                small helpers for reading query results
    auth/                    roles and PERMISSIONS (roles.ts), memberships, invites, sign-up form schemas
    supabase/                Supabase Auth clients for server code (cookie sessions)
    india/                   GSTIN, PAN, IFSC, UPI and phone checks
    property/                buildings, floors, units: form schemas, queries, stacking plan
    tenants/                 tenant form schemas and queries
    leases/                  lease form steps and validation (forms.ts, charges-form.ts), form -> engine input (draft.ts, D20),
                             unit-overlap check, review rows (review.ts), saved rows <-> form (rows.ts, prefill.ts),
                             critical dates, copy, renewal (D20), termination (D21), queries (queries.ts)
    config/
      brand.ts               product name, the only place it's written (D-006)
    settings/                setting keys and defaults (schema.ts), resolution (resolve.ts), load/save (store.ts),
                             BillingSettings for the engine (billing.ts), building defaults on charges (charge-defaults.ts),
                             Billing rules labels and form (labels.ts, rules-form.ts); docs/SETTINGS.md
    email/                   email adapter: emailDriver() picks resend (RESEND_API_KEY + EMAIL_FROM) or console (.local-outbox/); the only way code sends email
    jobs/                    Inngest client and background jobs (daily billing run, D23), served at /api/inngest
    invoices/                monthly run (run.ts), number format (number.ts) and gap-free assignment (numbering.ts), queries, PDF templates, sending
    payments/                allocation, bank statement parsing and matching
    imports/                 Excel import for buildings, units, tenants, leases
    exports/                 Tally XML, Excel, PDF reports
    alerts/                  critical-date generation and digest building
    format.ts                ₹ and date formatting for the UI
    today.ts                 todayInIndia(): today's date in Asia/Kolkata, for server code to pass into pure logic
    utils.ts                 cn() for merging Tailwind classes (clsx + tailwind-merge; D-008)
    auth.ts                  current user, organization, role checks
  server/
    actions/                 server actions, one file per feature; guard.ts (guardedForm: role check and Zod before the action runs)
  proxy.ts                   refreshes the Supabase session; sends signed-out visitors to /login
  jobs/                      Inngest functions
drizzle/                     generated SQL migrations (never edit applied ones); applied by scripts/migrate.ts
supabase/                    local stack config for the Supabase CLI (config.toml); no migrations here (D12)
tests/e2e/                   Playwright tests
scripts/
  db-env.ts                  shared setup for db scripts: loads .env.local, refuses remote databases
  migrate.ts                 pnpm db:migrate
  seed.ts                    pnpm db:seed, demo data
  pipeline.mjs               autonomous build pipeline (PIPELINE.md); don't edit
```

## Patterns

**Data flow.** Screens call server actions in `src/server/actions/`. Actions: check the user's role, validate input with Zod, call `lib/` functions, write through Drizzle inside a transaction, write an activity log entry, then revalidate the page. Form actions use `guardedForm(permission, schema, form, fn)` from `guard.ts`, which checks the role and validates the form before calling `fn`; `fn` writes inside `runScoped`, through `insertLogged`/`updateLogged` so the activity log entry is never forgotten.

**Billing.** The engine in `src/lib/billing/` is the heart of the product. Server code loads lease data, converts it to plain engine inputs, calls the engine, and saves the results. The engine never imports from `db/`.

**Invoices.** A monthly run creates draft invoices. Drafts can be edited or deleted. Once sent, an invoice is locked; corrections are credit notes. Invoice numbers are assigned at the moment of sending, inside a transaction, to keep the series gap-free.

**Multi-tenancy.** Every table has `organization_id`. Row-level security policies (`drizzle/0003_rls_policies.sql`, helper functions in the private `app` schema) restrict rows to active members of that organization, and writes by role. Server code reads and writes through `withOrg` in `db/scoped.ts`: it runs the work in a transaction as Supabase's `authenticated` role with the user's id, so the policies apply, and its `where` and `values` helpers add the organization filter explicitly, so a missing policy is not the only protection (D14).

**Roles.** `owner`, `accounts`, `property_manager`, `viewer` (see `docs/PRODUCT_PLAN.md`). What each may change is one table, `PERMISSIONS` in `src/lib/auth/roles.ts`; every server action calls `requireMember()` then `requirePermission(member, "...")` before writing, never relying on the UI. The row-level security write policies grant the same roles, and `roles-rls.db.test.ts` fails if the two disagree.

**Background jobs.** Inngest functions in `src/jobs/`: `monthly-billing-run` (drafts on the 1st), `send-reminders` (daily), `alert-digest` (daily email per user). Jobs are idempotent: running twice must not create duplicates.

**Errors.** User-facing errors are plain sentences ("This tenant has no active lease for March"). Technical detail goes to logs, not the screen.

## Environments

- Local: Supabase CLI local stack (`supabase start`: API on port 54321, Postgres on 54322, Studio on 54323), seeded demo data. The app uses `DATABASE_URL`, or the local Postgres when it isn't set
- Staging: separate Supabase project and Vercel preview
- Production: Supabase project in Mumbai region

Environment variables are documented in `.env.example`.

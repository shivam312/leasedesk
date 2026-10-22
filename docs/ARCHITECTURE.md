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
| Auth | Supabase Auth | Email + password, Google login, invites |
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
    <feature>/               feature components, e.g. leases/LeaseForm.tsx
  lib/
    billing/                 PURE billing engine (no DB, no network, no clock)
      money.ts               paise helpers, rounding
      dates.ts               plain-date helpers, months, days in month, FY
      escalation.ts          escalation schedule from rules
      proration.ts           part-month calculations
      schedule.ts            full rent schedule for a lease
      invoice-lines.ts       lease + month -> invoice lines
      gst.ts                 CGST/SGST/IGST split
      tds.ts                 expected TDS on an invoice
      __tests__/
    db/
      schema/                one file per table group
      index.ts               Drizzle client
      scoped.ts              org-scoped query helpers
      activity-log.ts        audit logging helper
    invoices/                numbering, PDF templates, sending
    payments/                allocation, bank statement parsing and matching
    imports/                 Excel import for buildings, units, tenants, leases
    exports/                 Tally XML, Excel, PDF reports
    alerts/                  critical-date generation and digest building
    format.ts                ₹ and date formatting for the UI
    utils.ts                 cn() for merging Tailwind classes (shadcn)
    auth.ts                  current user, organization, role checks
  server/
    actions/                 server actions, one file per feature
  jobs/                      Inngest functions
drizzle/                     generated SQL migrations (never edit applied ones)
tests/e2e/                   Playwright tests
scripts/seed.ts              demo data
```

## Patterns

**Data flow.** Screens call server actions in `src/server/actions/`. Actions: check the user's role, validate input with Zod, call `lib/` functions, write through Drizzle inside a transaction, write an activity log entry, then revalidate the page.

**Billing.** The engine in `src/lib/billing/` is the heart of the product. Server code loads lease data, converts it to plain engine inputs, calls the engine, and saves the results. The engine never imports from `db/`.

**Invoices.** A monthly run creates draft invoices. Drafts can be edited or deleted. Once sent, an invoice is locked; corrections are credit notes. Invoice numbers are assigned at the moment of sending, inside a transaction, to keep the series gap-free.

**Multi-tenancy.** Every table has `organization_id`. Row-level security policies restrict rows to members of that organization. Server code also scopes queries through `db/scoped.ts`, so a missing policy is not the only protection.

**Roles.** `owner`, `accounts`, `property_manager`, `viewer` (see `docs/PRODUCT_PLAN.md`). Checked in every server action via `lib/auth.ts`, never only in the UI.

**Background jobs.** Inngest functions in `src/jobs/`: `monthly-billing-run` (drafts on the 1st), `send-reminders` (daily), `alert-digest` (daily email per user). Jobs are idempotent: running twice must not create duplicates.

**Errors.** User-facing errors are plain sentences ("This tenant has no active lease for March"). Technical detail goes to logs, not the screen.

## Environments

- Local: Supabase CLI local stack, seeded demo data
- Staging: separate Supabase project and Vercel preview
- Production: Supabase project in Mumbai region

Environment variables are documented in `.env.example`.

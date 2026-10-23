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
| File storage | Supabase Storage | TDS certificates (private `documents` bucket, one folder per organization, behind `FileStore` in `src/lib/files/`; D32). Sent invoice and credit note PDFs are rendered on demand from their frozen copies (D25; storing them is backlogged) |
| Validation | Zod | Every server action validates its input |
| Background jobs | Inngest | Daily check that makes each organization's drafts on its run day (D23), daily payment reminders (D33), daily digests (D36). `pnpm jobs:dev` runs the local dev server |
| PDF | @react-pdf/renderer | Invoice and credit note PDFs (built, with a UPI QR from `qrcode`), report PDFs |
| Email | Resend | Invoices, credit notes and reminders, through the adapter in `src/lib/email/` (a console driver writes to `.local-outbox/` without `RESEND_API_KEY`). Delivery status is only in the activity log so far (backlog) |
| Excel | SheetJS (`xlsx` 0.20.3 from cdn.sheetjs.com) | Bank statements (built: read in the browser, `src/lib/bank/xlsx.ts`, D30); import templates and report exports in M7 |
| Tests | Vitest (unit), Playwright (end-to-end) | Unit tests sit next to code in `__tests__/`. Playwright runs at 375px and 1280px against a production build; `tests/e2e/screens.spec.ts` opens every screen, and `flow.spec.ts` runs lease → invoice → send → payment |
| Hosting | Vercel + Supabase | Daily database backups |
| Monitoring | Sentry | Added in Milestone 8 |

## Folder layout

This is the target layout. What exists at the end of M6: the app shell; sign-up, login and invites under `(auth)/`; Settings (business details, billing rules, team), Leases (lease list, `leases/new` for the four-step form, also used to copy (`?copy=<id>`) and renew (`?renew=<id>`), the lease page `leases/[id]` with End early, and buildings, units and stacking plan), Tenants, and Billing (`billing/` with the month's invoices, Make invoices and Send all; `billing/invoices/[id]` with Explain this amount, Preview PDF, Email again and `credit-note/`; PDF routes `billing/invoices/[id]/pdf` and `billing/credit-notes/[id]/pdf`; payments `billing/payments/` (list, `new`, `[id]` with Reverse); bank `billing/bank/` (accounts and statement import, `imports/[id]`, `match/` for Match payments); TDS `billing/tds/` (tracker, `upload/`, certificate download `certificates/[id]`); the tenant ledger `tenants/[id]/ledger`) under `(app)/`; `api/inngest/` (outside the login proxy); `lib/billing/`, `lib/settings/`, `lib/auth/`, `lib/db/` (schema, `scoped.ts`, `activity-log.ts`), `lib/india/`, `lib/property/`, `lib/tenants/`, `lib/leases/`, `lib/invoices/`, `lib/email/`, `lib/jobs/`, `lib/payments/`, `lib/bank/`, `lib/tds/`, `lib/files/`, `lib/reminders/`, `lib/supabase/`, `lib/today.ts`; since M6 the Today screen `today/` (billed, collected and unpaid this month; the needs-attention list with inline Make invoices, Send, Remind on WhatsApp, Mark as done and Remind me later), `lib/alerts/` (`attention.ts` pure: what shows and in what order; `queries.ts`; `dates.ts`: done, snooze and reminder days; `digest.ts` pure and `digest-run.ts`: the daily digest email, D36) and `components/today/`; `server/actions/`; `proxy.ts`; error and not-found pages for the signed-in app. In M7: Reports (`reports/` lists every report; `reports/[report]` shows one with its date filter and search), `lib/reports/` (`report.ts`: the typed table every report is; `registry.ts`: every report, its filter and loader; pure builders `rent-roll.ts`, `vacancy.ts`, `collections.ts` (collections, and unpaid and ageing), `gst-summary.ts` (D-026), `tds-summary.ts` (on the TDS tracker), `expiry.ts` (leases ending in 12 months, with the notice day from `noticeDeadline` in `lib/leases/critical-dates.ts`); loaders `queries.ts`; D37) and `components/reports/ReportView.tsx`. Imports and exports arrive later in M7.

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
    <feature>/               feature components, e.g. property/UnitList.tsx, tenants/TenantList.tsx, settings/, invoices/ (InvoiceList, RunBillingForm, SendForms, CreditNoteForm, Working), payments/ (PaymentForm, PaymentList, ReversePaymentForm, ApplyCreditForm), bank/ (StatementImport, MatchList), tds/ (CertificateUpload), reminders/ (WhatsappReminderLink)
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
      credit-note.ts         credit note amounts and GST against a sent invoice's lines, GST time limit (D26)
      allocation.ts          payments: suggested TDS, oldest-first allocation, what is left on an invoice and its status (invoiceSettlement)
      ledger.ts              tenant ledger with running balance
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
    india/                   GSTIN, PAN, IFSC, UPI and phone checks; amount in words; UPI payment links
    property/                buildings, floors, units: form schemas, queries, stacking plan
    tenants/                 tenant form schemas and queries
    leases/                  lease form steps and validation (forms.ts, charges-form.ts), form -> engine input (draft.ts, D20),
                             unit-overlap check, review rows (review.ts), saved rows <-> form (rows.ts, prefill.ts),
                             critical dates, copy, renewal (D20), termination (D21), queries (queries.ts)
    config/
      brand.ts               product name, the only place it's written (D-006)
      tax-labels.ts          tax form and section names and TDS certificate due dates, the only place they're written (D-021)
    settings/                setting keys and defaults (schema.ts), resolution (resolve.ts), load/save (store.ts),
                             BillingSettings for the engine (billing.ts), building defaults on charges (charge-defaults.ts),
                             Billing rules labels and form (labels.ts, rules-form.ts); docs/SETTINGS.md
    email/                   email adapter: emailDriver() picks resend (RESEND_API_KEY + EMAIL_FROM) or console (.local-outbox/); the only way code sends email
    jobs/                    Inngest client (inngest.ts) and background jobs: monthlyBilling, the daily run (D23), with
                             dueRuns picking the organizations whose run day is today; dailyReminders (D33); dailyDigest (D36); served at /api/inngest
    invoices/                monthly run (run.ts, D22), its schedule day (schedule.ts), number format (number.ts) and
                             gap-free assignment (numbering.ts), queries, what a PDF prints (document.ts, pure), the
                             React-PDF layout (pdf.tsx, font in assets/fonts/), supplier and tenant copies (copies.ts, D18),
                             sending (send.ts, D25), the draft-still-matches check (draft-rows.ts, D27), invoice emails
                             (email.ts), line workings (explain.ts), Billing form schemas and summaries (forms.ts), credit
                             notes (credit-notes.ts, credit-note-form.ts, credit-note-document.ts, D26)
    payments/                record, reverse and apply credit (payments.ts, D29; tenant money lock), payment form (forms.ts),
                             loading the tenant ledger (ledger.ts)
    bank/                    CSV and Excel reading (csv.ts, xlsx.ts), column guessing and Indian dates/amounts (statement.ts),
                             imports (imports.ts, D30, D34), match scoring (matching.ts, pure, D31), suggestions and confirm (match.ts)
    tds/                     TDS tracker by tenant and quarter (tracker.ts, pure) and certificate upload (certificates.ts, D32)
    files/                   FileStore: Supabase Storage `documents` bucket (supabase.ts) or in memory for tests (store.ts, D32)
    reminders/               when a reminder is due and what it asks (schedule.ts, pure), the email (email.ts), the daily run
                             (run.ts, claim then send, D33), one-tap WhatsApp links (whatsapp.ts, manual.ts)
    reports/                 every report as a typed table (report.ts), the registry (registry.ts), pure builders, loaders (queries.ts); D37
    imports/                 Excel import for buildings, units, tenants, leases
    exports/                 Tally XML, Excel, PDF reports
    alerts/                  Today's needs-attention list (attention.ts, pure; D35), its queries, lease-date actions (dates.ts); the daily digest (digest.ts, pure: who gets what and the words; digest-run.ts: claim then send, D36)
    format.ts                ₹ and date formatting for the UI
    today.ts                 todayInIndia(): today's date in Asia/Kolkata, for server code to pass into pure logic
    utils.ts                 cn() for merging Tailwind classes (clsx + tailwind-merge; D-008)
    auth.ts                  current user, organization, role checks
  server/
    actions/                 server actions, one file per feature; guard.ts (guardedForm: role check and Zod before the action runs)
  proxy.ts                   refreshes the Supabase session; sends signed-out visitors to /login (except /api/inngest)
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

**Invoices.** A monthly run (`runBilling`) creates draft invoices, one per lease per month. Drafts aren't edited by hand: running the month again replaces them (D22), and sending re-checks each draft against its lease and refuses one that no longer matches (D27). Once sent, an invoice is locked (database triggers in `drizzle/0013`); corrections are credit notes. Invoice numbers are assigned at the moment of sending, inside a transaction, to keep the series gap-free; the email goes after the commit (D25).

**Payments.** Payments, allocations and TDS records are append-only. A wrong payment is undone by a reversal entry (D29); leftover credit is applied with new allocation rows. Every change to a tenant's money first takes that tenant's advisory lock (`lockTenantMoney`), and an invoice's status is worked out again from its allocations and credit notes (`refreshInvoiceStatus`, using `invoiceSettlement` from the engine). Bank lines are only suggestions until the user confirms; confirming records each one through the same `recordPayment` (D31).

**Multi-tenancy.** Every table has `organization_id`. Row-level security policies (`drizzle/0003_rls_policies.sql`, helper functions in the private `app` schema) restrict rows to active members of that organization, and writes by role. Server code reads and writes through `withOrg` in `db/scoped.ts`: it runs the work in a transaction as Supabase's `authenticated` role with the user's id, so the policies apply, and its `where` and `values` helpers add the organization filter explicitly, so a missing policy is not the only protection (D14).

**Roles.** `owner`, `accounts`, `property_manager`, `viewer` (see `docs/PRODUCT_PLAN.md`). What each may change is one table, `PERMISSIONS` in `src/lib/auth/roles.ts`; every server action calls `requireMember()` then `requirePermission(member, "...")` before writing, never relying on the UI. The row-level security write policies grant the same roles, and `roles-rls.db.test.ts` fails if the two disagree.

**Background jobs.** Inngest functions in `src/lib/jobs/`, registered in `src/app/api/inngest/route.ts`: `monthlyBilling` (built: every morning at 06:00 India time, makes drafts for each organization whose `invoice.runDay` is today, one step per organization; it never sends), `dailyReminders` (built: every day at 09:00 India time, claims each due reminder step in the database, then emails it; D33), and `dailyDigest` (built: every day at 08:00 India time, claims each person's digest for the day in `digest_sends`, then emails it; D36). Jobs run through `runAsSystem` (D22) and are idempotent: running twice must not create duplicates.

**Errors.** User-facing errors are plain sentences ("This tenant has no active lease for March"). Technical detail goes to logs, not the screen.

## Environments

- Local: Supabase CLI local stack (`supabase start`: API on port 54321, Postgres on 54322, Studio on 54323), seeded demo data. The app uses `DATABASE_URL`, or the local Postgres when it isn't set
- Staging: separate Supabase project and Vercel preview
- Production: Supabase project in Mumbai region

Environment variables are documented in `.env.example`.

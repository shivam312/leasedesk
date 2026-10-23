# Roadmap

Goal: a pilot landlord's real monthly billing runs through the app and matches their Excel, then the first paying customer. Tick tasks as they're done (`- [x]`). Work top to bottom unless told otherwise.

Each task is one commit. Tasks tagged `(human)` need a person and are listed in `docs/DECISIONS_NEEDED.md` under Human tasks; the pipeline skips them. Tasks tagged `(blocked: D-xxx)` wait for that decision. See `PIPELINE.md`.

**Current milestone:** M5a

## M0. Project setup (week 3)

- [x] Create the Next.js app with TypeScript strict, pnpm, ESLint, Prettier
- [x] Add Tailwind and shadcn/ui; set up the app shell with the 5-item nav (Today, Leases, Tenants, Billing, Reports) and mobile layout
- [x] (human) Install Docker Desktop and the Supabase CLI
- [x] Set up Supabase locally (CLI) and Drizzle; `db:generate`, `db:migrate`, `db:seed` scripts
- [x] Set up Vitest and Playwright with one passing test each
- [x] Add `src/lib/format.ts` (₹ lakh/crore, DD-MM-YYYY) with tests
- [x] `.env.example`, README with local setup steps
- [x] Update the Commands section in CLAUDE.md to match package.json

## M1. Billing engine (weeks 3–4), before any screens

- [x] `money.ts` and `dates.ts` with tests (paise rounding, days in month, add months, financial year, quarters)
- [x] Charge monthly amounts (fixed, per sq ft, per slot)
- [x] Rent-free periods and rent commencement
- [x] Escalations: compounding, non-compounding, custom
- [x] Pro-rata and mid-month splits
- [x] Full rent schedule for a lease (`schedule.ts`)
- [x] Invoice lines for a lease and month, monthly and quarterly, advance and arrears
- [x] GST split and round-off
- [x] Expected TDS
- [x] All golden test cases in `docs/BILLING_RULES.md` passing
- [x] Review by the `billing-reviewer` agent

## M2. Data, auth and setup screens (week 5)

- [x] Schema: organizations, memberships, billing entities (see `docs/DATA_MODEL.md`, including the `settings` jsonb columns)
- [x] Schema: buildings, floors, units
- [x] Schema: tenants (TDS per charge type) and tenant contacts
- [x] Row-level security policies and org-scoped query helpers, with tests that one org can't read another's data
- [x] Activity log helper
- [x] Settings system: Zod schema in `src/lib/settings/schema.ts` with every key and default in `docs/SETTINGS.md`
- [x] Settings system: jsonb storage on organizations, billing entities, buildings, tenants and leases, and the resolution order in `src/lib/settings/resolve.ts` (lease → tenant → building → organization → default), with tests
- [x] Billing engine takes a resolved `BillingSettings` object in place of its separate `roundEscalatedRentToRupee`, `roundInvoiceTotal` and `dueDays` inputs; golden tests unchanged
- [x] Billing settings, a test for each option: `billing.partPeriodMethod`, `billing.monthEndRule`
- [x] Billing settings, a test for each option: `billing.midMonthIncreaseLines`, `billing.afterCustomIncrease`, `billing.skipZeroInvoices`
- [x] Billing settings, a test for each option: building defaults for `billing.defaultTiming`, `gst.defaultRateBp` and `gst.defaultSac`
- [x] GST setting, a test for each option: `gst.rounding` (per line or per invoice)
- [x] TDS settings, a test for each option: `tds.rounding`, `tds.tolerancePaise`, `tds.quarterBasis`
- [x] Sign up and log in
- [x] Invite users and accept an invite
- [x] Roles (owner, accounts, property manager, viewer), checked in server actions
- [x] Settings: organization and billing entities (GSTIN, bank, UPI)
- [x] Settings → Billing rules page (organization and building level, basic and "More options")
- [x] Buildings and units screens
- [x] Stacking plan
- [x] Tenants list and tenant page

## M3. Leases (week 6)

- [x] Schema: leases and lease units
- [x] Schema: lease charges, escalation rules, custom escalations, critical dates
- [x] Lease form, first steps: tenant, units, dates, rent-free period
- [x] Lease form, charges and rent increases, with lease-level settings under "More options"
- [x] Review step showing the full rent schedule
- [x] Copy an existing lease as a template
- [x] Critical dates generated from lease terms
- [x] Renewal (new version)
- [x] Termination

Merged into `main` on 2026-10-23; the lease migrations (`drizzle/0008`–`0011`) are applied. Adding a lease crashed until 2026-10-23 (a setting with no label); fixed, and `tests/e2e/flow.spec.ts` now adds one. Still to add: a Playwright test for renewing and ending a lease (`docs/BACKLOG.md`).

## M4. Invoicing (week 7)

- [x] Schema: invoice series, invoices, invoice lines, credit notes
- [x] Monthly billing run: generate drafts for all active leases, with a manual "Run now" button
- [x] Schedule the monthly billing run with Inngest (local dev server)
- [x] Move invoice number formatting from `src/lib/billing/invoice-number.ts` to `src/lib/invoices/` with sequence assignment (D9)
- [x] Email adapter with a console driver (writes to `.local-outbox/`) used when `RESEND_API_KEY` is missing
- [x] Invoice PDF with GST fields, bank details and UPI QR code
- [x] Review drafts and "Send all": assign numbers, generate PDFs, email through the adapter
- [x] "Explain this amount" on every line
- [x] Credit notes
- [ ] (human) Create a Resend account, verify the sending domain and put `RESEND_API_KEY` in `.env.local`

Merged into `main` on 2026-10-23 (report: `docs/milestones/M4.md`). The invoice migrations (`drizzle/0012`–`0013`) are applied and the invoice database tests run. Sending is covered by `tests/e2e/flow.spec.ts`; still to add: a Playwright test for credit notes (`docs/BACKLOG.md`). Reviewed by the billing and UX reviewers on 2026-10-23; the fixes and open decisions (D-015 to D-019) are in the report.

## M5. Payments and TDS (week 8)

- [x] Record a payment with TDS and allocation (auto oldest-first)
- [x] Bank statement import with column mapping saved per account (CSV and Excel)
- [x] (human) Allow installing SheetJS (`xlsx`, from cdn.sheetjs.com, already on the approved list) so Excel bank statements can be read; installed 0.20.3 on 2026-10-23 and Excel (.xlsx, .xls) statements now import
- [x] Matching suggestions and bulk confirm
- [x] TDS tracker by tenant and quarter, certificate upload
- [x] Reminders: automatic emails
- [x] Reminders: one-tap WhatsApp link
- [x] Tenant ledger with running balance
- [ ] (human) Get one real bank statement export (CSV or Excel) per major bank the pilots use, personal details removed, into `tests/fixtures/bank/`

Wrapped up on 2026-10-23 (report: `docs/milestones/M5.md`); D-024 (the open Codex point) waits for an answer. On `main`. Migrations to `drizzle/0022` (including the reminders tables) are applied locally, and the database tests no longer skip when a table is missing: they fail, the reminder tests included. Checked on 2026-10-23 after applying them: the reminder database tests run and pass, and `pnpm test:e2e` passes, including every screen opening without an error. Lease → make invoices → send → record payment was checked by hand in the browser on 2026-10-23 and is now a Playwright test (`tests/e2e/flow.spec.ts`). Reviewed by the billing and UX reviewers on 2026-10-23: the must-fix items are fixed (bank TDS when only a newer invoice is named, a credit note clearing a part-paid invoice, the TDS tolerance on invoice status, the tenant page's lease list, bank "credits" wording, tap targets, the reversal's next step); the rest are in `docs/BACKLOG.md`, and D-022 and D-023 are open.

## M5a. Demo data and walkthrough

- [ ] Realistic seed: `pnpm db:seed:demo` creates "Sharma Estates" with 2 buildings (an 8-floor office block in Gurugram and a retail-front building in Bengaluru), 45 tenants with believable Indian company names, GSTINs with correct state codes, chargeable areas and per-sq-ft rents in realistic ranges, a mix of 5%/12-month and 15%/36-month increases, two rent-free periods, one lease expiring in 60 days, one in lock-in, 6 unpaid invoices of different ages, 3 tenants with missing TDS certificates, and 3 months of invoice and payment history so every report has data. Demo login demo@sharma-estates.example with a password printed by the script. Idempotent: running it again resets the demo organisation.
- [ ] Walkthrough script: `pnpm walkthrough` runs Playwright against the dev server with the demo login, records video, and takes a numbered full-page screenshot at every step of: (1) log in and read Today, (2) open a tenant and their lease, (3) add a new lease end to end and see the rent schedule, (4) run this month's billing, review a draft, tap "explain this amount", send all, (5) record a payment with TDS and allocate it, (6) import a bank statement and confirm matches, (7) open each report. Repeat Today and the lease list at 375px width.
- [ ] Walkthrough page: `docs/walkthrough/index.html` built by the script: screenshots in order, each with a one-paragraph caption for a non-technical founder saying what the user is doing, what to notice, and which rule or setting produced the numbers on screen. Link the videos.
- [ ] Demo script: `docs/DEMO_SCRIPT.md`, a 10-minute spoken script for a landlord meeting on the demo data, with the exact clicks.
- [ ] The walkthrough doubles as an end-to-end test in `pnpm test:e2e`, asserting the key amounts on screen match the billing engine's output for the seeded leases.

## M6. Today screen and alerts (week 8)

- [x] Today screen: billed, collected, outstanding; needs-attention list with inline actions (include "N bank lines to match" and "N TDS certificates missing", which are otherwise only reachable from Billing → Payments)
- [x] Daily email digest per user

Reviewed by the billing and UX reviewers on 2026-10-23. Fixed: "invoices aren't made yet" no longer sticks (and is emailed daily) in a month where no lease bills anything, such as quarterly leases between quarters; one filled button on Today; a lease date assigned to a viewer goes to owners and property managers instead; plainer certificate and settings wording. The rest is in `docs/BACKLOG.md`; no new founder decisions. Codex reviewed it twice: the paise-sum and loading fixes are in, and its two disputed must-fix items are D-025. Wrapped up on 2026-10-23 (report: `docs/milestones/M6.md`); 838 unit and database tests pass.

## M7. Reports, exports and import (week 9)

- [x] Reports: rent roll and vacancy
- [x] Reports: collections, outstanding and ageing
- [x] Reports: GST summary and TDS summary
- [x] Reports: expiry schedule
- [x] Excel export for every report
- [x] PDF export for every report
- [x] Tally export (XML vouchers) with ledger-name mapping in settings
- [x] Excel import for buildings and units, with row-level error messages
- [x] Excel import for tenants and leases, with row-level error messages
- [ ] (human) Get a sample Tally XML export from a pilot accountant's TallyPrime into `tests/fixtures/tally/`

Reviewed by the billing and UX reviewers on 2026-10-23. Fixed: the lease import's rent column is now "Rent at lease start (₹)", with a "Rent today (₹)" column required once an increase has been billed and checked against the engine, so today's rent typed as the starting rent isn't increased twice; increases can be counted from rent start; a whole rent typed as a rate per sq ft is refused; negative amounts in Excel exports show their minus sign; imports link to the next step; empty reports say what to do; 44px buttons on phones. The rest is in `docs/BACKLOG.md`; no new founder decisions. Codex reviewed it: collections and ageing now group by tenant, not company name. Wrapped up on 2026-10-24 (report: `docs/milestones/M7.md`); 927 unit and database tests pass; D-026 to D-028 are open.

## M8. Pilot readiness (week 10)

- [x] Sentry and error reporting in code, a no-op without `SENTRY_DSN`
- [x] Full end-to-end test: new org → import → billing run → send → payment → reports (`tests/e2e/journey.spec.ts`)
- [x] UX review by the `ux-reviewer` agent of log in, password reset, invite, billing (invoice list, run, send, credit note), Match payments, TDS, the lease list and lease form, the building page, the tenant page and ledger, and Settings (team, Tally, GSTINs); must-fixes done or backlogged in `docs/BACKLOG.md` (2026-10-24)
- [x] UX review by the `ux-reviewer` agent of the screens the first pass didn't cover: Today, the lease page, tenants list / new / edit, Excel import, units and stacking plan, payments list / new / detail, bank import detail, Reports, Settings → Billing rules and business entities, Welcome, Sign up. Fix the must-fixes or backlog them, and add a table to `docs/milestones/M8.md`: screen, outcome (ok / fixed / backlogged), backlog row (found by Codex review M8). Done 2026-10-24: 3 must-fixes found; 2 fixed (ending a lease sat under the whole schedule; the import's problem list had no limit), 1 was wrong; should-fixes backlogged
- [ ] (human) Create Sentry, Supabase cloud (Mumbai), Vercel and Inngest accounts; put the keys in `.env.local`
- [ ] (human) Set up the staging environment and turn on database backups
- [ ] (human) Load a pilot landlord's real data via import; compare one month's invoices against their Excel line by line
- [ ] (human) Usability test with an accountant who hasn't seen the app
- [ ] (human) Chartered accountant reviews `docs/BILLING_RULES.md` and the `ca` entries in `docs/DECISIONS_NEEDED.md`

Reviewed by the billing and UX reviewers on 2026-10-24. Fixed: error reports to Sentry no longer carry an error's text (a failed query lists the names, GSTINs and amounts it tried to save), breadcrumbs or query strings; a reset link's `next` can't send someone to another site with a tab or newline; a reset page saved after the session ended explains that the link expired; plainer reset and invite pages; the journey test checks Today's collected money. The rest is in `docs/BACKLOG.md`; D-029 (how users reach support) is open. Codex reviewed it twice: error reports are now sent before a server function stops; its remaining point (the UX review didn't cover every screen) was the second UX review task above, now done (D-030). Wrapped up on 2026-10-24 (report: `docs/milestones/M8.md`); 945 unit and database tests pass; no new migrations or settings. M8 stays open until the human tasks are done.

## Later (v2, in order)

Online payment links, tenant portal, full Tally / Zoho Books sync, metered utilities, renewals pipeline, WhatsApp Business API, AI lease extraction, maintenance tickets, analytics, custom roles. See `docs/PRODUCT_PLAN.md`.

## Open questions


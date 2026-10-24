# Roadmap

Goal: a pilot landlord's real monthly billing runs through the app and matches their Excel, then the first paying customer. Tick tasks as they're done (`- [x]`). Work top to bottom unless told otherwise.

Each task is one commit. Tasks tagged `(human)` need a person and are listed in `docs/DECISIONS_NEEDED.md` under Human tasks; the pipeline skips them. Tasks tagged `(blocked: D-xxx)` wait for that decision. See `PIPELINE.md`.

**Current milestone:** M9 (audit findings). M8's pipeline tasks are done; its `(human)` tasks (and those in M4 and M5) stay open alongside M9. M9 comes from the 2026-10-24 audit (`docs/audit/SUMMARY.md`); its three opening-balance tasks wait on D-028.

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

Merged into `main` on 2026-10-23; the lease migrations (`drizzle/0008`–`0011`) are applied. Adding a lease crashed until 2026-10-23 (a setting with no label); fixed, and `tests/e2e/flow.spec.ts` now adds one. `tests/e2e/lease-versions.spec.ts` renews a lease and ends the new version early (added after Codex's M3 review, 2026-10-24).

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

Merged into `main` on 2026-10-23 (report: `docs/milestones/M4.md`). The invoice migrations (`drizzle/0012`–`0013`) are applied and the invoice database tests run. Sending is covered by `tests/e2e/flow.spec.ts`, credit notes by `tests/e2e/credit-notes.spec.ts` (M9). Reviewed by the billing and UX reviewers on 2026-10-23; the fixes and open decisions (D-015 to D-019) are in the report. Codex's review (2026-10-24): number series are now kept per GSTIN, so two billing entities with one GSTIN can't repeat a number (D45, `drizzle/0027`).

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

- [x] Realistic seed: `pnpm db:seed:demo` creates "Sharma Estates" with 2 buildings (an 8-floor office block in Gurugram and a retail-front building in Bengaluru), 45 tenants with believable Indian company names, GSTINs with correct state codes, chargeable areas and per-sq-ft rents in realistic ranges, a mix of 5%/12-month and 15%/36-month increases, two rent-free periods, one lease expiring in 60 days, one in lock-in, 6 unpaid invoices of different ages, 3 tenants with missing TDS certificates, and 3 months of invoice and payment history so every report has data. Demo login demo@sharma-estates.example with a password printed by the script. Idempotent: running it again resets the demo organisation.
- [x] Walkthrough script: `pnpm walkthrough` runs Playwright against the dev server with the demo login, records video, and takes a numbered full-page screenshot at every step of: (1) log in and read Today, (2) open a tenant and their lease, (3) add a new lease end to end and see the rent schedule, (4) run this month's billing, review a draft, tap "explain this amount", send all, (5) record a payment with TDS and allocate it, (6) import a bank statement and confirm matches, (7) open each report. Repeat Today and the lease list at 375px width.
- [x] Walkthrough page: `docs/walkthrough/index.html` built by the script: screenshots in order, each with a one-paragraph caption for a non-technical founder saying what the user is doing, what to notice, and which rule or setting produced the numbers on screen. Link the videos.
- [x] Demo script: `docs/DEMO_SCRIPT.md`, a 10-minute spoken script for a landlord meeting on the demo data, with the exact clicks.
- [x] The walkthrough doubles as an end-to-end test in `pnpm test:e2e`, asserting the key amounts on screen match the billing engine's output for the seeded leases.

Finished on 2026-10-24 (D43, D44). Reviewed on 2026-10-24: nothing in M5a touches billing, invoices, payments or screens, so the billing and UX reviewers weren't needed. Fixed: the walkthrough captions take the TDS quarter, its due date and the financial year from the seed date instead of October 2026 (`demoTdsQuarters`), `removeDemo` refuses a non-local database itself, and the demo deposits are worked out in integer paise (`demoDeposit`); the demo script marks its date-relative figures. The rest is in `docs/BACKLOG.md`; no TODOs or new settings. Codex reviewed it twice: its organization-scoping and explain-panel points are fixed, and its last point (deposits in decimals) was fixed just after its second round and is D-031. Wrapped up on 2026-10-24 (report: `docs/milestones/M5A.md`); 990 unit and database tests pass.

## M6. Today screen and alerts (week 8)

- [x] Today screen: billed, collected, outstanding; needs-attention list with inline actions (include "N bank lines to match" and "N TDS certificates missing", which are otherwise only reachable from Billing → Payments)
- [x] Daily email digest per user

Reviewed by the billing and UX reviewers on 2026-10-23. Fixed: "invoices aren't made yet" no longer sticks (and is emailed daily) in a month where no lease bills anything, such as quarterly leases between quarters; one filled button on Today; a lease date assigned to a viewer goes to owners and property managers instead; plainer certificate and settings wording. The rest is in `docs/BACKLOG.md`; no new founder decisions. Codex reviewed it twice: the paise-sum and loading fixes are in, and its two disputed must-fix items are D-025. A third Codex audit (2026-10-24): Today's unpaid and overdue totals now refuse sums past the safe integer range, and the walkthrough browser test checks Today's bank-line and missing-certificate items and their links. Wrapped up on 2026-10-23 (report: `docs/milestones/M6.md`); 838 unit and database tests pass.

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

Reviewed by the billing and UX reviewers on 2026-10-23. Fixed: the lease import's rent column is now "Rent at lease start (₹)", with a "Rent today (₹)" column required once an increase has been billed and checked against the engine, so today's rent typed as the starting rent isn't increased twice; increases can be counted from rent start; a whole rent typed as a rate per sq ft is refused; negative amounts in Excel exports show their minus sign; imports link to the next step; empty reports say what to do; 44px buttons on phones. The rest is in `docs/BACKLOG.md`; no new founder decisions. Codex reviewed it: collections and ageing now group by tenant, not company name. A second Codex audit (2026-10-24): Excel number cells keep every decimal typed, so the imports refuse an amount or area with more than two decimals instead of rounding it. Wrapped up on 2026-10-24 (report: `docs/milestones/M7.md`); 927 unit and database tests pass; D-026 to D-028 are open.

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

Reviewed by the billing and UX reviewers on 2026-10-24. Fixed: error reports to Sentry no longer carry an error's text (a failed query lists the names, GSTINs and amounts it tried to save), breadcrumbs or query strings; a reset link's `next` can't send someone to another site with a tab or newline; a reset page saved after the session ended explains that the link expired; plainer reset and invite pages; the journey test checks Today's collected money. The rest is in `docs/BACKLOG.md`; D-029 (how users reach support) is open. Codex reviewed it twice: error reports are now sent before a server function stops; its remaining point (the UX review didn't cover every screen) was the second UX review task above, now done (D-030). Reviewed again by the billing and UX reviewers on 2026-10-24: Next.js's request path no longer carries a tenant search into Sentry, and the error pages no longer promise a support contact that doesn't exist yet; the rest is in `docs/BACKLOG.md`, no new decisions. Codex's third round: reset links take their address from `APP_URL` only, never from request headers. Wrapped up again on 2026-10-24 (report: `docs/milestones/M8.md`); 951 unit and database tests and 50 browser tests pass; no new migrations or settings. M8 stays open until the human tasks are done.

## M9. Audit findings

From the audit of 2026-10-24 (`docs/audit/SUMMARY.md`, rulings in `docs/audit/RULINGS.md`). Ordered: demo blockers, then pilot blockers, then the rest. Backlog rows that moved here were deleted from `docs/BACKLOG.md`.

Demo blockers (what a landlord would see go wrong in the 10-minute demo):

- [x] Hide the Next.js dev overlay badge in demos: reproduce the "Could not validate `instant`" warning against `node_modules/next/dist/docs/`, fix it if cheap, and note in `docs/DEMO_SCRIPT.md` that the demo runs on `pnpm build && pnpm start`
- [x] Fixed demo clock: `pnpm db:seed:demo` seeds the current month as sent (with some collections) when run after the 1st, so Today never opens with "Billed ₹0"; the walkthrough and demo script make next month's invoices instead
- [x] "Overdue" comes from the due date and balance, not the stored status: one shared helper for the invoice list, invoice page, tenant page and ledger (nothing sets `overdue` today, so a 46-day-late invoice reads "Sent")
- [x] Today shows the 5 oldest unpaid tenants with a total and "See all N", and rent increases due on the same day share one card
- [x] Today's "hasn't paid ₹X" says it is the amount to pay after expected TDS; the "Unpaid now" box and Unpaid and ageing share one gross label, so the two screens agree
- [x] Demo script part 4 adds a 5% yearly increase and ends the lease on 31-10-2035; the lease form's dates step suggests the day before the anniversary as the last day
- [x] Dates read DD-MM-YYYY beside or instead of the native date picker on the lease form, payment form, reports' "As on" and the Tally page (was backlog rows on native date inputs)
- [x] After every invoice of a month is sent, "Make … invoices" is no longer the filled button; "Make missing … invoices" shows only when a lease has no draft
- [x] The lease page folds the rent schedule on phones: the next 12 months, then "Show all N months"
- [x] Invoice lines in one fixed order, rent first, the same on screen and on the PDF
- [x] The tenant page's address doesn't repeat the state
- [x] Building cards count vacant units from active leases, not `units.status`, show occupancy %, and show fit-out units separately so the card and the Vacancy report agree (was backlog row on `units.status`)

Pilot blockers (what a real landlord's first month would hit):

- [x] Credit note lines start at ₹0, with the total shown before "Issue credit note" (a sent credit note can't be undone)
- [x] Email fails closed in production: without `RESEND_API_KEY`, sending refuses with "Email isn't set up yet" and Settings → Business shows the same; the console driver runs only outside production or with `EMAIL_DRIVER=console`
- [x] Tenant contacts: edit and remove a contact and choose who receives invoices, keeping at least one usable email; "Add a contact" collapses behind a secondary button (was backlog row, must-fix before pilot)
- [x] Team: remove a member and cancel a pending invite, owner-only, with confirmation and activity log (was backlog rows)
- [ ] (blocked: D-028) Opening balance per tenant: schema and ledger row, shown first on the tenant ledger and in Unpaid and ageing and Today, never numbered or sent as an invoice
- [ ] (blocked: D-028) Opening balance entry: typed on the tenant page and an "Opening balance (₹)" column with "as on" date in the tenants and leases import
- [ ] (blocked: D-028) Opening balances settle like invoices: payment allocation, bank matching and reminders include them
- [x] Tally export writes the party ledger masters (and the TDS Receivable and bank ledgers it posts to) ahead of the vouchers, and saves each tenant's Tally name at first export so a rename doesn't split postings
- [x] Tally export page gets a business (GSTIN) filter, one file per Tally company (was backlog row)
- [x] Job health: record each daily run; Today and Settings warn "The daily run hasn't happened since …" with "Run now" when it is more than a day late
- [x] `docs/DEPLOY.md` runbook: first deploy and rollback, migrations against the cloud database (`ALLOW_REMOTE_DB`), Vercel environment variables, Inngest sync, Storage bucket policies, backup restore drill
- [x] CI: `.github/workflows/ci.yml` running typecheck, lint, unit and database tests (Supabase CLI) and the browser tests; runs once the repository is on GitHub (D-032)
- [x] Organization isolation on job paths: audit every `runAsSystem` and bare `db` call (`monthly-billing.ts`, `reminders/run.ts`, `digest-run.ts`, `demo/seed.ts`, `scoped.ts`) and add tests that two organizations' jobs never cross
- [x] Invoice list: search by tenant or building, status chips, row selection and "Send selected"; phone cards show the invoice number (was backlog rows)
- [x] "Remind all" on Today: one action sends the reminder email to every overdue tenant with an address and lists who has none (was backlog rows)
- [x] Tenant statement PDF from the ledger, financial-year filter, "Record payment" on the ledger
- [x] Tenant page lists the tenant's invoices with status and a link to each (was backlog rows)
- [x] Settings → Billing rules shows a preview of the reminder email and its timing before reminders are turned on
- [x] Store the sent invoice PDF at send time (`pdf_path`) and serve it for later downloads; existing invoices keep rendering from frozen copies (was backlog row; do before the first change to the PDF layout)

The rest (v1 promises not yet kept, and smaller fixes):

- [x] Documents on a lease: step 6 of the lease form uploads the signed agreement to the `documents` table and bucket; the lease page lists and opens them
- [x] Documents on a tenant, and uploads go direct to Storage so `MAX_UPLOAD_BYTES` can rise from 3 MB to 25 MB with a clear size error
- [x] Activity section on the tenant, lease, invoice and payment pages: who changed what and when, from `activity_log`
- [x] Custom critical dates on a lease, and "In discussion" on a lease-end alert so Today stops repeating it
- [x] "Request from tenant" on a missing TDS certificate: one tap emails the billing contact and records when it was asked
- [x] Search and a month filter on the Payments list and the TDS tracker, and a search on Match payments (was backlog row)
- [x] Global search in the header: tenant, unit, invoice number
- [x] Deposit ledger: receipt, adjustments, refund or forfeit per lease, replacing the single `depositAmount` (D-033). Built: received, refunded and kept; using it for unpaid rent waits on D-034 (billing review), GST on a kept deposit on D-035
- [x] Deposit settlement statement on tenant exit: dues less deposit, PDF (D-033). Dues are after expected TDS; the statement records nothing (D-034)
- [x] "Log in with Google" button shown only when the Supabase Google provider is configured (the OAuth client is a human task)
- [x] Paste units from Excel on the building page (rows of unit code, floor, area)
- [x] TDS gets its own entry under Billing with a back link to Billing; rent roll gets a phone card layout with the unit as anchor
- [ ] SAC moves to a quiet detail line on screen (stays on the PDF); "Round off", "Billed area" and "Charged as" get plain-language help text
- [ ] The invoice page says when the QR has no amount (over ₹1,00,000) or is left off (paid, part-paid), and `docs/DEMO_SCRIPT.md` says the same
- [ ] Delete `vitest.config.mts` (Vitest loads `vitest.config.ts`, which has the unit and database projects) and tidy `PIPELINE OLD.md`, `INSTALL_CODEX.md`, `INSTALL_PROMPT.md` into `docs/archive/`

## Later (v2, in order)

Online payment links, tenant portal, full Tally / Zoho Books sync, metered utilities, renewals pipeline, WhatsApp Business API, AI lease extraction, maintenance tickets, analytics, custom roles. See `docs/PRODUCT_PLAN.md`.

## Open questions


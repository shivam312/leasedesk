# Claude gap analysis (after v1, 2026-10-24)

Written independently of Codex's gap analysis, which I didn't read. What I did: reseeded the Sharma Estates demo, logged in as `demo@sharma-estates.example` on the running dev server, and opened every screen at 1280px and 375px (about 90 pages). I ran `pnpm walkthrough`, which logs in, adds a tenant and lease, makes and sends October's invoices, records a payment, imports and matches the bank statement, and opens every report. I also downloaded a sent invoice PDF, the Tally XML and report exports, opened the credit note and ledger screens, and checked row-level security in the local database. I compared what I saw against `docs/PRODUCT_PLAN.md` (v1 scope and "Keeping it simple"), `docs/UX_PRINCIPLES.md` and the M8 goal in `docs/ROADMAP.md`.

Every page loaded with HTTP 200, and the walkthrough passed. The amounts I checked by hand were right: the invoice GST split, the round-off, TDS at 10% of the amount before GST, and the bank matches less TDS. The gaps below are about what's around the maths.

## 1. Demo readiness: what would look wrong in a 10-minute landlord demo

1. **A red "1 Issue" badge sits in the corner of most screens** (the lease page, the invoice page, every step of Add lease). It is Next.js's development overlay reporting "Could not validate `instant`" (`cacheComponents: true` in `next.config.ts`). The demo script runs on `pnpm dev`, so the landlord sees an error badge on every click. Fix: run the demo on `pnpm build && pnpm start`, or set `devIndicators: false`, and fix the warning itself (see 6.1).
2. **The demo's new lease has no rent increase, so the "aha" schedule is a flat ₹7,43,000 for 109 rows** (`docs/DEMO_SCRIPT.md` part 4; walkthrough screen 12). The script never clicks "Add a rent increase", but it then says "increases and all".
3. **"Last day of the lease: nine years later" makes a one-day stub month at the end.** The demo types 01-11-2035, so the review shows "Nov 2035 ₹24,766.67" as its last row. The script should say 31-10-2035, and the form could suggest the day before the anniversary (`src/components/leases/` dates step).
4. **The lease form's date boxes show `mm/dd/yyyy`** on an English (US) browser (walkthrough screen 10). That breaks the DD-MM-YYYY rule at the very moment the landlord watches a date being typed.
5. **Today opens with "Billed ₹0" and "Collected ₹0"** (`/today`), because the seed's history stops last month and the demo runs on the 24th. The first impression is two zeros, plus "Oct 2026 invoices aren't made yet" three weeks into October.
6. **Today's amounts don't match the report the demo opens two minutes later.** Today says "Rangoli Media Labs hasn't paid ₹13,56,843" (less expected TDS), while Unpaid and ageing says ₹14,82,477 and Today's own "Unpaid now" box uses the gross figure (₹25,35,488). A sharp landlord will ask which number is right (`src/lib/alerts/attention.ts` vs `src/lib/reports/`).
7. **Overdue invoices show the status "Sent", not "Overdue"**, on the Billing list and the invoice page. Gulmohar's September invoice is 46 days late and is labelled "Sent". Only the daily reminder job (Inngest) changes the status, and it isn't running in the demo (`src/lib/reminders/run.ts`).
8. **After "Send 45 invoices", the same black "Make Oct 2026 invoices" button is still the main button** on `/billing?month=2026-10`. It invites a second click whose effect isn't clear.
9. **The lease page puts all 108 months of the schedule under the key facts, with no folding** (`/leases/[id]`). That's fine on a laptop, but it's a 5,000-pixel page on a phone.
10. **Invoice lines come out in an odd order: "Parking, Rent, Maintenance"** on the Kalinga draft, "Maintenance, Rent" on the PDF. Rent should always be first.
11. **The tenant's address repeats the state**: "…Haryana 122002, Haryana" on the tenant page (`/tenants/[id]`).
12. **The building card and the vacancy report disagree.** The Buildings list says Sharma Corporate Tower has "1 vacant", while the Vacancy report says 2 (unit 704 in fit-out). The cards also don't show the occupancy % the plan asks for (`/leases/buildings`).

## 2. Pilot readiness: what a real landlord's first month would hit

1. **No way to bring in what tenants already owe on day one** (D-028 open). A pilot's ageing report, Today, reminders and bank matching will all be wrong for any tenant who is behind when they start. This blocks the "invoices match Excel" gate.
2. **Emails silently go nowhere without `RESEND_API_KEY`.** `src/lib/email/index.ts` falls back to the console driver in any environment, and the invoice page still says "Sent on … to accounts@…". A pilot deployed before the Resend task is done would believe 45 invoices went out. Production should refuse to send, or warn on screen.
3. **The Tally XML has no ledger masters** (0 `<LEDGER>` entries in a September export with 87 vouchers). TallyPrime refuses vouchers whose party ledger doesn't exist, so the first import fails for every tenant the accountant hasn't already created by hand with exactly the same name (`src/lib/exports/tally.ts`). It hasn't been tested against a real Tally either (M7 human task, D-027).
4. **One Tally file mixes both GSTINs** (Haryana and Karnataka invoices together), all receipts go to one "Bank Account" ledger, and the Tally export screen has no business filter (`/reports/tally`). Most accountants keep one Tally company per GSTIN.
5. **Invoice statuses, reminders and the scheduled billing run all depend on Inngest**, which is a human setup task. Without it, nothing becomes "Overdue", no reminder goes out, and invoices are only made by hand (`src/lib/jobs/`). There's no on-screen sign that the background jobs aren't running.
6. **The UPI QR code is missing on most real invoices by design**: it's left off paid and part-paid invoices, and it drops the amount above ₹1,00,000 (D24), which is most commercial rents. The roadmap's "UPI QR code" promise is weaker than it sounds, and landlords should be told.
7. **Credit notes start at the full invoice amount** (`/billing/invoices/[id]/credit-note`: "Each line starts with all that is left on it"). An accountant giving a ₹5,000 waiver who doesn't retype every line issues a ₹2,99,000 credit note, which can't be undone.
8. **There's no PDF or Excel of a tenant's ledger** (`/tenants/[id]/ledger`). "Send me our statement" is the most common tenant request, and the accountant will go back to Excel for it.
9. **The import has never seen real data**: there are no real bank exports in `tests/fixtures/bank/` and no pilot workbook. The lease import covers one yearly increase, maintenance and parking. Custom increase dates, quarterly billing, stepped rents and several charge types will need hand entry after import (`src/lib/imports/`).
10. **Many tax rules are still unconfirmed**: 17 `ca` entries in `docs/DECISIONS_NEEDED.md` (GST rounding, TDS rounding, credit-note GST, e-invoicing D-012). Any landlord above ₹5 crore turnover can't issue valid B2B invoices without an IRN, and 100 tenants at ₹1 lakh a month is over that.
11. **Reminder emails to tenants are fixed text**, with no preview anywhere in Settings → Billing rules. The landlord can't see what their tenants will receive before turning it on.

## 3. Missing or half-built v1 features (`docs/PRODUCT_PLAN.md`)

1. **Opening balances** (onboarding step 5) are missing; see 2.1.
2. **Documents are missing.** You can't upload the signed agreement to a lease, or documents to a tenant (lease form step 6; tenant page "documents"). A `documents` table exists, but no screen uses it.
3. **There's no activity log on any record** ("Activity log on every record"; tenant page "activity"). It is written in the data layer but can't be seen anywhere.
4. **There's no global search** (tenant, unit, invoice number) in the header.
5. **There's no Google login** (email and password only).
6. **The security deposit is a single number**, not a ledger. There's no deposit refund or settlement statement on tenant exit (Tenant exit workflow step 2).
7. **There's no "remind all" and no select-many on any list** (Billing invoices, Today's unpaid tenants, ageing). Bulk actions are a "Keeping it simple" rule (no. 5); only "Send all" and "Record N payments" exist.
8. **Custom critical dates can't be added**, and the expiry alert has no "Start renewal" or "in discussion" marking on Today. The renewal workflow's first step is missing.
9. **Missing TDS certificates have no "Request from tenant" action**, on Today or on the TDS screen. There's only "Upload certificate".
10. **Units can't be bulk-added by pasting from Excel** on the building page. Only the full Excel import exists.
11. **The tenant page has no list of invoices.** It shows payments and a ledger link, but not invoices with their status.

## 4. Security, data safety and operations

1. **There are no backups, staging or production yet.** These are all `(human)` tasks in M8, and nothing has run outside this laptop. Real data must not go in until backups are on and a restore has been tried once.
2. **There's no CI** (no `.github/workflows`). The 951 unit and database tests and 50 browser tests only run when someone remembers, and nothing stops a broken commit reaching the pilot.
3. **The deploy has no runbook.** There's no written path for running `drizzle/0000–0027` against the cloud database, the Inngest sync, the Vercel environment variables or the Supabase Storage bucket policies. `pnpm db:migrate` deliberately refuses remote databases, so the first deploy will be improvised.
4. **Row-level security is on for all 30 tables but not forced** (`relforcerowsecurity = f`). It holds only because `src/lib/db/scoped.ts` switches to `authenticated`. Every `runAsSystem` and bare `db` call (the jobs, `monthly-billing.ts` reading all organizations) bypasses it, so one missing `where` in a job leaks across organizations.
5. **There's no uptime check or alert when a daily job fails.** Sentry is no-op code until it gets a DSN, and a skipped 06:00 billing run or 09:00 reminder run would go unnoticed.
6. **There's no way for users to reach support** (D-029 open). The error pages have no contact.
7. **Uploads are capped at 3 MB through server actions** (`MAX_UPLOAD_BYTES`). Scanned Form 16A files and future lease agreement PDFs often exceed that.

## 5. Simplicity: UX rules broken, jargon, screens with more than one primary action

1. **Lists over 20 rows have no search**: Billing invoices (45 rows), Payments (172 rows), TDS certificates (45 tenants × 4 quarters, a 13,000-pixel page on a phone) (`/billing`, `/billing/payments`, `/billing/tds`). This breaks the screen checklist.
2. **Date inputs everywhere use the browser's native date picker**, which shows `mm/dd/yyyy` outside an Indian locale (lease form, payment form, reports' "As on", Tally dates).
3. **The Rent roll is 15 columns wide** with no card view under 768px (`/reports/rent-roll`). It's accountant-only, but the owner will open it on a phone.
4. **Billing → Payments → TDS certificates is three levels deep**, and TDS lives under Payments with a "← Payments" back link. An accountant looking for TDS has to know it sits under Billing.
5. **Today repeats one card per rent increase**: five identical "Rent increase in 8 days" cards push the lease-end alert below the fold. Increases due on the same day could share one card.
6. **The tenant page puts an always-open "Add a contact" form under the contact list** (`/tenants/[id]`), so the page has two filled buttons ("Record payment", "Add contact") competing.
7. **Jargon that slipped through**: "SAC 997212" on every invoice line in the app (fine on the PDF, noise on screen); "Round off ₹0.46"; "Mark 3 as not rent" on Match payments; "Charged as" and "Billed area" side by side in the lease form.

## 6. Technical debt that will bite within 3 months

1. **`cacheComponents: true` with auth in the layouts** makes every route fail Next 16's `instant` check (34 console errors in one crawl). It's harmless today, but it hides real rendering warnings and will need restructuring before any page is made faster.
2. **Two Vitest configs are both tracked** (`vitest.config.ts` and `vitest.config.mts`, which differ). One day a test runs under the wrong one.
3. **`docs/BACKLOG.md` has about 140 rows** of reviewer should-fixes with no priority or owner. Several of them are items in this report.
4. **Tally ledger names are free text** in Settings → Tally, matched by exact string to Tally. A renamed tenant changes its party ledger name in the next export, and old and new vouchers split across two ledgers.
5. **Invoice statuses are stored and updated by a job** instead of worked out from the due date. Any gap in the job leaves wrong statuses that every screen trusts (see 1.7 and 2.5).
6. **Stray files at the root**: `PIPELINE OLD.md`, `INSTALL_CODEX.md` and `INSTALL_PROMPT.md` are tracked. They confuse anyone (or any agent) reading the repo.
7. **The demo depends on today's date.** The seed's figures shift every day, and `docs/DEMO_SCRIPT.md` says "read them off the screen". A demo late in the month always shows ₹0 billed (1.5).

## Verdict

The engine works. In everything I clicked through, invoices come out with the right rent, GST, round-off and TDS. Payments and bank matching work. The screens are mostly plain and calm. For a demo it's close: run it from a production build so the red error badge disappears, add a rent increase to the demo lease, and fix the end date. Then it will impress.

It is **not ready for a real landlord's money yet**, for four reasons:

- you can't enter what tenants already owe on day one;
- without the email account set up, invoices look sent but go nowhere;
- the Tally file will be rejected the first time unless the accountant has already created every tenant in Tally by hand;
- there are no backups or a live server yet.

Several promised v1 pieces are also missing: uploading the signed lease, the history of changes on each record, search, deposit refunds, and "remind all".

My advice: spend one to two weeks on opening balances, safe email sending, the Tally ledgers, the credit-note default and the demo fixes, while you set up the accounts and backups. Then run one pilot alongside their Excel for a month before charging anyone.

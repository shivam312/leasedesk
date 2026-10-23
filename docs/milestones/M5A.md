# M5a. Demo data and walkthrough: what was built

Built 2026-10-24 on `main`. Nothing in M5a changes how the app bills, so the billing and UX reviewers weren't needed; Codex reviewed it twice, and its one remaining point (the demo's security deposits were worked out in decimals) was fixed two minutes after its second round and is logged as D-031 for you to close. M5a added no database tables and no settings, so there are no new migrations. Checked during this wrap-up on 2026-10-24: all 990 unit and database tests pass, 39 of them new. The walkthrough was recorded on 2026-10-24 and its screenshots are in git; `pnpm test:e2e` wasn't run again during this wrap-up.

Three things are new for you:

- **A demo you can show a landlord.** One command builds "Sharma Estates", a made-up landlord with two buildings, 45 tenants and three months of invoices and payments, and prints a login. Running it again puts everything back.
- **A walkthrough you can read without running anything:** `docs/walkthrough/index.html` has 32 screenshots of a month's work on the demo, each with a caption saying what the user is doing and which rule made the numbers.
- **A 10-minute demo script** for a landlord meeting, `docs/DEMO_SCRIPT.md`, with every click.

There are no pipeline tasks left on the roadmap. What remains is yours: the M8 human tasks (accounts, staging, a pilot's real data, a usability test, the CA review) and the earlier ones listed under Human tasks below.

## In plain words

### The demo landlord

`pnpm db:seed:demo` builds **Sharma Estates**:

- **Two buildings:** Sharma Corporate Tower, an 8-floor office block on Golf Course Road, Gurugram, billed from a Haryana GSTIN; and Sharma Arcade, a shops-and-offices building in Indiranagar, Bengaluru, billed from a Karnataka GSTIN. A few units are left empty so the vacancy report has something to show.
- **45 tenants** with believable Indian company names, valid PANs, and GSTINs whose state code matches the tenant's state. Companies deduct TDS; a few proprietors don't.
- **45 leases**, one per tenant, with chargeable areas and rents per sq ft in realistic ranges, maintenance and parking charges, a mix of 5% every year and 15% every three years, and six months' deposit. Two leases have rent-free periods (one still running). One lease ends in exactly 60 days, with its notice date already passed. One is still in lock-in.
- **History up to last month:** invoices for the last three months, sent and numbered the way the app does it, and payments for most of them with each tenant's TDS kept back. Six invoices are left unpaid at three different ages, so Today and the ageing report have something to chase. Three tenants haven't sent their TDS certificates for the last quarter whose certificates are already due, so "3 TDS certificates missing" shows on Today.
- **This month is left unbilled**, so the demo can make, check and send the month's invoices live.

The demo is built from today's date, so whatever day you run it the story is the same: the lease ending in 60 days is always 60 days away, and the history always runs up to last month. The amounts on screen change with the month, which is why the demo script says "read them off the screen".

Everything is saved through the app's own code, not written straight into the database: leases go through the lease form's checks, invoices are made by the billing run and numbered by the same code that sends real invoices, payments are recorded the way the payment form does it, and the certificates are real files in local Storage. If a rule changes in a way that breaks any of these, the demo seed breaks too, which is what we want.

The script also writes a bank statement in HDFC's CSV layout to `.local-demo/hdfc-statement.csv`, dated today, in which two tenants pay their overdue invoices less TDS and one electricity bill goes out. It prints the one payment to record by hand (Rangoli Media Labs' oldest invoice, with the amount received and the TDS that fills in) and the demo login with a new password each time.

Running the seed again removes the demo organization first, including its sent invoices and payments, which the app otherwise never lets anyone delete. This is the only code that can do that, and it refuses to run against any database that isn't on your own computer.

### The walkthrough

`pnpm walkthrough` logs in as the demo owner and goes through a month's work in a real browser, taking a full-page screenshot at every step and recording a video:

1. Log in and read Today
2. Open a tenant (Kalinga Infotech) and their lease, with its nine-year rent schedule
3. Add a tenant and a lease on the empty 7th-floor office, end to end, and see the rent schedule
4. Make this month's invoices, open Kalinga's draft, tap a line to see how it was worked out, send them all
5. Record Rangoli Media Labs' payment with TDS and see it applied to the oldest invoice
6. Import the bank statement and confirm the matched payments
7. Open each of the seven reports and the Tally export

Today and the lease list are also taken at phone width (375px). The 32 screenshots are in `docs/walkthrough/screens/` and committed, so you can read the walkthrough without running anything. The two videos (laptop and phone) are several megabytes each, so they aren't in git; one run of `pnpm walkthrough` makes them.

`docs/walkthrough/index.html` is written at the end of each run: the screenshots in order under their step, each with a one-paragraph caption for you, saying what the user is doing, what to notice, and which rule or setting produced the numbers (for example, that Kalinga's CGST and SGST are 9% each because the building and the billing GSTIN are both in Haryana, and which setting rounds the total). The captions are worked out from figures the run reads from the database, so they match the pictures whatever the date.

**The walkthrough is also a test.** The same script runs inside `pnpm test:e2e` without saving pictures. There it checks the amounts on screen against the billing engine run on the demo plan itself: every row of this month's billing list, the month's total on the send step, each line, the GST, round-off, total and TDS on Kalinga's draft, and Rangoli's earlier invoices. So a lease saved wrongly, a setting resolved wrongly or an amount shown wrongly fails the test. The panel that explains a line is checked for the engine's working, too.

### The demo script

`docs/DEMO_SCRIPT.md` is a spoken 10-minute script for a landlord meeting, in eight parts: the problem, Today, a tenant and their lease, adding a lease, this month's invoices, payments by hand and from the bank, reports, and the close. Each part says what to say and exactly what to click. It opens with the five minutes of preparation the morning of the meeting, and ends with what to do if something goes wrong (reseed). The example amounts in brackets are from 24 October 2026 and are marked as date-relative.

## How to try it

1. Start Docker Desktop. Run `supabase start`, then `pnpm db:migrate` and `pnpm dev`.
2. Run `pnpm db:seed:demo`. Note the password it prints, the payment to record, and the bank statement path.
3. Open http://localhost:3000/login and log in as `demo@sharma-estates.example`. Today shows the unpaid tenants, the missing TDS certificates, the lease ending in 60 days and the rent increases coming up.
4. Follow `docs/DEMO_SCRIPT.md` from part 3, or just: **Billing → Make … invoices**, open **Kalinga Infotech Pvt Ltd**, tap the **Maintenance (CAM)** line, go back and **Send 45 invoices**.
5. **Tenants → Rangoli Media Labs Pvt Ltd → Record payment**, type the amount the seed printed and watch the TDS fill in.
6. **Billing → Payments → Import bank statement**, choose `.local-demo/hdfc-statement.csv`, then **Match payments** and **Record 3 payments**.
7. To see the pictures instead, open `docs/walkthrough/index.html` in a browser. To record a fresh run with videos, run `pnpm walkthrough` (it resets the demo first and starts `pnpm dev` if it isn't running).

## Fixed after review

- **The walkthrough captions named October 2026's TDS quarter** whatever the date; they now take the quarter, its due date and the financial year from the run's date.
- **The demo's security deposits were worked out in decimals** and could be a few paise off for odd areas (Codex review, D-031). They now come from the billing engine's whole-paise rent functions, with a hand-worked test: ₹85.51 per sq ft on 1,250.50 sq ft for six months gives ₹6,41,581.56, matching six monthly invoices.
- **The demo seed's unit queries weren't scoped by organization** (Codex review): another organization's unit with the same number could have been marked leased. Fixed, with a database test.
- **Removing the demo refuses a non-local database itself**, not only when run from the script.
- **The walkthrough checks the explain-this-amount panel** shows the engine's working for the line it opened (Codex review).
- **The demo script marks its date-relative figures**, so a reader on another day isn't surprised by different amounts.

## Tests added

- **Unit and database tests:** 990 in total, up from 951 at the end of M8, so 39 are new. All pass, with none skipped. They cover:
  - the demo plan: two buildings in the right states, 45 tenants with valid PANs and GSTINs, realistic rents, the mix of increases, two rent-free periods, exactly one lease ending in 60 days and one in lock-in, which months the history covers on any date (including across a financial year), payment dates, the bank statement CSV, and the deposits in whole paise
  - what the billing engine says each demo lease bills (Kalinga's October invoice line by line, only maintenance during a rent-free month, the arcade's 10-day due date, a lease starting next month billing nothing)
  - marking a unit leased touches only the demo organization's unit (against the real database)
  - the walkthrough page: a caption for every screenshot the run takes, the draft's numbers explained with their rules, the TDS quarter from the run's date, names escaped, screenshots in order with phone ones narrow and the videos linked
- **Browser test:** `tests/e2e/walkthrough.spec.ts`, the whole month on the demo (laptop width only, since two copies would reset the same demo at once), checking the amounts on screen against the engine. It is also `pnpm walkthrough`.

## Settings added

None. The demo uses the default settings plus building defaults (the arcade's 10-day due date), so what it shows is what a new landlord gets.

## Decisions

Recorded in `docs/DECISIONS.md`. No action is needed:

- **D43:** the demo organization is built from today's date through the app's own code, and reset by removing it.
- **D44:** the walkthrough is one Playwright test, run two ways: recorded by `pnpm walkthrough`, checked by `pnpm test:e2e`.

Waiting for you in `docs/DECISIONS_NEEDED.md`:

- **New in M5a:**
  - **D-031** (product): Codex's last point on M5a, the deposit arithmetic, is fixed but Codex hasn't seen the fix. Recommended: A, accept the fix and close M5a. You can close it with "A".
- **Still open from earlier:** D-001 to D-030. None blocks work.

## Human tasks

- **New in M5a:** none.
- **Still open from earlier:**
  - the M8 pilot tasks: Sentry, Supabase cloud (Mumbai), Vercel and Inngest accounts; the Supabase cloud project's Site URL and redirect URL; staging and backups; a pilot's real data compared with their Excel; a usability test with an accountant; the CA review of `docs/BILLING_RULES.md` and the `ca` entries
  - Google login (M2)
  - the Resend account for real email (M4)
  - real bank statements from each bank your pilots use (M5)
  - `APP_URL` for the daily email and reset links (M6)
  - a sample Tally XML export (M7)

## Backlog (`docs/BACKLOG.md`)

Nothing here gives a wrong amount on an invoice. The M5a items:

- **Today lists every unpaid tenant with no limit.** Once a month's invoices are sent after their due date (the walkthrough sends October's on the 24th), Today has 40-plus "hasn't paid" cards and is very long on a phone. The walkthrough takes its phone screenshot before sending for this reason. Suggested: show the five largest or oldest and a "See all" link to the ageing report.
- **The buildings list counts vacant units from a status the app never updates** when a lease is saved or ended, so the demo seed sets it by hand, and the lease the walkthrough adds leaves its office "vacant" on the buildings list while the vacancy report counts it leased. Suggested: count from the leases covering today, as the vacancy report does.
- **The walkthrough's lease reader** takes the first row of a join across a lease's units and increase rules; fine today (one of each), but a demo lease with two would be ambiguous.
- **One unit or database test failed twice** just after a Playwright run had loaded the machine, and passed on nine reruns; its name wasn't captured. Already in the backlog from M8.

## For the next milestones

- **The pilot (M8 human tasks):** rehearse with `docs/DEMO_SCRIPT.md` on the demo before meeting a landlord. Reseed with `pnpm db:seed:demo` before each rehearsal; it prints a new password every time.
- **Keep the demo seed passing.** It saves through the lease form, billing run, invoice sending and payment code, so a change that breaks it has probably broken a real path too. Its amounts are never hard-coded: the walkthrough reads them from the database after seeding, and the expected invoices come from the engine run on the plan.
- **Re-record after screen changes.** `pnpm walkthrough` overwrites the screenshots, `shots.json` and `index.html`; commit them so the page stays current. A new screenshot needs a caption in `src/lib/demo/walkthrough-page.ts`, and a unit test lists every screenshot the run takes.
- **The e2e walkthrough and the recorded one are the same test** (D44); change the steps in `tests/e2e/walkthrough.spec.ts` and both follow.
- **Fix the Today unpaid list and the vacant-unit count** (backlog) before the pilot sees them: both show on the demo as soon as a month's invoices are sent late.

# Demo script: a month at Sharma Estates (10 minutes)

A spoken script for showing LeaseDesk to a landlord, on the demo data. **Say** is what you say; **Click** is exactly what to tap. Amounts depend on the day you seed (the demo's history runs up to this month: this month's invoices went out on the 1st, and the payments that have come in so far are recorded), so read them off the screen; the examples in brackets are from 24 October 2026.

The pictures for every step are in `docs/walkthrough/index.html` (made by `pnpm walkthrough`). Look through them once before the meeting.

## Before the meeting (5 minutes, the morning of)

1. Start the app on a production build: `supabase start`, then `pnpm build && EMAIL_DRIVER=console pnpm start` (the demo's emails go to `.local-outbox/`; without a Resend key, a production server otherwise refuses to send). Don't demo on `pnpm dev`: it is slower on the first visit to each page, and Next.js's development badge can appear in a corner of the screen.
2. Reset the demo: `pnpm db:seed:demo`. It prints:
   - the login (`demo@sharma-estates.example`) and a new password: write it down;
   - the month to make invoices for in part 5 (next month, e.g. "Nov 2026"; this month only if you seed on the 1st);
   - the payment to record in part 5 (e.g. "Rangoli Media Labs Pvt Ltd pays SCT/26-27/0049 (₹4,94,159): type ₹4,52,281 received, TDS ₹41,878 fills in"): write it down;
   - the bank statement for part 6: `.local-demo/hdfc-statement.csv`. Copy it to the desktop.
3. Open http://localhost:3000/login in a full-screen browser window. Log in once and log out, so the first pages are already loaded.

Running the seed again at any time puts the demo back exactly as it was, so you can rehearse as often as you like.

## 1. The problem (1 minute, no clicks)

**Say:** "Most landlords I meet run billing from an Excel sheet of leases, a Word invoice template and a WhatsApp group for who hasn't paid. Every month someone works out each tenant's rent, remembers whose increase is due, adds GST, types the invoice, then chases payments and TDS certificates. LeaseDesk does that from the lease: you enter it once, and it bills it correctly every month."

**Say:** "This is a demo landlord, Sharma Estates: an office tower on Golf Course Road in Gurugram and a shops-and-offices building in Indiranagar, Bengaluru. 45 tenants. Everything here is made up, but the amounts are worked out the way your accountant would."

## 2. Today (1 minute)

**Click:** log in with the demo email and password.

**Say:** "This is the first thing you see every morning. Top: what you've billed, collected, and what's unpaid. Below: what needs doing, most urgent first."

**Point at**, in order:
- "Rangoli Media Labs hasn't paid ₹…: three invoices, the oldest more than three months late. One tap sends them a WhatsApp reminder."
- **Remind all 3** above the list: "Or one tap emails every late tenant a reminder for the amount after TDS, and tells you who has no email address."
- The boxes at the top: "October's invoices went out on the 1st; this is what's come in so far."
- "3 TDS certificates missing": "tenants who kept back TDS but haven't sent their Form 16A for the last quarter whose certificates are due (April–June, due 15 August, when seeded in late October). You lose that credit if you don't chase it."
- "Rent increase in … days" cards: "LeaseDesk knows every increase in every lease."
- "Lease ends in 60 days, Ojas Wellness": "and the notice date has already passed, so you know to call them."

## 3. A tenant and their lease (1 minute)

**Click:** Tenants → **Kalinga Infotech Pvt Ltd**.

**Say:** "A tenant's page: GSTIN, PAN, the TDS they deduct, and every payment with the TDS they kept back."

**Click:** the lease card **Sharma Corporate Tower**.

**Say:** "Their lease: 2,718 sq ft at ₹90 a sq ft (from August 2023 on the example date; the demo starts it 38 months before the month you seed), 5% more every year." **Scroll to Rent schedule.** "This is the whole rent schedule, nine years to the last day of the lease, worked out in advance. Each increase is rounded to the rupee, which is a setting if you do it differently. No more working out the increase on a calculator."

## 4. Adding a lease (2 minutes)

**Say:** "A new tenant is taking the empty office on the 7th floor. Let's add them."

**Click:** Tenants → **Add tenant**. Type:
- Tenant name: `Lakshya Ventures Pvt Ltd`
- GSTIN: `06AABCL4321K1ZP`, Billing address: `Golf Course Road, Gurugram`, State: Haryana
- Contact name: `Meera Lal`, Contact email: `accounts@lakshya.example`

**Click:** **Add tenant**.

(Optional: type the GSTIN first with a wrong last character, `06AABCL4321K1ZD`, and press Add tenant. **Say:** "It checks every GSTIN, so a typo never reaches an invoice." Then fix it.)

**Click:** Leases → **Add lease**. Tenant: Lakshya Ventures; Building: Sharma Corporate Tower; tick **703**. **Next**.

Lease starts on: the 1st of next month (e.g. `01-11-2026`). Under Last day of the lease, tap **9 years** (e.g. 31-10-2035).

**Say:** "It ends the day before the anniversary, so nine years is exactly nine years." **Next**.

₹ per sq ft a month: `125`. **Click:** **Add a rent increase**; Increase in %: `5` (every 12 months is filled in). **Next**.

**Say:** "GST at 18%, the SAC code, billing in advance: all filled in from the building. I only typed what's in the lease." **Point at** the monthly rent on Check and save (5,944 sq ft × ₹125 = ₹7,43,000).

**Click:** **Save lease**.

**Say:** "Done. The rent schedule shows every increase to 2035: 5% each November. From next month it's on the invoices, increases and all, without anyone touching it again."

## 5. Next month's invoices (2 minutes)

**Click:** Billing → **Nov 2026** (the month the seed printed) → **Make Nov 2026 invoices**.

**Say:** "That worked out all 46 invoices for next month, including Lakshya's lease we just added. Nothing has gone to tenants yet."

**Click:** **Kalinga Infotech Pvt Ltd** in the list.

**Say:** "Rent, maintenance and parking, then CGST and SGST at 9% each because it's billed from your Haryana GSTIN for a Haryana building. The total is rounded to the rupee with a round-off line, and here's the TDS they're allowed to deduct, 10% of the amount before GST."

**Click:** the **Maintenance (CAM)** line.

**Say:** "Tap any line and it shows how it was worked out: 2,718 sq ft × ₹18. Your accountant can check every rupee against the lease."

(If asked about the payment QR on the PDF: it carries the amount to pay when that's up to ₹1,00,000 after TDS. Above that, UPI's usual limit for one payment, or once an invoice is part paid, the QR has no amount and the tenant types it; a paid invoice has none. The invoice page says which, under Download PDF.)

**Click:** **← Nov 2026 invoices**.

**Say:** "These are dated the 1st, so they wait here as drafts until then. On the 1st, one tap on **Send 46 invoices** asks once, with the total, then gives each invoice its number, in an unbroken series per building and financial year as GST requires, and emails it with its PDF to the tenant's accounts contact. A sent invoice can't be edited; a correction is a credit note."

(If you seeded on the 1st, the month is this month: make them, then **Send 45 invoices** for real.)

## 6. Payments: by hand and from the bank (2 minutes)

**Say:** "Rangoli Media Labs has paid their oldest invoice, less TDS."

**Click:** Tenants → **Rangoli Media Labs Pvt Ltd** → **Record payment**.

Type in Amount received the amount the seed printed (e.g. `4,52,281`).

**Say:** "Watch the TDS box: it worked out that ₹4,52,281 is the oldest invoice less 10% TDS, so it filled in the TDS and applied the payment to that invoice. Oldest first, unless you say otherwise." **Click:** **Record payment of ₹…**.

**Say:** "Most payments come by NEFT, so you don't type them at all."

**Click:** Billing → **Payments** → **Import bank statement**. Bank account: HDFC Bank ending 4821. Statement file: `hdfc-statement.csv` from the desktop.

**Say:** "This is the CSV straight from HDFC net banking. It found the date, narration and credit columns, skipped the electricity bill we paid out, and found three payments received." **Click:** **Import 3 payments received**.

**Click:** **Payments** → **Match payments (3)**.

**Say:** "It read the tenant's name and invoice number in the bank's text and worked out the TDS from the amount. You check the ticked ones and record them all at once." **Click:** **Record 3 payments**.

## 7. Reports (1 minute)

**Click:** Reports.

**Say:** "Everything you or your CA asks for at month-end, each as Excel or PDF." **Click** through quickly:
- **Unpaid and ageing**: "who owes what, by how late."
- **GST summary**: "the figures for your GST return, straight from the sent invoices."
- **TDS summary**: "TDS by tenant and quarter, and which certificates are missing; Tarang, Sapphire HR and Kodagu Spices are overdue."
- **Expiry schedule**: "leases ending in the next year, with the last day to give notice."

**Say:** "And there's a Tally export for your accountant."

## 8. Close (30 seconds)

**Say:** "So: you enter each lease once. Every month it makes the invoices, you check them and send them in one go, payments come in from your bank statement, and Today tells you who to chase. Would you be willing to try it on one of your buildings next month, alongside your Excel, to see if the numbers match?"

## If something goes wrong

- **Forgot the password:** run `pnpm db:seed:demo` again; it resets everything and prints a new one.
- **"Make … invoices" says some leases couldn't be billed:** the demo was changed during rehearsal; reseed.
- **The Match payments list is empty:** the statement was already imported; reseed, or skip to Reports.
- **A page is slow the first time:** that's the dev server compiling it; the real app doesn't do that. Open each page once before the meeting.

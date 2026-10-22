# Commercial Lease Manager — Product Plan

22 Oct 2026

## Vision and positioning

We build the simplest way for a commercial landlord's team to know what every lease says, bill it correctly, and collect every rupee, without Excel. Version 1 replaces the lease spreadsheet, the invoice Word template and the "who hasn't paid" WhatsApp group. Version 2 adds the operations a larger team needs.

**Who we sell to**

- **Primary:** owners of 1–5 commercial buildings (office, IT park, retail) with 20–100 tenants in total, run by a small team: owner, accountant, property manager.
- **Secondary (v2):** property management firms that run buildings for several owners, and mid-size developers.
- **Not yet:** large developers with SAP or Yardi, and tenant-side corporates.

**The pitch:** "Never miss an escalation, renewal or TDS certificate again. Every invoice in one click."

**Design principles (what makes it simple to use)**

1. **One home screen that answers "what needs my attention today?"** Overdue rent, dates coming up, invoices to send. Not charts for the sake of charts.
2. **Enter a lease once; the system does the maths forever.** Escalations, rent-free periods, GST, TDS and pro-rata are computed, never typed.
3. **Bulk by default.** Generate all invoices, send all reminders, record many payments in one action. This is what makes it scale from 5 tenants to 200.
4. **Every number is explainable.** Click any rent amount and see why: base rent, escalation applied on which date, which clause.
5. **Nothing is lost.** Every change is logged with who and when. Leases are versioned, never overwritten.
6. **Fast onboarding.** Excel import and an assisted setup, so a landlord is live in a day.
7. **Works on a phone for the owner, works on a laptop for the accountant.**

## User roles and permissions

Four roles in v1 cover a small team; v2 adds custom roles and building-level access for big teams.

| Role | Typical person | Can do | Cannot do | Version |
| --- | --- | --- | --- | --- |
| Owner / Admin | Building owner, director | Everything, including users, settings, deleting records | — | v1 |
| Accounts | Accountant, finance executive | Invoices, payments, TDS, credit notes, reports | Edit lease terms, manage users | v1 |
| Property manager | Leasing or facility manager | Tenants, leases, units, documents, alerts | Record payments, cancel invoices | v1 |
| Viewer | Partner, auditor, investor | Read everything, download reports | Change anything | v1 |
| Custom roles | Any | Permissions picked per module | — | v2 |
| Building-scoped access | Site manager for one building | Any role, limited to chosen buildings | See other buildings | v2 |
| Tenant (portal) | Tenant's admin or finance contact | See own invoices, pay, upload TDS certificates, raise requests | See other tenants | v2 |

**Approvals (v2):** optional maker-checker. A property manager creates or edits a lease, and the owner approves before it affects billing. Same for credit notes and waivers above a set amount.

## Core data model

The lease is the centre of everything: invoices, payments, alerts and reports are all generated from lease terms. Get these tables right and every feature is a screen on top of them.

Hierarchy: **Organization → Building → Floor → Unit**. A **Tenant** signs one or more **Leases**; a lease covers one or more units and has **Charges**, **Escalations** and **Critical dates**. Each month, charges produce **Invoices**; **Payments** (with TDS) settle them.

| Entity | Key fields | Notes |
| --- | --- | --- |
| Organization | Name, legal entity, GSTIN(s), PAN, bank accounts, invoice series, logo | One per landlord account; a management firm has many in v2 |
| Building | Name, address, total area, GSTIN used for billing, owner entity | Different buildings can bill from different GSTINs |
| Floor | Building, number or name | Optional for small buildings |
| Unit | Floor, unit code, carpet area, chargeable (super built-up) area, status | Status: vacant, leased, under fit-out, blocked |
| Tenant | Company name, GSTIN, PAN, billing address, contacts (billing, admin, legal) | A tenant can hold several leases |
| Lease | Tenant, units, start, end, lock-in end, notice period, rent-free period, deposit, status, signed PDF | Status: draft, active, in notice, expired, terminated, renewed. Versioned on every amendment |
| Charge | Lease, type, basis, rate, frequency, GST rate, start, end | Types: rent, CAM/maintenance, parking, utilities, signage, other. Basis: fixed, per sq ft, per slot, metered |
| Escalation | Lease or charge, effective date or rule (e.g. 5% every 12 months), compounding yes/no | Stored as rules; the schedule is generated from them |
| Critical date | Lease, type, date, reminder days, owner, done yes/no | Expiry, lock-in end, escalation, renewal option, notice deadline, custom |
| Invoice | Number, tenant, lease, period, line items, taxable value, CGST/SGST/IGST, total, due date, status | Status: draft, sent, part-paid, paid, overdue, cancelled. Never edited after sending; corrected with a credit note |
| Payment | Tenant, date, amount received, TDS deducted, mode, reference, allocations to invoices | One payment can settle several invoices |
| TDS record | Payment, amount, quarter, certificate received yes/no, certificate file | Drives the "missing TDS certificates" list |
| Security deposit | Lease, amount, received date, adjustments, refund | Ledger, not a single number |
| Credit note | Invoice, reason, amount, GST reversal | For waivers and corrections |
| Document | Linked to lease, tenant, unit or building, type, file | Agreement, addendum, ID, insurance, NOC |
| Activity log | Who, what, when, before and after | Every change, for audit and trust |

**Build note:** keep money as integers in paise and dates as plain dates (no time zones). Store escalation and charge rules, then generate the rent schedule from them, so changing a rule recalculates the future without touching past invoices.

## Version 1: features and screens

Version 1 is eight screens plus an accounting handover that take a landlord from a lease PDF to a collected, GST-correct invoice. If a feature isn't on this list, it waits.

### 1. Home ("Today")

- Three numbers at the top: billed this month, collected, outstanding.
- **Needs attention** list, sorted by urgency: overdue invoices, escalations in the next 30 days, leases expiring in 90 days, lock-ins ending, missing TDS certificates, invoices not yet sent.
- Each item has its action right there: send reminder, generate invoice, mark done.

### 2. Buildings and units

- Building cards with occupancy % and leased vs vacant sq ft.
- Inside a building: a stacking plan, i.e. floors as rows and units as blocks coloured by status (leased, vacant, expiring soon). Click a unit to see its tenant and lease.
- Bulk add units by pasting from Excel.

### 3. Tenants

- List with search, outstanding amount and number of active leases.
- Tenant page: contacts, GSTIN and PAN, leases, invoices, payments, ledger (running balance), documents, activity.

### 4. Lease setup (the most important screen)

A step-by-step form, not one giant page:

1. **Parties and units:** tenant, units, area basis (carpet or chargeable).
2. **Dates:** start, end, lock-in, notice period, rent-free or fit-out period.
3. **Charges:** rent (per sq ft or fixed), CAM, parking, others, each with GST rate and billing frequency (monthly or quarterly, in advance or arrears).
4. **Escalations:** pick a rule ("5% every 12 months", "15% every 36 months", or custom dates).
5. **Deposit:** amount, months of rent, date received.
6. **Documents:** upload the signed agreement.
7. **Review:** the system shows the **full rent schedule for the whole lease term** (every month, every escalation) before saving. This is the "aha" moment in demos.

### 5. Invoicing

- **Monthly run:** one button generates draft invoices for every active lease for the chosen month. Review the list, then send all.
- Correct GST: for renting property, the place of supply is where the building is, so invoices are normally CGST + SGST whatever the tenant's state; IGST only when the billing GSTIN is registered in a different state from the building. Confirm with a CA. HSN/SAC code on each line.
- Pro-rata for part months (move-in mid-month, escalation mid-period).
- Branded PDF with bank details and UPI QR code; sent by email from the system.
- Sequential invoice numbering per building or GSTIN, by financial year.
- Credit notes for corrections; sent invoices are never edited.

### 6. Payments and TDS

- Record a payment: amount received + TDS deducted = amount settled. Allocate to one or many invoices (auto-allocate to the oldest first).
- Outstanding and ageing report: 0–30, 31–60, 61–90, 90+ days.
- TDS tracker: by tenant and quarter, certificate received or pending, upload the file.
- Reminders: automatic emails before the due date and after it becomes overdue; one-tap WhatsApp reminder (pre-filled message link).

### 7. Alerts and critical dates

- Generated automatically from lease terms; custom dates can be added.
- Daily email digest to each user for their items; in-app list with done or snooze.
- Defaults: expiry at 180, 90, 30 days; escalation at 30 and 7 days; lock-in end at 60 days.

### 8. Reports

- **Rent roll:** every unit, tenant, area, rent, rate per sq ft, lease dates, next escalation.
- Collections for a period, outstanding and ageing, GST summary (for the monthly GST return), TDS summary, lease expiry schedule, vacancy.
- Every report exports to Excel and PDF.

### 9. Accounting handover (moved up from v2)

At 20–100 tenants the accountant won't retype 50+ invoices or record 80 payments by hand, so these two ship in v1:

- **Tally export:** one click exports the month's invoices, receipts and credit notes as a file Tally can import. Full two-way sync waits for v2.
- **Bank statement matching:** upload the bank statement (Excel or CSV); the system suggests which credit pays which invoice, including TDS short-payments. The accountant confirms in bulk.

### Across the app

- **Excel import** for buildings, units, tenants and leases, with a template and row-by-row error messages.
- Global search (tenant, unit, invoice number).
- Activity log on every record.
- Email + password and Google login; four roles from the roles section.

### Explicitly not in v1

Tenant portal, online payment links, full two-way Tally sync, maintenance tickets, CAM reconciliation, multi-organization accounts, mobile app (the web app must work well on a phone instead).

## Keeping it simple

The product should feel like a monthly routine, not a database to manage. These rules decide every design question.

1. **Five menu items, nothing more:** Today, Leases, Tenants, Billing, Reports. Settings sits behind the profile icon. A feature that doesn't fit inside one of the five gets questioned.
2. **Built around the month:** the Today screen walks the team through it. On the 1st, generate and send invoices; mid-month, remind the unpaid; always, upcoming escalations and expiries.
3. **Defaults, not settings:** GST rate, due date, reminder schedule and numbering are set once per building and inherited by every lease. A new lease can be copied from an existing one.
4. **Advanced options stay hidden until needed:** the lease form shows basic fields first; rent-free periods, quarterly billing and custom escalation dates sit behind "More options". A simple lease takes 2 minutes.
5. **Bulk actions everywhere:** generate all, send all, remind all, mark many as paid.
6. **Plain language:** "Rent goes up 5% every year", not "compounding escalation rule". "Tenant hasn't paid", not "receivable ageing bucket". Jargon stays in the accountant's reports.
7. **Every number explains itself:** tap any amount to see base rent, the increase applied and on which date, and GST added.
8. **Every screen ends in an action:** an overdue list has "Send reminder", an expiry has "Start renewal", a missing TDS certificate has "Request from tenant".
9. **No one-off custom requests:** add a field or workflow only when several customers ask for the same thing.
10. **Test with a stranger:** give the app to an accountant who has never seen it; wherever they hesitate, simplify.

## Version 2: features

Version 2 is what lets you sell to bigger teams and charge more: less manual work for accounts, a portal for tenants, and controls for multi-building operations. Build these in order of what paying v1 customers ask for; the order below is a sensible default.

| # | Feature | What it does | Why it matters |
| --- | --- | --- | --- |
| 1 | Online payment links | Payment link and UPI on every invoice through a gateway; paid invoices marked automatically | Removes most manual payment entry |
| 2 | Tenant portal | Tenants see invoices and ledger, download PDFs, pay online, upload TDS certificates, raise requests | Fewer "please resend the invoice" emails; TDS certificates arrive on their own |
| 3 | Full Tally / Zoho Books sync | Two-way sync of invoices, receipts, credit notes and TDS as vouchers (v1 has file export) | No export step for the accountant |
| 4 | Utilities and metered billing | Meter readings per unit (electricity, power backup) entered or imported, billed at set rates | Common in IT parks; currently done in Excel |
| 5 | Renewals and amendments workflow | Renewal pipeline (not started, negotiating, agreed, signed); amendments create a new lease version with an effective date | Keeps history clean and never loses an expiry |
| 6 | WhatsApp Business API | Automated invoice delivery and reminders on WhatsApp with delivery status | Higher response than email |
| 7 | AI lease extraction | Upload a lease PDF; the system drafts dates, rent, escalations and clauses for a human to confirm | Turns onboarding from days to minutes; a great demo |
| 8 | Maintenance and helpdesk | Tenants raise tickets; assign to staff or vendors; status and photos | Brings facility teams into the product |
| 9 | Analytics | Income forecast with escalations, expiry profile by year, collection efficiency | What owners show to banks and investors |
| 10 | Custom roles and building-level access | Pick permissions per module; limit users to some buildings | Needed when teams pass ~10 users |
| Later | CAM reconciliation, maker-checker approvals, multi-organization workspace, leasing pipeline, e-invoicing and public API | For buildings above 100 tenants and property management firms | Rarely needed at 20–100 tenants; build only when larger customers pay for it |

**How v2 serves a big team without hurting a small one:** every v2 feature is switched off by default and enabled in settings. A 5-tenant owner never sees CAM reconciliation or approvals; a 200-tenant team turns them on. Pricing tiers map to these switches.

## Key workflows

Five workflows cover most daily use; each should take minutes, not an afternoon.

### Monthly billing cycle

1. **Monthly billing run** generates drafts for every active lease.
2. **Review and send all.**
3. **Paid on time?** If no, an **auto reminder** is sent and the invoice is checked again until paid.
4. If yes, **record the payment and TDS.**
5. Where TDS was deducted, **chase the TDS certificate** until it's on file.

### Onboarding a new customer (target: live in one day)

1. Sign up, enter organization details, GSTIN, bank account, invoice number format.
2. Download the Excel template; fill buildings, units, tenants and leases (or send their existing sheet and you fill it).
3. Import; fix any rows the system flags.
4. Open each lease and check the generated rent schedule against the agreement.
5. Enter opening balances: what each tenant owes today and deposits held.
6. Invite the accountant and property manager.

### Adding a new lease

1. Create or pick the tenant.
2. Walk the lease form (parties, dates, charges, escalations, deposit, documents).
3. Review the full rent schedule; save. Units flip to leased, alerts are created.
4. The first invoice appears in the next billing run, pro-rated from the rent start date after any rent-free period.

### Renewal or expiry

1. Alert fires at 180 days; the property manager marks the lease "in discussion".
2. Renewed: create a new version with new dates and rent; the old version stays in history.
3. Not renewed: tenant moves to notice; on exit, the unit returns to vacant.

### Tenant exit

1. Record the exit date; final invoice is pro-rated to that date.
2. Deposit settlement: deduct dues and damages, record refund, generate a settlement statement.
3. Lease closes as terminated or expired; history and documents stay.

## Tech stack and architecture

Use one boring, well-documented stack that a solo developer can run: a single web app on Postgres, with background jobs for billing and alerts. No microservices, no mobile app in v1.

| Layer | Suggested choice | Why |
| --- | --- | --- |
| App | Next.js + TypeScript | One codebase for UI and API; huge ecosystem |
| UI | Tailwind + a component kit (shadcn/ui) | Clean tables and forms fast; good on mobile |
| Database | PostgreSQL (Supabase or Neon), hosted in an India region | Relational data with strict money maths; customers will ask where data lives |
| ORM | Prisma or Drizzle | Typed queries and migrations |
| Auth | Supabase Auth or Clerk | Email, Google login, invites, roles |
| Files | S3-compatible storage (Supabase Storage or AWS S3 Mumbai) | Lease PDFs, invoices, TDS certificates |
| Background jobs | Inngest, Trigger.dev or pg-boss | Monthly invoice runs, daily alert digests, reminders |
| PDFs | React-PDF or HTML + headless Chrome | Branded invoices and reports |
| Email | Resend or Amazon SES | Invoices and reminders, with delivery tracking |
| Excel | SheetJS | Import templates and report exports |
| Payments (v2) | Razorpay or Cashfree | UPI and payment links, webhooks for auto-reconciliation |
| WhatsApp (v2) | Meta WhatsApp Business API via a provider | Automated invoice and reminder messages |
| Hosting | Vercel or a single VPS; daily DB backups | Cheap to start; easy to scale |
| Monitoring | Sentry + uptime check | Know about errors before customers do |

**Rules that prevent painful rewrites**

- **Multi-tenant from day one:** every table has an `organization_id`; enforce it in every query (Postgres row-level security if on Supabase).
- **Money in paise as integers;** round only when printing. GST rounding rules in one function.
- **Billing engine as a pure, tested module:** input = lease rules + month, output = invoice lines. Write unit tests for escalations, rent-free periods, pro-rata, mid-month changes and IGST vs CGST/SGST before building screens.
- **Immutable financial records:** sent invoices and recorded payments are never edited, only reversed with credit notes or reversal entries.
- **Audit log** written by the database layer, not by each screen.
- **Indian formats everywhere:** ₹, lakh/crore grouping (12,34,567), DD-MM-YYYY, April–March financial year.

## Pricing, roadmap and launch

Price by number of active leases so a small owner starts cheap and a big team pays more as they grow. The figures below are starting points to test in sales calls, not research-backed numbers.

| Plan | Active leases | Suggested price (₹ / month) | Includes |
| --- | --- | --- | --- |
| Starter | Up to 30 | 3,999 | All v1 features, 3 users |
| Standard (main plan) | Up to 100 | 9,999 | v1 + v2 features as they ship (payment links, tenant portal, Tally sync), 10 users |
| Plus | 100+ | Custom, per lease | Everything, unlimited users, priority onboarding |

Add-ons: annual billing at 10 months' price; a one-time assisted onboarding fee for customers who want you to enter their leases.

### Roadmap (first paying customer in about three months)

| Phase | Timing | What happens | Gate to move on |
| --- | --- | --- | --- |
| Discover | Weeks 1–2 | Talk to 10 landlords; collect real leases | 3 pilots agreed |
| Build v1 | Weeks 3–8 | Billing engine first, then the 8 screens | — |
| Pilot | Weeks 9–10 | 2–3 landlords, free; run their real billing | Invoices match Excel |
| Launch, then v2 | Month 3 onward | Paid plans live; v2 by customer asks | First paying customer |

The pilot gate is the important one: don't charge until the system's invoices match what the landlord billed last month in Excel.

### Launch plan

1. **Before building:** interview 10 commercial landlords or their accountants. Ask to see their lease Excel and a sample invoice. Note every charge type and escalation pattern.
2. **Pilot:** onboard 2–3 of them free for two billing cycles in exchange for weekly feedback and a testimonial.
3. **First customers:** convert pilots to paid; ask each for two introductions to other owners.
4. **Channels:** chartered accountants who handle landlord clients, commercial real estate brokers, building owner associations, LinkedIn posts aimed at facility and finance heads.
5. **Demo script (10 minutes):** enter one lease, show the full rent schedule with escalations, run the month's billing, record a payment with TDS, show the Today screen.

### Open questions

- Office only, or also retail and warehouses in v1?
- Do target landlords need e-invoicing from day one? (depends on their turnover)
- Build solo, or with a co-founder or freelancer?
- Which city or region to sell in first?

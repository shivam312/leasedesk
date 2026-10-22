# Roadmap

Goal: a pilot landlord's real monthly billing runs through the app and matches their Excel, then the first paying customer. Tick tasks as they're done (`- [x]`). Work top to bottom unless told otherwise.

**Current milestone:** M0

## M0. Project setup (week 3)

- [x] Create the Next.js app with TypeScript strict, pnpm, ESLint, Prettier
- [x] Add Tailwind and shadcn/ui; set up the app shell with the 5-item nav (Today, Leases, Tenants, Billing, Reports) and mobile layout
- [ ] Set up Supabase locally (CLI) and Drizzle; `db:generate`, `db:migrate`, `db:seed` scripts (postponed: needs Docker and the Supabase CLI)
- [x] Set up Vitest and Playwright with one passing test each
- [x] Add `src/lib/format.ts` (₹ lakh/crore, DD-MM-YYYY) with tests
- [x] `.env.example`, README with local setup steps
- [x] Update the Commands section in CLAUDE.md to match package.json

## M1. Billing engine (weeks 3–4), before any screens

- [ ] `money.ts` and `dates.ts` with tests (paise rounding, days in month, add months, financial year, quarters)
- [ ] Charge monthly amounts (fixed, per sq ft, per slot)
- [ ] Rent-free periods and rent commencement
- [ ] Escalations: compounding, non-compounding, custom
- [ ] Pro-rata and mid-month splits
- [ ] Full rent schedule for a lease (`schedule.ts`)
- [ ] Invoice lines for a lease and month, monthly and quarterly, advance and arrears
- [ ] GST split and round-off
- [ ] Expected TDS
- [ ] All golden test cases in `docs/BILLING_RULES.md` passing
- [ ] Review by the `billing-reviewer` agent

## M2. Data, auth and setup screens (week 5)

- [ ] Database schema for organizations, memberships, billing entities, buildings, floors, units, tenants, contacts (see `docs/DATA_MODEL.md`)
- [ ] Row-level security policies and org-scoped query helpers, with tests that one org can't read another's data
- [ ] Activity log helper
- [ ] Sign up, log in, invite users, roles
- [ ] Settings: organization, billing entities (GSTIN, bank, UPI), building defaults
- [ ] Buildings and units screens, including the stacking plan
- [ ] Tenants list and tenant page

## M3. Leases (week 6)

- [ ] Schema: leases, lease units, charges, escalation rules, custom escalations, critical dates
- [ ] Step-by-step lease form with "More options" for advanced fields
- [ ] Review step showing the full rent schedule
- [ ] Copy an existing lease as a template
- [ ] Critical dates generated from lease terms
- [ ] Renewal (new version) and termination

## M4. Invoicing (week 7)

- [ ] Schema: invoice series, invoices, invoice lines, credit notes
- [ ] Monthly billing run: generate drafts for all active leases (Inngest job + manual button)
- [ ] Review and "Send all": assign numbers, generate PDFs, email via Resend
- [ ] Invoice PDF with GST fields, bank details and UPI QR code
- [ ] "Explain this amount" on every line
- [ ] Credit notes

## M5. Payments and TDS (week 8)

- [ ] Record a payment with TDS and allocation (auto oldest-first)
- [ ] Bank statement import with column mapping saved per account
- [ ] Matching suggestions and bulk confirm
- [ ] TDS tracker by tenant and quarter, certificate upload
- [ ] Reminders: automatic emails and one-tap WhatsApp link
- [ ] Tenant ledger with running balance

## M6. Today screen and alerts (week 8)

- [ ] Today screen: billed, collected, outstanding; needs-attention list with inline actions
- [ ] Daily email digest per user

## M7. Reports, exports and import (week 9)

- [ ] Rent roll, collections, outstanding and ageing, GST summary, TDS summary, expiry schedule, vacancy
- [ ] Excel and PDF export for every report
- [ ] Tally export (XML vouchers) with ledger-name mapping in settings
- [ ] Excel import for buildings, units, tenants, leases with row-level error messages

## M8. Pilot readiness (week 10)

- [ ] Load a pilot landlord's real data via import; compare one month's invoices against their Excel line by line
- [ ] Sentry, backups, staging environment
- [ ] Full end-to-end test: new org → import → billing run → send → payment → reports
- [ ] UX review of every screen by the `ux-reviewer` agent
- [ ] Usability test with an accountant who hasn't seen the app

## Later (v2, in order)

Online payment links, tenant portal, full Tally / Zoho Books sync, metered utilities, renewals pipeline, WhatsApp Business API, AI lease extraction, maintenance tickets, analytics, custom roles. See `docs/PRODUCT_PLAN.md`.

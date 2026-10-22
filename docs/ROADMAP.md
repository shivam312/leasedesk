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
- [ ] Move invoice number formatting from `src/lib/billing/invoice-number.ts` to `src/lib/invoices/` with sequence assignment (D9)
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

## Open questions

Found while building M1. The engine follows the most conservative reading noted here until the rule in `docs/BILLING_RULES.md` is confirmed or changed.

1. **Quarterly arrears charge ending before the lease.** Section 7 brings an arrears charge's final bill forward to the run after the *lease* ends. When a quarterly arrears charge ends mid-quarter on its own (e.g. parking given up while the lease continues), the engine still bills it in the run after the quarter ends. Confirm with the pilot whether it should also be billed in the run after the charge ends.
2. **Which quarter TDS falls in [CA].** The engine files each TDS record in the FY quarter of the payment date (section 10). The tenant may have deducted it in an earlier quarter (when the rent was credited in their books), which is what Form 16A shows. Confirm which quarter the TDS tracker should use.
3. **TDS on CAM and parking [CA].** CAM and parking default to the tenant's rent setting (10%). Some tenants treat CAM as a contract for services or parking as a separate supply at another rate, or not at all. The setting is per charge type now; confirm what the defaults should be.
4. **GST rounding per line vs per invoice [CA].** Section 2 rounds each tax (CGST, SGST, IGST) to the paisa per line, and the invoice tax is the sum of the lines. Some accounting software computes tax once on the invoice's taxable total, which can differ by a few paise on multi-line invoices. Confirm which the CA expects.

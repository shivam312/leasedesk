# Decisions needed

This is the founder's inbox: the only place questions are asked. Claude adds entries here instead of stopping.

**How to answer:** write your answer on the `Answer:` line (a letter is enough, e.g. `A`), change `Status: open` to `Status: answered`, and save. The pipeline applies answers at the start of its next run and marks them `applied`. For a `package` entry, also add the package name to `.claude/approved-packages.txt`.

**Types:** `product` (your call), `ca` (ask your chartered accountant), `pilot` (ask a pilot landlord), `package` (approve a new library), `spend` (costs money or needs an account).

## Summary

| ID | Question | Type | Blocking | Status |
| --- | --- | --- | --- | --- |
| D-001 | Part-quarter pro-rating method | pilot | no | open |
| D-002 | Should automatic increases resume after a custom increase? | pilot | no | open |
| D-003 | TDS rounding, quarter and applicable charges | ca | no | open |
| D-004 | GST rounding and round-off line | ca | no | open |
| D-005 | Rounding negative amounts | ca | no | open |
| D-006 | Product name | product | no | open |
| D-007 | Final bill for a quarterly arrears charge that ends before the lease | pilot | no | open |
| D-008 | Approve shadcn's `cn` and `radix-ui` packages? | package | no | open |
| D-009 | GST on a month split by a rent increase, shown as one line | ca | no | open |
| D-010 | Building GST rates other than 18%, and 0% invoices | ca | no | open |

## Human tasks

Things only a person can do. Tick them when done.

- [x] Install Docker Desktop and the Supabase CLI (M0; the pipeline stops until they're installed)
- [ ] Apply the local lease migrations: let the pipeline run `pnpm db:migrate`, or run it yourself (M3; blocks every M3 task). The build stage was refused permission to run it twice on 2026-10-23, and the fix stage a third time the same day (no one was there to approve the prompt; the fix stage confirmed all 30 failures are "relation leases does not exist", nothing in the code), so `drizzle/0008_leases.sql` to `0011_lease_terms_rls.sql` aren't applied and 30 database tests fail with "relation leases does not exist" (all other checks pass). Already built on branch `m3-leases-schema`, not merged: the lease schema and the logic for every M3 task in `src/lib/leases/` (form validation, unit-overlap check, review rows, critical dates, copy, renewal, termination), all with unit tests. Also built but never run against the database: the lease server actions and screens (list, four-step form with copy and renew, lease page with End early). Still to do once the tables exist: try the screens, add the Playwright test, tick the M3 tasks. To unblock: run `pnpm db:migrate`, then `pnpm test` and `pnpm db:reset` (for the demo leases). To let future unattended runs do it themselves, allow `pnpm db:migrate` in Claude Code's permissions (it already refuses non-local databases).
- [ ] Create a Google OAuth client (Google Cloud console) and turn on Google login in Supabase Auth, for "Log in with Google" (M2; email and password login works without it)
- [ ] Create a Resend account, verify the sending domain and put `RESEND_API_KEY` in `.env.local` (M4; until then emails go to `.local-outbox/`)
- [ ] Get one real bank statement export (CSV or Excel) per major bank your pilots use, with personal details removed, in `tests/fixtures/bank/` (M5)
- [ ] Get a sample Tally XML export from a pilot accountant's TallyPrime and save it in `tests/fixtures/tally/` (M7)
- [ ] Create Sentry, Supabase cloud (Mumbai), Vercel and Inngest accounts and put the keys in `.env.local` (M8)
- [ ] Set up the staging environment and turn on database backups (M8)
- [ ] Load a pilot landlord's real data and compare one month's invoices with their Excel (M8)
- [ ] Usability test with an accountant who hasn't seen the app (M8)
- [ ] Have a chartered accountant review `docs/BILLING_RULES.md` and the `ca` entries below (M8, before the first paying customer)

## Open

### D-001: Part-quarter pro-rating method
- Status: open
- Type: pilot
- Blocking: no
- Context: When a quarterly charge starts mid-quarter, the first bill covers only part of the quarter. It can be worked out month by month, or by days across the whole quarter. For ₹30,000 a quarter starting 15 May, that's ₹15,483.87 or ₹15,494.51.
- Options:
  - A) Month by month: the quarterly amount ÷ 3 per month, part months by days in that month
  - B) Days across the whole quarter
- Recommendation: A. It matches how monthly charges are pro-rated and how most people would do it in Excel.
- Done meanwhile: A built as the only method (`partQuarterByMonth` in `src/lib/billing/proration.ts`, golden case 10). B is built too, as setting `billing.partPeriodMethod` (organization or lease), default A.
- Answer:

### D-002: Should automatic increases resume after a custom increase?
- Status: open
- Type: pilot
- Blocking: no
- Context: A lease can have an automatic rule (5% every year) and one-off custom increases. Today, once a custom increase happens, the automatic rule stops.
- Options:
  - A) Stop the automatic rule after a custom increase
  - B) Resume the automatic rule from the custom increase
  - C) Let each lease choose (setting), default A
- Recommendation: C.
- Done meanwhile: C built: lease setting `billing.afterCustomIncrease`, default A (`amountSteps` in `src/lib/billing/escalation.ts`; `docs/BILLING_RULES.md` section 5). For B, the rule restarts counted from the custom increase's date (1 Oct custom → next increase 1 Oct a year later), not on the original anniversaries, and never before the rule's own first increase date, so it never bills an increase sooner than a full interval after the custom one or earlier than the rule would have. Tell us if your pilots expect the original dates.
- Answer:

### D-003: TDS rounding, quarter and applicable charges
- Status: open
- Type: ca
- Blocking: no
- Context: Expected TDS is used to decide whether a short payment counts as "paid with TDS". Three things need confirming:
  - Rounding: expected TDS is rounded once to the nearest rupee.
  - Which quarter: each TDS amount is filed under the financial-year quarter of the payment date. The tenant may have deducted it in an earlier quarter (when the rent was credited in their books), and that's the quarter Form 16A shows.
  - Which charges: TDS is set per charge type on the tenant (rent, CAM, parking, other), each with its own rate (D10 in `docs/DECISIONS.md`). By default CAM, parking and other charges follow rent (10%, on for companies). Some tenants treat CAM as a contract for services, or parking as a separate supply, at another rate or with no TDS.
- Options:
  - A) Round to the rupee; quarter of the payment date; every charge type at the rent rate by default, changeable per tenant and charge type
  - B) As A, but file TDS under the quarter of the invoice date (closer to what Form 16A shows)
  - C) Something else (describe the rounding, quarter and default rates)
- Recommendation: A, pending your CA. Note for your CA on the quarter: under section 194-I, TDS is deducted when rent is credited or paid, whichever is earlier, so the invoice date (option B, setting `tds.quarterBasis` = `invoice_date`) may match Form 16A more often.
- Done meanwhile: A built as fixed behaviour, not yet as settings: rupee rounding (`expectedTds` in `src/lib/billing/tds.ts`), quarter of the payment date (`tdsQuarter`), and TDS on/off and rate per charge type on the tenant (`TenantTds`, defaults in `tenantTdsDefaults`). Settings `tds.rounding` (paisa or rupee) and `tds.quarterBasis` (payment or invoice date, which covers option B) are built too, defaults as A; per-type rates are already tenant inputs (`tds.rateBp`, `tds.appliesTo`).
- Answer:

### D-004: GST rounding and round-off line
- Status: open
- Type: ca
- Blocking: no
- Context: GST can be rounded on each invoice line or once on the invoice total, and the total can carry a round-off line to the nearest rupee. Today each tax (CGST, SGST, IGST) is rounded to the paisa per line and the invoice tax is the sum of the lines. Some accounting software computes tax once on the invoice's taxable total, which can differ by a few paise on multi-line invoices.
- Options:
  - A) Round tax per line; round the total to the rupee with a round-off line
  - B) Round tax once on the total; round-off line
  - C) No rounding of the total
- Recommendation: A, pending your CA. Also ask: with option B, one line's tax can differ by a paisa from its rate × its taxable value (the rounding difference is put there so the lines add up). Is that acceptable on a tax invoice and in e-invoice (IRN) line checks? The difference grows with the number of lines at one rate: 50 lines of ₹100.05 at 18% put 23 paise extra CGST on one line (₹9.23 against ₹9.00 on the others). If that's not acceptable, the alternative is to spread the difference a paisa per line.
- Done meanwhile: A built (`lineTax` and `invoiceTotals` in `src/lib/billing/gst.ts`). The round-off line can already be turned off in the engine (`BillingSettings.roundInvoiceTotal`, setting `billing.roundInvoiceTotal`), which covers C. B is built too, as setting `gst.rounding` (`invoiceTax` in `src/lib/billing/gst.ts`), default per line: tax once per rate on the total, with the rounding difference on the largest line so the printed lines add up.
- Answer:

### D-005: Rounding negative amounts
- Status: open
- Type: ca
- Blocking: no
- Context: Credit notes and round-off lines can be negative. Rounding half away from zero makes a credit note mirror its invoice exactly.
- Options:
  - A) Half away from zero (−₹0.005 → −₹0.01)
  - B) Half up (−₹0.005 → ₹0.00)
- Recommendation: A.
- Done meanwhile: A built (`mulDiv` in `src/lib/billing/money.ts`) and written into `docs/BILLING_RULES.md` section 2.
- Answer:

### D-006: Product name
- Status: open
- Type: product
- Blocking: no
- Context: "LeaseDesk" is a working name. A RealPage product called LeasingDesk exists in the US, and a startup uses leasingdesk.ai. The name appears in the app title, emails and invoices.
- Options:
  - A) Keep LeaseDesk after a trademark check
  - B) Choose a new name (tell us which)
- Recommendation: decide with the marketing team. The code keeps the name in one config value (`src/lib/config/brand.ts`) so changing it is easy.
- Done meanwhile: name kept in one place, `src/lib/config/brand.ts`, used for the page title and the app shell. Emails and invoices must use it too when they're built.
- Answer:

### D-007: Final bill for a quarterly arrears charge that ends before the lease
- Status: open
- Type: pilot
- Blocking: no
- Context: A charge billed quarterly in arrears is billed in the run after the quarter ends. When the lease ends mid-quarter, the final bill comes forward to the run after the lease ends (`docs/BILLING_RULES.md` section 7). But when only the charge ends mid-quarter (say parking is given up on 20 Nov while the lease continues), the bill for Oct–20 Nov still waits for the January run.
- Options:
  - A) Keep billing it in the run after the quarter ends (January in the example)
  - B) Bill it in the run after the charge ends (December), the same as when the lease ends
- Recommendation: B, because it treats a charge ending the same way as a lease ending and settles the tenant's account sooner. A is built meanwhile because it never bills early.
- Done meanwhile: A built (`billingRun` in `src/lib/billing/schedule.ts` uses the earlier of the quarter end and the lease end, not the charge end).
- Answer:

### D-008: Approve shadcn's `cn` and `radix-ui` packages?
- Status: open
- Type: package
- Blocking: no
- Context: The current shadcn/ui setup tool installs two packages that aren't on the approved list: `cn` (shadcn's own class-name merger, MIT, from github.com/shadcn-ui/cn) and `radix-ui` (Radix's single all-in-one package, MIT). They came in during M0 setup. The M0 review swapped them for approved packages that do the same job: `clsx` + `tailwind-merge`, and `@radix-ui/react-slot`. Each new shadcn component we add may import the unapproved names again, and we'd have to change those imports by hand each time.
- Options:
  - A) Approve `cn` and `radix-ui` (add both to `.claude/approved-packages.txt`). New shadcn components then work as generated.
  - B) Keep the approved equivalents. Every shadcn component we add has its imports changed to `@/lib/utils` and `@radix-ui/react-*`.
- Recommendation: A, because both are official packages from the same authors as libraries already approved, and it removes a manual step from every new screen. Nothing changes for landlords either way.
- Done meanwhile: B. `src/lib/utils.ts` builds `cn` from `clsx` + `tailwind-merge`, and `src/components/ui/button.tsx` imports `Slot` from `@radix-ui/react-slot`. If you pick A, the switch back is a few lines.
- Answer:

### D-009: GST on a month split by a rent increase, shown as one line
- Status: open
- Type: ca
- Blocking: no
- Context: When rent goes up mid-month, that month can be shown as two invoice lines (one per rate, the default) or one combined line (setting `billing.midMonthIncreaseLines`). GST is rounded on each line, so one line can give CGST and SGST 1 paisa different from two lines. Example: ₹90,000 rising to ₹94,500 on 16 July gives CGST ₹8,309.04 on two lines and ₹8,309.03 on one. Related to D-004 (where tax is rounded).
- Options:
  - A) Allow both: GST worked out on whatever lines the invoice shows
  - B) Always work out GST on the two parts, even when they are shown as one line
- Recommendation: A. Tax on the lines as printed is what an officer or the tenant's accountant can check on the invoice itself.
- Done meanwhile: A built (`linesFor` in `src/lib/billing/invoice-lines.ts`, tested in `line-settings.test.ts`). The default is two lines, so nothing changes unless a landlord picks one line.
- Answer:

### D-010: Building GST rates other than 18%, and 0% invoices
- Status: open
- Type: ca
- Blocking: no
- Context: Each building has a default GST rate (`gst.defaultRateBp`, 18%) and SAC code (997212) for new charges, and each charge can have its own. The app accepts any rate from 0% to 100%. Renting commercial property is normally 18%. An exempt or nil-rated supply (0%) is usually shown on a bill of supply rather than a tax invoice, which the app doesn't produce yet.
- Options:
  - A) Allow any rate; a 0% charge still appears on the normal invoice with ₹0 GST
  - B) Allow only the standard GST rates, and print a bill of supply when every line is 0%
- Recommendation: B before the first paying customer, pending your CA. A is built meanwhile because it bills no tax that isn't owed.
- Done meanwhile: A. Rates are whole basis points 0–10000 (`src/lib/settings/schema.ts`), copied onto charges when a lease is saved (D16).
- Answer:

## Applied

(Applied entries move here, newest first.)

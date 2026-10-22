# Decisions needed

This is the founder's inbox: the only place questions are asked. Claude adds entries here instead of stopping.

**How to answer:** write your answer on the `Answer:` line (a letter is enough, e.g. `A`), change `Status: open` to `Status: answered`, and save. The pipeline applies answers at the start of its next run and marks them `applied`. For a `package` entry, also add the package name to `.claude/approved-packages.txt`.

**Types:** `product` (your call), `ca` (ask your chartered accountant), `pilot` (ask a pilot landlord), `package` (approve a new library), `spend` (costs money or needs an account).

## Summary

| ID | Question | Type | Blocking | Status |
| --- | --- | --- | --- | --- |
| D-001 | Part-quarter pro-rating method | pilot | no | open |
| D-002 | Should automatic increases resume after a custom increase? | pilot | no | open |
| D-003 | TDS: rounding, which quarter, which charges | ca | no | open |
| D-004 | GST: rounding per line or per invoice; round-off line | ca | no | open |
| D-005 | Rounding of negative amounts on credit notes | ca | no | open |
| D-006 | Product name | product | no | open |
| D-007 | Final bill for a quarterly arrears charge that ends before the lease | pilot | no | open |

## Human tasks

Things only a person can do. Tick them when done.

- [ ] Install Docker Desktop and the Supabase CLI (M0; the pipeline stops until they're installed)
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
- Done meanwhile: A built as the only method (`partQuarterByMonth` in `src/lib/billing/proration.ts`, golden case 10). B isn't built yet; it's planned for M2 as setting `billing.partPeriodMethod`, default A.
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
- Done meanwhile: A built (`amountSteps` in `src/lib/billing/escalation.ts`; `docs/BILLING_RULES.md` section 5). C planned for M2 as lease setting `billing.afterCustomIncrease`, default A.
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
- Recommendation: A, pending your CA.
- Done meanwhile: A built as fixed behaviour, not yet as settings: rupee rounding (`expectedTds` in `src/lib/billing/tds.ts`), quarter of the payment date (`tdsQuarter`), and TDS on/off and rate per charge type on the tenant (`TenantTds`, defaults in `tenantTdsDefaults`). Settings `tds.rounding` and `tds.quarterBasis` are planned for M2; per-type rates are already tenant inputs (`tds.rateBp`, `tds.appliesTo`).
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
- Recommendation: A, pending your CA.
- Done meanwhile: A built (`lineTax` and `invoiceTotals` in `src/lib/billing/gst.ts`). The round-off line can already be turned off in the engine (`roundInvoiceTotal` option, setting `billing.roundInvoiceTotal`), which covers C. B isn't built yet; it's planned for M2 as setting `gst.rounding`, default per line.
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

## Applied

(Applied entries move here, newest first.)

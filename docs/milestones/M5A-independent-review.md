# Independent review of M5A (Codex)

**Verdict:** fail

The billing examples I recomputed agree with the billing rules, and I found no issue in the invoice arithmetic paths I inspected. The founder report and roadmap do contain a false history-length claim: on the stated 24 October 2026 run, the seed creates four months of history (June–September). I also found floating-point money arithmetic in walkthrough captions, which can make a displayed amount disagree with the billing engine. Check those claims and the recorded walkthrough yourself before sign-off.

## Must fix (1)

- **docs/milestones/M5A.md**: The report says the demo has three months of invoice and payment history, but the seed creates four months for the report's stated run date. The same claim appears in the M5a task description in the roadmap.
  - Evidence: The report says “three months of invoices and payments” and “invoices for the last three months.” `historyMonths("2026-10-24")` returns June, July, August, and September 2026: the test in `src/lib/demo/__tests__/plan.test.ts` explicitly expects June through September, and `historyMonths` extends back to include the latest overdue TDS quarter.
  - Fix: Correct the founder report and roadmap task to describe the date-dependent history length, including four months for the 24 October 2026 run.

## Should fix (1)

- **src/lib/demo/walkthrough-page.ts**: Caption generation calculates money using floating-point multiplication and `Math.round`, despite the integer-paise rule. A caption can therefore show an amount that differs by a paisa from the engine's per-square-foot calculation.
  - Evidence: The `lease` and `new-lease-check` captions calculate monthly rent with `Math.round((ratePaise * area) / 100)`. The engine uses `perUnitMonthly` in `src/lib/billing/money.ts` for this calculation, with integer-paise half-up rounding.
  - Fix: Use `perUnitMonthly(ratePaise, areaHundredths)` for caption amounts instead of floating-point arithmetic.

## Verified by hand

- Hand-checked Kalinga's October rent: ₹2,44,620 at lease start, followed by three 5% increases rounded to whole rupees, gives ₹2,83,179; the CAM and parking line amounts also match the plan.
- Hand-checked Kalinga's tax and total: CGST and SGST are ₹30,249.27 each; the ₹3,96,601.54 pre-round total rounds to ₹3,96,602 with a +₹0.46 round-off.
- Hand-checked Ekam's October rent-free invoice: only CAM is billed; ₹47,412 plus ₹8,534.16 GST rounds to ₹55,946.
- Confirmed the demo deposit uses `perUnitMonthly` and integer `mulDiv`, and the cited ₹85.51 × 1,250.50 × six-month example yields ₹6,41,581.56.
- Inspected the seed's unit lookup and `markUnitLeased`: both filter by `organization_id`; the demo removal path also refuses non-local database URLs.
- Inspected lease creation: demo leases pass through `parseLeaseForm`, `checkLease`, and `createLease`; invoice history uses the billing run and send path, and payments use `recordPayment`.

# Re-check of M1

**Verdict:** pass

The two findings from the previous audit are resolved in the current code. I found no remaining M1 billing-rule violations. Billing tests could not run because Vitest could not write its temporary config file in this read-only workspace, so the result is based on current code and test inspection plus hand calculations.

## Must fix (0)

None.

## Should fix (0)

None.

## Verified by hand

- Money and dates: integer-paise arithmetic and rounding helpers are implemented; date helpers cover month lengths, month addition, financial years, and quarters. Golden and unit tests cover documented cases, including leap-day month addition.
- Charge amounts: fixed, per-square-foot, and per-slot calculations have implementations and tests. Hand check: ₹85.50 × 1,250.50 sq ft = ₹1,06,917.75, matching the documented result.
- Rent-free and commencement: month/day periods, waived charges, and prorated commencement are implemented with targeted tests. Hand check: ₹90,000 × 15/30 days = ₹45,000.
- Escalations: compounding, non-compounding, custom amounts and percentages, charge applicability, and month-end settings are implemented and tested. Hand check: ₹90,015.71 × 1.05 = ₹94,516.4955, rounded directly to ₹94,516. The current code rejects duplicate custom events for one charge/date; tests cover both input orders and mixed agreed-amount/percentage entries. The prior loop concern is addressed by increasing rule dates and a regression test showing termination when the charge starts after lease end.
- Pro-rata and mid-month splits: actual calendar days, inclusive lease end, and split segments are implemented with targeted tests. The documented ₹90,000 × 15/30 = ₹45,000 case matches.
- Full lease schedule: schedule generation covers charge periods, rent-free periods, partial periods, escalation dates, and monthly/quarterly timing; tests include a 36-month schedule and partial start/end cases.
- Invoice lines: monthly and quarterly charges, advance and arrears timing, periods, due dates, and zero-invoice behavior are implemented with targeted tests, including final arrears billing for a lease ending mid-quarter.
- GST and round-off: state-based CGST/SGST versus IGST, configured tax rounding, and invoice rupee round-off are implemented and tested. Hand check: ₹1,06,917.75 taxable at 18% yields ₹9,622.60 each CGST and SGST; subtotal ₹1,26,162.95 rounds to ₹1,26,163 with +₹0.05 round-off.
- Expected TDS: taxable-value bases, per-charge-type tenant rates, and configured rounding are implemented and tested. Hand check: ₹1,00,000 rent at 10% gives ₹10,000 expected TDS; ₹1,08,000 received against a ₹1,18,000 invoice settles it with that TDS.
- Golden cases: `golden.test.ts` contains cases for the documented billing examples and additional tests cover settings and edge cases. `pnpm test billing` was attempted but Vitest failed at startup with EPERM writing `node_modules/.vite-temp/vitest.config.mts...`; tests were not executed.
- Prior audit: the duplicate same-date custom escalation finding is fixed in current `escalation.ts` and has regression coverage. The concern about a charge starting after lease end has a regression test; the rule date loop advances and stops when its date exceeds lease end.
- Scope checks: the billing engine modules are pure and contain no server actions, so M1 has no multi-tenant or role-check path to audit. No screens are part of M1, so UX principles do not apply to this milestone.

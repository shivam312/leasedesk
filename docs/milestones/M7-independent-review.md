# Independent review of M7 (Codex)

**Verdict:** fail

M7 adds seven reports with Excel and PDF exports, Tally vouchers, and spreadsheet imports for buildings, units, tenants, and leases. The rent roll, GST netting, and collection reversal calculations I recomputed agree with the documented rules, and the changed report queries I inspected are organization-scoped. I found two must-fix issues: Excel imports silently round money cells with more than two decimals, and the founder report says every report has a date or month filter even though Unpaid and ageing is fixed to today. Please look especially at the import rounding behavior and confirm that Tally output against a real TallyPrime export before relying on it; that check remains a human task.

## Must fix (2)

- **src/lib/bank/xlsx.ts**: Numeric spreadsheet cells are rounded to paise before validation, so imports can silently change entered money amounts. For example, a numeric cell containing ₹100.005 is converted by `Math.round(Math.abs(v) * 100)` to ₹100.01; the importer then treats that rounded value as valid. This conflicts with the integer-paise rule and with the report's stated row-level validation.
  - Evidence: `src/lib/bank/xlsx.ts:11-15` rounds every non-integer number to two decimals. `src/server/actions/imports.ts:31` passes the parsed workbook sheets to the import planners, which receive only the rounded string and cannot detect the original precision. The same limitation is acknowledged in `docs/milestones/M7.md` under Backlog: “a number cell with more than 2 decimals is quietly rounded rather than refused.”
  - Fix: Preserve enough information to detect excess precision in numeric Excel cells and return a row-level validation error for money fields with more than two decimal places. Convert accepted values to paise without using floating-point rounding.
- **docs/milestones/M7.md**: The founder report falsely claims every report has a date or month filter. Unpaid and ageing is fixed to today and has no date filter, so this could lead the founder to expect historical ageing views that do not exist.
  - Evidence: `docs/milestones/M7.md:17` says: “Each has a date or month filter”. In `src/lib/reports/registry.ts`, the ageing report has `filter: "today"`; the report page renders date controls only for `asOf`, `range`, and `month` filters. The milestone report itself later acknowledges in its Backlog that ageing “shows today only.”
  - Fix: Change the claim to say each report has its applicable filter, and clarify that Unpaid and ageing shows today’s position only.

## Should fix (0)

None.

## Verified by hand

- Read the requested specs and M7 founder report; inspected the M7 roadmap tasks and compared their descriptions with the changed routes, report registry, import actions, and Tally implementation.
- Hand-recomputed rent roll: 1,250.50 sq ft × ₹85.50 = ₹1,06,917.75; the 5% increase rounds to ₹1,12,264 as expected by the billing rules and rent-roll test.
- Hand-recomputed GST summary: ₹1,00,000 taxable less a ₹10,000 credit gives ₹90,000 net taxable; at 18% split equally, net CGST and SGST are ₹8,100 each, matching the test and code’s document-value netting.
- Hand-recomputed collections test: ₹1,06,200 received and ₹10,000 TDS, reversed in full, plus ₹50,000 received yields ₹50,000 net received, zero net TDS, and ₹50,000 settled, matching the test.
- Checked vacancy’s example: 1,000 of 5,000 sq ft leased gives 20% occupancy; the builder and expected test value agree.
- Inspected report query scoping: the changed report loaders use `runScoped`, and their queries use the scoped organization conditions; the new exports table has RLS enabled and organization policies in its migration.
- Verified the M7 task implementations exist in code for seven reports, Excel and PDF report routes, Tally XML and ledger settings, and both spreadsheet import flows. I did not verify that the Tally XML matches real TallyPrime output; the roadmap’s pilot sample task is still unticked.

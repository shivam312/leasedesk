# Audit of M7: Reports, exports and import (week 9)

**Verdict:** fail

M7 features are present in the current code, but Excel import silently changes money values with more than two decimal places. That violates the paise precision rule and the import’s row-level validation promise.

## Must fix (1)

- **src/lib/bank/xlsx.ts**: Excel numeric cells are rounded to two decimal places before import validation, so invalid money values are silently changed and accepted.
  - Evidence: `numberText` computes `Math.round(Math.abs(v) * 100)` and returns the rounded value as text. For example, ₹100.005 becomes ₹100.01 before `importProperty` or `importTenantsAndLeases` can validate it.
  - Fix: Preserve the original numeric precision when parsing workbook cells and return a row-specific validation error for money values with more than two decimal places. Add coverage for excess precision in both import flows.

## Should fix (0)

None.

## Verified by hand

- Rent roll and vacancy: the report registry loads both from the current report query/builders; report unit tests cover rent figures and occupancy/vacancy.
- Collections, outstanding and ageing: current builders handle dated payments and reversals, and group by tenant ID; report tests cover these calculations.
- GST summary and TDS summary: current builders and report tests are present. GST summary aggregates copied document tax values and nets credit notes; a hand check of ₹1,00,000 less a ₹10,000 credit at 18% gives ₹90,000 taxable and ₹8,100 each for CGST and SGST.
- Expiry schedule: current builder is registered and tested, including expiry/notice-date cases.
- Excel export for every report: shared route and registry use the report’s filter parameters; Excel export tests cover generated workbooks.
- PDF export for every report: shared route and registry use the report’s filter parameters; PDF rendering tests are present.
- Tally XML export and ledger-name mapping: current export/data/form implementations and unit/database tests are present. The milestone notes that real TallyPrime compatibility has not yet been checked against a pilot sample.
- Buildings and units Excel import: current action performs role-guarded, organization-scoped planning and saving; property import tests cover row validation and template structure.
- Tenants and leases Excel import: current action performs role-guarded, organization-scoped import; tenancy and database tests cover mapping and persistence. The workbook parser’s precision loss prevents money validation from fully satisfying the task.
- Sent invoice and payment immutability: database rules reject edits/deletes to sent invoices and payment deletion; payments are reversed instead.
- Test run: `pnpm test --run` started, but the output showed two failures in `src/lib/email/__tests__/email.test.ts`; therefore I cannot confirm the suite passes in this environment.

## Resolution (codex-fix, 2026-10-24)

- **Must fix 1 (Excel numbers rounded to two decimals): fixed.** `numberText` in `src/lib/bank/xlsx.ts` now reads a number cell to the 15 significant digits Excel shows (so float noise such as 0.1 + 0.2 still reads "0.30") and never rounds to paise: ₹100.005 stays "100.005", and the forms' own checks refuse it on its row. Tests: the parser keeps 100.005 and -1250.505; the buildings and units import refuses 1250.505 and 1625.255 sq ft on Units rows 2 and 3; the tenants and leases import refuses rent ₹85.505 and a ₹6,00,000.005 deposit, naming the column. Percent cells are fixed too (the 2026-10-23 backlog row on `numberText` is removed). The same parser reads Excel bank statements, where a line with more than two decimals is now left out with "couldn't read the amount" rather than rounded.
- **Should fix:** none were raised.
- **Test run note:** the two `email.test.ts` failures the reviewer saw didn't reproduce: `pnpm test` passes in full here (119 files, 1004 tests).

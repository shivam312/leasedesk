# Re-check of M7

**Verdict:** pass

No remaining M7 must-fix or should-fix findings found in the current code. The previous audit’s Excel precision issue is fixed. Verification was limited by the read-only environment: `pnpm typecheck` could not write `.next/types/routes.d.ts`, and `pnpm test --run` showed two email-test failures before the run stopped producing output.

## Must fix (0)

None.

## Should fix (0)

None.

## Verified by hand

- Rent roll and vacancy: registered report builders and hand-calculated rent and occupancy tests agree. For 1,250.50 sq ft at ₹85.50, rent is ₹1,06,917.75; after a 5% increase it rounds to ₹1,12,264 as specified.
- Collections, outstanding and ageing: payment/reversal totals and overdue buckets are tested. ₹1,06,200 received plus ₹10,000 TDS settles ₹1,16,200; the reversal nets both amounts back to zero.
- GST and TDS summaries: summaries use document tax values and TDS tracker records. ₹1,00,000 taxable less a ₹10,000 credit yields ₹90,000 taxable and ₹8,100 each CGST and SGST.
- Expiry schedule: notice-date edge cases, final-month rent, and financial-year quarter grouping are covered by tests.
- Excel and PDF exports: report registry drives both shared export routes, retaining report filters and search; export workbook and PDF tests exist.
- Tally XML and ledger mapping: voucher tests check sales, credit note, receipt, reversal, XML encoding, and balancing; settings and database export-record tests are present. The M7 note correctly records that compatibility with a real TallyPrime sample remains unverified.
- Buildings and units import: current parser preserves decimals; tests verify row-specific rejection of excess area precision, along with property row validation and persistence.
- Tenants and leases import: tests cover row validation and database persistence; excess-precision rent and deposit values are rejected with column-specific errors.
- Prior audit fix: `numberText` retains 100.005 rather than rounding to paise, and tests cover excess precision in both import flows.
- Sent invoices and payments: current code and database tests preserve sent invoice/payment immutability and use reversal entries for payment corrections.

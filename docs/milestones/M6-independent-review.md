# Independent review of M6 (Codex)

**Verdict:** fail

M6 adds a Today screen with billing and lease alerts, plus a daily email digest. The billing examples I checked match the rules, but one totals path can silently produce an incorrect amount when many invoices are added together, so I can’t sign off on money correctness yet. Please look at Today’s unpaid total and confirm the alert wording and actions fit your team’s routine; the milestone report also says the end to end test was not rerun during wrap-up.

## Must fix (1)

- **src/lib/alerts/attention.ts**: Unpaid and overdue totals are added as JavaScript numbers without checking that the result remains a safe integer. Multiple individually safe invoice amounts can sum beyond `Number.MAX_SAFE_INTEGER` and be displayed rounded, contrary to the milestone report’s claim that unsafe totals are refused.
  - Evidence: Lines 169, 259 and 260–263 use `+=` and `reduce` on paise totals without a safe-range check. `paiseSum` elsewhere explicitly rejects unsafe totals, but these Today totals bypass it.
  - Fix: Use checked paise addition (or bigint accumulation followed by a safe-range check) for per-tenant overdue amounts and both Today totals; throw or surface a clear error if a sum is unsafe.

## Should fix (0)

None.

## Verified by hand

- Hand-checked the per-square-foot example: 125,050 hundredths of a square foot × 8,550 paise per square foot ÷ 100 = 10,691,775 paise, or ₹1,06,917.75; it matches the billing rules.
- Hand-checked the part-quarter example: ₹30,000 × 47 ÷ 91 rounds to ₹15,494.51; the documented month-by-month result ₹5,483.87 + ₹10,000 = ₹15,483.87 also matches.
- Hand-checked Today’s TDS ask example: ₹1,18,000 less ₹10,000 expected TDS is ₹1,08,000; in code, `unpaidInvoices` subtracts TDS already recorded before `amountToAsk` subtracts only remaining expected TDS, avoiding double subtraction.
- Confirmed due-today invoices are excluded from overdue alerts, dates use plain-date comparisons and India’s current date helper, and the digest job is scheduled for 08:00 Asia/Kolkata.
- Confirmed the new digest table has organization scoping, a per-organization/user/day uniqueness constraint, and a trigger preventing edits beyond its one-way status change.
- Confirmed the Today browser test covers making and sending the current month’s invoice at phone and laptop widths; the milestone report explicitly says `pnpm test:e2e` was not rerun during wrap-up.

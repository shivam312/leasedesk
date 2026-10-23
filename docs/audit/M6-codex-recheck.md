# Re-check of M6

**Verdict:** pass

Both M6 tasks work in the current code. The two must-fix items from the previous audit are fixed: checked paise sums now reject unsafe totals, and the walkthrough exercises both Today alerts and their links. One non-blocking digest reliability issue remains.

## Must fix (0)

None.

## Should fix (1)

- **src/lib/alerts/digest-run.ts**: A failed or interrupted daily email claim prevents that user from receiving another digest that day.
  - Evidence: `claimDigests` inserts a unique organization/user/day row before delivery; a failed delivery is recorded as `failed`, and a later run skips the existing row via `onConflictDoNothing()`. The database test confirms the second run sends nothing.
  - Fix: If daily retries are desired, allow failed or stale claims to be retried with provider idempotency protection. This is already recorded in `docs/BACKLOG.md`.

## Verified by hand

- Today screen: `monthTotals` counts non-draft, non-cancelled invoices for the current run month; active payment receipts by received date; and TDS separately. Hand check against the database test fixture: ₹1,17,000 rent + ₹21,060 GST = ₹1,38,060 billed. At 10% TDS on rent, expected TDS is ₹11,700. The asked amount is ₹1,38,060 − ₹11,700 = ₹1,26,360; recording that receipt plus ₹11,700 TDS settles the invoice. `unpaidInvoices` supplies the outstanding calculation used by the payment flow, and Today derives the unpaid totals from those rows.
- Needs-attention list and inline actions: current code constructs unpaid, not-made, not-sent, bank-line, missing-TDS-certificate and lease-date items. Today links bank matching to `/billing/bank/match` and missing certificates to the tracker. `tests/e2e/walkthrough.spec.ts` checks both counts and destinations; `tests/e2e/today.spec.ts` covers making and sending invoices from Today.
- Daily email digest: the job is scheduled for 08:00 Asia/Kolkata. Current recipient logic routes money items to billing-capable roles and lease dates to an eligible assignee or lease-capable roles; it omits empty digests and uses a unique per-user/day claim. Unit and database tests cover recipient selection, email content, duplicate prevention, disabled setting, failed-send recording and organization isolation.
- Previous audit fix: `overdueByTenant` and `unpaidTotals` use checked `sumPaise`; unit tests verify an accumulated total beyond `Number.MAX_SAFE_INTEGER` throws.
- Security and immutability: Today uses organization-scoped queries; date mutations use `guardedForm("manage_leases", ...)` and scoped writes. Invoice and payment immutability is enforced by database rules: sent invoices cannot be changed or deleted, and payments are reversed rather than edited or deleted.

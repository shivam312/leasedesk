# Audit of M6: Today screen and alerts (week 8)

**Verdict:** fail

The M6 screen and digest have working implementations, and the main November billing figures agree with the rules. Two issues need attention: Today can silently misstate totals when safe integer limits are exceeded, and the specific bank-line/TDS alerts are not exercised through the screen or their inline actions in tests.

## Must fix (2)

- **src/lib/alerts/attention.ts**: Today’s unpaid and overdue totals can silently exceed JavaScript’s safe integer range. This contradicts M6’s claim that unsafe totals are refused and can display an incorrect amount.
  - Evidence: Lines 169 and 259 add paise with `+=`; line 261 sums overdue amounts with `+`. None checks the accumulated result. For example, adding two safe values of 4,503,599,627,370,496 paise yields 9,007,199,254,740,992, which cannot be represented exactly. M6 says: “Totals too large to add up safely are now refused with an error rather than rounded.”
  - Fix: Use the checked `sumPaise` helper for tenant overdue amounts and both totals, or add an equivalent safe-integer checked accumulator. Add a test that these totals throw when their sums exceed the safe range.
- **tests/e2e/today.spec.ts**: The browser test for the ticked Today alerts task only makes and sends an invoice. It does not exercise the required “N bank lines to match” and “N TDS certificates missing” items or their inline links, so the requirement that tests exercise each ticked task is unmet.
  - Evidence: The test asserts invoice creation, sending, and billed totals, but has no bank statement or TDS certificate setup and no assertions for those alerts. `attention.test.ts` checks that these item kinds are constructed; it does not render the Today screen or verify their links.
  - Fix: Add a browser or database-backed screen test that creates unmatched bank lines and overdue missing TDS certificates, verifies both counts appear on Today, and verifies their actions lead to payment matching and the missing-certificate tracker.

## Should fix (1)

- **src/lib/alerts/digest-run.ts**: A digest that fails to send is permanently claimed for that day, so a transient email-provider failure means that user receives no digest that day.
  - Evidence: Lines 64–75 claim the unique organization/user/day row before sending; lines 110–120 mark provider errors failed, and the claim comment at lines 9–11 says a send that never finishes stays `sending` and is never retried. The database test confirms a failed send is not retried the same day.
  - Fix: Allow a failed or stale sending claim to be retried safely, using an idempotency key so retries do not produce duplicate emails. This is also recorded in `docs/BACKLOG.md`.

## Verified by hand

- Today screen: current-month billed total is summed from sent, non-cancelled invoices; collected total includes active payments by received date, with TDS shown separately; unpaid total uses the same `unpaidInvoices` settlement calculation as the payment flow. Hand check: ₹1,17,000 taxable rent + ₹21,060 GST = ₹1,38,060 billed/outstanding; 10% TDS on ₹1,17,000 = ₹11,700, so the overdue amount asked for is ₹1,26,360. Recording ₹1,26,360 received plus ₹11,700 TDS settles ₹1,38,060 and removes the invoice from the open list.
- Verified the needs-attention implementation constructs bank-line and overdue TDS certificate items, and the Today page provides links to payment matching and the missing-certificate tracker. Date actions are guarded by `manage_leases`, run within organization scope, and are covered by database tests for snoozing, marking done, and activity logging.
- Daily email digest: implementation runs at 08:00 India time, filters recipients by role and date assignment, omits empty emails, includes a Today link when `APP_URL` exists, and claims at most one digest per user per day. Unit and database tests cover recipient selection, reminder days, email content, duplicate prevention, the disabled setting, failure recording, and organization isolation.

## Resolution (codex-fix, 2026-10-24)

- **Must fix 1 (unsafe totals): fixed.** A tenant's overdue amount and Today's unpaid and overdue totals now use the checked `sumPaise`; tests add two 2^52-paise amounts (2^53, past `Number.MAX_SAFE_INTEGER`) and expect a `RangeError`.
- **Must fix 2 (alerts not exercised on screen): fixed.** The demo walkthrough browser test (`tests/e2e/walkthrough.spec.ts`) now checks "N TDS certificates missing" on Today at log-in and that its link opens the tracker's missing list, and, after the bank statement import, "N payments in your bank statement to match" and that "Match payments" opens `/billing/bank/match`. It extends the walkthrough rather than adding a test because the walkthrough already resets the shared demo organization; a second test resetting it would race it.
- **Should fix (failed digest not retried): left in `docs/BACKLOG.md`** (already there, 2026-10-23 alerts row). It needs a trigger change on `digest_sends` and a provider idempotency key, which is more than a small fix.

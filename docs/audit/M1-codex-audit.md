# Audit of M1: Billing engine (weeks 3–4), before any screens

**Verdict:** fail

M1’s core billing implementation and documented golden cases are present, but custom escalation events on the same date can be applied in input order and multiple custom entries for one charge/date are not rejected. This can calculate an incorrect rent amount. I also could not run the billing tests because Vitest tried to write a temporary config file under the read-only filesystem.

## Must fix (1)

- **src/lib/billing/escalation.ts**: Custom increases effective on the same date are not resolved deterministically; all are appended and sorted only by date, so JavaScript’s stable sort preserves their input order and applies each increase sequentially. The rules describe custom entries as taking effect on their date, not as a sequence of separate increases that day.
  - Evidence: Lines 97–100 append every in-force custom event. Line 136 sorts only with `compareDates(a.date, b.date)`. For a charge at ₹1,00,000 with two same-day custom percentages of 5% and 10%, the final amount can become ₹1,15,500 if both apply in that order; reversing them gives ₹1,15,000. No test covers duplicate effective dates.
  - Fix: Reject duplicate custom effective dates for a charge during input validation, or define and implement a deterministic single-entry precedence rule; add a regression test covering same-date custom entries in either input order.

## Should fix (1)

- **src/lib/billing/escalation.ts**: Rule increase generation can loop without advancing when `charge.startDate` is later than the lease end and rule dates remain in force by the lease check only. In normal persisted leases, charge dates are validated against the lease, but the pure engine accepts arbitrary plain inputs and should reject inconsistent dates rather than risk a non-terminating schedule.
  - Evidence: Lines 84–92 iterate rule dates until `inForce(date)` fails, but `inForce` does not check the charge start date; if charge.startDate is after lease.endDate, `continue` at line 92 never increments or terminates while generated dates remain ≤ lease end.
  - Fix: Validate charge start/end against the lease, or terminate rule generation once the rule date is on/before charge.startDate and cannot progress into the active interval.

## Verified by hand

- money.ts: integer-safe bigint multiplication/division and half-away-from-zero rounding; manually checked the documented ₹90,015.71 × 1.05 = ₹94,516.4955 → ₹94,516 escalation result.
- dates.ts: month lengths, plain-date arithmetic, FY and quarter helpers are implemented; golden cases test 29-Feb month addition and April–March quarters.
- Charge monthly amounts: fixed, per-square-foot and per-slot calculations are implemented; hand-checked 1,250.50 sq ft × ₹85.50 = ₹1,06,917.75, matching the golden test.
- Rent-free periods and commencement: month/day periods are applied from lease start; charges marked waived during rent-free are omitted and mid-month commencement is prorated. Golden Jan–Mar example matches rent beginning in April while CAM bills from January.
- Escalations: compounding and non-compounding schedules, custom amounts/percentages, month-end settings, charge-specific applicability, and custom resume/stop behavior have implementations and targeted tests. Same-date custom entries are a must-fix exception noted above.
- Pro-rata and mid-month splits: actual calendar month days and inclusive lease end are implemented; manually checked ₹90,000 × 15/30 = ₹45,000. Mid-month increases split into independently prorated segments with targeted tests.
- Full lease rent schedule: `rentSchedule` produces dated charge periods and totals by billed run month; tests cover a 36-month schedule, partial start/end periods, and quarterly timing.
- Invoice lines: `invoiceForRun` builds monthly/quarterly, advance/arrears lines with period boundaries, due dates, and zero invoice behavior; targeted tests cover normal arrears and the final mid-quarter lease bill.
- GST split and round-off: state-based CGST/SGST versus IGST, per-line/per-invoice rounding, and rupee invoice round-off are implemented and tested. Hand-checked ₹1,06,917.75 taxable at 18%: CGST and SGST ₹9,622.60 each; subtotal ₹1,26,162.95; round-off +₹0.05; total ₹1,26,163.
- Expected TDS: charge-type taxable bases exclude GST and use tenant rates; TDS is rounded once as configured. Hand-checked ₹1,00,000 rent at 10% gives ₹10,000 expected TDS; ₹1,08,000 received against ₹1,18,000 is treated as paid with ₹10,000 TDS.
- Golden test coverage: `golden.test.ts` contains cases corresponding to documented examples for escalation, area charges, rent-free, pro-rata, quarterly billing, GST, TDS, invoice numbering, leap-day addition, and rupee rounding. The test command itself could not execute in the read-only environment.
- Security and immutability checks requested for server actions: this M1 engine is pure and has no server actions; those concerns belong to later milestones. UX principles are not applicable to this pre-screen milestone.

## Response (codex-fix, 2026-10-24)

- **Must fix, same-date custom increases:** agreed and fixed in `94baa8e`. `amountSteps` now refuses two custom entries for one charge on the same date, whatever the input order (tests cover two percentages, and an agreed amount with a percentage, in both orders). Section 5 of `docs/BILLING_RULES.md` says so. Saved leases already couldn't have this: `custom_escalations` has `unique(charge_id, effective_date)`.
- **Should fix, rule loop with a charge starting after the lease end:** partly disputed. The loop can't run forever: dates are `anchor + k × everyMonths`, which grows with k, so the first date after `lease.endDate` fails `inForce` and breaks the loop, whatever the charge start is (section 5: "An increase … applies if its date is on or before the lease end date"). A regression test ("stops when a charge starts after the lease ends") shows it returns just the starting amount. Rejecting such inconsistent charge dates is still worth doing, in the lease form and the engine; it's in `docs/BACKLOG.md`.

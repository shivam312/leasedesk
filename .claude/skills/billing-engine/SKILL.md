---
name: billing-engine
description: Use whenever adding or changing anything that calculates money - rent amounts, rent schedules, escalations, rent-free periods, pro-rata, GST, TDS, rounding, invoice lines, credit notes or payment allocation. Also use when a billing bug is reported.
---

# Working on the billing engine

The billing engine in `src/lib/billing/` decides every rupee a landlord bills. A wrong number on an invoice is the worst bug this product can have. Work slowly and test-first.

## Before you start

1. Read `docs/BILLING_RULES.md` in full. It is the specification.
2. If the change needs a rule that isn't in that file, stop and ask. Don't invent tax or rounding behaviour. If it touches GST or TDS, say it should be confirmed with a CA.
3. Read the existing tests in `src/lib/billing/__tests__/` for the area you're changing.

## Steps

1. **Write the failing test first.** Use real-looking Indian figures (₹85.50/sq ft, 1,250.50 sq ft, 5% every 12 months). Write the expected value as a hand calculation in a comment so a reviewer can check it:
   ```ts
   // 1,250.50 sq ft × ₹85.50 = ₹1,06,917.75
   expect(monthlyAmount(charge)).toBe(10_691_775);
   ```
2. Run `pnpm test billing` and confirm the new test fails for the right reason.
3. Implement the smallest change that makes it pass.
4. Run `pnpm test billing` again. All golden tests in `golden.test.ts` must still pass.
5. If you fixed a bug, add the case to `golden.test.ts` and to section 13 of `docs/BILLING_RULES.md`.
6. If behaviour changed, update `docs/BILLING_RULES.md` in the same commit.
7. Ask the `billing-reviewer` agent to review the change before committing.

## Rules for code in `src/lib/billing/`

- Pure functions only. No imports from `src/lib/db`, no `fetch`, no `new Date()`, no `Math.random()`. The "today" date is always a parameter.
- Money is integer paise; percentages are basis points; area is hundredths of a sq ft. Use helpers from `money.ts` for every multiply, divide and round. Never write `* 0.18` or `/ 100` on money inline.
- Dates are plain `YYYY-MM-DD` values. Use helpers from `dates.ts`; never use local-time getters.
- Every function that returns an amount also returns, or can return, an explanation object (inputs, steps, result) that the UI shows when the user taps the amount.
- No silent defaults. If an input is missing, throw a clear error, e.g. `Lease L-104 has no rent commencement date`.
- Keep functions small and named after the rule they implement (`applyCompoundingEscalation`, `prorateByDays`).

## Checklist before committing

- [ ] New or changed behaviour has a test with a hand calculation in a comment
- [ ] `pnpm test billing` passes, including all golden tests
- [ ] No float arithmetic on money (search the diff for `0.` and `/ 100` near amounts)
- [ ] `docs/BILLING_RULES.md` updated if behaviour changed
- [ ] `billing-reviewer` agent reviewed the change

For worked examples of tricky cases, see [examples.md](examples.md).

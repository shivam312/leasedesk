# Independent review of M8 (Codex)

**Verdict:** pass

M8 adds Sentry reporting, password reset and a browser test for the import-to-reports journey. The three invoice calculations I checked agree with the billing rules: ₹1,00,000 rent produces ₹9,000 each of CGST and SGST, for ₹1,18,000 total; 10% TDS on ₹1,00,000 is ₹10,000, leaving ₹1,08,000 to pay; and ₹50,000 rent produces ₹4,500 each of CGST and SGST, for ₹59,000 total. I found no must-fix issue in the changed code, but I did not run the tests or independently confirm the documented UX review, so please check those sign-off claims before opening the pilot.

## Must fix (0)

None.

## Should fix (0)

None.

## Verified by hand

- By hand against docs/BILLING_RULES.md: journey.spec.ts uses ₹100 × 1,000 sq ft = ₹1,00,000 rent; at 18% intra-state GST, CGST and SGST are ₹9,000 each, and the ₹1,18,000 invoice total is correct.
- By hand against docs/BILLING_RULES.md: 10% TDS on ₹1,00,000 taxable rent is ₹10,000; ₹1,18,000 less ₹10,000 gives the test's ₹1,08,000 payment.
- By hand against docs/BILLING_RULES.md: ₹100 × 500 sq ft = ₹50,000 rent; CGST and SGST are ₹4,500 each, and the ₹59,000 invoice total is correct.
- Checked that the journey's total billed amount, ₹1,77,000, is the sum of the two invoice totals, and that the Today assertions include the ₹1,08,000 cash payment and ₹10,000 TDS.
- Checked the password reset path uses Zod schemas, confines `next` to an in-app path, and marks `/auth/confirm` public so emailed links can establish a session.
- Checked the milestone report against the code for Sentry setup, error scrubbing, password reset, the journey test, and the stated remaining UX and human tasks. The UX review task is still unchecked in the roadmap.
- Could not independently verify that the documented 945 unit/database tests passed or that the UX reviewer performed the listed review; the report says the new browser tests were not rerun during wrap-up. I did not execute tests.

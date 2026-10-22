---
paths:
  - "src/lib/billing/**"
  - "src/lib/invoices/**"
  - "src/lib/payments/**"
---

# Billing code rules

- This code decides real money. Use the `billing-engine` skill and follow `docs/BILLING_RULES.md` exactly.
- Integer paise, basis points, hundredths of a sq ft. Round only through `src/lib/billing/money.ts`.
- `src/lib/billing/` is pure: no database, network or clock.
- Test first. Every change needs a test with a hand calculation in a comment.
- Get a `billing-reviewer` review before committing.

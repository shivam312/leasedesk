# Re-check of M3

**Verdict:** pass

Re-verified the previous audit’s fixes against the current code. Renewal now checks the same building and units on the server, and charges ending before their effective start are rejected during form parsing. The listed M3 tasks have implementations and relevant tests; I found no remaining must-fix issues.

## Must fix (0)

None.

## Should fix (0)

None.

## Verified by hand

- Schema: current Drizzle schema defines leases, lease units, charges, escalation rules, custom escalations, and critical dates with organization-scoped relationships and constraints; database tests exercise lease links, security, and activity logging.
- Lease form, first steps: parsing covers tenant, building, units, dates, lock-in, notice period, and rent-free terms; form and draft tests exercise valid and invalid inputs and rent commencement.
- Lease form, charges and increases: charge and escalation parsing, building defaults, and lease settings feed the billing engine. Charge end-before-start validation now covers explicit starts and blank starts resolved to the lease start; charges-form and draft tests exercise these cases.
- Review schedule: preview and save both call checkLease; review rows derive from the billing schedule. Review tests cover rent-free periods, increases, and CAM.
- Copy template: copy code and tests preserve charges, increases, and lease settings while clearing source-specific tenant, unit, date, deposit, and charge identifiers; per-square-foot charges use the new units’ area.
- Critical dates: dates are generated from lease terms and schedule. Tests cover expiry, lock-in, notice deadline, and escalation dates.
- Renewal: saveLease verifies tenant, building, and the exact unit set against the replaced lease before saving; the current browser test renews, checks the old version’s Renewed status, and terminates the new version. Renewal unit tests cover premises mismatch and renewal eligibility.
- Termination: the server action uses terminationPlan and logged updates for the lease, charges, and critical dates. The current browser test ends a renewed lease early and checks its end date; termination unit tests cover valid and invalid exit dates.
- Manual money checks against BILLING_RULES.md: 1,250.50 sq ft × ₹85.50 = ₹1,06,917.75 monthly; quarterly equivalent = ₹3,20,753.25. A ₹1,00,000 rent with two rent-free months bills ₹0 for those months; 5% compounded increases give ₹1,05,000 and ₹1,10,250. A ₹30,000 quarter from 15 May under the default month-by-month method gives ₹15,483.87 (May ₹16,000? calculation: ₹10,000 × 17/31 = ₹5,483.87, plus June ₹10,000).

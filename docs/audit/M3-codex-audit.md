# Audit of M3: Leases (week 6)

**Verdict:** fail

M3 has working lease creation, schedule review, copying, generated dates, renewal and termination paths with focused unit tests. Renewal saves do not enforce the original building and units, so the new version can differ from the lease it replaces. The lease form also fails to catch a charge ending before it starts: preview can omit it and save can fail at the database constraint. No browser test exercises renewal or termination, as the milestone report acknowledges.

## Must fix (2)

- **src/server/actions/leases.ts**: A renewal checks that the tenant matches and that the start is after the old end, but does not check that the building and units match the lease being renewed. A crafted server action request can create a replacement version for different premises, while `unitClashes` explicitly excludes the old lease from overlap checks.
  - Evidence: In `saveLease`, lines 129–138 check only `old.lease.tenantId`; lines 140–161 then save the submitted building and units and mark the old lease renewed. D20 describes renewal as a new version of the same lease, and `renewalDraft` pre-fills its building and units from the old lease.
  - Fix: Validate the submitted building and unit IDs against the old lease before saving, on the server action path; reject a renewal that changes them.
- **src/lib/leases/charges-form.ts**: The charge form validates each date but does not ensure `endDate >= startDate`. An invalid charge can pass preview and be shown as producing no billable periods; saving it then violates the database check and can fail instead of returning a form error.
  - Evidence: `chargeRowSchema` validates `startDate` and `endDate` independently but has no cross-field date refinement. `lease_charges_end_after_start` in `src/lib/db/schema/leases.ts` rejects the saved row. The M3 backlog explicitly records this missing form error.
  - Fix: Add a cross-field validation requiring the charge end date to be on or after its start date, and return the error on the charges step before preview or save.

## Should fix (1)

- **tests/e2e/flow.spec.ts**: No browser test covers the renewal or termination flows, leaving their form-to-server-action behavior unverified.
  - Evidence: The e2e test covers lease creation, invoicing and payment only. `docs/milestones/M3.md` states the Playwright test for renewing and ending a lease remains in the backlog.
  - Fix: Add an end-to-end test that renews a lease and ends a lease early, checking the resulting version, status and end date.

## Verified by hand

- Schema: `leases`, `lease_units`, `lease_charges`, `escalation_rules`, `custom_escalations` and `critical_dates` are defined; lease tables have organization scoping, composite parent references and supporting DB tests. The custom escalation table has a unique charge/date constraint and requires exactly one of amount or percentage.
- Lease form first steps: tenant, building, units, lease dates, lock-in, notice period and rent-free months/days are parsed; tests cover valid input and key invalid cases. A form-to-engine test checks 1,000 sq ft and a two-month rent-free period starting 01-04-2026 gives rent commencement on 01-06-2026.
- Lease form charges, rent increases and lease settings: charges are built with building defaults for timing, GST and SAC; lease settings resolve into billing settings. Test calculation: 1,000 sq ft × ₹100/sq ft = ₹1,00,000 monthly rent. With two rent-free months, April and May rent is ₹0; the 5% rule anchored on 01-04-2026 produces ₹1,05,000 from 01-04-2027 and ₹1,10,250 from 01-04-2028. These agree with the engine's rounding and escalation path.
- Review step: `previewLease` and `saveLease` both use `checkLease`; `reviewRows` derives monthly figures from `rentSchedule`. Its test checks rent-free months, a rent increase and CAM in the schedule.
- Copy an existing lease as a template: copy code and tests preserve lease-level settings, charges and increases while removing source IDs and charge dates; per-sq-ft area is recalculated for the new units.
- Critical dates: dates are derived from the billing schedule and configured reminder days. The test checks expiry, lock-in, notice deadline and both rent increases; a three-month notice period for a 31-03-2029 expiry gives a 31-12-2028 deadline. Manual amount check: 1,250.50 sq ft × ₹85.50 = ₹1,06,917.75 monthly; at quarterly frequency, the full-quarter amount is ₹3,20,753.25 (monthly amount × 3).
- Renewal: the new version draft starts the day after the prior end, increments the version, carries tenant and units, and refuses drafts, already-renewed leases and early-terminated leases. The save action checks renewal eligibility and start date, creates the new lease and marks the old version renewed; building/unit validation is the must-fix above.
- Termination: `terminationPlan` validates exit dates, shortens charges that extend past exit, and closes later critical dates. The action updates the lease, charges and expiry date through logged writes; tests cover future and passed exit dates and invalid cases.

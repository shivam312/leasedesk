# Re-check of M8

**Verdict:** pass

No remaining M8 must-fix findings. The earlier import-limit finding is resolved in the current UI, and the database-test skip concern does not apply unless SKIP_DB_TESTS=1 is explicitly set. The full unit-test command could not complete in this read-only environment: two email tests failed because the sandbox denied mkdtemp under the system temp directory.

## Must fix (0)

None.

## Should fix (0)

None.

## Verified by hand

- Sentry and error reporting: server and browser monitoring setup returns null without the corresponding DSN. The scrubber removes error text, request data, cookies, query strings, breadcrumbs, extras and stack variables; reportError logs locally and uses after() to keep serverless sends alive.
- End-to-end journey: tests/e2e/journey.spec.ts covers new organization, building and tenancy imports, billing run, sending, payment with TDS, and rent-roll, ageing, collections, GST, TDS and Today checks. Its expected figures match the billing rules: ₹100 × 1,000 sq ft = ₹1,00,000; 18% GST split into ₹9,000 CGST and ₹9,000 SGST gives ₹1,18,000. For 500 sq ft, ₹50,000 taxable plus ₹4,500 each tax gives ₹59,000. TDS is ₹10,000 on taxable rent, leaving ₹1,08,000 received.
- UX review, first pass: the milestone records the requested screens and backlog disposition; current ROADMAP.md identifies the review as complete. The backlog retains the tenant-contact and team-removal must-fixes for before a pilot.
- UX review, second pass: docs/milestones/M8.md contains the requested screen/outcome/backlog table for the uncovered screens. The claimed import limit is implemented: ImportForm.tsx displays 10 problems and places the remainder in a closed details section with the correct remaining count. The server's separate 50-item response cap and refusal message agree with each other.
- Organization and role checks: import actions use guardedForm with manage_property or manage_leases and runScoped; billing actions similarly require manage_billing and use runScoped for data access.
- Sent invoice and payment immutability: drizzle/0013_invoices_rules.sql rejects edits/deletion of sent invoices and edits to their lines; drizzle/0015_payments_rules.sql rejects payment edits/deletion and makes allocations append-only. Database tests cover these guards when enabled.
- Rechecked prior audit: the import limit is fixed in the rendered UI; database tests skip only when SKIP_DB_TESTS=1 is set, and otherwise database connection/setup failures fail the tests.
- Test execution: pnpm test was attempted. Two email tests failed because the sandbox denied temporary-directory creation (EPERM at mkdtemp); this is an environment restriction, not evidence of a product defect.

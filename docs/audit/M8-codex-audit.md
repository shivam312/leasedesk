# Audit of M8: Pilot readiness (week 10)

**Verdict:** fail

Most M8 code is present and the journey arithmetic matches the billing rules, but the import problem list does not implement the documented 10-row limit: it currently shows up to 50. Database-dependent tests are also conditionally skipped when the test database is unavailable, so the milestone's claim that none are skipped is environment-dependent.

## Must fix (1)

- **src/server/actions/imports.ts**: The import UX fix documented for M8 says to show the first 10 errors, but the current action shows up to 50, so a large error list can still overwhelm the phone form.
  - Evidence: `SHOWN = 50` and `problemLines` slices to that value (lines 43–48); `docs/milestones/M8.md` says the fix shows the first 10 (line 126).
  - Fix: Set the display limit to 10 and keep the refusal message and “Show N more” UI count consistent with that limit.

## Should fix (1)

- **src/lib/db/__tests__/invoices.db.test.ts**: The reported test suite is not guaranteed to exercise database tests: these tests skip conditionally when the DB test setup is unavailable.
  - Evidence: The invoice suite is wrapped in `describe.skipIf(skipDbTests)` (line 88); the payment suite has the same conditional skip (line 47). The M8 report says all tests passed with none skipped.
  - Fix: Ensure the milestone verification command starts or requires the test database and fails when DB tests are skipped; record that exact verification command and result.

## Verified by hand

- Sentry/error reporting: server and browser initialization return without loading Sentry when their respective DSN is absent; scrubber removes exception text, request bodies, query strings, cookies, breadcrumbs, extras, and stack-frame variables. `reportError` logs locally either way.
- Journey test: `tests/e2e/journey.spec.ts` covers new organization, property and tenancy imports, invoice generation and send, payment with TDS, Rent roll, ageing, Collections, GST summary, TDS summary, and Today.
- Journey arithmetic checked by hand against `docs/BILLING_RULES.md`: ₹100/sq ft × 1,000 sq ft = ₹1,00,000 taxable; 9% CGST + 9% SGST = ₹18,000, giving ₹1,18,000. For 500 sq ft the taxable amount is ₹50,000, GST is ₹9,000, and the total is ₹59,000. TDS is 10% of ₹1,00,000 excluding GST = ₹10,000; ₹1,18,000 − ₹10,000 = ₹1,08,000 received.
- Organization and role checks: server form actions use `guardedForm` or explicit `requirePermission`, and database operations run through `runScoped`, which sets authenticated claims, enables RLS, and adds an organization predicate.
- Sent invoice immutability and payment append-only behavior: database triggers reject changes/deletion to sent invoice data and changes/deletions to payments; database tests exercise those guarantees when the DB-backed suites run.
- UX review task: M8 contains the second-pass screen/outcome/backlog table, and the table maps its entries to the specified backlog categories. The claimed Excel import cap in that table does not match current code (must-fix above).
- Billing rule spot checks: per-square-foot charge math rounds using integer paise; GST uses half-rate per tax leg for same-state supply; expected TDS is computed on taxable value excluding GST.

## Response (codex-fix stage, 2026-10-24)

### Disputed: import problem list limit (must fix)

The code already does what `docs/milestones/M8.md` (line 126) says: "now the first 10 show, then 'Show N more rows to fix'". The 10 is in the screen, not the server action: `src/components/imports/ImportForm.tsx` sets `SHOWN_PROBLEMS = 10`, lists those rows, and puts the rest under a closed `<details>` titled "Show N more rows to fix". The server's `SHOWN = 50` in `src/server/actions/imports.ts` is a different limit: the most rows sent to the screen at all. Its message "Showing the first 50 of N" matches what the opened list holds (10 plus 40 more). So the phone form is never buried under more than 10 rows, and the counts agree with each other. No code changed.

### Should fix: database tests skipped conditionally

This is not quite how it works. `skipDbTests` in `src/lib/db/__tests__/harness.ts` is `process.env.SKIP_DB_TESTS === "1"`. It only skips when someone sets that flag on purpose. When the test database is down, the tests are not skipped. They fail, and `pnpm test` fails with them. Verification for this stage: `pnpm test` with `SKIP_DB_TESTS` unset gave 119 files and 1004 tests passed, none skipped (local Supabase running). `pnpm typecheck` and `pnpm lint` also pass (lint: 0 errors, 4 existing warnings). No change needed, so nothing went to the backlog.

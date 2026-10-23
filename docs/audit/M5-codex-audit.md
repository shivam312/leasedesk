# Audit of M5: Payments and TDS (week 8)

**Verdict:** pass

The checked M5 features have current implementations and relevant tests. I found no demonstrated money error, tenant-scope gap, role-check failure, or violation of payment immutability. The test command could not start because the read-only workspace blocked Vite from writing its temporary config file.

## Must fix (0)

None.

## Should fix (1)

- **tests/e2e/tds.spec.ts**: The TDS browser test opens the tracker but does not upload a certificate; the upload flow is covered only by database tests.
  - Evidence: The milestone report says certificate upload is “Not yet in a browser test”; the current `tds.spec.ts` test only opens the TDS certificates list. `certificates.db.test.ts` does exercise certificate attachment and record updates.
  - Fix: Add an end-to-end test that uploads a certificate and verifies the quarter is marked received.

## Verified by hand

- Payment recording: `recordPayment` validates and saves the payment, allocation and TDS records transactionally; `payments.db.test.ts` covers oldest-first allocation, statuses, reversal, credit and immutability. By hand: ₹1,18,000 invoice less ₹10,000 TDS leaves ₹1,08,000 received and settled, matching BILLING_RULES §10.
- Bank import: CSV parsing, SheetJS `.xlsx`/`.xls` parsing, column mapping persistence and duplicate handling have implementation and tests (`statement.test.ts`, `xlsx.test.ts`, `imports.db.test.ts`; browser import test also reuses saved columns with Excel).
- Matching and bulk confirmation: scoring and oldest-first suggestions are tested in `matching.test.ts`; database confirmation and stale-invoice handling are tested in `match.db.test.ts`; server action processes each selected line and reports per-line problems.
- TDS tracker and certificate upload: tracker quarter due dates and received/missing totals are unit-tested; database tests cover certificate attachment, active payment records, and protection of non-certificate fields. Due-date checks match the listed 15 Aug, 15 Nov, 15 Feb and 15 Jun schedule.
- Automatic email reminders: schedule, requested amounts, email content and database claiming/delivery are covered by unit and DB tests. By hand: ₹1,17,000 outstanding less ₹11,700 expected TDS asks for ₹1,05,300, consistent with the documented rule to subtract remaining expected TDS.
- WhatsApp reminder: link/message and recipient behavior have unit tests; the action requires `manage_billing` and records the tap. It opens a prefilled `wa.me` link, leaving sending to the user as specified.
- Tenant ledger: implementation emits invoice, credit note, received payment, TDS and reversal rows and computes a running balance; pure and database tests cover balances and ordering. By hand: ₹1,18,000 invoice less ₹1,08,000 received and ₹10,000 TDS gives zero closing balance.
- Money rules checked by hand: quarterly CAM ₹30,000 from 15 May prorates May as ₹30,000 × 17 ÷ (3 × 31) = ₹5,483.87, plus June ₹10,000, totaling ₹15,483.87; a ₹1,00,000 rent invoice with ₹50,000 credited has ₹5,000 expected TDS at 10%; these match BILLING_RULES §§7 and 10.
- Server actions inspected for payments, bank matching, certificate upload and WhatsApp reminder: each requires membership and `manage_billing`; data access is through organization-scoped queries. Payment rows and allocations are guarded against edits/deletes by database tests and schema behavior.

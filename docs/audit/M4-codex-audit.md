# Audit of M4: Invoicing (week 7)

**Verdict:** fail

M4’s invoicing flow is implemented and has unit and database tests, but numbering can violate the documented uniqueness rule when two billing entities use the same GSTIN.

## Must fix (1)

- **src/lib/db/schema/invoices.ts**: Invoice and credit-note series are keyed by billing entity rather than billing GSTIN. Since multiple billing entities in one organization may have the same GSTIN, each can independently issue the same number for the same kind, financial year, and prefix. This violates BILLING_RULES §9, which requires uniqueness within a GSTIN and financial year.
  - Evidence: The series unique constraint is `(billingEntityId, kind, financialYear, prefix)` at `invoices.ts:52`; `takeNumber` also matches on `billingEntityId` at `numbering.ts:37-40`. `billing_entities.gstin` is nullable and has no uniqueness constraint at `organizations.ts:65-86`. The numbering DB test uses only one entity (`numbering.db.test.ts:22-38`), so it does not exercise duplicate GSTINs.
  - Fix: Scope series and sequence assignment by normalized GSTIN, kind, financial year, and prefix, and add a database test with two billing entities sharing a GSTIN that proves numbering remains unique and consecutive.

## Should fix (0)

None.

## Verified by hand

- Schema: invoice series, invoices, invoice lines, credit notes, and credit note lines are defined in `src/lib/db/schema/invoices.ts`; M4 database tests cover writes and sent-document immutability.
- Monthly billing run: `runBilling` creates drafts from the billing engine and replaces drafts on rerun while preserving already-sent invoices; `run.db.test.ts` covers draft creation, replacement, early lease end, and fully credited months.
- Manual “Run now”: Billing server action `runBillingNow` calls the same scoped `runBilling` implementation; Billing page and run tests exist.
- Inngest schedule: `monthlyBilling` runs at 06:00 Asia/Kolkata, resolves organizations’ run days, and calls `runBilling` under system scope. Schedule and due-run tests cover run-day behavior.
- Number formatting moved to `src/lib/invoices/number.ts`, with transactional, row-locked sequence assignment in `numbering.ts`; formatting and numbering DB tests cover padding, FY rollover, starting number, and invalid length. The GSTIN-wide uniqueness gap is reported above.
- Email adapter: `emailDriver()` selects Resend when configured and the console driver otherwise; the console driver writes message JSON and attachments into `.local-outbox/`. Email adapter tests exist.
- Invoice PDF: document generation includes GST fields, bank details, UPI link, amount in words, original-for-recipient label, and generated-invoice footnote; PDF/document tests cover the output.
- Review drafts and “Send all”: sends revalidate drafts against current lease terms, reject early sends, number and freeze invoice copies transactionally, then email PDFs. The confirmation UI and preview of tenants without email are present; send DB tests cover issuing and repeat sends.
- “Explain this amount”: invoice line working is saved with line data, and the invoice UI exposes line and total explanations; explanation tests cover parsing and total calculations.
- Credit notes: the engine caps credits at remaining line values, mirrors original tax when fully crediting a line, applies round-off only to the final credit, and issuance locks the invoice and saves the note atomically. Unit and database tests cover partial/full credits and invoice status.
- Manual money checks against BILLING_RULES.md: ₹85.50 × 1,250.50 sq ft = ₹1,06,917.75; ₹90,000 × 15/30 days = ₹45,000; ₹1,00,000 taxable at 18% intra-state GST gives ₹9,000 CGST + ₹9,000 SGST = ₹1,18,000. The engine’s charge, proration, and GST paths implement these calculations.
- Multi-tenancy and roles: invoicing server actions use `guardedForm`/`requirePermission` and `runScoped`; database queries use organization scope. Owners and accounts are the `manage_billing` roles.
- Immutability: migration `drizzle/0013_invoices_rules.sql` enforces sent invoice, invoice-line, and credit-note immutability; invoice database tests cover the sent-invoice rule.
- UX: invoice actions use plain-language send/credit-note wording and amount explanations; phone-sized button styling and confirmation UI are present.

## Resolution (2026-10-24)

- **Must fix, series keyed by billing entity:** agreed and fixed in `49566e9`. `invoice_series` now carries the supplier GSTIN and is unique per organization, GSTIN, kind, financial year and prefix (`drizzle/0027_series_by_gstin.sql`, which fills in existing series from the invoices they numbered). `takeNumber` takes the GSTIN: an invoice's from its billing entity, a credit note's from its invoice's printed copy. The building form and the Excel import also check prefixes across every building under the same GSTIN, since a credit-note prefix on one entity could otherwise repeat an invoice prefix on the other. New tests: `numbering.db.test.ts` (two entities, one GSTIN, numbers 0001–0004 in one series; another GSTIN starts at 0001), `property.test.ts` (import prefix clash across entities), `queries.db.test.ts` (same-GSTIN lookup, scoped to the organization). Recorded as D45.
- **Should fix:** none were raised.

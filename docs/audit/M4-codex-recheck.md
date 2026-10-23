# Re-check of M4

**Verdict:** pass

Re-audited M4 against the current code. The prior GSTIN numbering issue is fixed in the schema, migration, assignment path, and a regression test covering two billing entities with the same GSTIN. I found no remaining M4 must-fix or should-fix issues. The test suite could not start because Vitest was denied permission to write its temporary config under node_modules/.vite-temp.

## Must fix (0)

None.

## Should fix (0)

None.

## Verified by hand

- Schema: current invoice schema defines invoice series, invoices, invoice lines, credit notes, and credit note lines; migrations add RLS and append-only rules for sent documents and credit notes.
- Monthly billing run: runBilling derives drafts through the billing engine, replaces existing drafts, skips already-sent or fully credited months, and has database tests for the run behavior.
- Manual Run now: runBillingNow is a manage_billing guarded action that calls the same scoped runBilling path.
- Inngest schedule: monthlyBilling runs at 06:00 Asia/Kolkata, resolves organizations due by run day, and invokes runBilling under system scope; schedule logic has tests.
- Invoice numbering (D9): formatting is in src/lib/invoices/number.ts; takeNumber locks and advances a series transactionally. The current key uses organization, normalized GSTIN, kind, financial year, and prefix. The database regression test verifies shared consecutive numbering across two entities with the same GSTIN and a separate sequence for another GSTIN.
- Email adapter: emailDriver selects the console driver when RESEND_API_KEY is missing; console output writes message and attachments to .local-outbox/; adapter tests exist.
- Invoice PDF: document and PDF tests cover GST details, bank details, UPI payment data, and required invoice wording.
- Review drafts and Send all: sending rechecks the draft against current lease terms, rejects early sends, numbers and freezes the invoice transactionally, then emails it. Send DB tests cover issuance and repeat sends.
- Explain this amount: invoice line calculations and totals have explanation data surfaced in the invoice UI; explanation tests exist.
- Credit notes: issuance locks the invoice, caps credits at remaining line values, assigns a number and saves atomically; unit and database tests cover calculation and issuance.
- Money checks by hand against BILLING_RULES.md: 1,250.50 sq ft × ₹85.50 = ₹1,06,917.75; ₹90,000 × 15/30 days = ₹45,000; ₹1,00,000 at 18% intra-state GST gives ₹9,000 CGST + ₹9,000 SGST and ₹1,18,000 before invoice round-off. Corresponding calculation tests exist.
- Multi-tenancy and roles: invoicing server actions guard manage_billing permission and use runScoped; invoice reads and writes use organization-scoped queries, while the scheduled job uses system scope.
- Immutability: current migrations enforce sent invoice, invoice-line, and credit-note immutability; database tests cover the sent-invoice rule.
- UX: invoice list and detail provide plain-language actions, confirmation flow, email-less tenant handling, and line/total explanations.

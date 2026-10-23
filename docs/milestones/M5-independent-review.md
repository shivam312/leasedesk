# Independent review of M5 (Codex)

**Verdict:** pass

M5 adds payment recording and reversal, bank statement matching, TDS tracking, reminders, and a tenant ledger. I hand-checked representative payment and TDS calculations against the billing rules and found them consistent. I’m confident in the money calculations I traced; this review does not replace a pilot comparison against real bank statements and invoices. Please look at the actual bank import preview and TDS certificate workflow with your accountant before relying on them for a pilot.

## Must fix (0)

None.

## Should fix (0)

None.

## Verified by hand

- Read CLAUDE.md, BILLING_RULES.md, DATA_MODEL.md, UX_PRINCIPLES.md, SETTINGS.md, ROADMAP.md, and the M5 founder report.
- Recomputed the payment example: ₹1,08,000 received + ₹10,000 TDS settles a ₹1,18,000 invoice; the code and database test use the same values.
- Recomputed the database payment test: ₹1,17,000 rent + ₹21,060 GST = ₹1,38,060; ₹11,700 expected TDS leaves ₹1,26,360 received, tracked in FY 2026–27 Q3 for a November payment.
- Checked the tolerance case: ₹1,26,359.50 received + ₹11,700 TDS is ₹0.50 short of ₹1,38,060, within the ₹1-per-invoice tolerance, and the implementation marks it paid.
- Checked the TDS-after-credit example: crediting ₹58,500 from ₹1,17,000 rent leaves ₹58,500 taxable rent and ₹5,850 TDS at 10%; the test and implementation agree.
- Reviewed payment allocation, reversal, credit, bank confirmation, certificate attachment/download, reminder schedule, tenant ledger, organization-scoped queries, RLS migrations, and the M5 milestone claims against their code and tests.

# Independent review of M10 (Codex)

**Verdict:** pass

M10 adds opening balances, records deposits already held, improves setup and data export, and includes the reported load-test work. I hand-checked the money paths and found the tested calculations consistent with the billing rules; confidence is good for those paths, though I did not rerun the suite or load test. The founder should especially review the deposit-held import and settlement statement against real pilot records, since the milestone report itself notes that imported deposits are not checked against the lease’s agreed amount.

## Must fix (0)

None.

## Should fix (1)

- **src/lib/imports/tenancy.ts**: The deposit-held import accepts an amount that differs from the lease’s agreed deposit, so a typo can change the deposit ledger and settlement statement without warning.
  - Evidence: `readDepositHeld` validates only that the imported amount is positive; `importTenancy` records it directly, while the M10 report lists this as a backlog item: “Deposit held (₹) isn't checked against the agreed deposit.”
  - Fix: Flag a mismatch against the lease’s agreed deposit during import and require an explicit resolution or confirmation before recording it.

## Verified by hand

- Compared the specified commit range, beginning with the requested diff stat, and read CLAUDE.md, BILLING_RULES.md, DATA_MODEL.md, UX_PRINCIPLES.md, SETTINGS.md, ROADMAP.md, and docs/milestones/M10.md.
- Hand-calculated three billing examples: 1,250.50 sq ft × ₹85.50 = ₹1,06,917.75; ₹1,08,000 received + ₹10,000 TDS settles a ₹1,18,000 invoice; ₹1,17,000 rent + 18% GST (₹21,060) gives a ₹1,38,060 invoice and ₹11,700 expected TDS at 10%. The relevant code and test expectations agree.
- Checked the opening-balance ledger and oldest-first allocation path, including the same-day opening-balance priority; verified the test arithmetic for a ₹2,00,000 opening balance plus ₹1,38,060 invoice, and for a ₹2,50,000 payment leaving ₹88,060 on that invoice.
- Checked that opening-balance and payment queries use organization-scoped helpers, that the migrations add organization constraints and RLS policies, and that export access is owner-only.
- Checked the settlement-share examples: ₹1,60,000 credit is split ₹80,000 to each lease; ₹3,00,000 credit against ₹2,50,000 dues leaves ₹50,000 with the lease ending last.
- Checked the load-test timings recorded in M10 against its under-two-second claim; the slowest reported post-index screen data time is Today at 1,460 ms.
- Read the M10 founder report against the corresponding implementation for opening balances, deposits, checklist behavior, export contents and access, support links, and load-test scope.

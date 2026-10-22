# Reference: invoice layout and Tally voucher outline

## Invoice PDF layout (A4, one page for up to ~8 lines)

1. Header: supplier logo, legal name, address, GSTIN, PAN. Title "Tax Invoice" on the right with invoice number, date, due date.
2. Bill to: tenant legal name, billing address, GSTIN (or "Unregistered"), state and code. Place of supply.
3. Property: building name, unit codes, billed area.
4. Lines table: #, description (e.g. "Rent for Oct 2026 – Unit 401"), SAC, period, taxable value, rate, CGST, SGST (or IGST), line total.
5. Totals block: taxable value, CGST, SGST/IGST, round off, grand total, amount in words.
6. Payment block: bank name, account name, account number, IFSC, UPI ID and QR code, "Please quote the invoice number in your payment reference."
7. Footer: reverse charge "No", authorised signatory, "This is a computer-generated invoice."

## Tally voucher outline (to validate with a real TallyPrime import)

Each voucher needs: voucher type (Sales / Receipt / Credit Note), date (YYYYMMDD), voucher number (our invoice number), party ledger, narration, and ledger entries that balance (debits = credits).

Sales voucher for an invoice of ₹1,18,000:

- Party ledger (tenant): debit ₹1,18,000
- Rent income: credit ₹1,00,000
- CGST output: credit ₹9,000
- SGST output: credit ₹9,000

Receipt voucher for ₹1,08,000 received with ₹10,000 TDS:

- Bank: debit ₹1,08,000
- TDS receivable: debit ₹10,000
- Party ledger (tenant): credit ₹1,18,000, against the invoice reference

The exact XML tags and envelope must be copied from a sample file exported by the pilot accountant's TallyPrime. Save that sample in `tests/fixtures/tally/` and write the exporter's tests against it.

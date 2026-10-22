---
name: india-compliance
description: Use when building or changing GST invoices, credit notes, invoice numbering, TDS tracking, GST or TDS reports, Tally exports, bank statement imports, or Indian formatting of money and dates.
---

# Indian invoicing, tax and accounting formats

The rules that drive calculations are in `docs/BILLING_RULES.md`; read sections 8–12 first. This skill covers what documents and exports must contain. Anything marked **[CA]** must be confirmed with a chartered accountant before launch; never present it to users as legal advice.

## GST tax invoice: required content **[CA]**

Every sent invoice PDF must show:

- Supplier legal name, address and GSTIN (from the building's billing entity)
- "Tax Invoice" as the title
- Invoice number (≤16 characters, unique per financial year) and invoice date
- Recipient name, billing address, and GSTIN if registered
- Place of supply (state name and code), which is the building's state for rent
- Per line: description, SAC code, period, taxable value, GST rate, CGST/SGST or IGST amounts
- Totals: taxable value, each tax, round off, grand total in figures and in words ("Rupees One Lakh Eighteen Thousand Only")
- Bank details and UPI QR code for payment
- "Whether tax is payable on reverse charge: No"
- Signature line for the authorised signatory

Credit notes show "Credit Note", their own number, and the original invoice number and date.

## TDS **[CA]**

- Rates and thresholds are settings (`tenants.tds_rate_bp`), not constants. The Income Tax Act changed, so section numbers and form names in the UI should come from one config file (`src/lib/config/tax-labels.ts`), not be scattered in code.
- The TDS tracker groups by tenant and quarter (Q1 Apr–Jun … Q4 Jan–Mar) and shows: TDS deducted per our records, certificate received or pending.

## Tally export

v1 produces an XML file the accountant imports into TallyPrime. **Validate the format against a real export from a pilot accountant's Tally before relying on it.**

- Vouchers: Sales (for invoices), Receipt (for payments, with TDS as a separate ledger line), Credit Note.
- Ledger names are mapped in settings, because every accountant names them differently: rent income, maintenance income, CGST output, SGST output, IGST output, TDS receivable, round off, bank account, and one party ledger per tenant (default: tenant company name).
- Export by date range; mark exported vouchers so a second export of the same range warns before duplicating.
- Also offer the same data as an Excel sheet for accountants who don't use Tally.

## Bank statement import

- Accept CSV and XLSX. Indian banks use different column names and date formats, so the first import of a bank account asks the user to map columns (date, description, reference, credit, debit), then saves the mapping in `bank_accounts.column_mapping`.
- Parse dates in DD-MM-YYYY, DD/MM/YYYY and DD-Mon-YYYY. Parse amounts with Indian grouping (1,18,000.00).
- Only credit lines are candidates for rent payments.
- Matching confidence: amount equals an open invoice total minus expected TDS (high), reference contains the invoice number (high), description contains the tenant name (medium), amount equals the invoice total (medium). Never auto-confirm; the user confirms in bulk.

## Formatting

- Money: `formatINR(paise)` → `₹1,18,000` (no decimals when whole rupees; two decimals otherwise). Lakh/crore grouping always. Negative: `-₹1,200`.
- Dates: `formatDate` → `22-10-2026`. Month labels: `Oct 2026`. Financial year: `FY 2026-27`.
- Amount in words for invoices: Indian system (thousand, lakh, crore).

For field-by-field invoice layout and a sample Tally voucher structure, see [reference.md](reference.md).

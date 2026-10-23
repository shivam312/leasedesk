# Billing rules

This is the specification for the billing engine in `src/lib/billing/`. If code and this file disagree, one of them is a bug: fix it or ask. Rules marked **[CA]** must be confirmed with a chartered accountant before the first paid customer. Rules marked **[Pilot]** should be checked against a pilot landlord's real invoices.

## 1. Units

- **Money:** integer paise. ₹1,00,000 = `10_000_000`.
- **Percentages:** basis points. 18% = `1800`, 5% = `500`, 12.5% = `1250`.
- **Area:** hundredths of a square foot (integer). 1,250.50 sq ft = `125050`.
- **Rates per sq ft:** paise per sq ft per month. ₹85.50/sq ft = `8550`.
- **Dates:** `YYYY-MM-DD` strings or a plain-date type. Never `Date` objects with times.
- **Financial year:** 1 April to 31 March. FY label `2026-27`.
- **Adding months:** same day in the target month. If that day doesn't exist there, roll forward to the 1st of the next month: 31 Jan + 1 month = 1 Mar; 29 Feb 2028 + 12 months = 1 Mar 2029. Applies to rent-free months and escalation dates.

## 2. Rounding

- Round half up to the nearest paisa after every multiplication or division.
- Negative amounts (credit notes, round-off) round half away from zero: −₹0.005 becomes −₹0.01, so a credit note mirrors its invoice exactly.
- Monthly rent after an escalation is rounded to the nearest whole rupee by default (setting `billing.roundIncreasedRent`, default `rupee`). **[Pilot]** Each step is rounded once, straight to the rupee (not to the paisa first): ₹90,015.71 + 5% = ₹94,516.4955 → ₹94,516.
- Each tax line (CGST, SGST, IGST) is rounded to the nearest paisa separately.
- Invoice total is rounded to the nearest rupee with a separate "Round off" line (setting `billing.roundInvoiceTotal`, default `rupee`). **[CA]**

## 3. Charges

A lease has one or more charges. Each charge has:

- `type`: `rent`, `cam`, `parking`, `utilities`, `signage`, `other`
- `basis`: `fixed` (monthly amount), `per_sqft` (rate × area), `per_slot` (rate × count)
- `startDate`, optional `endDate`
- `frequency`: `monthly` (default) or `quarterly`
- `timing`: `advance` (default, billed at the start of the period) or `arrears`
- `gstRateBp` (default 1800) and `sacCode` (default from building settings)
- `waivedDuringRentFree`: default `true` for rent, `false` for everything else

Monthly amount for `per_sqft` = round(rate × area / 100). Example: ₹85.50 × 1,250.50 sq ft = ₹1,06,917.75.

Quarterly charges: a `fixed` amount is per quarter. For `per_sqft` and `per_slot`, quarterly amount = monthly amount × 3 (the monthly amount is rounded first). Example: 1,250.50 sq ft × ₹12.25 = ₹15,318.63 a month → ₹45,955.89 a quarter.

## 4. Rent-free and fit-out periods

- `rentFreeMonths` (or `rentFreeDays`) starts on the lease start date.
- Rent commencement date = lease start + rent-free period.
- Charges with `waivedDuringRentFree = true` are not billed before rent commencement.
- If rent commencement falls mid-month, the first rent invoice is pro-rated (section 6).

## 5. Escalations

An escalation rule: `percentBp`, `everyMonths`, `anchor` (`lease_start`, `rent_commencement`, or a custom date), `compounding` (default `true`), and which charges it applies to (default: rent only).

- Effective dates = anchor + k × `everyMonths`, for k = 1, 2, 3…. An increase (rule or custom) applies if its date is on or before the lease end date and on or before the charge's end date, if it has one: the same rule for both. An increase on the last day applies to that day.
- Compounding: new amount = previous amount × (10000 + percentBp) / 10000, rounded once per section 2.
- Non-compounding: new amount = base amount × (10000 + k × percentBp) / 10000.
- Custom escalations: a list of `{ effectiveDate, newAmount }` or `{ effectiveDate, percentBp }`. These override the rule from their date: from a charge's first custom entry, the rule's later increases stop for good and only custom entries apply. A custom percentage applies to the amount just before it; a custom new amount is used exactly as entered (not rounded).
- Rule increases dated on or before a charge's start date are ignored (e.g. a charge added mid-lease): the entered amount is its starting amount, and non-compounding steps count from the first increase that applies. A custom entry dated on or before the charge's start is an input error and is rejected.
- An escalation effective mid-month splits that month into two segments (section 6).

Example: ₹1,00,000/month, 5% every 12 months, compounding, from 1 Apr 2026. Year 2 = ₹1,05,000, year 3 = ₹1,10,250, year 4 = ₹1,15,763 (₹1,15,762.50 rounded to the rupee).

## 6. Pro-rata (part months)

- Use actual days in the calendar month (part quarters too: see section 7).
- Amount = round(monthly amount × billable days / days in month).
- A month with an escalation inside it is billed as two segments, each pro-rated, on one invoice line or two (setting; default two lines with clear labels).
- Lease end mid-month: bill to the end date inclusive.

Example: ₹90,000/month, rent commences 16 Sep (30 days): 15 billable days → ₹45,000.

## 7. Billing periods

- Monthly charges are billed per calendar month.
- Quarterly charges are billed for April–June, July–September, October–December, January–March. A part quarter (a charge starting or ending mid-quarter, or a quarter split by an increase) is billed month by month: monthly equivalent = quarterly amount ÷ 3; full months at that amount; part months by actual days in that month. Each month is rounded to the paisa once: quarterly × days ÷ (3 × days in month). **[Pilot]**
- `advance`: the invoice for a period is generated in that period's monthly run (dated the 1st). `arrears`: in the run after the period ends. When the lease ends mid-period, an arrears charge's final bill is in the first monthly run after the lease ends (lease ends 20 Nov → the December run, not January for an Oct–Dec quarter).
- An invoice line's period is the dates actually billed: it never starts before the lease, the charge or rent commencement (for waived charges), and never ends after the lease or charge ends.
- Invoice due date = invoice date + `invoice.dueDays` (building or tenant setting, default 7).
- Lines that come to ₹0 (a waived charge, a ₹0 amount) are left off the invoice. If every line is ₹0, no invoice is created for that lease and month.

## 8. GST **[CA]**

- Default rate 18% for renting commercial property. Default SAC code 997212 (rental or leasing of non-residential property). Both are building settings.
- The place of supply for renting immovable property is where the property is located.
- If the billing GSTIN's state = the building's state: CGST = SGST = half the rate each (9% + 9%).
- If they differ: IGST at the full rate. This is unusual; show a warning in the lease form.
- The tenant's GSTIN does not change the split. It is printed on the invoice and used in GST reports.
- State code = first two digits of a GSTIN.
- Security deposits are not billed. If a deposit is adjusted against dues at exit, flag it for the accountant: GST may apply on the adjusted amount.

## 9. Invoice numbering **[CA]**

- One series per billing GSTIN per financial year, consecutive, no gaps, unique.
- Maximum 16 characters, using letters, digits, `-` and `/` only.
- Default format `{prefix}/{fy}/{seq}`, e.g. `B1/26-27/0001` (13 characters). Prefix is a building setting.
- Numbers are assigned when an invoice is sent, inside a database transaction with a row lock on the series.
- Credit notes use their own series in the same format with a different prefix, e.g. `CN/26-27/0001`.

## 10. TDS **[CA]**

Tenants usually deduct TDS before paying rent. Section numbers and thresholds changed with the new Income Tax Act, so rates and thresholds are settings, not constants.

- TDS is set on the tenant per charge type: `rent`, `cam`, `parking` and `other` (utilities, signage and other charges). Each has its own `deductsTds` and `tdsRateBp`. Defaults: the same for every type, `tdsRateBp` 1000 (10%) and `deductsTds` `true` for companies. **[CA]**
- Expected TDS on an invoice = Σ over the types the tenant deducts on (rate × that type's taxable value), rounded once on the total.
- Expected TDS is calculated on the taxable value only (excluding GST), when GST is shown separately on the invoice, and rounded once to the nearest rupee (half up). **[CA]**
- A payment settles: amount received + TDS deducted = amount settled against invoices.
- A payment that is short by roughly the expected TDS (within ₹1 per invoice, inclusive: exactly ₹1 off still counts) is treated as "paid with TDS", not "part-paid". **[CA]**
- Each TDS amount creates a TDS record per tenant per quarter (Apr–Jun, Jul–Sep, Oct–Dec, Jan–Mar) with `certificateReceived = false` until the accountant uploads the certificate.

## 11. Payments and allocation

- One payment can settle several invoices; one invoice can be settled by several payments.
- Auto-allocation: oldest unpaid invoice first (by due date, then invoice number). The user can change it before saving.
- Overpayments stay as an unallocated credit on the tenant ledger and are applied to the next invoice.
- Payments are never edited. A wrong payment is reversed with a reversal entry and recorded again.

## 12. Credit notes

- Always reference one original invoice.
- Reverse taxable value and tax in the same split as the original.
- Reasons: `correction`, `waiver`, `discount`, `other`, with a free-text note.

## 13. Golden test cases

The engine must pass these at all times. Keep them in `src/lib/billing/__tests__/golden.test.ts` and add one for every bug found.

1. Fixed rent ₹1,00,000, 5% every 12 months compounding, 3-year lease from 1 Apr 2026 → monthly amounts ₹1,00,000 / ₹1,05,000 / ₹1,10,250.
2. Per sq ft: 1,250.50 sq ft × ₹85.50 → ₹1,06,917.75 per month.
3. Rent-free 3 months from 1 Jan 2027 → first rent invoice is April 2027; CAM billed from January.
4. Rent commencement 16 Sep → September rent pro-rated 15/30.
5. Escalation effective 15 Mar on ₹80,000 → March split: 14 days at ₹80,000 and 17 days at the new rent (31-day month).
6. 15% every 36 months, non-compounding → ₹1,15,000 in years 4–6, ₹1,30,000 in years 7–9.
7. GST same state: ₹1,00,000 taxable → CGST ₹9,000, SGST ₹9,000, total ₹1,18,000.
8. GST different state: ₹1,00,000 taxable → IGST ₹18,000.
9. Total with paise (₹1,06,917.75 + 18% GST) → CGST ₹9,622.60 each side, round-off line to the nearest rupee.
10. Quarterly CAM ₹30,000/quarter, lease from 15 May → first bill for 15 May–30 Jun = ₹15,483.87 (May: ₹30,000 × 17 / (3 × 31) = ₹5,483.87; June: ₹10,000). **[Pilot]**
11. Lease ends 20 Nov → November billed for 20 days.
12. Payment ₹1,08,000 against ₹1,18,000 invoice with ₹10,000 expected TDS → paid with TDS, TDS record ₹10,000.
13. Invoice numbering: 10,000th invoice in FY 26-27 with prefix `B1` stays ≤16 characters.
14. 5% every 12 months from 29 Feb 2028 → increases on 1 Mar 2029 and 1 Mar 2030.
15. Lease from 31 Jan 2027 with 1 month rent-free → rent starts 1 Mar 2027; first rent invoice is March.
16. ₹90,015.71 + 5% compounding, rupee rounding on → ₹94,516 (one rounding, not ₹94,517).

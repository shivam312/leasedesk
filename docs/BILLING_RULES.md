# Billing rules

This is the specification for the billing engine in `src/lib/billing/`. If code and this file disagree, one of them is a bug: fix it or ask. Rules marked **[CA]** must be confirmed with a chartered accountant before the first paid customer. Rules marked **[Pilot]** should be checked against a pilot landlord's real invoices.

## 1. Units

- **Money:** integer paise. ₹1,00,000 = `10_000_000`.
- **Percentages:** basis points. 18% = `1800`, 5% = `500`, 12.5% = `1250`.
- **Area:** hundredths of a square foot (integer). 1,250.50 sq ft = `125050`.
- **Rates per sq ft:** paise per sq ft per month. ₹85.50/sq ft = `8550`.
- **Dates:** `YYYY-MM-DD` strings or a plain-date type. Never `Date` objects with times.
- **Financial year:** 1 April to 31 March. FY label `2026-27`.
- **Adding months:** same day in the target month. If that day doesn't exist there, roll forward to the 1st of the next month: 31 Jan + 1 month = 1 Mar; 29 Feb 2028 + 12 months = 1 Mar 2029. Applies to rent-free months and escalation dates. Setting `billing.monthEndRule` (organization or lease): `roll_forward` (default, never bills a day early) or `last_day` (31 Jan + 1 month = 28 Feb; an increase that lands on the lease's last day still applies, section 5). `last_day` can start rent up to 3 days earlier than `roll_forward`: a lease starting on 29, 30 or 31 Jan with 1 rent-free month starts rent on 28 Feb in every case, so a 31 Jan start gets 28 free days. Counting months backwards, `last_day` gives the last day of the month (31 Mar − 1 month = 28 Feb), while `roll_forward` has no rule and refuses.

## 2. Rounding

- Round half up to the nearest paisa after every multiplication or division.
- Negative amounts (credit notes, round-off) round half away from zero: −₹0.005 becomes −₹0.01, so a credit note mirrors its invoice exactly.
- Monthly rent after an escalation is rounded to the nearest whole rupee by default (setting `billing.roundIncreasedRent`, default `rupee`). **[Pilot]** Each step is rounded once, straight to the rupee (not to the paisa first): ₹90,015.71 + 5% = ₹94,516.4955 → ₹94,516.
- Each tax line (CGST, SGST, IGST) is rounded to the nearest paisa separately (by default; see `gst.rounding`, section 8).
- Invoice total is rounded to the nearest rupee with a separate "Round off" line (setting `billing.roundInvoiceTotal`, default `rupee`). **[CA]**

## 3. Charges

A lease has one or more charges. Each charge has:

- `type`: `rent`, `cam`, `parking`, `utilities`, `signage`, `other`
- `basis`: `fixed` (monthly amount), `per_sqft` (rate × area), `per_slot` (rate × count)
- `startDate`, optional `endDate`
- `frequency`: `monthly` (default) or `quarterly`
- `timing`: `advance` (default, billed at the start of the period) or `arrears`. A new charge left blank takes the building's `billing.defaultTiming` when the lease is saved (D16).
- `gstRateBp` and `sacCode`: a new charge left blank takes the building's `gst.defaultRateBp` (default 1800) and `gst.defaultSac` (default 997212) when the lease is saved (D16). A charge's own value, including 0%, always wins. **[CA]** (section 8; rates other than 18% and 0% invoices are D-010)
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
- Custom escalations: a list of `{ effectiveDate, newAmount }` or `{ effectiveDate, percentBp }`. These override the rule from their date: by default (`stop_rule`), from a charge's first custom entry, the rule's later increases stop for good and only custom entries apply. A custom percentage applies to the amount just before it; a custom new amount is used exactly as entered (not rounded). With setting `billing.afterCustomIncrease` = `resume_rule` (lease, D-002), the rule starts again after each custom entry, counted from that entry's date (custom date + k × `everyMonths`), never before the rule's own first increase date, until the next custom entry (a resumed date on a custom date gives way to the custom entry); a non-compounding rule then counts its steps from the custom amount. Default `stop_rule`. **[Pilot]**
- Rule increases dated on or before a charge's start date are ignored (e.g. a charge added mid-lease): the entered amount is its starting amount, and non-compounding steps count from the first increase that applies. A custom entry dated on or before the charge's start is an input error and is rejected, and so are two custom entries for one charge on the same date (otherwise their order would decide the rent; the database's `custom_escalations` table has the same unique rule).
- An escalation effective mid-month splits that month into two segments (section 6).

Example: ₹1,00,000/month, 5% every 12 months, compounding, from 1 Apr 2026. Year 2 = ₹1,05,000, year 3 = ₹1,10,250, year 4 = ₹1,15,763 (₹1,15,762.50 rounded to the rupee).

## 6. Pro-rata (part months)

- Use actual days in the calendar month (part quarters too: see section 7).
- Amount = round(monthly amount × billable days / days in month).
- A month with an escalation inside it is billed as two segments, each pro-rated, on one invoice line or two (setting `billing.midMonthIncreaseLines`, organization: `two_lines`, the default, with clear labels; or `one_line`, the sum of the parts, each still pro-rated and rounded on its own, with both parts in the explanation). With `one_line`, GST is worked out on the combined line, so CGST and SGST can each be 1 paisa different from two lines (₹90,000 → ₹94,500 on 16 Jul: ₹8,309.03 CGST on one line, ₹8,309.04 on two). **[CA]** (D-009) If one part of a split month is ₹0, the one line still covers the whole period.
- Lease end mid-month: bill to the end date inclusive.

Example: ₹90,000/month, rent commences 16 Sep (30 days): 15 billable days → ₹45,000.

## 7. Billing periods

- Monthly charges are billed per calendar month.
- Quarterly charges are billed for April–June, July–September, October–December, January–March. A part quarter (a charge starting or ending mid-quarter, or a quarter split by an increase) is billed month by month: monthly equivalent = quarterly amount ÷ 3; full months at that amount; part months by actual days in that month. Each month is rounded to the paisa once: quarterly × days ÷ (3 × days in month). **[Pilot]** With setting `billing.partPeriodMethod` = `days_in_period` (organization or lease, D-001), a part quarter is instead quarterly × billable days ÷ days in that quarter, rounded once: ₹30,000 a quarter from 15 May = 30,000 × 47 ÷ 91 = ₹15,494.51 (month by month: ₹15,483.87). Monthly charges are always pro-rated by days in the month.
- `advance`: the invoice for a period is generated in that period's monthly run (dated the 1st). `arrears`: in the run after the period ends. When the lease ends mid-period, an arrears charge's final bill is in the first monthly run after the lease ends (lease ends 20 Nov → the December run, not January for an Oct–Dec quarter).
- An invoice line's period is the dates actually billed: it never starts before the lease, the charge or rent commencement (for waived charges), and never ends after the lease or charge ends.
- Invoice due date = invoice date + `invoice.dueDays` (building or tenant setting, default 7).
- Lines that come to ₹0 (a ₹0 amount, or a custom new amount of ₹0) are left off the invoice. Waived charges in a rent-free period produce no lines at all, under either setting. If every line is ₹0, no invoice is created for that lease and month. This is setting `billing.skipZeroInvoices` (organization, default `true`); when `false`, ₹0 lines are kept and a lease with a ₹0 charge in the month gets an invoice even if its total is ₹0.

## 8. GST **[CA]**

- Default rate 18% for renting commercial property. Default SAC code 997212 (rental or leasing of non-residential property). Both are building settings.
- The place of supply for renting immovable property is where the property is located.
- If the billing GSTIN's state = the building's state: CGST = SGST = half the rate each (9% + 9%).
- If they differ: IGST at the full rate. This is unusual; show a warning in the lease form.
- The tenant's GSTIN does not change the split. It is printed on the invoice and used in GST reports.
- Tax is rounded to the paisa on each line by default (setting `gst.rounding` = `per_line`). With `per_invoice`, each tax is worked out once per GST rate on the taxable total of the lines at that rate; the difference from the line-rounded taxes goes on the largest line at that rate, so the printed lines still add up. Three lines of ₹100.05 at 18%: per line CGST ₹9.00 × 3 = ₹27.00; per invoice 9% of ₹300.15 = ₹27.01, shown as ₹9.01 + ₹9.00 + ₹9.00. "Largest" is by size, so a credit note carries the difference on the same line as its invoice; lines of equal size are told apart by a stable line key (charge, then period start) when the lines carry one, otherwise by their order. The invoice and credit-note code (M4) must pass the same key on both. The adjusted line's tax is then a paisa or so away from its rate × its taxable value. **[CA]** (D-004) `invoiceTax` in `gst.ts`.
- State code = first two digits of a GSTIN.
- Security deposits are not billed. If a deposit is adjusted against dues at exit, flag it for the accountant: GST may apply on the adjusted amount.
- The deposit is a ledger per lease (`deposit_entries`): received, refunded, or kept (forfeited); nothing goes out beyond what was held on its date (entries replayed in date order, so a backdated refund can't exceed what was held then or leave a later one short). Using the deposit for unpaid rent isn't recorded in v1 (D-034): the dues stay on the invoices and are settled by a payment, so the tenant's TDS isn't taken from the deposit as well and Tally doesn't see money banked. A kept (forfeited) deposit raises no invoice; the lease page tells the landlord to ask their accountant whether GST applies. **[CA]** (D-035) `src/lib/billing/deposit.ts`.
- The deposit settlement statement for a lease (a PDF; it records nothing) takes the lease's unpaid dues after the TDS the tenant may still keep back, less the tenant's unapplied payment credit, then the deposit held, and shows the refund or what is still owed. A tenant's credit and opening balance are counted once across all their leases: the credit settles all their dues oldest first (by due date, the opening balance first on its day, then invoice number), each lease's statement counts the credit that falls on its own invoices, and the opening balance and any credit left over after all the dues go on the statement of the lease that ends last (M10). `settlementShare` in `src/lib/payments/statement.ts`. A deposit already held when the landlord starts is recorded as received on the lease start (or today, for a lease that hasn't started): one tap on the lease page, or the "Deposit held (₹)" import column.

- The GST summary report counts a sent invoice in the month of its invoice date and a credit note in the month it was issued, one row per GST rate, B2B when the tenant's GSTIN was printed on the invoice and B2C otherwise. Its figures are copied from the sent documents (CGST, SGST, IGST and taxable value as printed), never worked out again. **[CA]** (D-026) `gstSummary` in `src/lib/reports/gst-summary.ts`.

## 9. Invoice numbering **[CA]**

- One series per billing GSTIN, financial year and building prefix (GST rule 46 allows several series), each consecutive with no gaps. Every number is unique within the GSTIN and financial year: a custom format must include `{prefix}`, `{fy}` and `{seq}`, and a building's credit note prefix may not be the invoice prefix of any building under the same GSTIN. Buildings sharing an invoice prefix share its series. **[CA]** (D-015)
- Maximum 16 characters, using letters, digits, `-` and `/` only.
- Default format `{prefix}/{fy}/{seq}`, e.g. `B1/26-27/0001` (13 characters). Prefix is a building setting.
- Numbers are assigned when an invoice is sent, inside a database transaction with a row lock on the series.
- An invoice can't be sent before its invoice date (the 1st of its month, D23): drafts made on an earlier run day wait. A draft sent late keeps its date. **[CA]** (D-016)
- Before numbering, the draft is worked out again from its lease and settings; if anything changed since it was made, sending is refused until the month is made again.
- Credit notes use their own series in the same format with a different prefix, e.g. `CN/26-27/0001`.
- The invoice PDF carries everything in the india-compliance skill's "GST tax invoice: required content" list, marked "Original for recipient", with an empty "Authorised signatory" line and "This is a computer-generated invoice." **[CA]** (D-013)
- No e-invoicing (IRN) in v1: a landlord with turnover over ₹5 crore must register invoices on the portal themselves. **[CA]** (D-012)
- CGST and SGST rates are printed as half the line's GST rate (18% → 9% each).

## 10. TDS **[CA]**

Tenants usually deduct TDS before paying rent. Section numbers and thresholds changed with the new Income Tax Act, so rates and thresholds are settings, not constants.

- TDS is set on the tenant per charge type: `rent`, `cam`, `parking` and `other` (utilities, signage and other charges). Each has its own `deductsTds` and `tdsRateBp`. Defaults: the same for every type, `tdsRateBp` 1000 (10%) and `deductsTds` `true` for companies. **[CA]**
- Expected TDS on an invoice = Σ over the types the tenant deducts on (rate × that type's taxable value), rounded once on the total.
- Expected TDS is calculated on the taxable value only (excluding GST), when GST is shown separately on the invoice, and rounded once to the nearest rupee (half up). **[CA]** Setting `tds.rounding` (organization or tenant): `rupee` (default) or `paisa` (rounded once on the sum, the same rounding as section 2: ₹10,691.775 → ₹10,691.78).
- A payment settles: amount received + TDS deducted = amount settled against invoices.
- A payment that is short by roughly the expected TDS (within `tds.tolerancePaise`, default ₹1 per invoice, inclusive: exactly ₹1 off still counts) is treated as "paid with TDS", not "part-paid". **[CA]**
- When a payment is recorded, the TDS field is filled in from the amount received: if it equals the oldest k unpaid invoices' amount left less the TDS still expected on them (within `tds.tolerancePaise` per invoice, so ₹2 for two invoices), TDS = the amount left − the amount received; the smallest such k wins. A payment of the oldest invoices in full, or anything else, suggests no TDS, and the user types it. `suggestTds` in `allocation.ts`. **[CA]**
- TDS still expected on an invoice = its expected TDS less TDS already recorded against it by active payments, never more than is left to pay. After a credit note, expected TDS is worked out again (as above, with the tenant's TDS per charge type now) on what is left of each line after credit notes: ₹1,00,000 rent at 10% with ₹50,000 credited → ₹5,000; rent ₹1,00,000 at 10% plus utilities ₹20,000 with no TDS, utilities credited in full → still ₹10,000. With no credit note, the expected TDS stored on the invoice is used. **[CA]** (D-017) `expectedTdsAfterCredits` and `remainingExpectedTds`.
- A payment's TDS is split across the invoices it is applied to, oldest first: each takes up to its TDS still expected (never more than applied to it); anything over goes on the last invoice that can take it. TDS can't be more than the amount applied to invoices. `splitTds`. **[CA]** (which invoice, and so which quarter under `tds.quarterBasis` = `invoice_date`, a TDS amount is filed under). The payment form warns, without blocking, when TDS is more than the invoices it pays expect.
- Each TDS amount creates a TDS record per tenant per quarter (Apr–Jun, Jul–Sep, Oct–Dec, Jan–Mar) of the payment date, or of the invoice date with setting `tds.quarterBasis` = `invoice_date`, **[CA]** (D-003) with `certificateReceived = false` until the accountant uploads the certificate. Uploading a certificate for a tenant and quarter marks every TDS record of that tenant and quarter (active payments) received; TDS recorded later in that quarter shows as "Part received". A certificate is due 15 days after the quarter's TDS return: 15 Aug (Q1), 15 Nov (Q2), 15 Feb (Q3), 15 Jun after the year ends (Q4); after that a missing one shows as overdue. Form names and due dates are in `src/lib/config/tax-labels.ts`. **[CA]** (D-021)

## 11. Payments and allocation

- One payment can settle several invoices; one invoice can be settled by several payments.
- Auto-allocation: oldest unpaid invoice first (by due date, then invoice number). The user can change it before saving. `allocatePayment` in `allocation.ts`.
- Amount left on an invoice = grand total − credit notes − payments applied (with their TDS), never below 0. Paid when nothing is left, or when TDS is recorded against it and no more than `tds.tolerancePaise` is left (section 10: nothing is asked for, and the ledger still shows the paise short) **[CA]** (D-022); part paid when something is applied but not all; otherwise sent (an overdue invoice stays overdue). A fully credited invoice keeps "Credit note issued". `invoiceSettlement`.
- Each amount applied ≤ what is left on that invoice, and the total applied ≤ received + TDS (`checkAllocation`). The rest is credit.
- Overpayments stay as an unallocated credit on the tenant ledger and are applied to the next invoice: "Apply credit" on the tenant page applies each payment's unapplied part, oldest payment and oldest invoice first, with no further TDS. A credit note on a paid invoice (D-019) leaves that invoice over-settled; it shows on the ledger, but isn't yet moved to other invoices (backlog).
- Payments are never edited. A wrong payment is reversed with a reversal entry and recorded again. The reversal is dated the day it is made, carries the negative amounts, and takes off each invoice exactly what the payment had applied to it; the payment is marked reversed and its TDS records stop counting in every quarter, including the quarter of the original payment (D29). **[CA]** (D-020)
- A bank credit confirmed on Billing → Payments → Match payments is recorded like a typed payment: dated the bank's date, TDS from the amount (as above, for the tenant chosen), applied first to any invoice whose number is in the bank text, then oldest first (D31).
- The tenant ledger (Tenants → a tenant → See the ledger) lists, oldest first, each sent invoice (its grand total, on its invoice date; drafts aren't owed yet, and a fully credited invoice still shows, with its credit note), each credit note (on its date), each payment (amount received, then the TDS kept back on its own line) and each reversal (its amount and TDS back on), with a running balance: billed − paid or credited. Positive is due, negative is credit. On one day: invoices, credit notes, then payments (each with its TDS) and reversals in the order they were made. With no credit kept and no over-credited invoice (D-019), the balance equals what is left on the tenant's invoices; with credit kept, it is that less the credit. A tenant's opening balance (below) is the ledger's first row, on its as-on date, before anything else that day. `tenantLedger` in `src/lib/billing/ledger.ts`.
- **Opening balance** (D-028: A; built in M10): what a tenant already owed when the landlord started on LeaseDesk, from invoices made in their old Excel or Tally. One per tenant: an amount (> 0, the total still due including any GST already invoiced) and an as-on date, typed on the tenant page or brought in by the tenants and leases import. It is never numbered, never sent, has no GST lines and isn't in the GST summary or the Tally sales vouchers (those invoices are already in the old books). It is settled like an invoice: its due date is the as-on date, so it is overdue from then, shows in Unpaid, ageing (by days since the as-on date) and on Today, and auto-allocation takes it first among items due on the same day. Payments, TDS kept back, reversals, bank matching and reminders work on it as on an invoice (reminders only by a person: "Remind all" and the WhatsApp link, never the automatic schedule, D55; the email has no invoice to quote and asks the tenant to quote "Opening balance"); nothing is expected for TDS on it, as the old invoice's TDS is unknown. It can be changed (logged) only while no payment is applied to it: to correct a wrong amount or date after a payment, reverse the payment (the allocations then net to zero), change the opening balance, and record the payment again (billing review M10, `drizzle/0036`). It can be removed only if no payment was ever applied to it, since the payment and its reversal still point at it. An advance the tenant had paid before (a credit) isn't an opening balance; it waits for a later task.
- Payments, applying credit, reversals and credit notes for one tenant are serialised (a transaction lock per tenant), so they never interleave.

## 12. Credit notes

- Always reference one original invoice.
- Reverse taxable value and tax in the same split as the original.
- Reasons: `correction`, `waiver`, `discount`, `other`, with a free-text note.
- The user enters the amount before GST to take off each line, up to what is left on it after earlier credit notes. **[CA]** (D-014)
- Crediting all that is left on a line reverses exactly the CGST, SGST or IGST left on it, so crediting a whole invoice reverses it to the paisa. A part credit works GST out on the amount credited at the line's rate (section 8, per line), never more than the tax left on the line. **[CA]**
- The invoice's round off is reversed only by the credit note that takes the last of the invoice; other credit notes have no round off. If reversing it would bring that last credit note to ₹0 or below (a negative round off bigger than the few paise left), it has no round off either. **[CA]**
- A credit note is dated the day it is issued, never before its invoice, and only until 30 November after the end of the invoice's financial year (CGST Act section 34(2)): later, GST can't be reduced, so it is refused and the user is told to ask their accountant. **[CA]** (D-014)
- Credit notes are numbered when issued, in the credit-note series of the invoice's billing GSTIN (section 9), with the building's credit note prefix. There are no draft credit notes.
- When nothing is left on the invoice, its status becomes `cancelled` ("Credit note issued").
- Until D-019 is answered, a credit note on an invoice with payments applied can take off at most what is still unpaid (grand total − earlier credit notes − payments). To credit more, reverse the payment, issue the credit note, and record the payment again; anything extra is kept as credit. So a cancelled invoice never has payments on it.

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

## 14. Payment reminders

Reminders never change what is owed; they only ask for it. `src/lib/reminders/`.

- Automatic reminder emails go on the days in `reminders.beforeDueDays` (default 3 days before the due date) and `reminders.afterDueDays` (default 1, 7 and 15 days after it), for every sent invoice with something left to ask for. An empty list switches that kind off. `reminders.autoSend` (organization or tenant, default on) turns them off for everyone or for one tenant. `reminderDue` in `schedule.ts`.
- A reminder asks for what is left on the invoice (section 11) less the TDS the tenant is still expected to deduct (section 10), never below ₹0. Nothing to ask (only TDS left) means no reminder. `amountToAsk`.
- Each step goes at most once per invoice. If the daily job missed days, only the latest step whose day has come is sent, and only if it is at most 3 days late: a tenant never gets a burst of old reminders. A step that fell before the invoice was sent isn't used, and a "before the due date" reminder isn't sent once the due date has come (except a 0-day step, which is on the due date).
- The job runs every day at 09:00 India time (`src/lib/jobs/reminders.ts`). It claims each reminder in the database before emailing, so a retry or a second run never emails twice; a send that never finished is not retried.
- Reminders go to the same addresses as invoices (billing contacts, else the primary contact). A tenant with no email address gets none; the invoice page shows that.
- "Remind … on WhatsApp" on the invoice page (owners and accounts) opens a WhatsApp chat (`https://wa.me/<number>`) with the message filled in, asking for the same amount; the person presses Send in WhatsApp. It goes to the contact marked as on WhatsApp: the accounts contact first, then the primary, then any. Each tap is recorded as a `whatsapp_link` reminder with who sent it; it doesn't count as an automatic step. `src/lib/reminders/whatsapp.ts`, `manual.ts`.

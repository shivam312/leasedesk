# Decisions needed

This is the founder's inbox: the only place questions are asked. Claude adds entries here instead of stopping.

**How to answer:** write your answer on the `Answer:` line (a letter is enough, e.g. `A`), change `Status: open` to `Status: answered`, and save. The pipeline applies answers at the start of its next run and marks them `applied`. For a `package` entry, also add the package name to `.claude/approved-packages.txt`.

**Types:** `product` (your call), `ca` (ask your chartered accountant), `pilot` (ask a pilot landlord), `package` (approve a new library), `spend` (costs money or needs an account).

## Summary

| ID | Question | Type | Blocking | Status |
| --- | --- | --- | --- | --- |
| D-001 | Part-quarter pro-rating method | pilot | no | open |
| D-002 | Should automatic increases resume after a custom increase? | pilot | no | open |
| D-003 | TDS rounding, quarter and applicable charges | ca | no | open |
| D-004 | GST rounding and round-off line | ca | no | open |
| D-005 | Rounding negative amounts | ca | no | open |
| D-006 | Product name | product | no | open |
| D-007 | Final bill for a quarterly arrears charge that ends before the lease | pilot | no | open |
| D-008 | Approve shadcn's `cn` and `radix-ui` packages? | package | no | open |
| D-009 | GST on a month split by a rent increase, shown as one line | ca | no | open |
| D-010 | Building GST rates other than 18%, and 0% invoices | ca | no | open |
| D-011 | Billing from a business with no GSTIN | ca | no | open |
| D-012 | E-invoicing (IRN) for landlords over ₹5 crore turnover | ca | no | open |
| D-013 | Signature and "Original for recipient" on emailed invoices | ca | no | open |
| D-014 | How credit notes work out GST, round off and the time limit | ca | no | open |
| D-015 | One invoice number series per building prefix | ca | no | open |
| D-016 | Sending an invoice before its date, or weeks late | ca | no | open |
| D-017 | Expected TDS after a credit note | ca | no | open |
| D-018 | Billing a month again after its invoice was credited in full | product | no | open |
| D-019 | Credit notes against an invoice that's already paid | product | no | open |
| D-020 | TDS on a payment reversed in a later quarter | ca | no | open |
| D-021 | TDS certificate name and due dates under the new Income-tax Act | ca | no | open |
| D-022 | A few paise left after a payment with TDS | ca | no | open |
| D-023 | Money into one GSTIN's bank account paying another GSTIN's invoices | product | no | open |
| D-024 | Codex review of M5: unresolved items | product | no | open |
| D-025 | Codex review of M6: unresolved items | product | no | open |
| D-026 | Which month an invoice or credit note counts in on the GST summary | ca | no | open |
| D-027 | How payments, TDS and reversals go into Tally | ca | no | open |

## Human tasks

Things only a person can do. Tick them when done.

- [x] Install Docker Desktop and the Supabase CLI (M0; the pipeline stops until they're installed)
- [x] Apply the local lease migrations (M3). Done 2026-10-23: ran `pnpm db:migrate` by hand (unattended runs were refused permission five times); `pnpm test` passes. To let future unattended runs apply local migrations themselves, allow `pnpm db:migrate` in Claude Code's permissions (it already refuses non-local databases).
- [x] Apply the local invoice migrations (M4). Done 2026-10-23 by the M5 pipeline run, which was allowed to run `pnpm db:migrate`; it also applied the payment migrations (`drizzle/0014`–`0015`). The bank and documents migrations (`0016`–`0020`) are applied too (checked 2026-10-23), and the database tests no longer skip. Was: run `pnpm db:migrate` (unattended runs were refused permission). Until then the invoice database tests are skipped (their titles say "skipped until pnpm db:migrate") and the invoice screens can't save.
- [ ] Create a Google OAuth client (Google Cloud console) and turn on Google login in Supabase Auth, for "Log in with Google" (M2; email and password login works without it)
- [ ] Create a Resend account, verify the sending domain and put `RESEND_API_KEY` and `EMAIL_FROM` (the verified sender, e.g. `Invoices <invoices@yourdomain.in>`) in `.env.local` (M4; until then emails go to `.local-outbox/`). Also add `EMAIL_FROM`, `INNGEST_SIGNING_KEY` and `INNGEST_EVENT_KEY` to `.env.example`, which unattended runs can't open.
- [x] Install SheetJS for Excel bank statements (M5): done 2026-10-23 (0.20.3 from cdn.sheetjs.com). Excel statements import (D30).
- [x] Apply the reminders migrations locally (M5): done 2026-10-23 (`pnpm db:migrate` applied `drizzle/0021`–`0022`); the reminder database tests now fail rather than skip if the table is missing, and `pnpm test:e2e` passes.
- [ ] Put `APP_URL` (the app's address, e.g. `https://app.yourdomain.in`) in `.env.local` and the hosting settings, and add it to `.env.example` (M6). The daily digest email links to Today with it; without it the email says "Open LeaseDesk and go to Today" instead. Unattended runs can't open `.env` files.
- [ ] Get one real bank statement export (CSV or Excel) per major bank your pilots use, with personal details removed, in `tests/fixtures/bank/` (M5)
- [ ] Get a sample Tally XML export from a pilot accountant's TallyPrime and save it in `tests/fixtures/tally/` (M7)
- [ ] Create Sentry, Supabase cloud (Mumbai), Vercel and Inngest accounts and put the keys in `.env.local` (M8)
- [ ] Set up the staging environment and turn on database backups (M8)
- [ ] Load a pilot landlord's real data and compare one month's invoices with their Excel (M8)
- [ ] Usability test with an accountant who hasn't seen the app (M8)
- [ ] Have a chartered accountant review `docs/BILLING_RULES.md` and the `ca` entries below (M8, before the first paying customer)

## Open

### D-001: Part-quarter pro-rating method
- Status: open
- Type: pilot
- Blocking: no
- Context: When a quarterly charge starts mid-quarter, the first bill covers only part of the quarter. It can be worked out month by month, or by days across the whole quarter. For ₹30,000 a quarter starting 15 May, that's ₹15,483.87 or ₹15,494.51.
- Options:
  - A) Month by month: the quarterly amount ÷ 3 per month, part months by days in that month
  - B) Days across the whole quarter
- Recommendation: A. It matches how monthly charges are pro-rated and how most people would do it in Excel.
- Done meanwhile: A built as the only method (`partQuarterByMonth` in `src/lib/billing/proration.ts`, golden case 10). B is built too, as setting `billing.partPeriodMethod` (organization or lease), default A.
- Answer:

### D-002: Should automatic increases resume after a custom increase?
- Status: open
- Type: pilot
- Blocking: no
- Context: A lease can have an automatic rule (5% every year) and one-off custom increases. Today, once a custom increase happens, the automatic rule stops.
- Options:
  - A) Stop the automatic rule after a custom increase
  - B) Resume the automatic rule from the custom increase
  - C) Let each lease choose (setting), default A
- Recommendation: C.
- Done meanwhile: C built: lease setting `billing.afterCustomIncrease`, default A (`amountSteps` in `src/lib/billing/escalation.ts`; `docs/BILLING_RULES.md` section 5). For B, the rule restarts counted from the custom increase's date (1 Oct custom → next increase 1 Oct a year later), not on the original anniversaries, and never before the rule's own first increase date, so it never bills an increase sooner than a full interval after the custom one or earlier than the rule would have. Tell us if your pilots expect the original dates.
- Answer:

### D-003: TDS rounding, quarter and applicable charges
- Status: open
- Type: ca
- Blocking: no
- Context: Expected TDS is used to decide whether a short payment counts as "paid with TDS". Three things need confirming:
  - Rounding: expected TDS is rounded once to the nearest rupee.
  - Which quarter: each TDS amount is filed under the financial-year quarter of the payment date. The tenant may have deducted it in an earlier quarter (when the rent was credited in their books), and that's the quarter Form 16A shows.
  - Which charges: TDS is set per charge type on the tenant (rent, CAM, parking, other), each with its own rate (D10 in `docs/DECISIONS.md`). By default CAM, parking and other charges follow rent (10%, on for companies). Some tenants treat CAM as a contract for services, or parking as a separate supply, at another rate or with no TDS.
- Options:
  - A) Round to the rupee; quarter of the payment date; every charge type at the rent rate by default, changeable per tenant and charge type
  - B) As A, but file TDS under the quarter of the invoice date (closer to what Form 16A shows)
  - C) Something else (describe the rounding, quarter and default rates)
- Recommendation: A, pending your CA. Note for your CA on the quarter: under section 194-I, TDS is deducted when rent is credited or paid, whichever is earlier, so the invoice date (option B, setting `tds.quarterBasis` = `invoice_date`) may match Form 16A more often.
- Done meanwhile: A built as fixed behaviour, not yet as settings: rupee rounding (`expectedTds` in `src/lib/billing/tds.ts`), quarter of the payment date (`tdsQuarter`), and TDS on/off and rate per charge type on the tenant (`TenantTds`, defaults in `tenantTdsDefaults`). Settings `tds.rounding` (paisa or rupee) and `tds.quarterBasis` (payment or invoice date, which covers option B) are built too, defaults as A; per-type rates are already tenant inputs (`tds.rateBp`, `tds.appliesTo`).
- Answer:

### D-004: GST rounding and round-off line
- Status: open
- Type: ca
- Blocking: no
- Context: GST can be rounded on each invoice line or once on the invoice total, and the total can carry a round-off line to the nearest rupee. Today each tax (CGST, SGST, IGST) is rounded to the paisa per line and the invoice tax is the sum of the lines. Some accounting software computes tax once on the invoice's taxable total, which can differ by a few paise on multi-line invoices.
- Options:
  - A) Round tax per line; round the total to the rupee with a round-off line
  - B) Round tax once on the total; round-off line
  - C) No rounding of the total
- Recommendation: A, pending your CA. Also ask: with option B, one line's tax can differ by a paisa from its rate × its taxable value (the rounding difference is put there so the lines add up). Is that acceptable on a tax invoice and in e-invoice (IRN) line checks? The difference grows with the number of lines at one rate: 50 lines of ₹100.05 at 18% put 23 paise extra CGST on one line (₹9.23 against ₹9.00 on the others). If that's not acceptable, the alternative is to spread the difference a paisa per line.
- Done meanwhile: A built (`lineTax` and `invoiceTotals` in `src/lib/billing/gst.ts`). The round-off line can already be turned off in the engine (`BillingSettings.roundInvoiceTotal`, setting `billing.roundInvoiceTotal`), which covers C. B is built too, as setting `gst.rounding` (`invoiceTax` in `src/lib/billing/gst.ts`), default per line: tax once per rate on the total, with the rounding difference on the largest line so the printed lines add up.
- Answer:

### D-005: Rounding negative amounts
- Status: open
- Type: ca
- Blocking: no
- Context: Credit notes and round-off lines can be negative. Rounding half away from zero makes a credit note mirror its invoice exactly.
- Options:
  - A) Half away from zero (−₹0.005 → −₹0.01)
  - B) Half up (−₹0.005 → ₹0.00)
- Recommendation: A.
- Done meanwhile: A built (`mulDiv` in `src/lib/billing/money.ts`) and written into `docs/BILLING_RULES.md` section 2.
- Answer:

### D-006: Product name
- Status: open
- Type: product
- Blocking: no
- Context: "LeaseDesk" is a working name. A RealPage product called LeasingDesk exists in the US, and a startup uses leasingdesk.ai. The name appears in the app title, emails and invoices.
- Options:
  - A) Keep LeaseDesk after a trademark check
  - B) Choose a new name (tell us which)
- Recommendation: decide with the marketing team. The code keeps the name in one config value (`src/lib/config/brand.ts`) so changing it is easy.
- Done meanwhile: name kept in one place, `src/lib/config/brand.ts`, used for the page title and the app shell. Emails and invoices must use it too when they're built.
- Answer:

### D-007: Final bill for a quarterly arrears charge that ends before the lease
- Status: open
- Type: pilot
- Blocking: no
- Context: A charge billed quarterly in arrears is billed in the run after the quarter ends. When the lease ends mid-quarter, the final bill comes forward to the run after the lease ends (`docs/BILLING_RULES.md` section 7). But when only the charge ends mid-quarter (say parking is given up on 20 Nov while the lease continues), the bill for Oct–20 Nov still waits for the January run.
- Options:
  - A) Keep billing it in the run after the quarter ends (January in the example)
  - B) Bill it in the run after the charge ends (December), the same as when the lease ends
- Recommendation: B, because it treats a charge ending the same way as a lease ending and settles the tenant's account sooner. A is built meanwhile because it never bills early.
- Done meanwhile: A built (`billingRun` in `src/lib/billing/schedule.ts` uses the earlier of the quarter end and the lease end, not the charge end).
- Answer:

### D-008: Approve shadcn's `cn` and `radix-ui` packages?
- Status: open
- Type: package
- Blocking: no
- Context: The current shadcn/ui setup tool installs two packages that aren't on the approved list: `cn` (shadcn's own class-name merger, MIT, from github.com/shadcn-ui/cn) and `radix-ui` (Radix's single all-in-one package, MIT). They came in during M0 setup. The M0 review swapped them for approved packages that do the same job: `clsx` + `tailwind-merge`, and `@radix-ui/react-slot`. Each new shadcn component we add may import the unapproved names again, and we'd have to change those imports by hand each time.
- Options:
  - A) Approve `cn` and `radix-ui` (add both to `.claude/approved-packages.txt`). New shadcn components then work as generated.
  - B) Keep the approved equivalents. Every shadcn component we add has its imports changed to `@/lib/utils` and `@radix-ui/react-*`.
- Recommendation: A, because both are official packages from the same authors as libraries already approved, and it removes a manual step from every new screen. Nothing changes for landlords either way.
- Done meanwhile: B. `src/lib/utils.ts` builds `cn` from `clsx` + `tailwind-merge`, and `src/components/ui/button.tsx` imports `Slot` from `@radix-ui/react-slot`. If you pick A, the switch back is a few lines.
- Answer:

### D-009: GST on a month split by a rent increase, shown as one line
- Status: open
- Type: ca
- Blocking: no
- Context: When rent goes up mid-month, that month can be shown as two invoice lines (one per rate, the default) or one combined line (setting `billing.midMonthIncreaseLines`). GST is rounded on each line, so one line can give CGST and SGST 1 paisa different from two lines. Example: ₹90,000 rising to ₹94,500 on 16 July gives CGST ₹8,309.04 on two lines and ₹8,309.03 on one. Related to D-004 (where tax is rounded).
- Options:
  - A) Allow both: GST worked out on whatever lines the invoice shows
  - B) Always work out GST on the two parts, even when they are shown as one line
- Recommendation: A. Tax on the lines as printed is what an officer or the tenant's accountant can check on the invoice itself.
- Done meanwhile: A built (`linesFor` in `src/lib/billing/invoice-lines.ts`, tested in `line-settings.test.ts`). The default is two lines, so nothing changes unless a landlord picks one line.
- Answer:

### D-010: Building GST rates other than 18%, and 0% invoices
- Status: open
- Type: ca
- Blocking: no
- Context: Each building has a default GST rate (`gst.defaultRateBp`, 18%) and SAC code (997212) for new charges, and each charge can have its own. The app accepts any rate from 0% to 100%. Renting commercial property is normally 18%. An exempt or nil-rated supply (0%) is usually shown on a bill of supply rather than a tax invoice, which the app doesn't produce yet.
- Options:
  - A) Allow any rate; a 0% charge still appears on the normal invoice with ₹0 GST
  - B) Allow only the standard GST rates, and print a bill of supply when every line is 0%
- Recommendation: B before the first paying customer, pending your CA. A is built meanwhile because it bills no tax that isn't owed.
- Done meanwhile: A. Rates are whole basis points 0–10000 (`src/lib/settings/schema.ts`), copied onto charges when a lease is saved (D16).
- Answer:

### D-011: Billing from a business with no GSTIN
- Status: open
- Type: ca
- Blocking: no
- Context: A building's invoices come from one of your businesses (Settings → Business details). A business can be saved without a GSTIN, for a landlord who isn't GST-registered. An unregistered business mustn't charge GST, and its bills are a "bill of supply", not a tax invoice. The app only makes tax invoices with GST so far.
- Options:
  - A) Don't make invoices for a building whose business has no GSTIN; the monthly run lists those leases and says to add the GSTIN
  - B) Make bills of supply with no GST for those buildings
- Recommendation: A for now. A landlord with 20–100 commercial tenants is above the GST threshold, so almost every one is registered; B can follow if a pilot needs it.
- Done meanwhile: A. `runBilling` (`src/lib/invoices/run.ts`) skips the lease and reports "Add the GSTIN for … in Settings → Business details, then run billing again."
- Answer:

### D-012: E-invoicing (IRN) for landlords over ₹5 crore turnover
- Status: open
- Type: ca
- Blocking: no
- Context: A business whose yearly turnover is over ₹5 crore must register each invoice to a GST-registered tenant on the government e-invoice portal, which returns an IRN and a signed QR code to print on the invoice. 100 tenants at about ₹1 lakh a month is about ₹12 crore a year, so some of our target landlords will be above the limit. Without the IRN those invoices aren't valid for the tenant's input tax credit. Connecting to the portal (through a GST Suvidha Provider) is a new outside service and may cost money.
- Options:
  - A) v1 doesn't do e-invoicing; landlords above ₹5 crore enter our invoices on the portal themselves (or through their accountant's software) until we add it
  - B) Add e-invoicing through a GST Suvidha Provider before launch (needs a vendor, an account and an API key)
- Recommendation: A for the pilot, if the pilot landlords are under ₹5 crore; ask your CA, and plan B before selling to larger landlords.
- Done meanwhile: A. Invoices print without an IRN; recorded as **[CA]** in `docs/BILLING_RULES.md` section 9.
- Answer:

### D-013: Signature and "Original for recipient" on emailed invoices
- Status: open
- Type: ca
- Blocking: no
- Context: GST rules ask for an invoice to be signed (or digitally signed) by the supplier, and for service invoices to be made in two copies, marked "Original for recipient" and "Duplicate for supplier". Our PDF has an empty "Authorised signatory" line with "This is a computer-generated invoice." and is marked "Original for recipient". Many businesses email invoices like this, but practice varies.
- Options:
  - A) Keep the "computer-generated" line and the empty signatory line
  - B) Print an uploaded signature image above "Authorised signatory"
  - C) Sign each PDF with a digital signature certificate (needs a certificate and a signing service)
- Recommendation: A for the pilot; B is small to add if your CA prefers it.
- Done meanwhile: A, with "Original for recipient" printed under the title. The landlord keeps the sent PDF as their copy.
- Answer:

### D-014: How credit notes work out GST, round off and the time limit
- Status: open
- Type: ca
- Blocking: no
- Context: A credit note takes money off a sent invoice. We reverse GST in the same split as the invoice (CGST + SGST, or IGST). Crediting all that's left on a line reverses exactly the tax charged on it. A part credit (say ₹5,000 of maintenance) works GST out on that amount at the line's rate. The invoice's round off is reversed only with the last of the invoice. We refuse a credit note after 30 November following the end of the invoice's financial year, because GST can't be reduced after that (CGST Act section 34(2)).
- Options:
  - A) As built: GST at the line's rate on a part credit, round off only on the last credit, refuse after the 30 November limit
  - B) As A, but after the limit allow a "financial" credit note with no GST (the tenant's balance goes down; GST paid stays paid)
  - C) Round every credit note's total to the rupee, like invoices
- Recommendation: A for the pilot; ask your CA whether B is needed for late corrections.
- Done meanwhile: A, in `src/lib/billing/credit-note.ts` (`creditNoteAmounts`, `creditNoteDeadline`) and BILLING_RULES section 12, marked [CA].
- Answer:

### D-015: One invoice number series per building prefix
- Status: open
- Type: ca
- Blocking: no
- Context: GST lets a business keep several invoice series, as long as each number is unique in the financial year. We keep one series per GSTIN, year and building prefix, so Building B1 and Building B2 each count from 0001 (`B1/26-27/0001`, `B2/26-27/0001`). To keep every number unique, a custom number format must include the prefix and year, and a credit note prefix can't be any building's invoice prefix under the same GSTIN.
- Options:
  - A) As built: one series per building prefix
  - B) One series per GSTIN: all buildings share one counter, e.g. `INV/26-27/0001`, `INV/26-27/0002` across buildings
- Recommendation: A, because accountants can tell the building from the number and each building's run is consecutive; ask your CA to confirm.
- Done meanwhile: A, in `src/lib/invoices/numbering.ts`; `invoice.numberFormat` must include `{prefix}`, `{fy}` and `{seq}`; building prefixes are checked (`prefixClash`). BILLING_RULES section 9, marked [CA].
- Answer:

### D-016: Sending an invoice before its date, or weeks late
- Status: open
- Type: ca
- Blocking: no
- Context: A month's invoices are dated the 1st. With the run day set to the 25th, November's invoices can be sent on 26 October, so they are dated in the future. A draft sent late (October's, sent in December) keeps its 1 October date but gets a number after November's, so numbers don't follow dates.
- Options:
  - A) As built: send any draft whenever; it keeps its 1st-of-month date
  - B) Refuse to send before the invoice date (send on or after the 1st)
  - C) B, and a draft sent after its month is re-dated to the day it is sent
- Recommendation: B for the pilot, because an invoice dated after it was issued is the easiest thing for a GST officer to question; ask your CA about C.
- Done meanwhile: B, the conservative reading: `tooEarlyToSend` in `src/lib/invoices/forms.ts`, checked in `issueInvoice`; the Billing and invoice pages say "Invoices dated 01-11-2026 can be sent from that day, not before." Late drafts keep their date (A's part of C not built).
- Answer:

### D-017: Expected TDS after a credit note
- Status: open
- Type: ca
- Blocking: no
- Context: A ₹1,18,000 invoice expects ₹10,000 TDS, so the tenant is asked for ₹1,08,000. After a ₹59,000 credit note (₹50,000 rent + GST), the tenant would deduct TDS only on the ₹50,000 left, so ₹5,000, and pay ₹54,000. We don't yet reduce the expected TDS when a credit note is issued.
- Options:
  - A) Work out expected TDS again on the taxable value left after credit notes, and ask for that balance
  - B) Keep the invoice's expected TDS and let the accountant adjust when the payment comes in
- Recommendation: A, because it matches what the tenant will actually pay, so M5 can match the payment automatically.
- Done meanwhile: an invoice with any credit note prints no amount to pay and no amount in its UPI QR (like a part-paid invoice), so the tenant is never asked for too much. From M5, payments use A: the TDS still expected on a credited invoice is worked out again per charge type on the taxable value left, with the tenant's TDS settings and `tds.rounding` (`expectedTdsAfterCredits` in `src/lib/billing/allocation.ts`), so a payment of what the tenant will really pay is recognised as paid with TDS. It only affects matching and the TDS suggestion, never an amount billed.
- Answer:

### D-018: Billing a month again after its invoice was credited in full
- Status: open
- Type: product
- Blocking: no
- Context: Sometimes the whole invoice is wrong: you credit it in full and want a corrected invoice for the same month. Clicking "Make invoices" again for that month could make a new draft, but then a month waived on purpose would be billed again by accident.
- Options:
  - A) Never automatically: a fully credited month is left alone; a button on the credited invoice, "Make a corrected invoice for this month", makes a new draft on purpose
  - B) Making the month again always makes a new draft for a fully credited invoice
- Recommendation: A, because waiving a month is common and billing it again by accident is the worse mistake.
- Done meanwhile: making the month again never bills a fully credited month (`billedLeaseIds` in `src/lib/invoices/run.ts`). There is no button for a corrected invoice yet (backlog).
- Answer:

### D-019: Credit notes against an invoice that's already paid
- Status: open
- Type: product
- Blocking: no
- Context: A credit note can be issued against any sent invoice, including one marked paid or part-paid. Then the tenant has paid more than they owe. Until payments (M5) can hold that as an advance or record a refund, nothing shows the extra.
- Options:
  - A) Allow it; from M5 the extra becomes an advance on the tenant's ledger, used against their next invoice
  - B) Allow it; from M5 the extra is shown as a refund to pay
  - C) Refuse credit notes on paid invoices
- Recommendation: A, because most landlords adjust against next month's rent instead of paying refunds.
- Done meanwhile: until M5 it was allowed. Now that payments exist, a credit note can take off at most what is still unpaid on the invoice, so a payment is never left stranded on a credited invoice. To credit a paid invoice, reverse the payment, issue the credit note and record the payment again: the extra is kept as credit and "Apply credit" on the tenant page uses it on their next invoice. That is option A done by hand; answering A lets us do it in one step.
- Answer:

### D-020: TDS on a payment reversed in a later quarter
- Status: open
- Type: ca
- Blocking: no
- Context: A payment recorded by mistake (say, against the wrong tenant) is reversed, never deleted. Its TDS then stops counting. If the payment was in April–June and it's reversed in October, the April–June TDS total changes after the fact, and nothing shows in October.
- Options:
  - A) Drop the reversed payment's TDS from its original quarter (it was never really deducted for this tenant)
  - B) Keep it in the original quarter and add a negative TDS entry in the quarter of the reversal
- Recommendation: A, because a reversal is for a payment entered by mistake, so the TDS never belonged to that quarter; the TDS tracker will show the change so the accountant can check any return already filed.
- Done meanwhile: A (`settledBy` and the TDS queries count only active payments' TDS records; D29).
- Answer:

### D-021: TDS certificate name and due dates under the new Income-tax Act
- Status: open
- Type: ca
- Blocking: no
- Context: The TDS screen calls the tenant's certificate "Form 16A" and treats it as due 15 days after each quarter's TDS return: 15 Aug, 15 Nov, 15 Feb and 15 Jun. A missing certificate shows as overdue after that. The Income-tax Act 2025 renumbers sections and forms, so the name or dates may have changed.
- Options:
  - A) Keep "Form 16A" and these dates
  - B) Use the new Act's form name and dates (tell us what they are)
- Recommendation: A until your CA confirms; it's one line each to change in `src/lib/config/tax-labels.ts`.
- Done meanwhile: A, all in `src/lib/config/tax-labels.ts`.
- Answer:

### D-022: A few paise left after a payment with TDS
- Status: open
- Type: ca
- Blocking: no
- Context: The accountant types the TDS from the tenant's certificate (say ₹10,000), but the money received is a few paise off (₹1,07,999.50 against a ₹1,18,000 invoice), so ₹0.50 is left. Our rules say a payment within `tds.tolerancePaise` (₹1 per invoice) counts as "paid with TDS". The app now marks such an invoice Paid and never sends a reminder for it, but it doesn't book the ₹0.50 anywhere: the tenant's ledger still shows ₹0.50 due.
- Options:
  - A) Leave it as now: Paid, no reminder, the paise stay visible on the ledger (the accountant writes them off in Tally)
  - B) Book the gap as extra TDS on that invoice (TDS becomes ₹10,000.50, which won't match the certificate)
  - C) Book the gap as a small write-off entry so the ledger shows ₹0
- Recommendation: A, because it never asks the tenant for more, doesn't change the TDS the certificate shows, and adds no new kind of entry; C can come with the Tally export (M7) if accountants want the ledger to read ₹0.
- Done meanwhile: A, in `invoiceSettlement` (`src/lib/billing/allocation.ts`), using `tds.tolerancePaise`.
- Answer:

### D-023: Money into one GSTIN's bank account paying another GSTIN's invoices
- Status: open
- Type: product
- Blocking: no
- Context: A landlord with two businesses (two GSTINs) has a bank account for each. When a bank line from business X's account is matched, the app lets it pay the tenant's invoices from business Y too, so Y's invoice shows paid while the money sits in X's account. Some landlords do collect for both into one account on purpose.
- Options:
  - A) Allow it, with a clear warning when it happens
  - B) Only let a bank line pay invoices of the business that owns the account (typed payments can still pay any)
- Recommendation: A, because it never blocks a landlord who collects into one account, and the warning catches mistakes.
- Done meanwhile: nothing changed (it is allowed, with no warning yet); the warning is in `docs/BACKLOG.md`.
- Answer:

### D-024: Codex review of M5: unresolved items
- Status: open
- Type: product
- Blocking: no
- Context: Codex (the independent reviewer) and Claude still disagree on one item after two review rounds (`.pipeline/reviews/M5-codex-review-2.md`). It is about how a payment that isn't applied to any invoice is recorded, not about any amount being wrong.
  - **Item 1: recording a payment as credit only** (`src/lib/payments/forms.ts`, payment form).
    - Codex says: the payment form drops every invoice row set to 0, so a user can't clearly say "keep this whole payment as credit". Because a saved payment can't be edited, a wrong allocation can't be fixed later. It asks for an explicit way to record unapplied credit, a visible remainder, and a clear "Apply credit" action later.
    - Claude says: this already works. Setting every invoice row to 0 saves the payment with nothing applied, the invoices stay unpaid and the whole amount is kept as credit (BILLING_RULES section 11). Dropping the 0 rows is required, because an allocation amount is never 0 (DATA_MODEL). The form already shows "Kept as credit for later invoices", and credit is only used when someone taps "Apply ₹… credit" on the tenant page. A database test now proves it ("keeps a payment applied to nothing as credit, with an invoice unpaid", `src/lib/payments/__tests__/payments.db.test.ts`). A wrong allocation is corrected the same way as any recorded payment: reverse it and record it again (rule 5). The only limit is on purpose: TDS can't be recorded with nothing applied, because TDS is always against an invoice.
- Options:
  - A) Leave it as now: to keep a payment as credit, set each invoice to 0
  - B) Also add a one-tap "Keep it all as credit" link on the payment form that sets every invoice to 0 (screen change only; the money rules don't change)
  - C) Also let a user change what a recorded payment was applied to, without reversing it (a new kind of correction entry)
- Recommendation: B, because the behaviour is already correct and tested, and a single link makes "credit only" easy to find on a phone without touching how money is booked. C adds a new kind of entry for something reversing already handles.
- Done meanwhile: A (no code change); the database test above was added. B is small and can be built once answered.
- Answer:

### D-025: Codex review of M6: unresolved items
- Status: open
- Type: product
- Blocking: no
- Context: Codex (the independent reviewer) and Claude still disagree on two "must fix" items after two review rounds (`.pipeline/reviews/M6-codex-review-2.md`). Neither changes an amount on an invoice; one is about the "hasn't paid ₹X" figure on Today, the other about reminder days on lease dates. Codex's three "should fix" items are handled: the loading skeleton is built, and the tappable amounts, the Excel import link (M7) and retrying a failed digest email are in `docs/BACKLOG.md`.
  - **Item 1: TDS subtracted twice from the overdue amount on Today** (`src/lib/alerts/attention.ts`).
    - Codex says: the overdue total subtracts each open invoice's expected TDS, even when TDS was already recorded against that invoice, so Today could ask a tenant for too little. It wants the expected TDS capped after recorded TDS, and a test with two invoices where TDS was recorded against one.
    - Claude says: that cap is already there. The expected TDS comes from `unpaidInvoices` (`src/lib/payments/payments.ts`), which uses `remainingExpectedTds`: expected TDS less the TDS already recorded against that invoice, never more than is left to pay (BILLING_RULES section 10, tested in `src/lib/billing/__tests__/allocation.test.ts`). In Codex's example (two ₹1,18,000 invoices with ₹10,000 TDS each, the first part-paid ₹50,000 with its ₹10,000 TDS recorded) Today asks ₹58,000 + ₹1,08,000 = ₹1,66,000, which is correct.
  - **Item 2: saving Billing rules overwrites reminder days on lease dates** (`src/lib/alerts/dates.ts`, `applyReminderDays`).
    - Codex says: saving organization settings replaces the reminder days on every open expiry, rent increase and lock-in date, which would wipe any lease-specific reminder days. It wants only dates still on the old default updated, or an override marker.
    - Claude says: there are no lease-specific reminder days to wipe. `alerts.expiryDays`, `alerts.increaseDays` and `alerts.lockInDays` can only be set for the whole organization (docs/SETTINGS.md, `src/lib/settings/schema.ts`), and no screen edits one date's reminder days. docs/SETTINGS.md says saving Billing rules updates dates not yet done, which is what the function does; notice, renewal-option and custom dates are left alone, and dates already matching are skipped. If per-lease reminder days are added later, this function must then skip those dates.
- Options:
  - A) Leave both as now (no code change)
  - B) Leave the behaviour, but add the tests Codex asked for: two overdue invoices with TDS recorded against one, and a note in `applyReminderDays` that it must skip lease-level values if they are ever added
  - C) Add per-lease reminder days now (a lease setting and an override marker), so landlords can set different reminders for one lease
- Recommendation: B, because both behaviours are already correct by the documented rules, and the extra test pins down the exact case Codex worried about at almost no cost. C is a new feature no landlord has asked for yet.
- Done meanwhile: A (no code change for either item); the loading skeleton was fixed and the other should-fix items were backlogged.
- Answer:

### D-026: Which month an invoice or credit note counts in on the GST summary
- Status: open
- Type: ca
- Blocking: no
- Context: Reports → GST summary is meant to help your accountant fill the monthly GST returns (GSTR-1 and GSTR-3B). It counts each sent invoice in the month of its invoice date (the 1st of the month it bills), and each credit note in the month it was issued, even when its invoice is from an earlier month. It splits invoices into B2B (tenant has a GSTIN) and B2C (tenant isn't registered), one row per GST rate, with figures copied from the sent documents. Invoices not sent yet are left out, even if their date has passed.
- Options:
  - A) Keep this: invoice date and credit note date decide the month
  - B) Count an invoice in the month it was sent (numbered), when that is later than its invoice date
- Recommendation: A, because the invoice date printed on the invoice is the date of supply your GST return reports, and a credit note is reported in the month it is issued.
- Done meanwhile: built A (`src/lib/reports/gst-summary.ts`), with a note on the report to check with a CA before filing.
- Answer:

### D-027: How payments, TDS and reversals go into Tally
- Status: open
- Type: ca
- Blocking: no
- Context: The Tally file (Reports → Tally export) makes a Sales voucher per invoice, a Credit Note voucher per credit note, and a Receipt voucher per payment: the bank is debited what was received, a "TDS Receivable" ledger is debited the TDS the tenant kept back, and the tenant is credited the total against each invoice it paid. A reversed payment (a bounced cheque) becomes a Journal voucher with every side swapped, dated the day it was reversed. Your accountant may book TDS or reversals differently.
- Options:
  - A) Keep this
  - B) Book reversals as a negative Receipt instead of a Journal
  - C) Something else your accountant prefers (describe it)
- Recommendation: A, because a Journal is how most accountants undo a receipt in Tally, and it keeps the original receipt untouched, like our payments.
- Done meanwhile: built A (`src/lib/exports/tally.ts`). The format still needs checking against a real TallyPrime export (the human task to save one in `tests/fixtures/tally/`).
- Answer:

## Applied

(Applied entries move here, newest first.)

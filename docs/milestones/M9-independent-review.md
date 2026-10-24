# Independent review of M9 (Codex)

**Verdict:** fail

M9 adds the reported workflow and audit features, but the deposit settlement statement can reuse the same unapplied payment credit in separate statements for a tenant’s different leases. That can understate what remains owed and overstate what should be refunded, so I’m not confident in settlement figures until that is fixed. I checked the deposit arithmetic and the statement’s financial-year calculations by hand; they are correct for a single lease and the examples given. Please review how the product should allocate a tenant-wide credit across leases before relying on separate settlement statements.

## Must fix (1)

- **src/app/(app)/leases/[id]/settlement/route.ts**: Each lease’s settlement statement subtracts the tenant’s entire unapplied payment credit, even though that credit is shared across all of the tenant’s leases. Downloading statements for two leases can therefore count the same credit twice.
  - Evidence: The route calls `paymentsWithCredit(s, tenantId)` without restricting or allocating credit to this lease, sums every result into `creditPaise`, and passes that full amount with only this lease’s unpaid invoices to `settlementReport`. The report then applies it to those dues via `creditUsedPaise = Math.min(creditPaise, duesPaise)`.
  - Fix: Define and enforce one tenant-wide allocation of unapplied credit across leases, or exclude tenant-wide credit from an individual lease settlement until such allocation exists. Ensure separate statements cannot each consume the same credit.

## Should fix (0)

None.

## Verified by hand

- Deposit settlement arithmetic for the documented test: ₹3,00,000 held less ₹1,26,360 dues after TDS gives ₹1,73,640 refund.
- Credit-before-deposit arithmetic in the statement test: ₹1,26,360 credit covers ₹1,26,360 dues, leaving the ₹3,00,000 deposit refundable.
- Financial-year statement example: opening ₹1,18,000 plus ₹1,18,000 billed less ₹1,68,000 paid gives ₹68,000 closing balance; the FY dates are inclusive from 01-04 through 31-03.
- Deposit entries use integer paise, reject non-positive amounts, prevent recording `adjusted` entries, and enforce the date-ordered held-balance check in the data layer.

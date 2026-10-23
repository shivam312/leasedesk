# Audit of M5A: Demo data and walkthrough

**Verdict:** pass

The current M5A seed, walkthrough, captions, and demo script have working implementations and meaningful coverage. I found no money, security, or invoice/payment immutability defect in the reviewed paths. Three follow-ups remain: demo reseeding leaves certificate files in Storage, one GST display assertion is incomplete, and Today’s overdue list can become unwieldy.

## Must fix (0)

None.

## Should fix (3)

- **src/lib/demo/seed.ts**: Reseeding removes the demo’s database rows but leaves its TDS certificate files in Supabase Storage, so the reset is incomplete and accumulates orphaned files.
  - Evidence: removeDemo deletes rows from tables with organization_id (lines 93 onward), but does not remove Storage objects. attachCertificate stores each file under an organization-prefixed, UUID-based path at [certificates.ts](/Users/shivam/work/leasedesk/src/lib/tds/certificates.ts:106).
  - Fix: Before deleting the demo organization, list and remove objects under its Storage prefix, or add an organization-scoped cleanup helper and cover reseeding in a test.
- **tests/e2e/walkthrough.spec.ts**: The draft check only asserts a visible GST amount for CGST; it does not independently assert the SGST amount or its label, so a display regression in that tax line could pass.
  - Evidence: Lines 204–210 check `kalinga.totals.cgst` but never `kalinga.totals.sgst`; the total assertion does not verify how the GST is displayed.
  - Fix: Assert both labeled tax rows and their expected amounts on the invoice page.
- **src/lib/alerts/queries.ts**: Today returns every unpaid invoice row without limiting or paginating the overdue tenant list. After sending the month’s invoices late, the demo can show over 40 overdue cards on a phone, contrary to the UX checklist for lists over 20 rows.
  - Evidence: `openInvoiceRows` appends every unpaid invoice at lines 55–70. M5A records that the walkthrough takes the phone screenshot before sending because the list becomes very long ([M5A.md](/Users/shivam/work/leasedesk/docs/milestones/M5A.md:115)); the UX checklist calls for search and filters above 20 rows ([UX_PRINCIPLES.md](/Users/shivam/work/leasedesk/docs/UX_PRINCIPLES.md:28)).
  - Fix: Show a bounded set of the largest or oldest overdue items and provide a clear link to the full ageing report.

## Verified by hand

- Seed plan: two buildings, 45 distinct tenants and leases, GSTIN state codes, stated rent ranges and escalation mix, two rent-free leases, one lease 60 days out, one in lock-in, and six unpaid invoices are represented in code and unit tests.
- History and walkthrough: the seed creates past-month invoices and payments, leaves the current month ready to bill, generates a bank CSV, and the browser walkthrough covers login, tenant/lease, new lease, billing, payment, bank matching, reports, and 375px Today and lease-list views. The page generator and screenshot-caption coverage have unit tests.
- Money checked by hand against BILLING_RULES.md: Kalinga’s October rent is ₹2,83,179 after three annual 5% increases from ₹2,44,620; CAM ₹48,924 plus parking ₹4,000 gives ₹3,36,103 taxable; CGST and SGST are ₹30,249.27 each, with ₹0.46 round-off to ₹3,96,602 total and ₹33,610 TDS. The new lease rent is 5,944 sq ft × ₹125 = ₹7,43,000. The deposit test’s ₹85.51 × 1,250.50 sq ft, rounded to paise before multiplying by six, gives ₹6,41,581.56.
- The focused demo test run passed 37 tests; two database tests could not connect to local Postgres (`EPERM 127.0.0.1:54322`), so their runtime behavior was not verified in this environment.
- Server actions reviewed use membership and billing permission checks and scoped database access. Database triggers reject edits/deletes to sent invoices and payments, with reversals and credit notes as correction paths.

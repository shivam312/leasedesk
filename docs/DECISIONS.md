# Decisions

One entry per decision. Newest at the bottom. Format: date, decision, why, consequences. Don't delete old entries; mark them superseded.

## D1. India first, commercial landlords with 20–100 tenants (2026-10-22)

**Why:** Enterprise tools are too heavy for this size, broad local tools serve everyone, and most of these landlords run on Excel and Tally. The UAE and Saudi need Ejari/Ejar, VAT/ZATCA and Arabic, and Riyadh's rent freeze weakens the escalation pitch.
**Consequences:** All tax logic is Indian (GST, TDS). UAE is a possible later expansion; Saudi only with a local partner.

## D2. One Next.js app on Supabase (2026-10-22)

**Why:** A solo developer can build, run and deploy it. Supabase gives Postgres, auth and storage in the Mumbai region.
**Consequences:** No separate backend service. Background work runs on Inngest.

## D3. Money in integer paise, percentages in basis points (2026-10-22)

**Why:** Floating-point rounding errors on invoices destroy trust and break GST returns.
**Consequences:** All money columns are `bigint`; conversion to rupees happens only for display.

## D4. Sent invoices and recorded payments are immutable (2026-10-22)

**Why:** GST rules and audits require a stable record; landlords need to trust history.
**Consequences:** Corrections are credit notes and payment reversals. Only drafts can be edited.

## D5. Billing engine is pure and test-first (2026-10-22)

**Why:** Billing correctness is the product. Pure functions are easy to test exhaustively.
**Consequences:** `src/lib/billing/` has no database, network or clock access. Golden test cases must always pass.

## D6. GST split follows the building's location (2026-10-22)

**Why:** For renting immovable property, the place of supply is where the property is. Normally CGST + SGST regardless of the tenant's state.
**Consequences:** IGST only when the billing GSTIN's state differs from the building's state. To be confirmed with a CA before launch.

## D7. Tally export and bank matching are in v1 (2026-10-22)

**Why:** At 20–100 tenants the accountant won't retype invoices or record payments one by one.
**Consequences:** v1 ships a Tally XML export and bank statement matching; full two-way sync waits for v2.

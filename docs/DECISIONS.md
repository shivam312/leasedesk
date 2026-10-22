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

## D8. Node 24, Next.js 16, and a sidebar / bottom-tab app shell (2026-10-22)

**Why:** Next.js 16 is the current release and needs Node 20.9+; Node 24 is the active LTS. The owner mostly uses a phone and the accountant a laptop, so the five nav items need to be one tap away on both: bottom tabs fit five items at 375px, and a sidebar keeps the laptop layout table-dense.
**Consequences:**
- `.nvmrc` pins Node 24 and `package.json` requires Node 22 or newer. pnpm comes with that Node install (`packageManager` in `package.json`).
- Next.js 16 runs with `cacheComponents` and `partialPrefetching` on (the create-next-app defaults). Client components that read the URL (`usePathname`, `useSearchParams`) sit inside a `Suspense` boundary, so pages with dynamic params still prerender. Next.js 16 changed many APIs: check `node_modules/next/dist/docs/` before using an unfamiliar one.
- One layout breakpoint: 768px (Tailwind `md`). From 768px up the nav is a left sidebar and lists are tables; below that the nav is a fixed bottom tab bar and lists are cards. This replaces the earlier 640px for cards, so a tablet never shows a laptop table above the phone tab bar. Settings is the profile icon in the top bar on both.
- Playwright runs every e2e test at 375px and 1280px against a production build (`next build && next start`), not the dev server.
- `formatINR` shows negative amounts as `-₹1,200`. The docs didn't specify this; change it here if accountants prefer brackets.

## D9. Invoice number formatting stays in the billing engine until M4 (2026-10-22)

**Why:** Golden case 13 needs the formatter now, and sequence assignment (which needs the database) doesn't exist yet. Moving it early would split one feature across two half-built places.
**Consequences:** `invoiceNumber` stays in `src/lib/billing/invoice-number.ts` (pure formatting and the 16-character check). It moves to `src/lib/invoices/` with sequence assignment in M4; there's a task for it in `docs/ROADMAP.md`.

## D10. TDS is set per charge type on the tenant (2026-10-22)

**Why:** Tenants often deduct TDS on rent but treat CAM or parking differently (another rate, or none). One rate per tenant would mark correct short payments as "part-paid".
**Consequences:** A tenant has a TDS on/off and rate for each of rent, CAM, parking and other. The defaults match the old single setting (10%, on for companies). Expected TDS is summed over the types and rounded once to the rupee. Which rates actually apply to CAM and parking is a [CA] open question.

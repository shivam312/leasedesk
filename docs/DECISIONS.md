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
**Consequences:** A tenant has a TDS on/off and rate for each of rent, CAM, parking and other. The defaults match the old single setting (10%, on for companies). Expected TDS is summed over the types and rounded once to the rupee. Which rates actually apply to CAM and parking is a [CA] question (D-003 in `docs/DECISIONS_NEEDED.md`).

## D11. Autonomous build pipeline; settings over questions (2026-10-23)

**Why:** The founder can't watch every session. `scripts/pipeline.mjs` builds the roadmap milestone by milestone in fresh Claude Code sessions, and questions collect in one inbox instead of stopping work.
**Consequences:**
- When landlords could reasonably want different behaviour, it's built as a setting with a safe default (`docs/AUTONOMY.md`, `docs/SETTINGS.md`), stored as `settings` jsonb on organizations, billing entities, buildings, tenants and leases, and resolved lease → tenant → building → organization → default.
- Tax rules not covered by `docs/BILLING_RULES.md` are built to the most conservative reading and logged as `ca` entries in `docs/DECISIONS_NEEDED.md`, rather than stopping. They still need a CA's sign-off before the first paying customer.
- Only packages in `.claude/approved-packages.txt` are installed; a hook blocks the rest. Claude doesn't edit that list, the hook, `.claude/settings.json` or the pipeline script.
- Interactive sessions still propose a plan and wait for approval; pipeline runs put a one-line plan in each commit message.
- The Open questions section of `docs/ROADMAP.md` stays empty; questions go to `docs/DECISIONS_NEEDED.md`.

## D12. Drizzle owns migrations; the Supabase CLI only runs the local stack (2026-10-23)

**Why:** One place for schema changes. Drizzle generates SQL from the TypeScript schema; keeping a second set in `supabase/migrations/` would drift.
**Consequences:**
- Migrations live in `drizzle/` and are applied by `scripts/migrate.ts` (`pnpm db:migrate`), not by `supabase db push` or `supabase db reset`. `supabase/migrations/` stays empty; `pnpm db:reset` runs migrate and seed after the Supabase reset.
- Row-level security policies and other hand-written SQL go in Drizzle custom migrations (`drizzle-kit generate --custom`).
- Drizzle manages only the `public` schema (`schemaFilter`), and uses `casing: "snake_case"`: TypeScript names are camelCase, columns are snake_case as in `docs/DATA_MODEL.md`.
- The client uses `postgres` (postgres.js) with `prepare: false`, so it also works through Supabase's transaction pooler.
- `db:migrate` and `db:seed` refuse any database that isn't on this machine unless `ALLOW_REMOTE_DB=yes` is set (`src/lib/db/url.ts`).

## D13. Building defaults are settings, not columns (2026-10-23)

**Why:** `docs/DATA_MODEL.md` listed `default_gst_rate_bp`, `default_sac_code` and `default_due_days` as building columns, while `docs/SETTINGS.md` lists the same values as building-scope settings (`gst.defaultRateBp`, `gst.defaultSac`, `invoice.dueDays`). Two places for one value would drift.
**Consequences:**
- They live only in `buildings.settings` (jsonb) and are read through `src/lib/settings/resolve.ts`, like every other setting.
- `invoice_prefix` and `credit_note_prefix` stay columns: every building needs one and they identify an invoice series rather than change behaviour.
- Child tables (floors, units, and later ones) reference their parent with `(organization_id, parent_id)` composite foreign keys, so the database itself refuses a row that points into another organization.

## D14. App queries run as the signed-in user, so row-level security applies (2026-10-23)

**Why:** The Drizzle client connects as the database owner, which bypasses row-level security. Policies that never run protect nothing.
**Consequences:**
- Organization data is read and written through `withOrg` (`src/lib/db/scoped.ts`), which sets `request.jwt.claims` and `set local role authenticated` inside a transaction. Queries still add `organization_id` themselves (`where`, `values`).
- Only a few trusted server paths use the owner connection directly: creating an organization at sign-up, accepting an invite, and looking up the signed-in user's memberships. Each is a named function in `src/lib/`, never a screen.
- Policy helpers live in the `app` schema (not exposed by Supabase's API). New tables call `app.apply_org_policies(table, write_roles, delete_roles)` in a custom migration; a test fails if any public table lacks a policy.

## D15. Below the organization, a stored setting means "set here" (2026-10-23)

**Why:** `docs/AUTONOMY.md` says only values that differ from the default are stored. Applied at every level, a building couldn't go back to the default when its organization had changed it (organization rounds to `none`, one building needs `rupee`, the default).
**Consequences:** `saveSettings` (`src/lib/settings/store.ts`) drops default-equal values only at the organization level. At billing-entity, building, tenant and lease level, a key that is present is used as set, and a key that is absent follows the level above. Screens show "Use the organization's setting" as the way to clear one.

## D16. Building defaults are copied onto a charge when the lease is saved (2026-10-23)

**Why:** Applying the building's default timing at billing time would re-time charges already being billed. A building switching from advance to arrears would bill a month twice; switching back would skip one. The same reasoning applies to the GST rate and SAC code: an invoice should follow what the lease says, not a setting changed later.
**Consequences:**
- `withBuildingDefaults` (`src/lib/settings/charge-defaults.ts`) fills a new charge's blank timing, GST rate and SAC code from the building's resolved settings. The lease form calls it on save (M3); a charge's own value, including 0%, wins.
- The billing engine keeps `gstRateBp` and `sacCode` required on `Charge` and never falls back to a building default. Changing a building default affects only charges added afterwards; the settings page says so.

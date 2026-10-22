# LeaseDesk (working name)

Commercial lease management for Indian landlords with 20–100 tenants. It replaces the lease Excel sheet, the invoice Word template and the "who hasn't paid" WhatsApp group. Users: building owner, accountant, property manager. Most use a phone (owner) or a laptop (accountant).

The product promise: enter a lease once, and the system bills it correctly every month, forever. Correct money is more important than any feature.

## Where to find things

Read the relevant doc before starting work on an area. Do not load them all at once.

- `docs/PRODUCT_PLAN.md`: what we are building and why (features, v1 vs v2, pricing)
- `docs/ROADMAP.md`: milestones and the current task list. Check it at the start of every session.
- `docs/ARCHITECTURE.md`: stack, folder layout, patterns
- `docs/DATA_MODEL.md`: every table and column
- `docs/BILLING_RULES.md`: exact rules for rent, escalation, pro-rata, GST, TDS, rounding, numbering
- `docs/UX_PRINCIPLES.md`: the simplicity rules and the words we use in the UI
- `docs/DECISIONS.md`: decisions already made, and why. Add a new entry when you make one.

## Stack (fixed; do not swap without asking)

Next.js (App Router) + TypeScript strict, pnpm, Tailwind + shadcn/ui, Supabase (Postgres in Mumbai region, Auth, Storage), Drizzle ORM, Zod, Vitest, Playwright, Inngest (background jobs), React-PDF, Resend (email), SheetJS (Excel).

## Commands

Keep this list in sync with package.json. Node 24 (`.nvmrc`); Next.js 16 changed many APIs, so check `node_modules/next/dist/docs/` before using one you're unsure of (see `AGENTS.md` and D8).

- `pnpm dev`: run the app locally (http://localhost:3000)
- `pnpm build` / `pnpm start`: production build and server
- `pnpm typecheck`: generate route types, then TypeScript check
- `pnpm lint`: ESLint
- `pnpm format` / `pnpm format:check`: Prettier (sorts Tailwind classes)
- `pnpm test`: Vitest unit tests (`pnpm test billing` for the billing engine only; `pnpm test:watch` to watch)
- `pnpm test:e2e`: Playwright end-to-end tests at 375px and 1280px, against a fresh production build on port 3100, so a running `pnpm dev` is never reused (first time: `pnpm exec playwright install chromium`)

Not set up yet (M0 Supabase/Drizzle task):

- `pnpm db:generate`: generate a Drizzle migration from schema changes
- `pnpm db:migrate`: apply migrations (always ask before running against a non-local database)
- `pnpm db:seed`: load demo data (2 buildings, 40 tenants, 45 leases)

## Non-negotiable rules

1. **Money is integer paise** (`bigint` in the database, `number` in TypeScript only when safely below 2^53). Never use floats for money. Percentages are basis points (18% = 1800).
2. **Dates are plain dates** (`YYYY-MM-DD`, Postgres `date`). No time zones in billing. Use the helpers in `src/lib/billing/dates.ts`.
3. **The billing engine is pure.** Everything in `src/lib/billing/` takes plain inputs and returns plain outputs. No database, no network, no `new Date()` inside it.
4. **Billing changes are test-first.** Write or update a failing test in `src/lib/billing/__tests__/` before changing billing code. Use the `billing-engine` skill.
5. **Sent invoices and recorded payments are never edited or deleted.** Corrections are credit notes or reversal entries.
6. **Every table has `organization_id`** and row-level security. Every query is scoped to the current organization. Use the `db-change` skill for schema work.
7. **Every change is logged** in `activity_log` (who, what, before, after). This is done in the data layer, not in screens.
8. **Indian formats in the UI:** ₹ with lakh/crore grouping (₹12,34,567), DD-MM-YYYY, April–March financial year. Use `src/lib/format.ts`.
9. **Simplicity rules apply to every screen.** Use the `build-screen` skill for any UI work.
10. **Tax rules are not guesses.** If a GST or TDS behaviour isn't in `docs/BILLING_RULES.md`, stop and ask rather than inventing it. Flag anything that should be confirmed with a CA.

## How to work

- Start each session by reading `docs/ROADMAP.md` and saying which task you'll do.
- For anything more than a small fix, propose a short plan (files to touch, tests to add) and wait for approval.
- Keep changes small: one task, one commit. Commit messages: `area: what changed` (e.g. `billing: pro-rata for mid-month escalation`).
- Ask before adding any new dependency.
- When you finish a task: run `/ship-check`, tick it off in `docs/ROADMAP.md`, and update any doc whose facts changed.
- Never commit secrets. Environment variables are listed in `.env.example`; real values live in `.env.local`, which you must not read.
- If a request conflicts with these rules or the docs, say so before acting.

## Out of scope for v1

Tenant portal, online payment links, full two-way Tally sync, maintenance tickets, CAM reconciliation, approvals, multi-organization accounts, native mobile app. If asked to build one of these, confirm first that the plan has changed.

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
- `docs/AUTONOMY.md`: the decision policy for working without the founder, and how to add a setting
- `docs/SETTINGS.md`: every setting, its default and where it lives in code
- `docs/DECISIONS_NEEDED.md`: the founder's inbox: open questions, CA checks and human tasks
- `docs/BACKLOG.md`: review findings left for later
- `docs/DEMO_SCRIPT.md`: the 10-minute landlord demo on the demo data, with the exact clicks
- `docs/milestones/`: a plain-language report per finished milestone
- `PIPELINE.md`: how the autonomous build pipeline (`scripts/pipeline.mjs`) runs

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
- `pnpm walkthrough`: reset the demo, then click through a month's work on the dev server (starts `pnpm dev` if needed), saving numbered screenshots and videos in `docs/walkthrough/`
- `pnpm test:e2e`: Playwright end-to-end tests at 375px and 1280px, against a fresh production build on port 3100, so a running `pnpm dev` is never reused (first time: `pnpm exec playwright install chromium`)

Database (local Supabase via `supabase start`; needs Docker running):

- `pnpm db:generate`: generate a Drizzle migration in `drizzle/` from schema changes in `src/lib/db/schema/`
- `pnpm db:migrate`: apply migrations (refuses non-local databases unless `ALLOW_REMOTE_DB=yes`; always ask before using that)
- `pnpm db:seed`: load demo data (2 buildings, 40 tenants, 45 leases; same remote-database guard)
- `pnpm db:seed:demo`: reset and load the "Sharma Estates" demo (2 buildings, 45 tenants, invoice and payment history up to this month, sent on its 1st) and print the login `demo@sharma-estates.example` with a new password, plus the payment to record and the bank statement to import (`.local-demo/hdfc-statement.csv`) in `docs/DEMO_SCRIPT.md`; local database only
- `pnpm db:reset`: wipe the local database, then migrate and seed

Background jobs: `pnpm jobs:dev` runs Inngest's local dev server against `pnpm dev` (http://localhost:8288), where the daily billing run can be triggered by hand.

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
10. **Tax rules are not guesses.** If a GST or TDS behaviour isn't in `docs/BILLING_RULES.md`, implement the most conservative reading, write it into `docs/BILLING_RULES.md` marked **[CA]**, and log a `ca` entry in `docs/DECISIONS_NEEDED.md` rather than stopping.
11. **Settings over questions.** When landlords could reasonably want different behaviour, build it as a setting with a safe default (`docs/AUTONOMY.md`, `docs/SETTINGS.md`). Never stop to ask; log real decisions in `docs/DECISIONS_NEEDED.md` and keep going.

## How to work

- Start each session by reading `docs/ROADMAP.md` and saying which task you'll do.
- For anything more than a small fix: in interactive sessions, propose a short plan (files to touch, tests to add) and wait for approval; in pipeline runs, don't wait, and put a one-line plan in each commit message.
- Keep changes small: one task, one commit. Commit messages: `area: what changed` (e.g. `billing: pro-rata for mid-month escalation`).
- Only install packages listed in `.claude/approved-packages.txt`; anything else becomes a `package` entry in `docs/DECISIONS_NEEDED.md`. Don't edit that list, `.claude/settings.json`, `.claude/hooks/` or `scripts/pipeline.mjs`.
- When you finish a task: run `/ship-check`, tick it off in `docs/ROADMAP.md`, and update any doc whose facts changed.
- Never commit secrets. Environment variables are listed in `.env.example`; real values live in `.env.local`, which you must not read.
- If a request conflicts with these rules or the docs, say so before acting.

## Out of scope for v1

Tenant portal, online payment links, full two-way Tally sync, maintenance tickets, CAM reconciliation, approvals, multi-organization accounts, native mobile app. If asked to build one of these, confirm first that the plan has changed.

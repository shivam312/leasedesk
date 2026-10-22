---
name: db-change
description: Use when adding or changing database tables, columns, enums, indexes, row-level security policies, migrations or seed data.
argument-hint: [what to change]
---

# Changing the database

Read `docs/DATA_MODEL.md` first. The schema there is the plan; keep it and the code in sync.

## Steps

1. **Update `docs/DATA_MODEL.md`** with the change and why, if it isn't already there.
2. **Edit the Drizzle schema** in `src/lib/db/schema/`. Follow the conventions below.
3. **Generate the migration:** `pnpm db:generate`. Read the generated SQL and check it does only what you expect.
4. **Add row-level security** for any new table in the same migration (or a follow-up SQL migration): members of the organization can select; writes follow role rules.
5. **Apply locally:** `pnpm db:migrate`. Never run migrations against staging or production without asking.
6. **Update seed data** in `scripts/seed.ts` so the demo organization exercises the new columns.
7. **Add a test** that a user in organization A cannot read or write organization B's rows in the new table.
8. **Run** `pnpm typecheck` and `pnpm test`.

## Conventions

- Every table: `id uuid primary key default gen_random_uuid()`, `organization_id uuid not null` (except `organizations`), `created_at`, `updated_at timestamptz`.
- Money: `bigint` paise, column names end in `_amount` or `_total` or describe the amount (`deposit_amount`, `grand_total`).
- Percentages: `integer` basis points, names end in `_bp`.
- Areas: `integer` hundredths of a sq ft.
- Business dates: `date`, not `timestamptz`.
- Statuses: Postgres enums, lowercase snake_case values.
- Foreign keys always declared; `on delete restrict` by default. Nothing financial cascades.
- Index `organization_id` plus the columns used for lookups.

## Never

- Edit a migration that has already been applied anywhere except your own machine.
- Delete or update rows in `activity_log`, sent `invoices`, `invoice_lines`, `credit_notes` or `payments` from application code.
- Store money as `numeric` floats or `real`.
- Drop a column in the same release that stops writing to it; do it in a later migration.

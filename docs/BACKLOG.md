# Backlog

Improvements found during reviews that weren't urgent enough to fix in the milestone. Newest first. When one is fixed, delete it and mention it in the commit message.

| Added | Area | File | Problem | Suggested fix |
| --- | --- | --- | --- | --- |
| 2026-10-23 | db | `scripts/migrate.ts`, `scripts/seed.ts` | `pnpm db:migrate` and `db:seed` weren't run against the local stack in the M0 pipeline session: running them needed a permission approval nobody was there to give. Typecheck, the URL-guard unit tests and `db:generate` passed. | With `supabase start` running, run `pnpm db:migrate`, `pnpm db:seed` and `pnpm db:reset` once at the start of M2's first schema task. |

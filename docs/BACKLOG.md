# Backlog

Improvements found during reviews that weren't urgent enough to fix in the milestone. Newest first. When one is fixed, delete it and mention it in the commit message.

| Added | Area | File | Problem | Suggested fix |
| --- | --- | --- | --- | --- |
| 2026-10-23 | db | `drizzle.config.ts` | The remote-database guard (`assertLocalDatabase`) only covers `db:migrate` and `db:seed`. Running `drizzle-kit push`, `migrate` or `studio` directly uses `DATABASE_URL` with no check, so a remote URL in `.env.local` would be changed without asking. `db:generate` doesn't connect, so it must keep working with a remote URL. | Leave `dbCredentials` as is for `generate`. Add a guard: when `process.argv` includes `push`, `migrate` or `studio`, call `assertLocalDatabase(databaseUrl())`. Test it through a small exported helper. |
| 2026-10-23 | db | `scripts/migrate.ts`, `scripts/seed.ts` | `pnpm db:migrate` and `db:seed` weren't run against the local stack in the M0 pipeline session: running them needed a permission approval nobody was there to give. Typecheck, the URL-guard unit tests and `db:generate` passed. | With `supabase start` running, run `pnpm db:migrate`, `pnpm db:seed` and `pnpm db:reset` once at the start of M2's first schema task. |

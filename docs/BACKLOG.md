# Backlog

Improvements found during reviews that weren't urgent enough to fix in the milestone. Newest first. When one is fixed, delete it and mention it in the commit message.

| Added | Area | File | Problem | Suggested fix |
| --- | --- | --- | --- | --- |
| 2026-10-23 | setup | `package.json` | `engines.node` says `>=22` and `@types/node` is `^22`, but `.nvmrc`, the README and D8 say Node 24. Nothing breaks today, but Node 22 installs aren't warned about and Node 24 types aren't available. | Set `engines.node` to `>=24` and `@types/node` to `^24` (already approved), then run `/ship-check`. |
| 2026-10-23 | db | `drizzle.config.ts` | The remote-database guard (`assertLocalDatabase`) only covers `db:migrate` and `db:seed`. Running `drizzle-kit push`, `migrate` or `studio` directly uses `DATABASE_URL` with no check, so a remote URL in `.env.local` would be changed without asking. `db:generate` doesn't connect, so it must keep working with a remote URL. | Leave `dbCredentials` as is for `generate`. Add a guard: when `process.argv` includes `push`, `migrate` or `studio`, call `assertLocalDatabase(databaseUrl())`. Test it through a small exported helper. |

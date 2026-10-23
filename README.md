# LeaseDesk (working name)

Commercial lease management for Indian landlords: leases, rent increases, GST invoices, payments with TDS, and reports, in one simple app.

- New here? Read `SETUP.md`.
- What we're building: `docs/PRODUCT_PLAN.md`
- What's next: `docs/ROADMAP.md`
- Instructions for Claude Code: `CLAUDE.md`

## Local development

You need Node.js 24 and pnpm (see `SETUP.md`).

```bash
nvm use                                 # picks Node 24 from .nvmrc
pnpm install
pnpm exec playwright install chromium   # once, for end-to-end tests
cp .env.example .env.local              # optional locally; the database defaults to the local Supabase
pnpm dev                                # http://localhost:3000
```

If `nvm use` complains about the npm `prefix` option (common with Homebrew installs), run `npm config delete prefix` once, then try again.

### Checks

```bash
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test        # unit tests (Vitest)
pnpm test:e2e    # end-to-end tests (Playwright), phone and laptop widths
```

Run `/ship-check` in Claude Code to run all of them in order before committing.

### Database

You need Docker Desktop (running) and the Supabase CLI (`brew install supabase/tap/supabase`).

```bash
supabase start      # local Postgres, Auth and Storage; prints the URLs and keys
pnpm db:migrate     # apply the migrations in drizzle/
pnpm db:seed        # load the demo organization (2 buildings, 40 tenants, 45 leases)
supabase stop       # when you're done
```

- The app connects to `DATABASE_URL`, or to the local database (`postgresql://postgres:postgres@127.0.0.1:54322/postgres`) when it isn't set.
- After changing the schema in `src/lib/db/schema/`, run `pnpm db:generate` and read the new SQL in `drizzle/`.
- `pnpm db:reset` wipes the local database and runs migrate and seed again.
- Studio (a table browser) is at http://127.0.0.1:54323.
- To try the app, open http://localhost:3000 and create an account. The seeded demo organization has no login yet.
- `db:migrate` and `db:seed` refuse to run against a database that isn't on your machine. To do it on purpose, prefix the command with `ALLOW_REMOTE_DB=yes`.
- Database tests (`*.db.test.ts`) run against the local stack, so apply the migrations first (`pnpm db:migrate`); a missing table makes them fail. `SKIP_DB_TESTS=1` skips them all.
- If `pnpm` says it's version 8, a Homebrew pnpm is ahead of the project's one on your `PATH`. Run `brew uninstall pnpm`, or `corepack enable`.

### Email and background jobs

- Without `RESEND_API_KEY` and `EMAIL_FROM` in `.env.local`, every email (invoices, credit notes) is written to `.local-outbox/` instead of being sent: the message and its PDF attachments.
- `pnpm jobs:dev` runs Inngest's local dev server against `pnpm dev` (http://localhost:8288). The daily billing run (`monthlyBilling`) can be triggered by hand there; the Billing page's "Make invoices" button does the same work without it.

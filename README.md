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
pnpm db:seed        # load the development data (2 buildings, 40 tenants, 45 leases; no login)
supabase stop       # when you're done
```

- The app connects to `DATABASE_URL`, or to the local database (`postgresql://postgres:postgres@127.0.0.1:54322/postgres`) when it isn't set.
- After changing the schema in `src/lib/db/schema/`, run `pnpm db:generate` and read the new SQL in `drizzle/`.
- `pnpm db:reset` wipes the local database and runs migrate and seed again.
- Studio (a table browser) is at http://127.0.0.1:54323.
- To try the app, open http://localhost:3000 and create an account, or load the demo below and log in as its owner.
- `db:migrate` and `db:seed` refuse to run against a database that isn't on your machine. To do it on purpose, prefix the command with `ALLOW_REMOTE_DB=yes`.
- Database tests (`*.db.test.ts`) run against the local stack, so apply the migrations first (`pnpm db:migrate`); a missing table makes them fail. `SKIP_DB_TESTS=1` skips them all.
- If `pnpm` says it's version 8, a Homebrew pnpm is ahead of the project's one on your `PATH`. Run `brew uninstall pnpm`, or `corepack enable`.

### Demo and walkthrough

- `pnpm db:seed:demo` resets and loads "Sharma Estates" (2 buildings, 45 tenants, three months of sent invoices and payments, this month sent on its 1st with some payments in) and prints the login `demo@sharma-estates.example` with a new password, the payment to record by hand, and the bank statement to import (`.local-demo/hdfc-statement.csv`). Local database only. The 10-minute landlord demo on it is `docs/DEMO_SCRIPT.md`; run the demo on a production build (`pnpm build && EMAIL_DRIVER=console pnpm start`), not `pnpm dev`.
- `pnpm walkthrough` reseeds the demo and clicks through a month on the dev server (it starts `pnpm dev` if needed), saving numbered screenshots in `docs/walkthrough/screens/`, videos in `docs/walkthrough/videos/` (not in git), and `docs/walkthrough/index.html` with a caption per screenshot. The same script runs inside `pnpm test:e2e` as a test of the amounts on screen (D43, D44).

### Email and background jobs

- Without `RESEND_API_KEY` and `EMAIL_FROM` in `.env.local`, every email (invoices, credit notes, payment reminders, the daily digest) is written to `.local-outbox/` instead of being sent: the message and its PDF attachments. That happens only outside production (`pnpm dev`) or with `EMAIL_DRIVER=console`; a production server (`pnpm start`) without a key refuses to send and keeps invoices as drafts (D48).
- `pnpm jobs:dev` runs Inngest's local dev server against `pnpm dev` (http://localhost:8288). The daily billing run (`monthlyBilling`) can be triggered by hand there; the Billing page's "Make invoices" button does the same work without it. The daily payment reminders (`dailyReminders`, 09:00 India time) and the daily digest to the team (`dailyDigest`, 08:00 India time) can be triggered there too. The digest links to Today only when `APP_URL` is set.

### Reports, exports and import

- Reports (`/reports`) open in the app and download as Excel or PDF, with nothing to set up. The Tally export (Reports → Tally export) needs no Tally installation to make the file; ledger names are on Settings → Tally.
- To load buildings, units, tenants and leases from a spreadsheet, use Leases → Import from Excel and start from its templates. Import files are limited to 2 MB. A building page also takes units pasted from Excel.
- Documents (the signed agreement, addenda, ID proof) are uploaded on the lease and tenant pages, straight to Supabase Storage, up to 25 MB; TDS certificates (Billing → TDS certificates) up to 3 MB (D52).

### Error reporting and password reset

- Errors are reported to Sentry only when `SENTRY_DSN` (server) and `NEXT_PUBLIC_SENTRY_DSN` (browser) are set; without them nothing is sent and errors are only logged. Reports carry record ids, never tenant names or amounts (D41 in `docs/DECISIONS.md`).
- "Log in with Google" appears on the login page only when the Supabase project's Google provider is turned on (a human task); nothing to configure in the app.
- "Forgot your password?" on the login page emails a reset link. Locally the email lands in Mailpit (http://127.0.0.1:54324, part of `supabase start`). Reset links use `APP_URL`; without it they work only on this computer (localhost), and a deployed app doesn't send them. A cloud Supabase project needs its Site URL and `<APP_URL>/auth/confirm` in its redirect URLs (D42).

### Deploying and CI

- `docs/DEPLOY.md` is the runbook for the first deploy (Vercel, Supabase in Mumbai, Inngest, Resend, Sentry), releases and rollback, migrations against the cloud database, environment variables, Inngest sync, Storage policies, backups and the restore drill. Every step is done by a person.
- `.github/workflows/ci.yml` runs typecheck, lint, formatting, the unit and database tests (on a local Supabase stack) and the browser tests on every push to `main` and every pull request, with no secrets. It runs once the repository is on GitHub (D-032).
- Every daily job records its run; Today and Settings warn "Automatic billing hasn't run since …" with "Run now" when it is more than a day late.

# Deploying LeaseDesk

How to put LeaseDesk on the internet, update it, roll it back and restore its database. Every step here is done by a person: creating accounts, adding keys, and touching the cloud database are human tasks (`docs/DECISIONS_NEEDED.md`, Human tasks). Claude never runs them.

The setup: **Vercel** runs the Next.js app, **Supabase** (Mumbai region, `ap-south-1`) holds the database, logins and files, **Inngest** runs the daily jobs, **Resend** sends email and **Sentry** collects errors. Keep two of everything: **staging** (for checking a release) and **production** (landlords' real data).

## 1. Before the first deploy (once)

1. Create the accounts: Vercel, Supabase, Inngest, Resend, Sentry (EU data region, D41). Turn on two-factor login for each.
2. **Supabase:** create two projects, `leasedesk-staging` and `leasedesk-production`, both in **Mumbai**. On production, choose a plan with daily backups and point-in-time recovery (section 6).
3. **Supabase Auth** (each project, Auth → URL configuration): Site URL = the app's address (e.g. `https://app.yourdomain.in`); add `<APP_URL>/auth/confirm` to the redirect URLs, so password reset links work (D42). Turn **on** "Confirm email" for sign-ups.
4. **Resend:** verify the sending domain (SPF and DKIM records at your domain registrar) and create an API key per environment.
5. **Inngest:** create the app, and one environment per Vercel environment (or use the Vercel integration, which does this).
6. **GitHub:** put the repository on GitHub (private) so CI runs (`.github/workflows/ci.yml`, D-032), and connect it to a Vercel project.

## 2. Environment variables (Vercel → Project → Settings → Environment Variables)

Set each for **Production** and **Preview** (staging) separately. Never put production keys in Preview. The names are the ones in `.env.example`.

| Variable | What it is | Where it comes from |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | The Supabase project's URL | Supabase → Project settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | The public (anon) key | same place |
| `DATABASE_URL` | Postgres connection string for the app's server code. Use the **pooler** (transaction mode, port 6543) | Supabase → Connect |
| `APP_URL` | The app's own address, e.g. `https://app.yourdomain.in` (links in emails, reset links) | your domain |
| `RESEND_API_KEY` | Sends email. **Without it, production refuses to send** and invoices stay drafts (D48) | Resend |
| `EMAIL_FROM` | The verified sender, e.g. `Invoices <invoices@yourdomain.in>` | Resend |
| `INNGEST_SIGNING_KEY` | Lets Inngest call the app's job endpoint | Inngest (set by the Vercel integration) |
| `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN` | Error reporting; nothing is sent when blank | Sentry |
| `SENTRY_ENVIRONMENT`, `NEXT_PUBLIC_SENTRY_ENVIRONMENT` | `production` or `staging` | you |

Never set `EMAIL_DRIVER=console` on staging or production: it writes emails to the server's disk instead of sending them. Never set `ALLOW_REMOTE_DB` in Vercel; it is only for running migrations by hand (section 3).

## 3. Migrations against a cloud database

The database scripts refuse any database that isn't the local one unless you say otherwise (`scripts/db-env.ts`). For a cloud database, from your own laptop:

1. Check out exactly the commit you are deploying, and run `pnpm install`.
2. Take a backup first (Supabase → Database → Backups, or `pg_dump`, section 6). Write down the time.
3. Point at the cloud database for this one command only, using the **direct** connection string (port 5432), not the pooler:
   ```sh
   DATABASE_URL='postgresql://postgres:…@db.<project>.supabase.co:5432/postgres' ALLOW_REMOTE_DB=yes pnpm db:migrate
   ```
   It prints `Migrations applied to the REMOTE database.`
4. Never run `pnpm db:seed`, `pnpm db:seed:demo` or `pnpm db:reset` against a cloud database. The demo seed refuses anyway.
5. Do staging first, check the app there, then production.

Migrations only add things (D12): a column the old code doesn't know is ignored, so apply migrations **before** deploying the code that uses them. Never edit a migration that has run on staging or production; write a new one.

The Storage bucket `documents` (lease agreements, TDS certificates) and its access policies are created by the migrations (`drizzle/0019`–`0020`): files are private, one folder per organization, members read, owners/accounts/property managers upload, owners delete. After the first migration, check in Supabase → Storage that `documents` exists and is **not** public.

## 4. First deploy

1. Section 1 and 2 done; migrations applied to staging (section 3).
2. In Vercel, deploy the `main` branch to Preview (staging). Wait for the build.
3. **Inngest sync:** in Inngest, sync the app at `<APP_URL>/api/inngest` (the Vercel integration does this on each deploy). Check that the three functions appear: `monthly-billing-run` (06:00), `daily-digest` (08:00) and `daily-payment-reminders` (09:00), all India time.
4. Smoke test on staging: sign up, add a GSTIN, a building, a unit, a tenant with your own email and a lease; on Billing make this month's invoices and send one; check the email and PDF arrive; record a payment; download the Tally file. In Settings → Business, Email must say it sends from your `EMAIL_FROM`, not "Test mode" or "Not set up".
5. The next morning, check Today shows no "Automatic billing hasn't run since …" warning and that Inngest shows the 06:00 run.
6. Repeat 1–4 for production (migrations, then promote the deployment). Point your domain at Vercel.

## 5. Each release, and rolling back

**Release:** CI green on `main` → apply new migrations to staging → deploy to staging → smoke test (section 4, step 4) → apply migrations to production → promote the same deployment to production → check Sentry for new errors in the first hour.

**Roll back the code:** Vercel → Deployments → the last good production deployment → "Promote to Production" (instant). Because migrations only add, the older code runs on the newer database. Then re-sync Inngest (section 4, step 3) so the jobs match the code.

**Roll back data:** don't, unless something has written wrong data. Sent invoices and payments are never edited (CLAUDE.md, rule 5): fix wrong money with credit notes and reversals in the app. Restoring the database (section 6) throws away everything since the backup, including real payments recorded meanwhile; only do it for a disaster, and tell users what was lost.

## 6. Backups and the restore drill

Supabase takes daily backups on paid plans; point-in-time recovery (PITR) lets you restore to any minute. Turn on PITR for production.

**Restore drill, once before the first pilot and then every three months** (on staging, never on production):
1. Note an invoice number and a payment on staging.
2. Take a manual backup, or note the time for PITR.
3. Make a change you can see (send an invoice, record a payment).
4. Restore staging to the backup (Supabase → Database → Backups → Restore, or PITR to the noted time). It takes a few minutes and the app is down meanwhile.
5. Check the change from step 3 is gone and the step 1 records are there; log in; open a PDF from Storage (files aren't in database backups; check they still open).
6. Write down how long it took and anything that went wrong at the bottom of this file.

Off-site copy: once a week, `pg_dump` production with the direct connection string to an encrypted file kept outside Supabase (e.g. the founder's encrypted drive). Storage files need their own copy (Supabase Storage → download, or its S3 protocol).

## 7. When something goes wrong

- **"Automatic billing hasn't run since …" on Today:** Inngest isn't calling the app. Check the app is synced in Inngest (section 4, step 3) and `INNGEST_SIGNING_KEY` is set; press "Run now" to catch up for that organization meanwhile.
- **"Email isn't set up yet":** `RESEND_API_KEY` or `EMAIL_FROM` is missing in that Vercel environment. Add it and redeploy.
- **Errors in Sentry:** reports carry ids, not names or amounts (D41). Look the id up in the app.

## Restore drill log

| Date | Environment | Took | Notes |
| --- | --- | --- | --- |

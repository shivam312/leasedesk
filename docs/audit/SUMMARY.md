# Audit summary for the founder (2026-10-24)

Two reviewers, Codex and Claude (Opus), each audited every milestone, wrote a gap analysis, and rebutted each other. This is the final ruling. Rulings on each disputed item are in `RULINGS.md`; the work is in `docs/ROADMAP.md` under M9.

## Verdict

**Demo-ready, nearly; not pilot-ready.** The engine is right: every amount both reviewers checked by hand (rent per sq ft, pro-rata, increases, GST split and round-off, TDS, bank matches less TDS) matches `docs/BILLING_RULES.md`, and 1,004 unit and database tests pass today. A landlord demo would work, but would show a red error badge on every click, a flat schedule with no rent increase, Today opening with "Billed ₹0" late in the month, and overdue invoices labelled "Sent". Those are a day's fixes (the 12 demo blockers in M9). A real landlord's first month would hit four things the product can't yet do: carry in what tenants already owe on day one, refuse to "send" invoices when no email account is configured (today they look sent and go nowhere), produce a Tally file that TallyPrime accepts without the accountant pre-creating every ledger, and correct a tenant's email address or remove a departed team member. There is also no live server, no backups and no CI. Don't put real money through it until the pilot blockers in M9 and the M8 human tasks are done.

## The three most important things to do next

1. **Answer D-028 (opening balances)** so the pipeline can build them. It is the #1 gap on both lists and blocks the "invoices match Excel" gate. The recommendation is A: one opening balance per tenant, shown on the ledger and in ageing, settled like an invoice, never numbered as a GST invoice.
2. **Do the account setup in the M8 human tasks**: Resend (email), Supabase cloud in Mumbai with backups, Vercel, Inngest, Sentry, and a GitHub repository for CI (D-032). The code half of each (fail-closed email, job-health warning, deploy runbook, CI workflow) is in M9 and needs nothing from you.
3. **Book the chartered accountant**, starting with D-012 (e-invoicing over ₹5 crore turnover), which decides which landlords can pilot at all, then the other 16 `ca` entries and `docs/BILLING_RULES.md`.

Close behind: the credit-note form starts every line at the full amount left, so an accountant waiving ₹5,000 who doesn't retype each line issues an irreversible credit note for the whole invoice. It is the first pilot task in M9 and a one-line fix.

## Milestones audited

| Milestone | Codex's verdict (first pass → recheck) | What was fixed today |
| --- | --- | --- |
| M0 Project setup | pass | `package.json` requires Node 24 (was `>=22`). Missing `.env.example` variables stay a human task (unattended runs can't open `.env*`). |
| M1 Billing engine | fail → pass | Two custom rent increases on one charge on the same date are refused (order no longer changes the result); regression test that a rule loop ends for a charge starting after the lease. |
| M2 Data, auth, setup | pass | Nothing; contact edit/remove and tenant bulk actions went to the backlog, and contacts are now a pilot blocker in M9. |
| M3 Leases | fail → pass | A renewal must keep the same building and units; a charge can't end before it starts; a browser test renews a lease and ends the new version early, and found that "Renew" and "Add lease" opened the last saved lease's form. |
| M4 Invoicing | fail → pass | Invoice and credit-note number series are kept per GSTIN, not per billing entity (`drizzle/0027`), so two entities sharing a GSTIN can't repeat a number. |
| M5 Payments and TDS | pass | The TDS browser test now uploads a certificate and sees the quarter received. |
| M5A Demo data and walkthrough | pass (should-fixes only) | The walkthrough checks CGST and SGST on their own labelled rows; earlier today the seed went to integer-paise deposits and organization-scoped unit queries. Certificate files left in Storage on reseeding stay in the backlog; Today's 40-card list is a demo blocker in M9. |
| M6 Today and alerts | fail → pass | Today's unpaid and overdue totals refuse sums past the safe integer range; the browser test checks "N bank lines to match" and "N TDS certificates missing" and their links. The failed-digest retry stays in the backlog (low). |
| M7 Reports, exports, import | fail → pass | Excel number cells keep every decimal typed, so an amount or area with more than two decimals is refused instead of silently rounded. |
| M8 Pilot readiness | fail → pass | Codex's must-fix (import shows 50 errors) was wrong: the screen shows 10 and folds the rest. Database tests skip only on `SKIP_DB_TESTS=1`. Earlier today: reset links take their address from `APP_URL` only. |

Codex's final verdict on the whole product was **fail** (not pilot-ready), for the same reasons as above; the judge agrees with that conclusion and with Claude's "demo-ready after a day's fixes".

## The debate's main disagreements, and the rulings

- **"Test status is unconfirmed" (Codex).** Claude was right: the failures were Codex's read-only sandbox refusing to create a temp directory. The judge ran `pnpm typecheck` and `pnpm test` today; the result is at the end of this page. Dropped; the real gap is no CI, which is an M9 task.
- **Google login, pasting units from Excel, global search (Claude says v1, Codex says not promised).** Claude was right: all three are in `docs/PRODUCT_PLAN.md` under v1. Codex was right on priority. They are the last tasks in M9, and D-033 asks whether they wait for v2.
- **Team management (Codex: one must-fix).** Split as Claude proposed: removing a member and cancelling an invite are pilot blockers (a departed accountant keeps access); copying an invite link again is convenience.
- **Tally (Codex: wait for a real TallyPrime file).** Claude was right that half of it is visible now: the export writes no ledger masters, so TallyPrime rejects it unless every ledger already exists. Writing the masters is an M9 task; testing with a real Tally stays human.
- **Stored invoice PDFs (Codex: should-fix).** Claude was right that D25 makes this low: every field is frozen at sending, so only layout can drift. Kept, last pilot task, to be done before the first PDF layout change.
- **Row-level security not forced (Claude).** Codex was right: forcing it wouldn't bind the roles the jobs use. Kept as an audit of the five files that bypass scoping, with isolation tests.
- **Overdue invoices read "Sent".** Both reviewers blamed the reminder job; in fact nothing sets `overdue` at all. Ruling: derive the label from the due date in one shared helper. Demo blocker.
- **Stray root files, the backlog's size, the `cacheComponents` forecast, the support contact.** Dropped as gaps (housekeeping, resolved by this audit, unproven, and a pending decision D-029 respectively).

## Counts

- **M9 tasks:** 46. 12 demo blockers, 20 pilot blockers (3 of them blocked on D-028), 14 in "the rest". 18 backlog rows moved into M9 and were deleted from `docs/BACKLOG.md`.
- **New decisions:** 2 (D-032 CI on GitHub Actions, spend; D-033 which unkept v1 promises wait, product). 3 existing entries updated: D-028 is now blocking M9, D-012 is marked first for the CA, D-029 is marked as needed before an external pilot. 1 new human task: create a GitHub repository and push.
- **Current milestone** in `docs/ROADMAP.md`: M9. M8 stays open on its human tasks.

## Checks run by the judge

- `pnpm typecheck`: passed (route types generated, no TypeScript errors).
- `pnpm test`: 119 files, 1,004 tests passed, against the local database.
- `pnpm test:e2e` was not run in this stage; the M8 wrap-up recorded 50 browser tests passing earlier today.

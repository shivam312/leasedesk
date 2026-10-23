# Gap analysis (Codex)

**Verdict:** fail

The app is close to a convincing local demo: the walkthrough, seeded data, core billing flow, reports, and most v1 screens are implemented, but Today can overwhelm the demo with 40+ unpaid cards. It is not ready for a paid pilot: the roadmap still has deployment and backup work outstanding, key real-world checks are unfinished, and the backlog identifies tenant-contact and team-management gaps that can disrupt a landlord’s first week. Prioritize a backed-up staging deployment, complete real-data and accountant validation (including Tally and CA review), and close the contact/team and opening-balance gaps. I could not run `pnpm test` or `pnpm test:e2e` under the read-only filesystem restriction; the latest M8 re-check records an earlier test attempt blocked by temporary-directory permissions.

## Must fix (6)

- **docs/ROADMAP.md (M8 human tasks)**: There is no production-like, backed-up pilot environment yet, and real outbound email, error reporting, and scheduled jobs are not configured. A real landlord could lack reliable billing, reminders, account recovery, and a recovery path after data loss.
  - Evidence: M8 remains open for Sentry, Supabase cloud in Mumbai, Vercel and Inngest accounts, staging setup, and database backups. M4/M6 also leave Resend and `APP_URL` configuration as human tasks; M8 notes reset emails do not work without `APP_URL`.
  - Fix: Provision staging and production integrations, configure verified email sending and `APP_URL`, enable and test database backups and restore, and run a billing/reminder cycle in staging before onboarding a pilot.
- **src/server/actions/tenants.ts; src/app/(app)/tenants/[id]/page.tsx**: Tenant contacts cannot be edited, removed, or selected as the invoice recipient. A mistyped or departed contact can leave invoices and reminders going to the wrong person with no in-product correction.
  - Evidence: The M8 backlog explicitly identifies `addContact` as the only contact action and labels this a must-fix before a pilot; tenant invoices and reminders depend on contact email.
  - Fix: Implement permission-checked, logged contact update/removal and primary-recipient actions, including a safe rule for the last usable email; cover database behavior and the browser flow.
- **src/server/actions/team.ts; src/app/(app)/settings/team/page.tsx**: Owners cannot remove a team member or cancel a pending invite, and an invite link cannot be retrieved after its initial display. This prevents routine access cleanup and recovery from lost invites during a pilot.
  - Evidence: The M8 backlog marks these as must-fixes before a pilot and describes the missing actions on invited and active member rows.
  - Fix: Add owner-only cancel-invite and remove-member actions with confirmation, activity logging, and a copy/reissue invite flow; verify permission enforcement and that existing records remain intact.
- **src/lib/exports/tally.ts; docs/ROADMAP.md (M7 human task); docs/DECISIONS_NEEDED.md (D-027)**: Tally export has not been checked against a real TallyPrime import or the pilot accountant’s ledger setup. A syntactically valid XML export can still fail to import or post receipts, TDS, credit notes, and reversals to the intended ledgers.
  - Evidence: M7 leaves a human task to obtain a sample TallyPrime export, and D-027 says the voucher treatment is an assumption pending accountant confirmation. The re-check verifies unit/database tests but explicitly says real TallyPrime compatibility is unverified.
  - Fix: Obtain a sanitized real TallyPrime sample and the accountant’s ledger conventions; import representative sales, receipts with TDS, credit notes, and reversals into a test company, reconcile voucher totals, then document and test the agreed mapping.
- **docs/ROADMAP.md (M8 human tasks); docs/DECISIONS_NEEDED.md (CA entries)**: Indian tax and accounting rules used for billing and reports have not had the planned chartered-accountant review. Incorrect tax assumptions could make invoices or GST/TDS summaries unsuitable for a real billing run.
  - Evidence: M8 explicitly leaves the CA review of `docs/BILLING_RULES.md` and open `ca` decisions outstanding; D-021 and D-026–D-027 include assumptions about certificate naming/dates, GST reporting period, and Tally treatment.
  - Fix: Have a chartered accountant review the billing rules and each open CA decision, record the accepted treatment, and update tax labels, calculations, reports, and regression coverage where needed before the first customer billing run.
- **src/lib/imports/*; docs/DECISIONS_NEEDED.md (D-028)**: Import does not bring forward existing tenant receivables. A landlord moving from Excel/Tally will start with zero ledger balances for old dues, so outstanding, ageing, reminders, and payment allocation will not represent the real position during the first pilot month.
  - Evidence: D-028 states that import covers buildings, units, tenants, and leases but not prior unpaid invoices or opening balances; its decision remains unanswered, and the tenant ledger starts at zero.
  - Fix: Agree the opening-balance representation with the pilot accountant and implement an importable, auditable brought-forward balance that appears in ledger and ageing and can be settled without creating a duplicate GST invoice.

## Should fix (7)

- **src/lib/alerts/attention.ts; src/app/(app)/today/page.tsx**: Today shows every unpaid tenant as a separate attention card, making the main screen excessively long and cluttering the demo’s first impression.
  - Evidence: The M5A walkthrough review recorded 40+ cards and a roughly 13,000px phone page after monthly invoices were sent; the backlog repeats this against the UX rule for lists over 20 rows.
  - Fix: Show a small prioritized set of overdue items with a total and a clear link to the full ageing/unpaid list, or summarize a broadly unpaid month into one actionable item.
- **src/components/invoices/InvoiceList.tsx; src/app/(app)/billing/page.tsx**: The monthly invoice list has no search, status filter, or selection, so finding an invoice or excluding one tenant from a bulk send is cumbersome at the product’s target size.
  - Evidence: The M8 backlog calls out this gap for 40–100 invoices and recommends search, status chips, and selected sends; this conflicts with the plan’s bulk-by-default rule.
  - Fix: Add tenant/building search, status filters, and row selection with a clearly labeled “Send selected” action; keep invoice numbers visible on phone cards.
- **src/lib/invoices/send.ts**: Sent invoice PDFs are regenerated from stored invoice data rather than retained as the exact document that was sent. A later layout or rendering change can make a downloaded historical invoice differ from the version the tenant received.
  - Evidence: The backlog notes that sent PDFs have an empty `pdf_path` and are rendered again from frozen copies; freezing invoice fields does not freeze the rendered artifact.
  - Fix: Store the generated PDF when sending, persist its path, and serve that immutable artifact for later downloads; include an upgrade/backfill policy for existing invoices.
- **docs/ROADMAP.md (M5/M7 human tasks); tests/fixtures/bank/synthetic**: Bank matching is covered with synthetic fixtures, but has not been validated against real statement exports from the banks the pilots use. Column formats and narration differences can reduce matching quality or cause import friction.
  - Evidence: M5 still lists obtaining sanitized real bank statement exports as a human task; the checked-in fixtures are explicitly synthetic, and the existing tests validate those formats.
  - Fix: Collect sanitized exports for the pilot’s banks, verify date/amount/narration parsing and duplicate handling, and add representative fixtures with row-level error checks.
- **docs/milestones/M8.md; tests/e2e/journey.spec.ts**: The journey test’s report assertions can pass when an expected amount appears somewhere on the page rather than in the correct tenant row and report column, leaving a gap in end-to-end report validation.
  - Evidence: The M8 backlog explicitly records that the test matches bare amounts anywhere on the page and recommends scoping assertions to row and column.
  - Fix: Assert each key value within its tenant row and the intended column header, especially for ageing, collections, GST, and TDS reports.
- **src/lib/alerts/digest-run.ts**: A transient daily digest delivery failure can permanently suppress that user’s digest for the day.
  - Evidence: The M6 re-check describes the unique organization/user/day claim: failed sends are recorded and later runs skip the existing claim; the behavior is also tracked in the backlog.
  - Fix: Allow safe retry of failed or stale claims with provider idempotency protection, and surface repeated failures in monitoring.
- **docs/ROADMAP.md; docs/audit/M8-codex-recheck.md**: Current verification is not reproducible in this audit environment, so the present test status remains unconfirmed here.
  - Evidence: The read-only workspace prevents test commands that write temp files or build output; the latest M8 re-check reports `pnpm test` email-test failures caused by denied `mkdtemp`, while earlier milestone notes report a passing run. No current `pnpm test:e2e` run was performed.
  - Fix: Run both suites in a writable CI or staging environment with the database and browser dependencies configured, record the exact command/results, and resolve any product failures separately from sandbox permission errors.

## Verified by hand

- Lease setup and rent schedule generation are present, including rent-free periods, escalation, pro-rata, and schedule review; pure billing modules have substantial unit coverage.
- Monthly invoice draft generation, send flow, invoice explanation, credit notes, GST fields, numbering, and PDF generation are implemented; historical PDF artifact retention remains a gap.
- Payment recording, allocations, TDS tracking/certificate upload, bank statement import/matching, reminders, WhatsApp reminder links, and tenant ledger are implemented in code and represented in tests.
- Today totals and attention items, daily digest jobs, lease-date alerts, and actions for bank matching and missing TDS are implemented; Today’s unpaid list needs prioritization.
- Buildings/units, stacking plan, tenant pages, roles, organization scoping/RLS, activity logging, and append-only invoice/payment protections are present with database or browser coverage noted in the project audits.
- Rent roll, vacancy, collections/ageing, GST/TDS summaries, expiry reporting, Excel/PDF exports, Tally XML generation, and Excel imports for property and tenancy are implemented; real Tally/accountant compatibility and real-bank validation are outstanding.
- Demo seed and walkthrough, password reset, and error-reporting code are present. The latest M8 audit reports 50 browser tests passed historically, but this audit did not execute tests due to the read-only environment.

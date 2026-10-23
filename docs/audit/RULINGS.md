# Rulings on the audit debate (2026-10-24)

The final judge read both gap analyses (`codex-gaps.md`, `claude-gaps.md`), both rebuttals, and the ten per-milestone audits, then checked each disputed point in the code. One line per ruling: the item, who was right, why. "Kept" means both reviewers agreed and the item goes into M9 of `docs/ROADMAP.md` as written there. "Dropped" means it leaves the list, with the reason.

## Where they disagreed

- **Codex S7, test status unconfirmed:** Claude was right. The failures Codex saw were `EPERM` at `mkdtemp` in its read-only sandbox; `pnpm test` run by the judge today passes (see `SUMMARY.md`). Dropped; the real gap, no CI, is its own task.
- **Codex S3, sent PDFs re-rendered rather than stored:** Claude was right on priority. D25 freezes every field at sending, so only layout can drift; a layout change is a commit we control. Kept, but in the last tier: store the PDF before the first change to the invoice layout.
- **Codex M3, team management:** Claude's split was right. `src/server/actions/team.ts` exports only `invite` and `joinTeam`. Removing a member and cancelling an invite cut off a departed accountant's access, so they are pilot blockers; copying an invite link again is convenience, because inviting again replaces a lost link.
- **Codex M1, no backed-up environment with email, Sentry and jobs:** Claude's split was right. Creating accounts is a human task already in M8; the code half (fail-closed email, a job-health warning, a deploy runbook) is buildable now and is in M9.
- **Codex M4, Tally untested against TallyPrime:** Claude was right that it is narrower. `src/lib/exports/tally.ts` writes 0 `<LEDGER>` masters, which fails on import unless every party ledger already exists with the same name. Writing the masters is a code task now; the real-Tally test stays a human task.
- **Codex M5, CA review:** both agreed; Claude's ordering is adopted. D-012 (e-invoicing over ₹5 crore) goes first because it decides which landlords can pilot at all.
- **Claude 3.5, Google login:** Claude was right on scope. `docs/PRODUCT_PLAN.md` ("Across the app") promises "Email + password and Google login", and the human task to create the OAuth client already exists, yet `grep -ri oauth src` finds nothing. Kept, last tier: build the button so it appears only when the provider is configured.
- **Claude 3.10, paste units from Excel:** Claude was right on scope (plan, "Buildings and units": "Bulk add units by pasting from Excel"), Codex right on priority: the Excel import covers the need. Kept, last.
- **Claude 3.4, global search:** Claude was right that it is in v1 ("Across the app"); Codex's order is adopted: search on long operational lists first, then the header search. Kept.
- **Claude 3.7, bulk actions everywhere:** Codex's narrowing was right. The two that matter are "Send selected" on the invoice list and "Remind all" on Today; multi-select on every list waits for pilot evidence. Kept as two tasks.
- **Claude 4.7, 3 MB upload cap:** Claude's timing was right. `src/lib/files/store.ts:36` is `3 * 1024 * 1024`; a phone scan of a signed lease is usually larger. Raised the day document upload is built, not before.
- **Claude 2.7, credit note lines start at the full remaining amount:** both agreed; Claude's urgency is adopted. `CreditNoteForm.tsx` says "Each line starts with all that is left on it", and a sent credit note can't be undone (rule 5). First pilot task: lines start at ₹0.
- **Claude 6.6, stray root files:** Codex was right; Claude conceded. `PIPELINE OLD.md`, `INSTALL_CODEX.md` and `INSTALL_PROMPT.md` change nothing at runtime. Dropped from M9; tidy them in passing.
- **Claude 4.4, RLS not forced:** Codex was right; Claude conceded. `FORCE ROW LEVEL SECURITY` doesn't bind the roles the jobs use, and the jobs need cross-organization reads. Kept as an audit of every `runAsSystem` and bare `db` call (five files) with isolation tests on job paths.
- **Claude 6.1, `cacheComponents` needs restructuring:** Codex was right that the forecast wasn't shown. Kept only the concrete part (the red badge, Claude 1.1): reproduce the `instant` warning against the installed Next 16 docs, fix it if cheap, and hide the dev overlay for demos.
- **Claude 2.4, one Tally file mixes GSTINs:** Codex's "confirm the accountant's setup first" was right for the voucher mapping; Claude's cheap step is kept: a business filter on the Tally export page (already backlog row "One Tally file covers every GSTIN").
- **Claude 2.5, no sign that background jobs aren't running:** Codex's modify accepted. Kept as a visible "the daily run hasn't happened since …" warning plus the existing "Run now"; the account setup stays human.
- **Claude 2.6, UPI QR limits:** Codex was right that D24's limits are deliberate (UPI's ₹1,00,000 cap; no amount on part-paid). Kept only as wording: the invoice page and the demo script say when the QR has no amount and why.
- **Claude 2.8, tenant statement export:** Codex's order accepted: a printable statement (PDF) first, Excel only if an accountant asks. Kept.
- **Claude 2.9, imports untested on real data:** Codex was right that this waits on pilot files; the M5 human task already covers bank statements. No new task.
- **Claude 2.11, reminder email preview:** Codex's modify accepted; kept, pilot tier, since reminders are on by default (D33).
- **Claude 3.9, "Request from tenant" for TDS certificates:** the plan's rule 8 names this action, so it is in scope; Codex was right that it can wait behind the money items. Kept, last tier.
- **Claude 5.3, 5.4, 5.7 (rent roll on a phone, TDS nesting, jargon):** Codex's modifications accepted; kept as small last-tier tasks. SAC stays on the PDF, where it is required, and moves to a quiet detail line on screen.
- **Claude 6.3, the backlog has no priorities:** resolved by this audit rather than a task. Everything pilot-relevant moved into M9; what remains in `docs/BACKLOG.md` is "later" by definition, and its header now says so.
- **Claude 6.5 / 1.7, overdue status is job-updated:** both were partly wrong about the cause. Nothing sets `overdue` at all (backlog row "Nothing sets an invoice to overdue"; `src/lib/reminders/run.ts` only reads it), so a 46-day-late invoice says "Sent" everywhere. Ruling: derive the "Overdue" label from due date and balance in the shared status helper, keep the stored enum for queries. Demo blocker.
- **Claude 4.6, no support route:** Codex was right that it is D-029, not a broken flow; the error pages no longer promise a contact. Dropped from M9; D-029 is marked as needed before an external pilot.
- **Codex S5, journey test matches amounts anywhere on the page:** both agreed it is low; stays in the backlog, not M9, because the report queries have their own unit and database tests.
- **Codex S6, failed digest not retried:** both agreed it is low; stays in the backlog with the Resend idempotency key.
- **Codex S4, bank matching only on synthetic statements:** both agreed; the M5 human task already covers it. No new task.
- **Claude 1.6, Today and ageing disagree:** both agreed the numbers need one basis each. Ruling: Today's "hasn't paid" is what the tenant is asked to pay (less expected TDS, `src/lib/alerts/attention.ts:68`) and will say so; ageing and Today's "Unpaid now" box are gross and will share one label.
- **Claude 1.12, building card vs vacancy report:** both agreed; the root cause is already backlog row "The buildings list counts vacant units from `units.status`, which the app never changes". Moved into M9 as one task: vacancy from leases, fit-out shown separately, occupancy % on the card.

## Where they agreed (kept, in M9)

Codex S1 / Claude 5.5 (Today's unpaid and rent-increase cards), Codex S2 / Claude 5.1 (invoice list search, filter, "Send selected"), Codex M2 / Claude 5.6 (tenant contacts), Codex M6 / Claude 2.1 (opening balances), Claude 2.2 (email fails closed in production), Claude 2.3 / 6.4 (Tally ledger masters and stable names), Claude 1.1–1.5, 1.8–1.11 (demo fixes), Claude 1.4 / 5.2 (DD-MM-YYYY dates), Claude 3.2 (documents), 3.3 (activity on records), 3.6 (deposit ledger), 3.8 (custom dates and "in discussion"), 3.11 (tenant page invoices), 4.2 (CI), 4.3 (deploy runbook), 4.5 (job alerting, code half), 6.2 (two Vitest configs), 6.7 (fixed demo clock).

## Dropped as out of v1 scope or not a gap

- Claude 3.6's wider reading (a full deposit module with damages workflow): the plan puts the deposit ledger and a settlement statement in v1 ("Tenant exit" workflow) but a leasing or renewal *pipeline* in v2 (#5). M9 keeps the ledger and statement only; D-033 asks the founder whether even that waits.
- Claude 3.8's renewal pipeline part: v2 (#5). Only "custom critical dates" (plan section 7) and marking a lease "in discussion" (v1 renewal workflow, step 1) stay.
- Codex's "approvals", "tenant portal" or "payment links" never came up; nothing in either list asks for a v2 feature.
- Codex M0 should-fixes: Node 24 engines is fixed (`package.json`); the missing `.env.example` variables are already a human task because unattended runs can't open `.env*` files.
- Codex M2 should-fix (tenant list bulk actions): Codex's own rebuttal narrows bulk actions to sending and reminding; stays in the backlog.
- Codex M5, M5A, M8 should-fixes: fixed today or already backlogged (see `SUMMARY.md`).

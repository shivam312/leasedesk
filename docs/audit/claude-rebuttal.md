# Claude's rebuttal (after v1, 2026-10-24)

I've read `docs/audit/codex-gaps.md` and `docs/audit/codex-rebuttal.md`, and checked each disputed point against the code and docs. I also ran `pnpm test` today: **119 files, 1004 tests passed** in 21 s against the local database. I did not run `pnpm test:e2e` in this stage.

## Part 1. Codex's gap list

### Must fix

| Codex item | Position | Evidence | Revised fix or priority |
| --- | --- | --- | --- |
| M1. No backed-up pilot environment; email, Sentry, jobs, `APP_URL` not set up | **agree** | Same as my 4.1 and 4.5. `docs/ROADMAP.md` M8 is still open on these human tasks. | Keep as must-fix, but split it in two. The account setup is a human task. The code-side part can be built now: a deploy runbook (my 4.3), production refusing the console email driver (my 2.2), and a visible "background jobs aren't running" warning (my 2.5). Without that split, "do the human tasks" hides work the pipeline can do today. |
| M2. Tenant contacts can't be edited, removed or made the invoice recipient | **agree, and I missed it** | `src/server/actions/tenants.ts` exports only `saveTenant` (line 30) and `addContact` (line 81). `saveTenant` only writes a contact when the tenant is new (`id ? null : …`, around line 42). Recipients are read from the contacts at send time (`recipientsFor`, `src/lib/invoices/send.ts:53`; D25 in `docs/DECISIONS.md:178`). So a mistyped email sends every invoice and reminder to the wrong address, and nothing in the product can fix it. `docs/BACKLOG.md:31` already marks it "must-fix before pilot". | Must-fix, and in my top three (see the end). Use the fix already written in `docs/BACKLOG.md:31`. |
| M3. Can't remove a member, cancel an invite or copy the invite link again | **modify** | Confirmed: `src/server/actions/team.ts` exports only `invite` (line 34) and `joinTeam` (line 73). `docs/BACKLOG.md:32,118`. | Split it. **Remove member** and **Cancel invite** are must-fix: an accountant who leaves the landlord keeps access to every tenant's GSTIN, rent and payment history, with no way to cut it off. **Copy invite link again** is should-fix: a lost link can be replaced by inviting again. |
| M4. Tally export never tried in a real TallyPrime | **agree, and it's narrower than that** | Real-Tally testing is a human task (D-027). There is also a defect we can see without Tally: my 2.3, an export with 87 vouchers and 0 `<LEDGER>` masters (`src/lib/exports/tally.ts`). | Must-fix. Do the code part now: write party-ledger masters into the export, or show a checklist "create these N ledgers in Tally first". Then test with the accountant. Codex's version waits entirely on the human task, and it doesn't need to. |
| M5. CA review not done | **agree** | 17 `ca` entries are open in `docs/DECISIONS_NEEDED.md`; my 2.10. | Must-fix before a pilot's **live** billing, though not before a parallel run alongside Excel. E-invoicing (D-012) goes first, because it decides whether a landlord over ₹5 crore can use the product at all. |
| M6. No opening balances | **agree** | D-028; my 2.1. | Must-fix. It's #1 on both lists. |

### Should fix

| Codex item | Position | Evidence | Revised fix or priority |
| --- | --- | --- | --- |
| S1. Today shows one card per unpaid tenant (40+) | **agree** | `docs/BACKLOG.md:9`. `src/app/(app)/today/page.tsx:278` renders a "hasn't paid" card per tenant with no cap. My demo on the 24th didn't hit it, only because October wasn't sent yet. My 5.5 (one card per rent increase) is the same flaw, so fix both together. | Should-fix. Show the 5 oldest or largest, then "See all N unpaid". Group same-day increases into one card. |
| S2. Invoice list has no search, filter or selection | **agree** | Same as my 5.1 and 3.7. `docs/BACKLOG.md:111`. `InvoiceList.tsx` has no search or select. | Should-fix. "Send selected" matters more than search, because today one tenant on hold blocks "Send all". |
| S3. Sent PDFs are re-rendered, not stored | **modify (lower priority)** | This was a deliberate choice: D25 (`docs/DECISIONS.md:172`). Every field is frozen at sending (D18), so the amounts, GSTINs and numbers can't drift. Only the layout can. `docs/BACKLOG.md:141`. | Later. Do it before the first change to the PDF layout, not before the pilot. A layout change is a commit we control, and the legal content doesn't change. |
| S4. Bank import only tested on synthetic statements | **agree** | Same as my 2.9. M5 human task. | Should-fix, gated on the pilot sending a statement. |
| S5. Journey test checks amounts anywhere on the page | **agree, low** | `docs/BACKLOG.md:28`. The amounts themselves are covered by the unit and database tests of the report queries (part of the 1004). | Low. Scope each check to its row and column. A test-quality fix, not a pilot gap. |
| S6. A failed digest isn't retried the same day | **agree, low** | `docs/BACKLOG.md:53`; `src/lib/alerts/digest-run.ts:76` skips an existing claim. | Low. The digest is a summary of the Today screen, so missing one day loses nothing. Do it together with the Resend idempotency key. |
| S7. Test status unconfirmed | **disagree** | This describes Codex's read-only sandbox, not the product. I ran `pnpm test` today: 1004/1004 passed. The M8 recheck itself says the two failures were sandbox `EPERM` at `mkdtemp`, "not evidence of a product defect" (`docs/audit/M8-codex-recheck.md:24`). | Drop it. The real gap underneath is that there's no CI (my 4.2), which is already on the list. |

## Part 2. Codex's rebuttal of my items

**Conceded:**

- **6.6 (stray root files).** It's housekeeping, not a pilot gap. It's a two-minute delete, but I accept dropping it from the ranked list.
- **4.4 (RLS not forced).** Codex is right that `FORCE ROW LEVEL SECURITY` doesn't bind a superuser or `BYPASSRLS` role, and the jobs need to work across organizations. The fix is Codex's: audit every `runAsSystem` and bare `db` call, and test that the job paths keep organizations apart. Forcing RLS is only a backstop for the table owner.
- **6.1 (`cacheComponents`).** "Will need restructuring" was a forecast, not something I showed. The badge (1.1) is the concrete part. I accept "reproduce against the installed Next 16 docs first".
- **2.4 (Tally mixes GSTINs).** I accept "confirm the accountant's company setup first". The cheap step is still worth doing now: add a business filter on `/reports/tally`.
- **2.8, 3.9, 5.3, 5.4, 5.7, 6.3, 6.5.** Codex's revised fixes or priorities are reasonable, and I accept them.
- **4.6 (support route).** It's a product decision (D-029), not a broken flow. The error pages no longer promise a contact (`docs/ROADMAP.md:145`). It stays a blocker for an *external* pilot, as Codex says.

**Held:**

- **3.5 (Google login): Codex says it's out of v1. It isn't.** `docs/PRODUCT_PLAN.md:143`, under "Version 1 → Across the app", says "Email + password and Google login". The founder's human task list asks them to set up a Google OAuth client "for 'Log in with Google'" (`docs/DECISIONS_NEEDED.md:52`). But no code calls `signInWithOAuth`; `grep -ri oauth src` finds nothing. So the founder is being asked to set up an account for a button that doesn't exist. I agree on priority: low for one pilot. But it's a v1 gap, and the human task is misleading until the button is built.
- **3.10 (bulk-add units by pasting): Codex says it's not promised. It is.** `docs/PRODUCT_PLAN.md:84`, under "Version 1 → 2. Buildings and units", says "Bulk add units by pasting from Excel." The full import is a separate line (`:140`). Low priority, since the import does cover the need, but it is a v1 promise that isn't kept.
- **3.4 (global search): it's also in v1** (`docs/PRODUCT_PLAN.md:141`). I accept Codex's order, searching long lists first. But it belongs on the list of unkept v1 promises, not under "maybe later".
- **3.7 (bulk actions).** Codex narrows it to sending invoices and reminders. That's fine for the fix, but "Keeping it simple" rule 5 is about bulk actions everywhere. The two that matter are "Send selected" (S2) and "Remind all" on Today. Every overdue tenant is a separate click today, and S1 makes that worse.
- **4.7 (3 MB upload cap).** "No sample files" is fair. But the cap is a constant, `src/lib/files/store.ts:36` (`3 * 1024 * 1024`), and a phone scan of a signed 30-page lease is often 5–15 MB. Make it a must-fix on the day document upload (3.2) is built, not later.
- **2.7 (credit note starts at the full amount).** Codex agrees. I'm restating it because it's the one silent, irreversible money error on either list. `src/components/invoices/CreditNoteForm.tsx:157` says "Each line starts with all that is left on it." Under rule 5, a sent credit note can't be undone. It's a one-line fix, starting each line at ₹0, so it should not wait for the pilot.
- **6.7 / 1.5 (date-dependent demo).** Agreed by Codex. It's also the cause of S1 appearing in the walkthrough: October is sent on the 24th, after it was due. A fixed demo clock fixes both.

## Part 3. What matters most, and what I'd drop

**Top three across both lists:**

1. **Opening balances (my 2.1 / Codex M6).** Without them, every number in a new pilot's first month is wrong: ledger, ageing, Today, reminders, bank matching. It's also the gate for "matches their Excel".
2. **Invoices that look sent but weren't (my 2.2).** `src/lib/email/index.ts:30` falls back to the console driver whenever `RESEND_API_KEY` is missing, in every environment, while the invoice page still says "Sent on … to …". This is the product promise, "bills correctly every month", failing silently. Fix it in code: refuse to send in production without a provider.
3. **Contacts can't be corrected (Codex M2).** It's the same kind of failure as #2, silent misdelivery of money documents, and the product has no workaround. I rank it above Tally because a bad Tally import fails loudly in front of the accountant, who can create the ledgers by hand. A wrong email address fails quietly in front of no one.

Close fourth: the credit note starting at the full amount (2.7). It's irreversible, but it's a one-line fix, so just do it.

**Drop:** Codex S7, "test status unconfirmed". It reports on the reviewer's sandbox, not the product. The suite passes (1004/1004 today), and the real gap, no CI, is already my 4.2.

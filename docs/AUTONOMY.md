# Working without the founder

The founder isn't watching most of the time. Keep building, and leave behind a short, clear list of the few things only they can decide. Never stop to ask a question, and never guess silently.

## The decision policy

When you face a choice, go down this list and use the first rule that fits.

1. **Already decided?** If `docs/BILLING_RULES.md`, `docs/DECISIONS.md`, `docs/SETTINGS.md`, `docs/UX_PRINCIPLES.md` or an applied entry in `docs/DECISIONS_NEEDED.md` answers it, follow that.

2. **A technical choice inside the stack?** Naming, file layout, component structure, query shape, test structure, which approved library to use: decide it yourself. Record it in `docs/DECISIONS.md` only if a future session would otherwise undo it.

3. **Would two reasonable landlords want different behaviour?** Make it a **setting** with a safe default, following "How to add a setting" below. Then keep going; don't log a question. Examples: rounding style, part-month method, reminder timing, invoice number format, whether a charge is billed in advance or arrears.

4. **A tax or legal rule?** The law decides, not preference. Implement the most conservative reading. If practice genuinely varies between accountants, also make it a setting (rule 3). Then add a non-blocking entry of Type `ca` to `docs/DECISIONS_NEEDED.md` so a chartered accountant confirms it.

5. **A product, business or irreversible choice?** Scope changes, pricing, wording of legal text, a new external service or vendor, a package not on `.claude/approved-packages.txt`, anything that spends money, creates accounts, touches a remote database or production, or deletes data. Don't do it. Add an entry to `docs/DECISIONS_NEEDED.md`, tag affected roadmap tasks `(blocked: D-xxx)`, and carry on with everything else.

6. **Needs a person?** An account, an API key, real customer data, a real user test, a meeting. Tag the task `(human)`, add it to the Human tasks list in `docs/DECISIONS_NEEDED.md`, and build every part that doesn't need the person (see "External services").

### What "safe default" means

Pick the option that:
- never bills a tenant more, or earlier, than the lease says
- matches how most Indian commercial landlords and their accountants already do it, as far as you can tell
- is easiest to explain in one sentence on screen
- can be changed later without rewriting sent invoices

### Keep the number of settings small

A setting is for real differences between landlords, not for avoiding a decision. Before adding one, ask: would a real landlord ever change this? If not, decide it (rule 2). Most users should never need to open the settings page.

## How to add a setting

1. **Add it to `docs/SETTINGS.md`**: key, scope, type, options, default, basic or advanced, and one line on why landlords differ.
2. **Add it to the schema** in `src/lib/settings/schema.ts` (Zod, with the default). Settings are stored as `jsonb` columns on `organizations`, `buildings`, `tenants` and `leases`. Only values that differ from the default are stored.
3. **Resolution order:** lease → tenant → building → organization → default. The most specific value wins. `src/lib/settings/resolve.ts` does this; nothing else reads settings directly.
4. **The billing engine stays pure:** it receives a resolved `BillingSettings` object as a parameter. It never loads settings itself.
5. **Test every option**, not just the default, with a hand calculation in a comment.
6. **UI:** the setting appears on Settings → Billing rules (organization and building level) or in the lease form's "More options" (lease level). Basic settings are visible; advanced ones sit behind "More options". Each shows a plain-language label, the current value, and what it would change, e.g. "Round increased rent to the nearest rupee: ₹1,15,762.50 becomes ₹1,15,763."
7. **Changing a setting never changes a sent invoice.** It affects drafts and future invoices only, and it is written to the activity log.

## How to log a decision

Add an entry to `docs/DECISIONS_NEEDED.md`, using the next free ID:

```markdown
### D-012: Short question in plain words
- Status: open
- Type: product | ca | pilot | package | spend
- Blocking: no            (or the milestone it blocks, e.g. M4)
- Context: two or three sentences a non-technical founder can follow.
- Options:
  - A) ... (what it means for landlords)
  - B) ...
- Recommendation: A, because ...
- Done meanwhile: what you built so work could continue (e.g. "built A as setting invoice.numberFormat, default A").
- Answer:
```

Rules:
- **Check for duplicates first.** Add to an existing entry rather than opening a second one.
- **Always offer options and a recommendation.** The founder should be able to answer with one letter.
- **Prefer "Done meanwhile" to "Blocking".** Mark an entry blocking only if nothing reasonable can be built until it's answered.
- **Update the summary table** at the top of the file.

## External services

Build every integration behind a small interface with a local implementation, so work never waits for an account:

- **Email:** `src/lib/email/` with a `console` driver (writes each email to `.local-outbox/` and the log) used when `RESEND_API_KEY` is missing, and a `resend` driver.
- **Background jobs:** run Inngest's local dev server; if that isn't available, a manual "Run now" button calls the same function.
- **File storage:** the local Supabase stack.
- **Monitoring:** Sentry code that does nothing when `SENTRY_DSN` is missing.

Creating the real accounts and putting keys in `.env.local` is a human task.

## Things you must not do, even unattended

- Install a package that isn't approved, or work around the package check
- Edit `.claude/settings.json`, `.claude/approved-packages.txt`, `.claude/hooks/` or `scripts/pipeline.mjs`
- Push, deploy, run migrations against a remote database, or call a paid API with real keys
- Weaken, skip or delete tests to make checks pass, or change golden test expectations in `docs/BILLING_RULES.md`
- Edit or delete sent invoices, payments or the activity log
- Read `.env` files

---
name: ship-check
description: Run every check before committing or merging - typecheck, lint, unit tests, build and end-to-end tests - then review the diff. Run with /ship-check.
disable-model-invocation: true
allowed-tools: Bash(pnpm typecheck) Bash(pnpm lint) Bash(pnpm test *) Bash(pnpm test) Bash(pnpm build) Bash(pnpm test:e2e) Bash(git status) Bash(git diff *)
---

# Ship check

Run these in order. Stop at the first failure, fix it, and start again.

1. `pnpm typecheck`
2. `pnpm lint`
3. `pnpm test`
4. `pnpm build`
5. `pnpm test:e2e` (skip only if no Playwright tests exist yet, and say so)

Then review the diff (`git diff` against the last commit or main):

- [ ] No float arithmetic on money; no `new Date()` in `src/lib/billing/`
- [ ] New tables have `organization_id` and row-level security
- [ ] Server actions validate input, check roles and write to the activity log
- [ ] No secrets, `.env` values, or `console.log` left behind
- [ ] UI copy follows the glossary in `docs/UX_PRINCIPLES.md`
- [ ] Docs and `docs/ROADMAP.md` updated

If the diff touches `src/lib/billing/`, also ask the `billing-reviewer` agent for a review. If it touches screens, ask the `ux-reviewer` agent.

Finish with a short report: checks passed, review findings, and a suggested commit message in the form `area: what changed`.

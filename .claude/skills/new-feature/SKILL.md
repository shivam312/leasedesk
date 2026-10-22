---
name: new-feature
description: Plan and build a feature end to end - plan, schema, logic, screens, tests, docs. Run with /new-feature followed by the roadmap task or a description.
argument-hint: [roadmap task or feature description]
disable-model-invocation: true
---

# Build a feature: $ARGUMENTS

## 1. Understand

- Find the task in `docs/ROADMAP.md`. If it isn't there, say so and ask whether to add it.
- Read the parts of `docs/PRODUCT_PLAN.md`, `docs/DATA_MODEL.md` and `docs/BILLING_RULES.md` that apply.
- Check it isn't in the "Out of scope for v1" list in `CLAUDE.md`.
- Look at existing code in the same area so the new code matches it.

## 2. Plan (wait for approval)

Write a short plan and stop for approval:

- What the user will be able to do, in one or two sentences
- Database changes (tables, columns)
- Logic changes (which `lib/` modules, which billing rules)
- Screens and components
- Tests: unit tests for logic, one Playwright test for the main flow
- Open questions, especially anything about tax rules or money

## 3. Build, in this order

1. Database changes, using the `db-change` skill
2. Logic in `src/lib/`, with tests first; use the `billing-engine` skill for anything that touches money
3. Server actions in `src/server/actions/` with Zod validation, role checks and activity logging
4. Screens, using the `build-screen` skill
5. A Playwright test for the main flow in `tests/e2e/`

Commit after each step that leaves the app working.

## 4. Finish

- Run `/ship-check`
- Tick the task in `docs/ROADMAP.md`
- Update any doc whose facts changed, and add an entry to `docs/DECISIONS.md` for any real decision made
- Summarise what was built, what was tested, and anything left open

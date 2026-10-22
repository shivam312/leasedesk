---
name: build-screen
description: Use when creating or changing any page, form, table, dialog or component in the app, including empty states, error messages and button labels.
---

# Building a screen

Our users are busy building owners and accountants, not software people. Every screen must be obvious on first use. Read `docs/UX_PRINCIPLES.md` (rules, checklist and glossary) before starting.

## Steps

1. **Say the job of the screen in one sentence** before writing code, e.g. "Send this month's invoices to every tenant." If you can't, the screen is doing too much.
2. **Pick the one primary action.** It's the only filled primary button on the screen.
3. **Place it in the nav.** The screen must live under Today, Leases, Tenants, Billing, Reports, or Settings. Never add a nav item.
4. **Use existing pieces first:** shadcn components in `src/components/ui`, shared feature components in `src/components/<feature>`. Don't create a new variant of something that exists.
5. **Server first.** Fetch data in a server component; use client components only for interactive parts (forms, selection, dialogs). Mutations go through server actions in `src/server/actions/`.
6. **Write the copy with the glossary.** "Rent increase", not "escalation". Buttons are verbs: "Send 42 invoices", "Record payment", "Add lease".
7. **Build all states:** empty, loading, error, one item, many items (use the seed data with 40 tenants), and a very long tenant name.
8. **Check both widths:** 375px (phone) and 1280px (laptop). Lists become cards on phones.
9. **Run the screen checklist** in `docs/UX_PRINCIPLES.md` and fix anything that fails.

## Patterns to reuse

- **Lists:** search box, 2–3 filters as chips, select checkboxes, a bulk action bar that appears when rows are selected.
- **Forms:** one column, labels above fields, sensible defaults pre-filled, "More options" disclosure for advanced fields, inline validation messages in plain words.
- **Step forms** (lease setup): progress indicator, Back and Next, a review step before saving.
- **Amounts:** right-aligned, `formatINR`, tappable to open the explanation popover.
- **Status:** a small badge with a word, not just a colour ("Overdue", "Not sent yet", "Paid").
- **Confirmations:** say exactly what will happen ("This will email 42 invoices. Sent invoices can't be edited.").

## Don't

- Add settings to avoid making a decision; pick the sensible default.
- Show raw IDs, enum values or technical errors to users.
- Use tables wider than the screen on phones.
- Put two primary buttons on one screen.

When the screen is done, ask the `ux-reviewer` agent to review it.

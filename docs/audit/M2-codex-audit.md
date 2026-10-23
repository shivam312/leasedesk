# Audit of M2: Data, auth and setup screens (week 5)

**Verdict:** pass

No M2 must-fix defects found in the current implementation. The checked schemas, settings resolution, billing options, auth flows, org isolation, role enforcement, and financial-record protections have corresponding code and tests. The test command could not run because the read-only workspace blocked Vite from writing a temporary config file.

## Must fix (0)

None.

## Should fix (2)

- **src/components/tenants/TenantList.tsx**: The tenant list has search and filters but no bulk selection or actions. This falls short of the UX rule requiring bulk actions on every list, especially for organizations with many tenants.
  - Evidence: Lines 94–153 render tenant links and rows without selection controls; UX_PRINCIPLES.md line 11 says “Bulk actions on every list.”
  - Fix: Add selection and relevant tenant-list actions, or revise the UX principle if bulk actions are not intended for this list.
- **src/server/actions/tenants.ts**: Tenant contacts can be added but not edited or removed, leaving no in-app correction path for an incorrect or outdated contact.
  - Evidence: The actions file defines `addContact` at lines 81–95; the M8 review records the missing edit/remove actions as a must-fix before pilot in docs/BACKLOG.md line 30.
  - Fix: Add logged edit and removal actions with confirmation, and let the owner choose which contact receives invoices.

## Verified by hand

- Organization, membership, and billing-entity schemas include settings jsonb; buildings, floors, units, tenants, and contacts have org-scoped schema constraints. See `src/lib/db/schema/organizations.ts`, `property.ts`, and `tenants.ts`, with the corresponding initial migrations.
- RLS policies and org-scoped helpers: `runScoped` sets the authenticated user claims and `Scoped.where` adds the organization filter (`src/lib/db/scoped.ts` lines 40–68). The RLS tests check isolation across M2 org tables, including unfiltered reads (`src/lib/db/__tests__/rls.db.test.ts` lines 49–73).
- Activity logging: create/update/delete helpers log before/after values; migration triggers prevent activity-log update, delete, and truncate (`src/lib/db/activity-log.ts`; `drizzle/0005_activity_log_rules.sql`).
- Settings schema and documented defaults/scopes are cross-checked by `src/lib/settings/__tests__/schema.test.ts`; resolution tests cover lease → tenant → building → organization → default and billing-entity-only numbering. Storage tests are present in `src/lib/settings/__tests__/store.db.test.ts`.
- Billing engine inputs use the resolved `BillingSettings` object; `billingSettings()` maps resolved settings, and there are no remaining `roundEscalatedRentToRupee` inputs (`src/lib/settings/billing.ts`, `src/lib/billing/types.ts`). Golden tests remain at `src/lib/billing/__tests__/golden.test.ts`.
- Billing option tests cover part-period method, month-end rule, one/two mid-month lines, custom-increase continuation, zero invoices, building defaults, GST rounding, and TDS rounding/tolerance/quarter basis (`period-settings.test.ts`, `line-settings.test.ts`, `billing-settings.test.ts`, `tds-settings.test.ts`, `gst-rounding.test.ts`).
- Hand calculations checked: ₹1,250.50 × ₹85.50 = ₹1,06,917.75; ₹90,000 for 15/30 days plus ₹94,500 for 15/30 days = ₹92,250; ₹1,06,917.75 × 9% = ₹9,622.5975, rounded to ₹9,622.60 per tax line, giving ₹1,26,162.95 before the documented +₹0.05 round-off. These agree with `BILLING_RULES.md` and the relevant billing tests.
- Sign-up/login, invite creation and acceptance have server actions and tests; invite acceptance verifies email, one-time use, and activity logging (`src/server/actions/auth.ts`, `team.ts`, `src/lib/auth/__tests__/forms.test.ts`, `invites.db.test.ts`).
- Role permissions are checked in guarded server actions; the database role/policy comparison test covers the permission matrix (`src/server/actions/guard.ts`, `src/lib/auth/roles.ts`, `src/lib/auth/__tests__/roles-rls.db.test.ts`).
- Business and billing-rule forms, buildings/units, stacking plan, and tenant list/detail screens and browser tests are present (`tests/e2e/business.spec.ts`, `billing-rules.spec.ts`, `buildings.spec.ts`, `stacking.spec.ts`, `tenants.spec.ts`).
- Sent invoices and their lines are protected by database triggers; payments and allocations are protected against edits/deletes except the defined reversal path (`drizzle/0013_invoices_rules.sql`, `drizzle/0015_payments_rules.sql`).
- Attempted `pnpm test`; Vitest startup failed with `EPERM` writing `node_modules/.vite-temp/vitest.config...` under the read-only filesystem. Therefore this audit verified test source and implementation, but did not independently establish a passing run in this environment.

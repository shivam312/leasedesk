# Audit of M0: Project setup (week 3)

**Verdict:** pass

No must-fix M0 implementation defects found in the current code. The available evidence supports the completed setup and the billing examples checked by hand. `pnpm test` could not start because the read-only workspace prevented Vitest from writing its temporary config under `node_modules/.vite-temp`; this is an environment limitation, not a test result.

## Must fix (0)

None.

## Should fix (2)

- **package.json**: The Node engine range permits Node 22, although the project specifies Node 24 in `CLAUDE.md` and `.nvmrc`; M0 records this mismatch as an outstanding backlog item.
  - Evidence: `package.json` line 6 is `"node": ">=22"`; `CLAUDE.md` line 32 says `Node 24`.
  - Fix: Set the engine range to the intended Node 24 requirement, such as `>=24`.
- **.env.example**: The example environment file omits variables used by the current app, so it does not fully list the keys needed for setup.
  - Evidence: The file lists Supabase, email, Inngest, and `NEXT_PUBLIC_APP_URL`, but current code also reads `APP_URL`, `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`, and `NEXT_PUBLIC_SENTRY_ENVIRONMENT` (for example, the README documents Sentry variables).
  - Fix: Add the currently used variables with blank or safe local defaults, and align the app URL name with the variable the code reads.

## Verified by hand

- Next.js app setup: `package.json` includes Next.js 16, TypeScript, and pnpm; `tsconfig.json` has `strict: true`; ESLint and Prettier configs and scripts are present.
- Tailwind, shadcn/ui, and app shell: Tailwind and shadcn dependencies/configuration exist; the shell contains the five required nav items, a laptop sidebar, and phone bottom tabs. Navigation tests and `tests/e2e/nav.spec.ts` exercise the nav.
- Local Supabase and Drizzle setup: Supabase CLI config, Drizzle config/schema, migration scripts, and `db:generate`, `db:migrate`, and `db:seed` scripts are present. The human Docker and CLI installation is reported complete in the M0 milestone; I did not independently verify the installed tools.
- Vitest and Playwright setup: both configs and test suites are present; Playwright is configured for phone and laptop viewports. The M0 milestone reports passing tests, but I could not rerun Vitest because its temporary config write was blocked by the read-only filesystem.
- Indian formatting: `formatINR`, `formatDate`, and `formatFinancialYear` are implemented and have focused unit tests. Hand checked Indian grouping for ₹12,34,567 and DD-MM-YYYY formatting from the implementation and assertions.
- README and environment example: README contains local setup steps, and `.env.example` exists; see the should-fix finding for omitted current variables.
- CLAUDE Commands: commands listed in the section correspond to scripts currently defined in `package.json`.
- Billing calculation 1: ₹90,000 × 15 / 30 = ₹45,000 for 16–30 September; the test expects 4,500,000 paise, matching the documented actual-days proration rule.
- Billing calculation 2: ₹1,00,000 increased by 5% compounds to ₹1,05,000, then ₹1,10,250; the escalation test expects those values and correctly omits an increase after the lease end.
- Billing calculation 3: ₹1,06,917.75 at 18% intra-state GST gives CGST and SGST of ₹9,622.60 each; subtotal ₹1,26,162.95 rounds to ₹1,26,163 with a +₹0.05 round-off. The GST test expectations match.

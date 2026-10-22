# LeaseDesk (working name)

Commercial lease management for Indian landlords: leases, rent increases, GST invoices, payments with TDS, and reports, in one simple app.

- New here? Read `SETUP.md`.
- What we're building: `docs/PRODUCT_PLAN.md`
- What's next: `docs/ROADMAP.md`
- Instructions for Claude Code: `CLAUDE.md`

## Local development

You need Node.js 24 and pnpm (see `SETUP.md`).

```bash
nvm use                                 # picks Node 24 from .nvmrc
pnpm install
pnpm exec playwright install chromium   # once, for end-to-end tests
cp .env.example .env.local              # not needed yet; used once Supabase is set up
pnpm dev                                # http://localhost:3000
```

If `nvm use` complains about the npm `prefix` option (common with Homebrew installs), run `npm config delete prefix` once, then try again.

### Checks

```bash
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test        # unit tests (Vitest)
pnpm test:e2e    # end-to-end tests (Playwright), phone and laptop widths
```

Run `/ship-check` in Claude Code to run all of them in order before committing.

### Database

Not set up yet. The Supabase (local CLI, needs Docker) and Drizzle task in Milestone 0 adds the `db:*` scripts and the steps here.

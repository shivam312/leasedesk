# Installing the pipeline

1. Wait for any running Claude Code task to finish, then commit its work.
2. Unzip this add-on into the project folder and let it **replace** existing files (only `.claude/settings.json` already exists; everything else is new).
3. Quit Claude Code and start it again in the project folder, so it loads the new settings and hook.
4. Paste the prompt below. It's interactive: Claude will show you what it changed.

---

```
I've added an autonomous build pipeline to this project: scripts/pipeline.mjs, PIPELINE.md, docs/AUTONOMY.md, docs/SETTINGS.md, docs/DECISIONS_NEEDED.md, docs/BACKLOG.md, a package-check hook in .claude/hooks/, .claude/approved-packages.txt and a new .claude/settings.json. Read all of them, then integrate them with the rest of the project. Don't edit the new settings, hook, package list or pipeline script.

1. CLAUDE.md:
   - Add AUTONOMY.md, SETTINGS.md, DECISIONS_NEEDED.md, BACKLOG.md and docs/milestones/ to "Where to find things".
   - Replace "Ask before adding any new dependency" with: only install packages listed in .claude/approved-packages.txt; anything else becomes a "package" entry in docs/DECISIONS_NEEDED.md.
   - Change the plan-approval rule to: in interactive sessions, propose a plan and wait for approval; in pipeline runs, don't wait, and put a one-line plan in each commit message.
   - Add a rule: "Settings over questions. When landlords could reasonably want different behaviour, build it as a setting with a safe default (docs/AUTONOMY.md, docs/SETTINGS.md). Never stop to ask; log real decisions in docs/DECISIONS_NEEDED.md and keep going."
   - Update the tax rule: implement the most conservative reading and log a "ca" entry, rather than stopping.
   - Keep CLAUDE.md under 100 lines.

2. Reconcile docs/DECISIONS_NEEDED.md with the project as it is now. It was seeded before the latest billing work. Check git log, docs/BILLING_RULES.md, the code and the Open questions section of docs/ROADMAP.md:
   - Fix any "Done meanwhile" lines that don't match what the code actually does.
   - Move every remaining Open question into DECISIONS_NEEDED.md or SETTINGS.md (no duplicates), then empty the Open questions section, leaving the heading.
   - Keep the summary table in sync.

3. docs/SETTINGS.md: tick any settings that already exist in code, and note where. Add any setting-like options the code already has that aren't listed.

4. docs/ROADMAP.md:
   - Tag tasks that need a person (human). Split mixed tasks, e.g. "Sentry, backups, staging" becomes "Sentry and error reporting in code, no-op without a DSN" plus "(human) create Sentry, Supabase cloud and Vercel accounts".
   - Add to M2: "Settings system: schema, jsonb storage on organizations, buildings, tenants and leases, resolution order, and a Settings → Billing rules page", and "Billing engine takes a resolved BillingSettings object; implement every billing, GST and TDS setting in docs/SETTINGS.md with a test for each option".
   - Add to M4: "Email adapter with a console driver (writes to .local-outbox/) used when RESEND_API_KEY is missing".
   - Make sure every task is small enough for one commit; split any that aren't.

5. docs/DATA_MODEL.md: add a settings jsonb column to buildings, tenants, leases and billing_entities (organizations already has one).

6. Put the product name in one place, src/lib/config/brand.ts, and use it everywhere it appears (see D-006).

7. Add .pipeline/ and .local-outbox/ to .gitignore.

8. Check the guardrails without installing anything: pipe this JSON into the hook and show me that it blocks:
   echo '{"tool_input":{"command":"pnpm add left-pad"}}' | node .claude/hooks/check-packages.mjs; echo "exit $?"
   Then the same with "pnpm add zod", which should pass with exit 0.

9. Run the checks (typecheck, lint, test), commit everything as "chore: add autonomous build pipeline", then run `node scripts/pipeline.mjs --dry-run` and show me its output.

Finish with a short summary: which milestone the pipeline will start with, how many decisions are open, and the human tasks I need to do before it can get through M2.
```

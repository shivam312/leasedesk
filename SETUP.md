# Setting up the project with Claude Code

Follow these steps once. Total time: about 30–45 minutes.

## 1. Accounts you need

- **Claude Pro or Max** (Claude Code isn't included in the free plan)
- **GitHub** (free), for storing your code
- **Supabase** (free tier is enough to start). Create the project later, in the Mumbai region.
- Later, before pilots: **Vercel** (hosting), **Resend** (email), **Inngest** (background jobs). Free tiers are fine.

## 2. Install the tools on your computer

1. **Node.js 22 LTS** from nodejs.org
2. **pnpm:** in a terminal, run `npm install -g pnpm`
3. **Git:** from git-scm.com (on Windows this also gives you Git Bash, which Claude Code uses)
4. **Docker Desktop**, needed to run Supabase locally
5. **Supabase CLI:** see supabase.com/docs/guides/cli
6. **Claude Code:**
   - macOS, Linux or WSL: `curl -fsSL https://claude.ai/install.sh | bash`
   - Windows PowerShell: `irm https://claude.ai/install.ps1 | iex`
   - Then open a new terminal and check: `claude --version`

Optional but recommended: **VS Code** with the Claude Code extension, so you can see files while Claude works.

## 3. Create the project folder

1. Unzip this kit somewhere simple, e.g. `~/projects/leasedesk` (or `C:\projects\leasedesk`).
2. In a terminal, go into the folder: `cd ~/projects/leasedesk`
3. Start version control:
   ```
   git init
   git add .
   git commit -m "docs: project kit and Claude Code setup"
   ```
4. Create an empty private repository on GitHub called `leasedesk`, then follow GitHub's instructions to push the existing folder.

## 4. Start Claude Code

1. In the project folder, run `claude`
2. Log in through the browser when asked.
3. Check it sees the setup. Type:
   > What skills, agents and rules do you see in this project, and what's the current milestone?

   It should mention the skills (billing-engine, india-compliance, build-screen, db-change, new-feature, ship-check), the two reviewer agents, and milestone M0.

## 5. What's in this kit

| File | What it's for |
| --- | --- |
| `CLAUDE.md` | Instructions Claude reads at the start of every session: stack, commands, rules |
| `docs/PRODUCT_PLAN.md` | The full product plan |
| `docs/ROADMAP.md` | Milestones and tasks with checkboxes. Claude ticks these off. |
| `docs/ARCHITECTURE.md` | Stack, folder layout, patterns |
| `docs/DATA_MODEL.md` | Every table and column |
| `docs/BILLING_RULES.md` | Exact money rules and golden test cases |
| `docs/UX_PRINCIPLES.md` | Simplicity rules, screen checklist, UI glossary |
| `docs/DECISIONS.md` | Log of decisions and why |
| `.claude/skills/` | Step-by-step playbooks Claude uses for billing, compliance, screens, database changes, features and checks |
| `.claude/agents/` | Two reviewers: billing correctness and UX simplicity |
| `.claude/rules/` | Short rules that load only when Claude works in billing, database or UI folders |
| `.claude/settings.json` | What Claude may run without asking, what it must ask about, and what it can never do |

## 6. Habits that make this work

- **One task per session.** Start with "Do the next task in the roadmap." Use `/clear` between unrelated tasks.
- **Approve plans, not just code.** For anything bigger than a small fix, Claude proposes a plan first. Read it.
- **Run `/ship-check` before every commit.**
- **Commit often.** If something goes wrong you can always go back.
- **Keep the docs true.** When you change your mind about a feature, update the doc (or ask Claude to). The docs are how Claude remembers decisions between sessions.
- **Get a CA to review `docs/BILLING_RULES.md`** sections marked [CA] before your first paying customer.

Next: the starter prompts for each milestone.

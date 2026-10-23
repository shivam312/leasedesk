# The build pipeline

`scripts/pipeline.mjs` builds the roadmap milestone after milestone without you. Each stage runs in a fresh Claude Code session (so it never runs out of context), the script itself checks the results, and anything that needs you goes into one inbox: `docs/DECISIONS_NEEDED.md`.

## What happens for each milestone

1. **Answers:** if you've answered any decisions, they're applied first.
2. **Build:** Claude works through the milestone's tasks, one commit per task. If it runs out of turns, the script starts another build round (up to 3).
3. **Checks:** the script itself runs `pnpm typecheck`, `lint`, `test`, `build` and the end-to-end tests. If any fail, a fix stage gets the error output; this repeats up to 3 times.
4. **Review:** the billing and UX reviewer agents check the milestone's changes. "Must fix" items get fixed, small "Should fix" items too, and the rest go to `docs/BACKLOG.md`. Open questions are turned into settings or decisions.
5. **Checks again.**
6. **Independent review by Codex:** OpenAI's Codex CLI, which didn't write the code, reviews the milestone's changes in a read-only sandbox against the specs: it recomputes billing figures by hand, looks for spec drift, security gaps and roadmap tasks ticked but not working. Claude fixes what Codex finds, Codex re-checks, up to 2 rounds. If they still disagree, it's logged in `docs/DECISIONS_NEEDED.md` for you.
7. **Wrap-up:** docs updated, a plain-language report written to `docs/milestones/M#.md`, and the milestone tagged in git (`m2-done`, `m3-done`, …).
8. **Codex sign-off:** a final independent verdict, including a check that every claim in the milestone report is true, saved as `docs/milestones/M#-independent-review.md`.
9. On to the next milestone.

Tasks that need a person are tagged `(human)` and skipped. Tasks waiting for a decision are tagged `(blocked: D-012)` and skipped until you answer. Everything else keeps going.

## Set up Codex (the second reviewer)

Codex is OpenAI's coding agent CLI. Here it only reads and reports; it never edits. Two AI models from different companies checking each other catches more than one model reviewing itself.

1. Install: `npm install -g @openai/codex`
2. Sign in: `codex login` (uses a ChatGPT Plus/Pro/Team account), or set `CODEX_API_KEY` to an OpenAI API key.
3. Check: `codex --version`

If Codex isn't installed, the pipeline warns and skips those stages. Pass `--require-codex` to make it stop instead, or `--no-codex` to skip on purpose.

## Start it

In a normal terminal (not inside Claude Code), from the project folder:

```
node scripts/pipeline.mjs
```

Keep your computer awake while it runs:

- **macOS:** `caffeinate -i node scripts/pipeline.mjs`
- **Windows:** set Sleep to "Never" while plugged in (Settings → System → Power)

Useful options:

| Command | What it does |
| --- | --- |
| `node scripts/pipeline.mjs --to M4` | Stop after M4 |
| `node scripts/pipeline.mjs --from M3 --to M3` | Run only M3 |
| `node scripts/pipeline.mjs --dry-run` | Show what would run, without running anything |
| `node scripts/pipeline.mjs --fix-model sonnet` | Use a faster model for fix, review and wrap-up stages (build stays on your default) |
| `node scripts/pipeline.mjs --skip-e2e` | Skip end-to-end tests in the checks (faster, less thorough) |
| `node scripts/pipeline.mjs --codex-model <name>` | Pick the Codex model (otherwise Codex's default) |
| `node scripts/pipeline.mjs --codex-rounds 3` | More Codex review/fix rounds per milestone (default 2) |
| `node scripts/pipeline.mjs --no-codex` | Skip the Codex stages |

## Audit everything at the end

Once the build is through M7, run:

```
node scripts/pipeline.mjs --audit
```

Codex audits each milestone against the code as it stands today (every ticked task must actually work; figures recomputed by hand), Claude fixes what it finds, Codex re-checks. Then Codex and Claude each write an independent gap analysis against the product plan and the pilot goal, without seeing each other's. Claude merges them into a new roadmap milestone, `M9. Audit findings`, and writes `docs/audit/SUMMARY.md` for you: demo-ready or not, pilot-ready or not, top three things to do, and where the two reviewers disagreed.

Then run `node scripts/pipeline.mjs` again to build M9. To do both without coming back:

```
node scripts/pipeline.mjs --to M7 && node scripts/pipeline.mjs --audit && node scripts/pipeline.mjs
```

`--audit --from M4 --to M5` audits only those milestones.

## Check on it

- **`.pipeline/status.md`**: a running log of every stage, how long it took, and a one-line summary
- **`docs/milestones/`**: one plain-language report per finished milestone, plus Codex's independent verdict (`M#-independent-review.md`). Read the verdict first; a FAIL there means the two reviewers disagree and you should look.
- **`.pipeline/reviews/`**: every Codex report, each round
- **`git log --oneline`**: every task is its own commit
- **`.pipeline/logs/`**: the full output of every stage, if something went wrong

## Answer decisions

Open `docs/DECISIONS_NEEDED.md`. Each entry has options and a recommendation. Write your answer on the `Answer:` line (a letter is enough), change `Status: open` to `Status: answered`, and save. You can do this while the pipeline is running; it picks answers up between milestones.

The summary table at the top shows what's waiting. Most entries aren't blocking: Claude has already built the recommended option (often as a setting), so your answer only confirms or changes it.

## Stop it

Create an empty file called `STOP` in the `.pipeline` folder:

- **macOS/Linux:** `touch .pipeline/STOP`
- **Windows:** `type nul > .pipeline\STOP`

It stops after the current stage finishes. Pressing Ctrl+C also works but may leave a half-finished stage; the next run carries on from the last commit.

Run `node scripts/pipeline.mjs` again to continue where it left off.

## Why it might stop on its own

| Message | What to do |
| --- | --- |
| Needs the local database | Install and start Docker Desktop, install the Supabase CLI, then run again |
| Unfinished tasks after 3 build rounds | Read the latest build log in `.pipeline/logs/`; usually a task was too big or stuck. Run again, or split the task in the roadmap |
| Checks still failing after 3 fix attempts | Look at the last fix log. Open Claude Code and ask it to fix the failing check, then run again |
| Usage limit | It waits and retries on its own (every 30 minutes, up to 6 hours). On the Pro plan you'll hit limits often; Max helps |
| Codex isn't logged in | Run `codex login` and start again, or pass `--no-codex` |

## How long it takes

Each stage takes roughly 10–20 minutes, so a milestone usually takes 1–3 hours, more if it waits for usage limits. M2–M7 overnight is realistic on a Max plan.

## Ground rules while it runs

- Don't edit code in the project folder at the same time. Editing `docs/DECISIONS_NEEDED.md` is fine.
- Run only one pipeline at a time.
- The pipeline commits but never pushes. Push to GitHub yourself when you're happy.

## Guardrails

- Claude can only install packages listed in `.claude/approved-packages.txt`. Anything else becomes a `package` decision for you. To approve one, add its name to that file.
- Claude can't edit the settings, the package list, the hooks, or this script.
- Pushing, deploying, and touching remote databases need you.
- Tests can't be weakened to make checks pass, and the golden billing tests can't be changed.

These are guardrails, not a security boundary. Glance at the commits now and then.

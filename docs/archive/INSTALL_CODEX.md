# Adding the Codex reviewer

This add-on replaces `scripts/pipeline.mjs` and `PIPELINE.md`. Nothing else changes.

1. Install the Codex CLI on your machine: `npm install -g @openai/codex`, then `codex login` (ChatGPT account) or set `CODEX_API_KEY`.
2. Make sure no pipeline is running (create `.pipeline/STOP` if one is, and wait for it to finish the current stage).
3. Unzip this into the project folder, replacing the two files.
4. Check the pipeline still parses and sees Codex: `node scripts/pipeline.mjs --dry-run` should print a `Codex CLI <version>` line near the top. (The dry run doesn't call Codex.)
5. Commit: open Claude Code and say "Commit scripts/pipeline.mjs and PIPELINE.md as 'chore: add Codex independent review to pipeline'", or run git yourself.
6. Start the pipeline as before: `node scripts/pipeline.mjs`

What you'll see per milestone: a `codex-review` stage after Claude's review, a `codex-fix` stage if Codex found problems, a second `codex-review`, and a `codex-signoff` at the end. Codex's verdicts land in `docs/milestones/M#-independent-review.md`.

Note: `scripts/pipeline.mjs` is on Claude's do-not-edit list, so if you ever want Claude to change it, say so explicitly in the prompt and it will tell you the settings block it.

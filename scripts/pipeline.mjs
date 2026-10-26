#!/usr/bin/env node
// LeaseDesk build pipeline.
//
// Runs the roadmap milestone by milestone, each stage in a fresh Claude Code session:
//   answers -> build (repeats until done) -> checks (+ fix loop) -> Claude review & decision sweep
//   -> checks -> independent review (+ Claude fix loop, up to --codex-rounds)
//   -> checks -> wrap-up -> independent sign-off -> git tag -> next milestone
//   The independent reviewer is a fresh read-only Claude Fable session by default (--reviewer codex for Codex).
//
// Usage (from the project root, in a normal terminal):
//   node scripts/pipeline.mjs                     run from the first unfinished milestone to the end
//   node scripts/pipeline.mjs --to M4             stop after M4
//   node scripts/pipeline.mjs --from M3 --to M3   run one milestone
//   node scripts/pipeline.mjs --dry-run           show what would run
//   node scripts/pipeline.mjs --fix-model sonnet  use a faster model for fix and review stages
//   node scripts/pipeline.mjs --overnight         ONE command: finish the build, audit everything, debate the gaps,
//                                                 build the audit milestone. Opus builds and fixes, Fable reviews and judges.
//   node scripts/pipeline.mjs --audit             the reviewer + Claude audit every milestone, debate, write the audit milestone
//   node scripts/pipeline.mjs --reviewer codex    use OpenAI Codex as the independent reviewer instead of Claude Fable
//   node scripts/pipeline.mjs --reviewer-model m  pick the Claude reviewer model (default fable)
//   node scripts/pipeline.mjs --no-codex          skip the independent review stages
//   node scripts/pipeline.mjs --codex-model gpt-5 pick the Codex model (with --reviewer codex)
//
// Stop it gracefully: create the file .pipeline/STOP (it stops after the current stage).
// Progress: .pipeline/status.md   Full logs: .pipeline/logs/
// See PIPELINE.md for details.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const ROADMAP = "docs/ROADMAP.md";
const DECISIONS = "docs/DECISIONS_NEEDED.md";
const PDIR = ".pipeline";
const LOGS = path.join(PDIR, "logs");
const STATUS = path.join(PDIR, "status.md");
const STATE = path.join(PDIR, "state.json");
const STOP = path.join(PDIR, "STOP");
const REVIEWS = path.join(PDIR, "reviews");
const CODEX_SCHEMA = path.join(PDIR, "codex-review-schema.json");
const IS_WIN = process.platform === "win32";
let codexChecked = null;

const args = parseArgs(process.argv.slice(2));
const cfg = {
  from: args.from ? String(args.from).toUpperCase() : null,
  to: args.to ? String(args.to).toUpperCase() : null,
  claudeBin: process.env.CLAUDE_BIN || "claude",
  codexBin: process.env.CODEX_BIN || "codex",
  codexModel: args["codex-model"] || null,
  codexRounds: num(args["codex-rounds"], 2),
  // Codex reasoning effort (low, medium, high, xhigh); audits and reviews default to high.
  codexEffort: args["codex-effort"] || "high",
  noCodex: Boolean(args["no-codex"]),
  requireCodex: Boolean(args["require-codex"]),
  // Who does the independent reviews and audits: "claude" (a fresh read-only Claude session) or "codex".
  reviewer: String(args.reviewer || "claude").toLowerCase(),
  reviewerModel: args["reviewer-model"] || "fable",
  buildModel: args["build-model"] || (args.overnight ? "opus" : null),
  fixModel: args["fix-model"] || "opus",
  // The boss model reviews, merges, judges debates and writes the reports.
  bossModel: args["boss-model"] || args["review-model"] || "fable",
  buildTurns: num(args["build-turns"], 60),
  buildRounds: num(args["build-rounds"], 3),
  fixAttempts: num(args["fix-attempts"], 3),
  limitWaitMin: num(args["limit-wait"], 30),
  limitWaits: num(args["limit-waits"], 12),
  retryWaitMin: num(args["retry-wait"], 2),
  stageTimeoutMin: num(args["stage-timeout"], 240),
  checkTimeoutMin: num(args["check-timeout"], 30),
  skipE2e: Boolean(args["skip-e2e"]),
  noReview: Boolean(args["no-review"]),
  dryRun: Boolean(args["dry-run"]),
  audit: Boolean(args["audit"]),
  overnight: Boolean(args["overnight"]),
};
cfg.reviewModel = cfg.bossModel;
if (!["claude", "codex"].includes(cfg.reviewer)) {
  console.error(`--reviewer must be claude or codex, not "${cfg.reviewer}".`);
  process.exit(1);
}
// Display name and file-name prefix for the independent reviewer's reports.
const REVIEWER = cfg.reviewer === "codex" ? "Codex" : `Claude ${cfg.reviewerModel}`;
const RSLUG = cfg.reviewer === "codex" ? "codex" : cfg.reviewerModel.replace(/[^a-z0-9.-]/gi, "-");
const AUDIT_DIR = "docs/audit";
// Shared by the audit prompts; declared here because main() runs before the prompt functions below.
const STRICT = [
  "Be strict. You are the last line of defence before a real landlord's money runs through this. Default to doubt: a task is not done until you have read the code path end to end (screen, server action, data layer, database) and seen a test that would fail if it broke. Don't trust milestone reports, commit messages, comments or ticked boxes; check them.",
  "Treat as must_fix: any wrong rupee or paise amount, rounding or date edge case (month ends, 29 February, financial-year boundaries, mid-month starts and escalations); any query or server action not scoped to the organization, or missing a role check; any path that edits or deletes a sent invoice or recorded payment; any change missing from activity_log; GST or TDS behaviour not in docs/BILLING_RULES.md; float money; tests that are skipped, weakened or assert nothing meaningful.",
].join("\n");

// ---------- main ----------

main();

function main() {
  fs.mkdirSync(LOGS, { recursive: true });
  fs.mkdirSync(REVIEWS, { recursive: true });
  if (fs.existsSync(STOP)) fs.rmSync(STOP);
  log(`\n# Pipeline run ${new Date().toLocaleString()}\n`);

  preflight();
  const state = readState();

  if (cfg.overnight) {
    if (!codexEnabled()) finish("failed", "Overnight mode needs the independent reviewer: drop --no-codex (with --reviewer codex: npm i -g @openai/codex, then codex login).");
    log(`- Models: build=${cfg.buildModel}, fix=${cfg.fixModel}, boss=${cfg.bossModel}, reviewer=${cfg.reviewer === "codex" ? `codex ${cfg.codexModel || "default"}` : cfg.reviewerModel}`);
    log("\n# Overnight: 1/4 finish the build\n");
    buildMilestones(state);
    log("\n# Overnight: 2/4 audit and 3/4 debate\n");
    runAudit();
    log("\n# Overnight: 4/4 build the audit milestone\n");
    cfg.to = null;
    buildMilestones(readState());
    finish("finished", "Overnight run complete. Read docs/audit/SUMMARY.md first, then docs/milestones/ for the audit milestone.");
  }
  if (cfg.audit) {
    runAudit();
    finish("finished", "Audit complete. Read docs/audit/SUMMARY.md, then run the pipeline normally to build the audit milestone.");
  }

  buildMilestones(state);
  finish("finished", "All selected milestones are done.");
}

function buildMilestones(state) {
  applyAnswers(state);

  for (;;) {
    const milestones = readRoadmap();
    const m = nextMilestone(milestones, state);
    if (!m) break;

    if (needsDatabase(m) && !databaseReady()) {
      finish("stopped", `${m.id} needs the local database. Install and start Docker Desktop, install the Supabase CLI, then run the pipeline again.`);
    }

    state.milestones[m.id] ??= { startSha: gitHead(), status: "running" };
    state.milestones[m.id].status = "running";
    writeState(state);
    log(`\n## ${m.id}. ${m.title}\n`);

    // 1. Build, in rounds, until no buildable tasks remain.
    for (let round = 1; round <= cfg.buildRounds; round++) {
      const left = remaining(findMilestone(m.id));
      if (left.length === 0) break;
      log(`- ${left.length} task(s) left: ${left.map((t) => short(t.text, 60)).join(" | ")}`);
      const r = runClaude(`build-${round}`, m, buildPrompt(m), cfg.buildModel);
      if (!r.ok) finish("failed", `Build stage for ${m.id} failed: ${short(r.result, 300)}`);
      if (cfg.dryRun) break;
    }
    const left = remaining(findMilestone(m.id));
    if (left.length > 0 && !cfg.dryRun) {
      finish("stopped", `${m.id} still has ${left.length} unfinished task(s) after ${cfg.buildRounds} build rounds: ${left.map((t) => t.text).join("; ")}. Check the latest build log, then run again.`);
    }

    // 2. Checks, with fix loop.
    if (!checksWithFixes(m, "after build")) finish("failed", `Checks still failing for ${m.id} after ${cfg.fixAttempts} fix attempts. See the last fix log.`);

    // 3. Review and decision sweep.
    if (!cfg.noReview) {
      const r = runClaude("review", m, reviewPrompt(m, state.milestones[m.id].startSha), cfg.reviewModel);
      if (!r.ok) finish("failed", `Review stage for ${m.id} failed: ${short(r.result, 300)}`);
      if (!checksWithFixes(m, "after review")) finish("failed", `Checks failing for ${m.id} after review fixes.`);
    }

    // 4. Independent review, with Claude fixing what it finds.
    if (codexEnabled()) {
      const verdict = codexReviewLoop(m, state.milestones[m.id].startSha);
      if (verdict === "failed") finish("failed", `${REVIEWER} review stage for ${m.id} failed. See .pipeline/logs/.`);
    }

    // 5. Wrap up.
    const w = runClaude("wrap", m, wrapPrompt(m), cfg.reviewModel);
    if (!w.ok) finish("failed", `Wrap-up for ${m.id} failed: ${short(w.result, 300)}`);
    commitLeftovers(m);

    // 6. Sign-off: an independent verdict on the finished milestone, saved for the founder.
    if (codexEnabled()) codexSignOff(m, state.milestones[m.id].startSha);
    tagMilestone(m);

    state.milestones[m.id].status = "done";
    state.milestones[m.id].doneAt = new Date().toISOString();
    writeState(state);
    log(`\n**${m.id} done.**`);

    if (cfg.to && mNum(m.id) >= mNum(cfg.to)) break;
    applyAnswers(state); // pick up any answers given while it ran
  }
}

// ---------- stages ----------

function header(stage, m) {
  const where = m ? `working on ${m.id} (${m.title})` : "between milestones";
  return [
    `You are running unattended as the "${stage}" stage of the LeaseDesk build pipeline, ${where}.`,
    "Nobody is available to answer questions or approve plans: never wait for approval and never ask questions.",
    "First read CLAUDE.md, docs/AUTONOMY.md and docs/ROADMAP.md. Whenever you face a choice, follow the decision policy in docs/AUTONOMY.md.",
  ].join(" ");
}

function buildPrompt(m) {
  return `/goal Every task in ${m.id} of docs/ROADMAP.md is ticked, or tagged (human), or tagged (blocked: D-xxx) with a matching entry in docs/DECISIONS_NEEDED.md; each finished task is in its own commit; and pnpm typecheck, pnpm lint and pnpm test pass with their output shown. Or stop after ${cfg.buildTurns} turns and say where you got to.

${header("build", m)}

How to work: take the unticked tasks in ${m.id} in order. For each one, follow the steps in .claude/skills/new-feature/SKILL.md, except don't wait for plan approval: put a one-line plan in the commit message instead. Use the billing-engine, db-change, build-screen and india-compliance skills where they apply. Run the ship-check steps before each commit.
- A task that needs a person (an account, an API key, real customer data, a real user) gets tagged (human) in the roadmap and added to the Human tasks list in docs/DECISIONS_NEEDED.md. If part of it can be built without the person (for example an adapter with a local implementation), build that part first.
- A task that can't go ahead without a product decision: log it in docs/DECISIONS_NEEDED.md, tag the task (blocked: D-xxx) and move on.
- Variations between landlords become settings (docs/AUTONOMY.md, docs/SETTINGS.md), not questions.
- Don't start tasks from later milestones.`;
}

function fixPrompt(m, failure) {
  return `${header("fix", m)}

The automated check \`pnpm ${failure.check}\` failed. The last lines of its output:

\`\`\`
${failure.output}
\`\`\`

Find the root cause and fix it properly. Don't skip, weaken or delete tests to make them pass, and don't change the expected values of the golden tests in docs/BILLING_RULES.md. If a test contradicts the spec, follow the spec, fix the test, and note it in docs/DECISIONS_NEEDED.md. Run \`pnpm ${failure.check}\` again to confirm it passes, then commit as "fix: <what you fixed>".`;
}

function reviewPrompt(m, startSha) {
  return `${header("review", m)}

Review everything changed in ${m.id}. Start with \`git diff ${startSha}..HEAD --stat\`, then read the changes.

1. If the changes touch src/lib/billing, src/lib/invoices or src/lib/payments, ask the billing-reviewer agent to review those changes. If they touch src/app or src/components, ask the ux-reviewer agent to review those. Run both at the same time when both apply.
2. Fix every "Must fix" item, test-first, one commit each.
3. "Should fix" items: fix the ones that are small and clearly right. Add the rest to docs/BACKLOG.md with the file, the problem and the suggested fix.
4. Decision sweep: go through the "Open questions" section of docs/ROADMAP.md, anything the reviewers raised, and any TODO or FIXME comments added in this milestone. Resolve each with the decision policy in docs/AUTONOMY.md: decide it, make it a setting (and add it to docs/SETTINGS.md), or log it in docs/DECISIONS_NEEDED.md. Then remove it from Open questions.
5. Run pnpm typecheck, pnpm lint and pnpm test, and commit.`;
}

function wrapPrompt(m) {
  return `${header("wrap-up", m)}

${m.id} is built, checked and reviewed. Wrap it up:
1. Write docs/milestones/${m.id}.md for a non-technical founder: what was built in plain words, how to try it (which page, which button), tests added, settings added, decision IDs logged, human tasks, backlog items, and anything the next milestone needs to know.
2. Make sure CLAUDE.md (Commands section), README.md, docs/ARCHITECTURE.md, docs/DATA_MODEL.md and docs/SETTINGS.md match the code as it is now.
3. Update the summary table at the top of docs/DECISIONS_NEEDED.md so it lists every entry with its current status.
4. Set "Current milestone" in docs/ROADMAP.md to the next milestone with unfinished tasks.
5. Commit everything as "docs: wrap up ${m.id}". The working tree must be clean when you finish.`;
}

function answersPrompt() {
  return `${header("answers", null)}

The founder has answered entries in docs/DECISIONS_NEEDED.md (entries with "Status: answered"). For each one, oldest first:
1. Apply the answer: update the relevant doc first (BILLING_RULES, SETTINGS, PRODUCT_PLAN, DATA_MODEL, UX_PRINCIPLES), then the code, test-first wherever behaviour changes.
2. Remove the matching (blocked: D-xxx) tag from tasks in docs/ROADMAP.md so they get built.
3. Set the entry's Status to applied and add one line saying what changed. If the answer is unclear or contradicts another rule, set Status back to open and add a follow-up question under it instead.
4. Record lasting product decisions in docs/DECISIONS.md.
5. Commit each entry separately as "decision: D-xxx <summary>".
Finish by running pnpm typecheck and pnpm test.`;
}

function applyAnswers(state) {
  if (!fs.existsSync(DECISIONS)) return;
  const answered = (fs.readFileSync(DECISIONS, "utf8").match(/^\s*-\s*\*{0,2}Status:?\*{0,2}:?\s*answered\b/gim) || []).length;
  if (answered === 0) return;
  log(`\n## Applying ${answered} answered decision(s)\n`);
  const r = runClaude("answers", { id: "D", title: "decisions" }, answersPrompt(), cfg.fixModel);
  if (!r.ok) finish("failed", `Applying answers failed: ${short(r.result, 300)}`);
  commitLeftovers({ id: "decisions" });
}

// ---------- Audit mode ----------

function runAudit() {
  if (!codexEnabled()) finish("failed", "Audit mode needs the independent reviewer; drop --no-codex (with --reviewer codex, install and log in to the Codex CLI).");
  fs.mkdirSync(AUDIT_DIR, { recursive: true });
  if (needsDatabase({ id: "M2", tasks: [] }) && !databaseReady()) finish("stopped", "The audit needs the local database running.");
  log("\n# Audit: every milestone, then a gap analysis\n");

  const previous = archivePreviousAudit();
  // The audit milestone gets the next free number, so earlier audit milestones (M9, ...) are never overwritten.
  const auditId = `M${Math.max(0, ...readRoadmap().map((m) => Math.floor(mNum(m.id)))) + 1}`;
  log(`- New audit milestone will be ${auditId}${previous ? `; previous audit archived in ${previous}` : ""}`);

  const milestones = readRoadmap().filter((m) => {
    const n = mNum(m.id);
    if (cfg.from && n < mNum(cfg.from)) return false;
    if (cfg.to && n > mNum(cfg.to)) return false;
    return m.tasks.some((t) => t.done);
  });

  // 1. Milestone by milestone.
  for (const m of milestones) {
    log(`\n## Audit ${m.id}. ${m.title}\n`);
    const r = runCodex(`audit-${m.id}`, m, auditMilestonePrompt(m, null, previous));
    if (!r.ok) finish("failed", `${REVIEWER} audit of ${m.id} failed.`);
    const mdFile = path.join(AUDIT_DIR, `${m.id}-${RSLUG}-audit.md`);
    writeAuditFile(mdFile, reportToMarkdown(`Audit of ${m.id}: ${m.title}`, r.report));
    if (r.report.must_fix.length) {
      // Fix, then the reviewer re-checks, up to --codex-rounds times.
      let report = mdFile;
      let left = r.report.must_fix.length;
      for (let round = 1; round <= cfg.codexRounds && left; round++) {
        log(`- ${REVIEWER} found ${left} must-fix item(s) in ${m.id}; asking Claude to fix (round ${round}/${cfg.codexRounds}).`);
        const f = runClaude(`audit-fix-${m.id}-${round}`, m, codexFixPrompt(m, report), cfg.fixModel);
        if (!f.ok) finish("failed", `Audit fixes for ${m.id} failed.`);
        if (!checksWithFixes(m, `after audit fixes for ${m.id}`)) finish("failed", `Checks failing after audit fixes for ${m.id}.`);
        const r2 = runCodex(`audit-${m.id}-recheck-${round}`, m, auditMilestonePrompt(m, report, previous));
        if (!r2.ok) break;
        report = path.join(AUDIT_DIR, round === 1 ? `${m.id}-${RSLUG}-recheck.md` : `${m.id}-${RSLUG}-recheck-${round}.md`);
        writeAuditFile(report, reportToMarkdown(`Re-check of ${m.id} (round ${round})`, r2.report));
        left = r2.report.must_fix.length;
      }
      if (left) log(`- ⚠ ${m.id} still has ${left} must-fix item(s) after ${cfg.codexRounds} round(s); they go into the audit milestone.`);
    } else if (r.report.should_fix.length) {
      const f = runClaude(`audit-triage-${m.id}`, m, codexTriagePrompt(m, mdFile), cfg.fixModel);
      if (f.ok) checksWithFixes(m, `after audit triage for ${m.id}`);
    }
    commitAll(`docs: audit of ${m.id}`);
  }

  // 2. Two independent gap analyses (neither sees the other's).
  const all = { id: "ALL", title: "whole product" };
  log("\n## Gap analysis\n");
  const g = runCodex("gaps", all, gapPromptCodex(previous));
  if (!g.ok) finish("failed", `${REVIEWER} gap analysis failed.`);
  writeAuditFile(path.join(AUDIT_DIR, `${RSLUG}-gaps.md`), reportToMarkdown(`Gap analysis (${REVIEWER})`, g.report));
  const c = runClaude("gaps", all, gapPromptClaude(previous), cfg.fixModel);
  if (!c.ok) finish("failed", "Claude gap analysis failed.");
  commitAll("docs: gap analyses");

  // 3. Debate: each reviewer rebuts the other's list, item by item, with evidence.
  log("\n## Debate\n");
  const cr = runCodex("rebuttal", all, rebuttalPromptCodex(), { schema: debateSchema(), kind: "debate" });
  if (!cr.ok) finish("failed", `${REVIEWER} rebuttal failed.`);
  writeAuditFile(path.join(AUDIT_DIR, `${RSLUG}-rebuttal.md`), debateToMarkdown(`${REVIEWER}'s rebuttal of Claude ${cfg.fixModel}'s gap list`, cr.report));
  const clr = runClaude("rebuttal", all, rebuttalPromptClaude(), cfg.fixModel);
  if (!clr.ok) finish("failed", "Claude rebuttal failed.");
  commitAll("docs: gap debate");

  // 4. The boss rules on every disputed item and writes the audit milestone and the founder summary.
  const mrg = runClaude("audit-merge", all, auditMergePrompt(milestones, auditId, previous), cfg.bossModel);
  if (!mrg.ok) finish("failed", "Audit merge failed.");
  commitAll("docs: audit summary");
  if (!cfg.dryRun) {
    git(["tag", "-f", "audit-done"]);
    log("- Tagged audit-done");
  }
}

// Moves the last audit's top-level files into docs/audit/<date>/ so this run starts clean and can check
// that the last audit's findings really were fixed. Returns the archive folder, or null if there was none.
// Dry runs must not overwrite real audit reports with placeholders.
function writeAuditFile(file, text) {
  if (!cfg.dryRun) fs.writeFileSync(file, text);
}

function archivePreviousAudit() {
  if (!fs.existsSync(path.join(AUDIT_DIR, "SUMMARY.md"))) return null;
  const date = git(["log", "-1", "--format=%ad", "--date=short", "--", path.join(AUDIT_DIR, "SUMMARY.md")]).stdout.trim() || "previous";
  const dest = path.join(AUDIT_DIR, date);
  if (cfg.dryRun) return dest;
  if (fs.existsSync(dest)) finish("failed", `${dest} already exists; move it aside before running the audit again.`);
  fs.mkdirSync(dest, { recursive: true });
  for (const f of fs.readdirSync(AUDIT_DIR)) {
    if (f.endsWith(".md")) git(["mv", path.join(AUDIT_DIR, f), path.join(dest, f)]);
  }
  commitAll(`docs: archive the ${date} audit`);
  return dest;
}


function auditMilestonePrompt(m, previousReport, previousAudit) {
  const tasks = m.tasks.filter((t) => t.done).map((t) => `- ${t.text}`).join("\n");
  return [
    `You are an independent auditor for LeaseDesk, a lease and rent billing product for Indian commercial landlords, built mostly by another AI agent (Claude Code). The build is finished through several milestones. Audit milestone ${m.id} (${m.title}) against the code AS IT IS NOW, not against old diffs: later milestones may have changed it, and what matters is whether it works today.`,
    "",
    "Tasks ticked as done in this milestone:",
    tasks || "(none)",
    "",
    "Read first: CLAUDE.md, docs/BILLING_RULES.md, docs/DATA_MODEL.md, docs/UX_PRINCIPLES.md, docs/SETTINGS.md, docs/ROADMAP.md, and docs/milestones/" + m.id + ".md if it exists. You are read-only; you may run read-only commands such as pnpm test, pnpm typecheck and git log.",
    "",
    "For every ticked task: find the code and tests that implement it, and say whether it works as described. A ticked task with no working implementation, or with tests that don't exercise it, is a must_fix. Then check, in priority order: money correctness (recompute at least five figures by hand against BILLING_RULES.md, including at least one edge case), spec drift between docs and code, weakened or skipped tests, multi-tenancy and role checks in server actions, immutability of sent invoices and payments, activity logging, and UX rules from UX_PRINCIPLES.md. Run pnpm test and read the failures, if any.",
    "",
    STRICT,
    previousAudit ? `\nThe previous audit is archived in ${previousAudit}/ (its RULINGS.md and SUMMARY.md, and the per-milestone reports). Any item from it that touches ${m.id} and is claimed fixed: verify it really is; if not, it's a must_fix.` : "",
    previousReport ? `\nA previous report from this audit is at ${previousReport}; Claude has since fixed its must_fix items (or disputed them in a "Disputed" note). Re-verify each one with fresh eyes, judge each dispute on the evidence, and report what is still wrong, including anything the fixes broke.` : "",
    "",
    "Report rules: must_fix = wrong number, rule violation, security hole, or a ticked task that doesn't work. should_fix = everything else worth doing. For each finding: file, problem, concrete evidence (quote the line or calculation), fix. Don't pad. In `verified`, list what you checked by hand and found correct, task by task.",
  ].join("\n");
}

function gapPromptCodex(previousAudit) {
  return [
    "You are an independent product and engineering auditor for LeaseDesk, a lease and rent billing product for Indian commercial landlords with 20–100 tenants, built mostly by another AI agent. The planned v1 build is finished. Decide what is still missing before (a) a convincing demo to a landlord and (b) a paid pilot where a real landlord's monthly billing runs through it.",
    "",
    "Read: docs/PRODUCT_PLAN.md (the v1 scope and the 'Keeping it simple' rules), docs/UX_PRINCIPLES.md, docs/ROADMAP.md (M8 is pilot readiness; later milestones followed it), docs/BACKLOG.md, docs/DECISIONS_NEEDED.md, docs/DEMO_SCRIPT.md, docs/milestones/*.md, docs/audit/*.md (today's per-milestone audits), and then the code: src/app, src/lib, src/server, tests. Run pnpm test and pnpm test:e2e if you can; read-only otherwise.",
    previousAudit ? `The previous audit is archived in ${previousAudit}/. Check that every item in its RULINGS.md and SUMMARY.md that was meant to be fixed actually was; an item that was claimed fixed but isn't is a must_fix.` : "",
    "Be strict and assume it is not ready until the code proves otherwise. Walk docs/DEMO_SCRIPT.md step by step against the code. Don't pad the list with trivia either: every finding needs evidence.",
    "",
    "Look for: v1 features in PRODUCT_PLAN.md that don't exist or are half-built; flows that work in tests but not end to end in the browser; things a landlord or accountant would hit in the first week (import of real data, invoice PDF correctness, Tally export matching a real accountant's ledgers, reminders, TDS tracking); security and data-safety gaps (multi-tenancy, backups, audit log, secrets); operational gaps (migrations, seed, error reporting, logging); performance at 100 tenants and 3 years of history; UX rules broken; and anything that would make a demo look amateurish.",
    "",
    "Use must_fix for things that would break a pilot or embarrass a demo, should_fix for everything else, ordered by importance. Each finding: area in `file` (a path or a feature name), the gap in `problem`, evidence of why you believe it's missing in `evidence`, and a concrete task in `fix`. In `summary`, give a founder three to five sentences: is this ready to demo, is it ready for a pilot, and what are the top three things to do. In `verified`, list the v1 features you confirmed are complete.",
  ].join("\n");
}

function gapPromptClaude(previousAudit) {
  return `${header("gap-analysis", null)}

The v1 build is finished and an independent auditor (${REVIEWER}) has reviewed each milestone (reports in docs/audit/). Do NOT read docs/audit/${RSLUG}-gaps.md or docs/audit/${RSLUG}-rebuttal.md: your gap analysis must be independent of ${REVIEWER}'s.${previousAudit ? ` The previous audit is archived in ${previousAudit}/; check that every item its RULINGS.md and SUMMARY.md meant to be fixed actually was, and list any that weren't.` : ""}

Be strict: you are the founder's last check before a real landlord's money runs through this, and you built most of it, so distrust your own earlier work. Write docs/audit/claude-gaps.md: compare the product as it exists now against docs/PRODUCT_PLAN.md (v1 scope, Keeping it simple), docs/UX_PRINCIPLES.md and the pilot-readiness goal in docs/ROADMAP.md (M8 and later milestones). Start the dev server, reset and log in with the demo data (pnpm db:seed:demo), follow docs/DEMO_SCRIPT.md click by click, then click through every other flow yourself at 375px and 1280px before writing. Recompute at least five invoice figures by hand against docs/BILLING_RULES.md. Sections: (1) Demo readiness: what would look wrong or break in a 10-minute landlord demo. (2) Pilot readiness: what a real landlord's first month would hit (data import, PDF correctness, Tally export, reminders, TDS, reports). (3) Missing or half-built v1 features. (4) Security, data safety and operations. (5) Simplicity: UX rules broken, jargon, screens with more than one primary action. (6) Technical debt that will bite within 3 months. Each item: one line, concrete, with the file or screen. Order by importance within each section. End with a verdict in plain words for a non-technical founder. Commit as "docs: Claude gap analysis".`;
}

function rebuttalPromptCodex() {
  return [
    `You are one of two independent reviewers of LeaseDesk, a lease and rent billing product for Indian commercial landlords. You wrote docs/audit/${RSLUG}-gaps.md. The other reviewer (Claude ${cfg.fixModel}) wrote docs/audit/claude-gaps.md without seeing yours. Now rebut its list. You are read-only: don't modify any file; your answer is the structured report.`,
    "",
    "For every item in docs/audit/claude-gaps.md, take a position: agree (it's real and matters), disagree (it's wrong, already handled, or out of v1 scope; say why with evidence from the code or docs), or modify (real but the fix or priority should change; give the revised fix). Verify in the code before you disagree: cite the file and line. Then, in `summary`, name the three items you think matter most across BOTH lists and the one item you'd drop, with reasons. Be direct; this is a debate a third model will judge, and evidence wins.",
  ].join("\n");
}

function rebuttalPromptClaude() {
  return `${header("rebuttal", null)}

You wrote docs/audit/claude-gaps.md. An independent reviewer (${REVIEWER}) wrote docs/audit/${RSLUG}-gaps.md without seeing yours, and has now rebutted your list in docs/audit/${RSLUG}-rebuttal.md. Read all three.

Write docs/audit/claude-rebuttal.md: for every item in ${REVIEWER}'s gap list, take a position: agree, disagree (with evidence from the code or docs, file and line), or modify (revised fix or priority). Then respond to ${REVIEWER}'s rebuttal of your items: concede where it's right, hold your ground with evidence where it's wrong. End with the three items you think matter most across both lists and the one you'd drop. Be direct; a third model will judge, and evidence wins. Commit as "docs: Claude rebuttal".`;
}

function auditMergePrompt(milestones, auditId, previousAudit) {
  return `${header("audit-merge", null)}

You are the boss: the final judge, and a strict one. Two reviewers, ${REVIEWER} and Claude ${cfg.fixModel}, each wrote a gap analysis (docs/audit/${RSLUG}-gaps.md, docs/audit/claude-gaps.md) and then rebutted each other (docs/audit/${RSLUG}-rebuttal.md, docs/audit/claude-rebuttal.md). If you are the same model as one of them, be extra hard on that side's claims. Per-milestone audit reports are in docs/audit/ too. ${previousAudit ? `The previous audit is archived in ${previousAudit}/; anything it ruled must be fixed that still isn't goes back in. ` : ""}Read all of it, then rule. Check the code yourself for every disputed item and every money, security or data-safety item, even where both agree:
1. Where both agree, keep it. Where they disagree, check the code yourself and decide; write one line per ruling in docs/audit/RULINGS.md (item, who was right, why). Drop items that are out of v1 scope per docs/PRODUCT_PLAN.md, and say so.
2. Add a milestone "## ${auditId}. Audit findings (${new Date().toISOString().slice(0, 10)})" at the end of docs/ROADMAP.md, after every existing milestone; don't renumber or edit existing milestones. One task per item, ordered: demo blockers, then pilot blockers, then the rest. Each task small enough for one commit, with a clear done-when; tag (human) and (blocked: D-xxx) as usual. Don't duplicate open tasks already in the roadmap or docs/BACKLOG.md; move backlog items in if they matter.
3. Anything that needs the founder (scope, spend, tax) goes into docs/DECISIONS_NEEDED.md with options and a recommendation.
4. Write docs/audit/SUMMARY.md for the founder: a one-paragraph verdict (demo-ready? pilot-ready?), the three most important things to do next, a table of all audited milestones (${milestones.map((m) => m.id).join(", ")}) with ${REVIEWER}'s verdict and what was fixed today, the debate's main disagreements and how you ruled, and the count of ${auditId} tasks and new decisions.
5. Set "Current milestone" in docs/ROADMAP.md to the milestone with the first unfinished buildable task (normally ${auditId}). Update the docs/audit line in CLAUDE.md to describe this audit. Run pnpm typecheck and pnpm test. Commit as "docs: audit summary and ${auditId} audit milestone".`;
}

// ---------- Codex (independent reviewer) ----------

function codexEnabled() {
  return !cfg.noCodex && (cfg.dryRun || cfg.reviewer === "claude" || codexAvailable());
}

function codexAvailable() {
  if (codexChecked !== null) return codexChecked;
  const v = spawnSync(cfg.codexBin, ["--version"], { encoding: "utf8", shell: IS_WIN });
  codexChecked = v.status === 0;
  if (codexChecked) log(`- Codex CLI ${oneLine(v.stdout)}`);
  else if (cfg.requireCodex) finish("failed", `Couldn't run "${cfg.codexBin} --version". Install the Codex CLI (npm i -g @openai/codex) and run "codex login", or pass --no-codex.`);
  else log("- ⚠ Codex CLI not found; skipping the independent review stages. Install it with: npm i -g @openai/codex, then codex login.");
  return codexChecked;
}

function codexSchema() {
  return {
  type: "object",
  additionalProperties: false,
  required: ["verdict", "summary", "must_fix", "should_fix", "verified"],
  properties: {
    verdict: { type: "string", enum: ["pass", "fail"] },
    summary: { type: "string" },
    must_fix: { type: "array", items: finding() },
    should_fix: { type: "array", items: finding() },
    verified: { type: "array", items: { type: "string" } },
  },
  };
}
function finding() {
  return {
    type: "object",
    additionalProperties: false,
    required: ["file", "problem", "evidence", "fix"],
    properties: {
      file: { type: "string" },
      problem: { type: "string" },
      evidence: { type: "string" },
      fix: { type: "string" },
    },
  };
}

function codexReviewContext(m, startSha) {
  return [
    `You are an independent reviewer for LeaseDesk, a lease and rent billing product for Indian commercial landlords. Another AI agent (Claude Code) wrote the code for milestone ${m.id} (${m.title}) and has already reviewed and tested it. Your job is to catch what it missed. Be sceptical: assume the author's tests and summaries may be wrong, and verify against the specs and the code.`,
    "",
    `Scope: everything changed between git commit ${startSha} and HEAD. Start with \`git diff ${startSha}..HEAD --stat\`, then read the diff and any file you need. You are read-only; do not modify anything.`,
    "",
    "Specs to check against (read them first): CLAUDE.md (non-negotiable rules), docs/BILLING_RULES.md (money rules and golden cases), docs/DATA_MODEL.md, docs/UX_PRINCIPLES.md, docs/SETTINGS.md, and the tasks for this milestone in docs/ROADMAP.md.",
    "",
    "Check, in priority order:",
    "1. Money correctness: recompute at least three test expectations by hand from docs/BILLING_RULES.md and compare with the code and tests. Look for float arithmetic on money, rounding in the wrong place, off-by-one days, wrong days-in-month or leap years, timezone leaks, mutable sent invoices or payments.",
    "2. Spec drift: behaviour that contradicts the docs, or docs that no longer match the code. Golden cases silently changed or weakened. Tests that are skipped, deleted or assert nothing.",
    "3. Security and multi-tenancy: queries not scoped to organization_id, missing row-level security, role checks only in the UI, secrets in code, user input not validated with Zod.",
    "4. Roadmap honesty: every task ticked in this milestone actually exists and works as described. List ticked tasks you could not verify.",
    "5. Simplicity: screens that break the rules in docs/UX_PRINCIPLES.md (more than one primary action, jargon from the glossary's don't-say column, missing empty or error states).",
    "",
    "Report rules: a must_fix is a wrong number, a rule violation, a security hole, or a ticked task that doesn't work. Everything else is should_fix. For every finding give the file path, the problem, concrete evidence (quote the line or the calculation), and the fix. Do not pad: an empty must_fix list is a fine answer when the work is good. List in `verified` the specific things you checked by hand and found correct.",
  ].join("\n");
}

function debateSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: ["summary", "positions"],
    properties: {
      summary: { type: "string" },
      positions: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["item", "position", "evidence", "revised_fix"],
          properties: {
            item: { type: "string" },
            position: { type: "string", enum: ["agree", "disagree", "modify"] },
            evidence: { type: "string" },
            revised_fix: { type: "string" },
          },
        },
      },
    },
  };
}

function debateToMarkdown(title, r) {
  return [
    `# ${title}`,
    "",
    r.summary,
    "",
    "| Item | Position | Evidence | Revised fix |",
    "| --- | --- | --- | --- |",
    ...r.positions.map((p) => `| ${cell(p.item)} | ${p.position} | ${cell(p.evidence)} | ${cell(p.revised_fix)} |`),
    "",
  ].join("\n");
}
function cell(s) {
  return String(s || "").replace(/\|/g, "\\|").replace(/\s+/g, " ");
}

function runCodex(stage, m, prompt, opts = {}) {
  if (cfg.reviewer === "claude") return runClaudeReviewer(stage, m, prompt, opts);
  fs.writeFileSync(CODEX_SCHEMA, JSON.stringify(opts.schema || codexSchema()));
  const outFile = path.join(REVIEWS, `${m.id}-${stage}.json`);
  const cliArgs = ["exec", "--sandbox", "read-only", "--output-schema", CODEX_SCHEMA, "-o", outFile, "--color", "never"];
  if (cfg.codexModel) cliArgs.push("-m", cfg.codexModel);
  if (cfg.codexEffort) cliArgs.push("-c", `model_reasoning_effort="${cfg.codexEffort}"`);
  cliArgs.push(prompt);
  let limitWaits = 0;
  let retried = false;
  for (;;) {
    checkStop();
    const started = Date.now();
    log(`- ▶ ${m.id} ${stage} (Codex) started ${time()}`);
    if (cfg.dryRun) {
      log(`  (dry run) codex exec --sandbox read-only <${prompt.length} character prompt>`);
      return { ok: true, report: opts.kind === "debate" ? { summary: "dry run", positions: [] } : { verdict: "pass", summary: "dry run", must_fix: [], should_fix: [], verified: [] } };
    }
    if (fs.existsSync(outFile)) fs.rmSync(outFile);
    const r = spawnSync(cfg.codexBin, cliArgs, {
      cwd: ROOT,
      encoding: "utf8",
      shell: IS_WIN,
      maxBuffer: 256 * 1024 * 1024,
      timeout: cfg.stageTimeoutMin * 60000,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const logFile = path.join(LOGS, `${stamp()}-${m.id}-${stage}-codex.log`);
    fs.writeFileSync(logFile, `${r.stdout || ""}\n\n--- stderr ---\n${r.stderr || ""}\n${r.error ? r.error.message : ""}`);
    const mins = ((Date.now() - started) / 60000).toFixed(0);
    const report = parseCodexReport(outFile, r.stdout, opts.kind);
    if (r.status === 0 && report) {
      if (opts.kind === "debate") log(`  ✔ done in ${mins} min: ${report.positions.length} positions. ${short(oneLine(report.summary), 300)}`);
      else log(`  ✔ done in ${mins} min: ${report.verdict}, ${report.must_fix.length} must-fix, ${report.should_fix.length} should-fix. ${short(oneLine(report.summary), 300)}`);
      return { ok: true, report };
    }
    const text = oneLine(`${r.stderr || ""} ${r.stdout || ""} ${r.error ? r.error.message : ""}`);
    if (r.error && r.error.code === "ENOENT") finish("failed", `Couldn't run "${cfg.codexBin}". Install the Codex CLI or pass --no-codex.`);
    if (/not logged in|login|unauthori[sz]ed|invalid api key|401/i.test(text)) finish("failed", `Codex isn't logged in. Run "codex login" (ChatGPT account) or set CODEX_API_KEY, or pass --no-codex. Log: ${logFile}`);
    if (/usage limit|rate.?limit|too many requests|quota|\b429\b|\b529\b|overloaded/i.test(text) && limitWaits < cfg.limitWaits) {
      limitWaits++;
      log(`  ⏸ Codex usage or rate limit; waiting ${cfg.limitWaitMin} min (${limitWaits}/${cfg.limitWaits}).`);
      sleepMinutes(cfg.limitWaitMin);
      continue;
    }
    if (!retried) {
      retried = true;
      log(`  ⚠ Codex failed after ${mins} min (${short(text, 200)}); retrying once in ${cfg.retryWaitMin} min. Log: ${logFile}`);
      sleepMinutes(cfg.retryWaitMin);
      continue;
    }
    log(`  ✗ Codex failed again. Log: ${logFile}`);
    return { ok: false, report: null };
  }
}

// The independent reviewer as a fresh Claude session: no file-editing tools, same structured report as Codex.
function runClaudeReviewer(stage, m, prompt, opts = {}) {
  if (cfg.dryRun) {
    log(`- ▶ ${m.id} ${stage} (${REVIEWER}) (dry run) claude -p <${prompt.length} character prompt> --model ${cfg.reviewerModel}`);
    return { ok: true, report: opts.kind === "debate" ? { summary: "dry run", positions: [] } : { verdict: "pass", summary: "dry run", must_fix: [], should_fix: [], verified: [] } };
  }
  const readOnly = "\n\nYou are read-only: do not modify, create or delete any file, and do not commit. Your only output is the structured report.";
  const extra = ["--json-schema", JSON.stringify(opts.schema || codexSchema()), "--disallowedTools", "Edit", "Write", "NotebookEdit"];
  for (let attempt = 1; attempt <= 2; attempt++) {
    const r = runClaude(`${stage}-${RSLUG}`, m, prompt + readOnly, cfg.reviewerModel, extra);
    if (!r.ok) return { ok: false, report: null };
    const report = parseCodexReport(null, typeof r.structured === "object" && r.structured ? JSON.stringify(r.structured) : r.result, opts.kind);
    if (report) {
      if (opts.kind === "debate") log(`  ✔ ${REVIEWER}: ${report.positions.length} positions. ${short(oneLine(report.summary), 300)}`);
      else log(`  ✔ ${REVIEWER}: ${report.verdict}, ${report.must_fix.length} must-fix, ${report.should_fix.length} should-fix. ${short(oneLine(report.summary), 300)}`);
      return { ok: true, report };
    }
    log(`  ⚠ ${REVIEWER} didn't return a valid report (attempt ${attempt}/2).`);
  }
  return { ok: false, report: null };
}

function parseCodexReport(outFile, stdout, kind) {
  const candidates = [];
  if (outFile) {
    try {
      candidates.push(fs.readFileSync(outFile, "utf8"));
    } catch {}
  }
  if (stdout) candidates.push(stdout);
  for (const c of candidates) {
    const text = String(c).trim();
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start < 0 || end < start) continue;
    try {
      const obj = JSON.parse(text.slice(start, end + 1));
      if (kind === "debate") {
        if (obj && Array.isArray(obj.positions)) {
          obj.summary ??= "";
          return obj;
        }
        continue;
      }
      if (obj && Array.isArray(obj.must_fix) && Array.isArray(obj.should_fix)) {
        obj.verified ??= [];
        obj.summary ??= "";
        obj.verdict = obj.must_fix.length ? "fail" : obj.verdict || "pass";
        return obj;
      }
    } catch {}
  }
  return null;
}

function reportToMarkdown(title, report) {
  const item = (f) => `- **${f.file}**: ${f.problem}\n  - Evidence: ${f.evidence}\n  - Fix: ${f.fix}`;
  return [
    `# ${title}`,
    "",
    `**Verdict:** ${report.verdict}`,
    "",
    report.summary,
    "",
    `## Must fix (${report.must_fix.length})`,
    "",
    report.must_fix.length ? report.must_fix.map(item).join("\n") : "None.",
    "",
    `## Should fix (${report.should_fix.length})`,
    "",
    report.should_fix.length ? report.should_fix.map(item).join("\n") : "None.",
    "",
    "## Verified by hand",
    "",
    report.verified.length ? report.verified.map((v) => `- ${v}`).join("\n") : "Nothing listed.",
    "",
  ].join("\n");
}

// The independent reviewer reviews; Claude fixes must-fix items; repeat until it is satisfied or rounds run out.
function codexReviewLoop(m, startSha) {
  for (let round = 1; round <= cfg.codexRounds; round++) {
    const r = runCodex(`${RSLUG}-review-${round}`, m, codexReviewContext(m, startSha));
    if (!r.ok) return "failed";
    const mdFile = path.join(REVIEWS, `${m.id}-${RSLUG}-review-${round}.md`);
    fs.writeFileSync(mdFile, reportToMarkdown(`${REVIEWER} review of ${m.id}, round ${round}`, r.report));
    if (r.report.must_fix.length === 0) {
      if (r.report.should_fix.length && !cfg.dryRun) {
        const f = runClaude(`codex-triage`, m, codexTriagePrompt(m, mdFile), cfg.fixModel);
        if (!f.ok) return "failed";
        if (!checksWithFixes(m, `after ${REVIEWER} triage`)) return "failed";
      }
      return "pass";
    }
    log(`- ${REVIEWER} found ${r.report.must_fix.length} must-fix item(s); asking Claude to fix them (round ${round}/${cfg.codexRounds}).`);
    const f = runClaude(`codex-fix-${round}`, m, codexFixPrompt(m, mdFile), cfg.fixModel);
    if (!f.ok) return "failed";
    if (!checksWithFixes(m, `after ${REVIEWER} fixes (round ${round})`)) return "failed";
  }
  log(`- ⚠ ${REVIEWER} still had must-fix items after ${cfg.codexRounds} round(s). Logged to docs/DECISIONS_NEEDED.md for you; continuing.`);
  const n = runClaude("codex-escalate", m, codexEscalatePrompt(m), cfg.fixModel);
  return n.ok ? "unresolved" : "failed";
}

function codexFixPrompt(m, mdFile) {
  return `${header("codex-fix", m)}

An independent reviewer (${REVIEWER}, in a separate session that did not write this code) reviewed ${m.id} and found problems. Its report is in ${mdFile}; read it in full.

For each item under "Must fix":
1. Check the evidence yourself against docs/BILLING_RULES.md, CLAUDE.md and the code. The reviewer can be wrong.
2. If it's right: fix it properly, test-first (a failing test with a hand calculation in a comment, then the fix). One commit per item: "fix(${m.id}): <what>, found by ${REVIEWER} review".
3. If it's wrong: don't change the code. Append a short "Disputed" note to ${mdFile} explaining why, with the spec line that supports the current behaviour.
Then go through "Should fix": fix the small, clearly correct ones; add the rest to docs/BACKLOG.md.
Never weaken, skip or delete tests, and never change golden expectations in docs/BILLING_RULES.md. Finish with pnpm typecheck, pnpm lint and pnpm test passing.`;
}

function codexTriagePrompt(m, mdFile) {
  return `${header("codex-triage", m)}

An independent reviewer (${REVIEWER}) reviewed ${m.id} and found no must-fix problems, but listed suggestions under "Should fix" in ${mdFile}. Read it. Fix the ones that are small and clearly right (one commit each, "fix(${m.id}): <what>, from ${REVIEWER} review"); add the rest to docs/BACKLOG.md with file, problem and suggested fix. Don't weaken tests. Finish with pnpm typecheck, pnpm lint and pnpm test passing.`;
}

function codexEscalatePrompt(m) {
  return `${header("codex-escalate", m)}

${REVIEWER} (an independent reviewer) and you disagree, or its must-fix items couldn't be resolved, after ${cfg.codexRounds} rounds. Read the latest file matching .pipeline/reviews/${m.id}-${RSLUG}-review-*.md. Add one entry to docs/DECISIONS_NEEDED.md of Type "product", Blocking: no, titled "${REVIEWER} review of ${m.id}: unresolved items", with the remaining items, what each side says, and your recommendation. Update the summary table. Commit as "docs: escalate ${REVIEWER} review of ${m.id}".`;
}

// Final independent verdict on the finished milestone, saved where the founder reads milestone reports.
function codexSignOff(m, startSha) {
  const prompt = [
    codexReviewContext(m, startSha),
    "",
    `This is the final sign-off after all fixes. Also read docs/milestones/${m.id}.md, the plain-language report written for the founder, and check that every claim in it is true in the code. Any false claim is a must_fix. In summary, write three to five sentences for a non-technical founder: what this milestone delivers, how confident you are in the money calculations, and what they should look at themselves.`,
  ].join("\n");
  const r = runCodex(`${RSLUG}-signoff`, m, prompt);
  if (!r.ok) {
    log(`- ⚠ ${REVIEWER} sign-off failed; continuing without it.`);
    return;
  }
  const md = reportToMarkdown(`Independent review of ${m.id} (${REVIEWER})`, r.report);
  fs.writeFileSync(path.join(REVIEWS, `${m.id}-${RSLUG}-signoff.md`), md);
  if (!cfg.dryRun) {
    fs.mkdirSync("docs/milestones", { recursive: true });
    fs.writeFileSync(path.join("docs/milestones", `${m.id}-independent-review.md`), md);
    git(["add", "docs/milestones"]);
    git(["commit", "-m", `docs: ${REVIEWER} sign-off for ${m.id} (${r.report.verdict})`]);
  }
  if (r.report.verdict === "fail") {
    log(`- ⚠ ${REVIEWER} sign-off for ${m.id} is FAIL with ${r.report.must_fix.length} item(s). Read docs/milestones/${m.id}-independent-review.md.`);
  }
}

// ---------- checks ----------

function checksWithFixes(m, label) {
  for (let attempt = 0; ; attempt++) {
    const g = runChecks(label);
    if (g.ok) return true;
    log(`- ✗ \`pnpm ${g.check}\` failed ${label}`);
    if (attempt >= cfg.fixAttempts) return false;
    const r = runClaude(`fix-${attempt + 1}`, m, fixPrompt(m, g), cfg.fixModel);
    if (!r.ok) return false;
  }
}

function runChecks(label) {
  if (cfg.dryRun) {
    log(`- (dry run) would run checks ${label}`);
    return { ok: true };
  }
  if (!fs.existsSync("package.json")) return { ok: true };
  let scripts;
  try {
    scripts = JSON.parse(fs.readFileSync("package.json", "utf8")).scripts || {};
  } catch (e) {
    return { ok: false, check: "install", output: `package.json isn't valid JSON: ${e.message}` };
  }
  // Apply local database migrations first: unattended Claude sessions may not be allowed to,
  // and every new table otherwise leaves the local database behind and fails the e2e tests.
  if (scripts["db:migrate"]) {
    const mig = spawnSync("pnpm", ["db:migrate"], {
      cwd: ROOT,
      encoding: "utf8",
      shell: IS_WIN,
      maxBuffer: 64 * 1024 * 1024,
      timeout: cfg.checkTimeoutMin * 60000,
      env: { ...process.env, CI: "1" },
    });
    if (mig.status !== 0) {
      return { ok: false, check: "db:migrate", output: tail(`${mig.stdout || ""}\n${mig.stderr || ""}${mig.error ? `\n${mig.error.message}` : ""}`, 150) };
    }
    log(`- ✓ local migrations applied ${label}`);
  }
  const checks = ["typecheck", "lint", "test", "build"];
  if (!cfg.skipE2e && scripts["test:e2e"] && fs.existsSync("tests/e2e")) checks.push("test:e2e");
  for (const check of checks) {
    if (!scripts[check]) continue;
    const r = spawnSync("pnpm", [check], {
      cwd: ROOT,
      encoding: "utf8",
      shell: IS_WIN,
      maxBuffer: 64 * 1024 * 1024,
      timeout: cfg.checkTimeoutMin * 60000,
      env: { ...process.env, CI: "1" },
    });
    if (r.status !== 0) {
      return { ok: false, check, output: tail(`${r.stdout || ""}\n${r.stderr || ""}${r.error ? `\n${r.error.message}` : ""}`, 150) };
    }
  }
  log(`- ✓ checks passed ${label}`);
  return { ok: true };
}

// ---------- running Claude ----------

function runClaude(stage, m, prompt, model, extraArgs = []) {
  const cliArgs = ["-p", prompt, "--output-format", "json", "--permission-mode", "auto", "--permission-prompts", "none", ...extraArgs];
  if (model) cliArgs.push("--model", model);
  let limitWaits = 0;
  let retried = false;
  for (;;) {
    checkStop();
    const started = Date.now();
    log(`- ▶ ${m.id} ${stage} started ${time()}`);
    if (cfg.dryRun) {
      log(`  (dry run) claude -p <${prompt.length} character prompt>${model ? ` --model ${model}` : ""}`);
      return { ok: true, result: "dry run" };
    }
    const r = spawnSync(cfg.claudeBin, cliArgs, {
      cwd: ROOT,
      encoding: "utf8",
      maxBuffer: 256 * 1024 * 1024,
      timeout: cfg.stageTimeoutMin * 60000,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const logFile = path.join(LOGS, `${stamp()}-${m.id}-${stage}.log`);
    fs.writeFileSync(logFile, `${r.stdout || ""}\n\n--- stderr ---\n${r.stderr || ""}\n${r.error ? r.error.message : ""}`);
    const out = parseResult(r.stdout);
    const text = (out && out.result) || r.stderr || (r.error && r.error.message) || `exit code ${r.status}`;
    const mins = ((Date.now() - started) / 60000).toFixed(0);
    const failed = r.status !== 0 || !out || out.is_error === true || (out.subtype && out.subtype.startsWith("error") && out.subtype !== "error_max_turns");

    if (!failed) {
      log(`  ✔ done in ${mins} min${out.num_turns ? `, ${out.num_turns} turns` : ""}. ${short(oneLine(out.result || ""), 400)}`);
      return { ok: true, result: out.result || "", structured: out.structured_output };
    }
    if (r.error && r.error.code === "ENOENT") {
      finish("failed", `Couldn't run "${cfg.claudeBin}". Is Claude Code installed and on your PATH? (On Windows you may need CLAUDE_BIN=claude.exe.)`);
    }
    if (/usage limit|session limit|weekly limit|rate.?limit|limit.{0,20}reset|too many requests|overloaded|\b429\b|\b529\b/i.test(text) && limitWaits < cfg.limitWaits) {
      limitWaits++;
      log(`  ⏸ usage or rate limit reached; waiting ${cfg.limitWaitMin} min (${limitWaits}/${cfg.limitWaits}).`);
      sleepMinutes(cfg.limitWaitMin);
      continue;
    }
    if (!retried) {
      retried = true;
      log(`  ⚠ failed after ${mins} min (${short(oneLine(text), 200)}); retrying once in ${cfg.retryWaitMin} min. Log: ${logFile}`);
      sleepMinutes(cfg.retryWaitMin);
      continue;
    }
    log(`  ✗ failed again. Log: ${logFile}`);
    return { ok: false, result: text };
  }
}

function parseResult(stdout) {
  if (!stdout) return null;
  const trimmed = stdout.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const lines = trimmed.split(/\r?\n/).reverse();
    for (const line of lines) {
      if (!line.startsWith("{")) continue;
      try {
        const obj = JSON.parse(line);
        if (obj.type === "result" || "result" in obj) return obj;
      } catch {}
    }
  }
  return null;
}

// ---------- roadmap ----------

function readRoadmap() {
  if (!fs.existsSync(ROADMAP)) finish("failed", `Can't find ${ROADMAP}. Run the pipeline from the project root.`);
  const ms = [];
  let cur = null;
  for (const line of fs.readFileSync(ROADMAP, "utf8").split(/\r?\n/)) {
    const h = line.match(/^##\s+(M\d+[a-z]?)\b\.?\s*(.*)$/i);
    if (h) {
      cur = { id: h[1].toUpperCase(), title: h[2].trim(), tasks: [] };
      ms.push(cur);
      continue;
    }
    if (/^#{1,2}\s/.test(line)) {
      cur = null;
      continue;
    }
    const t = line.match(/^\s*[-*]\s+\[( |x|X)\]\s+(.*)$/);
    if (t && cur) {
      cur.tasks.push({
        done: t[1] !== " ",
        text: t[2].trim(),
        human: /\(human\)/i.test(t[2]),
        blocked: /\(blocked:[^)]*\)/i.test(t[2]),
      });
    }
  }
  return ms;
}

function findMilestone(id) {
  return readRoadmap().find((x) => x.id === id) || { tasks: [] };
}

function remaining(m) {
  return m.tasks.filter((t) => !t.done && !t.human && !t.blocked);
}

function nextMilestone(ms, state) {
  for (const m of ms) {
    const n = mNum(m.id);
    if (cfg.from && n < mNum(cfg.from)) continue;
    if (cfg.to && n > mNum(cfg.to)) continue;
    const st = state.milestones[m.id]?.status;
    const unfinishedRun = st === "running";
    const forced = st !== "done" && cfg.from && n === mNum(cfg.from);
    if (remaining(m).length > 0 || unfinishedRun || forced) {
      if (cfg.dryRun && state._dry?.includes(m.id)) continue;
      if (cfg.dryRun) (state._dry ??= []).push(m.id);
      return m;
    }
  }
  return null;
}

function needsDatabase(m) {
  if (mNum(m.id) >= 2) return true;
  return remaining(m).some((t) => /supabase|drizzle|database|migrat|db:/i.test(t.text));
}

// ---------- environment ----------

function preflight() {
  if (!fs.existsSync(".git")) finish("failed", "This folder isn't a git repository. Run the pipeline from the project root.");
  if (cfg.dryRun) return;
  const v = spawnSync(cfg.claudeBin, ["--version"], { encoding: "utf8" });
  if (v.status !== 0) finish("failed", `Couldn't run "${cfg.claudeBin} --version". Is Claude Code installed?`);
  log(`- Claude Code ${oneLine(v.stdout)}`);
  if (!cfg.noCodex && cfg.reviewer === "codex") codexAvailable();
  if (!gitClean()) {
    log("- ⚠ The working tree has uncommitted changes. The first stage will see them; commit or stash them if they aren't meant for the pipeline.");
  }
}

function databaseReady() {
  if (cfg.dryRun) return true;
  const docker = spawnSync("docker", ["info"], { encoding: "utf8", shell: IS_WIN });
  if (docker.status !== 0) {
    log("- ✗ Docker isn't running (or isn't installed).");
    return false;
  }
  const supa = spawnSync("supabase", ["--version"], { encoding: "utf8", shell: IS_WIN });
  if (supa.status !== 0) {
    log("- ✗ The Supabase CLI isn't installed.");
    return false;
  }
  if (fs.existsSync("supabase/config.toml")) {
    const status = spawnSync("supabase", ["status"], { encoding: "utf8", shell: IS_WIN });
    if (status.status !== 0) {
      log("- Starting the local Supabase stack (the first time can take several minutes)...");
      const start = spawnSync("supabase", ["start"], { encoding: "utf8", shell: IS_WIN, timeout: 30 * 60000, maxBuffer: 64 * 1024 * 1024 });
      if (start.status !== 0) {
        log(`- ✗ \`supabase start\` failed: ${short(oneLine(start.stderr || start.stdout || ""), 300)}`);
        return false;
      }
    }
  }
  return true;
}

// ---------- git ----------

function git(argsList) {
  return spawnSync("git", argsList, { cwd: ROOT, encoding: "utf8" });
}
function gitHead() {
  return oneLine(git(["rev-parse", "HEAD"]).stdout) || "HEAD";
}
function gitClean() {
  return oneLine(git(["status", "--porcelain"]).stdout) === "";
}
function commitLeftovers(m) {
  if (cfg.dryRun || gitClean()) return;
  log(`- ⚠ ${m.id} left uncommitted changes; committing them as a wrap-up commit.`);
  git(["add", "-A"]);
  git(["commit", "-m", `chore: pipeline wrap-up for ${m.id}`]);
}
function commitAll(message) {
  if (cfg.dryRun || gitClean()) return;
  git(["add", "-A"]);
  git(["commit", "-m", message]);
}
function tagMilestone(m) {
  if (cfg.dryRun) return;
  const tag = `${m.id.toLowerCase()}-done`;
  const exists = git(["rev-parse", "-q", "--verify", `refs/tags/${tag}`]).status === 0;
  git(exists ? ["tag", "-f", tag] : ["tag", tag]);
  log(`- Tagged ${tag}`);
}

// ---------- state, logging, helpers ----------

function readState() {
  try {
    return JSON.parse(fs.readFileSync(STATE, "utf8"));
  } catch {
    return { milestones: {} };
  }
}
function writeState(s) {
  if (cfg.dryRun) return;
  const { _dry, ...rest } = s;
  fs.writeFileSync(STATE, JSON.stringify(rest, null, 2));
}

function finish(kind, message) {
  const counts = decisionCounts();
  const summary = [
    "",
    `## Pipeline ${kind} ${time()}`,
    "",
    message,
    "",
    counts
      ? `Decisions waiting for you: ${counts.open} open (${counts.blocking} blocking), ${counts.human} human task(s). See ${DECISIONS}.`
      : "",
    `Blocked tasks in the roadmap: ${blockedTasks().length}.`,
    "",
  ].join("\n");
  log(summary);
  process.exit(kind === "finished" || kind === "stopped" ? 0 : 1);
}

function decisionCounts() {
  if (!fs.existsSync(DECISIONS)) return null;
  const text = fs.readFileSync(DECISIONS, "utf8");
  const open = (text.match(/^\s*-\s*\*{0,2}Status:?\*{0,2}:?\s*open\b/gim) || []).length;
  const blocking = (text.match(/^\s*-\s*\*{0,2}Blocking:?\*{0,2}:?\s*(yes|M\d+)/gim) || []).length;
  const humanSection = text.split(/^##\s+Human tasks/im)[1] || "";
  const human = (humanSection.split(/^##\s/m)[0].match(/^\s*-\s\[ \]/gm) || []).length;
  return { open, blocking, human };
}

function blockedTasks() {
  try {
    return readRoadmap().flatMap((m) => m.tasks.filter((t) => !t.done && t.blocked));
  } catch {
    return [];
  }
}

function checkStop() {
  if (fs.existsSync(STOP)) {
    fs.rmSync(STOP);
    finish("stopped", "Stopped because .pipeline/STOP was found. Run the pipeline again to continue where it left off.");
  }
}

function sleepMinutes(min) {
  const end = Date.now() + min * 60000;
  const buf = new Int32Array(new SharedArrayBuffer(4));
  while (Date.now() < end) {
    checkStop();
    Atomics.wait(buf, 0, 0, Math.min(30000, end - Date.now()));
  }
}

function log(line) {
  console.log(line);
  fs.mkdirSync(PDIR, { recursive: true });
  fs.appendFileSync(STATUS, `${line}\n`);
}

function parseArgs(list) {
  const out = {};
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const next = list[i + 1];
    if (next && !next.startsWith("--")) {
      out[key] = next;
      i++;
    } else out[key] = true;
  }
  return out;
}

function num(v, d) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : d;
}
// M5 -> 5, M5a -> 5.1, M5b -> 5.2, so sub-milestones sort between their neighbours.
function mNum(id) {
  const m = String(id).match(/(\d+)([a-z])?/i);
  if (!m) return 0;
  return Number(m[1]) + (m[2] ? (m[2].toLowerCase().charCodeAt(0) - 96) / 10 : 0);
}
function tail(s, n) {
  return s.split(/\r?\n/).slice(-n).join("\n");
}
function short(s, n) {
  s = String(s || "");
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}
function oneLine(s) {
  return String(s || "").replace(/\s+/g, " ").trim();
}
function time() {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
function stamp() {
  return new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
}

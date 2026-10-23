#!/usr/bin/env node
// LeaseDesk build pipeline.
//
// Runs the roadmap milestone by milestone, each stage in a fresh Claude Code session:
//   answers -> build (repeats until done) -> checks (+ fix loop) -> Claude review & decision sweep
//   -> checks -> Codex independent review (+ Claude fix loop, up to --codex-rounds)
//   -> checks -> wrap-up -> Codex sign-off -> git tag -> next milestone
//
// Usage (from the project root, in a normal terminal):
//   node scripts/pipeline.mjs                     run from the first unfinished milestone to the end
//   node scripts/pipeline.mjs --to M4             stop after M4
//   node scripts/pipeline.mjs --from M3 --to M3   run one milestone
//   node scripts/pipeline.mjs --dry-run           show what would run
//   node scripts/pipeline.mjs --fix-model sonnet  use a faster model for fix and review stages
//   node scripts/pipeline.mjs --no-codex          skip the Codex review stages
//   node scripts/pipeline.mjs --codex-model gpt-5 pick the Codex model
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
  noCodex: Boolean(args["no-codex"]),
  requireCodex: Boolean(args["require-codex"]),
  buildModel: args["build-model"] || null,
  fixModel: args["fix-model"] || null,
  reviewModel: args["review-model"] || args["fix-model"] || null,
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
};

// ---------- main ----------

main();

function main() {
  fs.mkdirSync(LOGS, { recursive: true });
  fs.mkdirSync(REVIEWS, { recursive: true });
  if (fs.existsSync(STOP)) fs.rmSync(STOP);
  log(`\n# Pipeline run ${new Date().toLocaleString()}\n`);

  preflight();
  const state = readState();

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

    // 4. Independent review by Codex, with Claude fixing what it finds.
    if (codexEnabled()) {
      const verdict = codexReviewLoop(m, state.milestones[m.id].startSha);
      if (verdict === "failed") finish("failed", `Codex review stage for ${m.id} failed. See .pipeline/logs/.`);
    }

    // 5. Wrap up.
    const w = runClaude("wrap", m, wrapPrompt(m), cfg.reviewModel);
    if (!w.ok) finish("failed", `Wrap-up for ${m.id} failed: ${short(w.result, 300)}`);
    commitLeftovers(m);

    // 6. Codex sign-off: an independent verdict on the finished milestone, saved for the founder.
    if (codexEnabled()) codexSignOff(m, state.milestones[m.id].startSha);
    tagMilestone(m);

    state.milestones[m.id].status = "done";
    state.milestones[m.id].doneAt = new Date().toISOString();
    writeState(state);
    log(`\n**${m.id} done.**`);

    if (cfg.to && mNum(m.id) >= mNum(cfg.to)) break;
    applyAnswers(state); // pick up any answers given while it ran
  }

  finish("finished", "All selected milestones are done.");
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

// ---------- Codex (independent reviewer) ----------

function codexEnabled() {
  return !cfg.noCodex && (cfg.dryRun || codexAvailable());
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

function runCodex(stage, m, prompt) {
  fs.writeFileSync(CODEX_SCHEMA, JSON.stringify(codexSchema()));
  const outFile = path.join(REVIEWS, `${m.id}-${stage}.json`);
  const cliArgs = ["exec", "--sandbox", "read-only", "--output-schema", CODEX_SCHEMA, "-o", outFile, "--color", "never"];
  if (cfg.codexModel) cliArgs.push("-m", cfg.codexModel);
  cliArgs.push(prompt);
  let limitWaits = 0;
  let retried = false;
  for (;;) {
    checkStop();
    const started = Date.now();
    log(`- ▶ ${m.id} ${stage} (Codex) started ${time()}`);
    if (cfg.dryRun) {
      log(`  (dry run) codex exec --sandbox read-only <${prompt.length} character prompt>`);
      return { ok: true, report: { verdict: "pass", summary: "dry run", must_fix: [], should_fix: [], verified: [] } };
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
    const report = parseCodexReport(outFile, r.stdout);
    if (r.status === 0 && report) {
      log(`  ✔ done in ${mins} min: ${report.verdict}, ${report.must_fix.length} must-fix, ${report.should_fix.length} should-fix. ${short(oneLine(report.summary), 300)}`);
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

function parseCodexReport(outFile, stdout) {
  const candidates = [];
  try {
    candidates.push(fs.readFileSync(outFile, "utf8"));
  } catch {}
  if (stdout) candidates.push(stdout);
  for (const c of candidates) {
    const text = String(c).trim();
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start < 0 || end < start) continue;
    try {
      const obj = JSON.parse(text.slice(start, end + 1));
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

// Codex reviews; Claude fixes must-fix items; repeat until Codex is satisfied or rounds run out.
function codexReviewLoop(m, startSha) {
  for (let round = 1; round <= cfg.codexRounds; round++) {
    const r = runCodex(`codex-review-${round}`, m, codexReviewContext(m, startSha));
    if (!r.ok) return "failed";
    const mdFile = path.join(REVIEWS, `${m.id}-codex-review-${round}.md`);
    fs.writeFileSync(mdFile, reportToMarkdown(`Codex review of ${m.id}, round ${round}`, r.report));
    if (r.report.must_fix.length === 0) {
      if (r.report.should_fix.length && !cfg.dryRun) {
        const f = runClaude(`codex-triage`, m, codexTriagePrompt(m, mdFile), cfg.fixModel);
        if (!f.ok) return "failed";
        if (!checksWithFixes(m, "after Codex triage")) return "failed";
      }
      return "pass";
    }
    log(`- Codex found ${r.report.must_fix.length} must-fix item(s); asking Claude to fix them (round ${round}/${cfg.codexRounds}).`);
    const f = runClaude(`codex-fix-${round}`, m, codexFixPrompt(m, mdFile), cfg.fixModel);
    if (!f.ok) return "failed";
    if (!checksWithFixes(m, `after Codex fixes (round ${round})`)) return "failed";
  }
  log(`- ⚠ Codex still had must-fix items after ${cfg.codexRounds} round(s). Logged to docs/DECISIONS_NEEDED.md for you; continuing.`);
  const n = runClaude("codex-escalate", m, codexEscalatePrompt(m), cfg.fixModel);
  return n.ok ? "unresolved" : "failed";
}

function codexFixPrompt(m, mdFile) {
  return `${header("codex-fix", m)}

An independent reviewer (OpenAI Codex, which did not write this code) reviewed ${m.id} and found problems. Its report is in ${mdFile}; read it in full.

For each item under "Must fix":
1. Check the evidence yourself against docs/BILLING_RULES.md, CLAUDE.md and the code. The reviewer can be wrong.
2. If it's right: fix it properly, test-first (a failing test with a hand calculation in a comment, then the fix). One commit per item: "fix(${m.id}): <what>, found by Codex review".
3. If it's wrong: don't change the code. Append a short "Disputed" note to ${mdFile} explaining why, with the spec line that supports the current behaviour.
Then go through "Should fix": fix the small, clearly correct ones; add the rest to docs/BACKLOG.md.
Never weaken, skip or delete tests, and never change golden expectations in docs/BILLING_RULES.md. Finish with pnpm typecheck, pnpm lint and pnpm test passing.`;
}

function codexTriagePrompt(m, mdFile) {
  return `${header("codex-triage", m)}

An independent reviewer (OpenAI Codex) reviewed ${m.id} and found no must-fix problems, but listed suggestions under "Should fix" in ${mdFile}. Read it. Fix the ones that are small and clearly right (one commit each, "fix(${m.id}): <what>, from Codex review"); add the rest to docs/BACKLOG.md with file, problem and suggested fix. Don't weaken tests. Finish with pnpm typecheck, pnpm lint and pnpm test passing.`;
}

function codexEscalatePrompt(m) {
  return `${header("codex-escalate", m)}

Codex (an independent reviewer) and you disagree, or its must-fix items couldn't be resolved, after ${cfg.codexRounds} rounds. Read the latest file matching .pipeline/reviews/${m.id}-codex-review-*.md. Add one entry to docs/DECISIONS_NEEDED.md of Type "product", Blocking: no, titled "Codex review of ${m.id}: unresolved items", with the remaining items, what each side says, and your recommendation. Update the summary table. Commit as "docs: escalate Codex review of ${m.id}".`;
}

// Final independent verdict on the finished milestone, saved where the founder reads milestone reports.
function codexSignOff(m, startSha) {
  const prompt = [
    codexReviewContext(m, startSha),
    "",
    `This is the final sign-off after all fixes. Also read docs/milestones/${m.id}.md, the plain-language report written for the founder, and check that every claim in it is true in the code. Any false claim is a must_fix. In summary, write three to five sentences for a non-technical founder: what this milestone delivers, how confident you are in the money calculations, and what they should look at themselves.`,
  ].join("\n");
  const r = runCodex("codex-signoff", m, prompt);
  if (!r.ok) {
    log("- ⚠ Codex sign-off failed; continuing without it.");
    return;
  }
  const md = reportToMarkdown(`Independent review of ${m.id} (Codex)`, r.report);
  fs.writeFileSync(path.join(REVIEWS, `${m.id}-codex-signoff.md`), md);
  if (!cfg.dryRun) {
    fs.mkdirSync("docs/milestones", { recursive: true });
    fs.writeFileSync(path.join("docs/milestones", `${m.id}-independent-review.md`), md);
    git(["add", "docs/milestones"]);
    git(["commit", "-m", `docs: Codex sign-off for ${m.id} (${r.report.verdict})`]);
  }
  if (r.report.verdict === "fail") {
    log(`- ⚠ Codex sign-off for ${m.id} is FAIL with ${r.report.must_fix.length} item(s). Read docs/milestones/${m.id}-independent-review.md.`);
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

function runClaude(stage, m, prompt, model) {
  const cliArgs = ["-p", prompt, "--output-format", "json", "--permission-mode", "auto", "--permission-prompts", "none"];
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
      return { ok: true, result: out.result || "" };
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
    const h = line.match(/^##\s+(M\d+)\b\.?\s*(.*)$/);
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
  if (!cfg.noCodex) codexAvailable();
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
function mNum(id) {
  return Number(String(id).replace(/\D/g, "")) || 0;
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

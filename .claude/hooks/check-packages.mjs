#!/usr/bin/env node
// PreToolUse hook for Bash: only lets Claude install packages listed in .claude/approved-packages.txt.
// Anything else is blocked with a message telling Claude to log it in docs/DECISIONS_NEEDED.md.
// The founder approves a package by adding its name to the list.

import fs from "node:fs";
import path from "node:path";

let input = "";
process.stdin.on("data", (c) => (input += c));
process.stdin.on("end", () => {
  let command = "";
  let cwd = process.cwd();
  try {
    const data = JSON.parse(input);
    command = data?.tool_input?.command || "";
    cwd = data?.cwd || cwd;
  } catch {
    process.exit(0); // not our business
  }

  const projectDir = process.env.CLAUDE_PROJECT_DIR || cwd;
  const approved = loadApproved(path.join(projectDir, ".claude", "approved-packages.txt"));

  const problems = [];
  for (const segment of command.split(/&&|\|\||;|\||\n/)) {
    const words = segment.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) continue;
    // skip leading env assignments like FOO=bar
    while (words.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(words[0])) words.shift();
    const [tool, sub, ...rest] = words;

    if (["npm", "yarn", "bun"].includes(tool) && ["install", "i", "add", "ci"].includes(sub)) {
      problems.push(`This project uses pnpm, not ${tool}.`);
      continue;
    }
    if (tool === "npx") {
      const pkg = baseName((sub || "").replace(/^-+.*$/, ""));
      if (pkg && !isApproved(pkg, approved)) problems.push(`"npx ${sub}" runs an unapproved package (${pkg}).`);
      continue;
    }
    if (tool !== "pnpm") continue;

    if (sub === "dlx") {
      const pkg = baseName(rest.find((w) => !w.startsWith("-")) || "");
      if (pkg && !isApproved(pkg, approved)) problems.push(`"pnpm dlx ${pkg}" isn't approved.`);
      continue;
    }
    if (["add", "install", "i"].includes(sub)) {
      const pkgs = rest.filter((w) => !w.startsWith("-"));
      if (sub !== "add" && pkgs.length === 0) continue; // plain "pnpm install" just installs the lockfile
      for (const p of pkgs) {
        const name = baseName(p);
        if (!isApproved(name, approved)) problems.push(`Package "${name}" isn't on the approved list.`);
      }
    }
  }

  if (problems.length) {
    process.stderr.write(
      `${problems.join(" ")} Don't install it and don't work around this check. ` +
        `If the task really needs it, add an entry of Type "package" to docs/DECISIONS_NEEDED.md ` +
        `(what it's for, alternatives you considered, size and licence), tag the task (blocked: D-xxx) if it can't proceed without it, and carry on with other work.\n`,
    );
    process.exit(2);
  }
  process.exit(0);
});

function loadApproved(file) {
  try {
    return fs
      .readFileSync(file, "utf8")
      .split(/\r?\n/)
      .map((l) => l.replace(/#.*$/, "").trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

// "@scope/name@1.2.3" -> "@scope/name", "name@latest" -> "name"
function baseName(spec) {
  if (!spec) return "";
  if (/^(https?:|git\+|file:|link:)/.test(spec)) return spec; // URLs must be listed exactly
  if (spec.startsWith("@")) {
    const [scope, rest = ""] = spec.slice(1).split("/");
    return `@${scope}/${rest.split("@")[0]}`;
  }
  return spec.split("@")[0];
}

// Entries ending in * match by prefix, e.g. "@radix-ui/*" or "eslint-*".
function isApproved(name, list) {
  return list.some((entry) => (entry.endsWith("*") ? name.startsWith(entry.slice(0, -1)) : name === entry));
}

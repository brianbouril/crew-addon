// PreToolUse guard for the reviewer subagent (.claude/agents/reviewer.md): Bash may only run the
// mock tests and read-only git commands. Anything else is blocked (exit 2, reason on stderr).
// Reads the hook's JSON from stdin: { tool_input: { command } }.
import { readFileSync } from "node:fs";

let command = "";
try {
  command = String(JSON.parse(readFileSync(0, "utf8").replace(/^﻿/, ""))?.tool_input?.command ?? "").trim();
} catch {
  block("couldn't read the command");
}

// No chaining, pipes, redirects or substitutions: one plain command only.
if (/[;&|<>`]|\$\(/.test(command)) block("one plain command only (no ; & | < > ` or $( ))");

const allowed = [
  /^node\s+(\.\/)?tools[\\/]sim[\\/]run\.mjs$/,
  /^(git|"?C:\\Program Files\\Git\\cmd\\git\.exe"?)\s+(diff|log|show|status|merge-base|rev-parse|branch|ls-files|blame|worktree\s+list)(\s|$)/,
];
if (!allowed.some((re) => re.test(command))) {
  block("the reviewer may only run `node tools/sim/run.mjs` and read-only git (diff, log, show, status, merge-base, rev-parse, branch, ls-files, blame, worktree list)");
}
// Read-only git subcommands can still write with these options.
if (/\s--output(=|\s)|\s(-D|-d|-m|-M|--delete|--move|--set-upstream-to)\b/.test(command)) block("that git option changes the repo");
process.exit(0);

/** @param {string} why @returns {never} */
function block(why) {
  process.stderr.write(`Blocked for the reviewer: ${why}. Command was: ${command}\n`);
  process.exit(2);
}

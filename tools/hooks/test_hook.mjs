// Claude Code hook (.claude/settings.json): runs the mock tests and reports failures to Claude.
//   node tools/hooks/test_hook.mjs post   PostToolUse on Edit|Write: run the tests; on failure,
//                                          exit 2 so the failing steps go back to Claude.
//   node tools/hooks/test_hook.mjs stop   Stop: block ending the session while the tests fail
//                                          (skips the run if nothing changed since the last pass).
// Tests run against this checkout (the worktree the script lives in). Node 18+, no installs.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const STATE = join(ROOT, ".claude", "test-hook-state.json");
const mode = process.argv[2] === "stop" ? "stop" : "post";

// What the tests depend on: the scripts, the mock and the tests.
const WATCHED = ["crew_bp/scripts", "tools/sim"];

const fingerprint = (() => {
  const h = createHash("sha256");
  const walk = (dir) => {
    if (!existsSync(dir)) return;
    for (const name of readdirSync(dir).sort()) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else h.update(full.slice(ROOT.length)).update(readFileSync(full));
    }
  };
  for (const d of WATCHED) walk(join(ROOT, d));
  return h.digest("hex");
})();

const readState = () => {
  try { return JSON.parse(readFileSync(STATE, "utf8")); } catch { return {}; }
};

if (mode === "stop" && readState().passed === fingerprint) process.exit(0);

const run = spawnSync(process.execPath, [join(ROOT, "tools", "sim", "run.mjs")], {
  cwd: ROOT, encoding: "utf8", timeout: 240_000, maxBuffer: 64 * 1024 * 1024,
});
const output = `${run.stdout ?? ""}${run.stderr ?? ""}`;
const passed = run.status === 0;

try {
  mkdirSync(dirname(STATE), { recursive: true });
  writeFileSync(STATE, JSON.stringify({ passed: passed ? fingerprint : null, at: new Date().toISOString() }));
} catch { /* state is only a speed-up */ }

if (passed) process.exit(0);

// Failure report: the failed steps, then the tail of each failing step's output.
const failed = output.split(/\r?\n/).filter((l) => l.startsWith("!! ")).map((l) => l.slice(3).replace(/ failed$/, ""));
const sections = output.split(/\r?\n(?=== )/);
const detail = sections
  .filter((s) => failed.some((f) => s.startsWith(`== ${f}\n`) || s.startsWith(`== ${f}\r\n`)))
  .map((s) => s.split(/\r?\n/).slice(-25).join("\n"))
  .join("\n\n");
const reason = run.error
  ? `Mock tests couldn't run: ${run.error.message}`
  : `Mock tests failed (node tools/sim/run.mjs, exit ${run.status}):\n${failed.map((f) => `- ${f}`).join("\n") || "(no step named; see output)"}\n\n${(detail || output.slice(-3000)).trim()}`;

process.stderr.write(mode === "stop"
  ? `${reason}\n\nFix the failing tests before ending the session (CLAUDE.md: main is always playable). If a failing test is a new test for a feature not built yet, mark its step { todo: true } in tools/sim/run.mjs.\n`
  : `${reason}\n`);
process.exit(2);

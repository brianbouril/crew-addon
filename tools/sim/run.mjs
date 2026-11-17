// Runs the job logic against an in-memory mock world (no Minecraft needed).
// Same steps as run.sh, but needs only Node 18+ (works on Windows without sh).
// Usage: node tools/sim/run.mjs   (from the project folder)
import { cpSync, mkdtempSync, mkdirSync, readdirSync, writeFileSync, copyFileSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const W = mkdtempSync(join(tmpdir(), "crew-sim-"));
mkdirSync(join(W, "node_modules", "@minecraft"), { recursive: true });
mkdirSync(join(W, "scripts"));
for (const m of ["server", "server-ui"])
  cpSync(join(HERE, "mock", "@minecraft", m), join(W, "node_modules", "@minecraft", m), { recursive: true });
const scripts = join(ROOT, "crew_bp", "scripts");
for (const f of readdirSync(scripts)) if (f.endsWith(".js")) copyFileSync(join(scripts, f), join(W, "scripts", f));
for (const f of readdirSync(HERE)) if (f.endsWith(".mjs") && f !== "run.mjs") copyFileSync(join(HERE, f), join(W, f));
writeFileSync(join(W, "package.json"), '{"type":"module"}');

const steps = [
  ["quarry (keep all)", ["quarry_test.mjs", "all"]],
  ["quarry at normal pace (no snapping)", ["quarry_test.mjs", "all", "normal"]],
  ["branch mine", ["branch_test.mjs"]],
  ["branch mine, 1-wide trunk", ["branch_test.mjs", "1"]],
  ["branch mine, 3-wide trunk", ["branch_test.mjs", "3"]],
  ["tool kit", ["kit_test.mjs"]],
  ["permissions and resume", ["crew_test.mjs"]],
  ["drop off", ["dropoff_test.mjs"]],
  ["headroom", ["headroom_test.mjs"]],
  ["stop, drop off, continue", ["resume_test.mjs"]],
  ["home, sleep, energy", ["life_test.mjs"]],
  ["doors", ["door_test.mjs"]],
  ["quarry, clear above (hill and tree)", ["clear_test.mjs"]],
  ["out of tools: takes one from a chest", ["tool_test.mjs"]],
  ["restart a half-dug quarry", ["restart_test.mjs"]],
  ["reaching a chest (inside a house; light blocks)", ["chest_test.mjs"]],
  ["Digger and Miner roles", ["roles_test.mjs"]],
  ["settlement (release 1)", ["settlement_test.mjs"]],
  ["main.js loads", ["-e", 'import("./scripts/main.js").then(() => console.log("ok"))']],
  // A test written before its feature (test-writer subagent) goes in with { todo: true }: it runs,
  // but its failure doesn't fail the run. The builder removes the flag once it passes; a branch
  // with a todo step left doesn't merge (reviewer checks).
  // e.g. ["hauler", ["hauler_test.mjs"], { todo: true }],
];
let failed = 0;
const todo = [];
for (const [name, args, opts] of steps) {
  console.log(`== ${name}`);
  try {
    execFileSync(process.execPath, args, { cwd: W, stdio: "inherit" });
    if (opts?.todo) console.log(`-- todo step "${name}" passes now: remove { todo: true } in tools/sim/run.mjs`);
  } catch {
    if (opts?.todo) { todo.push(name); console.log(`-- todo: ${name} (failing, expected until it's built)`); }
    else { failed++; console.log(`!! ${name} failed`); }
  }
}
if (todo.length) console.log(`\n${todo.length} todo step(s) still failing: ${todo.join(", ")}`);
rmSync(W, { recursive: true, force: true });
process.exit(failed ? 1 : 0);

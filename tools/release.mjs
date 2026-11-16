// Cuts a release: runs the tests, sets the version everywhere it lives, regenerates the player
// guide, builds dist/crew-addon-<version>.mcaddon, and commits + tags it in git.
// Node 18+, no installs. Usage (from the project folder):
//   node tools/release.mjs 0.4.0          full release (needs a clean git tree)
//   node tools/release.mjs 0.4.1 --build-only   bump + build, no git (for a quick local package)
//
// The version is set by tools/bump_version.py (both manifests and VERSION in util.js, together) and
// the package is built by tools/build.py (the one build command), so those need Python 3. A server
// only sends players a new resource pack when its version changes, so every server update needs a
// new version.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const version = process.argv[2];
const buildOnly = process.argv.includes("--build-only");
if (!/^\d+\.\d+\.\d+$/.test(version ?? "")) {
  console.error("Usage: node tools/release.mjs <major.minor.patch> [--build-only]   e.g. node tools/release.mjs 0.4.0");
  process.exit(1);
}
const parts = version.split(".").map(Number);
const step = (s) => console.log(`\n== ${s}`);

// ---------- git ----------
const GIT = (() => {
  for (const g of ["git", "C:\\Program Files\\Git\\cmd\\git.exe"]) {
    try {
      execFileSync(g, ["--version"], { stdio: "ignore" });
      return g;
    } catch {
      /* try the next */
    }
  }
  return undefined;
})();
const git = (...args) => execFileSync(/** @type {string} */ (GIT), args, { cwd: ROOT, encoding: "utf8" }).trim();
if (!buildOnly) {
  if (!GIT) fail("git isn't installed (or use --build-only).");
  if (git("status", "--porcelain")) fail("there are uncommitted changes. Commit them first, so the release is only the version bump.");
  if (git("tag", "--list", `v${version}`)) fail(`tag v${version} already exists.`);
}

// ---------- tests first: nothing is changed if they fail ----------
step("tests");
try {
  execFileSync(process.execPath, [join(ROOT, "tools/sim/run.mjs")], { cwd: ROOT, stdio: ["ignore", "ignore", "inherit"] });
  console.log("all passed");
} catch {
  fail("the tests failed (run node tools/sim/run.mjs to see why). Nothing was changed.");
}

// ---------- set the version (tools/bump_version.py: both manifests and util.js together) ----------
step(`version ${version}`);
python("tools/bump_version.py", version);

// the changelog's "Unreleased" section becomes this version
const clPath = join(ROOT, "CHANGELOG.md");
if (!buildOnly && existsSync(clPath)) {
  const cl = readFileSync(clPath, "utf8");
  if (cl.includes("## Unreleased")) {
    writeFileSync(clPath, cl.replace("## Unreleased", `## Unreleased\n\n(nothing yet)\n\n## v${version}`));
    console.log("CHANGELOG.md: Unreleased -> v" + version);
  }
}

// ---------- player guide ----------
step("player guide");
execFileSync(process.execPath, [join(ROOT, "tools/make_guide.mjs")], { cwd: ROOT, stdio: "inherit" });

// ---------- package (tools/build.py, the one build command; the tests already ran above) ----------
step("package");
const out = join(ROOT, "dist", `crew-addon-${version}.mcaddon`);
python("tools/build.py", "--skip-tests");

// ---------- commit and tag ----------
if (!buildOnly) {
  step("git");
  git("add", "-A");
  git("commit", "-q", "-m", `Release v${version}`);
  git("tag", "-a", `v${version}`, "-m", `Crew Workers v${version}`);
  console.log(`committed and tagged v${version}`);
}
console.log(`\nDone. Install ${relative(ROOT, out)} locally by double-clicking it, or put the crew_bp and crew_rp folders on the server (README "Install on Bedrock Dedicated Server") and set version [${parts.join(", ")}] in the world's pack lists.`);

// ---------- helpers ----------
/** @param {string} msg @returns {never} */
function fail(msg) {
  console.error(`\nRelease stopped: ${msg}`);
  process.exit(1);
}

/** Runs a Python tool script (bump_version.py, build.py); stops the release if it fails. */
function python(script, ...args) {
  const PY = findPython();
  if (!PY) fail("Python 3 isn't installed (needed for tools/bump_version.py and tools/build.py). Install it (e.g. `winget install Python.Python.3.12`), or set CREW_PYTHON to a python.exe.");
  try {
    execFileSync(PY[0], [...PY.slice(1), join(ROOT, script), ...args], { cwd: ROOT, stdio: "inherit" });
  } catch {
    fail(`${script} failed (see above).`);
  }
}

/** The Python 3 command: CREW_PYTHON, else python3, python or py -3 (skips the Windows Store stub). */
function findPython() {
  const tries = [process.env.CREW_PYTHON ? [process.env.CREW_PYTHON] : null, ["python3"], ["python"], ["py", "-3"]].filter(Boolean);
  for (const cmd of /** @type {string[][]} */ (tries)) {
    try {
      const v = execFileSync(cmd[0], [...cmd.slice(1), "--version"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
      if (/Python 3\./.test(v)) return cmd;
    } catch { /* try the next */ }
  }
  return undefined;
}

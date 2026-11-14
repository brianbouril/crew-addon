// Cuts a release: runs the tests, sets the version everywhere it lives, regenerates the player
// guide, builds dist/crew-addon-<version>.mcaddon, and commits + tags it in git.
// Node 18+, no installs. Usage (from the project folder):
//   node tools/release.mjs 0.4.0          full release (needs a clean git tree)
//   node tools/release.mjs 0.4.1 --build-only   bump + build, no git (for a quick local package)
//
// Where the version lives: both manifests (header, modules, and the behavior pack's dependency on
// the resource pack) and VERSION in crew_bp/scripts/util.js. A server only sends players a new
// resource pack when its version changes, so every server update needs a new version.
import { execFileSync } from "node:child_process";
import { deflateRawSync } from "node:zlib";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
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

// ---------- set the version ----------
step(`version ${version}`);
const RP_UUID = JSON.parse(readFileSync(join(ROOT, "crew_rp/manifest.json"), "utf8")).header.uuid;
for (const file of ["crew_bp/manifest.json", "crew_rp/manifest.json"]) {
  const path = join(ROOT, file);
  const m = JSON.parse(readFileSync(path, "utf8"));
  m.header.version = parts;
  for (const mod of m.modules ?? []) mod.version = parts;
  for (const dep of m.dependencies ?? []) if (dep.uuid === RP_UUID) dep.version = parts;
  writeFileSync(path, `${JSON.stringify(m, null, 2)}\n`);
  console.log(`${file}: ${version}`);
}
const utilPath = join(ROOT, "crew_bp/scripts/util.js");
writeFileSync(utilPath, readFileSync(utilPath, "utf8").replace(/export const VERSION = "[^"]*";/, `export const VERSION = "${version}";`));
console.log(`crew_bp/scripts/util.js: VERSION = "${version}"`);

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

// ---------- package ----------
step("package");
const out = join(ROOT, "dist", `crew-addon-${version}.mcaddon`);
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, zip([
  { name: "crew_bp.mcpack", data: zip(filesIn("crew_bp")) },
  { name: "crew_rp.mcpack", data: zip(filesIn("crew_rp")) },
]));
console.log(`${relative(ROOT, out)} (${statSync(out).size} bytes)`);

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

/** Every file under a pack folder, paths relative to it with forward slashes, sorted (so builds are repeatable). @param {string} folder */
function filesIn(folder) {
  const base = join(ROOT, folder);
  /** @type {{name: string, data: Buffer}[]} */
  const out = [];
  const walk = (dir) => {
    for (const ent of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = join(dir, ent.name);
      if (ent.isDirectory()) walk(full);
      else out.push({ name: relative(base, full).split("\\").join("/"), data: readFileSync(full) });
    }
  };
  walk(base);
  return out;
}

/** A standard zip (deflate), as the Python build made. @param {{name: string, data: Buffer}[]} entries */
function zip(entries) {
  const CRC = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc32 = (buf) => {
    let c = 0xffffffff;
    for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const local = [], central = [];
  let offset = 0;
  for (const { name, data } of entries) {
    const nameBuf = Buffer.from(name, "utf8");
    const packed = deflateRawSync(data, { level: 9 });
    const crc = crc32(data);
    const head = Buffer.alloc(30);
    head.writeUInt32LE(0x04034b50, 0); head.writeUInt16LE(20, 4); head.writeUInt16LE(0x0800, 6); head.writeUInt16LE(8, 8);
    head.writeUInt16LE(0, 10); head.writeUInt16LE(0x21, 12); // fixed 1980-01-01 timestamp: same files, same zip
    head.writeUInt32LE(crc, 14); head.writeUInt32LE(packed.length, 18); head.writeUInt32LE(data.length, 22);
    head.writeUInt16LE(nameBuf.length, 26); head.writeUInt16LE(0, 28);
    local.push(head, nameBuf, packed);
    const dir = Buffer.alloc(46);
    dir.writeUInt32LE(0x02014b50, 0); dir.writeUInt16LE(20, 4); dir.writeUInt16LE(20, 6); dir.writeUInt16LE(0x0800, 8); dir.writeUInt16LE(8, 10);
    dir.writeUInt16LE(0, 12); dir.writeUInt16LE(0x21, 14);
    dir.writeUInt32LE(crc, 16); dir.writeUInt32LE(packed.length, 20); dir.writeUInt32LE(data.length, 24);
    dir.writeUInt16LE(nameBuf.length, 28); dir.writeUInt32LE(offset, 42);
    central.push(dir, nameBuf);
    offset += 30 + nameBuf.length + packed.length;
  }
  const cd = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, cd, end]);
}

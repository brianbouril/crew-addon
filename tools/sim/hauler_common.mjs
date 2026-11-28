// Shared helpers for hauler_test.mjs and hauler2_test.mjs (specs/hauler.md, done criterion 1).
// Not a test itself (run.mjs only runs what's in its steps list). The tests are black-box where
// they can be: chests, time of day, ticks, containers, crew:job / crew:state, log.commands and the
// console's [Crew-Event] lines; the few functions they call are the ones in the builder's
// interface contract (Nov 18).
import { world, tick, Container, ItemStack, BlockPermutation, fire } from "@minecraft/server";

export const ow = world.getDimension("minecraft:overworld");
export const logs = [];
const out = console.log;
console.log = (...a) => logs.push(a.join(" "));
console.warn = (...a) => logs.push("WARN " + a.join(" "));
/** Prints to the real console (console.log is captured for [Crew-Event] lines). */
export const print = (...a) => out(...a);

export const fails = [];
let passed = 0;
/** One named check. A failed one is listed with the actual value. */
export function check(name, ok, detail) {
  if (ok) passed++;
  else fails.push(detail === undefined ? name : `${name}: ${JSON.stringify(detail)}`);
}

/** Loads the contract's functions, wherever the builder put them (hauler.js first). A missing one is a failed check. */
export async function loadApi(names) {
  const mods = {};
  for (const m of ["hauler", "tools", "settlement", "life", "workers", "runner", "orders", "catalog"]) {
    try {
      mods[m] = await import(`./scripts/${m}.js`);
    } catch (err) {
      if (m === "hauler") fails.push(`feature missing: scripts/hauler.js doesn't load (${String(err).split("\n")[0]})`);
    }
  }
  const api = {};
  const missing = [];
  for (const n of names) {
    const mod = Object.values(mods).find((x) => x && n in x);
    if (mod) api[n] = mod[n];
    else missing.push(n);
  }
  if (missing.length) fails.push(`feature missing: no export ${missing.join(", ")}`);
  return api;
}

/** Ends the test: prints the result and exits 1 on any failed check or script warning. */
export function finish(title) {
  const warns = logs.filter((l) => l.startsWith("WARN"));
  out(JSON.stringify({ checks: title, passed, failed: fails.length, warnings: warns.length }, null, 1));
  for (const f of fails) out("FAIL", f);
  if (warns.length) out(warns.slice(0, 5).join("\n"));
  process.exit(fails.length || warns.length ? 1 : 0);
}

let t = 0;
export const now = () => t;
/** Runs n ticks; `each` is called after every tick. */
export function run(n, each) {
  for (const end = t + n; t < end;) {
    tick(++t);
    each?.(t);
  }
}
/** Runs until cond() holds (checked every tick) or max ticks pass. Returns whether it held. */
export function runUntil(cond, max, each) {
  const end = t + max;
  while (t < end) {
    tick(++t);
    each?.(t);
    if (cond()) return true;
  }
  return cond();
}

/** A mock player. */
export const mkPlayer = (id, name, op = false, at = { x: 5000, y: 65, z: 5000 }) => ({
  id, name, isValid: true, isSneaking: true, commandPermissionLevel: op ? 2 : 0, dimension: ow, location: { ...at }, msgs: [], inv: new Container(36),
  sendMessage(m) { this.msgs.push(String(m)); }, getComponent(n) { return n === "minecraft:inventory" ? { container: this.inv } : undefined; },
});
export const asBy = (p) => ({ id: p.id, name: p.name, isOp: p.commandPermissionLevel >= 1 });

/** Places a bell (on stone) as `who` would, through the place-block event. */
export function placeBell(who, at) {
  ow.setBlockType({ ...at, y: at.y - 1 }, "minecraft:stone");
  ow.getBlock(at).setPermutation(BlockPermutation.resolve("minecraft:bell", { attachment: "standing", direction: 0 }));
  fire("world.afterEvents.playerPlaceBlock", { player: who, block: ow.getBlock(at), dimension: ow });
  return ow.getBlock(at);
}

/** A chest at `at` holding these [id, amount] items (amount over 64 makes several stacks). */
export function chest(at, items = []) {
  ow.setBlockType(at, "minecraft:chest");
  const c = ow.getBlock(at).getComponent("minecraft:inventory").container;
  for (const [id, n] of items) fill(c, id, n);
  return c;
}
/** Adds n of id to a container. */
export function fill(c, id, n) {
  const left = c.addItem(new ItemStack(id, n));
  if (left) throw new Error(`test setup: ${id} doesn't fit`);
}
export const containerAt = (p) => ow.getBlock(p)?.getComponent("minecraft:inventory")?.container;
export const usedSlots = (c) => c.items.filter(Boolean).length;
/** id -> amount over some containers (or slot lists). `skip` leaves out an item id. */
export function sumOf(lists, skip) {
  const sum = {};
  for (const items of lists) for (const it of items) if (it && it.typeId !== skip) sum[it.typeId] = (sum[it.typeId] ?? 0) + it.amount;
  return sum;
}
export const same = (a, b) => JSON.stringify(Object.entries(a).sort()) === JSON.stringify(Object.entries(b).sort());
export const countOf = (items, id) => items.filter((i) => i?.typeId === id).reduce((a, i) => a + i.amount, 0);
/** A container's contents as a comparable string. */
export const snap = (items) => JSON.stringify(items.map((i) => (i ? [i.typeId, i.amount, i.nameTag ?? "", i.damage ?? 0] : null)));

/** What a Hauler carries: every item but its gear (slots 0-1) and its chest supply. */
export const carried = (e) => e.inv.items.slice(2).filter((i) => i && i.typeId !== "minecraft:chest");
export const cargoStacks = (e) => carried(e).length;
export const chestSupply = (e) => countOf(e.inv.items, "minecraft:chest");

/** Every distinct container of a chest block in the box (y = chest level), and where the chest blocks are. */
export function chestsIn(x0, z0, x1, z1, y, exclude = new Set()) {
  const cells = [];
  const conts = new Set();
  for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
    const p = { x, y, z };
    if (exclude.has(`${x},${z}`)) continue;
    if (!/chest/.test(ow.typeAt(p))) continue;
    cells.push(p);
    conts.add(containerAt(p));
  }
  return { cells, conts: [...conts] };
}

/** [Crew-Event] lines as objects, optionally of one type and one worker. */
export function events(type, worker) {
  const evs = [];
  for (const l of logs) {
    if (!l.startsWith("[Crew-Event] ")) continue;
    try {
      const ev = JSON.parse(l.slice(13));
      if ((!type || ev.type === type) && (!worker || ev.worker === worker)) evs.push(ev);
    } catch {
      /* not JSON */
    }
  }
  return evs;
}

export const jobOf = (e) => JSON.parse(String(e.getDynamicProperty("crew:job") ?? "null"));
export const stateOf = (e) => JSON.parse(String(e.getDynamicProperty("crew:state") ?? "{}"));
export const flat = (e, p) => Math.hypot(e.location.x - (p.x + 0.5), e.location.z - (p.z + 0.5));
export const key = (p) => `${p.x},${p.y},${p.z}`;

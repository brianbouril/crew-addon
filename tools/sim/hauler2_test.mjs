// Hauler, part 2 (specs/hauler.md, done criterion 1): Schedule, Ticking area, Reload (settlement
// "Ridgeway", Brian's, around x 5500) and Depot full, the chest maximum, Night and energy
// (settlement "Annton", Ann's, around x 6000). Part 1 is hauler_test.mjs.
import { ItemStack, setPlayers, setTimeOfDay, fire, log } from "@minecraft/server";
import * as MC from "@minecraft/server";
import {
  ow, logs, check, fails, loadApi, finish, run, runUntil, mkPlayer, asBy, placeBell, chest, fill, containerAt, usedSlots, sumOf, same, countOf, snap,
  carried, cargoStacks, chestSupply, chestsIn, events, jobOf, stateOf, flat, key,
} from "./hauler_common.mjs";
import "./scripts/main.js";
import { foundSettlement, settlementOf, getSettlements, addMember, getSeen, noteChestUse } from "./scripts/settlement.js";
import { spawnWorker, meta } from "./scripts/workers.js";
import { dispatch } from "./scripts/orders.js";
import { setHome, energy, setEnergy, DRAIN_PER_BLOCK } from "./scripts/life.js";
import { setJSON } from "./scripts/util.js";
import { statusText } from "./scripts/runner.js";

const TITLE = "hauler part 2 (schedule, ticking area, reload, depot full, night and energy)";
const A = await loadApi(["takeChests", "markDepot", "depotLayout", "chestLimit", "addPickup", "routeFor", "dueRound", "FULL_AT", "loadTicks", "drainPerBlock"]);
const setTickingFull = MC.setTickingFull;
if (typeof setTickingFull !== "function") fails.push("mock missing: setTickingFull (export from @minecraft/server)");
if (fails.length) finish(TITLE);

const brian = mkPlayer("p1", "Brian", false, { x: 5502, y: 65, z: 5495 }), ann = mkPlayer("p2", "Ann", false, { x: 6001, y: 65, z: 5995 }), dee = mkPlayer("p4", "Dee", false, { x: 6001, y: 65, z: 5996 });
setPlayers([brian, ann, dee]);
const by = asBy(brian), byAnn = asBy(ann);
fire("world.afterEvents.worldLoad", {});
setTimeOfDay(1000);
const OW = "minecraft:overworld";
const drop = (e, p, label) => setJSON(e, "crew:lastDeposit", { ...p, dim: OW, label });
const gear = () => [new ItemStack("minecraft:bundle"), new ItemStack("minecraft:leather_boots")];
const startedSlots = (name) => events("round_started", name).length;

// ====================================================================================
// Settlement A: Schedule, Ticking area, Reload
// ====================================================================================
check("setup: Ridgeway founded", foundSettlement(brian, placeBell(brian, { x: 5500, y: 65, z: 5480 }), "Ridgeway").ok);
const SA = () => settlementOf({ id: "p1", name: "Brian" });
const A1 = { x: 5520, y: 65, z: 5503 }, A2 = { x: 5550, y: 65, z: 5503 }, A3 = { x: 5498, y: 65, z: 5545 };
const a1 = chest(A1), a2 = chest(A2), a3 = chest(A3);
const digA = spawnWorker(ow, { x: 5518.5, y: 65, z: 5508.5 }, { id: "p1", name: "Brian" }, "DigA", [new ItemStack("minecraft:iron_shovel")]).e;
const minA = spawnWorker(ow, { x: 5548.5, y: 65, z: 5507.5 }, { id: "p1", name: "Brian" }, "MinA", [new ItemStack("minecraft:iron_pickaxe")]).e;
drop(digA, A1, "DigA's chest");
drop(minA, A2, "MinA's chest");
const HA = spawnWorker(ow, { x: 5502.5, y: 65, z: 5497.5 }, { id: "p1", name: "Brian" }, "Hauly", gear()).e;
const haName = meta(HA).name;
check("setup: Hauly takes 16 chests", A.takeChests(HA, new ItemStack("minecraft:chest", 16)) === undefined && chestSupply(HA) === 16, chestSupply(HA));
check("setup: stake pickup added", A.addPickup(by, HA, ow.getBlock(A3)).ok);
run(120);
// the same load every round: 1 stack at A1, 14 at A2, 3 at A3 (18 in all: one trip)
function refill() {
  fill(a1, "minecraft:cobblestone", 64);
  fill(a2, "minecraft:cobblestone", 64 * 8); fill(a2, "minecraft:dirt", 64 * 3); fill(a2, "minecraft:coal", 64 * 2); fill(a2, "minecraft:oak_log", 64);
  fill(a3, "minecraft:raw_iron", 20); fill(a3, "minecraft:bread", 6); fill(a3, "minecraft:string", 3);
}
refill();
const DEPA = { dim: OW, from: { x: 5500, y: 64, z: 5500 }, to: { x: 5504, y: 64, z: 5506 } };
const centerA = { x: 5502, z: 5503 };
const depotA = () => getSettlements()[SA().id]?.depot;
const depotAChests = () => { const d = depotA(); return d ? chestsIn(d.x0 - 4, d.z0 - 4, d.x1 + 4, d.z1 + 4, d.y) : { cells: [], conts: [] }; };
const totalsA = () => sumOf([a1.items, a2.items, a3.items, carried(HA), ...depotAChests().conts.map((c) => c.items)], "minecraft:chest");
const spotsA = [A1, A2, A3];

/** Watches one round of Hauly: when each pickup empties, how long it stands at each, cargo, round jobs, ticking areas. */
function tracker() {
  const tr = { emptied: {}, dwell: {}, left: {}, maxCargo: 0, rounds: new Map(), cmd: log.commands.length, adds: [], removes: [] };
  tr.each = (tt) => {
    tr.maxCargo = Math.max(tr.maxCargo, cargoStacks(HA));
    const j = jobOf(HA);
    if (j?.type === "round" && !tr.rounds.has(j.id)) tr.rounds.set(j.id, { slot: j.slot, route: (j.route ?? []).map(key), t: tt });
    for (const sp of spotsA) {
      const k = key(sp);
      if (tr.emptied[k] === undefined && usedSlots(containerAt(sp)) === 0) tr.emptied[k] = tt;
      const near = flat(HA, sp) <= 3;
      if (near && !tr.left[k]) tr.dwell[k] = (tr.dwell[k] ?? 0) + 1;
      if (!near && tr.dwell[k]) tr.left[k] = true; // only the first visit counts
    }
    while (tr.cmd < log.commands.length) {
      const c = log.commands[tr.cmd++];
      const m = /^tickingarea (add|remove)\b.*\bcrew_(\S+)/.exec(c);
      if (m) (m[1] === "add" ? tr.adds : tr.removes).push({ id: m[2], t: tt, dist: flat(HA, centerA) });
    }
  };
  tr.order = () => spotsA.map(key).filter((k) => tr.emptied[k] !== undefined).sort((a, b) => tr.emptied[a] - tr.emptied[b]);
  return tr;
}
const doneA = () => spotsA.every((p) => usedSlots(containerAt(p)) === 0) && cargoStacks(HA) === 0 && jobOf(HA)?.type !== "round";
const WANT_ORDER = [A1, A2, A3].map(key); // nearest to the depot first, then nearest to the last one (not simply by distance from the depot: A3 is nearer the depot than A2)

// ---- morning ----
const eBefore = energy(HA);
const before1 = totalsA();
check("Schedule: no round before there's a depot", !startedSlots(haName));
check("Depot: marked", A.markDepot(by, SA(), DEPA).ok);
const tr1 = tracker();
check("Schedule: the morning round starts by itself (game time 1000)", runUntil(() => jobOf(HA)?.type === "round", 100, tr1.each) && jobOf(HA)?.slot === "morning", jobOf(HA));
check("Schedule: round_started is reported", startedSlots(haName) === 1, startedSlots(haName));
check("Schedule: its status says which round and how far", /^On the morning round \(\d+ of 3 chests\)/.test(statusText(HA).split("\n")[0]), statusText(HA).split("\n")[0]);
check("Schedule: route = routeFor, nearest to the depot first, then nearest to the last", JSON.stringify(A.routeFor(HA).map(key)) === JSON.stringify(WANT_ORDER) && JSON.stringify([...tr1.rounds.values()][0]?.route) === JSON.stringify(WANT_ORDER),
  { routeFor: A.routeFor(HA).map(key), job: [...tr1.rounds.values()][0]?.route, want: WANT_ORDER });
check("Schedule: the morning round finishes", runUntil(doneA, 12000, tr1.each), { a1: usedSlots(a1), a2: usedSlots(a2), a3: usedSlots(a3), cargo: cargoStacks(HA), job: jobOf(HA) });
run(40, tr1.each);
const eAfter = energy(HA);
check("Schedule: it visits the chests in route order", JSON.stringify(tr1.order()) === JSON.stringify(WANT_ORDER), tr1.order());
check("Counts: nothing lost or duplicated over the morning round", same(totalsA(), before1), { before: before1, now: totalsA() });
check("Counts: at most 18 stacks carried", tr1.maxCargo > 0 && tr1.maxCargo <= 18, tr1.maxCargo);
check("round_done is reported", events("round_done", haName).length === 1, events("round_done", haName).length);
{
  const d1 = tr1.dwell[key(A1)] ?? 0, d2 = tr1.dwell[key(A2)] ?? 0;
  const lt = (n) => A.loadTicks(n);
  check("Schedule: loading takes longer the more stacks (loadTicks grows)", lt(1) < lt(5) && lt(5) < lt(14) && lt(14) < lt(27), [lt(1), lt(5), lt(14), lt(27)]);
  check("Schedule: it stands longer at a chest of 14 stacks than at one of 1", d2 - d1 >= 0.5 * (lt(14) - lt(1)), { oneStack: d1, fourteen: d2, loadTicks: [lt(1), lt(14)] });
  globalThis.crewTestFast = false;
  const real = [A.loadTicks(1), A.loadTicks(27)];
  globalThis.crewTestFast = true;
  check("Schedule: at real pace a quick stop for 1 stack, about 15 s for a full chest (27 stacks)", real[0] <= 40 && real[1] >= 200 && real[1] <= 400, real);
}
check("Night and energy: walking drains energy", eAfter < eBefore - 0.5, { before: eBefore, after: eAfter });
check("Night and energy: about half a digger's drain per block when empty, more when loaded",
  A.drainPerBlock(0) >= 0.3 * DRAIN_PER_BLOCK && A.drainPerBlock(0) <= 0.7 * DRAIN_PER_BLOCK && A.drainPerBlock(1) > A.drainPerBlock(0), [A.drainPerBlock(0), A.drainPerBlock(1), DRAIN_PER_BLOCK]);
/** Ticking area: every round it took one for, it released, back at the depot. */
function areaChecks(tr, label) {
  const ids = [...tr.rounds.keys()];
  const adds = tr.adds.filter((a) => ids.includes(a.id));
  check(`Ticking area (${label}): it takes one on a round`, adds.length >= 1, tr.adds);
  for (const id of new Set(adds.map((a) => a.id))) {
    const lastAdd = Math.max(...adds.filter((a) => a.id === id).map((a) => a.t));
    const rm = tr.removes.filter((r) => r.id === id && r.t >= lastAdd);
    check(`Ticking area (${label}): released at the end`, rm.length >= 1, { id, removes: tr.removes });
    if (rm.length) check(`Ticking area (${label}): released back at the depot`, rm[rm.length - 1].dist <= 8, rm[rm.length - 1]);
  }
}
areaChecks(tr1, "morning");
check("Schedule: no round due again this morning", A.dueRound(HA) === undefined, A.dueRound(HA));
run(600, tr1.each);
check("Schedule: each round once a day (no second morning round)", startedSlots(haName) === 1, startedSlots(haName));

// ---- midday ----
refill();
const before2 = totalsA();
setTimeOfDay(6500);
check("Schedule: midday is due at 6500", A.dueRound(HA) === "midday", A.dueRound(HA));
const tr2 = tracker();
check("Schedule: the midday round starts by itself", runUntil(() => jobOf(HA)?.type === "round", 100, tr2.each) && jobOf(HA)?.slot === "midday", jobOf(HA));
check("Schedule: the midday round finishes", runUntil(doneA, 12000, tr2.each), { a1: usedSlots(a1), a2: usedSlots(a2), a3: usedSlots(a3), cargo: cargoStacks(HA) });
run(40, tr2.each);
check("Schedule: the same route as the morning", JSON.stringify(tr2.order()) === JSON.stringify(tr1.order()), { morning: tr1.order(), midday: tr2.order() });
check("Counts: nothing lost or duplicated over the midday round", same(totalsA(), before2), { before: before2, now: totalsA() });
areaChecks(tr2, "midday");

// ---- evening, with every ticking area taken ----
refill();
const before3 = totalsA();
const q = dispatch(by, { worker: "DigA", job: "quarry", params: { from: [5510, 61, 5512], to: [5517, 64, 5519], facing: "south", deposit: [A1.x, A1.y, A1.z], keep: "nothing" } });
check("setup: DigA digs a quarry (it holds a ticking area)", q.ok, q.message);
run(100);
const digArea = jobOf(digA)?.id;
check("setup: DigA took its ticking area", !!digArea && log.commands.some((c) => c.startsWith("tickingarea add") && c.includes(`crew_${digArea}`)), digArea);
const fullFrom = log.commands.length;
setTickingFull(true);
setTimeOfDay(9500);
check("Schedule: evening is due at 9500", A.dueRound(HA) === "evening", A.dueRound(HA));
const tr3 = tracker();
let farthest = 0;
run(600, (tt) => { tr3.each(tt); farthest = Math.max(farthest, flat(HA, centerA)); });
const waitLine = statusText(HA).split("\n")[0];
check("Ticking area: with none free it says so", events("no_area", haName).length >= 1, events("no_area", haName).length);
check("Ticking area: its status says \"Waiting for a free work area\"", waitLine.includes("Waiting for a free work area"), waitLine);
check("Ticking area: it waits at the depot", farthest <= 8, farthest);
check("Ticking area: it doesn't set off (pickups untouched)", usedSlots(a1) === 1 && usedSlots(a2) === 14 && usedSlots(a3) === 3, [usedSlots(a1), usedSlots(a2), usedSlots(a3)]);
check("Ticking area: it never takes a digger's", !log.commands.slice(fullFrom).some((c) => c.startsWith("tickingarea remove") && c.includes(`crew_${digArea}`)) && jobOf(digA)?.id === digArea,
  log.commands.slice(fullFrom).filter((c) => c.includes(`crew_${digArea}`)));
setTickingFull(false);
const freedAt = log.commands.length;
const setOff = runUntil(() => log.commands.slice(freedAt).some((c) => /^tickingarea add/.test(c) && [...tr3.rounds.keys()].some((id) => c.includes(`crew_${id}`))) && usedSlots(a1) === 0, 400, tr3.each);
check("Ticking area: once one is free it retries (within a mock minute) and sets off", setOff, { a1: usedSlots(a1), cmds: log.commands.slice(freedAt).filter((c) => c.startsWith("tickingarea")) });
check("Schedule: the evening round finishes", runUntil(doneA, 12000, tr3.each), { a1: usedSlots(a1), a2: usedSlots(a2), a3: usedSlots(a3), cargo: cargoStacks(HA) });
run(40, tr3.each);
check("Schedule: the evening round is the evening's", [...tr3.rounds.values()].some((r) => r.slot === "evening"), [...tr3.rounds.values()]);
check("Schedule: the same route as the morning (evening)", JSON.stringify(tr3.order()) === JSON.stringify(tr1.order()), { morning: tr1.order(), evening: tr3.order() });
check("Counts: nothing lost or duplicated over the evening round", same(totalsA(), before3), { before: before3, now: totalsA() });
areaChecks(tr3, "evening");
dispatch(by, { worker: "DigA", job: "stop", params: {} });

// ---- a nearly full drop-off chest adds a trip ----
{
  check("Schedule: FULL_AT is 3/4", A.FULL_AT === 0.75, A.FULL_AT);
  const n0 = startedSlots(haName);
  fill(a1, "minecraft:cobblestone", 64 * 30); // 30 of 54 slots: under 3/4
  noteChestUse(OW, A1);
  run(300);
  check("Schedule: a drop-off chest under 3/4 full adds no trip", startedSlots(haName) === n0 && usedSlots(a1) === 30, { started: startedSlots(haName) - n0, a1: usedSlots(a1) });
  fill(a1, "minecraft:cobblestone", 64 * 12); // 42 of 54: past 3/4
  noteChestUse(OW, A1);
  const before4 = totalsA();
  const tr4 = tracker();
  check("Schedule: past 3/4 full, an extra trip starts", runUntil(() => jobOf(HA)?.type === "round", 200, tr4.each) && jobOf(HA)?.slot === "extra", jobOf(HA));
  runUntil(() => usedSlots(a1) <= 40 && cargoStacks(HA) === 0 && jobOf(HA)?.type !== "round", 12000, tr4.each);
  run(40, tr4.each);
  check("Schedule: the extra trip brings the chest under 3/4", usedSlots(a1) <= 40, usedSlots(a1));
  check("Counts: at most 18 stacks per trip (42 stacks to move)", tr4.maxCargo > 0 && tr4.maxCargo <= 18, tr4.maxCargo);
  check("Counts: nothing lost or duplicated over the extra trip", same(totalsA(), before4), { before: before4, now: totalsA() });
}

// ---- Reload: a round survives a reload mid-trip ----
{
  // drop the worker's runtime, as a /reload or a chunk unload does; the saved job is all that's left
  const reload = () => {
    HA.isValid = false;
    run(1);
    HA.isValid = true;
  };
  fill(a2, "minecraft:cobblestone", 64 * 10);
  fill(a3, "minecraft:dirt", 64 * 2);
  const before5 = totalsA();
  const now5 = dispatch(by, { worker: haName, job: "haul_now", params: {} });
  check("Reload: Do a round now", now5.ok && jobOf(HA)?.type === "round", now5.message);
  const id = jobOf(HA)?.id;
  // once while it loads at A2, once on its way with cargo
  runUntil(() => flat(HA, A2) <= 2.5, 4000);
  reload();
  check("Reload: the round is still its job after a reload while loading", jobOf(HA)?.type === "round" && jobOf(HA)?.id === id, jobOf(HA));
  run(80);
  runUntil(() => cargoStacks(HA) > 0 && flat(HA, A2) > 4, 4000);
  const carrying = cargoStacks(HA);
  reload();
  check("Reload: the round is still its job after a reload mid-trip", carrying > 0 && jobOf(HA)?.type === "round" && jobOf(HA)?.id === id, { carrying, job: jobOf(HA) });
  check("Reload: it carries on and finishes the round", runUntil(doneA, 12000), { a2: usedSlots(a2), a3: usedSlots(a3), cargo: cargoStacks(HA), job: jobOf(HA) });
  run(40);
  check("Reload: nothing lost or duplicated", same(totalsA(), before5), { before: before5, now: totalsA() });
}

// ====================================================================================
// Settlement B: the chest maximum, Depot full, Night and energy
// ====================================================================================
check("setup: Annton founded", foundSettlement(ann, placeBell(ann, { x: 6000, y: 65, z: 5980 }), "Annton").ok);
const SB = () => settlementOf({ id: "p2", name: "Ann" });
check("setup: Dee joins Annton", addMember(byAnn, SB(), { id: "p4", name: "Dee" }).ok);
const B1 = { x: 6020, y: 65, z: 6001 };
const b1 = chest(B1);
const digB = spawnWorker(ow, { x: 6018.5, y: 65, z: 6004.5 }, { id: "p2", name: "Ann" }, "DigB", [new ItemStack("minecraft:iron_shovel")]).e;
drop(digB, B1, "DigB's chest");
const HB = spawnWorker(ow, { x: 6003.5, y: 65, z: 5995.5 }, { id: "p2", name: "Ann" }, "Toter", gear()).e;
const hbName = meta(HB).name;
const BED = { x: 5990, y: 65, z: 6010 }, HBC = { x: 5992, y: 65, z: 6010 };
ow.setBlockType(BED, "minecraft:bed"); ow.setBlockType({ x: 5990, y: 65, z: 6011 }, "minecraft:bed");
const hbc = chest(HBC);
setHome(HB, { dim: OW, head: BED, foot: { x: 5990, y: 65, z: 6011 }, chest: HBC });
run(120);
const DEPB = { dim: OW, from: { x: 6000, y: 64, z: 6000 }, to: { x: 6002, y: 64, z: 6002 } };
const centerB = { x: 6001, z: 6001 };
check("setup: Annton's 3x3 depot", A.markDepot(byAnn, SB(), DEPB).ok);
const depotB = () => getSettlements()[SB().id]?.depot;
const depotBChests = () => { const d = depotB(); return chestsIn(d.x0 - 4, d.z0 - 4, d.x1 + 4, d.z1 + 4, d.y); };
const totalsB = () => sumOf([b1.items, carried(HB), ...depotBChests().conts.map((c) => c.items)], "minecraft:chest");
const L = A.chestLimit(depotB());
check("Depot: a 3x3 depot holds a few chests (fewer than 16)", L >= 1 && L < 16, L);

// ---- never more than the maximum ----
{
  A.takeChests(HB, new ItemStack("minecraft:chest", L + 4));
  const KINDS = ["minecraft:cobblestone", "minecraft:dirt", "minecraft:raw_iron", "minecraft:coal", "minecraft:oak_log", "minecraft:flint", "minecraft:string", "minecraft:gravel",
    "minecraft:raw_gold", "minecraft:birch_log", "minecraft:feather", "minecraft:sand", "minecraft:raw_copper", "minecraft:spruce_log", "minecraft:bone", "minecraft:clay_ball"];
  for (const k of KINDS.slice(0, Math.min(L + 3, KINDS.length))) fill(b1, k, 10);
  const before = totalsB();
  dispatch(byAnn, { worker: hbName, job: "haul_now", params: {} });
  const done = runUntil(() => usedSlots(b1) === 0 && cargoStacks(HB) === 0 && jobOf(HB)?.type !== "round", 12000);
  run(40);
  const d = depotB();
  const placed = depotBChests().cells;
  check("Depot: more kinds than chests: everything still stored", done, { b1: usedSlots(b1), cargo: cargoStacks(HB), job: jobOf(HB) });
  check("Depot: never more chests than the maximum", placed.length <= L && d.units.reduce((n, u) => n + u.cells.length, 0) <= L, { placed: placed.length, max: L });
  check("Depot: chests only inside the area", placed.every((c) => c.x >= d.x0 && c.x <= d.x1 && c.z >= d.z0 && c.z <= d.z1), placed);
  check("Depot: the spare chests stay with it (none crafted, none lost)", placed.length + chestSupply(HB) === L + 4, { placed: placed.length, carried: chestSupply(HB) });
  check("Counts: nothing lost or duplicated (more kinds than chests)", same(totalsB(), before), { before, now: totalsB() });
}

// ---- Depot full ----
{
  // fill every depot chest to the brim with what it already holds
  for (const c of depotBChests().conts) {
    const kind = c.items.find(Boolean)?.typeId ?? "minecraft:cobblestone";
    for (let i = 0; i < c.size; i++) if (!c.items[i]) c.setItem(i, new ItemStack(kind, 64));
  }
  fill(b1, "minecraft:emerald", 5); fill(b1, "minecraft:amethyst_shard", 3); // new kinds: no room anywhere
  const before = totalsB();
  const deeTold = () => dee.msgs.filter((m) => m.includes("The depot is full")).length;
  dispatch(byAnn, { worker: hbName, job: "haul_now", params: {} });
  check("Depot full: it says so", runUntil(() => events("depot_full", hbName).length > 0, 6000), events("depot_full", hbName));
  const carrying = cargoStacks(HB);
  check("Depot full: it keeps what it carries", carrying === 2, carrying);
  fill(b1, "minecraft:cobblestone", 64); // more to pick up while the depot is full
  let farthest = 0;
  run(600, () => { farthest = Math.max(farthest, flat(HB, centerB)); });
  check("Depot full: it says it once", events("depot_full", hbName).length === 1, events("depot_full", hbName).length);
  check("Depot full: everyone in the settlement is told, once", deeTold() === 1 && ann.msgs.some((m) => m.includes("The depot is full")), { dee: deeTold() });
  check("Depot full: its status says \"The depot is full\"", statusText(HB).split("\n")[0].includes("The depot is full"), statusText(HB).split("\n")[0]);
  check("Depot full: the bell's Workers list says so", String(getSeen()[HB.id]?.status ?? "").includes("The depot is full"), getSeen()[HB.id]);
  check("Depot full: it waits at the depot, still carrying", farthest <= 8 && cargoStacks(HB) === carrying, { farthest, cargo: cargoStacks(HB) });
  check("Depot full: it stops picking up", countOf(b1.items, "minecraft:cobblestone") === 64, sumOf([b1.items]));
  check("Depot full: never into a home chest", usedSlots(hbc) === 0, sumOf([hbc.items]));
  check("Counts: nothing lost or duplicated while the depot is full", same(totalsB(), { ...before, "minecraft:cobblestone": (before["minecraft:cobblestone"] ?? 0) + 64 }), { before, now: totalsB() });
  // a player empties one chest: it carries on by itself
  const c0 = depotBChests().conts[0];
  const removed = sumOf([c0.items]);
  c0.clearAll();
  const want = sumOf([b1.items, carried(HB), ...depotBChests().conts.map((c) => c.items)], "minecraft:chest");
  check("Depot full: it resumes when a chest is emptied", runUntil(() => cargoStacks(HB) === 0, 1200), { cargo: cargoStacks(HB) });
  run(40);
  check("Depot full: what it carried is in the depot now", countOf(depotBChests().conts.flatMap((c) => c.items), "minecraft:emerald") === 5 && countOf(depotBChests().conts.flatMap((c) => c.items), "minecraft:amethyst_shard") === 3);
  check("Counts: nothing lost or duplicated after the depot had room again", same(totalsB(), want), { want, now: totalsB(), removedByPlayer: removed });
  runUntil(() => jobOf(HB)?.type !== "round" && cargoStacks(HB) === 0, 6000);
}

// ---- Night: carrying at dusk, it delivers first, then sleeps at home ----
{
  fill(b1, "minecraft:dirt", 64 * 5);
  const before = totalsB();
  dispatch(byAnn, { worker: hbName, job: "haul_now", params: {} });
  check("Night: on a round with cargo", runUntil(() => cargoStacks(HB) > 0 && jobOf(HB)?.type === "round", 4000), { cargo: cargoStacks(HB), job: jobOf(HB) });
  setTimeOfDay(12500);
  let cargoAtRest = -1;
  runUntil(() => jobOf(HB)?.type === "rest", 4000, () => { if (jobOf(HB)?.type === "rest" && cargoAtRest < 0) cargoAtRest = cargoStacks(HB); });
  check("Night: at dusk it delivers what it carries first", cargoAtRest === 0, cargoAtRest);
  check("Night: then it goes to bed (rest, night)", jobOf(HB)?.type === "rest" && jobOf(HB)?.reason === "night", jobOf(HB));
  check("Night: it sleeps at home", runUntil(() => stateOf(HB).phase === "asleep", 4000) && flat(HB, BED) < 2, { phase: stateOf(HB).phase, at: HB.location });
  check("Night: nothing goes into its home chest", usedSlots(hbc) === 0, sumOf([hbc.items]));
  check("Counts: nothing lost or duplicated delivering at dusk", same(totalsB(), before), { before, now: totalsB() });
}

// ---- Morning, then worn out mid-trip: it delivers, then rests ----
{
  fill(b1, "minecraft:gravel", 64 * 4);
  const before = totalsB();
  const n0 = startedSlots(hbName);
  setTimeOfDay(0);
  check("Schedule: after the night, the morning round is due again and starts", runUntil(() => startedSlots(hbName) > n0 && jobOf(HB)?.type === "round", 1200) && jobOf(HB)?.slot === "morning", jobOf(HB));
  check("Energy: on its way with cargo", runUntil(() => cargoStacks(HB) > 0 && jobOf(HB)?.type === "round", 4000), cargoStacks(HB));
  setEnergy(HB, 9);
  let cargoAtRest = -1;
  runUntil(() => jobOf(HB)?.type === "rest", 4000, () => { if (jobOf(HB)?.type === "rest" && cargoAtRest < 0) cargoAtRest = cargoStacks(HB); });
  check("Energy: worn out mid-trip it delivers first", cargoAtRest === 0, cargoAtRest);
  check("Energy: then it rests (rest, tired)", jobOf(HB)?.type === "rest" && jobOf(HB)?.reason === "tired", jobOf(HB));
  check("Energy: nothing goes into its home chest", usedSlots(hbc) === 0, sumOf([hbc.items]));
  check("Counts: nothing lost or duplicated when worn out", same(totalsB(), before), { before, now: totalsB() });
}

// ---- a bigger area raises the maximum and keeps the chests ----
{
  const units = depotB().units.length;
  const r = A.markDepot(byAnn, SB(), { dim: OW, from: { x: 6000, y: 64, z: 6000 }, to: { x: 6006, y: 64, z: 6008 } });
  check("Depot: marking a bigger area replaces it, keeping the chests", r.ok && depotB().x1 === 6006 && depotB().z1 === 6008 && depotB().units.length === units, { msg: r.message, d: depotB() });
  check("Depot: the bigger area holds more chests", A.chestLimit(depotB()) > L, A.chestLimit(depotB()));
}
check("No job errors", !logs.some((l) => /job error|job_failed/.test(l)), logs.filter((l) => /job error|job_failed/.test(l)).slice(0, 3));

finish(TITLE);

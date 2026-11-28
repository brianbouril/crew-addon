// Hauler, part 1 (specs/hauler.md, done criterion 1): Build, Roles, Depot, Sorting, Counts,
// What it touches, and the `haul` job. Part 2 (hauler2_test.mjs): Schedule, Depot full, Night and
// energy, Ticking area, Reload.
// One settlement ("Haulton", Brian's) around x 5000, z 5000: a Hauler built from a barrel, two
// diggers and a miner with drop-off chests, a stake pickup point, home chests, another player's
// named place, a stray chest, a storage chest with the depot's chests, and a 5x7 depot.
import { world, ItemStack, setPlayers, fire, log } from "@minecraft/server";
import {
  ow, logs, check, fails, loadApi, finish, run, runUntil, mkPlayer, asBy, placeBell, chest, fill, containerAt, usedSlots, sumOf, same, countOf, snap,
  carried, cargoStacks, chestSupply, chestsIn, events, jobOf, flat, key,
} from "./hauler_common.mjs";
import "./scripts/main.js";
import { foundSettlement, settlementOf, getSettlements, addStorage, setCap, rosterOf } from "./scripts/settlement.js";
import { spawnWorker, roleOf, meta, dismissWorker } from "./scripts/workers.js";
import { dispatch } from "./scripts/orders.js";
import { savePlace, getRegistry } from "./scripts/store.js";
import { setHome } from "./scripts/life.js";
import { setJSON } from "./scripts/util.js";
import { statusText } from "./scripts/runner.js";

const TITLE = "hauler part 1 (build, roles, depot, sorting, counts, what it touches, haul)";
const A = await loadApi(["ROLE_LIST", "roleKinds", "takeChests", "markDepot", "depotLayout", "chestLimit", "groupOf", "pickupSpots", "addPickup", "HAUL_SLOTS"]);
if (fails.length) finish(TITLE); // the feature isn't there yet

const brian = mkPlayer("p1", "Brian", false, { x: 5002, y: 65, z: 4996 }), cal = mkPlayer("p3", "Cal"), op = mkPlayer("p9", "Admin", true);
setPlayers([brian, cal, op]);
const by = asBy(brian);
fire("world.afterEvents.worldLoad", {});
setCap(asBy(op), 30);
const bell = placeBell(brian, { x: 5000, y: 65, z: 4985 });
check("setup: settlement founded", foundSettlement(brian, bell, "Haulton").ok);
const S = () => settlementOf({ id: "p1", name: "Brian" });
const depot = () => getSettlements()[S().id]?.depot;
check("HAUL_SLOTS is 18", A.HAUL_SLOTS === 18, A.HAUL_SLOTS);

// ================= Build =================
const regIds = () => new Set(Object.values(getRegistry()).map((r) => r.id));
/** A barrel with these items and a carved pumpkin placed on top, as a player builds a worker. */
function build(who, at, ids) {
  ow.setBlockType(at, "minecraft:barrel");
  const c = containerAt(at);
  ids.forEach((id, i) => c.setItem(i, new ItemStack(id)));
  const head = { ...at, y: at.y + 1 };
  ow.setBlockType(head, "minecraft:carved_pumpkin");
  const before = regIds();
  fire("world.afterEvents.playerPlaceBlock", { player: who, block: ow.getBlock(head), dimension: ow });
  const id = [...regIds()].find((x) => !before.has(x));
  return { e: id ? ow.entities.find((x) => x.id === id) : undefined, barrel: c };
}
const H = build(brian, { x: 4995, y: 65, z: 5012 }, ["minecraft:bundle", "minecraft:leather_boots"]).e;
check("Build: a barrel with a bundle and leather boots under a carved pumpkin makes a worker", !!H);
if (!H) finish(TITLE);
const hName = meta(H).name;
check("Build: its role is Hauler", roleOf(H) === "Hauler", roleOf(H));
check("Build: crew:role picks the hauler skin (4)", H.getProperty("crew:role") === 4, H.getProperty("crew:role"));
check("Build: the bundle and boots are its gear (slots 0 and 1)", H.inv.items[0]?.typeId === "minecraft:bundle" && H.inv.items[1]?.typeId === "minecraft:leather_boots", snap(H.inv.items.slice(0, 5)));
check("Build: Hauler is in the role list, with no tool kinds", A.ROLE_LIST.includes("Hauler") && Array.isArray(A.roleKinds("Hauler")) && A.roleKinds("Hauler").length === 0);
check("Build: it's on the settlement's roster (counts toward the limit)", rosterOf(S()).some((r) => r.id === H.id));
{
  const mine = Object.values(getRegistry()).filter((r) => r.ownerId === "p1").length;
  setCap(asBy(op), mine);
  brian.msgs.length = 0;
  const again = build(brian, { x: 4993, y: 65, z: 5012 }, ["minecraft:bundle", "minecraft:leather_boots"]);
  check("Build: at the settlement's limit a second Hauler is refused", !again.e && Object.values(getRegistry()).filter((r) => r.ownerId === "p1").length === mine);
  check("Build: refused, the barrel keeps its bundle", again.barrel.items.some((i) => i?.typeId === "minecraft:bundle"));
  check("Build: and the player is told about the limit", brian.msgs.some((m) => /limit/.test(m)), brian.msgs);
  ow.setBlockType({ x: 4993, y: 65, z: 5012 }, "minecraft:air");
  ow.setBlockType({ x: 4993, y: 66, z: 5012 }, "minecraft:air");
  setCap(asBy(op), 30);
}
{
  const dig = build(brian, { x: 4991, y: 65, z: 5016 }, ["minecraft:bundle", "minecraft:leather_boots", "minecraft:iron_shovel"]).e;
  const min = build(brian, { x: 4987, y: 65, z: 5016 }, ["minecraft:bundle", "minecraft:leather_boots", "minecraft:stone_pickaxe"]).e;
  check("Build: with a shovel too it's a Digger as before", dig && roleOf(dig) === "Digger", dig && roleOf(dig));
  check("Build: with a pickaxe too it's a Miner as before", min && roleOf(min) === "Miner", min && roleOf(min));
}
{
  const { e } = spawnWorker(ow, { x: 4980.5, y: 65, z: 5030.5 }, { id: "p1", name: "Brian" }, "Spawned", [new ItemStack("minecraft:bundle"), new ItemStack("minecraft:leather_boots")]);
  check("Build: spawnWorker with a bundle and boots makes a Hauler", roleOf(e) === "Hauler" && e.getProperty("crew:role") === 4, roleOf(e));
  dismissWorker(e); // one Hauler in this settlement: a second one would run its own rounds
}

// ================= the settlement around it =================
const P1 = { x: 5020, y: 65, z: 5003 }, P2 = { x: 5030, y: 65, z: 5018 }, P3 = { x: 5012, y: 65, z: 5025 };
const H1 = { x: 5022, y: 65, z: 4992 }, HH = { x: 4990, y: 65, z: 5020 }, CAL = { x: 5040, y: 65, z: 5000 }, R = { x: 5015, y: 65, z: 4995 };
const S1 = { x: 4990, y: 65, z: 5000 }, QA = { x: 5060, y: 65, z: 5000 }, SHOP = { x: 5070, y: 65, z: 5010 };
const p1 = chest(P1), p2 = chest(P2), p3 = chest(P3);
const h1 = chest(H1, [["minecraft:cobblestone", 7], ["minecraft:bread", 2]]);
const hh = chest(HH, [["minecraft:flint", 4]]);
const cal1 = chest(CAL, [["minecraft:emerald", 9]]);
const r1 = chest(R, [["minecraft:gold_nugget", 5]]);
const s1 = chest(S1, [["minecraft:flint", 3]]);
const qa = chest(QA), shop = chest(SHOP, [["minecraft:oak_planks", 3]]);
savePlace(by, "quarry box", "minecraft:overworld", QA, false);
savePlace(by, "shop", "minecraft:overworld", SHOP, false);
savePlace(asBy(cal), "cal's shop", "minecraft:overworld", CAL, true);
check("setup: storage chest added", addStorage(by, S(), ow.getBlock(S1)).ok);
const owner = { id: "p1", name: "Brian" };
const dig1 = spawnWorker(ow, { x: 5018.5, y: 65, z: 5006.5 }, owner, "Dig1", [new ItemStack("minecraft:iron_shovel")]).e;
const min1 = spawnWorker(ow, { x: 5028.5, y: 65, z: 5021.5 }, owner, "Min1", [new ItemStack("minecraft:iron_pickaxe")]).e;
const dig2 = spawnWorker(ow, { x: 5038.5, y: 65, z: 5003.5 }, owner, "Dig2", [new ItemStack("minecraft:stone_shovel")]).e;
const dig3 = spawnWorker(ow, { x: 5021.5, y: 65, z: 4996.5 }, owner, "Dig3", [new ItemStack("minecraft:stone_shovel")]).e;
dig1.inv.setItem(6, new ItemStack("minecraft:torch", 16));
dig1.inv.setItem(10, new ItemStack("minecraft:dirt", 30));
min1.inv.setItem(10, new ItemStack("minecraft:raw_iron", 4));
const drop = (e, p, label) => setJSON(e, "crew:lastDeposit", { ...p, dim: "minecraft:overworld", label });
drop(dig1, P1, "Dig1's chest");
drop(min1, P2, "Min1's chest");
drop(dig2, CAL, "cal's shop"); // another player's named place: not the settlement's
drop(dig3, H1, "Dig1's home chest"); // a home chest: never collected
for (const [x, z] of [[5024, 4992], [5024, 4993]]) ow.setBlockType({ x, y: 65, z }, "minecraft:bed");
setHome(dig1, { dim: "minecraft:overworld", head: { x: 5024, y: 65, z: 4992 }, foot: { x: 5024, y: 65, z: 4993 }, chest: H1 });
for (const [x, z] of [[4988, 5020], [4988, 5021]]) ow.setBlockType({ x, y: 65, z }, "minecraft:bed");
setHome(H, { dim: "minecraft:overworld", head: { x: 4988, y: 65, z: 5020 }, foot: { x: 4988, y: 65, z: 5021 }, chest: HH });
run(120); // workers report their drop-off chests to the roster
const workerSnaps = () => [dig1, min1, dig2, dig3].map((w) => snap(w.inv.items)).join("|");
const workersBefore = workerSnaps();
const fixedBefore = [h1, hh, cal1, r1].map((c) => snap(c.items));

// ================= Roles =================
const quarry = { from: [5100, 63, 5100], to: [5103, 64, 5103], facing: "south", deposit: [P1.x, P1.y, P1.z], keep: "all" };
{
  const r = dispatch(by, { worker: hName, job: "quarry", params: quarry });
  check("Roles: a Hauler refuses a quarry with the role message", !r.ok && r.message.includes(`${hName} is a Hauler`) && r.message.includes("Digger's job"), r.message);
  for (const w of ["Dig1", "Min1"]) {
    const h = dispatch(by, { worker: w, job: "haul", params: { from: "quarry box", to: "shop" } });
    check(`Roles: ${w} refuses haul (a Hauler's job)`, !h.ok && /Hauler/.test(h.message), h.message);
    const n = dispatch(by, { worker: w, job: "haul_now", params: {} });
    check(`Roles: ${w} refuses "Do a round now" (haul_now)`, !n.ok && /Hauler/.test(n.message), n.message);
  }
  const come = dispatch(by, { worker: hName, job: "come", params: { to: "Brian" } });
  check("Roles: come works for a Hauler", come.ok && jobOf(H)?.type === "come", come.message);
  run(200);
  const stop = dispatch(by, { worker: hName, job: "stop", params: {} });
  check("Roles: stop works for a Hauler", stop.ok && !jobOf(H), stop.message);
  const home = dispatch(by, { worker: hName, job: "go_home", params: {} });
  check("Roles: go home works for a Hauler", home.ok && jobOf(H)?.type === "come" && jobOf(H)?.label === "home", { msg: home.message, job: jobOf(H) });
  runUntil(() => !jobOf(H), 1500);
  check("Roles: it walked home", flat(H, { x: 4988, z: 5020 }) < 3, H.location);
  const dropOff = dispatch(by, { worker: hName, job: "drop_off", params: { deposit: "shop" } });
  check("Roles: drop off works for a Hauler", dropOff.ok && jobOf(H)?.type === "drop_off", dropOff.message);
  runUntil(() => !jobOf(H), 2000);
  check("Roles: drop off keeps its gear (bundle, boots)", H.inv.items[0]?.typeId === "minecraft:bundle" && H.inv.items[1]?.typeId === "minecraft:leather_boots" && !shop.items.some((i) => /bundle|leather_boots/.test(i?.typeId ?? "")), snap(shop.items.filter(Boolean)));
  // resume is checked with a stopped round, below
}

// ================= Pickups (What it touches) =================
// mixed items, 20 stacks in all (more than one 18-slot load), 7 kinds in 5 groups
fill(p1, "minecraft:cobblestone", 64 * 12); fill(p1, "minecraft:dirt", 40); fill(p1, "minecraft:raw_iron", 12); fill(p1, "minecraft:oak_log", 20);
fill(p2, "minecraft:coal", 30); fill(p2, "minecraft:cobblestone", 20); fill(p2, "minecraft:bread", 5);
fill(p3, "minecraft:dirt", 64); fill(p3, "minecraft:string", 7);
const KINDS = ["minecraft:cobblestone", "minecraft:dirt", "minecraft:raw_iron", "minecraft:oak_log", "minecraft:coal", "minecraft:bread", "minecraft:string"];
check("What it touches: a stake pickup point can be added", A.addPickup(by, H, ow.getBlock(P3)).ok);
check("What it touches: a worker's home chest can't be a pickup point", !A.addPickup(by, H, ow.getBlock(H1)).ok);
check("What it touches: its own home chest can't be a pickup point", !A.addPickup(by, H, ow.getBlock(HH)).ok);
run(120);
{
  const got = A.pickupSpots(H).map(key).sort();
  const want = [P1, P2, P3].map(key).sort();
  check("What it touches: pickups = the diggers' and miners' drop-off chests + stake pickup points, nothing else", JSON.stringify(got) === JSON.stringify(want), { got, want });
}

// ================= Depot =================
const DEP = { dim: "minecraft:overworld", from: { x: 5000, y: 64, z: 5000 }, to: { x: 5004, y: 64, z: 5006 } };
check("Depot: someone outside the settlement can't mark one", !A.markDepot(asBy(cal), S(), DEP).ok);
check("Depot: refused without a solid floor", !A.markDepot(by, S(), { ...DEP, from: { ...DEP.from, y: 70 }, to: { ...DEP.to, y: 70 } }).ok);
ow.setBlockType({ x: 5002, y: 66, z: 5003 }, "minecraft:stone");
check("Depot: refused without 2 blocks of headroom", !A.markDepot(by, S(), DEP).ok);
ow.setBlockType({ x: 5002, y: 66, z: 5003 }, "minecraft:air");
check("Depot: refused under 3x3", !A.markDepot(by, S(), { ...DEP, to: { x: 5001, y: 64, z: 5001 } }).ok);
check("Depot: refused over 32x32", !A.markDepot(by, S(), { dim: DEP.dim, from: { x: 5200, y: 64, z: 5200 }, to: { x: 5232, y: 64, z: 5232 } }).ok);
check("Depot: no depot stored after the refusals", !depot());
const marked = A.markDepot(by, S(), DEP);
check("Depot: marking a 5x7 depot works", marked.ok, marked.message);
const d0 = depot();
check("Depot: its area is stored on the settlement", d0 && d0.dim === "minecraft:overworld" && d0.x0 === 5000 && d0.z0 === 5000 && d0.x1 === 5004 && d0.z1 === 5006 && d0.y === 65 && Array.isArray(d0.units), d0);
if (!d0) finish(TITLE);
const inArea = (c, d = depot()) => c.x >= d.x0 && c.x <= d.x1 && c.z >= d.z0 && c.z <= d.z1;
/** Rows with walkways: chests inside, each beside a walkway, every walkway open to the edge. */
function layoutOk(d) {
  const L = A.depotLayout(d);
  const ck = new Set(L.chestCells.map((c) => `${c.x},${c.z}`)), wk = new Set(L.walkCells.map((c) => `${c.x},${c.z}`));
  const n4 = (x, z) => [[x + 1, z], [x - 1, z], [x, z + 1], [x, z - 1]];
  const bad = [];
  for (const c of L.chestCells) {
    if (!inArea(c, d) || c.y !== d.y) bad.push(`chest cell outside ${key(c)}`);
    if (wk.has(`${c.x},${c.z}`)) bad.push(`chest cell is a walkway ${key(c)}`);
    if (!n4(c.x, c.z).some(([x, z]) => wk.has(`${x},${z}`))) bad.push(`chest cell with no walkway beside it ${key(c)}`);
  }
  // every walkway reaches the area's edge through walkways (players and the Hauler get in)
  const edge = (x, z) => x === d.x0 || x === d.x1 || z === d.z0 || z === d.z1;
  const ok = new Set([...wk].filter((k) => edge(...k.split(",").map(Number))));
  for (let grew = true; grew;) {
    grew = false;
    for (const k of wk) if (!ok.has(k) && n4(...k.split(",").map(Number)).some(([x, z]) => ok.has(`${x},${z}`))) { ok.add(k); grew = true; }
  }
  for (const k of wk) if (!ok.has(k)) bad.push(`walkway shut in ${k}`);
  for (const c of L.walkCells) if (!inArea(c, d)) bad.push(`walkway outside ${key(c)}`);
  return { L, ck, wk, bad };
}
{
  const { L, bad } = layoutOk(d0);
  check("Depot: layout = rows of chests, each beside a walkway, walkways open to the edge", bad.length === 0 && L.chestCells.length > 0, bad.slice(0, 5));
  check("Depot: the default 5x7 area holds 16 chests", A.chestLimit(d0) === 16, A.chestLimit(d0));
  const big = { ...d0, x1: d0.x0 + 8, z1: d0.z0 + 8, units: [] };
  check("Depot: a bigger area (9x9) holds more than 16", A.chestLimit(big) > 16, A.chestLimit(big));
  check("Depot: the bigger layout is valid too", layoutOk(big).bad.length === 0, layoutOk(big).bad.slice(0, 5));
}
run(200);
check("Roles: after Stop it starts no round by itself", !events("round_started", hName).length && jobOf(H)?.type !== "round", jobOf(H));

// ================= a round with no chests, then with chests =================
const depotChests = () => { const d = depot(); return chestsIn(d.x0 - 6, d.z0 - 6, d.x1 + 6, d.z1 + 6, d.y); };
/** Every item involved: pickups, what the Hauler carries, the depot, the storage chest (chest items counted apart). */
const totals = () => sumOf([p1.items, p2.items, p3.items, carried(H), ...depotChests().conts.map((c) => c.items), s1.items], "minecraft:chest");
const spawnedBefore = log.spawnedItems.length;
let maxCargo = 0;
const watch = () => { maxCargo = Math.max(maxCargo, cargoStacks(H)); };
const roundDone = () => [p1, p2, p3].every((c) => usedSlots(c) === 0) && cargoStacks(H) === 0 && jobOf(H)?.type !== "round";
const before1 = totals();
const now1 = dispatch(by, { worker: hName, job: "haul_now", params: {} });
check("Depot: Do a round now starts a round", now1.ok && jobOf(H)?.type === "round" && jobOf(H)?.slot === "now", { msg: now1.message, job: jobOf(H) });
const told = runUntil(() => events("need_chests", hName).length > 0, 6000, watch);
check("Depot: with no chests it says \"I need chests for the depot\"", told && brian.msgs.some((m) => m.includes("I need chests for the depot")));
check("Depot: its status says so", statusText(H).split("\n")[0].includes("I need chests for the depot"), statusText(H).split("\n")[0]);
run(400, watch);
check("Depot: it says it once while it lacks them", events("need_chests", hName).length === 1, events("need_chests", hName).length);
check("Depot: no chest is crafted or placed without chests", depotChests().cells.length === 0, depotChests().cells);
check("Counts: nothing lost while it waits for chests", same(totals(), before1), { before: before1, now: totals() });
// chests given by a player (2) and in settlement storage (14): 16 in all, the default maximum
check("Depot: chests can be given to it", A.takeChests(H, new ItemStack("minecraft:chest", 2)) === undefined && chestSupply(H) === 2, chestSupply(H));
fill(s1, "minecraft:chest", 14);
dispatch(by, { worker: hName, job: "haul_now", params: {} });
check("Counts: the round finishes (every pickup chest emptied, nothing carried)", runUntil(roundDone, 20000, watch), { p1: usedSlots(p1), p2: usedSlots(p2), p3: usedSlots(p3), cargo: cargoStacks(H), job: jobOf(H) });
run(40, watch);
check("Counts: no item lost or duplicated over the round", same(totals(), before1), { before: before1, now: totals() });
check("Counts: it carries at most 18 stacks per trip", maxCargo > 0 && maxCargo <= 18, maxCargo);
check("Counts: nothing dropped on the ground", log.spawnedItems.length === spawnedBefore, log.spawnedItems.slice(spawnedBefore).map((i) => i.typeId));

// ---- where the chests went ----
function placementChecks(label) {
  const d = depot();
  const { ck, wk } = layoutOk(d);
  const placed = depotChests().cells;
  check(`Depot (${label}): chests only inside the area, on chest cells`, placed.every((c) => inArea(c, d) && ck.has(`${c.x},${c.z}`)), placed.filter((c) => !inArea(c, d) || !ck.has(`${c.x},${c.z}`)));
  check(`Depot (${label}): walkways left clear`, [...wk].every((k) => { const [x, z] = k.split(",").map(Number); return ow.typeAt({ x, y: d.y, z }) === "minecraft:air" && ow.typeAt({ x, y: d.y + 1, z }) === "minecraft:air"; }));
  check(`Depot (${label}): every unit cell is a chest`, d.units.every((u) => u.cells.every((c) => /chest/.test(ow.typeAt(c)))), d.units);
  check(`Depot (${label}): never more than the maximum`, placed.length <= A.chestLimit(d), { placed: placed.length, max: A.chestLimit(d) });
  check(`Depot (${label}): chests are never crafted (placed + carried + in storage = 16)`, placed.length + chestSupply(H) + countOf(s1.items, "minecraft:chest") === 16, { placed: placed.length, carried: chestSupply(H), storage: countOf(s1.items, "minecraft:chest") });
}
placementChecks("first round");
check("Depot: it took chests from settlement storage when its own ran out", countOf(s1.items, "minecraft:chest") < 14 && depotChests().cells.length > 2, countOf(s1.items, "minecraft:chest"));
check("What it touches: a depot chest can't be a pickup point", !A.addPickup(by, H, ow.getBlock(depot().units[0].cells[0])).ok);

// ================= Sorting =================
const unitConts = (u) => [...new Set(u.cells.map(containerAt))];
const unitItems = (u) => unitConts(u).flatMap((c) => c.items.filter(Boolean));
const depotCount = (id) => countOf(depotChests().conts.flatMap((c) => c.items), id);
function sortingChecks(label, kinds) {
  const d = depot();
  for (const kind of kinds) {
    const us = d.units.filter((u) => u.kind === kind);
    check(`Sorting (${label}): one depot chest holds ${kind}`, us.length === 1, us.map((u) => u.cells));
    if (us.length !== 1) continue;
    check(`Sorting (${label}): all the ${kind} is in that chest`, countOf(unitItems(us[0]), kind) === depotCount(kind) && depotCount(kind) > 0, { inUnit: countOf(unitItems(us[0]), kind), inDepot: depotCount(kind) });
    check(`Sorting (${label}): the ${kind} chest is in its type's group`, us[0].group === A.groupOf(kind), { group: us[0].group, want: A.groupOf(kind) });
  }
  const mixed = d.units.filter((u) => unitItems(u).some((i) => i.typeId !== u.kind));
  check(`Sorting (${label}): every depot chest holds one kind`, mixed.length === 0, mixed.map((u) => ({ kind: u.kind, has: [...new Set(unitItems(u).map((i) => i.typeId))] })));
}
check("Sorting: groups (stone and dirt, ores, wood, food, other)",
  A.groupOf("minecraft:cobblestone") === "stone" && A.groupOf("minecraft:dirt") === "stone" && A.groupOf("minecraft:raw_iron") === "ores" && A.groupOf("minecraft:coal") === "ores"
  && A.groupOf("minecraft:gold_ingot") === "ores" && A.groupOf("minecraft:oak_log") === "wood" && A.groupOf("minecraft:bread") === "food" && A.groupOf("minecraft:string") === "other",
  KINDS.map((k) => [k, A.groupOf(k)]));
sortingChecks("first round", KINDS);
{
  // a second load: kinds it already has go to their chest; a new kind gets a new chest in its group
  const unitsBefore = depot().units.length;
  const cobBefore = depotCount("minecraft:cobblestone");
  fill(p1, "minecraft:cobblestone", 64); fill(p1, "minecraft:dirt", 10); fill(p1, "minecraft:gold_ingot", 5);
  const before2 = totals();
  dispatch(by, { worker: hName, job: "haul_now", params: {} });
  check("Sorting: the second round finishes", runUntil(roundDone, 12000, watch), { p1: usedSlots(p1), cargo: cargoStacks(H), job: jobOf(H) });
  run(40, watch);
  check("Counts: nothing lost or duplicated over the second round", same(totals(), before2), { before: before2, now: totals() });
  check("Sorting: only the new kind got a new chest", depot().units.length === unitsBefore + 1, { before: unitsBefore, now: depot().units.length });
  const cob = depot().units.find((u) => u.kind === "minecraft:cobblestone");
  check("Sorting: more cobblestone went into the cobblestone chest", cob && countOf(unitItems(cob), "minecraft:cobblestone") === cobBefore + 64, cob && countOf(unitItems(cob), "minecraft:cobblestone"));
  sortingChecks("second round", [...KINDS, "minecraft:gold_ingot"]);
  placementChecks("second round");
}

// ================= Roles: stop keeps a round paused, Continue picks it up =================
{
  fill(p2, "minecraft:coal", 64 * 3); fill(p3, "minecraft:cobblestone", 64 * 2);
  const before3 = totals();
  dispatch(by, { worker: hName, job: "haul_now", params: {} });
  runUntil(() => cargoStacks(H) > 0 && jobOf(H)?.type === "round", 6000, watch);
  const roundId = jobOf(H)?.id;
  const carrying = cargoStacks(H);
  const stop = dispatch(by, { worker: hName, job: "stop", params: {} });
  check("Roles: stop on a round keeps it as paused", stop.ok && !jobOf(H) && !!H.getDynamicProperty("crew:paused"), { msg: stop.message, paused: H.getDynamicProperty("crew:paused") });
  check("Roles: stopped, it keeps what it carries", carrying > 0 && cargoStacks(H) === carrying, { carrying, now: cargoStacks(H) });
  const started = events("round_started", hName).length;
  const inPickups = snap([...p2.items, ...p3.items]);
  run(400, watch);
  check("Roles: stopped, it starts no round by itself", events("round_started", hName).length === started && jobOf(H)?.type !== "round" && snap([...p2.items, ...p3.items]) === inPickups, jobOf(H));
  const res = dispatch(by, { worker: hName, job: "resume", params: {} });
  check("Roles: Continue (resume) picks the round back up", res.ok && jobOf(H)?.type === "round" && jobOf(H)?.id === roundId, { msg: res.message, job: jobOf(H) });
  check("Counts: the continued round finishes", runUntil(roundDone, 12000, watch), { p2: usedSlots(p2), p3: usedSlots(p3), cargo: cargoStacks(H), job: jobOf(H) });
  run(40, watch);
  check("Counts: nothing lost or duplicated over a stopped and continued round", same(totals(), before3), { before: before3, now: totals() });
}

// ================= Sorting: tidying =================
{
  const d = depot();
  const cob = d.units.find((u) => u.kind === "minecraft:cobblestone"), dirt = d.units.find((u) => u.kind === "minecraft:dirt");
  if (!cob || !dirt) check("Sorting: tidying needs the cobblestone and dirt chests", false);
  else {
    const cc = containerAt(cob.cells[0]);
    const free = () => cc.items.findIndex((i) => !i);
    const put = (it) => { const i = free(); cc.setItem(i, it); return i; };
    put(new ItemStack("minecraft:cobblestone", 20)); put(new ItemStack("minecraft:cobblestone", 30)); // half stacks
    const strayAt = put(new ItemStack("minecraft:dirt", 10)); // a stray: dirt has its own chest
    const shulkerAt = put(new ItemStack("minecraft:shulker_box", 1));
    const pick = new ItemStack("minecraft:iron_pickaxe", 1); pick.damage = 5;
    const pickAt = put(pick);
    const named = new ItemStack("minecraft:bread", 3); named.nameTag = "Lunch";
    const namedAt = put(named);
    const dirtBefore = countOf(unitItems(dirt), "minecraft:dirt");
    const before4 = totals();
    const halves = () => cc.items.filter((i) => i?.typeId === "minecraft:cobblestone" && i.amount < 64).length;
    let sawTidy = false;
    const tidied = runUntil(() => halves() <= 1 && countOf(cc.items, "minecraft:dirt") === 0, 4000, () => {
      watch();
      if (jobOf(H)?.type === "tidy" || statusText(H).split("\n")[0].includes("Tidying the depot")) sawTidy = true;
    });
    run(200, watch);
    check("Sorting: tidying merges half stacks", halves() <= 1, cc.items.filter((i) => i?.typeId === "minecraft:cobblestone").map((i) => i.amount));
    check("Sorting: tidying moves a stray to its kind's chest", tidied && countOf(cc.items, "minecraft:dirt") === 0 && countOf(unitItems(dirt), "minecraft:dirt") === dirtBefore + 10, { left: countOf(cc.items, "minecraft:dirt"), dirtBefore, dirtNow: countOf(unitItems(dirt), "minecraft:dirt") });
    check("Sorting: the status says \"Tidying the depot\" while it tidies", sawTidy);
    check("Sorting: tidying never moves a shulker box", cc.items[shulkerAt]?.typeId === "minecraft:shulker_box", cc.items[shulkerAt]);
    check("Sorting: tidying never moves a tool", cc.items[pickAt]?.typeId === "minecraft:iron_pickaxe" && cc.items[pickAt].damage === 5, cc.items[pickAt]);
    check("Sorting: tidying never moves a named item", cc.items[namedAt]?.typeId === "minecraft:bread" && cc.items[namedAt].nameTag === "Lunch" && cc.items[namedAt].amount === 3, cc.items[namedAt]);
    check("Counts: nothing lost or duplicated by tidying", same(totals(), before4), { before: before4, now: totals() });
    void strayAt;
  }
}

// ================= haul =================
{
  const depotBefore = sumOf(depotChests().conts.map((c) => c.items));
  fill(qa, "minecraft:cobblestone", 128); fill(qa, "minecraft:diamond", 5); fill(qa, "minecraft:coal", 10);
  const shopBefore = sumOf([shop.items]);
  const both = () => sumOf([qa.items, shop.items, carried(H)]);
  const b = both();
  const r = dispatch(by, { worker: hName, job: "haul", params: { from: "quarry box", to: "shop" } });
  check("haul: a Hauler takes a haul between two places", r.ok && jobOf(H)?.type === "haul", { msg: r.message, job: jobOf(H) });
  runUntil(() => jobOf(H)?.type !== "haul", 8000, watch);
  check("haul: every item moved from A to B", usedSlots(qa) === 0 && same(sumOf([shop.items]), { ...shopBefore, "minecraft:cobblestone": 128, "minecraft:diamond": 5, "minecraft:coal": 10 }) && cargoStacks(H) === 0,
    { a: sumOf([qa.items]), b: sumOf([shop.items]), carried: carried(H).length });
  check("haul: nothing lost or duplicated", same(both(), b), { before: b, now: both() });
  check("haul: it says when it's done", events("haul_done", hName).length === 1, events("haul_done", hName).length);
  check("haul: the depot isn't touched", same(sumOf(depotChests().conts.map((c) => c.items)), depotBefore));
  // with an item filter, by coordinates: only the listed kinds move
  fill(qa, "minecraft:iron_ingot", 7); fill(qa, "minecraft:coal", 9); fill(qa, "minecraft:dirt", 20);
  const shop2 = sumOf([shop.items]);
  const b2 = both();
  const f = dispatch(by, { worker: hName, job: "haul", params: { from: [QA.x, QA.y, QA.z], to: [SHOP.x, SHOP.y, SHOP.z], items: "minecraft:coal,minecraft:iron_ingot" } });
  check("haul: with an items filter, by coordinates", f.ok, f.message);
  runUntil(() => jobOf(H)?.type !== "haul", 8000, watch);
  check("haul: only the filter's items moved", same(sumOf([qa.items]), { "minecraft:dirt": 20 }) && same(sumOf([shop.items]), { ...shop2, "minecraft:coal": shop2["minecraft:coal"] + 9, "minecraft:iron_ingot": 7 }) && cargoStacks(H) === 0,
    { a: sumOf([qa.items]), b: sumOf([shop.items]) });
  check("haul: nothing lost or duplicated with a filter", same(both(), b2), { before: b2, now: both() });
}

// ================= What it touches (over everything above) =================
check("What it touches: never a home chest (a digger's, its own)", snap(h1.items) === fixedBefore[0] && snap(hh.items) === fixedBefore[1], { h1: sumOf([h1.items]), hh: sumOf([hh.items]) });
check("What it touches: never a chest outside the settlement (another player's place, a stray chest)", snap(cal1.items) === fixedBefore[2] && snap(r1.items) === fixedBefore[3]);
check("What it touches: never the storage chest's other goods", countOf(s1.items, "minecraft:flint") === 3);
check("What it touches: never a worker's inventory, kit tools or torches", workerSnaps() === workersBefore);
check("What it touches: its own gear stays in slots 0 and 1, never stored", H.inv.items[0]?.typeId === "minecraft:bundle" && H.inv.items[1]?.typeId === "minecraft:leather_boots"
  && !depotChests().conts.some((c) => c.items.some((i) => /bundle|leather_boots/.test(i?.typeId ?? ""))));
check("What it touches: it never broke a block (the floor under the depot is whole)", (() => { const d = depot(); for (let x = d.x0; x <= d.x1; x++) for (let z = d.z0; z <= d.z1; z++) if (ow.typeAt({ x, y: 64, z }) !== "minecraft:stone") return false; return true; })());
check("No job errors", !logs.some((l) => /job error|job_failed/.test(l)), logs.filter((l) => /job error|job_failed/.test(l)).slice(0, 3));

finish(TITLE);

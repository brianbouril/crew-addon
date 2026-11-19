// Hauler, part 3: the first review's fixes (specs/hauler.md). Settlement "Fixton" (Brian's, around
// x 7000) and "Elsewhere" (Cal's, around x 7200).
// - only the settlement's chests: haul refuses a stray chest and another settlement's; pickups too
// - placing a chest never removes a block (a torch in the area refuses the depot)
// - one kind per chest while chests and room last (12 kinds in the default depot: 12 chests)
// - tidying never merges stacks that don't stack (same id, different data)
// - rounds done are kept per day (a night far from players still starts a new day)
// - waiting at a full depot frees the work area
// - "Do a round now" during a round replaces it (the old one isn't picked back up later)
// - a haul whose destination is full puts the rest back where it came from
// - a tired Hauler eats its lunch, never its cargo; the backpack follows what it carries
import { ItemStack, setPlayers, setTimeOfDay, setDay, fire, log } from "@minecraft/server";
import { ow, logs, check, fails, loadApi, finish, run, runUntil, mkPlayer, asBy, placeBell, chest, fill, containerAt, sumOf, same, countOf, events, jobOf, stateOf } from "./hauler_common.mjs";
import "./scripts/main.js";
import { foundSettlement, settlementOf, getSettlements, addStorage } from "./scripts/settlement.js";
import { spawnWorker } from "./scripts/workers.js";
import { dispatch } from "./scripts/orders.js";
import { setEnergy, energy } from "./scripts/life.js";
import { setJSON } from "./scripts/util.js";

const TITLE = "hauler part 3 (review fixes)";
const A = await loadApi(["takeChests", "markDepot", "addPickup", "dueRound", "tidyPlan"]);
if (fails.length) finish(TITLE);
const OW = "minecraft:overworld";
const brian = mkPlayer("p1", "Brian", false, { x: 7002, y: 65, z: 6995 }), cal = mkPlayer("p3", "Cal", false, { x: 7200, y: 65, z: 7000 });
setPlayers([brian, cal]);
const by = asBy(brian), byCal = asBy(cal);
fire("world.afterEvents.worldLoad", {});
setTimeOfDay(1000);
check("setup: Fixton", foundSettlement(brian, placeBell(brian, { x: 6990, y: 65, z: 6990 }), "Fixton").ok);
check("setup: Elsewhere", foundSettlement(cal, placeBell(cal, { x: 7200, y: 65, z: 6990 }), "Elsewhere").ok);
const S = () => settlementOf({ id: "p1", name: "Brian" });
const SC = () => settlementOf({ id: "p3", name: "Cal" });

const P = { x: 7020, y: 65, z: 7000 };
const p = chest(P);
const dig = spawnWorker(ow, { x: 7020.5, y: 65, z: 7003.5 }, { id: "p1", name: "Brian" }, "Fixdig", [new ItemStack("minecraft:iron_shovel")]).e;
setJSON(dig, "crew:lastDeposit", { ...P, dim: OW, label: "Fixdig's chest" });
const H = spawnWorker(ow, { x: 7002.5, y: 65, z: 6997.5 }, { id: "p1", name: "Brian" }, "Fixer", [new ItemStack("minecraft:bundle"), new ItemStack("minecraft:leather_boots")]).e;
H.setDynamicProperty("crew:haulOff", true); // no rounds by itself until a part asks for one
check("setup: 16 chests", A.takeChests(H, new ItemStack("minecraft:chest", 16)) === undefined);
run(120);
const otherChest = chest({ x: 7210, y: 65, z: 7000 }, [["minecraft:diamond", 5]]);
check("setup: Cal's storage", addStorage(byCal, SC(), ow.getBlock({ x: 7210, y: 65, z: 7000 })).ok);
const stray = chest({ x: 7030, y: 65, z: 7020 }, [["minecraft:emerald", 3]]);

// ---- a torch in the area: the depot is refused (it would have to remove it) ----
const DEP = { dim: OW, from: { x: 7000, y: 64, z: 7000 }, to: { x: 7004, y: 64, z: 7006 } };
ow.setBlockType({ x: 7002, y: 65, z: 7003 }, "minecraft:torch");
check("a torch in the area refuses the depot", !A.markDepot(by, S(), DEP).ok);
ow.setBlockType({ x: 7002, y: 65, z: 7003 }, "minecraft:air");
check("without it the depot is marked", A.markDepot(by, S(), DEP).ok);
const depot = () => getSettlements()[S().id].depot;
const depotConts = () => depot().units.flatMap((u) => u.cells.map((c) => containerAt(c)));

// ---- only the settlement's chests ----
const haulStray = dispatch(by, { worker: "Fixer", job: "haul", params: { from: [7030, 65, 7020], to: [7020, 65, 7000] } });
check("haul from a chest that isn't the settlement's is refused", !haulStray.ok && /settlement/.test(haulStray.message), haulStray.message);
const haulCal = dispatch(by, { worker: "Fixer", job: "haul", params: { from: [7210, 65, 7000], to: [7020, 65, 7000] } });
check("haul from another settlement's storage is refused", !haulCal.ok, haulCal.message);
check("a pickup can't be another settlement's chest", !A.addPickup(by, H, ow.getBlock({ x: 7210, y: 65, z: 7000 })).ok);
check("an outsider can't add a pickup", !A.addPickup(byCal, H, ow.getBlock({ x: 7030, y: 65, z: 7020 })).ok);

// ---- one kind per chest: 12 kinds, 16 chests to place ----
const KINDS = ["cobblestone", "dirt", "gravel", "sand", "coal", "raw_iron", "oak_log", "birch_log", "bread", "apple", "string", "bone"].map((k) => `minecraft:${k}`);
for (const k of KINDS) fill(p, k, 10);
const all = () => sumOf([p.items, H.inv.items, ...depotConts().map((c) => c.items), otherChest.items, stray.items], "minecraft:chest");
const before = all();
check("Do a round now", dispatch(by, { worker: "Fixer", job: "haul_now", params: {} }).ok);
check("the round finishes", runUntil(() => !jobOf(H), 20000));
check("totals hold", same(all(), before), { before, after: all() });
const units = depot().units;
check("12 kinds: 12 chests, one each", units.length === 12 && new Set(units.map((u) => u.kind)).size === 12, units.map((u) => [u.kind, u.cells.length]));
check("every chest holds only its kind", units.every((u) => u.cells.every((c) => containerAt(c).items.every((i) => !i || i.typeId === u.kind))));
check("the stray chest and Cal's chest are untouched", countOf(stray.items, "minecraft:emerald") === 3 && countOf(otherChest.items, "minecraft:diamond") === 5);

// ---- tidying: stacks that don't stack stay apart ----
const cobUnit = units.find((u) => u.kind === "minecraft:cobblestone");
const cob = containerAt(cobUnit.cells[0]);
const rocket = (data, n) => Object.assign(new ItemStack("minecraft:firework_rocket", n), { data });
cob.setItem(20, rocket("flight 1", 5));
cob.setItem(21, rocket("flight 3", 7));
cob.setItem(22, new ItemStack("minecraft:cobblestone", 3));
H.setDynamicProperty("crew:haulOff", undefined);
setJSON(H, "crew:rounds", ["morning"]);
H.setDynamicProperty("crew:roundsDay", 0);
run(1200);
const rockets = cob.items.filter((i) => i?.typeId === "minecraft:firework_rocket").map((i) => [i.data, i.amount]).sort();
check("rockets with different flights are never merged", JSON.stringify(rockets) === JSON.stringify([["flight 1", 5], ["flight 3", 7]]), rockets);
check("the half cobblestone stacks were merged", cob.items.filter((i) => i?.typeId === "minecraft:cobblestone").length === 1, cob.items.filter(Boolean).map((i) => [i.typeId, i.amount]));
check("and tidying stops (nothing left to do)", !A.tidyPlan(S()));
cob.setItem(20, undefined);
cob.setItem(21, undefined);

// ---- rounds done are kept per day ----
setJSON(H, "crew:rounds", ["morning", "midday", "evening"]);
H.setDynamicProperty("crew:roundsDay", 0);
setDay(0);
check("today's morning round done: none due", A.dueRound(H) === undefined);
setDay(1);
check("next day (no night seen): the morning round is due again", A.dueRound(H) === "morning");
// the morning starts at dawn (23000), before the game's day number goes up at 0: still one morning round
setDay(4);
setTimeOfDay(23500);
setJSON(H, "crew:rounds", []);
H.setDynamicProperty("crew:roundsDay", undefined);
H.setDynamicProperty("crew:haulOff", undefined);
const mornings = events("round_started", "Fixer").length;
run(40);
check("a morning round starts at dawn", events("round_started", "Fixer").length === mornings + 1);
runUntil(() => !jobOf(H), 20000);
setTimeOfDay(1000);
setDay(5);
check("after midnight the morning round isn't due again", A.dueRound(H) === undefined);
run(100);
check("and no second morning round starts", events("round_started", "Fixer").length === mornings + 1, events("round_started", "Fixer").length - mornings);
H.setDynamicProperty("crew:haulOff", true);
setJSON(H, "crew:rounds", ["morning"]);
H.setDynamicProperty("crew:roundsDay", 1);
run(40);

// ---- "Do a round now" during a round replaces it ----
fill(p, "minecraft:cobblestone", 30);
check("round 1", dispatch(by, { worker: "Fixer", job: "haul_now", params: {} }).ok);
run(30);
const firstId = jobOf(H)?.id;
check("round 2 while round 1 runs", dispatch(by, { worker: "Fixer", job: "haul_now", params: {} }).ok);
const secondId = jobOf(H)?.id;
check("it's a new round", !!firstId && !!secondId && firstId !== secondId, [firstId, secondId]);
check("the old one isn't kept to pick up later", H.getDynamicProperty("crew:paused") === undefined);
runUntil(() => !jobOf(H), 20000);
run(100);
check("and isn't picked back up", !jobOf(H) && events("job_resumed", "Fixer").length === 0);

// ---- a haul whose destination is full puts the rest back ----
const X = { x: 7010, y: 65, z: 6990 };
const x = chest(X);
for (let i = 0; i < 53; i++) x.setItem(i, new ItemStack("minecraft:dirt", 64));
check("setup: X is storage", addStorage(by, S(), ow.getBlock(X)).ok);
fill(p, "minecraft:coal", 64 * 3);
const coalBefore = countOf(p.items, "minecraft:coal") + countOf(x.items, "minecraft:coal") + countOf(H.inv.items, "minecraft:coal");
check("haul coal to the nearly full chest", dispatch(by, { worker: "Fixer", job: "haul", params: { from: [7020, 65, 7000], to: [7010, 65, 6990], items: "minecraft:coal" } }).ok);
runUntil(() => !jobOf(H), 20000);
check("one stack went in", countOf(x.items, "minecraft:coal") === 64, countOf(x.items, "minecraft:coal"));
check("the rest went back to where it came from", countOf(p.items, "minecraft:coal") === coalBefore - 64 && countOf(H.inv.items, "minecraft:coal") === 0, [countOf(p.items, "minecraft:coal"), countOf(H.inv.items, "minecraft:coal")]);

// ---- waiting at a full depot frees the work area ----
for (let i = 23; i < 36; i++) H.inv.setItem(i, undefined); // no chests left to place
for (const u of depot().units) for (const c of u.cells) { const ct = containerAt(c); for (let i = 0; i < ct.size; i++) if (!ct.items[i] || ct.items[i].amount < 64) ct.setItem(i, new ItemStack(u.kind, 64)); }
fill(p, "minecraft:glass", 20);
log.commands.length = 0;
check("round into a full depot", dispatch(by, { worker: "Fixer", job: "haul_now", params: {} }).ok);
const rid = jobOf(H)?.id;
check("it waits at the full depot", runUntil(() => stateOf(H).phase === "wait_full", 20000), stateOf(H).phase);
check("having freed its work area", log.commands.some((c) => c === `tickingarea remove crew_${rid}`) && jobOf(H)?.tickingArea === false, log.commands.filter((c) => /tickingarea/.test(c)));
dispatch(by, { worker: "Fixer", job: "stop", params: {} });
run(5);

// ---- a tired Hauler eats its lunch, not its cargo ----
H.setDynamicProperty("crew:paused", undefined);
for (let i = 5; i < 23; i++) H.inv.setItem(i, undefined);
H.inv.setItem(5, new ItemStack("minecraft:bread", 10)); // cargo bread
H.inv.setItem(30, new ItemStack("minecraft:cooked_beef", 4)); // its lunch
setEnergy(H, 20);
check("drop off at the depot", dispatch(by, { worker: "Fixer", job: "drop_off", params: {} }).ok);
run(400);
check("it ate its lunch when tired", countOf(H.inv.items.slice(23), "minecraft:cooked_beef") < 4 && energy(H) > 20, [countOf(H.inv.items.slice(23), "minecraft:cooked_beef"), energy(H)]);

// ---- the backpack follows what it carries, even when idle ----
for (let i = 5; i < 23; i++) H.inv.setItem(i, undefined);
dispatch(by, { worker: "Fixer", job: "stop", params: {} });
H.inv.setItem(6, new ItemStack("minecraft:stick", 5));
run(25);
check("carrying: the backpack bulges", H.getProperty("crew:loaded") === true);
H.inv.setItem(6, undefined);
run(25);
check("empty: it's flat", H.getProperty("crew:loaded") === false);

finish(TITLE);

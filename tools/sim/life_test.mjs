// A day in the life (v0.4): set a home (bed + chest), dig by day; at dusk the dig pauses, the
// worker walks home, unloads into its home chest and sleeps in its bed. The night is skipped
// (players slept): it wakes rested, takes torches, food and a spare pickaxe from home, and goes
// back to the dig where it left off. Later, tired, it eats from its packed lunch. A worker with no
// home sleeps where it stands. A bed under the open sky is reported unsafe.
import { world, tick, ItemStack, setTimeOfDay } from "@minecraft/server";
import { startEngine, wakeUp } from "./scripts/runner.js";
import { spawnWorker } from "./scripts/workers.js";
import { dispatch } from "./scripts/orders.js";
import { energy, setEnergy } from "./scripts/life.js";

const logs = []; const out = console.log; console.log = (...a) => logs.push(a.join(" ")); console.warn = (...a) => logs.push("WARN " + a.join(" "));
const ow = world.getDimension("minecraft:overworld");
// a little house: bed (two blocks) with a stone roof, and a chest beside it with supplies
const bedHead = { x: 600, y: 65, z: 600 }, bedFoot = { x: 600, y: 65, z: 601 };
ow.setBlockType(bedHead, "minecraft:bed"); ow.setBlockType(bedFoot, "minecraft:bed");
for (let x = 598; x <= 603; x++) for (let z = 598; z <= 604; z++) ow.setBlockType({ x, y: 69, z }, "minecraft:stone");
const chestAt = { x: 602, y: 65, z: 600 };
ow.setBlockType(chestAt, "minecraft:chest");
const chest = ow.getBlock(chestAt).getComponent("minecraft:inventory").container;
chest.addItem(new ItemStack("minecraft:torch", 32)); chest.addItem(new ItemStack("minecraft:bread", 10)); chest.addItem(new ItemStack("minecraft:iron_pickaxe", 1));
// a bed out in the open, for the safety check
ow.setBlockType({ x: 640, y: 65, z: 600 }, "minecraft:bed"); ow.setBlockType({ x: 640, y: 65, z: 601 }, "minecraft:bed");

startEngine();
const by = { id: "p1", name: "Brian", isOp: false };
const ub = new ItemStack("minecraft:iron_pickaxe"); ub.enchants.unbreaking = 3;
const { e } = spawnWorker(ow, { x: 601.5, y: 65, z: 603.5 }, { id: "p1", name: "Brian" }, "Bea", [ub]);
const home = dispatch(by, { worker: "Bea", job: "set_home", params: { bed: [bedHead.x, bedHead.y, bedHead.z] } });
const job = () => JSON.parse(e.getDynamicProperty("crew:job") ?? "null");
const st = () => JSON.parse(e.getDynamicProperty("crew:state") ?? "{}");
const count = (inv, id) => inv.items.filter((s) => s?.typeId === id).reduce((a, s) => a + s.amount, 0);
let t = 0;
const run = (until, max) => { const end = t + max; while (!until() && t < end) tick(++t); return t; };

// day: start a branch mine, dig for a while
setTimeOfDay(1000);
dispatch(by, { worker: "Bea", job: "branch_mine", params: { start: [600, 64, 610], facing: "south", target_y: 60, trunk_length: 10, branch_length: 3, spacing: 2, deposit: [chestAt.x, chestAt.y, chestAt.z], keep: "all" } });
run(() => (st().i ?? 0) >= 30, 20000);
const dugBeforeNight = st().i;
// dusk
setTimeOfDay(13000);
run(() => job()?.type === "rest" && st().phase === "asleep", 4000);
const night = { job: job()?.type, phase: st().phase, quality: st().quality, anim: e.anim, zzz: e.nameTag.includes("Zzz"),
  nearBed: Math.hypot(e.location.x - 600.5, e.location.z - 601) < 1.5, pausedAt: JSON.parse(e.getDynamicProperty("crew:paused") ?? "{}").st?.i,
  autoResume: !!e.getDynamicProperty("crew:autoResume"), inHomeChest: chest.items.filter(Boolean).reduce((a, s) => a + s.amount, 0) - 43 };
// a few hours asleep, then the players skip the night
run(() => false, 300);
setTimeOfDay(0);
run(() => ["branch_mine"].includes(job()?.type), 400);
const morning = { job: job()?.type, resumedAt: st().i, energy: energy(e), torches: count(e.inv, "minecraft:torch"), bread: count(e.inv, "minecraft:bread"),
  kit: e.inv.items.slice(0, 5).filter(Boolean).length, zzz: e.nameTag.includes("Zzz"), autoResume: !!e.getDynamicProperty("crew:autoResume"), breadLeftAtHome: count(chest, "minecraft:bread") };
// later that day it's worn down: it eats from its packed lunch and carries on
setEnergy(e, 25);
run(() => energy(e) > 40, 2000);
const lunch = { energyAfter: Math.round(energy(e)), bread: count(e.inv, "minecraft:bread"), stillDigging: job()?.type === "branch_mine" };
run(() => !job(), 60000);
const finished = !job();

// no home: it sleeps where it stands, and less well
const { e: e2 } = spawnWorker(ow, { x: 700.5, y: 65, z: 700.5 }, { id: "p1", name: "Brian" }, "Rook", [new ItemStack("minecraft:iron_pickaxe")]);
dispatch(by, { worker: "Rook", job: "quarry", params: { from: [700, 63, 700], to: [703, 64, 703], facing: "south", deposit: [chestAt.x, chestAt.y, chestAt.z], keep: "all" } });
run(() => JSON.parse(e2.getDynamicProperty("crew:state") ?? "{}").i >= 5, 4000);
setEnergy(e2, 30);
setTimeOfDay(13000);
run(() => JSON.parse(e2.getDynamicProperty("crew:state") ?? "{}").phase === "asleep", 2000);
const roughAt = { ...e2.location };
run(() => false, 1500);
setTimeOfDay(0);
run(() => JSON.parse(e2.getDynamicProperty("crew:job") ?? "null")?.type === "quarry", 400);
const homeless = { sleptWhereItStood: Math.hypot(roughAt.x - 701, roughAt.z - 701) < 4, quality: "rough", energyAfter: Math.round(energy(e2)), backToWork: JSON.parse(e2.getDynamicProperty("crew:job") ?? "null")?.type };

// dawn counts as morning: an idle worker with a home doesn't go to bed at 23000, and one asleep gets up
stopIfBusy(e);
setTimeOfDay(23000);
run(() => false, 60);
const dawnIdle = JSON.parse(e.getDynamicProperty("crew:job") ?? "null")?.type ?? "idle";
setTimeOfDay(14000);
run(() => JSON.parse(e.getDynamicProperty("crew:state") ?? "{}").phase === "asleep", 3000);
const asleepAtNight = JSON.parse(e.getDynamicProperty("crew:state") ?? "{}").phase;
setTimeOfDay(23100);
run(() => !e.getDynamicProperty("crew:job"), 200);
const dawn = { idleWorkerAt23000: dawnIdle, asleepAtNight, upAtDawn: !e.getDynamicProperty("crew:job") };
function stopIfBusy(w) { if (w.getDynamicProperty("crew:job")) dispatch(by, { worker: "Bea", job: "stop", params: {} }); }

// woken from its menu at night: it gets up beside the bed, stays up about a minute with nothing to
// do, then goes back to bed. Given a dig at night, it stays up while it digs.
setTimeOfDay(14000);
run(() => st().phase === "asleep" && job()?.type === "rest", 3000);
const wasAsleep = st().phase === "asleep";
const woke = wakeUp(e);
run(() => false, 40);
const afterWake = { job: job()?.type ?? "idle", zzz: e.nameTag.includes("Zzz"), besideBed: Math.hypot(e.location.x - 600.5, e.location.z - 601) < 2.5 };
run(() => false, 20 * 30);
const after30s = job()?.type ?? "idle";
run(() => job()?.type === "rest", 20 * 45);
const afterAMinute = job()?.type ?? "idle";
dispatch(by, { worker: "Bea", job: "quarry", params: { from: [610, 63, 590], to: [614, 64, 594], facing: "south", deposit: [chestAt.x, chestAt.y, chestAt.z], keep: "all" } });
run(() => false, 20 * 20);
const wake = { wasAsleep, woke, afterWake, after30s, afterAMinute, nightDigStaysUp: job()?.type };
dispatch(by, { worker: "Bea", job: "stop", params: {} });

// an idle worker with no home lies down where it stands at night
const { e: e4 } = spawnWorker(ow, { x: 720.5, y: 65, z: 720.5 }, { id: "p1", name: "Brian" }, "Moss", [new ItemStack("minecraft:stone_pickaxe")]);
setTimeOfDay(14000);
run(() => JSON.parse(e4.getDynamicProperty("crew:state") ?? "{}").phase === "asleep", 200);
const idleHomeless = { phase: JSON.parse(e4.getDynamicProperty("crew:state") ?? "{}").phase, anim: e4.anim, zzz: e4.nameTag.includes("Zzz") };
setTimeOfDay(1000);
run(() => !e4.getDynamicProperty("crew:job"), 200);
idleHomeless.upInMorning = !e4.getDynamicProperty("crew:job");

// a bed with no roof is unsafe
const { e: e3 } = spawnWorker(ow, { x: 641.5, y: 65, z: 603.5 }, { id: "p1", name: "Brian" }, "Fern", [new ItemStack("minecraft:stone_pickaxe")]);
const openBed = dispatch(by, { worker: "Fern", job: "set_home", params: { bed: [640, 65, 600] } });
const taken = dispatch(by, { worker: "Fern", job: "set_home", params: { bed: [600, 65, 601] } });

console.log = out;
console.log(JSON.stringify({ setHome: home.message, dugBeforeNight, night, morning, lunch, finished, homeless, dawn, wake, idleHomeless, inventorySlots: e.inv.size, openBed: openBed.message, bedTaken: taken.message,
  shortcutsTaken: logs.filter((l) => l.includes('"stuck"')).length }, null, 1));
console.log(logs.filter((l) => /"rest"|woke|tired|unsafe_bed|stuck|WARN|failed/.test(l)).join("\n"));

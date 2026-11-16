// Continue: stop a branch mine part way, send the worker to drop off, then continue. It must pick
// up at the step where it stopped (not from the start), finish the same tunnels as an
// uninterrupted run, and a new dig order must replace the paused one.
import { world, tick, ItemStack } from "@minecraft/server";
import { startEngine } from "./scripts/runner.js";
import { findWorker, setRole, spawnWorker } from "./scripts/workers.js";
import { dispatch } from "./scripts/orders.js";

const logs = []; const out = console.log; console.log = (...a) => logs.push(a.join(" ")); console.warn = (...a) => logs.push("WARN " + a.join(" "));
const ow = world.getDimension("minecraft:overworld");
const chest = { x: 500, y: 65, z: 506 };
ow.setBlockType(chest, "minecraft:chest");
startEngine();
const by = { id: "p1", name: "Brian", isOp: false };
const ub = new ItemStack("minecraft:iron_pickaxe"); ub.enchants.unbreaking = 3;
const { e } = spawnWorker(ow, { x: 500.5, y: 65, z: 508.5 }, { id: "p1", name: "Brian" }, "Dot", [ub]);
const params = { start: [500, 64, 500], facing: "north", target_y: 58, trunk_length: 12, branch_length: 4, spacing: 2, deposit: [chest.x, chest.y, chest.z], keep: "all" };
const started = dispatch(by, { internal: true, worker: "Dot", job: "branch_mine", params });
const step = () => JSON.parse(e.getDynamicProperty("crew:state") ?? "{}").i ?? 0;
let t = 0;
while (step() < 40 && t < 50000) tick(++t);
const stoppedAt = step();
const stop = dispatch(by, { worker: "Dot", job: "stop", params: {} });
const statusStopped = dispatch(by, { worker: "Dot", job: "status", params: {} }).message;
const drop = dispatch(by, { worker: "Dot", job: "drop_off", params: {} });
while (e.getDynamicProperty("crew:job") && t < 60000) tick(++t);
const inChestAfterDrop = ow.getBlock(chest).getComponent("minecraft:inventory").container.items.filter(Boolean).reduce((a, s) => a + s.amount, 0);
const cont = dispatch(by, { worker: "Dot", job: "resume", params: {} });
const resumedAt = step();
while (e.getDynamicProperty("crew:job") && t < 200000) tick(++t);
const again = dispatch(by, { worker: "Dot", job: "resume", params: {} });
// every planned cell open?
const g = JSON.parse(logs.find((l) => l.includes('"job_started"')).replace(/^.*?\{/, "{"));
let open = 0, total = 0;
const n = 65 - 58, P = (j) => ({ x: 500, z: 500 - (n + j) });
for (let j = 0; j < 12; j++) for (let dx = 0; dx < 2; dx++) for (const h of [0, 1]) { total++; if (/air|torch/.test(ow.typeAt({ x: P(j).x + dx, y: 58 + h, z: P(j).z }))) open++; }
console.log = out;
console.log(JSON.stringify({ started: started.message, stoppedAt, stop: stop.message, statusStopped, drop: drop.message, inChestAfterDrop, cont: cont.message, resumedAt,
  finished: !e.getDynamicProperty("crew:job"), trunkCellsOpen: `${open}/${total}`, continueAgain: again.message, pausedLeft: e.getDynamicProperty("crew:paused") ?? null,
  shortcutsTaken: logs.filter((l) => l.includes('"stuck"')).length, mode: g.mode }, null, 1));
console.log(logs.filter((l) => /stopped|job_resumed|job_done|stuck|WARN|failed/.test(l)).join("\n"));

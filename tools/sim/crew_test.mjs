import { world, tick, ItemStack } from "@minecraft/server";
import { startEngine } from "./scripts/runner.js";
import { findWorker, setRole, spawnWorker } from "./scripts/workers.js";
import { dispatch } from "./scripts/orders.js";
import { setJSON } from "./scripts/util.js";
const out = []; console.log = (...a) => out.push(a.join(" ")); console.warn = console.log;
const ow = world.getDimension("minecraft:overworld");
ow.setBlockType({ x: -3, y: 65, z: 2 }, "minecraft:barrel");
startEngine();
const { e } = spawnWorker(ow, { x: 0.5, y: 65, z: 0.5 }, { id: "p1", name: "Brian" }, "Pip", [new ItemStack("minecraft:iron_pickaxe")]);
const sam = { id: "p2", name: "Sam", isOp: false };
setJSON(e, "crew:crew", [{ id: "p2", name: "Sam" }]); // what /crew:allow Pip Sam does
setRole(findWorker("pip"), "Digger"); const r = dispatch(sam, { worker: "pip", job: "quarry", params: { from: [3, 64, 3], to: [8, 60, 8], deposit: [-3, 65, 2], keep: "all" } });
let t = 0;
for (; t < 400; t++) tick(t + 1);
const mid = JSON.parse(e.getDynamicProperty("crew:state")).i;
e.isValid = false; for (let k = 0; k < 100; k++) tick(++t); // chunk unloads / server restarts
e.isValid = true;
while (e.getDynamicProperty("crew:job") && t < 100000) tick(++t);
let left = 0; for (let x = 3; x <= 8; x++) for (let y = 60; y <= 64; y++) for (let z = 3; z <= 8; z++) if (!ow.typeAt({ x, y, z }).endsWith("air")) left++; // includes the 4 stair blocks
const barrel = ow.getBlock({ x: -3, y: 65, z: 2 }).getComponent("minecraft:inventory").container;
const status = dispatch(sam, { worker: "Pip", job: "status", params: {} }).message;
const bad = dispatch({ id: "p3", name: "Eve", isOp: false }, { worker: "Pip", job: "stop", params: {} }).message;
setRole(findWorker("Pip"), "Digger"); const oldName = dispatch(sam, { worker: "Pip", job: "mine_area", params: { from: [3, 59, 3], to: [4, 59, 4], deposit: [-3, 65, 2] } }).message;
for (let k = 0; k < 4000 && e.getDynamicProperty("crew:job"); k++) tick(++t);
setRole(findWorker("Pip"), "Digger"); const badJob = dispatch(sam, { worker: "Pip", job: "mine_area", params: { from: [0, 0, 0], to: [200, 5, 5], deposit: "nowhere" } }).message;
process.stdout.write(JSON.stringify({ samOrder: r.message, pausedAtIndex: mid, ticks: t, seconds: t / 20, leftInBox: left, barrel: barrel.items.filter(Boolean).reduce((a, s) => a + s.amount, 0), status, eveTriesStop: bad, v01JobName: oldName, tooBig: badJob, events: out.filter((l) => /job_done|stuck|failed/.test(l)) }, null, 1) + "\n");

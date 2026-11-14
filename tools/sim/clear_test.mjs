// Clear above: a quarry staked at ground level with a dirt hill and a tree standing on its area.
// The worker clears everything over the box first (top down, reaching up to the tree from the
// ground rather than climbing it), then digs the quarry, so nothing is left floating.
// A quarry staked deep underground is refused instead of digging up to the surface.
import { world, tick, ItemStack } from "@minecraft/server";
import { startEngine } from "./scripts/runner.js";
import { spawnWorker } from "./scripts/workers.js";
import { dispatch } from "./scripts/orders.js";
import { quarryGeom, isStairBlock } from "./scripts/plans.js";

const logs = []; const out = console.log; console.log = (...a) => logs.push(a.join(" ")); console.warn = (...a) => logs.push("WARN " + a.join(" "));
const ow = world.getDimension("minecraft:overworld");
// ground is stone up to y 64 in the mock; the quarry's top corner is a ground block
const g0 = quarryGeom({ x: 1000, y: 64, z: 1000 }, "south", 8, 8, 4);
const { min, max } = g0;
// a dirt hill, 3 high in the middle, over part of the box (and spilling past its edge)
for (let x = min.x + 1; x <= min.x + 6; x++) for (let z = min.z - 1; z <= min.z + 4; z++) {
  const h = Math.min(x - min.x, min.x + 7 - x, z - min.z + 2, min.z + 5 - z);
  for (let y = 65; y < 65 + Math.max(1, Math.min(3, h)); y++) ow.setBlockType({ x, y, z }, "minecraft:dirt");
}
// an oak tree on the box: 5-block trunk, leaves around the top
const tx = min.x + 5, tz = min.z + 6;
for (let y = 65; y <= 69; y++) ow.setBlockType({ x: tx, y, z: tz }, "minecraft:oak_log");
for (let x = tx - 1; x <= tx + 1; x++) for (let z = tz - 1; z <= tz + 1; z++) for (let y = 68; y <= 70; y++) if (!(x === tx && z === tz && y < 70)) ow.setBlockType({ x, y, z }, "minecraft:oak_leaves");
ow.setBlockType({ x: max.x + 3, y: 65, z: min.z - 3 }, "minecraft:chest");

startEngine();
const by = { id: "p1", name: "Brian", isOp: false };
const { e } = spawnWorker(ow, { x: max.x + 3.5, y: 65, z: min.z - 5.5 }, { id: "p1", name: "Brian" }, "Clay",
  [new ItemStack("minecraft:diamond_pickaxe"), new ItemStack("minecraft:iron_shovel"), new ItemStack("minecraft:iron_axe"), new ItemStack("minecraft:torch", 16)]);
const order = dispatch(by, { worker: "Clay", job: "quarry", params: { from: min, to: max, facing: "south", deposit: [max.x + 3, 65, min.z - 3], keep: "all", pace: "fast", clear_above: true } });
const job = JSON.parse(e.getDynamicProperty("crew:job") ?? "null");
let t = 0, maxJump = 0, last = { ...e.location }, highest = -99;
while (e.getDynamicProperty("crew:job") && t < 200000) {
  tick(++t);
  const l = e.location;
  maxJump = Math.max(maxJump, Math.hypot(l.x - last.x, l.y - last.y, l.z - last.z));
  highest = Math.max(highest, l.y);
  last = { ...l };
}
const up = job?.geom?.up ?? 0;
let leftAbove = 0, leftInBox = 0;
const leftovers = [];
for (let x = min.x; x <= max.x; x++) for (let z = min.z; z <= max.z; z++) {
  for (let y = max.y + 1; y <= max.y + 8; y++) { const tt = ow.typeAt({ x, y, z }); if (!/air|torch/.test(tt)) { leftAbove++; leftovers.push(`${tt}@${x},${y},${z}`); } }
  for (let y = min.y; y <= max.y; y++) { const tt = ow.typeAt({ x, y, z }); if (!/air|torch/.test(tt) && !isStairBlock(job.geom, { x, y, z })) leftInBox++; }
}
// staked underground (y 0, 64 layers of stone over it): refused, nothing starts
const { e: e2 } = spawnWorker(ow, { x: 1100.5, y: 65, z: 1100.5 }, { id: "p1", name: "Brian" }, "Mole", [new ItemStack("minecraft:iron_pickaxe")]);
const deep = dispatch(by, { worker: "Mole", job: "quarry", params: { from: [1100, -3, 1100], to: [1104, 0, 1104], facing: "south", deposit: [max.x + 3, 65, min.z - 3], clear_above: true } });

console.log = out;
console.log(JSON.stringify({ order: order.message, layersAbove: up, ticks: t, finished: !e.getDynamicProperty("crew:job"), leftAbove, leftovers: leftovers.slice(0, 8), leftInBox,
  highestY: +highest.toFixed(1), climbedTheTree: highest > 68, maxJump: +maxJump.toFixed(2), underground: { refused: !deep.ok, message: deep.message, started: !!e2.getDynamicProperty("crew:job") },
  shortcutsTaken: logs.filter((l) => l.includes('"stuck"')).length,
  stuckAt: e.getDynamicProperty("crew:job") ? (() => { const s = JSON.parse(e.getDynamicProperty("crew:state") ?? "{}"); return { phase: s.phase, i: s.i, of: job.geom.total, pre: job.geom.pre, stage: s.stage, wait: s.wait, stand: s.stand, q: s.q, at: e.location, carrying: e.inv.items.slice(5).filter(Boolean).length }; })() : undefined }, null, 1));
console.log(logs.filter((l) => /stuck|WARN|failed/.test(l)).slice(0, 10).join("\n"));

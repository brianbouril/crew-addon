// Restarting a half-dug quarry (here: the same box again, now with Clear above, after a tree grew
// on it): the worker clears above, then goes straight to the first block still there. It mustn't
// walk through every already-dug cell on the way (that looked like retracing its steps).
import { world, tick, ItemStack } from "@minecraft/server";
import { startEngine } from "./scripts/runner.js";
import { insideTracker, blinkCount } from "./inside.mjs";
const inside = insideTracker();
import { findWorker, setRole, spawnWorker } from "./scripts/workers.js";
import { dispatch } from "./scripts/orders.js";
import { quarryGeom } from "./scripts/plans.js";

const logs = []; const out = console.log; console.log = (...a) => logs.push(a.join(" ")); console.warn = (...a) => logs.push("WARN " + a.join(" "));
const ow = world.getDimension("minecraft:overworld");
const g = quarryGeom({ x: 1400, y: 64, z: 1400 }, "south", 8, 8, 8);
const chest = { x: g.max.x + 3, y: 65, z: g.min.z - 3 };
ow.setBlockType(chest, "minecraft:chest");
startEngine();
const by = { id: "p1", name: "Brian", isOp: false };
const { e } = spawnWorker(ow, { x: chest.x + 0.5, y: 65, z: chest.z - 2.5 }, { id: "p1", name: "Brian" }, "Flint",
  [new ItemStack("minecraft:diamond_pickaxe"), new ItemStack("minecraft:diamond_pickaxe"), new ItemStack("minecraft:iron_axe")]);
const st = () => JSON.parse(e.getDynamicProperty("crew:state") ?? "{}");
setRole(findWorker("Flint"), "Digger"); const order = (clear) => dispatch(by, { worker: "Flint", job: "quarry", params: { from: g.min, to: g.max, facing: "south", deposit: [chest.x, chest.y, chest.z], keep: "nothing", clear_above: clear } });
let t = 0;
// dig 5 of the 8 layers, then stop
order(false);
const per = g.size.x * g.size.z;
while (st().i < per * 5 && t < 100000) tick(++t);
dispatch(by, { worker: "Flint", job: "stop", params: {} });
// a small tree on the dug area's rim
for (let y = 65; y <= 67; y++) ow.setBlockType({ x: g.max.x, y, z: g.max.z }, "minecraft:oak_log");
// start the same quarry again with Clear above
order(true);
const job = JSON.parse(e.getDynamicProperty("crew:job"));
let walked = 0, last = { ...e.location }, firstDigAt = null;
const startT = t;
const solidLeft = () => { let n = 0; for (let x = g.min.x; x <= g.max.x; x++) for (let z = g.min.z; z <= g.max.z; z++) for (let y = g.min.y; y <= g.max.y; y++) if (!/air|torch/.test(ow.typeAt({ x, y, z }))) n++; return n; };
const before = solidLeft();
while (e.getDynamicProperty("crew:job") && t < startT + 100000) {
  tick(++t);
  inside.check(e, t);
  const l = e.location;
  walked += Math.hypot(l.x - last.x, l.y - last.y, l.z - last.z);
  last = { ...l };
  if (firstDigAt === null && solidLeft() < before) firstDigAt = t - startT;
}
console.log = out;
console.log(JSON.stringify({ layersAbove: job.geom.up, finished: !e.getDynamicProperty("crew:job"), blocksLeftWhenRestarted: before, leftAfter: solidLeft(),
  blocksWalkedAfterRestart: Math.round(walked), secondsToFirstDigInTheBox: firstDigAt === null ? null : +(firstDigAt / 20).toFixed(1),
  insideBlocks: inside.result(), blinks: blinkCount(logs), shortcutsTaken: logs.filter((l) => l.includes('"stuck"')).length }, null, 1));
console.log(logs.filter((l) => /stuck|WARN|failed/.test(l)).slice(0, 5).join("\n"));

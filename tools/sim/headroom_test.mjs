// Headroom: a quarry whose top layer has blocks just above it (head height for the worker).
// Blocks its tools can break are cleared so it can stand there; obsidian (iron pickaxe only)
// is left and it stands beside it instead. Nothing else outside the box changes.
import { world, tick, ItemStack } from "@minecraft/server";
import { startEngine } from "./scripts/runner.js";
import { spawnWorker } from "./scripts/workers.js";
import { dispatch } from "./scripts/orders.js";

const logs = []; const out = console.log; console.log = (...a) => logs.push(a.join(" ")); console.warn = (...a) => logs.push("WARN " + a.join(" "));
const ow = world.getDimension("minecraft:overworld");
ow.setBlockType({ x: 300, y: 65, z: 296 }, "minecraft:chest");
const heads = [{ x: 301, y: 65, z: 301, t: "minecraft:stone" }, { x: 302, y: 65, z: 302, t: "minecraft:dirt" }, { x: 303, y: 65, z: 301, t: "minecraft:obsidian" }];
for (const h of heads) ow.setBlockType(h, h.t);
const before = new Map(ow.blocks);
startEngine();
const by = { id: "p1", name: "Brian", isOp: false };
const { e } = spawnWorker(ow, { x: 300.5, y: 65, z: 298.5 }, { id: "p1", name: "Brian" }, "Clay", [new ItemStack("minecraft:iron_pickaxe")]);
const order = dispatch(by, { worker: "Clay", job: "quarry", params: { from: [300, 63, 300], to: [304, 64, 304], facing: "east", deposit: [300, 65, 296], keep: "valuables" } });
let t = 0;
while (e.getDynamicProperty("crew:job") && t < 100000) tick(++t);
const inBox = (x, y, z) => x >= 300 && x <= 304 && y >= 63 && y <= 64 && z >= 300 && z <= 304;
const changedOutside = [];
for (let x = 296; x <= 308; x++) for (let y = 60; y <= 68; y++) for (let z = 294; z <= 308; z++) {
  const k = `${x},${y},${z}`;
  if (!inBox(x, y, z) && ow.blocks.get(k) !== before.get(k)) changedOutside.push(`${ow.typeAt({ x, y, z }).replace("minecraft:", "")}@${k}`);
}
console.log = out;
console.log(JSON.stringify({ order: order.message, ticks: t, done: !e.getDynamicProperty("crew:job"),
  headBlocksAfter: heads.map((h) => `${h.t.replace("minecraft:", "")} -> ${ow.typeAt(h).replace("minecraft:", "")}`), changedOutside,
  shortcutsTaken: logs.filter((l) => l.includes('"stuck"')).length }, null, 1));
console.log(logs.filter((l) => /job_done|stuck|WARN|failed/.test(l)).join("\n"));

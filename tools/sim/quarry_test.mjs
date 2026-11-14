// Quarry: digs the box, leaves a walkable spiral staircase, picks tools per block,
// leaves obsidian (iron pickaxe can't harvest it), and walks out by the stairs to deposit.
import { world, tick, ItemStack, lootCalls } from "@minecraft/server";
import { startEngine } from "./scripts/runner.js";
import { spawnWorker } from "./scripts/workers.js";
import { dispatch } from "./scripts/orders.js";
import { savePlace } from "./scripts/store.js";
import { quarryGeom, stairBlock } from "./scripts/plans.js";

const logs = []; const out = console.log; console.log = (...a) => logs.push(a.join(" ")); console.warn = (...a) => logs.push("WARN " + a.join(" "));
const ow = world.getDimension("minecraft:overworld");
const keep = process.argv[2] ?? "all";
ow.setBlockType({ x: 0, y: 65, z: -4 }, "minecraft:chest");
// corner (5,64,5) heading south: 12 forward (+z), 10 to the right (west, -x), 10 deep
const g = quarryGeom({ x: 5, y: 64, z: 5 }, "south", 12, 10, 10);
for (let x = g.min.x; x <= g.max.x; x++) for (let z = g.min.z; z <= g.max.z; z++) for (let y = 62; y <= 64; y++) ow.setBlockType({ x, y, z }, y === 64 ? "minecraft:grass_block" : "minecraft:dirt");
ow.setBlockType({ x: 0, y: 60, z: 8 }, "minecraft:iron_ore");
ow.setBlockType({ x: -2, y: 56, z: 9 }, "minecraft:diamond_ore");
ow.setBlockType({ x: -1, y: 58, z: 6 }, "minecraft:lava");
ow.setBlockType({ x: 1, y: 56, z: 12 }, "minecraft:mob_spawner");
ow.setBlockType({ x: -3, y: 57, z: 10 }, "minecraft:obsidian");
const before = new Map(ow.blocks);
startEngine();
const by = { id: "p1", name: "Brian", isOp: false };
// an iron pickaxe with Unbreaking III (lasts 4x), a plain iron pickaxe and a stone shovel
const ub = new ItemStack("minecraft:iron_pickaxe"); ub.enchants.unbreaking = 3;
const { e } = spawnWorker(ow, { x: 0.5, y: 65, z: 0.5 }, { id: "p1", name: "Brian" }, "Digby", [ub, new ItemStack("minecraft:iron_pickaxe"), new ItemStack("minecraft:stone_shovel"), new ItemStack("minecraft:torch", 16)]);
savePlace(by, "blue base", "minecraft:overworld", { x: 0, y: 65, z: -4 }, false);
const order = dispatch(by, { worker: "Digby", job: "quarry", params: { from: g.min, to: g.max, facing: "south", deposit: "blue base", keep, pace: "fast" } });
let t = 0;
while (e.getDynamicProperty("crew:job") && t < 400000) tick(++t);
// checks
const inBox = (x, y, z) => x >= g.min.x && x <= g.max.x && y >= g.min.y && y <= g.max.y && z >= g.min.z && z <= g.max.z;
const stairs = new Set(); for (let k = 0; k <= g.D - 2; k++) { const s = stairBlock(g, k); stairs.add(`${s.x},${s.y},${s.z}`); }
let leftInBox = 0, changedOutside = 0, stairsSolid = 0, stairsHeadroomOk = 0; const leftovers = [], torches = [];
for (let x = g.min.x - 2; x <= g.max.x + 2; x++) for (let y = g.min.y - 2; y <= g.max.y + 3; y++) for (let z = g.min.z - 2; z <= g.max.z + 2; z++) {
  const tt = ow.typeAt({ x, y, z }); const k = `${x},${y},${z}`;
  if (inBox(x, y, z)) {
    if (stairs.has(k)) { if (!/air|lava|torch/.test(tt)) stairsSolid++; continue; }
    if (/torch/.test(tt)) { torches.push(k); continue; }
    if (!/air|lava/.test(tt)) { leftInBox++; leftovers.push(`${tt}@${k}`); }
  } else if (ow.blocks.get(k) !== before.get(k)) changedOutside++;
}
// each stair: the 3 cells above its block are open (a player can walk the spiral; torches don't block)
for (const k of stairs) { const [x, y, z] = k.split(",").map(Number); if ([1, 2, 3].every((d) => y + d > g.max.y || /air|torch/.test(ow.typeAt({ x, y: y + d, z })))) stairsHeadroomOk++; }
// torches stand on top of stair steps
const torchesOnStairs = torches.filter((k) => { const [x, y, z] = k.split(",").map(Number); return stairs.has(`${x},${y - 1},${z}`); }).length;
const chest = ow.getBlock({ x: 0, y: 65, z: -4 }).getComponent("minecraft:inventory").container;
const inChest = chest.items.filter(Boolean).reduce((a, s) => a + s.amount, 0);
const toolUse = {}; for (const [b, tl] of lootCalls) { const key = `${b.replace("minecraft:", "")} <- ${tl.replace("minecraft:", "")}`; toolUse[key] = (toolUse[key] ?? 0) + 1; }
const kit = e.inv.items.slice(0, 5).filter(Boolean).map((s) => `${s.typeId.replace("minecraft:", "")} dmg ${s.damage}`);
console.log = out;
console.log(JSON.stringify({ order: order.message, keep, ticks: t, minutes: +(t / 1200).toFixed(1), boxBlocks: g.total, stairs: stairs.size, stairsSolid, stairsHeadroomOk,
  leftInBox, leftovers, torchesPlaced: torches.length, torchesOnStairs, changedOutside, inChest, chestTypes: [...new Set(chest.items.filter(Boolean).map((s) => s.typeId))], kitAfter: kit,
  toolUse, skipped: JSON.parse(e.getDynamicProperty("crew:skipped") ?? "null"), shortcutsTaken: logs.filter((l) => l.includes('"stuck"')).length }, null, 1));
console.log(logs.filter((l) => /job_started|deposited|found|skipped"|hazard|job_done|stuck|WARN|failed/.test(l)).slice(0, 30).join("\n"));

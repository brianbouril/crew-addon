// Reaching a chest (Brian, Nov 15 on the server):
// 1. A chest against the inside of a house wall: the worker walks in through the door and stands
//    where it can see the chest, not outside the wall a block away from it.
// 2. Invisible light blocks (dynamic-light add-ons place them around mobs) are walked through like
//    air: they never box a worker in or make it take a shortcut.
import { world, tick, ItemStack } from "@minecraft/server";
import { startEngine } from "./scripts/runner.js";
import { spawnWorker } from "./scripts/workers.js";
import { dispatch } from "./scripts/orders.js";

const logs = []; const out = console.log; console.log = (...a) => logs.push(a.join(" ")); console.warn = (...a) => logs.push("WARN " + a.join(" "));
const ow = world.getDimension("minecraft:overworld");
const by = { id: "p1", name: "Brian", isOp: false };
startEngine();
let t = 0;
const loot = () => [new ItemStack("minecraft:iron_pickaxe"), new ItemStack("minecraft:cobblestone", 30)];
const count = (p) => ow.getBlock(p).getComponent("minecraft:inventory").container.items.filter(Boolean).reduce((a, s) => a + s.amount, 0);

// 1. a 7x7 plank house, door in the north wall, chest against the inside of the east wall
for (let x = 1600; x <= 1606; x++) for (let z = 1600; z <= 1606; z++) {
  for (let y = 65; y <= 67; y++) if (x === 1600 || x === 1606 || z === 1600 || z === 1606) ow.setBlockType({ x, y, z }, "minecraft:oak_planks");
  ow.setBlockType({ x, y: 68, z }, "minecraft:oak_planks");
}
for (const y of [65, 66]) ow.setBlockType({ x: 1603, y, z: 1600 }, "minecraft:wooden_door");
const houseChest = { x: 1605, y: 65, z: 1603 };
ow.setBlockType(houseChest, "minecraft:chest");
const { e: a } = spawnWorker(ow, { x: 1609.5, y: 65, z: 1603.5 }, { id: "p1", name: "Brian" }, "Alder", loot());
dispatch(by, { worker: "Alder", job: "drop_off", params: { deposit: [houseChest.x, houseChest.y, houseChest.z] } });
while (a.getDynamicProperty("crew:job") && t < 4000) tick(++t);
const house = { done: !a.getDynamicProperty("crew:job"), stoodInside: a.location.x > 1600 && a.location.x < 1606 && a.location.z > 1600 && a.location.z < 1606,
  at: [a.location.x, a.location.y, a.location.z].map(Math.floor).join(" "), inChest: count(houseChest) };

// 2. light blocks all round the worker and along its way to the chest
const lightChest = { x: 1712, y: 65, z: 1700 };
ow.setBlockType(lightChest, "minecraft:chest");
for (let x = 1699; x <= 1711; x++) for (let z = 1699; z <= 1701; z++) for (const y of [65, 66]) if (!(x === 1700 && z === 1700)) ow.setBlockType({ x, y, z }, `minecraft:light_block_${x % 2 ? 15 : 7}`);
const { e: b } = spawnWorker(ow, { x: 1700.5, y: 65, z: 1700.5 }, { id: "p1", name: "Brian" }, "Bramble", loot());
dispatch(by, { worker: "Bramble", job: "drop_off", params: { deposit: [lightChest.x, lightChest.y, lightChest.z] } });
const t0 = t;
while (b.getDynamicProperty("crew:job") && t < t0 + 4000) tick(++t);
const lights = { done: !b.getDynamicProperty("crew:job"), inChest: count(lightChest), lightsLeft: ow.typeAt({ x: 1705, y: 65, z: 1700 }) };

console.log = out;
console.log(JSON.stringify({ house, lights, shortcutsTaken: logs.filter((l) => l.includes('"stuck"')).length, insideBlocks: logs.filter((l) => l.includes("Crew-Inside")).length }, null, 1));
console.log(logs.filter((l) => /stuck|WARN|failed|deposit_missing/.test(l)).join("\n"));

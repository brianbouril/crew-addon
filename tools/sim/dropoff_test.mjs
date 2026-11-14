// Drop off: with no chest known it asks for one; given a chest it carries everything there
// except the tool kit and torches, then goes idle. Afterwards it remembers that chest.
import { world, tick, ItemStack } from "@minecraft/server";
import { startEngine } from "./scripts/runner.js";
import { spawnWorker } from "./scripts/workers.js";
import { dispatch } from "./scripts/orders.js";

const logs = []; const out = console.log; console.log = (...a) => logs.push(a.join(" ")); console.warn = (...a) => logs.push("WARN " + a.join(" "));
const ow = world.getDimension("minecraft:overworld");
const chestAt = { x: 210, y: 65, z: 200 };
ow.setBlockType(chestAt, "minecraft:chest");
startEngine();
const by = { id: "p1", name: "Brian", isOp: false };
const { e } = spawnWorker(ow, { x: 200.5, y: 65, z: 200.5 }, { id: "p1", name: "Brian" }, "Rusty",
  [new ItemStack("minecraft:iron_pickaxe"), new ItemStack("minecraft:raw_iron", 12), new ItemStack("minecraft:diamond", 3), new ItemStack("minecraft:torch", 20)]);
const noChest = dispatch(by, { worker: "Rusty", job: "drop_off", params: {} });
const order = dispatch(by, { worker: "Rusty", job: "drop_off", params: { deposit: [chestAt.x, chestAt.y, chestAt.z] } });
let t = 0;
while (e.getDynamicProperty("crew:job") && t < 5000) tick(++t);
const chest = ow.getBlock(chestAt).getComponent("minecraft:inventory").container;
const sum = (items) => Object.fromEntries([...new Set(items.filter(Boolean).map((s) => s.typeId))].map((id) => [id.replace("minecraft:", ""), items.filter((s) => s?.typeId === id).reduce((a, s) => a + s.amount, 0)]));
console.log = out;
console.log(JSON.stringify({ noChest: noChest.message, order: order.message, ticks: t, idle: !e.getDynamicProperty("crew:job"),
  inChest: sum(chest.items), stillCarries: sum(e.inv.items), shortcutsTaken: logs.filter((l) => l.includes('"stuck"')).length }, null, 1));
console.log(logs.filter((l) => /job_done|deposited|stuck|WARN|failed/.test(l)).join("\n"));

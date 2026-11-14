// Doors: a worker whose bed is inside a closed house walks in through the door (opening it and
// shutting it behind), with no shortcut. A door inside a quarry box is never broken.
import { world, tick, ItemStack, setTimeOfDay } from "@minecraft/server";
import { startEngine } from "./scripts/runner.js";
import { spawnWorker } from "./scripts/workers.js";
import { dispatch } from "./scripts/orders.js";

const logs = []; const out = console.log; console.log = (...a) => logs.push(a.join(" ")); console.warn = (...a) => logs.push("WARN " + a.join(" "));
const ow = world.getDimension("minecraft:overworld");
// a 7x7 plank house (walls y 65-67, roof 68) with an oak door in the north wall at x 803
for (let x = 800; x <= 806; x++) for (let z = 800; z <= 806; z++) {
  for (let y = 65; y <= 67; y++) if (x === 800 || x === 806 || z === 800 || z === 806) ow.setBlockType({ x, y, z }, "minecraft:oak_planks");
  ow.setBlockType({ x, y: 68, z }, "minecraft:oak_planks");
}
const door = [{ x: 803, y: 65, z: 800 }, { x: 803, y: 66, z: 800 }];
for (const d of door) ow.setBlockType(d, "minecraft:wooden_door");
ow.setBlockType({ x: 803, y: 65, z: 803 }, "minecraft:bed"); ow.setBlockType({ x: 803, y: 65, z: 804 }, "minecraft:bed");
ow.setBlockType({ x: 805, y: 65, z: 803 }, "minecraft:chest");
const isOpen = (p) => !!ow.getBlock(p).permutation.getState("open_bit");

startEngine();
const by = { id: "p1", name: "Brian", isOp: false };
const { e } = spawnWorker(ow, { x: 803.5, y: 65, z: 794.5 }, { id: "p1", name: "Brian" }, "Wren", [new ItemStack("minecraft:iron_pickaxe"), new ItemStack("minecraft:iron_axe")]);
const home = dispatch(by, { worker: "Wren", job: "set_home", params: { bed: [803, 65, 803] } });
const st = () => JSON.parse(e.getDynamicProperty("crew:state") ?? "{}");
const inside = () => e.location.x > 800 && e.location.x < 806 && e.location.z > 800 && e.location.z < 806;
let t = 0, sawOpen = false, openTicks = 0;
setTimeOfDay(13000);
while (st().phase !== "asleep" && t < 3000) { tick(++t); if (isOpen(door[0])) { sawOpen = true; openTicks++; } }
const night = { asleep: st().phase === "asleep", inside: inside(), doorOpenedOnTheWay: sawOpen, ticksDoorOpen: openTicks,
  doorClosedAfter: !isOpen(door[0]) && !isOpen(door[1]), doorStillThere: door.every((d) => ow.typeAt(d) === "minecraft:wooden_door"), ticks: t };

// a door inside a quarry box is left standing (and so are trapdoors and gates)
const keepers = [{ p: { x: 902, y: 63, z: 902 }, id: "minecraft:spruce_door" }, { p: { x: 902, y: 64, z: 902 }, id: "minecraft:spruce_door" },
  { p: { x: 904, y: 64, z: 903 }, id: "minecraft:oak_trapdoor" }, { p: { x: 901, y: 63, z: 904 }, id: "minecraft:oak_fence_gate" }];
for (const k of keepers) ow.setBlockType(k.p, k.id);
ow.setBlockType({ x: 899, y: 65, z: 899 }, "minecraft:chest");
setTimeOfDay(1000);
const { e: e2 } = spawnWorker(ow, { x: 899.5, y: 65, z: 897.5 }, { id: "p1", name: "Brian" }, "Pike", [new ItemStack("minecraft:iron_pickaxe"), new ItemStack("minecraft:iron_axe")]);
dispatch(by, { worker: "Pike", job: "quarry", params: { from: [900, 62, 900], to: [905, 64, 905], facing: "south", deposit: [899, 65, 899], keep: "all" } });
let t2 = 0;
while (e2.getDynamicProperty("crew:job") && t2 < 40000) { tick(++t); t2++; }
const quarry = { finished: !e2.getDynamicProperty("crew:job"), keptIntact: keepers.filter((k) => ow.typeAt(k.p) === k.id).length + "/" + keepers.length };

console.log = out;
console.log(JSON.stringify({ setHome: home.message, night, quarry, shortcutsTaken: logs.filter((l) => l.includes('"stuck"')).length }, null, 1));
console.log(logs.filter((l) => /stuck|WARN|failed/.test(l)).join("\n"));

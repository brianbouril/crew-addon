// Out of pickaxes: the worker unloads at its drop-off chest and waits there (beside it, never on
// top of it). A pickaxe put in its home chest gets fetched; one put in the drop-off chest it's
// waiting at gets taken. Either way it goes back and finishes the dig.
import { world, tick, ItemStack } from "@minecraft/server";
import { startEngine } from "./scripts/runner.js";
import { spawnWorker } from "./scripts/workers.js";
import { dispatch } from "./scripts/orders.js";

const logs = []; const out = console.log; console.log = (...a) => logs.push(a.join(" ")); console.warn = (...a) => logs.push("WARN " + a.join(" "));
const ow = world.getDimension("minecraft:overworld");
const by = { id: "p1", name: "Brian", isOp: false };
startEngine();
let t = 0;

/** @param {string} name @param {number} x0 @param {"home"|"dropoff"} where */
function run(name, x0, where) {
  const dropoff = { x: x0, y: 65, z: 1200 };
  const homeChest = { x: x0 + 12, y: 65, z: 1210 };
  ow.setBlockType(dropoff, "minecraft:chest");
  ow.setBlockType(homeChest, "minecraft:barrel");
  ow.setBlockType({ x: x0 + 10, y: 65, z: 1210 }, "minecraft:bed"); ow.setBlockType({ x: x0 + 10, y: 65, z: 1211 }, "minecraft:bed");
  for (let x = x0 + 8; x <= x0 + 14; x++) for (let z = 1208; z <= 1213; z++) ow.setBlockType({ x, y: 69, z }, "minecraft:stone");
  const worn = new ItemStack("minecraft:wooden_pickaxe"); worn.damage = 52; // a few blocks left in it
  const { e } = spawnWorker(ow, { x: x0 + 3.5, y: 65, z: 1197.5 }, { id: "p1", name: "Brian" }, name, [worn]);
  dispatch(by, { worker: name, job: "set_home", params: { bed: [x0 + 10, 65, 1210], chest: [homeChest.x, homeChest.y, homeChest.z] } });
  dispatch(by, { worker: name, job: "quarry", params: { from: [x0 + 2, 63, 1202], to: [x0 + 5, 64, 1205], facing: "south", deposit: [dropoff.x, dropoff.y, dropoff.z], keep: "all" } });
  const st = () => JSON.parse(e.getDynamicProperty("crew:state") ?? "{}");
  const onTop = (p) => [dropoff, homeChest].some((c) => Math.floor(p.x) === c.x && Math.floor(p.z) === c.z && Math.floor(p.y) > c.y);
  let stoodOnChest = 0, waitedAt = null, gaveAt = null, backAt = null, fetched = false;
  const end = t + 30000;
  while (e.getDynamicProperty("crew:job") && t < end) {
    tick(++t);
    if (onTop(e.location)) stoodOnChest++;
    if (st().phase === "wait_tool" && waitedAt === null) waitedAt = t;
    if (st().phase === "fetch_tool") fetched = true;
    if (gaveAt !== null && backAt === null && ["return", "working"].includes(st().phase)) backAt = t;
    if (waitedAt !== null && gaveAt === null && t >= waitedAt + 200) {
      // the player drops a new pickaxe in a chest
      const target = where === "home" ? homeChest : dropoff;
      ow.getBlock(target).getComponent("minecraft:inventory").container.addItem(new ItemStack("minecraft:iron_pickaxe"));
      gaveAt = t;
    }
  }
  const pickInKit = e.inv.items.slice(0, 5).some((s) => s?.typeId === "minecraft:iron_pickaxe");
  return { putIn: where === "home" ? "home chest" : "drop-off chest", waitedForTool: waitedAt !== null, walkedHomeForIt: fetched, secondsToGetBackToWork: backAt === null ? null : +((backAt - gaveAt) / 20).toFixed(1),
    tookIt: pickInKit, finished: !e.getDynamicProperty("crew:job"), stoodOnChest };
}

const fromHome = run("Ash", 1200, "home");
const fromDropoff = run("Birch", 1300, "dropoff");
console.log = out;
console.log(JSON.stringify({ fromHome, fromDropoff, shortcutsTaken: logs.filter((l) => l.includes('"stuck"')).length }, null, 1));
console.log(logs.filter((l) => /tool_needed|tool_ok|stuck|WARN|failed/.test(l)).join("\n"));

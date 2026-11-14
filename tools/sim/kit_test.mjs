// Tool kit: wooden pickaxe is used first (lowest tier that works), breaks after 59 blocks, the
// stone pickaxe takes over; iron ore always gets the stone pickaxe; dirt gets the shovel.
// When no pickaxe is left the worker drops off and waits; adding one gets it going again.
import { world, tick, ItemStack } from "@minecraft/server";
import { startEngine } from "./scripts/runner.js";
import { spawnWorker } from "./scripts/workers.js";
import { dispatch } from "./scripts/orders.js";
import { statusText } from "./scripts/runner.js";
import { Container } from "@minecraft/server";
import { giveHeldTool } from "./scripts/ui.js";
import { chooseTool, kit, setToolPref, toolPref } from "./scripts/tools.js";

const logs = []; const out = console.log; console.log = (...a) => logs.push(a.join(" ")); console.warn = (...a) => logs.push("WARN " + a.join(" "));
const ow = world.getDimension("minecraft:overworld");
ow.setBlockType({ x: 100, y: 65, z: 96 }, "minecraft:chest");
for (let x = 100; x < 110; x++) for (let z = 100; z < 110; z++) ow.setBlockType({ x, y: 64, z }, "minecraft:dirt");
ow.setBlockType({ x: 104, y: 62, z: 104 }, "minecraft:iron_ore");
startEngine();
const by = { id: "p1", name: "Brian", isOp: false };
const { e } = spawnWorker(ow, { x: 100.5, y: 65, z: 95.5 }, { id: "p1", name: "Brian" }, "Moss",
  [new ItemStack("minecraft:stone_pickaxe"), new ItemStack("minecraft:wooden_pickaxe"), new ItemStack("minecraft:wooden_shovel")]);
// "use the fastest tool": with stone and diamond pickaxes, stone is dug with diamond only then
const { e: w } = spawnWorker(ow, { x: 150.5, y: 65, z: 150.5 }, { id: "p1", name: "Brian" }, "Quartz", [new ItemStack("minecraft:stone_pickaxe"), new ItemStack("minecraft:diamond_pickaxe")]);
const pick = (block) => chooseTool(kit(w.inv), block, toolPref(w)).tool?.info.label;
const toolSetting = { saveMyBest: { stone: pick("minecraft:stone"), obsidian: pick("minecraft:obsidian") } };
setToolPref(w, "fastest");
toolSetting.fastest = { stone: pick("minecraft:stone"), obsidian: pick("minecraft:obsidian") };
const order = dispatch(by, { worker: "Moss", job: "quarry", params: { from: [100, 64, 100], to: [109, 61, 109], deposit: [100, 65, 96], keep: "all" } });
let t = 0, waitedAt = null, statusWhileWaiting = "", gave = null;
while (e.getDynamicProperty("crew:job") && t < 200000) {
  tick(++t);
  const st = JSON.parse(e.getDynamicProperty("crew:state") ?? "{}");
  if (st.phase === "wait_tool" && waitedAt === null) {
    waitedAt = t; statusWhileWaiting = statusText(e);
    for (let k = 0; k < 200; k++) tick(++t); // nobody brings a tool for 10 s
    // a stranger taps the worker holding a pickaxe (refused), then Brian does (accepted): the plain-tap hand-off
    const fakePlayer = (id, name) => { const inv = new Container(36); inv.setItem(0, new ItemStack("minecraft:iron_pickaxe"));
      return { id, name, isValid: true, commandPermissionLevel: 0, selectedSlotIndex: 0, msgs: [], sendMessage(m) { this.msgs.push(m); }, getComponent: () => ({ container: inv }), inv }; };
    const stranger = fakePlayer("p9", "Sam"), brian = fakePlayer("p1", "Brian");
    gave = { stranger: giveHeldTool(stranger, e), strangerStillHolds: !!stranger.inv.getItem(0), brian: giveHeldTool(brian, e), brianHandEmpty: !brian.inv.getItem(0), said: brian.msgs[0] };
  }
}
let left = 0; for (let x = 100; x < 110; x++) for (let y = 61; y <= 64; y++) for (let z = 100; z < 110; z++) if (!/air/.test(ow.typeAt({ x, y, z }))) left++;
console.log = out;
console.log(JSON.stringify({ order: order.message, ticks: t, waitedForToolAtTick: waitedAt, statusWhileWaiting, gave, leftInBox: left, toolSetting,
  kitAfter: e.inv.items.slice(0, 5).filter(Boolean).map((s) => `${s.typeId.replace("minecraft:", "")} dmg ${s.damage}`) }, null, 1));
console.log(logs.filter((l) => /tool_|job_done|stuck|WARN|failed/.test(l)).join("\n"));

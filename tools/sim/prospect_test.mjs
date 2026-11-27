// Miner prospecting: home column, staked start, any valuables, quota, entrance, no x-ray.
import { world, tick, ItemStack, setTimeOfDay } from "@minecraft/server";
import { startEngine, startJob, stopJob } from "./scripts/runner.js";
import { spawnWorker, roleOf } from "./scripts/workers.js";
import { dispatch } from "./scripts/orders.js";
import { catalogText, toolSchemas } from "./scripts/catalog.js";
import { setHome } from "./scripts/life.js";
import { prospectGeom, stepAt } from "./scripts/plans.js";
import { craftPickaxe, mineTitle } from "./scripts/prospect.js";

const logs = [];
const out = console.log;
console.log = (...a) => logs.push(a.join(" "));
console.warn = (...a) => logs.push("WARN " + a.join(" "));
const ow = world.getDimension("minecraft:overworld");
const nether = world.getDimension("minecraft:nether");
const by = { id: "p1", name: "Brian", isOp: false };
const owner = { id: "p1", name: "Brian" };
startEngine();
let t = 0;
const run = (n) => { for (const end = t + n; t < end;) tick(++t); };
const until = (pred, cap) => { const start = t; while (t - start < cap && !pred()) tick(++t); };
/** @type {string[]} */
const fails = [];
let checks = 0;
const check = (name, ok) => { checks++; if (!ok) fails.push(name); };

const jobOf = (e) => { const s = e.getDynamicProperty("crew:job"); return s ? JSON.parse(String(s)) : undefined; };
const mineOf = (e) => { const s = e.getDynamicProperty("crew:mine"); return s ? JSON.parse(String(s)) : undefined; };
const paused = (e) => { const s = e.getDynamicProperty("crew:paused"); return s ? JSON.parse(String(s)) : undefined; };
const said = (bit) => logs.some((l) => l.includes(bit));
const count = (inv, id) => { let n = 0; for (let i = 0; i < inv.size; i++) { const it = inv.getItem(i); if (it?.typeId === id) n += it.amount; } return n; };
const put = (pos, items) => {
  ow.setBlockType(pos, "minecraft:chest");
  const c = ow.getBlock(pos).getComponent("minecraft:inventory").container;
  items.forEach((it, i) => c.setItem(i, it));
  return c;
};
const pick = () => new ItemStack("minecraft:iron_pickaxe");

// --- pure geometry: home column, spacing, torches, no buried ore in the plan ---
{
  const anchor = { x: 9, y: 64, z: 0 };
  const geom = prospectGeom(anchor, "west", 16);
  const guard = { r: 8, spots: [{ x: 0, y: 64, z: 0 }, { x: 1, y: 64, z: 0 }] };
  const job = { type: "prospect", geom, guard, safe: [] };
  let mined = 0, inHome = 0, torches = 0;
  const buried = { x: 9, y: 60, z: 5 };
  let buriedInPlan = false;
  for (let i = 0; i < geom.total; i++) {
    const s = stepAt(job, i);
    if (i < geom.nStairs && s.torch) torches++;
    for (const c of s.mine ?? []) {
      mined++;
      if (Math.max(Math.abs(c.x - 0), Math.abs(c.z - 0)) <= 8) inHome++;
      if (c.x === buried.x && c.y === buried.y && c.z === buried.z) buriedInPlan = true;
    }
  }
  const at = geom.branch.branchAt;
  let gaps = at.length > 1;
  for (let i = 1; i < at.length; i++) if (at[i] - at[i - 1] - 1 !== 2) gaps = false;
  check("floor is diamond depth", geom.ty === -59);
  check("trunk is 2 wide and spacing is 2", geom.branch.w === 2 && geom.branch.s === 2 && gaps);
  check("home column is not in the dig list", mined > 0 && inHome === 0);
  check("a buried ore off the tunnel is not a planned cell", !buriedInPlan);
  check("stair steps include torches", torches >= 1);
  check("automatic diamond name", mineTitle("Digby", 1, "diamond") === "Digby's Diamond Mine No. 1");
  check("automatic name without a quota", mineTitle("Digby", 2) === "Digby's Mine No. 2");
  check("typed name is kept", mineTitle("Digby", 3, "diamond", "North Cut") === "North Cut");
}

// --- orders the roles refuse, and the overworld rule ---
{
  const { e: dig } = spawnWorker(ow, { x: 400.5, y: 66, z: 400.5 }, owner, "Shoveler", [new ItemStack("minecraft:iron_shovel")]);
  const { e: min } = spawnWorker(ow, { x: 420.5, y: 66, z: 400.5 }, owner, "Picky", [pick()]);
  const refused = dispatch(by, { worker: "Shoveler", job: "prospect", params: { where: "home" } });
  check("digger refuses prospect", !refused.ok && refused.message.includes("Miner's job"));
  check("miner still refuses a player branch mine", !dispatch(by, { worker: "Picky", job: "branch_mine", params: { start: [420, 64, 400], facing: "east", deposit: [420, 65, 390] } }).ok);
  check("prospect is offered and branch_mine is not", catalogText().includes("prospect") && !catalogText().includes("branch_mine") && toolSchemas().some((s) => s.name === "prospect") && !toolSchemas().some((s) => s.name === "branch_mine"));
  check("no home and no stake is refused", !dispatch(by, { worker: "Picky", job: "prospect", params: { where: "home" } }).ok);
  check("ancient debris is refused", !dispatch(by, { worker: "Picky", job: "prospect", params: { where: "stake", start: [420, 64, 400], quota_ore: "ancient_debris", quota: 1 } }).ok);
  check("quota needs an ore", !dispatch(by, { worker: "Picky", job: "prospect", params: { where: "stake", start: [420, 64, 400], quota: 3 } }).ok);
  const { e: neth } = spawnWorker(nether, { x: 20.5, y: 66, z: 20.5 }, owner, "NetherNed", [pick()]);
  const nethOrder = dispatch(by, { worker: "NetherNed", job: "prospect", params: { where: "stake", start: [20, 64, 20] } });
  check("nether is refused", !nethOrder.ok && /overworld/i.test(nethOrder.message));
  check("come still works", dispatch(by, { worker: "Picky", job: "come", params: {} }).ok);
  stopJob(min, undefined);
  stopJob(dig, undefined);
  stopJob(neth, undefined);
  check("roles unchanged", roleOf(dig) === "Digger" && roleOf(min) === "Miner");
}

// --- paid entrance, then a missing-wood fallback ---
{
  const head = { x: 600, y: 64, z: 600 };
  const chest = { x: 600, y: 65, z: 602 };
  put(chest, [new ItemStack("minecraft:oak_log", 2), new ItemStack("minecraft:chest", 1), new ItemStack("minecraft:lantern", 1)]);
  const { e } = spawnWorker(ow, { x: 610.5, y: 66, z: 600.5 }, owner, "Digby", [pick(), new ItemStack("minecraft:torch", 32)]);
  check("old save has no mine record", mineOf(e) === undefined);
  setHome(e, { dim: ow.id, head, foot: { x: 601, y: 64, z: 600 }, chest });
  const order = dispatch(by, { worker: "Digby", job: "prospect", params: { where: "home", facing: "east", quota_ore: "diamond", quota: 5, name: "" } });
  check("home prospect starts", order.ok && order.message.includes("Digby's Diamond Mine No. 1"));
  const before = jobOf(e);
  check("claim reaches Y -59 and keeps everything", before?.geom?.ty === -59 && before.keep === "all" && before.geom.range === 64);
  until(() => mineOf(e), 400);
  const mine = mineOf(e);
  check("entrance record is a sifter chest", mine?.handoff === "sifter-chest" && mine.decorative === true && mine.chest?.dim === "minecraft:overworld");
  const sign = ow.getBlock({ x: mine.chest.x, y: mine.chest.y, z: mine.chest.z });
  check("ore chest was placed", ow.getBlock(mine.chest)?.typeId === "minecraft:chest");
  check("sign carries the name", said("Digby's Diamond Mine No. 1") && ow.signs && [...ow.signs.values()].some((txt) => String(txt).includes("Digby's Diamond Mine No. 1")));
  check("wood and the chest item were paid", count(ow.getBlock(chest).getComponent("minecraft:inventory").container, "minecraft:oak_log") === 0);
  check("home chest block is still there", ow.typeAt(chest) === "minecraft:chest");
  check("bed column was not replaced", ow.typeAt(head) === "minecraft:stone");
  stopJob(e, undefined);
  void sign;
}

{
  const start = { x: 800, y: 64, z: 800 };
  const playerChest = { x: 802, y: 65, z: 800 };
  ow.setBlockType(playerChest, "minecraft:chest");
  const { e } = spawnWorker(ow, { x: 800.5, y: 66, z: 803.5 }, owner, "Plain", [pick()]);
  const order = dispatch(by, { worker: "Plain", job: "prospect", params: { where: "stake", start: [start.x, start.y, start.z], facing: "east", range: 8 } });
  check("missing wood still starts on a placed chest", order.ok);
  until(() => mineOf(e)?.decorative === false, 400);
  const mine = mineOf(e);
  check("decorative build was skipped", mine?.decorative === false && said("skipped the posts") && ow.typeAt(playerChest) === "minecraft:chest");
  check("no log posts were placed", ow.typeAt({ x: start.x, y: 66, z: start.z + 2 }) !== "minecraft:oak_log");
  stopJob(e, undefined);
}

{
  const order = dispatch(by, { worker: "Plain", job: "prospect", params: { where: "stake", start: [900, 64, 900], facing: "east" } });
  check("no chest at all is refused", !order.ok && /chest/i.test(order.message));
}

// stake inside the home
{
  const head = { x: 1000, y: 64, z: 1000 };
  const chest = { x: 1000, y: 65, z: 1002 };
  put(chest, [new ItemStack("minecraft:oak_log", 2), new ItemStack("minecraft:chest", 1)]);
  const { e } = spawnWorker(ow, { x: 1000.5, y: 66, z: 1004.5 }, owner, "Homer", [pick()]);
  setHome(e, { dim: ow.id, head, foot: { x: 1001, y: 64, z: 1000 }, chest });
  const order = dispatch(by, { worker: "Homer", job: "prospect", params: { where: "stake", start: [1002, 64, 1000], facing: "east" } });
  check("a start inside the home is refused", !order.ok && /home/i.test(order.message));
  stopJob(e, undefined);
}

// --- quota, and a buried diamond that is not x-rayed ---
{
  const start = { x: 1200, y: 64, z: 1200 };
  const supply = { x: 1200, y: 65, z: 1194 };
  put(supply, [new ItemStack("minecraft:oak_log", 2), new ItemStack("minecraft:chest", 1)]);
  ow.setBlockType(start, "minecraft:diamond_ore");
  const buried = { x: 1205, y: 60, z: 1200 };
  ow.setBlockType(buried, "minecraft:diamond_ore");
  const { e } = spawnWorker(ow, { x: 1200.5, y: 66, z: 1196.5 }, owner, "Quota", [pick()]);
  const order = dispatch(by, { worker: "Quota", job: "prospect", params: { where: "stake", start: [start.x, start.y, start.z], facing: "south", range: 8, quota_ore: "diamond", quota: 1, deposit: [supply.x, supply.y, supply.z] } });
  check("quota order accepted", order.ok);
  until(() => !e.getDynamicProperty("crew:job"), 20000);
  const mine = mineOf(e);
  const chest = mine ? ow.getBlock(mine.chest).getComponent("minecraft:inventory").container : undefined;
  const diamonds = (chest ? count(chest, "minecraft:diamond") : 0) + count(e.inv, "minecraft:diamond");
  check("quota stops after one diamond", diamonds === 1 && said('"stop":"quota"'));
  check("buried diamond was not x-rayed", ow.typeAt(buried) === "minecraft:diamond_ore");
}

// --- lava sealed, water left ---
{
  const start = { x: 1400, y: 64, z: 1400 };
  const supply = { x: 1400, y: 65, z: 1394 };
  put(supply, [new ItemStack("minecraft:oak_log", 2), new ItemStack("minecraft:chest", 1)]);
  ow.setBlockType(start, "minecraft:lava");
  const { e } = spawnWorker(ow, { x: 1400.5, y: 66, z: 1396.5 }, owner, "Lavvy", [pick(), new ItemStack("minecraft:cobblestone", 8)]);
  dispatch(by, { worker: "Lavvy", job: "prospect", params: { where: "stake", start: [start.x, start.y, start.z], facing: "south", range: 6, deposit: [supply.x, supply.y, supply.z] } });
  until(() => ow.typeAt(start) === "minecraft:cobblestone", 12000);
  check("lava is sealed with cobblestone", ow.typeAt(start) === "minecraft:cobblestone");
  stopJob(e, undefined);
}
{
  const start = { x: 1600, y: 64, z: 1600 };
  const supply = { x: 1600, y: 65, z: 1594 };
  put(supply, [new ItemStack("minecraft:oak_log", 2), new ItemStack("minecraft:chest", 1)]);
  ow.setBlockType(start, "minecraft:water");
  const { e } = spawnWorker(ow, { x: 1600.5, y: 66, z: 1596.5 }, owner, "Wader", [pick()]);
  dispatch(by, { worker: "Wader", job: "prospect", params: { where: "stake", start: [start.x, start.y, start.z], facing: "south", range: 6, deposit: [supply.x, supply.y, supply.z] } });
  run(2500);
  check("water is left in place", ow.typeAt(start) === "minecraft:water");
  stopJob(e, undefined);
}

// --- crafting: not better than the lost tool; then a real break ---
{
  const chestPos = { x: 1800, y: 65, z: 1800 };
  const home = { dim: ow.id, head: { x: 1800, y: 64, z: 1802 }, foot: { x: 1801, y: 64, z: 1802 }, chest: chestPos };
  put(chestPos, [new ItemStack("minecraft:diamond", 3), new ItemStack("minecraft:cobblestone", 3), new ItemStack("minecraft:stick", 2)]);
  ow.setBlockType({ x: 1800, y: 65, z: 1803 }, "minecraft:crafting_table");
  const { e } = spawnWorker(ow, { x: 1800.5, y: 66, z: 1802.5 }, owner, "Smithy", [pick()]);
  setHome(e, home);
  const made = craftPickaxe(ow, home, e.inv, 1);
  check("stone materials do not make a diamond pick", made.ok && made.tool === "minecraft:stone_pickaxe" && !/diamond pick/i.test(made.message));
  const again = craftPickaxe(ow, home, e.inv, 1);
  check("no second pick is invented without materials", !again.ok);
  put(chestPos, [new ItemStack("minecraft:diamond", 3), new ItemStack("minecraft:stick", 2)]);
  const top = craftPickaxe(ow, home, e.inv, 4);
  check("netherite loss crafts diamond and says so", top.ok && top.tool === "minecraft:diamond_pickaxe" && /netherite/i.test(top.message));
}

{
  const head = { x: 2000, y: 64, z: 2000 };
  const chest = { x: 2000, y: 65, z: 2002 };
  put(chest, [new ItemStack("minecraft:oak_log", 2), new ItemStack("minecraft:chest", 1), new ItemStack("minecraft:oak_planks", 8)]);
  ow.setBlockType({ x: 2000, y: 65, z: 2004 }, "minecraft:crafting_table");
  const worn = new ItemStack("minecraft:wooden_pickaxe");
  worn.damage = 58;
  const { e } = spawnWorker(ow, { x: 2010.5, y: 66, z: 2000.5 }, owner, "Woody", [worn]);
  setHome(e, { dim: ow.id, head, foot: { x: 2001, y: 64, z: 2000 }, chest });
  dispatch(by, { worker: "Woody", job: "prospect", params: { where: "home", facing: "east", range: 6 } });
  until(() => said('"type":"crafted"') && said("minecraft:wooden_pickaxe"), 20000);
  const picks = [];
  for (let i = 0; i < 5; i++) { const it = e.inv.getItem(i); if (it?.typeId?.endsWith("pickaxe")) picks.push(it.typeId); }
  check("a broken wooden pick is replaced and not upgraded", said("minecraft:wooden_pickaxe") && picks.includes("minecraft:wooden_pickaxe") && !picks.includes("minecraft:iron_pickaxe") && !picks.includes("minecraft:diamond_pickaxe"));
  stopJob(e, undefined);
}

// --- mined out, gravel kept for the Sifter ---
{
  const anchor = { x: 2200, y: 64, z: 2200 };
  const supply = { x: 2200, y: 65, z: 2194 };
  put(supply, [new ItemStack("minecraft:oak_log", 2), new ItemStack("minecraft:chest", 1)]);
  ow.setBlockType(anchor, "minecraft:gravel");
  const { e } = spawnWorker(ow, { x: 2200.5, y: 66, z: 2196.5 }, owner, "Gravelly", [pick()]);
  const geom = prospectGeom(anchor, "south", 3, 64);
  const job = {
    type: "prospect", id: "g1", by: by, geom, keep: "all", where: "stake", supplies: [supply],
    mineName: "Gravelly's Mine No. 1", mineNumber: 1, who: "Gravelly", pickCap: 2,
    deposit: { ...supply, dim: ow.id, label: "supply" },
  };
  startJob(e, job);
  until(() => !e.getDynamicProperty("crew:job"), 40000);
  const mine = mineOf(e);
  const chest = mine ? ow.getBlock(mine.chest)?.getComponent("minecraft:inventory")?.container : undefined;
  const gravel = (chest ? count(chest, "minecraft:gravel") : 0) + count(e.inv, "minecraft:gravel");
  check("mined out is reported", said('"stop":"mined_out"'));
  check("gravel is in the entrance chest for the Sifter", gravel >= 1 && mine?.handoff === "sifter-chest");
}

// --- night pause, morning resume ---
{
  setTimeOfDay(1000);
  const head = { x: 2400, y: 64, z: 2400 };
  const chest = { x: 2400, y: 65, z: 2402 };
  put(chest, [new ItemStack("minecraft:oak_log", 2), new ItemStack("minecraft:chest", 1)]);
  ow.setBlockType({ x: 2400, y: 68, z: 2400 }, "minecraft:stone");
  ow.setBlockType({ x: 2401, y: 68, z: 2400 }, "minecraft:stone");
  const { e } = spawnWorker(ow, { x: 2410.5, y: 66, z: 2400.5 }, owner, "Sleeper", [pick()]);
  setHome(e, { dim: ow.id, head, foot: { x: 2401, y: 64, z: 2400 }, chest });
  dispatch(by, { worker: "Sleeper", job: "prospect", params: { where: "home", facing: "east", range: 6 } });
  until(() => mineOf(e), 400);
  setTimeOfDay(13000);
  until(() => jobOf(e)?.type === "rest" || paused(e)?.job?.type === "prospect", 2000);
  check("night pauses the mine", jobOf(e)?.type === "rest" && paused(e)?.job?.type === "prospect");
  setTimeOfDay(23000);
  run(30);
  setTimeOfDay(1000);
  until(() => jobOf(e)?.type === "prospect", 8000);
  check("morning picks the mine back up", jobOf(e)?.type === "prospect");
  stopJob(e, undefined);
  setTimeOfDay(1000);
}

console.log = out;
console.log(JSON.stringify({ checks, failed: fails.length, fails }, null, 1));
if (fails.length) {
  console.log(fails.join("\n"));
  console.log(logs.filter((l) => /entrance|craft|Quota|mined out|WARN|job_done|tool_needed|stopped/.test(l)).slice(0, 40).join("\n"));
  process.exit(1);
}
console.log(`prospect checks ${checks}, failed 0`);

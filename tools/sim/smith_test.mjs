// Smith: anvil build, forge smelting, crafting, repair, stock, and tool pickup.
// Exit non-zero on a wrong result.
import { world, tick, ItemStack, setTimeOfDay } from "@minecraft/server";
import { CAP_DEFAULT, addStorage, foundSettlement, ledger, recordBell, saveDepotUnits, setDepot, settlementOf } from "./scripts/settlement.js";
import { FORGE, SMELT, fuelOf, outputPos, fuelPos } from "./scripts/smith.js";
import { buildFromBarrel, roleOf, spawnWorker } from "./scripts/workers.js";
import { dispatch } from "./scripts/orders.js";
import { getRegistry } from "./scripts/store.js";
import { startEngine, stopJob } from "./scripts/runner.js";
import { setHome } from "./scripts/life.js";

const fails = [];
let checks = 0;
/** @param {string} name @param {boolean} ok @param {any} [detail] */
function check(name, ok, detail) {
  checks++;
  if (!ok) fails.push(detail === undefined ? name : `${name}: ${typeof detail === "string" ? detail : JSON.stringify(detail)}`);
}

const logs = [];
const out = console.log;
console.log = (...a) => logs.push(a.join(" "));
console.warn = (...a) => logs.push("WARN " + a.join(" "));
const said = (bit) => logs.some((l) => l.includes(bit));

const ow = world.getDimension("minecraft:overworld");
const by = { id: "smith-p", name: "Brian", isOp: true };
const owner = { id: "smith-p", name: "Brian" };
startEngine();
let t = 0;
const run = (n) => { for (const end = t + n; t < end;) tick(++t); };
const until = (pred, cap) => { const start = t; while (t - start < cap && !pred()) tick(++t); return pred(); };

function makePlayer() {
  const inv = { size: 36 };
  return {
    id: "smith-p", name: "Brian", isValid: true, selectedSlotIndex: 0,
    sendMessage() {},
    getComponent: () => undefined,
  };
}
const player = makePlayer();

/** @param {import("@minecraft/server").Container | undefined} c */
function tally(c) {
  /** @type {Record<string, number>} */
  const m = {};
  if (!c) return m;
  for (let i = 0; i < c.size; i++) {
    const it = c.getItem(i);
    if (it) m[it.typeId] = (m[it.typeId] ?? 0) + it.amount;
  }
  return m;
}
/** @param {Record<string, number>} a @param {Record<string, number>} b */
function addMaps(a, b) {
  /** @type {Record<string, number>} */
  const m = { ...a };
  for (const [k, n] of Object.entries(b)) m[k] = (m[k] ?? 0) + n;
  return m;
}

check("coal smelts 8", fuelOf("minecraft:coal") === 8 && fuelOf("minecraft:charcoal") === 8);
check("lava smelts 100", fuelOf("minecraft:lava_bucket") === 100);
check("a log or plank smelts 1", fuelOf("minecraft:oak_log") === 1 && fuelOf("minecraft:oak_planks") === 1 && fuelOf("minecraft:stripped_oak_log") === 1);
check("sticks are not fuel", fuelOf("minecraft:stick") === 0);
check("food is not a smelt", !SMELT["minecraft:beef"] && !SMELT["minecraft:sand"]);
check("raw iron smelts to an ingot", SMELT["minecraft:raw_iron"] === "minecraft:iron_ingot");
check("cap default is 8", CAP_DEFAULT === 8);

world.setDynamicProperty("crew:cap", 1);
function build(at, stacks) {
  ow.setBlockType(at, "minecraft:barrel");
  const barrel = ow.getBlock(at).getComponent("minecraft:inventory").container;
  stacks.forEach((it, i) => barrel.setItem(i, it));
  const headAt = { x: at.x, y: at.y + 1, z: at.z };
  ow.setBlockType(headAt, "minecraft:carved_pumpkin");
  buildFromBarrel(player, ow.getBlock(headAt));
  return ow.getBlock(at);
}
const owned = () => Object.values(getRegistry()).filter((r) => r.ownerId === "smith-p").length;
const before = owned();
const barrel1 = build({ x: 10, y: 80, z: 10 }, [new ItemStack("minecraft:anvil", 1)]);
const smith = ow.getEntities({ type: "crew:worker" }).find((e) => roleOf(e) === "Smith");
check("anvil barrel builds a Smith", !!smith && roleOf(smith) === "Smith" && smith.getProperty("crew:role") === 6, roleOf(smith));
check("anvil is used up", smith && !Array.from({ length: 36 }, (_, i) => smith.getComponent("minecraft:inventory").container.getItem(i)).some((it) => it?.typeId === "minecraft:anvil"));
check("build spends a cap slot", owned() === before + 1);
check("barrel is gone", barrel1.typeId === "minecraft:air");
const barrel2 = build({ x: 12, y: 80, z: 10 }, [new ItemStack("minecraft:anvil", 1)]);
check("at the cap the barrel is kept", barrel2.typeId === "minecraft:barrel");
world.setDynamicProperty("crew:cap", 8);
const mixed = build({ x: 14, y: 80, z: 10 }, [new ItemStack("minecraft:iron_shovel", 1), new ItemStack("minecraft:anvil", 1)]);
const mixedWorker = ow.getEntities({ type: "crew:worker" }).filter((e) => e.isValid).sort((a, b) => Number(b.id) - Number(a.id))[0];
check("anvil plus a shovel is a Smith", roleOf(mixedWorker) === "Smith");
check("the shovel stays", tally(mixedWorker.getComponent("minecraft:inventory").container)["minecraft:iron_shovel"] === 1);
const digger = spawnWorker(ow, { x: 16.5, y: 80, z: 10.5 }, owner, "DiggerDan", [new ItemStack("minecraft:stone_shovel")]);
check("shovel alone is a Digger", roleOf(digger.e) === "Digger" && digger.e.getProperty("crew:role") === 1);
const no = dispatch(by, { worker: smith.getDynamicProperty("crew:name"), job: "quarry", params: { from: [0, 64, 0], to: [2, 64, 2], deposit: [0, 65, 0] } });
check("a Smith refuses a quarry", !no.ok && /Digger/.test(no.message), no.message);
const no2 = dispatch(by, { worker: "DiggerDan", job: "smith", params: { at: [1, 65, 1] } });
check("a Digger refuses the forge", !no2.ok && /Smith/.test(no2.message), no2.message);
const come = dispatch(by, { worker: smith.getDynamicProperty("crew:name"), job: "come", params: {} });
check("come still works", come.ok, come.message);
stopJob(smith, undefined);

/** @param {number} x @param {number} z @param {ItemStack[]} fuel @param {ItemStack[]} outItems */
function station(x, z, fuel, outItems = []) {
  const at = { x, y: 65, z };
  ow.setBlockType(at, FORGE);
  ow.setBlockType(fuelPos(at), "minecraft:chest");
  ow.setBlockType(outputPos(at), "minecraft:chest");
  const top = ow.getBlock(fuelPos(at)).getComponent("minecraft:inventory").container;
  const under = ow.getBlock(outputPos(at)).getComponent("minecraft:inventory").container;
  fuel.forEach((it, i) => top.setItem(i, it));
  outItems.forEach((it, i) => under.setItem(i, it));
  return { at, top, under };
}

// ---- smelt: one coal, eight ore, counts ----
{
  const { at, top, under } = station(40, 40, [new ItemStack("minecraft:coal", 1), new ItemStack("minecraft:raw_iron", 8)]);
  const { e } = spawnWorker(ow, { x: 41.5, y: 65, z: 40.5 }, owner, "Forge", [], "Smith");
  const order = dispatch(by, { worker: "Forge", job: "smith", params: { at: [at.x, at.y, at.z], action: "smelt", item: "minecraft:raw_iron", count: 8 } });
  check("smelt order accepted", order.ok, order.message);
  until(() => (tally(under)["minecraft:iron_ingot"] ?? 0) >= 8 || said("need fuel"), 4000);
  const inv = tally(e.getComponent("minecraft:inventory").container);
  const all = addMaps(addMaps(tally(top), tally(under)), inv);
  check("eight ingots from one coal", (tally(under)["minecraft:iron_ingot"] ?? 0) === 8, tally(under));
  check("ore and coal are gone", (all["minecraft:raw_iron"] ?? 0) === 0 && (all["minecraft:coal"] ?? 0) === 0, all);
  check("no duplicate metal", (all["minecraft:iron_ingot"] ?? 0) === 8, all);
  stopJob(e, undefined);
}

// ---- a log smelts one, not two; lava returns a bucket; a plank smelts one; beef stays ----
{
  const { at, top, under } = station(60, 40, [new ItemStack("minecraft:oak_log", 1), new ItemStack("minecraft:raw_iron", 2)]);
  const { e } = spawnWorker(ow, { x: 61.5, y: 65, z: 40.5 }, owner, "Loggy", [], "Smith");
  dispatch(by, { worker: "Loggy", job: "smith", params: { at: [at.x, at.y, at.z], action: "smelt", item: "minecraft:raw_iron", count: 2 } });
  until(() => said("need fuel") || (tally(under)["minecraft:iron_ingot"] ?? 0) >= 1, 2000);
  run(30);
  check("one log smelts one ingot", (tally(under)["minecraft:iron_ingot"] ?? 0) === 1, tally(under));
  check("one raw iron is left", (tally(top)["minecraft:raw_iron"] ?? 0) + (tally(e.getComponent("minecraft:inventory").container)["minecraft:raw_iron"] ?? 0) === 1);
  stopJob(e, undefined);
}
{
  const { at, top, under } = station(80, 40, [new ItemStack("minecraft:lava_bucket", 1), new ItemStack("minecraft:raw_gold", 1)]);
  const { e } = spawnWorker(ow, { x: 81.5, y: 65, z: 40.5 }, owner, "Lav", [], "Smith");
  dispatch(by, { worker: "Lav", job: "smith", params: { at: [at.x, at.y, at.z], action: "smelt", item: "minecraft:raw_gold", count: 1 } });
  until(() => (tally(under)["minecraft:gold_ingot"] ?? 0) === 1, 2000);
  const all = addMaps(tally(top), tally(e.getComponent("minecraft:inventory").container));
  check("lava smelts one gold ingot", (tally(under)["minecraft:gold_ingot"] ?? 0) === 1);
  check("the bucket comes back empty", (all["minecraft:bucket"] ?? 0) === 1 && (all["minecraft:lava_bucket"] ?? 0) === 0, all);
  stopJob(e, undefined);
}
{
  const { at, top, under } = station(100, 40, [new ItemStack("minecraft:oak_planks", 1), new ItemStack("minecraft:raw_copper", 1), new ItemStack("minecraft:beef", 4), new ItemStack("minecraft:sand", 4)]);
  const { e } = spawnWorker(ow, { x: 101.5, y: 65, z: 40.5 }, owner, "Plank", [], "Smith");
  dispatch(by, { worker: "Plank", job: "smith", params: { at: [at.x, at.y, at.z], action: "smelt", item: "ore", count: 1 } });
  until(() => (tally(under)["minecraft:copper_ingot"] ?? 0) === 1, 2000);
  check("a plank smelts one copper ingot", (tally(under)["minecraft:copper_ingot"] ?? 0) === 1, tally(under));
  check("beef and sand stay", (tally(top)["minecraft:beef"] ?? 0) === 4 && (tally(top)["minecraft:sand"] ?? 0) === 4);
  stopJob(e, undefined);
}

// ---- settlement depot, not a home chest ----
{
  const bellAt = { x: 120, y: 66, z: 40 };
  ow.setBlockType({ x: 120, y: 65, z: 40 }, "minecraft:stone");
  ow.setBlockType(bellAt, "minecraft:bell");
  const bell = ow.getBlock(bellAt);
  recordBell(owner, bell);
  check("settlement founded", foundSettlement(owner, bell, "Smithton").ok);
  const s = settlementOf(owner);
  const { at, under } = station(120, 50, [new ItemStack("minecraft:coal", 2)]);
  const depotAt = { x: 130, y: 65, z: 50 };
  ow.setBlockType(depotAt, "minecraft:chest");
  ow.getBlock(depotAt).getComponent("minecraft:inventory").container.setItem(0, new ItemStack("minecraft:raw_iron", 1));
  setDepot(by, s, { dim: ow.id, x0: 128, z0: 48, x1: 132, z1: 52, y: 65 });
  saveDepotUnits(s.id, [{ cells: [{ x: 130, y: 65, z: 50 }], kind: "minecraft:raw_iron", group: "ore" }]);
  const homeAt = { x: 120, y: 65, z: 60 };
  ow.setBlockType(homeAt, "minecraft:chest");
  ow.getBlock(homeAt).getComponent("minecraft:inventory").container.setItem(0, new ItemStack("minecraft:diamond", 3));
  const { e } = spawnWorker(ow, { x: 121.5, y: 65, z: 50.5 }, owner, "Depo", [], "Smith");
  setHome(e, { dim: ow.id, head: { x: 120, y: 64, z: 60 }, foot: { x: 121, y: 64, z: 60 }, chest: homeAt });
  dispatch(by, { worker: "Depo", job: "smith", params: { at: [at.x, at.y, at.z], action: "smelt", item: "minecraft:raw_iron", count: 1 } });
  until(() => (tally(under)["minecraft:iron_ingot"] ?? 0) === 1, 8000);
  check("depot ore is smelted", (tally(under)["minecraft:iron_ingot"] ?? 0) === 1, tally(under));
  check("home diamonds stay", tally(ow.getBlock(homeAt).getComponent("minecraft:inventory").container)["minecraft:diamond"] === 3);
  const made = dispatch(by, { worker: "Depo", job: "smith", params: { at: [at.x, at.y, at.z], action: "craft", item: "pickaxe", tier: "diamond", count: 1 } });
  check("diamond craft order accepted", made.ok, made.message);
  until(() => said("home chest"), 1500);
  check("it will not take diamonds from home", said("home chest"));
  check("still three diamonds", tally(ow.getBlock(homeAt).getComponent("minecraft:inventory").container)["minecraft:diamond"] === 3);
  stopJob(e, undefined);
}

// ---- craft, netherite, repair, horse armor, stock ----
{
  const { at, top, under } = station(160, 40, [
    new ItemStack("minecraft:iron_ingot", 20),
    new ItemStack("minecraft:stick", 4),
    new ItemStack("minecraft:leather", 16),
  ]);
  const { e } = spawnWorker(ow, { x: 161.5, y: 65, z: 40.5 }, owner, "Maker", [], "Smith");
  dispatch(by, { worker: "Maker", job: "smith", params: { at: [at.x, at.y, at.z], action: "craft", item: "sword", tier: "iron", count: 1 } });
  until(() => tally(under)["minecraft:iron_sword"] === 1, 2000);
  check("an iron sword costs 2 ingots and 1 stick", tally(under)["minecraft:iron_sword"] === 1 && (tally(top)["minecraft:iron_ingot"] ?? 0) === 18 && (tally(top)["minecraft:stick"] ?? 0) === 3, { top: tally(top), under: tally(under) });
  stopJob(e, undefined);
  dispatch(by, { worker: "Maker", job: "smith", params: { at: [at.x, at.y, at.z], action: "craft", item: "horse", tier: "iron", count: 1 } });
  until(() => tally(under)["minecraft:iron_horse_armor"] === 1, 2000);
  check("iron horse armor costs 6 ingots", tally(under)["minecraft:iron_horse_armor"] === 1 && (tally(top)["minecraft:iron_ingot"] ?? 0) === 12, tally(top));
  stopJob(e, undefined);
  dispatch(by, { worker: "Maker", job: "smith", params: { at: [at.x, at.y, at.z], action: "craft", item: "helmet", tier: "leather", count: 1 } });
  until(() => tally(under)["minecraft:leather_helmet"] === 1, 2000);
  check("a leather helmet costs 5 leather", tally(under)["minecraft:leather_helmet"] === 1 && (tally(top)["minecraft:leather"] ?? 0) === 11, tally(top));
  stopJob(e, undefined);
  const worn = new ItemStack("minecraft:iron_pickaxe", 1);
  worn.damage = 100;
  under.setItem(10, worn);
  const beforeDmg = 100;
  dispatch(by, { worker: "Maker", job: "smith", params: { at: [at.x, at.y, at.z], action: "repair", item: "minecraft:iron_pickaxe", count: 1 } });
  until(() => said("Repaired"), 2000);
  let dmg = -1;
  for (let i = 0; i < under.size; i++) {
    const it = under.getItem(i);
    if (it?.typeId === "minecraft:iron_pickaxe") dmg = it.damage;
  }
  check("one ingot restores a quarter of an iron pick", dmg === beforeDmg - Math.ceil(250 / 4) && (tally(top)["minecraft:iron_ingot"] ?? 0) === 11, { dmg, ingots: tally(top)["minecraft:iron_ingot"] });
  stopJob(e, undefined);
  under.setItem(11, new ItemStack("minecraft:iron_horse_armor", 1));
  logs.length = 0;
  dispatch(by, { worker: "Maker", job: "smith", params: { at: [at.x, at.y, at.z], action: "repair", item: "minecraft:iron_horse_armor", count: 1 } });
  until(() => said("isn't damaged") || said("nothing to repair"), 1500);
  check("undamaged horse armor is not repaired", said("isn't damaged") || said("nothing to repair"));
  check("horse armor is still there", tally(under)["minecraft:iron_horse_armor"] === 2);
  stopJob(e, undefined);
  top.setItem(8, new ItemStack("minecraft:diamond_pickaxe", 1));
  top.setItem(9, new ItemStack("minecraft:netherite_ingot", 1));
  top.setItem(10, new ItemStack("minecraft:netherite_upgrade_smithing_template", 1));
  dispatch(by, { worker: "Maker", job: "smith", params: { at: [at.x, at.y, at.z], action: "craft", item: "pickaxe", tier: "netherite", count: 1 } });
  until(() => tally(under)["minecraft:netherite_pickaxe"] === 1, 2000);
  const left = addMaps(tally(top), tally(e.getComponent("minecraft:inventory").container));
  check("netherite pick uses the diamond pick, ingot, and template", tally(under)["minecraft:netherite_pickaxe"] === 1 && (left["minecraft:diamond_pickaxe"] ?? 0) === 0 && (left["minecraft:netherite_ingot"] ?? 0) === 0 && (left["minecraft:netherite_upgrade_smithing_template"] ?? 0) === 0);
  stopJob(e, undefined);
}

// ---- stock: two wooden picks for one miner, none for a hauler ----
{
  const { at, top, under } = station(200, 40, [new ItemStack("minecraft:oak_planks", 32), new ItemStack("minecraft:stick", 8)]);
  const { e } = spawnWorker(ow, { x: 201.5, y: 65, z: 40.5 }, owner, "Stocky", [], "Smith");
  spawnWorker(ow, { x: 201.5, y: 65, z: 44.5 }, owner, "Picky", [new ItemStack("minecraft:iron_pickaxe")]);
  spawnWorker(ow, { x: 201.5, y: 65, z: 46.5 }, owner, "Carry", [new ItemStack("minecraft:bundle"), new ItemStack("minecraft:leather_boots")]);
  dispatch(by, { worker: "Stocky", job: "smith", params: { at: [at.x, at.y, at.z], action: "stock" } });
  until(() => (tally(under)["minecraft:wooden_pickaxe"] ?? 0) >= 2, 4000);
  run(80);
  check("two wooden pickaxes for one miner", (tally(under)["minecraft:wooden_pickaxe"] ?? 0) === 2, tally(under));
  check("no tool for the hauler", !tally(under)["minecraft:wooden_sword"] && !tally(under)["minecraft:bundle"]);
  const stop = dispatch(by, { worker: "Stocky", job: "stop", params: {} });
  check("stop pauses the forge", stop.ok);
  const again = dispatch(by, { worker: "Stocky", job: "resume", params: {} });
  check("continue picks the forge up", again.ok && /forge/i.test(again.message), again.message);
  stopJob(e, undefined);
}

// ---- a miner takes the wooden pick, not the diamond ----
{
  for (const ent of ow.getEntities({ type: "crew:worker" })) {
    if (roleOf(ent) !== "Smith") continue;
    ent.setDynamicProperty("crew:smithOff", true);
    stopJob(ent, undefined);
  }
  const outAt = { x: 240, y: 64, z: 80 };
  const forgeAt = { x: 240, y: 65, z: 80 };
  ow.setBlockType(forgeAt, FORGE);
  ow.setBlockType(outAt, "minecraft:chest");
  const under = ow.getBlock(outAt).getComponent("minecraft:inventory").container;
  under.setItem(0, new ItemStack("minecraft:wooden_pickaxe", 1));
  under.setItem(1, new ItemStack("minecraft:diamond_pickaxe", 1));
  const { e: sm } = spawnWorker(ow, { x: 241.5, y: 65, z: 80.5 }, owner, "Holder", [], "Smith");
  sm.setDynamicProperty("crew:forge", JSON.stringify({ x: 240, y: 65, z: 80, dim: ow.id }));
  sm.setDynamicProperty("crew:smithOff", true);
  const start = { x: 260, y: 64, z: 80 };
  const supply = { x: 260, y: 65, z: 78 };
  ow.setBlockType(start, "minecraft:stone");
  ow.setBlockType(supply, "minecraft:chest");
  const homeChest = { x: 400, y: 65, z: 80 };
  ow.setBlockType(homeChest, "minecraft:chest");
  ow.getBlock(homeChest).getComponent("minecraft:inventory").container.setItem(0, new ItemStack("minecraft:oak_planks", 4));
  ow.setBlockType({ x: 400, y: 65, z: 82 }, "minecraft:crafting_table");
  const worn = new ItemStack("minecraft:wooden_pickaxe");
  worn.damage = 58;
  const { e } = spawnWorker(ow, { x: 260.5, y: 66, z: 76.5 }, owner, "Woody2", [worn]);
  setHome(e, { dim: ow.id, head: { x: 400, y: 64, z: 80 }, foot: { x: 401, y: 64, z: 80 }, chest: homeChest });
  const started = dispatch(by, { worker: "Woody2", job: "prospect", params: { where: "stake", start: [start.x, start.y, start.z], facing: "south", range: 4, deposit: [supply.x, supply.y, supply.z] } });
  check("prospect starts", started.ok, started.message);
  until(() => (tally(under)["minecraft:wooden_pickaxe"] ?? 0) === 0, 20000);
  const inv = e.getComponent("minecraft:inventory").container;
  let wood = 0;
  let dia = 0;
  for (let i = 0; i < 5; i++) {
    if (inv.getItem(i)?.typeId === "minecraft:wooden_pickaxe") wood++;
    if (inv.getItem(i)?.typeId === "minecraft:diamond_pickaxe") dia++;
  }
  check("the miner took the wooden pick", wood >= 1 && (tally(under)["minecraft:wooden_pickaxe"] ?? 0) === 0, { wood, left: tally(under), job: String(e.getDynamicProperty("crew:job") ?? ""), log: logs.filter((l) => /Woody2|tool_needed|Crew\]/).slice(-8) });
  check("the diamond pick stayed in the Smith's chest", dia === 0 && tally(under)["minecraft:diamond_pickaxe"] === 1);
  check("home planks were not crafted into a pick", (tally(ow.getBlock(homeChest).getComponent("minecraft:inventory").container)["minecraft:oak_planks"] ?? 0) === 4);
  stopJob(e, undefined);
  stopJob(sm, undefined);
}

// ---- output chest counts in the ledger ----
{
  const s = settlementOf(owner);
  if (s) {
    const block = ow.getBlock({ x: 120, y: 64, z: 50 });
    addStorage(by, s, block);
    const row = ledger(s).chests.find((c) => c.label?.includes("120 64 50") || (c.items && c.items["minecraft:iron_ingot"]));
    check("the forge chest can count in the ledger", !!row || ledger(s).totals.some((t) => t.id === "minecraft:iron_ingot"));
  }
}

// ---- night pauses ----
{
  const { at } = station(280, 40, [new ItemStack("minecraft:coal", 8), new ItemStack("minecraft:raw_iron", 8)]);
  const { e } = spawnWorker(ow, { x: 281.5, y: 65, z: 40.5 }, owner, "Night", [], "Smith");
  dispatch(by, { worker: "Night", job: "smith", params: { at: [at.x, at.y, at.z], action: "stock" } });
  setTimeOfDay(13000);
  run(40);
  const job = String(e.getDynamicProperty("crew:job") ?? "");
  const paused = String(e.getDynamicProperty("crew:paused") ?? "");
  check("night sends the Smith to rest and keeps the forge", job.includes("rest") || paused.includes("smith"), { job, paused });
  setTimeOfDay(1000);
  stopJob(e, undefined);
}

if (fails.length) {
  console.log = out;
  console.log(`\n${fails.length} failed of ${checks}:\n- ${fails.join("\n- ")}`);
  process.exit(1);
}
console.log = out;
console.log(`smith: ${checks} checks passed`);

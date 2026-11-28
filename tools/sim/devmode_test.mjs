// Dev mode (specs/dev-mode.md). Off by default, operators only, and the worker limit and the
// clock skip do nothing for players while it is off. Exits non-zero when a check fails.
import { world, ItemStack, Container, BlockTypes, fire, setPlayers, CommandPermissionLevel, CustomCommandStatus } from "@minecraft/server";
import { formLog } from "@minecraft/server-ui";
import "./scripts/main.js";
import { capCheck, getCap } from "./scripts/settlement.js";
import { energy, getHome, isNight } from "./scripts/life.js";
import { ROLE_LIST } from "./scripts/tools.js";
import { buildFromBarrel, roleOf } from "./scripts/workers.js";
import { DEV_MORNING, DEV_NIGHT, DEV_ROLES, devModeOn, giveTestItems, openDevMenu, spawnAll } from "./scripts/devmode.js";

const fails = [];
let checks = 0;
const check = (name, ok, detail) => { checks++; if (!ok) fails.push(detail === undefined ? name : `${name}: ${JSON.stringify(detail)}`); };

const ow = world.getDimension("minecraft:overworld");
const mk = (id, name, op, at) => ({
  id, name, typeId: "minecraft:player", isValid: true, isSneaking: false,
  commandPermissionLevel: op ? CommandPermissionLevel.GameDirectors : CommandPermissionLevel.Any,
  dimension: ow, location: { ...at }, msgs: [], inv: undefined,
  sendMessage(m) { this.msgs.push(String(m)); },
  getComponent(n) { return n === "minecraft:inventory" ? { container: this.inv } : undefined; },
});
// Inventory is created after mk so the object can close over itself. Assigned below.
const op = mk("op1", "Op", true, { x: 100.2, y: 65, z: 100 });
const guest = mk("g1", "Guest", false, { x: 80, y: 65, z: 80 });
op.inv = new Container(36);
guest.inv = new Container(36);
setPlayers([op, guest]);

const tally = (container) => {
  /** @type {Record<string, number>} */
  const m = {};
  if (!container) return m;
  for (let i = 0; i < container.size; i++) {
    const it = container.getItem(i);
    if (it) m[it.typeId] = (m[it.typeId] ?? 0) + it.amount;
  }
  return m;
};

check("off by default", devModeOn() === false && world.getDynamicProperty("crew:devMode") === undefined);
check("default cap is 6 and unset", getCap() === 6 && world.getDynamicProperty("crew:cap") === undefined);
const clock = world.getTimeOfDay();
check("spawn refused while off", spawnAll(op)[0].ok === false && !devModeOn());
check("items refused while off", giveTestItems(op).ok === false && tally(op.inv)["crew:survey_stake"] === undefined);
check("clock unchanged while off", world.getTimeOfDay() === clock);

const cmds = new Map();
fire("system.beforeEvents.startup", {
  customCommandRegistry: {
    registerEnum() {},
    registerCommand(def, cb) { cmds.set(def.name, { def, cb }); },
  },
});
const dev = cmds.get("crew:dev");
check("command registered", !!dev);
check("command is operators only", dev?.def.permissionLevel === CommandPermissionLevel.GameDirectors);
check("command names the switch", /off by default/i.test(dev?.def.description ?? ""));

const guestOn = dev.cb({ sourceEntity: guest, sourceType: "Entity" }, "on");
check("non-operator command refused", guestOn.status === CustomCommandStatus.Failure && devModeOn() === false);
check("guest cannot spawn while somehow calling it", spawnAll(guest)[0].ok === false);

const origin = { sourceEntity: op, sourceType: "Entity" };
check("operator turns it on", dev.cb(origin, "on").status === CustomCommandStatus.Success && devModeOn() === true);
check("on message is labelled", op.msgs.some((m) => m.includes("Dev mode is ON")));
check("flag is a boolean and not a name", world.getDynamicProperty("crew:devMode") === true);

world.setDynamicProperty("crew:cap", 1);
check("stored cap is 1", getCap() === 1);

const want = {
  "crew:survey_stake": 1,
  "crew:sieve": 4,
  "minecraft:iron_pickaxe": 1,
  "minecraft:diamond_pickaxe": 1,
  "minecraft:iron_shovel": 1,
  "minecraft:iron_axe": 1,
  "minecraft:iron_hoe": 1,
  "minecraft:bundle": 1,
  "minecraft:leather_boots": 1,
  "minecraft:water_bucket": 1,
  "minecraft:torch": 64,
  "minecraft:oak_planks": 32,
  "minecraft:oak_log": 16,
  "minecraft:oak_sapling": 16,
  "minecraft:wheat_seeds": 16,
  "minecraft:beetroot_seeds": 8,
  "minecraft:melon_seeds": 8,
  "minecraft:pumpkin_seeds": 8,
  "minecraft:cocoa_beans": 8,
  "minecraft:bone_meal": 16,
  "minecraft:jungle_log": 4,
  "minecraft:sand": 16,
  "minecraft:gravel": 64,
  "minecraft:dirt": 16,
  "minecraft:soul_sand": 16,
  "minecraft:bread": 16,
  "minecraft:chest": 4,
};
const gave = giveTestItems(op);
check("items given", gave.ok, gave);
const got = tally(op.inv);
for (const [id, n] of Object.entries(want)) check(`item ${id}`, got[id] === n, got[id]);
giveTestItems(op);
const got2 = tally(op.inv);
check("still one Survey Stake", got2["crew:survey_stake"] === 1, got2["crew:survey_stake"]);

const spawned = spawnAll(op);
check("one of each spawned", spawned.length === DEV_ROLES.length && spawned.every((r) => r.ok), spawned.map((r) => r.message));
const byRole = Object.fromEntries(spawned.map((r) => [r.role, r]));

const expectKit = {
  Digger: ["minecraft:iron_shovel", "minecraft:iron_pickaxe"],
  Miner: ["minecraft:iron_pickaxe", "minecraft:diamond_pickaxe"],
  Woodcutter: ["minecraft:iron_axe"],
  Farmer: ["minecraft:iron_hoe"],
};
for (const role of DEV_ROLES) {
  const r = byRole[role];
  const e = r.e;
  const inv = e.getComponent("minecraft:inventory").container;
  const have = tally(inv);
  check(`${role} property`, e.getDynamicProperty("crew:role") === role, e.getDynamicProperty("crew:role"));
  if (ROLE_LIST.includes(role)) {
    check(`${role} shown`, roleOf(e) === role && String(e.nameTag).includes(role), { role: roleOf(e), tag: e.nameTag });
    check(`${role} skin`, e.getProperty("crew:role") === ROLE_LIST.indexOf(role), e.getProperty("crew:role"));
  } else check(`${role} labelled on the tag`, String(e.nameTag).includes(role), e.nameTag);
  check(`${role} rested`, energy(e) === 100, energy(e));
  const home = getHome(e);
  check(`${role} home chest`, !!home?.chest && home.chest.x === r.chest.x && home.chest.y === r.chest.y && home.chest.z === r.chest.z, home);
  const stock = tally(ow.getBlock(r.chest).getComponent("minecraft:inventory").container);
  check(`${role} torches in the chest`, stock["minecraft:torch"] >= 64, stock["minecraft:torch"]);
  check(`${role} food in the chest`, stock["minecraft:bread"] >= 16, stock["minecraft:bread"]);
  if (expectKit[role]) {
    const kit = [inv.getItem(0)?.typeId, inv.getItem(1)?.typeId].filter(Boolean);
    check(`${role} tools`, expectKit[role].every((id) => kit.includes(id)), kit);
  }
  if (role === "Hauler") {
    check("hauler bundle", have["minecraft:bundle"] >= 1, have);
    check("hauler boots", have["minecraft:leather_boots"] >= 1, have);
    check("hauler chests stocked", stock["minecraft:chest"] >= 8, stock["minecraft:chest"]);
  }
  if (role === "Miner") check("miner planks", stock["minecraft:oak_planks"] >= 32, stock["minecraft:oak_planks"]);
  if (role === "Woodcutter") {
    check("woodcutter logs", stock["minecraft:oak_log"] >= 16, stock);
    check("woodcutter saplings", stock["minecraft:oak_sapling"] >= 16, stock);
  }
  if (role === "Farmer") {
    check("farmer seeds", stock["minecraft:wheat_seeds"] >= 16 && stock["minecraft:cocoa_beans"] >= 8, stock);
    check("farmer sand and log", stock["minecraft:sand"] >= 16 && stock["minecraft:jungle_log"] >= 4, stock);
    check("farmer water", stock["minecraft:water_bucket"] >= 1, stock);
  }
  if (role === "Sifter") {
    check("sifter gravel", stock["minecraft:gravel"] >= 64 && stock["minecraft:sand"] >= 32 && stock["minecraft:dirt"] >= 32 && stock["minecraft:soul_sand"] >= 16, stock);
    check("sifter sieve item", (stock["crew:sieve"] ?? 0) + (have["crew:sieve"] ?? 0) >= 1, { stock: stock["crew:sieve"], held: have["crew:sieve"] });
    if (BlockTypes.get("crew:sieve")) check("sieve block placed", r.sieve && ow.getBlock(r.sieve)?.typeId === "crew:sieve", r.sieve);
    else check("sieve block waits for the block", r.sieve === undefined);
  }
}

check("cap number unchanged after spawning", getCap() === 1);
check("cap lifted while dev mode is on", capCheck(op.id).ok === true);
check("guest is also past a lifted cap", capCheck(guest.id).ok === true);

const barrel = (x) => {
  const at = { x, y: 65, z: 500 };
  ow.setBlockType({ x, y: 64, z: 500 }, "minecraft:stone");
  ow.setBlockType(at, "minecraft:barrel");
  ow.setBlockType({ x, y: 66, z: 500 }, "minecraft:carved_pumpkin");
  const c = ow.getBlock(at).getComponent("minecraft:inventory").container;
  c.setItem(0, new ItemStack("minecraft:iron_shovel", 1));
  return at;
};
const built = barrel(500);
buildFromBarrel(op, ow.getBlock({ x: built.x, y: 66, z: built.z }));
check("barrel build past the cap while on", ow.getBlock(built)?.typeId === "minecraft:air", ow.getBlock(built)?.typeId);

await openDevMenu(op);
const menu = formLog.filter((f) => f.title === "Dev mode").pop();
check("menu titled Dev mode", !!menu, formLog.map((f) => f.title));
const labels = menu?.buttons ?? [];
for (const role of DEV_ROLES) check(`menu spawns ${role}`, labels.some((b) => b.includes(role)), labels);
check("menu gives items", labels.some((b) => /test item/i.test(b)), labels);
check("menu morning and night", labels.some((b) => /morning/i.test(b)) && labels.some((b) => /night/i.test(b)), labels);
check("menu says the limit is lifted", /worker limit is lifted/i.test(menu?.body ?? ""));

check("night command", dev.cb(origin, "night").status === CustomCommandStatus.Success && world.getTimeOfDay() === DEV_NIGHT && isNight() === true);
check("morning command", dev.cb(origin, "morning").status === CustomCommandStatus.Success && world.getTimeOfDay() === DEV_MORNING && isNight() === false);
dev.cb(origin, "night");
check("off leaves the clock", dev.cb(origin, "off").status === CustomCommandStatus.Success && devModeOn() === false && world.getTimeOfDay() === DEV_NIGHT);
check("skip refused once off", dev.cb(origin, "morning").status === CustomCommandStatus.Success && world.getTimeOfDay() === DEV_NIGHT);
check("cap number still 1", getCap() === 1 && world.getDynamicProperty("crew:cap") === 1);
check("cap restored", capCheck(op.id).ok === false);
check("flag deleted", world.getDynamicProperty("crew:devMode") === undefined && !world.getDynamicPropertyIds().includes("crew:devMode"));
check("no personal dev key", world.getDynamicPropertyIds().every((k) => k === "crew:cap" || k === "crew:workers" || k === "crew:beds" || !k.toLowerCase().includes("dev")));

const refused = barrel(508);
buildFromBarrel(op, ow.getBlock({ x: refused.x, y: 66, z: refused.z }));
const left = ow.getBlock(refused)?.getComponent("minecraft:inventory")?.container?.getItem(0);
check("barrel kept its shovel", ow.getBlock(refused)?.typeId === "minecraft:barrel" && left?.typeId === "minecraft:iron_shovel", ow.getBlock(refused)?.typeId);
check("spawn refused again", spawnAll(op)[0].ok === false);

console.log(`dev mode: ${checks} checks, ${fails.length} failed`);
if (fails.length) {
  for (const f of fails) console.log("FAIL " + f);
  process.exit(1);
}

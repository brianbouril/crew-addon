// Operator testing mode. Off unless an operator turns it on. While it is off, nothing here runs
// and the worker limit is unchanged. The switch is the world property crew:devMode (true, or
// absent). It stores no player id or name.
import { BlockTypes, CommandPermissionLevel, CustomCommandParamType as T, CustomCommandSource, CustomCommandStatus, ItemStack, system, world } from "@minecraft/server";
import { ActionFormData } from "@minecraft/server-ui";
import { show } from "./forms.js";
import { setEnergy, setHome } from "./life.js";
import { STAKE, giveStake } from "./marker.js";
import { getCap } from "./settlement.js";
import { ROLE_LIST } from "./tools.js";
import { tell } from "./util.js";
import { later, roleOf, setRole, spawnWorker } from "./workers.js";

/** @typedef {import("@minecraft/server").Player} Player */
/** @typedef {import("@minecraft/server").Container} Container */
/** @typedef {{id?: string, name: string, isOp?: boolean, console?: boolean, player?: Player}} Who */

/** Time of day for "morning": TimeOfDay.Day, and daytime for this add-on's clock. */
export const DEV_MORNING = 1000;
/** Time of day for "night": TimeOfDay.Night, inside this add-on's night (12000 until 23000). */
export const DEV_NIGHT = 13000;

/** Spawn order. The menu and "one of each" use this list. */
export const DEV_ROLES = ["Digger", "Miner", "Hauler", "Woodcutter", "Farmer", "Sifter"];

const SIEVE = "crew:sieve";

/** What "Give every test item" puts in the operator's inventory. The stake is separate (only one). */
const GIVE = [
  [SIEVE, 4],
  ["minecraft:iron_pickaxe", 1],
  ["minecraft:diamond_pickaxe", 1],
  ["minecraft:iron_shovel", 1],
  ["minecraft:iron_axe", 1],
  ["minecraft:iron_hoe", 1],
  ["minecraft:bundle", 1],
  ["minecraft:leather_boots", 1],
  ["minecraft:water_bucket", 1],
  ["minecraft:torch", 64],
  ["minecraft:oak_planks", 32],
  ["minecraft:oak_log", 16],
  ["minecraft:oak_sapling", 16],
  ["minecraft:wheat_seeds", 16],
  ["minecraft:beetroot_seeds", 8],
  ["minecraft:melon_seeds", 8],
  ["minecraft:pumpkin_seeds", 8],
  ["minecraft:cocoa_beans", 8],
  ["minecraft:bone_meal", 16],
  ["minecraft:jungle_log", 4],
  ["minecraft:sand", 16],
  ["minecraft:gravel", 64],
  ["minecraft:dirt", 16],
  ["minecraft:soul_sand", 16],
  ["minecraft:bread", 16],
  ["minecraft:chest", 4],
];

/** Tools the worker holds. A Hauler and a Sifter are not tool roles; their gear is placed after spawn. */
const HELD = {
  Digger: ["minecraft:iron_shovel", "minecraft:iron_pickaxe"],
  Miner: ["minecraft:iron_pickaxe", "minecraft:diamond_pickaxe"],
  Woodcutter: ["minecraft:iron_axe"],
  Farmer: ["minecraft:iron_hoe"],
};

/** Home-chest supplies for that job, on top of a stack of torches and some bread. */
const STOCK = {
  Digger: [["minecraft:iron_shovel", 1], ["minecraft:iron_pickaxe", 2]],
  Miner: [["minecraft:iron_pickaxe", 2], ["minecraft:diamond_pickaxe", 1], ["minecraft:oak_planks", 32], ["minecraft:chest", 2]],
  Hauler: [["minecraft:chest", 8]],
  Woodcutter: [["minecraft:iron_axe", 1], ["minecraft:oak_log", 16], ["minecraft:oak_sapling", 16]],
  Farmer: [
    ["minecraft:iron_hoe", 1],
    ["minecraft:wheat_seeds", 16],
    ["minecraft:beetroot_seeds", 8],
    ["minecraft:melon_seeds", 8],
    ["minecraft:pumpkin_seeds", 8],
    ["minecraft:cocoa_beans", 8],
    ["minecraft:bone_meal", 16],
    ["minecraft:jungle_log", 4],
    ["minecraft:sand", 16],
    ["minecraft:water_bucket", 1],
  ],
  Sifter: [[SIEVE, 1], ["minecraft:gravel", 64], ["minecraft:sand", 32], ["minecraft:dirt", 32], ["minecraft:soul_sand", 16]],
};

const OFF = "Dev mode is off. A server operator turns it on with /crew:dev on.";
const OPS_ONLY = "Only a server operator can use dev mode.";

/** @param {Player | undefined} player */
const isOperator = (player) => (player?.commandPermissionLevel ?? 0) >= CommandPermissionLevel.GameDirectors;

export const devModeOn = () => world.getDynamicProperty("crew:devMode") === true;

/**
 * @param {Who} by
 * @param {boolean} on
 * @returns {{ok: boolean, message: string}}
 */
export function setDevMode(by, on) {
  if (!by?.isOp && !by?.console) return { ok: false, message: "Only a server operator can turn dev mode on or off." };
  if (on) {
    world.setDynamicProperty("crew:devMode", true);
    return { ok: true, message: "Dev mode is ON. The worker limit is lifted until you turn it off with /crew:dev off. Open the menu with /crew:dev. Normal play is unchanged while dev mode is off." };
  }
  world.setDynamicProperty("crew:devMode", undefined);
  return { ok: true, message: `Dev mode is OFF. The worker limit is ${getCap()} again. Workers already spawned stay. The clock is left where it is.` };
}

/**
 * Puts every test item into the player's inventory. A missing item (this pack build has no sieve
 * yet, for example) is named and the rest are still given.
 * @param {Player} player
 */
export function giveTestItems(player) {
  if (!isOperator(player)) return { ok: false, message: OPS_ONLY, given: /** @type {string[]} */ ([]), missing: /** @type {string[]} */ ([]) };
  if (!devModeOn()) return { ok: false, message: OFF, given: /** @type {string[]} */ ([]), missing: /** @type {string[]} */ ([]) };
  const inv = player.getComponent("minecraft:inventory")?.container;
  if (!inv) return { ok: false, message: "Dev mode: couldn't reach your inventory.", given: [], missing: [] };
  /** @type {string[]} */
  const given = [];
  /** @type {string[]} */
  const missing = [];
  const stake = giveStake(player);
  if (stake.startsWith("Survey Stake added") || stake.startsWith("You already have")) given.push(STAKE);
  else missing.push(STAKE);
  for (const [id, n] of GIVE) {
    const left = put(inv, id, n);
    if (left === "missing") missing.push(id);
    else if (left === "full") return { ok: false, message: `Dev mode: inventory full after ${given.length} stacks. Make room and run it again.`, given, missing };
    else given.push(id);
  }
  const tail = missing.length ? ` This pack build has no ${missing.join(", ")} yet; the rest were added.` : "";
  return { ok: missing.length === 0, message: `Dev mode: test items added (${given.length}).${tail}`, given, missing };
}

/**
 * @param {Container} container
 * @param {string} id
 * @param {number} n
 * @returns {"ok" | "full" | "missing"}
 */
function put(container, id, n) {
  let left = n;
  while (left > 0) {
    let stack;
    try {
      stack = new ItemStack(id, 1);
    } catch {
      return "missing";
    }
    const chunk = Math.min(left, stack.maxAmount);
    if (chunk !== 1) {
      try {
        stack = new ItemStack(id, chunk);
      } catch {
        return "missing";
      }
    }
    try {
      const rest = container.addItem(stack);
      if (rest) return "full";
    } catch {
      return "missing";
    }
    left -= chunk;
  }
  return "ok";
}

/**
 * @param {import("@minecraft/server").Dimension} dim
 * @param {number} x
 * @param {number} y
 * @param {number} z
 */
function cellOk(dim, x, y, z) {
  const here = dim.getBlock({ x, y, z });
  const up = dim.getBlock({ x, y: y + 1, z });
  const floor = dim.getBlock({ x, y: y - 1, z });
  return !!here?.isAir && !!up?.isAir && !!floor && !floor.isAir && !floor.isLiquid;
}

/**
 * A clear camp beside the player: standing spot, chest, and a two-block bed.
 * @param {import("@minecraft/server").Dimension} dim
 * @param {{x:number,y:number,z:number}} feet
 */
function findCamp(dim, feet) {
  for (let n = 0; n < 16; n++) {
    const x = feet.x + 2 + n * 4;
    const y = feet.y;
    const z = feet.z;
    const cells = [[x, y, z], [x + 1, y, z], [x, y, z + 1], [x + 1, y, z + 1], [x + 2, y, z]];
    if (!cells.every(([cx, cy, cz]) => cellOk(dim, cx, cy, cz))) continue;
    return {
      stand: { x, y, z },
      chest: { x: x + 1, y, z },
      foot: { x, y, z: z + 1 },
      head: { x: x + 1, y, z: z + 1 },
      sieve: { x: x + 2, y, z },
    };
  }
  return undefined;
}

/**
 * Puts one stack of `id` in `slot`, moving it off another slot when the spawn stashed it.
 * Does nothing when that slot already holds it, so a pack that placed the gear itself is left alone.
 * @param {Container} inv
 * @param {number} slot
 * @param {string} id
 */
function moveItem(inv, slot, id) {
  if (inv.getItem(slot)?.typeId === id) return;
  for (let i = 0; i < inv.size; i++) {
    if (i === slot) continue;
    const it = inv.getItem(i);
    if (it?.typeId !== id) continue;
    inv.setItem(slot, it);
    inv.setItem(i, undefined);
    return;
  }
  inv.setItem(slot, new ItemStack(id, 1));
}

/**
 * Stores the role name. When the pack's role list includes it, the normal tag and skin index run.
 * Dev mode does not pick a skin index of its own: syncRole follows ROLE_LIST
 * (Hauler 4, Sifter 5, and the four tool roles stay 0-3).
 * @param {import("@minecraft/server").Entity} e
 * @param {string} role
 */
function applyRole(e, role) {
  if (ROLE_LIST.includes(role)) {
    if (roleOf(e) !== role) setRole(e, role);
    return;
  }
  e.setDynamicProperty("crew:role", role);
  const name = String(e.getDynamicProperty("crew:name") ?? "Worker");
  e.nameTag = `${name}\n§7${role}`;
}

/**
 * Spawns one worker ready to work, with a home chest of that job's supplies.
 * @param {Player} player
 * @param {string} role
 */
export function spawnDevWorker(player, role) {
  if (!isOperator(player)) return { ok: false, message: OPS_ONLY };
  if (!devModeOn()) return { ok: false, message: OFF };
  if (!DEV_ROLES.includes(role)) return { ok: false, message: `Dev mode: unknown worker "${role}".` };
  const dim = player.dimension;
  const feet = { x: Math.floor(player.location.x), y: Math.floor(player.location.y), z: Math.floor(player.location.z) };
  const camp = findCamp(dim, feet);
  if (!camp) return { ok: false, message: "Dev mode: stand on solid ground with a clear strip beside you (about 4 by 2, sixteen camps)." };
  try {
    dim.setBlockType(camp.chest, "minecraft:chest");
    dim.setBlockType(camp.foot, "minecraft:bed");
    dim.setBlockType(camp.head, "minecraft:bed");
  } catch (err) {
    return { ok: false, message: `Dev mode: couldn't place the home chest (${err}).` };
  }
  const chest = dim.getBlock(camp.chest)?.getComponent("minecraft:inventory")?.container;
  if (!chest) return { ok: false, message: "Dev mode: the home chest has no inventory." };
  const stock = [["minecraft:torch", 64], ["minecraft:bread", 16], ...(STOCK[role] ?? [])];
  for (const [id, n] of stock) {
    const left = put(chest, id, n);
    if (left === "full") return { ok: false, message: "Dev mode: the home chest filled up early." };
  }
  // Hauler gear and the sieve go in with the spawn, so a pack that recognises that build
  // (a bundle and boots, or the sieve's role override) hires the right role. The 6th argument
  // is that override on the sifter update, and ignored before it.
  /** @type {ItemStack[]} */
  const held = role === "Hauler"
    ? [new ItemStack("minecraft:bundle", 1), new ItemStack("minecraft:leather_boots", 1)]
    : role === "Sifter"
      ? [new ItemStack(SIEVE, 1)]
      : (HELD[role] ?? []).map((id) => new ItemStack(id, 1));
  const { e } = spawnWorker(dim, { x: camp.stand.x + 0.5, y: camp.stand.y, z: camp.stand.z + 0.5 }, { id: player.id, name: player.name }, role, held, role);
  const inv = e.getComponent("minecraft:inventory")?.container;
  if (role === "Hauler" && inv) {
    moveItem(inv, 0, "minecraft:bundle");
    moveItem(inv, 1, "minecraft:leather_boots");
  }
  applyRole(e, role);
  setEnergy(e, 100);
  setHome(e, { dim: dim.id, head: camp.head, foot: camp.foot, chest: camp.chest });
  let sievePlaced = false;
  if (role === "Sifter") {
    try {
      if (BlockTypes.get(SIEVE)) {
        dim.setBlockType(camp.sieve, SIEVE);
        sievePlaced = dim.getBlock(camp.sieve)?.typeId === SIEVE;
      }
    } catch {
      sievePlaced = false;
    }
  }
  const where = sievePlaced ? " A sieve block is beside the chest." : "";
  return {
    ok: true,
    message: `Dev mode: ${e.getDynamicProperty("crew:name")} is here as a ${role}, with a home chest.${where}`,
    e,
    role,
    chest: camp.chest,
    sieve: sievePlaced ? camp.sieve : undefined,
  };
}

/** One of each worker type. @param {Player} player */
export function spawnAll(player) {
  return DEV_ROLES.map((role) => spawnDevWorker(player, role));
}

/** @param {"morning" | "night"} when */
export function skipTime(when) {
  if (!devModeOn()) return { ok: false, message: OFF, time: world.getTimeOfDay() };
  const night = when === "night";
  const t = night ? DEV_NIGHT : DEV_MORNING;
  try {
    world.setTimeOfDay(t);
  } catch (err) {
    return { ok: false, message: `Dev mode: couldn't set the time (${err}).`, time: world.getTimeOfDay() };
  }
  const note = night ? "Workers with a home will head to bed." : "Daytime jobs can run.";
  return { ok: true, time: world.getTimeOfDay(), message: `Dev mode: skipped to ${night ? "night" : "morning"} (${t}). ${note} Turning dev mode off does not rewind the clock.` };
}

/** @param {Player} player */
export async function openDevMenu(player) {
  if (!isOperator(player)) {
    tell(player, OPS_ONLY);
    return { ok: false, message: OPS_ONLY };
  }
  if (!devModeOn()) {
    tell(player, OFF);
    return { ok: false, message: OFF };
  }
  /** @type {[string, () => any][]} */
  const buttons = [
    ["Give every test item", () => { const r = giveTestItems(player); tell(player, r.message); }],
    ...DEV_ROLES.map((role) => /** @type {[string, () => any]} */ ([`Spawn a ${role}`, () => { const r = spawnDevWorker(player, role); tell(player, r.message); }])),
    ["Spawn one of each", () => {
      const all = spawnAll(player);
      const bad = all.filter((r) => !r.ok);
      tell(player, bad.length ? `Dev mode: ${all.length - bad.length} spawned, ${bad.length} failed. ${bad[0].message}` : "Dev mode: spawned one of each worker, each with a home chest.");
    }],
    ["Skip to morning", () => tell(player, skipTime("morning").message)],
    ["Skip to night", () => tell(player, skipTime("night").message)],
    ["Turn dev mode off", () => tell(player, setDevMode({ name: player.name, isOp: true }, false).message)],
  ];
  const f = new ActionFormData().title("Dev mode").body([
    "Dev mode is ON. This menu is for testing.",
    "The worker limit is lifted until you turn dev mode off.",
    "Each spawned worker stands beside you with a home chest of supplies (pickaxes, seeds, wood, gravel, torches, and the rest of that job).",
    "Skip to morning or night only works while dev mode is on. Turning it off does not rewind the clock.",
  ].join("\n"));
  for (const [label] of buttons) f.button(label);
  const r = await show(player, f);
  if (r?.selection === undefined) return { ok: true, message: "Dev mode menu closed." };
  await buttons[r.selection]?.[1]();
  return { ok: true, message: "Dev mode." };
}

/** @param {import("@minecraft/server").CustomCommandOrigin} origin @returns {Who | undefined} */
function who(origin) {
  const src = origin.sourceEntity;
  if (src && src.typeId === "minecraft:player") {
    const p = /** @type {Player} */ (src);
    return { id: p.id, name: p.name, isOp: p.commandPermissionLevel >= CommandPermissionLevel.GameDirectors, player: p };
  }
  if (origin.sourceType === CustomCommandSource.Server) return { name: "console", isOp: true, console: true };
  return undefined;
}

/** @param {Who} by @param {boolean} ok @param {string} message */
function answer(by, ok, message) {
  if (by.player) tell(by.player, ok ? message : `§c${message}`);
  else console.log(`[Crew-Result] ${JSON.stringify({ ok, message })}`);
}

const OK = { status: CustomCommandStatus.Success };
const NEED = { status: CustomCommandStatus.Failure, message: "Crew commands need a player or the server console." };

system.beforeEvents.startup.subscribe((ev) => {
  const reg = ev.customCommandRegistry;
  reg.registerEnum("crew:devmode", ["on", "off", "menu", "morning", "night"]);
  reg.registerCommand({
    name: "crew:dev",
    description: "Operators: testing mode. on, off, menu, morning, or night. Off by default.",
    permissionLevel: CommandPermissionLevel.GameDirectors,
    cheatsRequired: false,
    optionalParameters: [{ name: "crew:devmode", type: T.Enum }],
  }, (origin, action) => {
    const by = who(origin);
    if (!by) return NEED;
    if (!by.isOp && !by.console) return { status: CustomCommandStatus.Failure, message: "Only a server operator can use dev mode." };
    later(() => {
      if (action === "on" || action === "off") {
        const r = setDevMode(by, action === "on");
        answer(by, r.ok, r.message);
        return;
      }
      if (!devModeOn()) {
        answer(by, false, OFF);
        return;
      }
      if (action === "morning" || action === "night") {
        const r = skipTime(action);
        answer(by, r.ok, r.message);
        return;
      }
      if (!by.player) {
        answer(by, false, "Run /crew:dev as a player to open the dev menu.");
        return;
      }
      openDevMenu(by.player).catch((err) => console.warn(`[Crew] ${err}`));
    });
    return OK;
  });
});

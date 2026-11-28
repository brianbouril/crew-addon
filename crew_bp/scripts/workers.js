// Finding workers, who may command them, spawning them, and reporting what they do.
import { world, system, ItemStack } from "@minecraft/server";
import { DIMS, getJSON, setJSON, onlinePlayer, tell, fmt } from "./util.js";
import { getRegistry, saveRegistry, freeName } from "./store.js";
import { KIT_SLOTS, ROLE_LIST, addToKit, defaultRole, isGear, isHaulerBuild, kit, stash, toolInfo } from "./tools.js";
import { setHome } from "./life.js";
import { capCheck, forgetWorker, ownerFor, sameSettlement } from "./settlement.js";

export const WORKER_TYPE = "crew:worker";

/**
 * @typedef {import("./store.js").Commander} Commander
 * @typedef {{id?: string, name: string}} PersonRef
 * @typedef {{name: string, ownerId: string, ownerName: string, crew: PersonRef[]}} Meta
 */

/** All loaded workers in every dimension. */
export function loadedWorkers() {
  /** @type {import("@minecraft/server").Entity[]} */
  const out = [];
  for (const d of DIMS) {
    try {
      out.push(...world.getDimension(d).getEntities({ type: WORKER_TYPE }));
    } catch {
      /* dimension not available */
    }
  }
  return out;
}

/** @param {import("@minecraft/server").Entity} e @returns {Meta} */
export function meta(e) {
  return {
    name: String(e.getDynamicProperty("crew:name") ?? e.nameTag ?? "Worker"),
    ownerId: String(e.getDynamicProperty("crew:ownerId") ?? ""),
    ownerName: String(e.getDynamicProperty("crew:ownerName") ?? ""),
    crew: getJSON(e, "crew:crew", []),
  };
}

/** @param {string} name */
export function findWorker(name) {
  const key = name.trim().toLowerCase();
  return loadedWorkers().find((e) => meta(e).name.toLowerCase() === key);
}

/** @param {PersonRef} a @param {Commander} b */
const same = (a, b) => (!!a.id && a.id === b.id) || a.name.toLowerCase() === b.name.toLowerCase();

/**
 * Owner, anyone on the worker's allowed list, everyone in the owner's settlement, operators, and
 * the server console may give orders.
 * @param {Commander} by @param {Meta} m
 */
export function canCommand(by, m) {
  if (by.console || by.isOp) return true;
  if (same({ id: m.ownerId, name: m.ownerName }, by)) return true;
  if (sameSettlement(by, { id: m.ownerId, name: m.ownerName })) return true;
  return m.crew.some((c) => same(c, by));
}

/**
 * The owner, everyone in the owner's settlement (they're all equal), or an operator / the console
 * can change who gives orders, rename, take tools or dismiss.
 * @param {Commander} by @param {Meta} m
 */
export function canManage(by, m) {
  return !!(by.console || by.isOp || same({ id: m.ownerId, name: m.ownerName }, by) || sameSettlement(by, { id: m.ownerId, name: m.ownerName }));
}

/**
 * @param {import("@minecraft/server").Dimension} dim
 * @param {{x:number,y:number,z:number}} loc
 * @param {PersonRef} owner
 * @param {string | undefined} wantedName
 * @param {import("@minecraft/server").ItemStack[]} [items]  barrel contents: tools go into the kit, the rest is carried.
 *   A bundle and leather boots with no tools make a Hauler: they're its gear, in slots 0 and 1.
 * @param {string} [roleOverride]  a build kit that isn't a tool (the sieve makes a Sifter)
 * @returns {{e: import("@minecraft/server").Entity, spill: import("@minecraft/server").ItemStack[]}}
 */
export function spawnWorker(dim, loc, owner, wantedName, items = [], roleOverride) {
  const name = freeName(wantedName);
  const e = dim.spawnEntity(WORKER_TYPE, loc);
  e.setDynamicProperty("crew:name", name);
  e.setDynamicProperty("crew:ownerId", owner.id ?? "");
  e.setDynamicProperty("crew:ownerName", owner.name);
  setJSON(e, "crew:crew", []);
  const inv = /** @type {import("@minecraft/server").Container} */ (e.getComponent("minecraft:inventory")?.container);
  /** @type {import("@minecraft/server").ItemStack[]} */
  const spill = [];
  const hauler = isHaulerBuild(items);
  for (const it of items) {
    if (hauler && isGear(it.typeId)) {
      const slot = it.typeId === "minecraft:bundle" ? 0 : 1;
      if (!inv.getItem(slot)) {
        inv.setItem(slot, it);
        continue;
      }
    }
    if (toolInfo(it) && addToKit(inv, it).ok) continue;
    const left = stash(inv, it);
    if (left) spill.push(left);
  }
  const role = roleOverride && ROLE_LIST.includes(roleOverride) ? roleOverride : hauler ? "Hauler" : defaultRole(kit(inv));
  e.setDynamicProperty("crew:role", role);
  e.setDynamicProperty("crew:roleSplit", 1);
  updateTag(e);
  const reg = getRegistry();
  reg[name.toLowerCase()] = { name, id: e.id, ownerId: owner.id ?? "", ownerName: owner.name };
  saveRegistry(reg);
  try {
    dim.spawnParticle("minecraft:villager_happy", { x: loc.x, y: loc.y + 0.8, z: loc.z });
    dim.playSound("random.anvil_use", loc, { volume: 0.6, pitch: 1.4 });
  } catch {
    /* cosmetic only */
  }
  emit(e, "hired", { owner: owner.name, at: fmt(loc), role: roleOf(e), tools: kit(inv).map((t) => t.info.id) },
    `${name} is ready to work as a ${roleOf(e)}. Owner: ${owner.name}.`);
  return { e, spill };
}

/**
 * Building a worker: a barrel holding at least one tool, then a carved pumpkin placed on top
 * (playerPlaceBlock). Refused, leaving barrel and tools as they were, when the player is at the
 * worker limit.
 * @param {import("@minecraft/server").Player} player @param {import("@minecraft/server").Block} head
 */
export function buildFromBarrel(player, head) {
  if (head.typeId !== "minecraft:carved_pumpkin" && head.typeId !== "minecraft:lit_pumpkin") return;
  const body = head.below();
  if (!body || body.typeId !== "minecraft:barrel") return;
  const barrel = body.getComponent("minecraft:inventory")?.container;
  if (!barrel) return;
  /** @type {import("@minecraft/server").ItemStack[]} */
  const items = [];
  for (let i = 0; i < barrel.size; i++) {
    const it = barrel.getItem(i);
    if (it) items.push(it);
  }
  const tools = items.filter((it) => toolInfo(it));
  // one sieve is the build kit (used up). A stack keeps the rest. Tools in the same barrel do not change the role.
  let sieve = false;
  /** @type {import("@minecraft/server").ItemStack[]} */
  const kept = [];
  for (const it of items) {
    if (it.typeId === "crew:sieve" && !sieve) {
      sieve = true;
      if (it.amount > 1) {
        const extra = it.clone();
        extra.amount = it.amount - 1;
        kept.push(extra);
      }
      continue;
    }
    kept.push(it);
  }
  if (!tools.length && !sieve && !isHaulerBuild(items)) {
    tell(player, "To build a worker, put at least one tool (pickaxe, shovel, axe or hoe) or a sieve in the barrel, or a bundle and leather boots for a Hauler, then place the pumpkin again.");
    return;
  }
  const cap = capCheck(player.id);
  if (!cap.ok) {
    tell(player, cap.message);
    return;
  }
  barrel.clearAll();
  const dim = head.dimension;
  const at = body.bottomCenter();
  dim.setBlockType(head.location, "minecraft:air");
  dim.setBlockType(body.location, "minecraft:air");
  // tools first, so the kit gets them before anything else
  const ordered = [...kept.filter((it) => toolInfo(it)), ...kept.filter((it) => !toolInfo(it))];
  // in a settlement, the worker is the founder's, like every worker there
  const { e, spill } = spawnWorker(dim, at, ownerFor({ id: player.id, name: player.name }), undefined, ordered, sieve ? "Sifter" : undefined);
  for (const it of spill) dim.spawnItem(it, at);
  const extra = tools.length > KIT_SLOTS ? ` Only ${KIT_SLOTS} tools fit in the kit; the other ${tools.length - KIT_SLOTS} are carried and will go in the deposit chest.` : "";
  tell(player, `Crouch and use ${e.getDynamicProperty("crew:name")} to give it orders. New to workers? Type /crew:guide.${extra}`);
}

/** The worker's role: set in its menu, otherwise the role of its best tool. @param {import("@minecraft/server").Entity} e */
export function roleOf(e) {
  const r = e.getDynamicProperty("crew:role");
  return typeof r === "string" && ROLE_LIST.includes(r) ? r : "Miner";
}

/**
 * Workers built before the Digger/Miner split (decision 32) were all digging quarries, so each
 * becomes a Digger, once (Brian, Nov 15). Anything it was digging or had paused carries on.
 * @param {import("@minecraft/server").Entity} e
 */
export function migrateRole(e) {
  try {
    if (e.getDynamicProperty("crew:roleSplit")) return;
    e.setDynamicProperty("crew:roleSplit", 1);
    setRole(e, "Digger");
    emit(e, "role_changed", { role: "Digger", reason: "role_split" },
      "I'm a Digger now: quarries are my job. Branch mines are coming back as part of the Miner's prospecting.");
  } catch {
    /* entity gone */
  }
}

/** @param {import("@minecraft/server").Entity} e @param {string} role */
export function setRole(e, role) {
  e.setDynamicProperty("crew:role", role);
  updateTag(e);
}

/** What each worker shows in its hand (worker id -> item id), so the command only runs on a change. @type {Map<string, string>} */
const held = new Map();
/**
 * Shows a tool in the worker's hand. It's a display copy: the real tool stays in the kit, and
 * the entity's equipment drop chance is 0 so it can never drop as a duplicate.
 * @param {import("@minecraft/server").Entity} e @param {string | undefined} id  undefined = empty hand
 */
export function holdTool(e, id) {
  const want = id ?? "air";
  if (held.get(e.id) === want) return;
  held.set(e.id, want);
  try {
    e.runCommand(`replaceitem entity @s slot.weapon.mainhand 0 ${want}`);
  } catch {
    /* entity gone or command refused: cosmetic only */
  }
}

/** Keeps the entity property the skin is picked by (0 Miner, 1 Digger, 2 Woodcutter, 3 Farmer, 4 Hauler, 5 Sifter) in step with the role. @param {import("@minecraft/server").Entity} e */
export function syncRole(e) {
  try {
    const want = Math.max(0, ROLE_LIST.indexOf(roleOf(e)));
    if (e.getProperty("crew:role") !== want) e.setProperty("crew:role", want);
  } catch {
    /* entity gone */
  }
}

/** Name tag: the name, with role and best tool underneath. @param {import("@minecraft/server").Entity} e */
export function updateTag(e) {
  syncRole(e);
  if (roleOf(e) === "Hauler") {
    holdTool(e, undefined);
    e.nameTag = `${meta(e).name}\n§7Hauler`;
    return;
  }
  const inv = e.getComponent("minecraft:inventory")?.container;
  const k = inv ? kit(inv) : [];
  const best = [...k].sort((a, b) => b.info.tier - a.info.tier)[0];
  holdTool(e, best?.info.id);
  e.nameTag = `${meta(e).name}\n§7${roleOf(e)}${best ? `, ${best.info.label}` : ", no tools"}`;
}

/** @param {import("@minecraft/server").Entity} e @param {string} newName */
export function renameWorker(e, newName) {
  const m = meta(e);
  const name = freeName(newName);
  const reg = getRegistry();
  // the registry's owner is the current one (the entity's copy can lag behind a hand-over)
  const was = reg[m.name.toLowerCase()];
  delete reg[m.name.toLowerCase()];
  reg[name.toLowerCase()] = { name, id: e.id, ownerId: was?.ownerId ?? m.ownerId, ownerName: was?.ownerName ?? m.ownerName };
  saveRegistry(reg);
  e.setDynamicProperty("crew:name", name);
  updateTag(e);
  return name;
}

/**
 * A worker died (a mob, a player, /kill, the void): free its bed and forget it, so it no longer
 * counts toward its owner's worker limit or shows in the settlement's list.
 * @param {import("@minecraft/server").Entity} e
 */
export function workerDied(e) {
  const id = e.id;
  try {
    setHome(e, undefined);
  } catch {
    /* already gone */
  }
  const reg = getRegistry();
  for (const [k, r] of Object.entries(reg)) if (r.id === id) delete reg[k];
  saveRegistry(reg);
  forgetWorker(id);
}

/** Removes a worker and gives back its build blocks, tools and everything it carries. @param {import("@minecraft/server").Entity} e */
export function dismissWorker(e) {
  setHome(e, undefined); // frees its bed
  const m = meta(e);
  const dim = e.dimension;
  const at = e.location;
  const inv = e.getComponent("minecraft:inventory")?.container;
  if (inv) {
    for (let i = 0; i < inv.size; i++) {
      const it = inv.getItem(i);
      if (it) dim.spawnItem(it, at);
    }
    inv.clearAll();
  }
  for (const id of ["minecraft:barrel", "minecraft:carved_pumpkin"]) dim.spawnItem(new ItemStack(id, 1), at);
  const reg = getRegistry();
  delete reg[m.name.toLowerCase()];
  saveRegistry(reg);
  e.remove();
}

/**
 * Reports something a worker did. Goes to the owner and whoever gave the current order,
 * and to the server console as one JSON line (what the Phase 2 bridge will read).
 * @param {import("@minecraft/server").Entity} e
 * @param {string} type
 * @param {Record<string, any>} data
 * @param {string} text  human-readable message
 */
export function emit(e, type, data, text) {
  const m = meta(e);
  const job = getJSON(e, "crew:job", undefined);
  console.log(`[Crew-Event] ${JSON.stringify({ type, worker: m.name, owner: m.ownerName, job: job?.type, by: job?.by?.name, ...data })}`);
  const owner = onlinePlayer({ id: m.ownerId, name: m.ownerName });
  tell(owner, `§b${m.name}§r: ${text}`);
  if (job?.by && !job.by.console) {
    const by = onlinePlayer(job.by);
    if (by && by.id !== owner?.id) tell(by, `§b${m.name}§r: ${text}`);
  }
}

/** Runs fn on the next tick (command callbacks can't change the world directly). @param {() => void} fn */
export const later = (fn) => system.run(() => {
  try {
    fn();
  } catch (err) {
    console.warn(`[Crew] ${err}`);
  }
});

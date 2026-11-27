// Settlements (specs/settlement-layer.md): a player founds one at a bell they placed; every worker
// the owner and its members build belongs to it. This module holds the saved data and the rules;
// the menus are in ui.js and the event wiring in main.js. It imports only store.js and util.js,
// so workers.js can use it without an import cycle.
//
// Saved (world dynamic properties, JSON):
//   crew:settlements  {[settlementId]: Settlement}
//   crew:bells        {"dim|x,y,z": placerId}  bells players placed (only those can found one)
//   crew:seen         {[workerId]: Seen}       what each worker was last doing (for the roster)
//   crew:queue        {[workerId]: Queued[]}   orders waiting for an unloaded worker
//   crew:cap          number                   workers per person (operator setting)
//   crew:stock:<spot> Stock                    last read contents of one storage chest
// Membership isn't stored on workers: a worker belongs to its owner's settlement, and every worker
// in a settlement is owned by its founder (Brian, Nov 18): a member's workers move to the founder
// when they join, workers a member builds are the founder's, a player who leaves takes none, and a
// new founder takes them all. The worker limit is per settlement: 6 (the cap) for each person in it.
// Everyone in a settlement has the same rights (Nov 17), except that only the founder
// (ownerId/ownerName) can hand that role to someone else, and nobody can remove the founder.
import { ItemStack, world } from "@minecraft/server";
import { DIMS, getJSON, setJSON, onlinePlayer, tell } from "./util.js";
import { getPlaces, getRegistry, saveRegistry } from "./store.js";

/**
 * @typedef {import("./store.js").Commander} Commander
 * @typedef {{id?: string, name: string}} PersonRef
 * @typedef {{dim: string, x: number, y: number, z: number, att: string, dir?: number}} BellSpot
 * @typedef {{dim: string, x: number, y: number, z: number, label: string}} Spot  a storage chest
 * @typedef {{id: string, name: string, ownerId: string, ownerName: string, members: {id: string, name: string}[], bell: BellSpot | null, storage?: Spot[]}} Settlement
 * @typedef {{dim: string, x: number, y: number, z: number, label?: string}} ChestRef
 * @typedef {{role: string, status: string, busy: boolean, noTools: boolean, low: boolean, ticking: boolean, dim: string, x: number, y: number, z: number, ts: number, home?: ChestRef, drop?: ChestRef}} Seen
 * @typedef {{ts: number, items?: Record<string, number>, dup?: boolean, gone?: boolean}} Stock
 * @typedef {{by: Commander, order: any}} Queued
 * @typedef {{dimension: {id: string}, location: {x:number,y:number,z:number}, typeId: string, permutation?: any}} BlockLike
 */

export const BELL = "minecraft:bell";
export const CAP_DEFAULT = 6;
/** A worker further than this from the viewer counts as far away in the roster. */
const FAR = 96;
/** How many player-placed bells are remembered (oldest forgotten first). */
const MAX_BELLS = 400; // about 60 characters each; one world property holds 32,767

/** @returns {Record<string, Settlement>} keyed by settlement id (fixed at founding; the founder can change) */
export const getSettlements = () => getJSON(world, "crew:settlements", {});
/** @param {Record<string, Settlement>} all */
const saveSettlements = (all) => setJSON(world, "crew:settlements", all);
/** @param {Settlement} s */
function save(s) {
  const all = getSettlements();
  all[s.id] = s;
  saveSettlements(all);
}

/** The settlement a player owns or is a member of. @param {PersonRef} who @returns {Settlement | undefined} */
export function settlementOf(who) {
  if (!who?.id) return undefined;
  return Object.values(getSettlements()).find((s) => s.ownerId === who.id || s.members.some((m) => m.id === who.id));
}

/** Owner and members. @param {Settlement} s */
export const peopleOf = (s) => [{ id: s.ownerId, name: s.ownerName }, ...s.members];

/** Do these two players share a settlement? Used for who may give a worker orders. @param {PersonRef} a @param {PersonRef} b */
export function sameSettlement(a, b) {
  const s = settlementOf(a);
  return !!s && !!b.id && peopleOf(s).some((p) => p.id === b.id);
}

/** @param {number} n @param {string} name */
export const joinedMessage = (n, name) => `${n} of your workers joined ${name}.`;
/** How many workers a player owns (loaded or not). @param {string} ownerId */
export const workerCount = (ownerId) => Object.values(getRegistry()).filter((r) => r.ownerId === ownerId).length;

// ---------- bells ----------
/** @param {BlockLike} b */
const bellKey = (b) => `${b.dimension.id}|${Math.floor(b.location.x)},${Math.floor(b.location.y)},${Math.floor(b.location.z)}`;

/** Remembers who placed a bell (playerPlaceBlock). @param {PersonRef} player @param {BlockLike} block */
export function recordBell(player, block) {
  if (block.typeId !== BELL || !player.id) return;
  const all = getJSON(world, "crew:bells", {});
  delete all[bellKey(block)];
  all[bellKey(block)] = player.id;
  const keys = Object.keys(all);
  for (const k of keys.slice(0, Math.max(0, keys.length - MAX_BELLS))) delete all[k];
  setJSON(world, "crew:bells", all);
}
/** @param {BlockLike} block */
export function forgetBell(block) {
  const all = getJSON(world, "crew:bells", {});
  if (!(bellKey(block) in all)) return;
  delete all[bellKey(block)];
  setJSON(world, "crew:bells", all);
}
/** Who placed this bell, if a player did. @param {BlockLike} block @returns {string | undefined} */
export const bellPlacer = (block) => getJSON(world, "crew:bells", {})[bellKey(block)];

/** @param {BellSpot | null} bell @param {BlockLike} block */
const isBellAt = (bell, block) => !!bell && bell.dim === block.dimension.id && bell.x === Math.floor(block.location.x) && bell.y === Math.floor(block.location.y) && bell.z === Math.floor(block.location.z);

/**
 * What crouch-tapping a bell means for this player:
 * found (their own bell, no settlement yet), move (their own bell, settlement already has one),
 * rehang (their own bell, settlement's bell was packed or lost), menu (their settlement's bell),
 * other (someone else's settlement bell), village (nobody placed it), not_yours (another player
 * placed it).
 * @param {PersonRef} player @param {BlockLike} block
 * @returns {{kind: "found"|"move"|"rehang"|"menu"|"other"|"village"|"not_yours", s?: Settlement}}
 */
export function bellTap(player, block) {
  const at = Object.values(getSettlements()).find((s) => isBellAt(s.bell, block));
  if (at) return { kind: peopleOf(at).some((p) => p.id === player.id) ? "menu" : "other", s: at };
  const placer = bellPlacer(block);
  if (!placer) return { kind: "village" };
  if (placer !== player.id) return { kind: "not_yours" };
  const mine = settlementOf(player);
  if (!mine) return { kind: "found" };
  return { kind: mine.bell ? "move" : "rehang", s: mine };
}

/** @param {BlockLike} block @returns {BellSpot} */
function spotOf(block) {
  let att = "standing", dir = 0;
  try {
    att = String(block.permutation?.getState?.("attachment") ?? "standing");
    dir = Number(block.permutation?.getState?.("direction") ?? 0);
  } catch {
    /* no state: treat as standing */
  }
  return { dim: block.dimension.id, x: Math.floor(block.location.x), y: Math.floor(block.location.y), z: Math.floor(block.location.z), att, dir };
}

/**
 * Founds a settlement at a bell the player placed. All their workers join (they belong by owner).
 * @param {PersonRef} player @param {BlockLike} block @param {string} name  empty = "<player>'s Settlement"
 */
export function foundSettlement(player, block, name) {
  const t = bellTap(player, block);
  if (t.kind !== "found") return { ok: false, message: refusal(t) };
  const pid = /** @type {string} */ (player.id);
  // its own id, not the founder's: the founder role can move to someone else
  const id = `${pid}-${Date.now().toString(36)}`;
  /** @type {Settlement} */
  const s = { id, name: cleanName(name) || `${player.name}'s Settlement`, ownerId: pid, ownerName: player.name, members: [], bell: spotOf(block) };
  save(s);
  const n = workerCount(pid);
  return { ok: true, message: `You founded ${s.name}.${n ? ` ${joinedMessage(n, s.name)}` : ""} Crouch-tap the bell for its menu.` };
}

/** @param {{kind: string, s?: Settlement}} t */
function refusal(t) {
  switch (t.kind) {
    case "village": return "This bell belongs to the village.";
    case "not_yours": return "Only the player who placed this bell can found a settlement with it.";
    case "other": return `This is the bell of ${t.s?.name} (${t.s?.ownerName}).`;
    case "menu": case "move": case "rehang": return "You already have a settlement.";
    default: return "You can't found a settlement here.";
  }
}
export { refusal as bellRefusal };

/** @param {string} name */
const cleanName = (name) => String(name ?? "").replace(/§./g, "").trim().slice(0, 32);

/** Moves the player's settlement to this bell (or hangs it again after Move the bell). @param {PersonRef} player @param {BlockLike} block */
export function moveBell(player, block) {
  const t = bellTap(player, block);
  if (t.kind !== "move" && t.kind !== "rehang") return { ok: false, message: refusal(t) };
  const s = /** @type {Settlement} */ (t.s);
  s.bell = spotOf(block);
  save(s);
  return { ok: true, message: t.kind === "move" ? `${s.name} now rings from this bell. The old one is an ordinary bell again.` : `${s.name}'s bell is back up. Crouch-tap it for the menu.` };
}

/**
 * Move the bell: anyone in the settlement takes it down. It goes to their inventory and the settlement is kept,
 * without a bell, until they place it and crouch-tap it again.
 * @param {PersonRef} who
 */
export function packBell(who) {
  const s = settlementOf(who);
  if (!s) return { ok: false, message: "You're not in a settlement." };
  if (!s.bell) return { ok: false, message: `${s.name}'s bell isn't up anywhere. Place a bell and crouch-tap it.` };
  const bell = s.bell;
  s.bell = null;
  save(s);
  let took = false, gone = false;
  try {
    const dim = world.getDimension(bell.dim);
    const b = dim.getBlock(bell);
    gone = !!b && b.typeId !== BELL;
    if (b?.typeId === BELL) {
      dim.setBlockType(bell, "minecraft:air");
      took = true;
    }
  } catch {
    /* not loaded: the bell stays where it is, unprotected */
  }
  const kept = `${s.name} and its workers are kept: place a bell anywhere and crouch-tap it to hang it again.`;
  if (gone) return { ok: true, message: `The bell was already gone. ${kept}` };
  if (!took) return { ok: true, message: `The bell is too far away to take down from here, so it stays where it is as an ordinary bell you can break. ${kept}` };
  const p = onlinePlayer(who);
  const left = p?.getComponent("minecraft:inventory")?.container?.addItem(new ItemStack(BELL, 1));
  if (left && p) p.dimension.spawnItem(left, p.location);
  return { ok: true, message: `The bell is in your inventory. ${kept}` };
}

/**
 * The blocks a settlement bell protects: the bell and what holds it up. A standing bell sits on the
 * block below, a hanging one on the block above; a wall bell ("side", or "multiple" between two
 * walls) is held along the axis it faces (direction 0/2: north-south, 1/3: east-west), so both
 * blocks on that axis are kept.
 * @param {BellSpot} b
 */
function guarded(b) {
  const out = [{ x: b.x, y: b.y, z: b.z }];
  if (b.att === "hanging") out.push({ x: b.x, y: b.y + 1, z: b.z });
  else if (b.att === "side" || b.att === "multiple") {
    if ((b.dir ?? 0) % 2 === 0) out.push({ x: b.x, y: b.y, z: b.z + 1 }, { x: b.x, y: b.y, z: b.z - 1 });
    else out.push({ x: b.x + 1, y: b.y, z: b.z }, { x: b.x - 1, y: b.y, z: b.z });
  } else out.push({ x: b.x, y: b.y - 1, z: b.z });
  return out;
}

/** Every protected block, as "dim|x,y,z", read once (an explosion checks many blocks). */
export function protectedKeys() {
  /** @type {Set<string>} */
  const keys = new Set();
  for (const s of Object.values(getSettlements())) if (s.bell) for (const g of guarded(s.bell)) keys.add(`${s.bell.dim}|${g.x},${g.y},${g.z}`);
  return keys;
}

/** Is this block a settlement bell or the block holding one up? @param {BlockLike} block @param {Set<string>} [keys] */
export const isProtected = (block, keys = protectedKeys()) => keys.has(bellKey(block));

/** Once in a while: a settlement bell that's gone (a command, a piston) leaves the settlement without one. */
export function checkBells() {
  for (const s of Object.values(getSettlements())) {
    if (!s.bell) continue;
    let block;
    try {
      block = world.getDimension(s.bell.dim).getBlock(s.bell);
    } catch {
      continue; // not loaded
    }
    if (!block || block.typeId === BELL) continue;
    s.bell = null;
    save(s);
    tell(onlinePlayer({ id: s.ownerId, name: s.ownerName }), `${s.name}'s bell is gone. Its workers are kept: place a bell and crouch-tap it to hang it again.`);
  }
}

// ---------- members and name ----------
/** Anyone in the settlement (or an operator) may manage it. @param {Commander} by @param {Settlement} s */
const inIt = (by, s) => !!(by.console || by.isOp || peopleOf(s).some((p) => p.id === by.id));

/** @param {Commander} by @param {Settlement} s @param {{id: string, name: string}} who */
export function addMember(by, s, who) {
  if (!inIt(by, s)) return { ok: false, message: `Only people in ${s.name} can add members.` };
  const other = settlementOf(who);
  if (other) return { ok: false, message: other.id === s.id ? `${who.name} is already in ${s.name}.` : `${who.name} already belongs to ${other.name}.` };
  const cur = getSettlements()[s.id];
  cur.members.push({ id: who.id, name: who.name });
  save(cur);
  const n = transferWorkers(who.id, { id: cur.ownerId, name: cur.ownerName });
  tell(onlinePlayer(who), `${by.name} added you to ${s.name}. You can give orders to all its workers and run the settlement like everyone in it.${n ? ` ${joinedMessage(n, s.name)}` : ""}`);
  return { ok: true, message: `${who.name} is now a member of ${s.name}.${n ? ` Their ${n} worker${n === 1 ? "" : "s"} joined.` : ""}` };
}

/**
 * Someone in the settlement removes a member, or a player leaves. Nobody can remove the founder;
 * the founder can leave only after making someone else the founder, unless nobody else is left,
 * in which case the settlement ends (its bell becomes an ordinary bell).
 * @param {Commander} by @param {Settlement} s @param {string} id
 */
export function removeMember(by, s, id) {
  if (!inIt(by, s) && by.id !== id) return { ok: false, message: `Only people in ${s.name} can remove members.` };
  const cur = getSettlements()[s.id];
  if (id === cur.ownerId) {
    if (by.id !== id) return { ok: false, message: `${cur.ownerName} founded ${cur.name} and can't be removed. Only they can make someone else the founder.` };
    if (cur.members.length) return { ok: false, message: `You're the founder: make someone else the founder first (Members), then leave.` };
    const all = getSettlements();
    delete all[cur.id];
    saveSettlements(all);
    return { ok: true, message: `You left ${cur.name}, and as nobody else was in it, it's gone. Its bell is an ordinary bell now; your workers are kept.` };
  }
  const m = cur.members.find((x) => x.id === id);
  if (!m) return { ok: false, message: "That player isn't a member." };
  cur.members = cur.members.filter((x) => x.id !== id);
  save(cur);
  return { ok: true, message: by.id === id ? `You left ${s.name}. The workers stay with the settlement.` : `${m.name} is no longer a member of ${s.name}. The workers stay with the settlement.` };
}

/** The founder (or an operator) hands the founder role to a member. @param {Commander} by @param {Settlement} s @param {string} id */
export function makeFounder(by, s, id) {
  const cur = getSettlements()[s.id];
  if (!(by.console || by.isOp || by.id === cur.ownerId)) return { ok: false, message: `Only the founder, ${cur.ownerName}, can make someone else the founder.` };
  const m = cur.members.find((x) => x.id === id);
  if (!m) return { ok: false, message: "That player isn't a member." };
  cur.members = [...cur.members.filter((x) => x.id !== id), { id: cur.ownerId, name: cur.ownerName }];
  const old = cur.ownerId;
  cur.ownerId = m.id;
  cur.ownerName = m.name;
  save(cur);
  transferWorkers(old, m);
  tell(onlinePlayer(m), `You're now the founder of ${cur.name}, and its workers are yours.`);
  return { ok: true, message: `${m.name} is now the founder of ${cur.name}. You're a member.` };
}

/** @param {Commander} by @param {Settlement} s @param {string} name */
export function renameSettlement(by, s, name) {
  if (!inIt(by, s)) return { ok: false, message: `Only people in ${s.name} can rename it.` };
  const n = cleanName(name);
  if (!n) return { ok: false, message: "Give it a name." };
  const cur = getSettlements()[s.id];
  cur.name = n;
  save(cur);
  return { ok: true, message: `The settlement is now called ${n}.` };
}

// ---------- the worker cap ----------
export function getCap() {
  const n = Number(world.getDynamicProperty("crew:cap"));
  return Number.isInteger(n) && n > 0 ? n : CAP_DEFAULT;
}
/** Operators only. @param {Commander} by @param {number} n */
export function setCap(by, n) {
  if (!by.isOp && !by.console) return { ok: false, message: "Only a server operator can change the worker limit." };
  const v = Math.floor(Number(n));
  if (!(v >= 1 && v <= 100)) return { ok: false, message: "The worker limit must be between 1 and 100." };
  world.setDynamicProperty("crew:cap", v);
  return { ok: true, message: `The worker limit is now ${v} for each person in a settlement, and ${v} for a player on their own. Workers already over it keep working.` };
}
/**
 * May this player build another worker? In a settlement the limit is the cap for each person in it,
 * counted over all the settlement's workers; otherwise it's the cap, over the player's own.
 * @param {string} playerId
 */
export function capCheck(playerId) {
  const s = settlementOf({ id: playerId, name: "" });
  if (s) {
    const have = workerCount(s.ownerId), cap = getCap() * peopleOf(s).length;
    return have < cap ? { ok: true, message: "" } : { ok: false, message: `${s.name} has ${have} workers, its limit is ${cap} (${getCap()} for each person in it). Dismiss one to build another (a server operator can change the limit).` };
  }
  const have = workerCount(playerId), cap = getCap();
  return have < cap ? { ok: true, message: "" } : { ok: false, message: `You have ${have} workers, your limit is ${cap}. Dismiss one to build another (a server operator can change the limit).` };
}

/** Who a worker this player builds belongs to: their settlement's founder, or themselves. @param {{id: string, name: string}} player */
export function ownerFor(player) {
  const s = settlementOf(player);
  return s ? { id: s.ownerId, name: s.ownerName } : { id: player.id, name: player.name };
}

/**
 * Hands every worker one player owns to another (registry now; loaded workers now, the rest when
 * they load, via syncOwners). Returns how many.
 * @param {string} fromId @param {{id?: string, name: string}} to
 */
export function transferWorkers(fromId, to) {
  if (!to.id || fromId === to.id) return workerCount(fromId);
  const reg = getRegistry();
  let n = 0;
  for (const r of Object.values(reg)) {
    if (r.ownerId !== fromId) continue;
    r.ownerId = to.id;
    r.ownerName = to.name;
    n++;
  }
  if (n) saveRegistry(reg);
  syncOwners();
  return n;
}

/**
 * Keeps ownership right: a worker the registry gives to a settlement member (built with /crew:hire,
 * or before they joined) goes to the founder, and a loaded worker whose saved owner differs from
 * the registry is updated (workers that were unloaded during a hand-over catch up here). A loaded
 * worker missing from the registry (forgotten while it was far away) is added back.
 */
export function syncOwners() {
  const reg = getRegistry();
  let changed = false;
  const known = new Set(Object.values(reg).map((r) => r.id));
  for (const d of DIMS) {
    let list = [];
    try {
      list = world.getDimension(d).getEntities({ type: "crew:worker" });
    } catch {
      continue;
    }
    for (const e of list) {
      if (known.has(e.id)) continue;
      const name = String(e.getDynamicProperty("crew:name") ?? "Worker");
      let key = name.toLowerCase(), n = 2;
      while (reg[key]) key = `${name} ${n++}`.toLowerCase();
      reg[key] = { name: key === name.toLowerCase() ? name : `${name} ${n - 1}`, id: e.id, ownerId: String(e.getDynamicProperty("crew:ownerId") ?? ""), ownerName: String(e.getDynamicProperty("crew:ownerName") ?? "") };
      if (reg[key].name !== name) e.setDynamicProperty("crew:name", reg[key].name);
      changed = true;
    }
  }
  for (const s of Object.values(getSettlements())) {
    const members = new Set(s.members.map((m) => m.id));
    for (const r of Object.values(reg)) {
      if (!members.has(r.ownerId)) continue;
      r.ownerId = s.ownerId;
      r.ownerName = s.ownerName;
      changed = true;
    }
  }
  if (changed) saveRegistry(reg);
  const byId = new Map(Object.values(reg).map((r) => [r.id, r]));
  for (const d of DIMS) {
    let list = [];
    try {
      list = world.getDimension(d).getEntities({ type: "crew:worker" });
    } catch {
      continue;
    }
    for (const e of list) {
      const r = byId.get(e.id);
      if (!r || e.getDynamicProperty("crew:ownerId") === r.ownerId) continue;
      e.setDynamicProperty("crew:ownerId", r.ownerId);
      e.setDynamicProperty("crew:ownerName", r.ownerName);
    }
  }
}

// ---------- the roster ----------
/** Every worker of the settlement's people, loaded or not, by name. @param {Settlement} s */
export function rosterOf(s) {
  const ids = new Set(peopleOf(s).map((p) => p.id));
  return Object.values(getRegistry()).filter((r) => ids.has(r.ownerId)).sort((a, b) => a.name.localeCompare(b.name));
}

/** @returns {Record<string, Seen>} */
export const getSeen = () => getJSON(world, "crew:seen", {});
/** Stores what loaded workers are doing (merged; workers no longer registered are dropped). @param {Record<string, Seen>} now */
export function saveSeen(now) {
  const known = new Set(Object.values(getRegistry()).map((r) => r.id));
  const all = { ...getSeen(), ...now };
  for (const id of Object.keys(all)) if (!known.has(id)) delete all[id];
  setJSON(world, "crew:seen", all);
}

const DIRS = ["S", "SW", "W", "NW", "N", "NE", "E", "SE"];
/** @param {{x:number,z:number}} from @param {{x:number,z:number}} to */
function compass(from, to) {
  const a = Math.atan2(-(to.x - from.x), to.z - from.z); // Minecraft: +z south, +x east
  return DIRS[((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8];
}

/**
 * The two roster lines for one worker, from what it last reported.
 * @param {{id: string, name: string}} entry  registry entry
 * @param {{viewer?: {dimension: {id: string}, location: {x:number,y:number,z:number}}, loadedIds: Set<string>, now: number}} ctx
 */
export function rosterLine(entry, ctx) {
  const seen = getSeen()[entry.id];
  if (!seen) return { title: entry.name, line: "Far away; not seen since this update" };
  const title = `${entry.name}, ${seen.role}`;
  const tools = seen.noTools ? " · §cOut of tools§r" : seen.low ? " · §eTools low§r" : "";
  if (!ctx.loadedIds.has(entry.id)) {
    if (seen.busy) return { title, line: `Paused: nobody nearby · ${seen.status}${tools}` };
    const mins = Math.max(0, Math.round((ctx.now - seen.ts) / 60000));
    return { title, line: `${seen.status}${tools} · last seen ${mins} min ago` };
  }
  let where = "";
  const v = ctx.viewer;
  if (v && v.dimension.id === seen.dim) {
    const d = Math.round(Math.hypot(seen.x - v.location.x, seen.z - v.location.z));
    where = d < 4 ? " · here" : ` · ${d} blocks ${compass(v.location, seen)}`;
    if (d > FAR && seen.ticking) return { title, line: `Working far away · ${seen.status}${tools}${where}` };
  } else {
    where = ` · in ${seen.dim.replace("minecraft:", "").replace("_", " ")}`;
    if (seen.ticking) return { title, line: `Working far away · ${seen.status}${tools}${where}` };
  }
  return { title, line: `${seen.status}${tools}${where}` };
}

/**
 * Bell menu, a worker that isn't loaded: take it off the list (it died, or was lost before deaths
 * were tracked), so it no longer counts toward the limit. If it's alive after all, it's added back
 * the next time its area loads (syncOwners).
 * @param {Commander} by @param {Settlement} s @param {string} workerId
 */
export function forgetMissing(by, s, workerId) {
  if (!inIt(by, s)) return { ok: false, message: `Only people in ${s.name} can do that.` };
  const reg = getRegistry();
  const key = Object.keys(reg).find((k) => reg[k].id === workerId);
  if (!key || !rosterOf(s).some((r) => r.id === workerId)) return { ok: false, message: "That worker isn't on the list." };
  const name = reg[key].name;
  delete reg[key];
  saveRegistry(reg);
  forgetWorker(workerId);
  return { ok: true, message: `${name} is off the list. If it's still out there, it comes back on the list next time its area loads.` };
}

/** A worker died: drop what the roster and the order queue kept for it. @param {string} workerId */
export function forgetWorker(workerId) {
  const seen = getSeen();
  if (seen[workerId]) {
    delete seen[workerId];
    setJSON(world, "crew:seen", seen);
  }
  takeQueued(workerId);
}

// ---------- storage chests and the ledger ----------
/** @param {{dim: string, x: number, y: number, z: number}} p */
const spotKey = (p) => `${p.dim}|${Math.floor(p.x)},${Math.floor(p.y)},${Math.floor(p.z)}`;
/** @param {string} key */
const stockProp = (key) => `crew:stock:${key}`;

/** "minecraft:iron_ingot" -> "Iron ingot". @param {string} id */
export function itemName(id) {
  const s = id.replace(/^minecraft:/, "").replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * The settlement's storage chests: chests added with the Survey Stake, its people's named places,
 * and its workers' home chests and last drop-off chests (from what they last reported).
 * @param {Settlement} s @returns {Spot[]}
 */
export function storageSpots(s) {
  /** @type {Map<string, Spot>} */
  const out = new Map();
  /** @param {ChestRef | undefined} p @param {string} label */
  const add = (p, label) => {
    if (!p?.dim) return;
    const k = spotKey(p);
    if (!out.has(k)) out.set(k, { dim: p.dim, x: Math.floor(p.x), y: Math.floor(p.y), z: Math.floor(p.z), label });
  };
  for (const st of s.storage ?? []) add(st, st.label);
  const ids = new Set(peopleOf(s).map((p) => p.id));
  const places = getPlaces();
  for (const pl of places) if (ids.has(pl.ownerId)) add(pl, pl.name);
  // a worker's home chest or drop-off that's another player's named place isn't the settlement's
  /** @type {Set<string>} */
  const others = new Set(places.filter((pl) => !ids.has(pl.ownerId)).map((pl) => spotKey(pl)));
  /** @param {ChestRef | undefined} p @param {string} label */
  const addOwn = (p, label) => {
    if (p?.dim && !others.has(spotKey(p))) add(p, label);
  };
  const seen = getSeen();
  for (const r of rosterOf(s)) {
    const sn = seen[r.id];
    addOwn(sn?.home, `${r.name}'s home chest`);
    addOwn(sn?.drop, sn?.drop?.label ?? `${r.name}'s drop-off`);
  }
  return [...out.values()].sort((a, b) => spotKey(a).localeCompare(spotKey(b)));
}

/** Adds a chest or barrel to the settlement's storage (Survey Stake). @param {Commander} by @param {Settlement} s @param {BlockLike} block */
export function addStorage(by, s, block) {
  if (!inIt(by, s)) return { ok: false, message: `Only people in ${s.name} can add storage.` };
  const cur = getSettlements()[s.id];
  const p = { dim: block.dimension.id, x: Math.floor(block.location.x), y: Math.floor(block.location.y), z: Math.floor(block.location.z) };
  if (storageSpots(cur).some((x) => spotKey(x) === spotKey(p))) return { ok: false, message: `That's already one of ${cur.name}'s storage chests.` };
  const label = `${itemName(block.typeId)} at ${p.x} ${p.y} ${p.z}`;
  (cur.storage ??= []).push({ ...p, label });
  save(cur);
  refreshStorage(cur, spotKey(p));
  return { ok: true, message: `Added to ${cur.name}'s storage. Its contents now count in the settlement's totals.` };
}

/** Removes a chest added with the stake. @param {Commander} by @param {Settlement} s @param {BlockLike} block */
export function removeStorage(by, s, block) {
  if (!inIt(by, s)) return { ok: false, message: `Only people in ${s.name} can change its storage.` };
  const cur = getSettlements()[s.id];
  const k = spotKey({ dim: block.dimension.id, ...block.location });
  const before = (cur.storage ?? []).length;
  cur.storage = (cur.storage ?? []).filter((x) => spotKey(x) !== k);
  if (cur.storage.length === before) return { ok: false, message: "Only chests added with the Survey Stake can be removed (home chests, drop-offs and named places always count)." };
  save(cur);
  return { ok: true, message: `Removed from ${cur.name}'s storage.` };
}

/** Is this chest one of the settlement's storage chests? @param {Settlement} s @param {BlockLike} block */
export const isStorage = (s, block) => storageSpots(s).some((x) => spotKey(x) === spotKey({ dim: block.dimension.id, ...block.location }));

/**
 * Reads a chest's contents; undefined if its area isn't loaded. `slots` is a fingerprint of every
 * slot, used to recognise the two halves of one double chest.
 * @param {Spot} sp
 */
function readChest(sp) {
  let block;
  try {
    block = world.getDimension(sp.dim).getBlock(sp);
  } catch {
    return undefined;
  }
  if (!block) return undefined;
  const c = block.getComponent("minecraft:inventory")?.container;
  if (!c) return { gone: true, size: 0, items: {}, slots: "", chest: false, c: undefined };
  /** @type {Record<string, number>} */
  const items = {};
  /** @type {string[]} */
  const slots = [];
  for (let i = 0; i < c.size; i++) {
    const it = c.getItem(i);
    slots.push(it ? `${it.typeId}*${it.amount}` : "");
    if (it) items[it.typeId] = (items[it.typeId] ?? 0) + it.amount; // a shulker box counts as one item
  }
  return { gone: false, size: c.size, items, slots: slots.join("|"), chest: /chest/.test(block.typeId), c };
}

/**
 * Do these two containers share their slots (the halves of one double chest)? Their contents
 * already match slot for slot. Puts a stick in a slot that's empty in both, looks at the other,
 * and empties the slot again, in the same tick. With no empty slot, it takes one item off a plain
 * stack instead (no name, lore or enchantments) and puts it back. Shulker boxes, tools, books and
 * other items with data are never touched: if that's all there is, the two count as separate.
 * @param {import("@minecraft/server").Container} a @param {import("@minecraft/server").Container} b
 */
function sharesSlots(a, b) {
  for (let i = 0; i < a.size; i++) {
    if (a.getItem(i) || b.getItem(i)) continue;
    try {
      a.setItem(i, new ItemStack("minecraft:stick", 1));
      return b.getItem(i)?.typeId === "minecraft:stick";
    } finally {
      a.setItem(i, undefined);
    }
  }
  for (let i = 0; i < a.size; i++) {
    const it = a.getItem(i);
    if (!it || it.maxAmount <= 1 || it.amount < 2 || it.nameTag || it.getLore?.().length || /shulker|book|banner|firework/.test(it.typeId)) continue;
    const n = it.amount;
    try {
      it.amount = n - 1;
      a.setItem(i, it);
      return b.getItem(i)?.amount === n - 1;
    } finally {
      it.amount = n;
      a.setItem(i, it);
    }
  }
  return false;
}

/**
 * Are these two reads the two halves of one double chest? Both are chests with the same 54 slots,
 * slot for slot, and a change to one shows in the other (two separate double chests side by side
 * holding the same things don't).
 * @param {ReturnType<typeof readChest>} a @param {ReturnType<typeof readChest>} b
 */
const sameDouble = (a, b) => !!a?.c && !!b?.c && a.chest && b.chest && a.size > 27 && a.size === b.size && a.slots === b.slots && sharesSlots(a.c, b.c);

/**
 * Re-reads the settlement's loaded storage chests (or just one, by key). A chest whose area isn't
 * loaded keeps its last contents and time. Both halves of a double chest open the same 54 slots,
 * so the second half is marked as a duplicate and not counted twice.
 * @param {Settlement} s @param {string} [onlyKey]
 */
export function refreshStorage(s, onlyKey) {
  const spots = storageSpots(s);
  const keys = new Set(spots.map(spotKey));
  /** @type {Set<string>} */
  const dup = new Set();
  const now = Date.now();
  const byKey = new Map(spots.map((sp) => [spotKey(sp), sp]));
  for (const sp of spots) {
    const k = spotKey(sp);
    if (onlyKey && k !== onlyKey) continue;
    if (dup.has(k)) {
      setJSON(world, stockProp(k), { ts: now, dup: true });
      continue;
    }
    const r = readChest(sp);
    if (!r) continue; // not loaded: keep what we knew
    // the other half of a double chest that's also storage: count it once (under the smaller key)
    let isDup = false;
    if (r.size > 27 && r.chest) {
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nk = spotKey({ dim: sp.dim, x: sp.x + dx, y: sp.y, z: sp.z + dz });
        const nsp = byKey.get(nk);
        if (!nsp || !keys.has(nk) || !sameDouble(r, readChest(nsp))) continue;
        if (nk > k) dup.add(nk);
        else isDup = true;
      }
    }
    setJSON(world, stockProp(k), isDup ? { ts: now, dup: true } : r.gone ? { ts: now, gone: true } : { ts: now, items: r.items });
  }
}

/**
 * Drops saved chest contents no settlement counts any more (a chest removed from storage, a
 * settlement that ended, a worker that moved home).
 */
export function pruneStock() {
  /** @type {Set<string>} */
  const live = new Set();
  for (const s of Object.values(getSettlements())) for (const sp of storageSpots(s)) live.add(stockProp(spotKey(sp)));
  for (const id of world.getDynamicPropertyIds()) if (id.startsWith("crew:stock:") && !live.has(id)) world.setDynamicProperty(id, undefined);
}

/** A worker just put something in or took something out of this chest. @param {string} dimId @param {{x:number,y:number,z:number}} loc */
export function noteChestUse(dimId, loc) {
  const k = spotKey({ dim: dimId, ...loc });
  for (const s of Object.values(getSettlements())) if (storageSpots(s).some((x) => spotKey(x) === k)) refreshStorage(s, k);
}

/**
 * The settlement's stock: totals per item across its storage chests (most first), and each chest
 * with what it held when last read.
 * @param {Settlement} s
 */
export function ledger(s) {
  /** @type {Record<string, number>} */
  const totals = {};
  const chests = storageSpots(s).map((sp) => {
    /** @type {Stock | undefined} */
    const st = getJSON(world, stockProp(spotKey(sp)), undefined);
    if (st?.items && !st.dup) for (const [id, n] of Object.entries(st.items)) totals[id] = (totals[id] ?? 0) + n;
    return { ...sp, ts: st?.ts, items: st?.dup ? undefined : st?.items, dup: !!st?.dup, gone: !!st?.gone };
  });
  return { totals: Object.entries(totals).map(([id, n]) => ({ id, n })).sort((a, b) => b.n - a.n || a.id.localeCompare(b.id)), chests };
}

/** Which storage chests hold this item, and how many each. @param {Settlement} s @param {string} id */
export function whereIs(s, id) {
  return ledger(s).chests.filter((c) => c.items?.[id]).map((c) => ({ label: c.label, n: /** @type {Record<string, number>} */ (c.items)[id], ts: c.ts })).sort((a, b) => b.n - a.n);
}

// ---------- orders waiting for an unloaded worker ----------
/** @param {string} workerId @param {Commander} by @param {any} order */
export function queueOrder(workerId, by, order) {
  const all = getJSON(world, "crew:queue", {});
  (all[workerId] ??= []).push({ by: { id: by.id, name: by.name, isOp: !!by.isOp }, order });
  setJSON(world, "crew:queue", all);
  return { ok: true, message: `${order.worker} is far away: it will do that as soon as its area is loaded again.` };
}
/** Removes and returns a worker's waiting orders. @param {string} workerId @returns {Queued[]} */
export function takeQueued(workerId) {
  const all = getJSON(world, "crew:queue", {});
  const list = all[workerId] ?? [];
  if (!list.length) return [];
  delete all[workerId];
  setJSON(world, "crew:queue", all);
  return list;
}

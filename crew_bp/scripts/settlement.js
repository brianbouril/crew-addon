// Settlements (specs/settlement-layer.md): a player founds one at a bell they placed; every worker
// the owner and its members build belongs to it. This module holds the saved data and the rules;
// the menus are in ui.js and the event wiring in main.js. It imports only store.js and util.js,
// so workers.js can use it without an import cycle.
//
// Saved (world dynamic properties, JSON):
//   crew:settlements  {[ownerId]: Settlement}
//   crew:bells        {"dim|x,y,z": placerId}  bells players placed (only those can found one)
//   crew:seen         {[workerId]: Seen}       what each worker was last doing (for the roster)
//   crew:queue        {[workerId]: Queued[]}   orders waiting for an unloaded worker
//   crew:cap          number                   workers per player (operator setting)
// Membership isn't stored on workers: a worker belongs to its owner's settlement.
// Everyone in a settlement has the same rights (Brian, Nov 17), except that only the founder
// (ownerId/ownerName) can hand that role to someone else, and nobody can remove the founder.
import { ItemStack, world } from "@minecraft/server";
import { getJSON, setJSON, onlinePlayer, tell } from "./util.js";
import { getRegistry } from "./store.js";

/**
 * @typedef {import("./store.js").Commander} Commander
 * @typedef {{id?: string, name: string}} PersonRef
 * @typedef {{dim: string, x: number, y: number, z: number, att: string, dir?: number}} BellSpot
 * @typedef {{id: string, name: string, ownerId: string, ownerName: string, members: {id: string, name: string}[], bell: BellSpot | null}} Settlement
 * @typedef {{role: string, status: string, busy: boolean, noTools: boolean, low: boolean, ticking: boolean, dim: string, x: number, y: number, z: number, ts: number}} Seen
 * @typedef {{by: Commander, order: any}} Queued
 * @typedef {{dimension: {id: string}, location: {x:number,y:number,z:number}, typeId: string, permutation?: any}} BlockLike
 */

export const BELL = "minecraft:bell";
export const CAP_DEFAULT = 6;
/** A worker further than this from the viewer counts as far away in the roster. */
const FAR = 96;
/** How many player-placed bells are remembered (oldest forgotten first). */
const MAX_BELLS = 1000;

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
 * placed it), member (they belong to someone else's settlement).
 * @param {PersonRef} player @param {BlockLike} block
 * @returns {{kind: "found"|"move"|"rehang"|"menu"|"other"|"village"|"not_yours"|"member", s?: Settlement}}
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
  const n = workerCount(who.id);
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
  return { ok: true, message: by.id === id ? `You left ${s.name}. Your workers left with you.` : `${m.name} is no longer a member of ${s.name}. Their workers left with them.` };
}

/** The founder (or an operator) hands the founder role to a member. @param {Commander} by @param {Settlement} s @param {string} id */
export function makeFounder(by, s, id) {
  const cur = getSettlements()[s.id];
  if (!(by.console || by.isOp || by.id === cur.ownerId)) return { ok: false, message: `Only the founder, ${cur.ownerName}, can make someone else the founder.` };
  const m = cur.members.find((x) => x.id === id);
  if (!m) return { ok: false, message: "That player isn't a member." };
  cur.members = [...cur.members.filter((x) => x.id !== id), { id: cur.ownerId, name: cur.ownerName }];
  cur.ownerId = m.id;
  cur.ownerName = m.name;
  save(cur);
  tell(onlinePlayer(m), `You're now the founder of ${cur.name}.`);
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
  return { ok: true, message: `Each player may now have up to ${v} worker${v === 1 ? "" : "s"}. Workers already over the limit keep working.` };
}
/** May this player build another worker? @param {string} ownerId */
export function capCheck(ownerId) {
  const have = workerCount(ownerId), cap = getCap();
  return have < cap ? { ok: true, message: "" } : { ok: false, message: `You have ${have} workers, your limit is ${cap}. Dismiss one to build another (a server operator can change the limit).` };
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

/** A worker died: drop what the roster and the order queue kept for it. @param {string} workerId */
export function forgetWorker(workerId) {
  const seen = getSeen();
  if (seen[workerId]) {
    delete seen[workerId];
    setJSON(world, "crew:seen", seen);
  }
  takeQueued(workerId);
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

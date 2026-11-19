// The Hauler (specs/hauler.md): a worker built from a bundle and leather boots that carries what the
// settlement's diggers drop off to the depot, a marked area where it sets up chests and sorts
// everything into them. It never digs. Three rounds a day on a fixed route (plus an extra trip when a
// drop-off chest is nearly full), tidying the depot in between; it sleeps and tires like the others.
//
// The engine (runner.js) owns walking and the job lifecycle; it calls stepHaul for the Hauler's job
// types and haulerIdle once a second for an idle Hauler, passing its helpers in (no import cycle).
//
// Saved: on the settlement, the depot (settlement.js setDepot/saveDepotUnits); on the Hauler,
// crew:pickups (stake pickup points), crew:rounds (rounds done today), crew:haulOff (stopped by a
// player: no rounds by itself until Continue), and the round itself in crew:job / crew:state.
import { world } from "@minecraft/server";
import { CARGO_END, HAUL_SLOTS, KIT_SLOTS, SUPPLY_FIRST, isGear, isHaulerBuild, stash, toolInfo } from "./tools.js";
import { DAWN, DRAIN_PER_BLOCK, DUSK, EXHAUSTED, FOOD, TIRED, eatOne, energy, isNight, setEnergy } from "./life.js";
import { dist, floorV, fmt, getJSON, onlinePlayer, setJSON, tell } from "./util.js";
import { emit, meta, roleOf } from "./workers.js";
import { getPlaces } from "./store.js";
import { addStorage, getSeen, getSettlements, isDepotChest, isStorage, noteChestUse, peopleOf, rosterOf, saveDepotUnits, setDepot, settlementOf, stockAt, storageSpots } from "./settlement.js";
import { AIR, LIGHT, passable } from "./blocks.js";

export { CARGO_END, HAUL_SLOTS, SUPPLY_FIRST, isGear, isHaulerBuild };
export const CARGO_FIRST = KIT_SLOTS;
export const CHEST = "minecraft:chest";
/** A drop-off chest this full (share of its slots) gets an extra trip. */
export const FULL_AT = 0.75;
/** Round windows (time of day). Morning starts when it gets up at dawn. */
export const ROUNDS = [
  { slot: "morning", from: 0, to: 6000 },
  { slot: "midday", from: 6000, to: 9000 },
  { slot: "evening", from: 9000, to: DUSK },
];
export const DEPOT_MIN = 3, DEPOT_MAX = 32;
export const DEPOT_DEFAULT = { width: 5, length: 7 }; // holds 16 chests
const RETRY_AREA = 1200; // a minute
const RETRY_FULL = 100; // ticks (5 s) between checks for room while the depot is full
const SLOW_LOADED = 1.3; // walks this much slower with all 18 slots full
/** Seconds it stays put after a player called it somewhere (Come here, Go home, Drop off), before going back to its rounds. */
export const HOLD_AFTER_ORDER = 60;

/**
 * @typedef {import("@minecraft/server").Entity} Entity
 * @typedef {import("@minecraft/server").Container} Container
 * @typedef {{x:number,y:number,z:number}} V3
 * @typedef {{dim: string, x: number, y: number, z: number, label: string}} Spot
 * @typedef {import("./settlement.js").Depot} Depot
 * @typedef {import("./settlement.js").DepotUnit} DepotUnit
 * @typedef {{walkTo: (rt: any, goal: V3, reach: number, beside?: boolean, noShortcut?: boolean) => "moving"|"arrived"|"failed", stopJob: (e: Entity, why: string | undefined, done?: boolean) => void, startRest: (e: Entity, reason: "night"|"tired") => void, startJob: (e: Entity, job: any) => void, resumeJob: (e: Entity) => any}} Ctx
 */

const testFast = () => /** @type {any} */ (globalThis).crewTestFast === true;
/** @param {number} n ticks at real pace */
const pace = (n) => (testFast() ? Math.max(1, Math.round(n / 5)) : n);
/** Ticks it stands at a chest to load or unload this many stacks: about half a second a stack. @param {number} stacks */
export const loadTicks = (stacks) => pace(10 + 10 * Math.max(0, stacks));
/** Energy per block walked: half a digger's rate per block dug, up to half again when fully loaded. @param {number} fill 0..1 */
export const drainPerBlock = (fill) => DRAIN_PER_BLOCK * 0.5 * (1 + 0.5 * Math.max(0, Math.min(1, fill)));

export const isHauler = (/** @type {Entity} */ e) => roleOf(e) === "Hauler";
export const HAUL_JOBS = ["round", "haul", "tidy"];
export const isHaulJob = (/** @type {any} */ job) => HAUL_JOBS.includes(job?.type);

/**
 * Does this slot hold something the worker keeps (never dropped off, never handed over as cargo)?
 * A Hauler keeps its gear (slots 0-4) and supplies (slot 23 on: food and chests for the depot).
 * @param {Entity} e @param {number} slot @param {import("@minecraft/server").ItemStack} item
 */
export function keepsItem(e, slot, item) {
  if (slot < KIT_SLOTS && (toolInfo(item) || isGear(item.typeId))) return true;
  if (slot >= SUPPLY_FIRST && isHauler(e) && (item.typeId === CHEST || item.typeId in FOOD)) return true;
  return false;
}

// ---------- item groups ----------
const ORES = /(_ore$|^minecraft:raw_|_ingot$|_nugget$|^minecraft:(coal|charcoal|diamond|emerald|lapis_lazuli|redstone|quartz|amethyst_shard|netherite_scrap|ancient_debris|flint|glowstone_dust)$|^minecraft:(iron|gold|copper|diamond|emerald|lapis|redstone|coal|netherite|raw_iron|raw_gold|raw_copper)_block$)/;
const WOOD = /(_log$|_wood$|_planks$|_stem$|_hyphae$|_sapling$|^minecraft:(stick|bamboo|bamboo_block|ladder)$)/;
const STONE = /(stone|cobble|deepslate|^minecraft:(dirt|coarse_dirt|rooted_dirt|podzol|mycelium|grass_block|gravel|sand|red_sand|tuff|andesite|diorite|granite|netherrack|basalt|calcite|clay|clay_ball|mud|dripstone_block|end_stone|soul_sand|soul_soil|obsidian)$|terracotta$)/;
const RAW_FOOD = /^minecraft:(beef|porkchop|mutton|chicken|rabbit|cod|salmon|potato|beetroot|wheat|egg|sugar|pumpkin|melon)$/;
/**
 * The depot group an item kind is sorted into. @param {string} id
 * @returns {"stone"|"ores"|"wood"|"food"|"other"}
 */
export function groupOf(id) {
  if (/_(pickaxe|shovel|axe|hoe|sword)$|shulker_box/.test(id)) return "other";
  if (id in FOOD || RAW_FOOD.test(id)) return "food";
  if (ORES.test(id)) return "ores";
  if (WOOD.test(id)) return "wood";
  if (STONE.test(id) && !/(redstone|glowstone|lodestone)/.test(id)) return "stone";
  return "other";
}
const GROUP_WORDS = { stone: "stone and dirt", ores: "ores and metals", wood: "wood", food: "food", other: "other things" };

// ---------- the depot area ----------
/**
 * Where chests go and where it walks. Rows of chests run along the longer side, two rows back to
 * back between walkways (every chest touches one), with an aisle down the first column linking
 * the walkways. A 5 by 7 area holds 16 chests.
 * @param {{x0: number, z0: number, x1: number, z1: number, y: number}} d
 * @returns {{chestCells: V3[], walkCells: V3[], slots: V3[][]}}  slots: places for one unit (a double chest, or one at a row's end)
 */
export function depotLayout(d) {
  const sx = d.x1 - d.x0 + 1, sz = d.z1 - d.z0 + 1;
  const longX = sx > sz;
  // rows of chests run across the short side; down the long side they go walkway, chests, chests, walkway...
  const L = Math.max(sx, sz), W = Math.min(sx, sz);
  /** @param {number} k row (counted along the long side) @param {number} i column (along the short side; 0 is the aisle) */
  const cell = (k, i) => (longX ? { x: d.x0 + k, y: d.y, z: d.z0 + i } : { x: d.x0 + i, y: d.y, z: d.z0 + k });
  /** @type {V3[]} */
  const chestCells = [], walkCells = [];
  /** @type {V3[][]} */
  const slots = [];
  for (let k = 0; k < L; k++) {
    const m = k % 3;
    const chestRow = W >= 2 && (m === 1 || (m === 2 && k + 1 < L));
    for (let i = 0; i < W; i++) (chestRow && i > 0 ? chestCells : walkCells).push(cell(k, i));
    if (chestRow) for (let i = 1; i < W; i += 2) slots.push(i + 1 < W ? [cell(k, i), cell(k, i + 1)] : [cell(k, i)]);
  }
  return { chestCells, walkCells, slots };
}
/** How many chests the depot holds (16 for the default size, more for a bigger area). @param {Depot} d */
export const chestLimit = (d) => depotLayout(d).chestCells.length;
/** Chests placed so far. @param {Depot} d */
export const chestsPlaced = (d) => d.units.reduce((n, u) => n + u.cells.length, 0);
/** Where it stands in the depot when it gets there (the aisle's first cell). @param {Depot} d */
export const depotEntry = (d) => depotLayout(d).walkCells[0];
/** Is this spot in (or right next to) the depot area? @param {Depot} d @param {V3} p */
const nearDepot = (d, p) => p.x >= d.x0 - 2 && p.x <= d.x1 + 2 && p.z >= d.z0 - 2 && p.z <= d.z1 + 2 && Math.abs(p.y - d.y) <= 3;

/**
 * Marks the settlement's depot: a flat floor with two blocks of room over every cell. `from`/`to`
 * are opposite corners of the floor (the ground blocks tapped); chests stand one block above.
 * @param {import("./store.js").Commander} by @param {import("./settlement.js").Settlement} s
 * @param {{dim: string, from: V3, to: V3}} area
 */
export function markDepot(by, s, area) {
  const x0 = Math.min(area.from.x, area.to.x), x1 = Math.max(area.from.x, area.to.x);
  const z0 = Math.min(area.from.z, area.to.z), z1 = Math.max(area.from.z, area.to.z);
  const floor = Math.floor(Math.min(area.from.y, area.to.y));
  const w = x1 - x0 + 1, l = z1 - z0 + 1;
  if (Math.min(w, l) < DEPOT_MIN) return { ok: false, message: `A depot needs to be at least ${DEPOT_MIN} by ${DEPOT_MIN} blocks.` };
  if (Math.max(w, l) > DEPOT_MAX) return { ok: false, message: `A depot can be at most ${DEPOT_MAX} blocks on a side.` };
  if (Math.max(area.from.y, area.to.y) !== floor) return { ok: false, message: "A depot needs a flat floor: pick two corners at the same height." };
  const dim = world.getDimension(area.dim);
  const keep = new Set((s.depot?.dim === area.dim && s.depot.y === floor + 1 ? s.depot.units : []).flatMap((u) => u.cells.map((c) => `${c.x},${c.z}`)));
  for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
    let below, room;
    try {
      below = dim.getBlock({ x, y: floor, z });
      // real air (or a light block): never a torch, carpet, rail, door or water it would have to remove
      room = openAir(dim, { x, y: floor + 1, z }) && openAir(dim, { x, y: floor + 2, z });
    } catch {
      return { ok: false, message: "Part of that area isn't loaded. Go closer and try again." };
    }
    if (!below) return { ok: false, message: "Part of that area isn't loaded. Go closer and try again." };
    if (keep.has(`${x},${z}`)) continue; // one of its chests
    if (passable(dim, { x, y: floor, z })) return { ok: false, message: `The depot needs a solid floor everywhere: there's a hole at ${x} ${floor} ${z}.` };
    if (!room) return { ok: false, message: `The depot needs 2 blocks of room over its whole floor: something is in the way at ${x} ${floor + 1} ${z}.` };
  }
  const d = { dim: area.dim, x0, z0, x1, z1, y: floor + 1 };
  const r = setDepot(by, s, d);
  if (!r.ok) return r;
  // chests kept from the old area that now stand on a walkway of the new layout are let go (left as ordinary chests)
  const cur = getSettlements()[s.id]?.depot;
  if (cur) {
    const cells = new Set(depotLayout(cur).chestCells.map((c) => `${c.x},${c.z}`));
    const units = cur.units.map((u) => ({ ...u, cells: u.cells.filter((c) => cells.has(`${c.x},${c.z}`)) })).filter((u) => u.cells.length);
    if (units.length !== cur.units.length || units.some((u, i) => u.cells.length !== cur.units[i].cells.length)) saveDepotUnits(s.id, units);
  }
  return { ok: true, message: `${r.message} It holds up to ${chestLimit({ ...d, units: [] })} chests; a Hauler sets them up as it needs them.` };
}

// ---------- containers ----------
/** @param {string} dimId @param {V3} p @returns {Container | undefined} */
function containerAt(dimId, p) {
  try {
    return world.getDimension(dimId).getBlock(p)?.getComponent("minecraft:inventory")?.container;
  } catch {
    return undefined;
  }
}
/** Can this container take any of this item? @param {Container} c @param {import("@minecraft/server").ItemStack} item */
function hasRoom(c, item) {
  for (let i = 0; i < c.size; i++) {
    const s = c.getItem(i);
    if (!s) return true;
    if (s.isStackableWith(item) && s.amount < s.maxAmount) return true;
  }
  return false;
}
/** @param {Entity} e */
const invOf = (e) => /** @type {Container} */ (e.getComponent("minecraft:inventory")?.container);
/** Cargo stacks (slot and item), in slot order. @param {Container} inv */
function cargo(inv) {
  /** @type {{slot: number, item: import("@minecraft/server").ItemStack}[]} */
  const out = [];
  for (let i = KIT_SLOTS; i < Math.min(CARGO_END, inv.size); i++) {
    const it = inv.getItem(i);
    if (it) out.push({ slot: i, item: it });
  }
  return out;
}
/** Cargo slots in use (0..18). @param {Entity} e */
export const cargoUsed = (e) => {
  const inv = invOf(e);
  return inv ? cargo(inv).length : 0;
};
/** Adds to the cargo slots (5-22) only. Returns what didn't fit. @param {Container} inv @param {import("@minecraft/server").ItemStack} item */
const toCargo = (inv, item) => stash(inv, item, KIT_SLOTS, CARGO_END);
/**
 * Hands chest items to it (a player's tap with chests in hand): kept as supplies for the depot.
 * @param {Entity} e @param {import("@minecraft/server").ItemStack} item @returns {import("@minecraft/server").ItemStack | undefined} what didn't fit
 */
export function takeChests(e, item) {
  const inv = invOf(e);
  if (!inv || item.typeId !== CHEST) return item;
  return stash(inv, item, SUPPLY_FIRST, inv.size);
}
/** Chest items it carries as supplies. @param {Container} inv */
function chestSupply(inv) {
  let n = 0;
  for (let i = SUPPLY_FIRST; i < inv.size; i++) {
    const it = inv.getItem(i);
    if (it?.typeId === CHEST) n += it.amount;
  }
  return n;
}
/** @param {Container} inv */
function useChest(inv) {
  for (let i = inv.size - 1; i >= SUPPLY_FIRST; i--) {
    const it = inv.getItem(i);
    if (it?.typeId !== CHEST) continue;
    if (it.amount > 1) {
      it.amount--;
      inv.setItem(i, it);
    } else inv.setItem(i, undefined);
    return true;
  }
  return false;
}

// ---------- pickups and the route ----------
/** @param {{dim: string, x: number, y: number, z: number}} p */
export const keyOf = (p) => `${p.dim}|${Math.floor(p.x)},${Math.floor(p.y)},${Math.floor(p.z)}`;
/** The Hauler's settlement (its owner's). @param {Entity} e */
export const settlementFor = (e) => {
  const m = meta(e);
  return settlementOf({ id: m.ownerId, name: m.ownerName });
};
/** Every worker's home chest ("dim|x,y,z"): the Hauler never touches them. */
function homeChestKeys() {
  /** @type {Set<string>} */
  const out = new Set();
  for (const sn of Object.values(getSeen())) if (sn.home?.dim) out.add(keyOf(sn.home));
  return out;
}
/** Is this chest some worker's home chest? @param {{dim: string, x: number, y: number, z: number}} p */
export const isHomeChest = (p) => homeChestKeys().has(keyOf(p));

/**
 * The chests it collects from: its settlement's Diggers' and Miners' drop-off chests and the
 * pickup points marked with the stake. Never a home chest, a depot chest or another player's place.
 * @param {Entity} e @returns {Spot[]}
 */
export function pickupSpots(e) {
  const s = settlementFor(e);
  if (!s) return [];
  const homes = homeChestKeys();
  const people = new Set(peopleOf(s).map((p) => p.id));
  const others = new Set(getPlaces().filter((pl) => !people.has(pl.ownerId)).map((pl) => keyOf(pl)));
  const dim = s.depot?.dim ?? e.dimension.id;
  /** @type {Map<string, Spot>} */
  const out = new Map();
  /** @param {any} p @param {string} label */
  const add = (p, label) => {
    if (!p?.dim || p.dim !== dim) return;
    const k = keyOf(p);
    if (out.has(k) || homes.has(k) || others.has(k) || isDepotChest(s, p)) return;
    out.set(k, { dim: p.dim, x: Math.floor(p.x), y: Math.floor(p.y), z: Math.floor(p.z), label });
  };
  const seen = getSeen();
  for (const r of rosterOf(s)) {
    const sn = seen[r.id];
    if (sn && (sn.role === "Digger" || sn.role === "Miner") && sn.drop) add(sn.drop, sn.drop.label ?? `${r.name}'s drop-off`);
  }
  for (const p of getJSON(e, "crew:pickups", [])) add(p, p.label ?? `the pickup at ${fmt(p)}`);
  return [...out.values()];
}

/**
 * Stake, chest tap "Hauler pickup": the Hauler collects from this chest on its rounds. It becomes
 * one of the settlement's storage chests too (it's the settlement's).
 * @param {import("./store.js").Commander} by @param {Entity} e @param {{typeId: string, dimension: {id: string}, location: V3}} block
 */
export function addPickup(by, e, block) {
  const s = settlementFor(e);
  const name = meta(e).name;
  if (!s) return { ok: false, message: `${name} isn't in a settlement, so it has no rounds. Found one at a bell first.` };
  if (!(by.console || by.isOp || peopleOf(s).some((x) => x.id === by.id))) return { ok: false, message: `Only people in ${s.name} can add pickup points.` };
  const p = { dim: block.dimension.id, x: Math.floor(block.location.x), y: Math.floor(block.location.y), z: Math.floor(block.location.z) };
  if (isDepotChest(s, p)) return { ok: false, message: "That's one of the depot's chests." };
  if (othersChest(s, p)) return { ok: false, message: "That chest belongs to another settlement." };
  if (isHomeChest(p)) return { ok: false, message: "That's a worker's home chest: Haulers leave home chests alone." };
  const people = new Set(peopleOf(s).map((x) => x.id));
  if (getPlaces().some((pl) => !people.has(pl.ownerId) && keyOf(pl) === keyOf(p))) return { ok: false, message: "That chest is another player's place, not the settlement's." };
  const list = getJSON(e, "crew:pickups", []);
  if (list.some((/** @type {any} */ x) => keyOf(x) === keyOf(p))) return { ok: false, message: `${name} already collects from that chest.` };
  if (!isStorage(s, /** @type {any} */ (block))) addStorage(by, s, /** @type {any} */ (block));
  list.push({ ...p, label: `the pickup at ${fmt(p)}` });
  setJSON(e, "crew:pickups", list);
  return { ok: true, message: `${name} will collect from the ${block.typeId.replace("minecraft:", "").replace(/_/g, " ")} at ${fmt(p)} on its rounds (${list.length} pickup point${list.length === 1 ? "" : "s"}).` };
}
/** @param {Entity} e @param {V3 & {dim: string}} p */
export function removePickup(e, p) {
  const list = getJSON(e, "crew:pickups", []);
  const left = list.filter((/** @type {any} */ x) => keyOf(x) !== keyOf(p));
  if (left.length === list.length) return { ok: false, message: "That isn't one of its pickup points." };
  setJSON(e, "crew:pickups", left);
  return { ok: true, message: `${meta(e).name} no longer collects from there.` };
}
/**
 * Is this chest one the Hauler may take from or fill: one of its settlement's storage chests (stake
 * storage, its people's named places, its workers' drop-offs, the depot) or one of its pickups?
 * Never a home chest (checked separately) and never another settlement's chest.
 * @param {Entity} e @param {{dim: string, x: number, y: number, z: number}} p
 */
export function isSettlementChest(e, p) {
  const s = settlementFor(e);
  if (!s) return false;
  const k = keyOf(p);
  return storageSpots(s).some((sp) => keyOf(sp) === k) || pickupSpots(e).some((sp) => keyOf(sp) === k);
}
/** Another settlement's storage or depot chest? @param {import("./settlement.js").Settlement} s @param {{dim: string, x: number, y: number, z: number}} p */
const othersChest = (s, p) => Object.values(getSettlements()).some((o) => o.id !== s.id && storageSpots(o).some((sp) => keyOf(sp) === keyOf(p)));

/** Is this chest one of its stake pickup points? @param {Entity} e @param {V3 & {dim: string}} p */
export const isPickup = (e, p) => getJSON(e, "crew:pickups", []).some((/** @type {any} */ x) => keyOf(x) === keyOf(p));

/**
 * The round's route: nearest pickup to the depot first, then the nearest to that one, and so on
 * (ties by position), so the same chests give the same loop every time.
 * @param {Entity} e @param {Spot[]} [spots]
 */
export function routeFor(e, spots = pickupSpots(e)) {
  const d = settlementFor(e)?.depot;
  let at = d ? depotEntry(d) : floorV(e.location);
  const left = [...spots].sort((a, b) => keyOf(a).localeCompare(keyOf(b)));
  /** @type {Spot[]} */
  const out = [];
  while (left.length) {
    let bi = 0;
    for (let i = 1; i < left.length; i++) if (dist(left[i], at) < dist(left[bi], at) - 1e-9) bi = i;
    const [next] = left.splice(bi, 1);
    out.push(next);
    at = next;
  }
  return out;
}

// ---------- the schedule ----------
/** Which round's window it is now (undefined at night). */
export function roundWindow() {
  if (isNight()) return undefined;
  const t = world.getTimeOfDay();
  if (t >= DAWN) return "morning";
  return ROUNDS.find((r) => t >= r.from && t < r.to)?.slot;
}
/** The round due now, if it hasn't done it today. @param {Entity} e */
export function dueRound(e) {
  const slot = roundWindow();
  if (!slot) return undefined;
  return roundsDone(e).includes(slot) ? undefined : slot;
}
/** The day number (rounds done are kept per day, so a night spent far from players still starts a new day). */
function today() {
  try {
    return world.getDay();
  } catch {
    return 0;
  }
}
/** Rounds it has done today. @param {Entity} e @returns {string[]} */
function roundsDone(e) {
  return e.getDynamicProperty("crew:roundsDay") === today() ? getJSON(e, "crew:rounds", []) : [];
}
/** A pickup chest past 3/4 full (from what was last seen in it), if any. @param {Entity} e */
export function nearlyFull(e) {
  return routeFor(e).find((sp) => (stockAt(sp)?.fill ?? 0) >= FULL_AT);
}
export const SLOT_WORDS = { morning: "morning round", midday: "midday round", evening: "evening round", now: "round", extra: "extra trip" };

/**
 * A round job (for startJob): its route is fixed when it starts. `only` = one chest (an extra
 * trip); an empty route just takes what it carries to the depot.
 * @param {Entity} e @param {string} slot @param {Spot[]} [only]
 * @returns {{ok: true, job: any, message: string} | {ok: false, message: string}}
 */
export function roundJob(e, slot, only) {
  const name = meta(e).name;
  const s = settlementFor(e);
  if (!s) return { ok: false, message: `${name} isn't in a settlement: Haulers serve a settlement's chests. Found one at a bell.` };
  if (!s.depot) return { ok: false, message: `${s.name} has no depot yet. Mark one with the Survey Stake (tap the ground, Make a depot here).` };
  if (s.depot.dim !== e.dimension.id) return { ok: false, message: `${s.name}'s depot is in another dimension from ${name}.` };
  const route = only ?? routeFor(e);
  const id = `${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
  const job = { type: "round", id, by: { name: "routine", console: true }, slot, route, sid: s.id };
  const what = SLOT_WORDS[/** @type {keyof typeof SLOT_WORDS} */ (slot)] ?? "round";
  return { ok: true, job, message: route.length ? `${name} is starting its ${what}: ${route.length} chest${route.length === 1 ? "" : "s"}.` : `${name} is taking what it carries to the depot.` };
}

/**
 * Once a second for an idle Hauler in the daytime: start the due round, an extra trip to a nearly
 * full chest, take leftovers to the depot, or go back to the depot and tidy it.
 * @param {Entity} e @param {Ctx} ctx
 */
export function haulerIdle(e, ctx) {
  if (e.getDynamicProperty("crew:haulOff")) return;
  // a player just called it somewhere: it stays a minute before going back to work
  const hold = Number(e.getDynamicProperty("crew:hold") ?? 0);
  if (hold > 0) {
    e.setDynamicProperty("crew:hold", hold > 1 ? hold - 1 : undefined);
    return;
  }
  const s = settlementFor(e);
  const d = s?.depot;
  if (!d || d.dim !== e.dimension.id) return;
  if (energy(e) < EXHAUSTED) return ctx.startRest(e, "tired");
  // a round that was interrupted (an order, a restart in the middle of an order) carries on
  if (getJSON(e, "crew:paused", undefined)?.job?.type === "round") {
    ctx.resumeJob(e);
    return;
  }
  const slot = dueRound(e);
  /** @param {string} sl @param {Spot[]} [only] */
  const go = (sl, only) => {
    const r = roundJob(e, sl, only);
    if (!r.ok) return;
    // nothing to collect and nothing carried: the round is skipped quietly
    if (!r.job.route.length && !cargoUsed(e)) return;
    ctx.startJob(e, r.job);
    const n = r.job.route.length;
    emit(e, "round_started", { slot: sl, chests: n }, sl === "extra" ? (n ? `${r.job.route[0].label} is nearly full: going to fetch it.` : "taking what I carry to the depot.") : `off on my ${SLOT_WORDS[/** @type {keyof typeof SLOT_WORDS} */ (sl)]} (${n} chest${n === 1 ? "" : "s"}).`);
  };
  if (slot) {
    setJSON(e, "crew:rounds", [...roundsDone(e), slot]);
    e.setDynamicProperty("crew:roundsDay", today());
    return go(slot);
  }
  const full = nearlyFull(e);
  if (full) return go("extra", [full]);
  if (cargoUsed(e) > 0) return go("extra", []);
  const at = floorV(e.location);
  if (!nearDepot(d, at)) return startTidy(e, ctx);
  // looking over the depot's chests every 10 seconds is plenty
  const k = (tidyIn.get(e.id) ?? 0) - 1;
  tidyIn.set(e.id, k > 0 ? k : 10);
  if (k <= 0 && tidyPlan(s)) startTidy(e, ctx);
}

/** Seconds until an idle Hauler next looks over the depot for tidying, by worker id. @type {Map<string, number>} */
const tidyIn = new Map();

/** At night: a new day's rounds. @param {Entity} e */
export function newDay(e) {
  if (e.getDynamicProperty("crew:rounds") !== undefined) e.setDynamicProperty("crew:rounds", undefined);
}

// ---------- stepping the jobs ----------
/** @param {any} rt @param {Ctx} ctx */
export function stepHaul(rt, ctx) {
  const { e, job, st } = rt;
  const inv = invOf(e);
  if (!inv) throw new Error("worker has no inventory");
  walkedEnergy(rt, inv);
  // tired: it eats its packed lunch (never the cargo), now and then, like a digger does
  if ((st.eatIn = (st.eatIn ?? 0) - 1) <= 0 && energy(e) < TIRED) {
    st.eatIn = 200;
    eatOne(e, inv, SUPPLY_FIRST);
  }
  const used = cargo(inv).length;
  rt.pace = used >= HAUL_SLOTS ? SLOW_LOADED : 1;
  const loaded = used > 0;
  showLoad(e, used);
  e.setProperty("crew:anim", rt.walk?.path ? 1 : 0);
  if (job.type === "round") return stepRound(rt, ctx, inv);
  if (job.type === "haul") return stepHaulJob(rt, ctx, inv);
  return stepTidy(rt, ctx);
}

/**
 * The backpack bulges while it carries anything (entity property crew:loaded). Also called once a
 * second for every Hauler, so it's right after "Take what it carries" or a drop-off too.
 * @param {Entity} e @param {number} [used]
 */
export function showLoad(e, used = cargoUsed(e)) {
  try {
    if (e.getProperty("crew:loaded") !== used > 0) e.setProperty("crew:loaded", used > 0);
  } catch {
    /* entity gone */
  }
}

/** Walking tires it: per block, more when loaded. @param {any} rt @param {Container} inv */
function walkedEnergy(rt, inv) {
  const at = rt.e.location;
  const last = rt.st.lastPos;
  rt.st.lastPos = { x: at.x, y: at.y, z: at.z };
  if (!last) return;
  const d = Math.hypot(at.x - last.x, at.z - last.z);
  if (d <= 0 || d > 4) return; // a teleport (bed, shortcut) isn't walking
  rt.st.walked = (rt.st.walked ?? 0) + d;
  setEnergy(rt.e, energy(rt.e) - d * drainPerBlock(cargo(inv).length / HAUL_SLOTS));
}

/** Should it head back and stop for the day (night, or worn out)? @param {Entity} e */
function stopping(e) {
  if (energy(e) < EXHAUSTED) return "tired";
  if (isNight() && !e.getDynamicProperty("crew:stayUp")) return "night";
  return undefined;
}

/** The depot it works for, re-read (players can move it). @param {any} rt @returns {Depot | undefined} */
const depotOf = (rt) => getSettlements()[rt.job.sid ?? ""]?.depot ?? settlementFor(rt.e)?.depot;

/** @param {any} rt @param {Ctx} ctx @param {Container} inv */
function stepRound(rt, ctx, inv) {
  const { e, job, st } = rt;
  const d = depotOf(rt);
  if (!d || d.dim !== e.dimension.id) {
    ctx.stopJob(e, "the depot is gone, so I stopped my round.", true);
    return;
  }
  if (st.phase === "travel_in" || st.phase === "walking") st.phase = "area";
  if (job.tickingArea) moveArea(rt);
  switch (st.phase) {
    case "area": {
      // it sets off from the depot (and waits there for a work area)
      if (!job.tickingArea && !nearDepot(d, floorV(e.location)) && ctx.walkTo(rt, depotEntry(d), 1.8) !== "arrived") return;
      if (job.tickingArea || takeArea(rt)) {
        st.wait = undefined;
        st.toldArea = false;
        st.phase = cargo(inv).length ? "to_depot" : "to_pickup";
        return;
      }
      if (!st.toldArea) {
        st.toldArea = true;
        emit(e, "no_area", {}, "Waiting for a free work area (all the world's ticking areas are taken). I'll try again in a minute.");
      }
      st.wait = "area";
      st.retry = pace(RETRY_AREA);
      st.phase = "wait_area";
      return;
    }
    case "wait_area":
      e.setProperty("crew:anim", 0);
      if (--st.retry <= 0) st.phase = "area";
      return;
    case "to_pickup": {
      const route = job.route ?? [];
      if (stopping(e) || (st.idx ?? 0) >= route.length) {
        st.phase = "to_depot";
        return;
      }
      const sp = route[st.idx ?? 0];
      if (ctx.walkTo(rt, sp, 2.6, true) !== "arrived") return;
      const n = load(e, inv, sp, undefined, st);
      st.pause = loadTicks(n);
      st.phase = "loading";
      return;
    }
    case "loading":
      e.setProperty("crew:anim", 0);
      if (--st.pause > 0) return;
      if (cargo(inv).length >= HAUL_SLOTS) {
        st.phase = "to_depot";
        return;
      }
      st.idx = (st.idx ?? 0) + 1;
      st.phase = "to_pickup";
      return;
    case "to_depot":
      if (ctx.walkTo(rt, depotEntry(d), 1.8) !== "arrived") return;
      st.phase = "store";
      return;
    case "store":
    case "to_chest":
    case "storing":
    case "fetch_chests":
    case "wait_full":
      return storeStep(rt, ctx, inv, d, () => {
        // all stored: on with the route (it came back full), or done
        if (!stopping(e) && (st.idx ?? 0) < (job.route ?? []).length) st.phase = job.tickingArea ? "to_pickup" : "area";
        else finishRound(rt, ctx);
      });
    default:
      st.phase = "area";
  }
}

/**
 * Takes everything (or only the filter's items) from a chest into the cargo slots, as much as fits.
 * Returns how many stacks it moved. Nothing is ever lost: what doesn't fit stays in the chest.
 * @param {Entity} e @param {Container} inv @param {Spot} sp @param {string[] | undefined} only @param {any} st
 */
function load(e, inv, sp, only, st) {
  const c = containerAt(sp.dim, sp);
  if (!c) return 0;
  let n = 0;
  for (let i = 0; i < c.size; i++) {
    const it = c.getItem(i);
    if (!it || (only && !only.includes(it.typeId))) continue;
    const left = toCargo(inv, it);
    if (left && left.amount === it.amount) continue;
    c.setItem(i, left);
    n++;
    const moved = it.amount - (left?.amount ?? 0);
    if (st) (st.loaded ??= {})[it.typeId] = (st.loaded[it.typeId] ?? 0) + moved;
  }
  noteChestUse(sp.dim, sp); // even when it took nothing: a stale "nearly full" mustn't call it back
  return n;
}

/** Back at the depot with nothing left to store: free the work area, then rest or go idle. @param {any} rt @param {Ctx} ctx */
function finishRound(rt, ctx) {
  const { e, job, st } = rt;
  dropArea(rt);
  const why = stopping(e);
  const n = (job.route ?? []).length;
  if (n) emit(e, "round_done", { slot: job.slot, chests: n, stored: st.stored ?? 0 }, `${SLOT_WORDS[/** @type {keyof typeof SLOT_WORDS} */ (job.slot)] ?? "round"} done: ${st.stored ?? 0} stack${st.stored === 1 ? "" : "s"} put away in the depot.`);
  ctx.stopJob(e, undefined, true);
  if (why) ctx.startRest(e, why);
}

// ---------- storing at the depot ----------
/**
 * Where one stack goes: the unit holding that kind (with room), a second chest beside it, a new
 * chest in its group's corner, else any chest of its group with room, else any with room.
 * Without `share`, a stack that should get a new chest it has none for comes back as "need";
 * with it, it shares a chest that has room instead (it's out of chests and none can be fetched).
 * @param {Depot} d @param {import("@minecraft/server").ItemStack} item @param {boolean} haveChest @param {boolean} [share]
 * @returns {{kind: "store", unit: number} | {kind: "second", unit: number, cell: V3} | {kind: "place", cells: V3[]} | {kind: "need"} | {kind: "full"}}
 */
function targetFor(d, item, haveChest, share = false) {
  const id = item.typeId;
  const roomIn = (/** @type {DepotUnit} */ u) => u.cells.some((c) => {
    const ct = containerAt(d.dim, c);
    return !!ct && hasRoom(ct, item);
  });
  const mine = d.units.map((u, i) => ({ u, i })).filter((x) => x.u.kind === id);
  const own = mine.find((x) => roomIn(x.u));
  if (own) return { kind: "store", unit: own.i };
  const lay = depotLayout(d);
  const limit = lay.chestCells.length;
  const placed = chestsPlaced(d);
  const taken = new Set(d.units.flatMap((u) => u.cells.map((c) => `${c.x},${c.z}`)));
  const free = (/** @type {V3} */ c) => !taken.has(`${c.x},${c.z}`) && containerAt(d.dim, c) === undefined && isAir(d.dim, c);
  /** @type {{kind: "second", unit: number, cell: V3} | {kind: "place", cells: V3[]} | undefined} */
  let want;
  if (placed < limit) {
    // the other half of a double chest it already holds this kind in
    for (const { u, i } of mine) {
      if (u.cells.length !== 1) continue;
      const slot = lay.slots.find((sl) => sl.length === 2 && sl.some((c) => c.x === u.cells[0].x && c.z === u.cells[0].z));
      const other = slot?.find((c) => !(c.x === u.cells[0].x && c.z === u.cells[0].z));
      if (other && free(other)) {
        want = { kind: "second", unit: i, cell: other };
        break;
      }
    }
    if (!want) {
      const g = groupOf(id);
      // a whole free pair first (room for a double chest later), else any free cell
      let open = lay.slots.filter((sl) => sl.every(free));
      if (!open.length) open = lay.slots.flatMap((sl) => sl.filter(free).map((c) => [c]));
      if (open.length) {
        const same = d.units.filter((u) => u.group === g).flatMap((u) => u.cells);
        const otherCells = d.units.filter((u) => u.group !== g).flatMap((u) => u.cells);
        const near = (/** @type {V3[]} */ sl, /** @type {V3[]} */ cells) => Math.min(...cells.map((c) => dist(c, sl[0])));
        let best = open[0];
        if (same.length) best = open.reduce((a, b) => (near(b, same) < near(a, same) ? b : a));
        else if (otherCells.length) best = open.reduce((a, b) => (near(b, otherCells) > near(a, otherCells) ? b : a));
        want = { kind: "place", cells: best };
      }
    }
  }
  if (want && haveChest) return want;
  if (want && !share) return { kind: "need" };
  // no chest to place (or no room for one): share a chest of its group, then any chest
  const g = groupOf(id);
  const any = d.units.map((u, i) => ({ u, i })).filter((x) => roomIn(x.u));
  const pick = any.find((x) => x.u.group === g) ?? any[0];
  return pick ? { kind: "store", unit: pick.i } : { kind: "full" };
}
/** Nothing there at all (air or a light block), so a chest can go there without removing anything. @param {import("@minecraft/server").Dimension} dim @param {V3} c */
function openAir(dim, c) {
  const b = dim.getBlock(c);
  return !!b && (b.isAir || AIR.has(b.typeId) || LIGHT.test(b.typeId));
}
/** @param {string} dimId @param {V3} c */
function isAir(dimId, c) {
  try {
    return openAir(world.getDimension(dimId), c);
  } catch {
    return false;
  }
}

/**
 * A storage chest (not a depot, home or pickup chest) that had chest items when last read.
 * @param {any} rt @param {Depot} d
 */
function chestSource(rt, d) {
  const s = getSettlements()[rt.job.sid ?? ""] ?? settlementFor(rt.e);
  if (!s) return undefined;
  const homes = homeChestKeys();
  const picks = new Set(pickupSpots(rt.e).map(keyOf));
  return storageSpots(s).filter((sp) => sp.dim === d.dim && !isDepotChest(s, sp) && !homes.has(keyOf(sp)) && !picks.has(keyOf(sp)))
    .filter((sp) => {
      const c = containerAt(sp.dim, sp);
      if (c) {
        for (let i = 0; i < c.size; i++) if (c.getItem(i)?.typeId === CHEST) return true;
        return false;
      }
      return (stockAt(sp)?.items?.[CHEST] ?? 0) > 0;
    })
    .sort((a, b) => dist(a, rt.e.location) - dist(b, rt.e.location))[0];
}

/** Tells everyone in the settlement who's online. @param {any} rt @param {string} text */
function tellSettlement(rt, text) {
  const s = getSettlements()[rt.job.sid ?? ""] ?? settlementFor(rt.e);
  if (!s) return;
  const m = meta(rt.e);
  for (const p of peopleOf(s)) if (p.id !== m.ownerId) tell(onlinePlayer(p), `§b${m.name}§r: ${text}`);
}

/**
 * Puts its cargo away in the depot, one chest at a time (walking to each), with a pause that grows
 * with the stacks moved. Places chests as it needs them, fetches chests from storage, and waits
 * when the depot is full. Calls done() once the cargo is all stored.
 * @param {any} rt @param {Ctx} ctx @param {Container} inv @param {Depot} d @param {() => void} done
 */
function storeStep(rt, ctx, inv, d, done) {
  const { e, st } = rt;
  switch (st.phase) {
    case "store": {
      if (st.pause > 0) {
        e.setProperty("crew:anim", 0);
        st.pause--;
        return;
      }
      cleanUnits(rt, d);
      const items = cargo(inv);
      if (!items.length) {
        st.full = false;
        return done();
      }
      const have = chestSupply(inv) > 0;
      /** @type {any} */
      let plan;
      let need = false;
      for (const { item } of items) {
        const t = targetFor(d, item, have);
        if (t.kind === "need") need = true;
        if (t.kind !== "need" && t.kind !== "full") {
          plan = { ...t, item: item.typeId };
          break;
        }
      }
      if (!plan && need && !have) {
        const src = chestSource(rt, d);
        if (src) {
          st.src = src;
          st.phase = "fetch_chests";
          return;
        }
        if (!st.toldChests) {
          st.toldChests = true;
          st.needChests = true;
          emit(e, "need_chests", {}, "I need chests for the depot. Put some in a settlement storage chest, or tap me holding chests.");
          tellSettlement(rt, "I need chests for the depot.");
        }
        // meanwhile it shares the chests that have room
        for (const { item } of items) {
          const t = targetFor(d, item, false, true);
          if (t.kind === "store") {
            plan = { ...t, item: item.typeId };
            break;
          }
        }
      }
      if (!plan) {
        dropArea(rt); // waiting at the depot needs no work area; it takes one again to set off
        st.phase = "wait_full";
        st.retry = pace(RETRY_FULL);
        if (!st.full) {
          st.full = true;
          const text = need ? "The depot is full: I need chests for the depot. I'm keeping what I carry and waiting there." : "The depot is full. I'm keeping what I carry and waiting there until there's room.";
          emit(e, "depot_full", { need_chests: need }, text);
          tellSettlement(rt, text);
        }
        return;
      }
      st.target = plan;
      st.phase = "to_chest";
      return;
    }
    case "to_chest": {
      const t = st.target;
      const cell = t.kind === "store" ? d.units[t.unit]?.cells[0] : t.kind === "second" ? t.cell : t.cells[0];
      if (!cell) {
        st.phase = "store";
        return;
      }
      if (ctx.walkTo(rt, cell, 2.6, true) !== "arrived") return;
      let unit = t.unit;
      if (t.kind === "place" || t.kind === "second") {
        const place = t.kind === "place" ? t.cells[0] : t.cell;
        if (!cargo(inv).length || !isAir(d.dim, place) || !useChest(inv)) {
          st.phase = "store";
          return;
        }
        world.getDimension(d.dim).setBlockType(place, CHEST);
        if (t.kind === "place") {
          d.units.push({ cells: [place], kind: t.item, group: groupOf(t.item) });
          unit = d.units.length - 1;
        } else d.units[unit].cells.push(place);
        saveDepotUnits(rt.job.sid ?? settlementFor(e)?.id ?? "", d.units);
        st.needChests = false;
        st.toldChests = false;
      }
      const n = putInto(rt, inv, d, unit, t.item);
      st.stored = (st.stored ?? 0) + n;
      st.pause = loadTicks(n);
      st.target = undefined;
      st.phase = "store";
      return;
    }
    case "fetch_chests": {
      const src = st.src;
      if (!src) {
        st.phase = "store";
        return;
      }
      if (!rt.job.tickingArea) takeArea(rt); // the storage chest may be out of the depot's area (best effort)
      if (ctx.walkTo(rt, src, 2.6, true) !== "arrived") return;
      const c = containerAt(src.dim, src);
      let took = 0;
      if (c) {
        const want = Math.max(1, chestLimit(d) - chestsPlaced(d) - chestSupply(inv));
        for (let i = 0; i < c.size && took < want; i++) {
          const it = c.getItem(i);
          if (it?.typeId !== CHEST) continue;
          const n = Math.min(it.amount, want - took);
          const part = it.clone();
          part.amount = n;
          const left = stash(inv, part, SUPPLY_FIRST, inv.size);
          const moved = n - (left?.amount ?? 0);
          if (!moved) break;
          took += moved;
          if (it.amount - moved > 0) {
            it.amount -= moved;
            c.setItem(i, it);
          } else c.setItem(i, undefined);
        }
        if (took) noteChestUse(src.dim, src);
      }
      st.src = undefined;
      if (took) emit(e, "took_chests", { n: took }, `took ${took} chest${took === 1 ? "" : "s"} from ${src.label} for the depot.`);
      st.pause = loadTicks(1);
      st.phase = "store";
      return;
    }
    case "wait_full": {
      e.setProperty("crew:anim", 0);
      // at night it gives up for today and goes to bed with what it carries
      const why = stopping(e);
      if (why === "night") {
        dropArea(rt);
        ctx.stopJob(e, undefined, true);
        ctx.startRest(e, why);
        return;
      }
      if (--st.retry > 0) return;
      st.retry = pace(RETRY_FULL);
      const have = chestSupply(inv) > 0;
      const can = cargo(inv).some(({ item }) => {
        const t = targetFor(d, item, have);
        if (t.kind !== "full" && (t.kind !== "need" || !!chestSource(rt, d))) return true;
        return targetFor(d, item, false, true).kind === "store";
      });
      if (can) {
        st.full = false;
        st.phase = "store";
        emit(e, "depot_room", {}, "there's room in the depot again: putting things away.");
      }
      return;
    }
    default:
      st.phase = "store";
  }
}

/**
 * Puts every cargo stack of the unit's kind into it, plus the kind it came here for when that's
 * sharing the chest (no chest of its own). Returns the stacks moved.
 * @param {any} rt @param {Container} inv @param {Depot} d @param {number} unitIdx @param {string} forKind
 */
function putInto(rt, inv, d, unitIdx, forKind) {
  const u = d.units[unitIdx];
  if (!u) return 0;
  let n = 0;
  for (const { slot, item } of cargo(inv)) {
    if (item.typeId !== u.kind && item.typeId !== forKind) continue;
    let left = item;
    for (const c of u.cells) {
      const ct = containerAt(d.dim, c);
      if (!ct || !left) continue;
      left = ct.addItem(left);
    }
    if (left && left.amount === item.amount) continue;
    inv.setItem(slot, left);
    n++;
  }
  if (n) for (const c of u.cells) noteChestUse(d.dim, c);
  return n;
}

/** Forgets depot chests that aren't there any more (a player broke one). @param {any} rt @param {Depot} d */
function cleanUnits(rt, d) {
  let changed = false;
  for (const u of d.units) {
    const keep = u.cells.filter((c) => containerAt(d.dim, c) !== undefined || !loadedAt(d.dim, c));
    if (keep.length !== u.cells.length) {
      u.cells = keep;
      changed = true;
    }
  }
  if (!changed) return;
  d.units = d.units.filter((u) => u.cells.length);
  saveDepotUnits(rt.job.sid ?? settlementFor(rt.e)?.id ?? "", d.units);
}
/** @param {string} dimId @param {V3} c */
function loadedAt(dimId, c) {
  try {
    return !!world.getDimension(dimId).getBlock(c);
  } catch {
    return false;
  }
}

// ---------- the work area (ticking area) ----------
/** Takes a ticking area for the round where it stands. False if none is free. @param {any} rt */
function takeArea(rt) {
  const { e, job } = rt;
  const at = floorV(e.location);
  try {
    const r = e.dimension.runCommand(`tickingarea add circle ${at.x} ${at.y} ${at.z} 2 crew_${job.id} true`);
    if (!(r && r.successCount > 0)) return false;
  } catch {
    return false;
  }
  job.tickingArea = true;
  setJSON(e, "crew:job", job);
  rt.area = at;
  rt.areaIn = 40;
  return true;
}
/** Moves its area along as it walks (never touching anyone else's). @param {any} rt */
function moveArea(rt) {
  if (--rt.areaIn > 0) return;
  rt.areaIn = 40;
  const at = floorV(rt.e.location);
  if (rt.area && dist(rt.area, at) < 24) return;
  const dim = rt.e.dimension;
  try {
    dim.runCommand(`tickingarea remove crew_${rt.job.id}`);
  } catch {
    /* not there */
  }
  try {
    dim.runCommand(`tickingarea add circle ${at.x} ${at.y} ${at.z} 2 crew_${rt.job.id} true`);
  } catch {
    /* taken in the meantime: it carries on while a player is near */
  }
  rt.area = at;
}
/** Back at the depot: frees its area. @param {any} rt */
function dropArea(rt) {
  const { e, job } = rt;
  if (!job.tickingArea) return;
  try {
    e.dimension.runCommand(`tickingarea remove crew_${job.id}`);
  } catch {
    /* already gone */
  }
  job.tickingArea = false;
  setJSON(e, "crew:job", job);
  rt.area = undefined;
}

// ---------- haul: a one-off move from one chest to another ----------
/** @param {any} rt @param {Ctx} ctx @param {Container} inv */
function stepHaulJob(rt, ctx, inv) {
  const { e, job, st } = rt;
  if (st.phase === "travel_in" || st.phase === "walking") st.phase = "to_from";
  switch (st.phase) {
    case "to_from": {
      if (ctx.walkTo(rt, job.from, 2.6, true) !== "arrived") return;
      if (!containerAt(job.from.dim, job.from)) {
        ctx.stopJob(e, `there's no chest or barrel at ${job.from.label}, so I stopped.`, true);
        return;
      }
      st.loaded = {};
      const n = load(e, inv, job.from, job.items, st);
      st.trip = n;
      st.pause = loadTicks(n);
      st.phase = "loading";
      return;
    }
    case "loading":
      e.setProperty("crew:anim", 0);
      if (--st.pause > 0) return;
      st.phase = "to_to";
      return;
    case "to_to": {
      if (ctx.walkTo(rt, job.to, 2.6, true) !== "arrived") return;
      const c = containerAt(job.to.dim, job.to);
      if (!c) {
        ctx.stopJob(e, `there's no chest or barrel at ${job.to.label}, so I kept what I carry.`, true);
        return;
      }
      let n = 0, full = false;
      /** @type {Record<string, number>} */
      const want = st.loaded ?? {};
      for (const { slot, item } of cargo(inv)) {
        const k = want[item.typeId] ?? 0;
        if (k <= 0) continue;
        const take = Math.min(k, item.amount);
        const part = item.clone();
        part.amount = take;
        const left = c.addItem(part);
        const moved = take - (left?.amount ?? 0);
        if (moved > 0) {
          n++;
          want[item.typeId] = k - moved;
          if (item.amount - moved > 0) {
            item.amount -= moved;
            inv.setItem(slot, item);
          } else inv.setItem(slot, undefined);
        }
        if (left) full = true;
      }
      if (n) noteChestUse(job.to.dim, job.to);
      st.moved = (st.moved ?? 0) + Object.values(st.loaded ?? {}).reduce((a, b) => a + b, 0) - Object.values(want).reduce((a, b) => a + b, 0);
      st.loaded = want;
      st.pause = loadTicks(n);
      st.phase = full ? "full" : "unloading";
      return;
    }
    case "unloading": {
      e.setProperty("crew:anim", 0);
      if (--st.pause > 0) return;
      // more to fetch? only if the last trip brought something (else nothing matching is left)
      const c = containerAt(job.from.dim, job.from);
      let more = false;
      if (c && st.trip > 0) for (let i = 0; i < c.size && !more; i++) {
        const it = c.getItem(i);
        if (it && (!job.items || job.items.includes(it.typeId))) more = true;
      }
      if (more) {
        st.phase = "to_from";
        return;
      }
      emit(e, "haul_done", { from: job.from.label, to: job.to.label, items: st.moved ?? 0 }, `moved ${st.moved ?? 0} item${st.moved === 1 ? "" : "s"} from ${job.from.label} to ${job.to.label}.`);
      ctx.stopJob(e, undefined, true);
      return;
    }
    case "full":
      e.setProperty("crew:anim", 0);
      if (--st.pause > 0) return;
      st.phase = "take_back";
      return;
    case "take_back": {
      // the destination is full: the rest goes back where it came from (never to the depot)
      if (ctx.walkTo(rt, job.from, 2.6, true) !== "arrived") return;
      const c = containerAt(job.from.dim, job.from);
      /** @type {Record<string, number>} */
      const want = st.loaded ?? {};
      for (const { slot, item } of cargo(inv)) {
        const k = want[item.typeId] ?? 0;
        if (!c || k <= 0) continue;
        const part = item.clone();
        part.amount = Math.min(k, item.amount);
        const left = c.addItem(part);
        const moved = part.amount - (left?.amount ?? 0);
        want[item.typeId] = k - moved;
        if (item.amount - moved > 0) {
          item.amount -= moved;
          inv.setItem(slot, item);
        } else inv.setItem(slot, undefined);
      }
      if (c) noteChestUse(job.from.dim, job.from);
      ctx.stopJob(e, `${job.to.label} is full, so I put the rest back in ${job.from.label} (${st.moved ?? 0} items moved).`, true);
      return;
    }
    default:
      st.phase = "to_from";
  }
}

// ---------- tidying the depot ----------
/** Items tidying never moves. @param {import("@minecraft/server").ItemStack} it */
const untouchable = (it) => /shulker_box/.test(it.typeId) || !!it.nameTag || !!toolInfo(it) || !!it.getComponent?.("minecraft:durability") || it.maxAmount <= 1;

/**
 * The next tidying job in the depot: a chest with two part-full stacks of one kind (merge), or a
 * stack in a chest of another kind whose own chest has room (a stray). undefined = nothing to do.
 * @param {import("./settlement.js").Settlement | undefined} s
 * @returns {{kind: "merge", unit: number, cell: V3} | {kind: "stray", unit: number, cell: V3, slot: number, to: number} | undefined}
 */
export function tidyPlan(s) {
  const d = s?.depot;
  if (!d) return undefined;
  for (let ui = 0; ui < d.units.length; ui++) {
    const u = d.units[ui];
    for (const cell of u.cells) {
      const c = containerAt(d.dim, cell);
      if (!c) continue;
      /** @type {Record<string, number[]>} */
      const part = {};
      for (let i = 0; i < c.size; i++) {
        const it = c.getItem(i);
        if (!it || untouchable(it)) continue;
        if (it.typeId !== u.kind) {
          const to = d.units.findIndex((x, xi) => xi !== ui && x.kind === it.typeId && x.cells.some((cc) => {
            const ct = containerAt(d.dim, cc);
            return !!ct && hasRoom(ct, it);
          }));
          if (to >= 0) return { kind: "stray", unit: ui, cell, slot: i, to };
        }
        if (it.amount < it.maxAmount) {
          // only stacks that really stack (same data: banners, fireworks, tipped arrows differ)
          if ((part[it.typeId] ?? []).some((j) => c.getItem(j)?.isStackableWith(it))) return { kind: "merge", unit: ui, cell };
          (part[it.typeId] ??= []).push(i);
        }
      }
    }
  }
  return undefined;
}

/** Starts tidying (or walking back to the depot). @param {Entity} e @param {Ctx} ctx */
function startTidy(e, ctx) {
  const s = settlementFor(e);
  if (!s?.depot) return;
  const id = `t${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
  ctx.startJob(e, { type: "tidy", id, by: { name: "routine", console: true }, sid: s.id });
}

/** @param {any} rt @param {Ctx} ctx */
function stepTidy(rt, ctx) {
  const { e, st } = rt;
  const s = getSettlements()[rt.job.sid ?? ""];
  const d = s?.depot;
  if (!d || d.dim !== e.dimension.id || stopping(e) || e.getDynamicProperty("crew:haulOff")) {
    ctx.stopJob(e, undefined, true);
    return;
  }
  if (st.phase === "travel_in" || st.phase === "walking") st.phase = "to_depot";
  // something better to do (a round is due, a chest is nearly full): stop tidying, the routine starts it
  if (st.phase !== "working" && (dueRound(e) || cargoUsed(e) > 0)) {
    ctx.stopJob(e, undefined, true);
    return;
  }
  switch (st.phase) {
    case "to_depot":
      if (nearDepot(d, floorV(e.location)) || ctx.walkTo(rt, depotEntry(d), 1.8) === "arrived") st.phase = "plan";
      return;
    case "plan": {
      if (st.pause > 0) {
        e.setProperty("crew:anim", 0);
        st.pause--;
        return;
      }
      const t = tidyPlan(s);
      if (!t) {
        ctx.stopJob(e, undefined, true);
        return;
      }
      st.target = t;
      st.phase = "to_chest";
      return;
    }
    case "to_chest": {
      const t = st.target;
      if (ctx.walkTo(rt, t.cell, 2.6, true) !== "arrived") return;
      st.pause = loadTicks(doTidy(d, t));
      st.target = undefined;
      st.phase = "plan";
      return;
    }
    default:
      st.phase = "to_depot";
  }
}

/** Does one tidying job; returns the stacks moved. @param {Depot} d @param {any} t */
function doTidy(d, t) {
  const c = containerAt(d.dim, t.cell);
  if (!c) return 0;
  if (t.kind === "stray") {
    const it = c.getItem(t.slot);
    const to = d.units[t.to];
    if (!it || !to || untouchable(it) || it.typeId !== to.kind) return 0;
    /** @type {import("@minecraft/server").ItemStack | undefined} */
    let left = it;
    for (const cc of to.cells) {
      const ct = containerAt(d.dim, cc);
      if (ct && left) left = ct.addItem(left);
    }
    c.setItem(t.slot, left);
    noteChestUse(d.dim, t.cell);
    for (const cc of to.cells) noteChestUse(d.dim, cc);
    return 1;
  }
  // merge: part-full stacks of the same kind in this chest are combined (named and unstackable things stay put)
  // groups of slots whose stacks really stack with each other
  /** @type {number[][]} */
  const parts = [];
  for (let i = 0; i < c.size; i++) {
    const it = c.getItem(i);
    if (!it || untouchable(it) || it.amount >= it.maxAmount) continue;
    const g = parts.find((sl) => c.getItem(sl[0])?.isStackableWith(it));
    if (g) g.push(i);
    else parts.push([i]);
  }
  let n = 0;
  for (const slots of parts) {
    if (slots.length < 2) continue;
    let total = 0;
    const proto = /** @type {import("@minecraft/server").ItemStack} */ (c.getItem(slots[0]));
    for (const i of slots) total += c.getItem(i)?.amount ?? 0;
    for (const i of slots) {
      const k = Math.min(proto.maxAmount, total);
      if (k > 0) {
        const s = proto.clone();
        s.amount = k;
        c.setItem(i, s);
        total -= k;
      } else c.setItem(i, undefined);
    }
    n += slots.length;
  }
  if (n) noteChestUse(d.dim, t.cell);
  return n;
}

// ---------- status ----------
/** Words for the status line and the roster. @param {Entity} e @param {any} job @param {any} st */
export function haulStatus(e, job, st) {
  if (job.type === "tidy") return st?.phase === "to_depot" ? "Going back to the depot" : "Tidying the depot";
  if (job.type === "haul") return `Hauling from ${job.from.label} to ${job.to.label}`;
  if (st?.phase === "wait_area") return "Waiting for a free work area";
  if (st?.phase === "wait_full") return st.needChests ? "The depot is full: I need chests for the depot" : "The depot is full";
  if (st?.needChests) return "I need chests for the depot";
  const n = (job.route ?? []).length;
  const what = SLOT_WORDS[/** @type {keyof typeof SLOT_WORDS} */ (job.slot)] ?? "round";
  if (!n) return "Taking what it carries to the depot";
  const at = Math.min(n, (st?.idx ?? 0) + 1);
  const unloading = ["to_depot", "store", "to_chest", "fetch_chests"].includes(st?.phase);
  return `On the ${what} (${at} of ${n} chests)${unloading ? ", unloading at the depot" : ""}`;
}

/** What an idle Hauler says about itself. @param {Entity} e */
export function haulerIdleStatus(e) {
  if (e.getDynamicProperty("crew:haulOff")) return "Stopped: no rounds until Continue or Do a round now";
  const s = settlementFor(e);
  if (!s) return "Not in a settlement, so no rounds";
  if (!s.depot) return "No depot yet: mark one with the Survey Stake";
  return "Waiting for its next round";
}

/** The depot in words, for the Hauler's menu. @param {Entity} e */
export function depotText(e) {
  const s = settlementFor(e);
  const d = s?.depot;
  if (!d) return "No depot yet: tap the ground with the Survey Stake and pick Make a depot here.";
  /** @type {Record<string, number>} */
  const byGroup = {};
  for (const u of d.units) byGroup[u.group] = (byGroup[u.group] ?? 0) + u.cells.length;
  const groups = Object.entries(byGroup).map(([g, n]) => `${n} ${GROUP_WORDS[/** @type {keyof typeof GROUP_WORDS} */ (g)] ?? g}`).join(", ");
  return `Depot: ${d.x1 - d.x0 + 1} by ${d.z1 - d.z0 + 1} at ${d.x0} ${d.y} ${d.z0}, ${chestsPlaced(d)} of ${chestLimit(d)} chests${groups ? ` (${groups})` : ""}.`;
}


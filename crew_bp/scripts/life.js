// A worker's daily life (v0.4): its home (a claimed bed and a home chest), the day clock,
// energy, food, and what it restocks from home in the morning. The routine itself (going home
// at dusk, sleeping, picking the job back up at dawn) is the `rest` job in runner.js.
import { world } from "@minecraft/server";
import { TORCH, passable } from "./blocks.js";
import { noteChestUse } from "./settlement.js";
import { KIT_SLOTS, SUPPLY_FIRST, addToKit, kit, roleKinds, stash, toolInfo } from "./tools.js";
import { getJSON, setJSON } from "./util.js";

/** @typedef {{x:number,y:number,z:number}} V3 */
/** @typedef {{dim: string, head: V3, foot: V3, chest?: V3}} Home */

// ---------- the day clock ----------
/** Time of day when workers head home (sunset; 0 is morning, 6000 noon). */
export const DUSK = 12000;
/** Dawn: the sun starts to rise and workers get up (villagers do too). */
export const DAWN = 23000;
/** Night = dusk until dawn. Read fresh every time, so a skipped night or a restart needs no bookkeeping. */
export const isNight = () => {
  const t = world.getTimeOfDay();
  return t >= DUSK && t < DAWN;
};

// ---------- energy ----------
export const ENERGY_MAX = 100;
export const TIRED = 30; // below this it digs slower and eats if it has food
export const EXHAUSTED = 10; // below this it stops to rest
export const DRAIN_PER_BLOCK = 0.08; // about 1,250 blocks from full to empty
export const TIRED_SLOWDOWN = 1.5;
/** How much a night's sleep restores (cap) and how fast (per tick), by where it sleeps. */
export const REST = {
  safe: { cap: 100, rate: 0.05, label: "a safe bed" },
  unsafe: { cap: 75, rate: 0.03, label: "an unsafe bed" },
  rough: { cap: 50, rate: 0.02, label: "the ground" },
};

/** @param {import("@minecraft/server").Entity} e */
export function energy(e) {
  const v = e.getDynamicProperty("crew:energy");
  return typeof v === "number" ? v : ENERGY_MAX;
}
/** @param {import("@minecraft/server").Entity} e @param {number} v */
export function setEnergy(e, v) {
  e.setDynamicProperty("crew:energy", Math.round(Math.max(0, Math.min(ENERGY_MAX, v)) * 100) / 100);
}
/** @param {number} v */
export const energyWord = (v) => (v < EXHAUSTED ? "exhausted" : v < TIRED ? "tired" : v < 70 ? "a bit tired" : "rested");

// ---------- food (never required: it restores energy, like sleep) ----------
/** Energy each food restores. */
export const FOOD = {
  "minecraft:golden_apple": 60, "minecraft:rabbit_stew": 50, "minecraft:golden_carrot": 45,
  "minecraft:cooked_beef": 40, "minecraft:cooked_porkchop": 40, "minecraft:pumpkin_pie": 40,
  "minecraft:cooked_mutton": 35, "minecraft:cooked_chicken": 30, "minecraft:cooked_rabbit": 30,
  "minecraft:cooked_salmon": 30, "minecraft:mushroom_stew": 30, "minecraft:beetroot_soup": 30,
  "minecraft:bread": 25, "minecraft:baked_potato": 25, "minecraft:cooked_cod": 25,
  "minecraft:apple": 10, "minecraft:carrot": 10, "minecraft:cookie": 8, "minecraft:melon_slice": 8,
  "minecraft:sweet_berries": 6, "minecraft:dried_kelp": 5,
};
/** @param {string | undefined} id */
export const isFood = (id) => !!id && id in FOOD;
/** Items a worker keeps as supplies: never dropped off, never handed over with "Take what it carries". @param {string} id */
export const isSupply = (id) => id === TORCH || isFood(id);
export const PACKED_FOOD = 8; // food it takes from home each morning
export const PACKED_TORCHES = 64;

/**
 * Eats one food item it carries (the first one in its inventory). Returns the energy gained, 0 if none.
 * `from`: the first slot to look in (a Hauler eats only its own lunch, slot 23 on, never cargo).
 * @param {import("@minecraft/server").Entity} e @param {import("@minecraft/server").Container} inv @param {number} [from]
 */
export function eatOne(e, inv, from = KIT_SLOTS) {
  for (let i = from; i < inv.size; i++) {
    const it = inv.getItem(i);
    if (!it || !isFood(it.typeId)) continue;
    const gain = /** @type {Record<string, number>} */ (FOOD)[it.typeId];
    if (it.amount > 1) {
      it.amount--;
      inv.setItem(i, it);
    } else inv.setItem(i, undefined);
    setEnergy(e, energy(e) + gain);
    try {
      e.dimension.playSound("random.eat", e.location, { volume: 0.7 });
    } catch {
      /* cosmetic only */
    }
    return gain;
  }
  return 0;
}

// ---------- beds ----------
const DIR4 = [{ x: 0, z: 1 }, { x: -1, z: 0 }, { x: 0, z: -1 }, { x: 1, z: 0 }]; // south, west, north, east
/** @param {import("@minecraft/server").Block | undefined} b @param {string} name */
function state(b, name) {
  try {
    return b?.permutation?.getState(/** @type {any} */ (name));
  } catch {
    return undefined;
  }
}
/** @param {import("@minecraft/server").Block | undefined} b */
const isBed = (b) => b?.typeId === "minecraft:bed";
const key = (/** @type {V3} */ c) => `${c.x},${c.y},${c.z}`;

/**
 * The bed that block c is part of: its head and foot blocks, or undefined if c isn't a bed.
 * Uses the bed's own direction and head/foot states, so two beds side by side don't get mixed up.
 * @param {import("@minecraft/server").Dimension} dim @param {V3} c
 * @returns {{head: V3, foot: V3} | undefined}
 */
export function bedAt(dim, c) {
  const b = dim.getBlock(c);
  if (!isBed(b)) return undefined;
  const p = { x: c.x, y: c.y, z: c.z };
  const isHead = state(b, "head_piece_bit");
  const dir = state(b, "direction");
  if (typeof dir === "number" && typeof isHead === "boolean") {
    const d = DIR4[((dir % 4) + 4) % 4];
    const other = isHead ? { x: p.x - d.x, y: p.y, z: p.z - d.z } : { x: p.x + d.x, y: p.y, z: p.z + d.z };
    const ob = dim.getBlock(other);
    if (isBed(ob) && state(ob, "head_piece_bit") === !isHead) return isHead ? { head: p, foot: other } : { head: other, foot: p };
  }
  // states not readable (or not as expected): the neighbouring bed block whose head state differs
  for (const d of DIR4) {
    const n = { x: p.x + d.x, y: p.y, z: p.z + d.z };
    const nb = dim.getBlock(n);
    if (!isBed(nb)) continue;
    const nHead = state(nb, "head_piece_bit");
    if (typeof isHead === "boolean" && typeof nHead === "boolean" && nHead === isHead) continue;
    return isHead === false || nHead === true ? { head: n, foot: p } : { head: p, foot: n };
  }
  return undefined;
}

/** The nearest bed within r blocks of pos. @param {import("@minecraft/server").Dimension} dim @param {V3} pos @param {number} r */
export function bedNear(dim, pos, r = 3) {
  const c = { x: Math.floor(pos.x), y: Math.floor(pos.y), z: Math.floor(pos.z) };
  /** @type {{head: V3, foot: V3} | undefined} */
  let best;
  let bestD = Infinity;
  for (let dy = -2; dy <= 2; dy++) for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
    const p = { x: c.x + dx, y: c.y + dy, z: c.z + dz };
    const d = dx * dx + dy * dy + dz * dz;
    if (d >= bestD || !isBed(dim.getBlock(p))) continue;
    const bed = bedAt(dim, p);
    if (bed) {
      best = bed;
      bestD = d;
    }
  }
  return best;
}

/** The nearest chest or barrel within r blocks of pos. @param {import("@minecraft/server").Dimension} dim @param {V3} pos @param {number} r */
export function chestNear(dim, pos, r = 8) {
  /** @type {V3 | undefined} */
  let best;
  let bestD = Infinity;
  for (let dy = -3; dy <= 3; dy++) for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
    const d = dx * dx + dy * dy + dz * dz;
    if (d >= bestD) continue;
    const p = { x: pos.x + dx, y: pos.y + dy, z: pos.z + dz };
    const b = dim.getBlock(p);
    if (b && /(^minecraft:(chest|trapped_chest|barrel)$)/.test(b.typeId) && b.getComponent("minecraft:inventory")) {
      best = p;
      bestD = d;
    }
  }
  return best;
}

// ---------- claims (one worker per bed, kept on the world) ----------
/** One name for a bed, whichever of its two blocks you start from. @param {string} dim @param {{head: V3, foot: V3}} bed */
const claimKey = (dim, bed) => `${dim}|${[key(bed.head), key(bed.foot)].sort().join("|")}`;
/** Same bed? (either block order) @param {{head: V3, foot: V3}} a @param {{head: V3, foot: V3}} b */
export const sameBed = (a, b) => claimKey("", a) === claimKey("", b);
/** @returns {Record<string, string>} bed -> worker id */
const claims = () => getJSON(world, "crew:beds", {});
/** Who has claimed this bed (a worker id), if anyone. @param {string} dim @param {{head: V3, foot: V3}} bed */
export const bedClaimedBy = (dim, bed) => claims()[claimKey(dim, bed)];
/** @param {string} dim @param {{head: V3, foot: V3}} bed @param {string | undefined} workerId  undefined frees the bed */
export function claimBed(dim, bed, workerId) {
  const c = claims();
  if (workerId) c[claimKey(dim, bed)] = workerId;
  else delete c[claimKey(dim, bed)];
  setJSON(world, "crew:beds", c);
}

// ---------- the home ----------
/** @param {import("@minecraft/server").Entity} e @returns {Home | undefined} */
export const getHome = (e) => getJSON(e, "crew:home", undefined);
/** @param {import("@minecraft/server").Entity} e @param {Home | undefined} home */
export function setHome(e, home) {
  const old = getHome(e);
  if (old) claimBed(old.dim, old, undefined);
  setJSON(e, "crew:home", home);
  if (home) claimBed(home.dim, home, e.id);
}

/** Room for the worker's body: two blocks of air on something solid. @param {import("@minecraft/server").Dimension} dim @param {V3} c */
const standable = (dim, c) => passable(dim, c) && passable(dim, { x: c.x, y: c.y + 1, z: c.z }) && !passable(dim, { x: c.x, y: c.y - 1, z: c.z });

/** Where it stands when it gets into or out of bed: a free spot beside the bed. @param {import("@minecraft/server").Dimension} dim @param {Home} home */
export function bedside(dim, home) {
  for (const cell of [home.foot, home.head]) {
    for (const d of DIR4) {
      for (const dy of [0, 1, -1]) {
        const p = { x: cell.x + d.x, y: cell.y + dy, z: cell.z + d.z };
        if (!(sameXZ(p, home.head) || sameXZ(p, home.foot)) && standable(dim, p)) return p;
      }
    }
  }
  return { x: home.foot.x, y: home.foot.y + 1, z: home.foot.z }; // boxed in: stand on the bed
}
const sameXZ = (/** @type {V3} */ a, /** @type {V3} */ b) => a.x === b.x && a.z === b.z;

/**
 * Lying on the bed: feet at the foot end, head on the pillow. The sleep animation tips the model
 * onto its back with its head behind it, so it faces the foot of the bed and its feet rest at the
 * foot end.
 * @param {Home} home
 */
export function bedPose(home) {
  const dx = home.head.x - home.foot.x, dz = home.head.z - home.foot.z;
  const at = { x: home.foot.x + 0.5 - dx * 0.45, y: home.foot.y + 0.6, z: home.foot.z + 0.5 - dz * 0.45 };
  return { at, face: { x: at.x - dx * 4, y: at.y, z: at.z - dz * 4 } };
}

/**
 * Is the bed a safe place to sleep? A roof over it (not open to the sky) and no monsters within 16.
 * @param {import("@minecraft/server").Dimension} dim @param {Home} home
 * @returns {{safe: boolean, why?: string}}
 */
export function bedSafety(dim, home) {
  for (const cell of [home.head, home.foot]) {
    let roofed = false;
    for (let y = cell.y + 1; y <= cell.y + 48 && !roofed; y++) {
      const b = dim.getBlock({ x: cell.x, y, z: cell.z });
      if (!b) break;
      roofed = !passable(dim, { x: cell.x, y, z: cell.z });
    }
    if (!roofed) return { safe: false, why: "it's out in the open with no roof over it" };
  }
  try {
    const near = dim.getEntities({ location: { x: home.head.x + 0.5, y: home.head.y, z: home.head.z + 0.5 }, maxDistance: 16, families: ["monster"] });
    if (near.length) return { safe: false, why: "there are monsters nearby" };
  } catch {
    /* can't check: assume none */
  }
  return { safe: true };
}

// ---------- the morning restock ----------
/**
 * Takes supplies from the home chest: torches up to a stack, a packed lunch, and tools for any
 * empty kit slots (pickaxes and shovels for a Miner). Returns what it took, in words.
 * A Hauler has no tools and places no torches: it takes only its lunch, into its supply slots
 * (23 on), so its 18 cargo slots stay free.
 * @param {import("@minecraft/server").Dimension} dim @param {Home} home @param {import("@minecraft/server").Container} inv @param {string} role
 */
export function restock(dim, home, inv, role) {
  if (!home.chest) return "";
  const chest = dim.getBlock(home.chest)?.getComponent("minecraft:inventory")?.container;
  if (!chest) return "";
  /** @type {Record<string, number>} */
  const took = {};
  const count = (/** @type {(id: string) => boolean} */ f) => {
    let n = 0;
    for (let i = 0; i < inv.size; i++) {
      const it = inv.getItem(i);
      if (it && f(it.typeId)) n += it.amount;
    }
    return n;
  };
  const kinds = roleKinds(role);
  const hauler = role === "Hauler";
  for (let i = 0; i < chest.size; i++) {
    const it = chest.getItem(i);
    if (!it) continue;
    let want = 0;
    if (it.typeId === TORCH) want = hauler ? 0 : PACKED_TORCHES - count((id) => id === TORCH);
    else if (isFood(it.typeId)) want = PACKED_FOOD - count(isFood);
    else if (toolInfo(it) && kinds.includes(/** @type {any} */ (toolInfo(it)).kind) && kit(inv).length < KIT_SLOTS) {
      if (addToKit(inv, it).ok) {
        chest.setItem(i, undefined);
        took[/** @type {any} */ (toolInfo(it)).label] = (took[/** @type {any} */ (toolInfo(it)).label] ?? 0) + 1;
      }
      continue;
    }
    if (want <= 0) continue;
    const n = Math.min(want, it.amount);
    const part = it.clone();
    part.amount = n;
    const left = hauler ? stash(inv, part, SUPPLY_FIRST) : stash(inv, part);
    const moved = n - (left?.amount ?? 0);
    if (!moved) continue;
    if (it.amount - moved > 0) {
      it.amount -= moved;
      chest.setItem(i, it);
    } else chest.setItem(i, undefined);
    const name = it.typeId === TORCH ? "torches" : it.typeId.replace("minecraft:", "").replace(/_/g, " ");
    took[name] = (took[name] ?? 0) + moved;
  }
  const words = Object.entries(took).map(([k, n]) => `${n} ${k}`).join(", ");
  // the ledger re-reads this chest now, not on the next few-second pass (specs/settlement-layer.md)
  if (words && home.chest) noteChestUse(dim.id, home.chest);
  return words;
}

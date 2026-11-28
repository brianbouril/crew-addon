// The Sifter's station: a placeable sieve. Players sift one piece by hand, redstone keeps it
// going while power is on, and a Sifter worker can mind one sieve during the day.
// The chest on top is the input (the player, a hopper, the Hauler, or a Miner's output chest).
// The chest underneath is the output. This file does not import prospect or Hauler code.
import { GameMode, ItemStack, system, world } from "@minecraft/server";
import { EXHAUSTED, energy, isNight, setEnergy } from "./life.js";
import { isResting, startRest } from "./runner.js";
import { center, fmt, getJSON, setJSON, tell } from "./util.js";
import { loadedWorkers, roleOf } from "./workers.js";

export const SIEVE = "crew:sieve";
/** Balance: automatic sifts, one per second. Hand use does not wait. */
export const SIFT_EVERY = 20;
/** Balance: energy a Sifter on duty spends per piece. Redstone and hand use spend none. */
export const SIFT_DRAIN = 0.05;
const SIEVES = "crew:sieves";
const LINK = "crew:sieveLink";
const PAUSED = "crew:sievePaused";

/**
 * Bonus table. A roll is 0..9999. Weights are the balance numbers in specs/sifter.md.
 * The first row whose running total passes the roll wins. null is nothing.
 * @type {Record<string, { item: string | null, weight: number }[]>}
 */
export const LOOT = {
  "minecraft:gravel": [
    { item: "minecraft:flint", weight: 1000 },
    { item: "minecraft:iron_nugget", weight: 250 },
    { item: "minecraft:gold_nugget", weight: 80 },
    { item: "minecraft:coal", weight: 40 },
    { item: "minecraft:lapis_lazuli", weight: 15 },
    { item: "minecraft:raw_copper", weight: 10 },
    { item: "minecraft:emerald", weight: 3 },
    { item: "minecraft:diamond", weight: 2 },
    { item: null, weight: 8600 },
  ],
  "minecraft:sand": [
    { item: "minecraft:iron_nugget", weight: 150 },
    { item: "minecraft:gold_nugget", weight: 60 },
    { item: "minecraft:coal", weight: 30 },
    { item: "minecraft:lapis_lazuli", weight: 10 },
    { item: "minecraft:raw_copper", weight: 8 },
    { item: "minecraft:emerald", weight: 2 },
    { item: "minecraft:diamond", weight: 1 },
    { item: null, weight: 9739 },
  ],
  "minecraft:dirt": [
    { item: "minecraft:wheat_seeds", weight: 200 },
    { item: "minecraft:iron_nugget", weight: 80 },
    { item: "minecraft:gold_nugget", weight: 20 },
    { item: "minecraft:coal", weight: 15 },
    { item: "minecraft:bone_meal", weight: 50 },
    { item: "minecraft:emerald", weight: 1 },
    { item: null, weight: 9634 },
  ],
  "minecraft:soul_sand": [
    { item: "minecraft:quartz", weight: 200 },
    { item: "minecraft:gold_nugget", weight: 120 },
    { item: "minecraft:bone_meal", weight: 80 },
    { item: "minecraft:iron_nugget", weight: 40 },
    { item: "minecraft:coal", weight: 20 },
    { item: "minecraft:glowstone_dust", weight: 10 },
    { item: null, weight: 9530 },
  ],
};

const INPUT_IDS = new Set(Object.keys(LOOT));

/** @param {string} typeId @param {number} roll @returns {string | null} */
export function outcome(typeId, roll) {
  const rows = LOOT[typeId];
  if (!rows) return null;
  const n = ((Math.floor(roll) % 10000) + 10000) % 10000;
  let at = 0;
  for (const row of rows) {
    at += row.weight;
    if (n < at) return row.item;
  }
  return null;
}

/**
 * The roll for this sieve's next piece. Tests set globalThis.crewSiftRoll (0..9999) to force it.
 * Otherwise it is a fixed mix of the block position and how many pieces this sieve has sifted.
 * @param {number} x @param {number} y @param {number} z @param {number} n
 */
export function rollFor(x, y, z, n) {
  const forced = /** @type {any} */ (globalThis).crewSiftRoll;
  if (typeof forced === "number") return ((Math.floor(forced) % 10000) + 10000) % 10000;
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(z | 0, 0x85ebca6b) ^ Math.imul(n | 0, 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
  return ((h ^ (h >>> 16)) >>> 0) % 10000;
}

/** @param {string} id */
const pretty = (id) => id.replace(/^minecraft:/, "").replace(/_/g, " ");

/** @param {import("@minecraft/server").Dimension} dim @param {{x:number,y:number,z:number}} pos */
const sieveKey = (dim, pos) => `${dim.id}|${Math.floor(pos.x)},${Math.floor(pos.y)},${Math.floor(pos.z)}`;

/** @returns {Record<string, {n: number}>} */
const readMap = () => getJSON(world, SIEVES, {});
/** @param {Record<string, {n: number}>} map */
const writeMap = (map) => setJSON(world, SIEVES, map);

/** @param {import("@minecraft/server").Dimension} dim @param {{x:number,y:number,z:number}} pos */
export function rememberSieve(dim, pos) {
  const map = readMap();
  const k = sieveKey(dim, pos);
  if (!map[k]) {
    map[k] = { n: 0 };
    writeMap(map);
  }
  return map[k];
}

/** @param {import("@minecraft/server").Dimension} dim @param {{x:number,y:number,z:number}} pos */
export function forgetSieve(dim, pos) {
  const map = readMap();
  const k = sieveKey(dim, pos);
  if (!map[k]) return;
  delete map[k];
  writeMap(map);
}

/** @param {import("@minecraft/server").Entity} e */
export const linkedSieve = (e) => getJSON(e, LINK, undefined);
/** @param {import("@minecraft/server").Entity} e */
export const pausedSieve = (e) => getJSON(e, PAUSED, undefined);

/** @param {import("@minecraft/server").Entity} e @param {{x:number,y:number,z:number}} at */
export function linkSieve(e, at) {
  const pos = { x: Math.floor(at.x), y: Math.floor(at.y), z: Math.floor(at.z), dim: e.dimension.id };
  setJSON(e, PAUSED, undefined);
  setJSON(e, LINK, pos);
  rememberSieve(e.dimension, pos);
}

/** Pauses this worker's sieve, if it has one. @param {import("@minecraft/server").Entity} e */
export function pauseSieve(e) {
  const link = linkedSieve(e);
  if (!link) return false;
  setJSON(e, LINK, undefined);
  setJSON(e, PAUSED, link);
  return true;
}

/** Restores a paused sieve. @param {import("@minecraft/server").Entity} e @returns {string} */
export function resumeSieve(e) {
  const paused = pausedSieve(e);
  if (!paused) return "";
  setJSON(e, PAUSED, undefined);
  setJSON(e, LINK, paused);
  const dim = world.getDimension(paused.dim);
  if (dim) rememberSieve(dim, paused);
  return `${e.getDynamicProperty("crew:name") ?? "This worker"} is sifting again at ${fmt(paused)}.`;
}

/** One line for the menu and /crew:status. @param {import("@minecraft/server").Entity} e */
export function sieveStatusLine(e) {
  const link = linkedSieve(e);
  if (link) return `\nSifting at ${fmt(link)}: chest on top in, chest underneath out.`;
  const paused = pausedSieve(e);
  if (paused) return `\nSifting is paused at ${fmt(paused)}. Pick Continue to pick it up.`;
  return "";
}

/**
 * @param {import("@minecraft/server").Container | undefined} container
 * @param {string} typeId
 * @param {number} [freeingSlot] a slot that this sift will empty, so it counts as room
 */
function roomFor(container, typeId, freeingSlot = -1) {
  if (!container) return false;
  for (let i = 0; i < container.size; i++) {
    if (i === freeingSlot) return true;
    const s = container.getItem(i);
    if (!s) return true;
    if (s.typeId === typeId && s.amount < s.maxAmount) return true;
  }
  return false;
}

/** @param {import("@minecraft/server").Container} container @param {number} slot */
function takeOne(container, slot) {
  const it = container.getItem(slot);
  if (!it) return undefined;
  const id = it.typeId;
  if (it.amount <= 1) container.setItem(slot, undefined);
  else {
    it.amount -= 1;
    container.setItem(slot, it);
  }
  return id;
}

/** @param {import("@minecraft/server").Container} container @param {string} typeId */
function give(container, typeId) {
  const left = container.addItem(new ItemStack(typeId, 1));
  return !left;
}

/** @param {import("@minecraft/server").Container | undefined} container */
function findInput(container) {
  if (!container) return -1;
  for (let i = 0; i < container.size; i++) {
    const it = container.getItem(i);
    if (it && INPUT_IDS.has(it.typeId)) return i;
  }
  return -1;
}

/** @param {import("@minecraft/server").Dimension} dim @param {{x:number,y:number,z:number}} pos @param {number} dy */
function chest(dim, pos, dy) {
  const block = dim.getBlock({ x: pos.x, y: pos.y + dy, z: pos.z });
  return block?.getComponent("minecraft:inventory")?.container;
}

/**
 * Uses up one input and records the roll. Call only after room is confirmed.
 * @param {import("@minecraft/server").Dimension} dim
 * @param {{x:number,y:number,z:number}} pos
 * @param {string} typeId
 */
function siftPiece(dim, pos, typeId) {
  const map = readMap();
  const k = sieveKey(dim, pos);
  if (!map[k]) map[k] = { n: 0 };
  const n = map[k].n ?? 0;
  const yieldId = outcome(typeId, rollFor(pos.x, pos.y, pos.z, n));
  map[k].n = n + 1;
  writeMap(map);
  return yieldId;
}

/**
 * Chest to chest, one piece. False when there is nothing to do or nowhere to put the result.
 * @param {import("@minecraft/server").Dimension} dim @param {{x:number,y:number,z:number}} pos
 */
function siftAuto(dim, pos) {
  const input = chest(dim, pos, 1);
  const output = chest(dim, pos, -1);
  const slot = findInput(input);
  if (slot < 0 || !input || !output) return false;
  const typeId = input.getItem(slot)?.typeId;
  if (!typeId) return false;
  const map = readMap();
  const k = sieveKey(dim, pos);
  const n = map[k]?.n ?? 0;
  const yieldId = outcome(typeId, rollFor(pos.x, pos.y, pos.z, n));
  if (yieldId && !roomFor(output, yieldId)) return false;
  takeOne(input, slot);
  siftPiece(dim, pos, typeId);
  if (yieldId) give(output, yieldId);
  return true;
}

/**
 * The player uses the sieve. Holding an input sifts that piece into their inventory.
 * Otherwise one piece moves from the chest on top to the chest underneath.
 * @param {import("@minecraft/server").Player} player @param {import("@minecraft/server").Block} block
 */
export function handSift(player, block) {
  if (block?.typeId !== SIEVE) return;
  const dim = block.dimension;
  const pos = { x: Math.floor(block.location.x), y: Math.floor(block.location.y), z: Math.floor(block.location.z) };
  rememberSieve(dim, pos);
  const inv = player.getComponent("minecraft:inventory")?.container;
  const heldSlot = player.selectedSlotIndex ?? 0;
  const held = inv?.getItem(heldSlot);
  if (held && INPUT_IDS.has(held.typeId)) {
    const map = readMap();
    const n = map[sieveKey(dim, pos)]?.n ?? 0;
    const yieldId = outcome(held.typeId, rollFor(pos.x, pos.y, pos.z, n));
    const freeing = held.amount <= 1 ? heldSlot : -1;
    if (yieldId && (!inv || !roomFor(inv, yieldId, freeing))) {
      tell(player, "Your inventory is full, so the sieve left it.");
      return;
    }
    const id = takeOne(inv, heldSlot);
    const got = id ? siftPiece(dim, pos, id) : null;
    if (got && inv) give(inv, got);
    tell(player, got ? `Sifted ${pretty(id)}: ${pretty(got)}.` : `Sifted ${pretty(id)}: nothing this time.`);
    return;
  }
  const input = chest(dim, pos, 1);
  const slot = findInput(input);
  if (slot < 0 || !input) {
    tell(player, "Hold gravel, sand, dirt, or soul sand, or put it in the chest on top of the sieve.");
    return;
  }
  const typeId = input.getItem(slot)?.typeId;
  if (!typeId) return;
  const map = readMap();
  const n = map[sieveKey(dim, pos)]?.n ?? 0;
  const yieldId = outcome(typeId, rollFor(pos.x, pos.y, pos.z, n));
  const output = chest(dim, pos, -1);
  /** @type {import("@minecraft/server").Container | undefined} */
  let dest;
  if (output && (!yieldId || roomFor(output, yieldId))) dest = output;
  else if (inv && (!yieldId || roomFor(inv, yieldId))) dest = inv;
  if (yieldId && !dest) {
    tell(player, output ? "The chest under the sieve is full." : "Put a chest under the sieve, or make room in your inventory.");
    return;
  }
  takeOne(input, slot);
  const got = siftPiece(dim, pos, typeId);
  if (got && dest) give(dest, got);
  const where = dest === inv ? "your inventory" : "the chest underneath";
  tell(player, got ? `Sifted ${pretty(typeId)}: ${pretty(got)}, in ${where}.` : `Sifted ${pretty(typeId)}: nothing this time.`);
}

/** A linked Sifter who is awake, at day, and not exhausted. @param {{x:number,y:number,z:number}} pos @param {string} dimId */
function dutyWorker(pos, dimId) {
  /** @type {import("@minecraft/server").Entity | undefined} */
  let chosen;
  for (const e of loadedWorkers()) {
    if (!e.isValid || roleOf(e) !== "Sifter") continue;
    const link = linkedSieve(e);
    if (!link || link.dim !== dimId || link.x !== pos.x || link.y !== pos.y || link.z !== pos.z) continue;
    if (isResting(e) || isNight()) continue;
    if (energy(e) < EXHAUSTED) {
      try {
        startRest(e, "tired");
      } catch {
        /* entity gone */
      }
      continue;
    }
    chosen ??= e;
  }
  return chosen;
}

/** One pass over every sieve we know. Redstone and a Sifter on duty share one piece per pass. */
export function tickSieves() {
  /** @type {string[]} */
  const drop = [];
  for (const k of Object.keys(readMap())) {
    const parts = k.split("|");
    const dimId = parts[0];
    const nums = parts[1]?.split(",").map(Number);
    if (!dimId || !nums || nums.length !== 3 || nums.some((n) => !Number.isFinite(n))) {
      drop.push(k);
      continue;
    }
    const pos = { x: nums[0], y: nums[1], z: nums[2] };
    const dim = world.getDimension(dimId);
    if (!dim) continue;
    const block = dim.getBlock(pos);
    if (!block) continue;
    if (block.typeId !== SIEVE) {
      drop.push(k);
      continue;
    }
    const worker = dutyWorker(pos, dimId);
    const power = block.getRedstonePower?.();
    const powered = typeof power === "number" && power > 0;
    if (!worker && !powered) continue;
    if (!siftAuto(dim, pos)) continue;
    if (worker) setEnergy(worker, energy(worker) - SIFT_DRAIN);
  }
  if (!drop.length) return;
  const latest = readMap();
  for (const k of drop) delete latest[k];
  writeMap(latest);
}

/** @param {import("@minecraft/server").BlockPermutation | undefined} perm */
function permId(perm) {
  if (!perm) return undefined;
  const any = /** @type {any} */ (perm);
  return any.type?.id ?? any.typeId ?? any.id;
}

let started = false;
/** Subscribes the sieve to place, break, and use, and starts the once-a-second pass. */
export function startSifter() {
  if (started) return;
  started = true;
  system.runInterval(() => {
    try {
      tickSieves();
    } catch (err) {
      console.warn(`[Crew] ${err}`);
    }
  }, SIFT_EVERY);

  world.afterEvents.playerPlaceBlock.subscribe((ev) => {
    if (ev.block?.typeId === SIEVE) rememberSieve(ev.block.dimension, ev.block.location);
  });

  world.afterEvents.playerBreakBlock.subscribe((ev) => {
    if (permId(ev.brokenBlockPermutation) !== SIEVE) return;
    const dim = ev.dimension ?? ev.block?.dimension;
    const loc = ev.block?.location;
    if (!dim || !loc) return;
    forgetSieve(dim, loc);
    const creative = ev.player?.getGameMode?.() === GameMode.creative;
    if (!creative) {
      try {
        dim.spawnItem(new ItemStack(SIEVE, 1), center(loc));
      } catch {
        /* dimension gone */
      }
    }
  });

  world.beforeEvents.playerInteractWithBlock.subscribe((ev) => {
    if (ev.block?.typeId !== SIEVE) return;
    if (ev.itemStack?.typeId === "crew:survey_stake") return;
    if (ev.isFirstEvent === false) return;
    ev.cancel = true;
    const player = ev.player;
    const block = ev.block;
    system.run(() => {
      try {
        handSift(player, block);
      } catch (err) {
        console.warn(`[Crew] ${err}`);
      }
    });
  });
}

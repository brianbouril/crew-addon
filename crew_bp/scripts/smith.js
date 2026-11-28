// The Smith. An anvil in the barrel hires one. It works a forge: fuel in the chest on top,
// results in the chest underneath, materials from the depot and settlement chests (never a home
// chest). It smelts ore, crafts tools, swords, and armor, repairs them, and keeps two wooden
// tools for each tool-using worker. Other workers walk here for a replacement.
import { ItemStack, world } from "@minecraft/server";
import { EXHAUSTED, energy, getHome, setEnergy } from "./life.js";
import { addStorage, getSeen, noteChestUse, peopleOf, rosterOf, settlementOf, storageSpots } from "./settlement.js";
import { getRegistry } from "./store.js";
import { addToKit, kit, stash, toolInfo } from "./tools.js";
import { fmt, getJSON, setJSON } from "./util.js";
import { emit, loadedWorkers, meta, roleOf } from "./workers.js";

export const FORGE = "crew:forge";
export const ANVIL = "minecraft:anvil";
/** Two wooden tools of the worker's main kind, per worker. Balance. */
export const STOCK_EACH = 2;
export const LOW_TIER = "wooden";

/** @typedef {import("@minecraft/server").Container} Container */
/** @typedef {import("@minecraft/server").Dimension} Dimension */
/** @typedef {import("@minecraft/server").Entity} Entity */
/** @typedef {import("@minecraft/server").ItemStack} ItemStackT */
/** @typedef {{x:number,y:number,z:number}} V3 */
/** @typedef {{kind: "id"|"planks"|"sticks"|"fuel", id?: string, n: number}} Part */

const FORGES = "crew:forges";
const LINK = "crew:forge";
/** Main tool a role is stocked with. Hauler, Sifter, and Smith are not here. */
const PRIMARY = { Miner: "pickaxe", Digger: "shovel", Woodcutter: "axe", Farmer: "hoe" };
const TOOL_N = { pickaxe: 3, shovel: 1, axe: 3, hoe: 2, sword: 2 };
const TOOL_STICKS = { pickaxe: 2, shovel: 2, axe: 2, hoe: 2, sword: 1 };
const ARMOR_N = { helmet: 5, chestplate: 8, leggings: 7, boots: 4 };
/** Leather matches vanilla. The metal counts are Smith recipes: vanilla has no crafting recipe. */
const HORSE_N = { leather: 7, iron: 6, golden: 6, diamond: 6 };
const MAT = {
  wooden: "planks",
  stone: "minecraft:cobblestone",
  copper: "minecraft:copper_ingot",
  iron: "minecraft:iron_ingot",
  golden: "minecraft:gold_ingot",
  diamond: "minecraft:diamond",
  leather: "minecraft:leather",
  netherite: "minecraft:netherite_ingot",
};
const TEMPLATE = "minecraft:netherite_upgrade_smithing_template";

/** Ore and raw metal the forge smelts. Food, sand, and cobble are not here. */
export const SMELT = {
  "minecraft:raw_iron": "minecraft:iron_ingot",
  "minecraft:iron_ore": "minecraft:iron_ingot",
  "minecraft:deepslate_iron_ore": "minecraft:iron_ingot",
  "minecraft:raw_gold": "minecraft:gold_ingot",
  "minecraft:gold_ore": "minecraft:gold_ingot",
  "minecraft:deepslate_gold_ore": "minecraft:gold_ingot",
  "minecraft:nether_gold_ore": "minecraft:gold_ingot",
  "minecraft:raw_copper": "minecraft:copper_ingot",
  "minecraft:copper_ore": "minecraft:copper_ingot",
  "minecraft:deepslate_copper_ore": "minecraft:copper_ingot",
  "minecraft:ancient_debris": "minecraft:netherite_scrap",
};

const UNPACK = {
  "minecraft:raw_iron_block": ["minecraft:raw_iron", 9],
  "minecraft:raw_gold_block": ["minecraft:raw_gold", 9],
  "minecraft:raw_copper_block": ["minecraft:raw_copper", 9],
  "minecraft:iron_block": ["minecraft:iron_ingot", 9],
  "minecraft:gold_block": ["minecraft:gold_ingot", 9],
  "minecraft:copper_block": ["minecraft:copper_ingot", 9],
  "minecraft:diamond_block": ["minecraft:diamond", 9],
  "minecraft:netherite_block": ["minecraft:netherite_ingot", 9],
};
const NUGGET = {
  "minecraft:iron_nugget": "minecraft:iron_ingot",
  "minecraft:gold_nugget": "minecraft:gold_ingot",
  "minecraft:copper_nugget": "minecraft:copper_ingot",
};

const isPlanks = (id) => /_planks$/.test(id);
/** Coal and charcoal 8, lava 100, one log or plank 1. Sticks and crafted wood are not fuel. @param {string | undefined} id */
export function fuelOf(id) {
  if (!id) return 0;
  if (id === "minecraft:coal" || id === "minecraft:charcoal") return 8;
  if (id === "minecraft:lava_bucket") return 100;
  if (isPlanks(id)) return 1;
  if (/(?:_log|_wood|_stem|_hyphae)$/.test(id)) return 1;
  return 0;
}

/** @param {V3} at */
export const outputPos = (at) => ({ x: at.x, y: at.y - 1, z: at.z });
/** @param {V3} at */
export const fuelPos = (at) => ({ x: at.x, y: at.y + 1, z: at.z });
/** @param {V3} a @param {V3} b */
const samePos = (a, b) => a.x === b.x && a.y === b.y && a.z === b.z;
/** @param {string} dim @param {V3} p */
const spotKey = (dim, p) => `${dim}|${Math.floor(p.x)},${Math.floor(p.y)},${Math.floor(p.z)}`;
/** Beside the forge: the fuel chest and the output chest, not a depot across the yard. @param {V3} forge @param {V3} p */
const isLocal = (forge, p) => Math.max(Math.abs(p.x - forge.x), Math.abs(p.z - forge.z)) <= 1 && Math.abs(p.y - forge.y) <= 2;

/** @param {Dimension} dim @param {V3} p */
function boxAt(dim, p) {
  return dim.getBlock(p)?.getComponent("minecraft:inventory")?.container;
}

/** @param {Entity} e @param {V3} at */
export function linkForge(e, at) {
  const dim = e.dimension;
  const link = { x: Math.floor(at.x), y: Math.floor(at.y), z: Math.floor(at.z), dim: dim.id };
  setJSON(e, LINK, link);
  const m = meta(e);
  const s = settlementOf({ id: m.ownerId, name: m.ownerName });
  const under = dim.getBlock(outputPos(link));
  if (s && under && /chest|barrel/.test(under.typeId)) addStorage({ id: m.ownerId, name: m.ownerName }, s, under);
  return link;
}

/** @param {Entity} e @returns {{x:number,y:number,z:number,dim:string} | undefined} */
export function linkedForge(e) {
  const v = getJSON(e, LINK, undefined);
  return v && Number.isFinite(v.x) ? v : undefined;
}

/** @param {Entity} e */
function ownerRef(e) {
  const m = meta(e);
  return { id: m.ownerId, name: m.ownerName };
}

/** Home chests, loaded or last seen. The Smith never takes from these. */
function homeKeys() {
  /** @type {Set<string>} */
  const out = new Set();
  for (const e of loadedWorkers()) {
    const h = getHome(e);
    if (h?.chest) out.add(spotKey(h.dim, h.chest));
  }
  for (const sn of Object.values(getSeen())) if (sn.home?.dim) out.add(spotKey(sn.home.dim, sn.home));
  return out;
}

/**
 * Chests the Smith may take from: the fuel chest, plus depot and settlement storage.
 * Never the output chest and never a home chest.
 * @param {Dimension} dim @param {{id?: string, name?: string}} owner @param {V3} forge
 * @returns {{pos: V3, c: Container}[]}
 */
export function inputChests(dim, owner, forge) {
  const homes = homeKeys();
  const out = outputPos(forge);
  /** @type {V3[]} */
  const spots = [fuelPos(forge)];
  const s = settlementOf(owner);
  if (s) {
    for (const sp of storageSpots(s)) {
      if (sp.dim !== dim.id) continue;
      const p = { x: sp.x, y: sp.y, z: sp.z };
      if (samePos(p, out) || samePos(p, fuelPos(forge))) continue;
      if (homes.has(spotKey(dim.id, p))) continue;
      spots.push(p);
    }
  }
  /** @type {{pos: V3, c: Container}[]} */
  const chests = [];
  for (const pos of spots) {
    const c = boxAt(dim, pos);
    if (c) chests.push({ pos, c });
  }
  return chests;
}

/** @param {{pos: V3, c: Container}[]} chests @param {V3} forge */
const localChests = (chests, forge) => chests.filter((x) => isLocal(forge, x.pos));

/** @param {Container | undefined} c @param {(id: string) => boolean} pred */
function countBox(c, pred) {
  if (!c) return 0;
  let n = 0;
  for (let i = 0; i < c.size; i++) {
    const it = c.getItem(i);
    if (it && pred(it.typeId)) n += it.amount;
  }
  return n;
}

/** @param {{c: Container}[]} chests @param {(id: string) => boolean} pred */
const countChests = (chests, pred) => chests.reduce((n, x) => n + countBox(x.c, pred), 0);

/** @param {Container} inv @param {(id: string) => boolean} pred */
function countInv(inv, pred) {
  let n = 0;
  for (let i = 5; i < inv.size; i++) {
    const it = inv.getItem(i);
    if (it && pred(it.typeId)) n += it.amount;
  }
  return n;
}

/** @param {Part} part */
function predOf(part) {
  if (part.kind === "planks") return isPlanks;
  if (part.kind === "sticks") return (id) => id === "minecraft:stick";
  if (part.kind === "fuel") return (id) => fuelOf(id) > 0;
  return (id) => id === part.id;
}

/**
 * Removes up to `n` matching items. `fromInv` skips the tool kit.
 * @param {Container} c @param {(id: string) => boolean} pred @param {number} n @param {boolean} [fromInv]
 */
function takeFrom(c, pred, n, fromInv = false) {
  /** @type {{id: string, n: number, damage?: number}[]} */
  const took = [];
  let left = n;
  const start = fromInv ? 5 : 0;
  for (let i = start; i < c.size && left > 0; i++) {
    const it = c.getItem(i);
    if (!it || !pred(it.typeId)) continue;
    const use = Math.min(it.amount, left);
    const rest = it.amount - use;
    if (rest <= 0) c.setItem(i, undefined);
    else {
      const kept = it.clone();
      kept.amount = rest;
      c.setItem(i, kept);
    }
    took.push({ id: it.typeId, n: use, damage: it.damage || undefined });
    left -= use;
  }
  return { ok: left === 0, left, took };
}

/** Puts taken pieces back. Haul slots only, when `c` is a worker inventory. @param {Container} c @param {{id: string, n: number, damage?: number}[]} took @param {boolean} [haul] */
function refund(c, took, haul = false) {
  for (const part of took) {
    const it = new ItemStack(part.id, part.n);
    if (part.damage) it.damage = part.damage;
    const rest = haul ? stash(c, it) : c.addItem(it);
    if (rest && haul) c.addItem(rest);
  }
}

/** @param {Container} c @param {string} id @param {number} n */
function canFit(c, id, n) {
  const sample = new ItemStack(id, 1);
  let space = 0;
  for (let i = 0; i < c.size; i++) {
    const it = c.getItem(i);
    if (!it) space += sample.maxAmount;
    else if (it.isStackableWith(sample)) space += it.maxAmount - it.amount;
  }
  return space >= n;
}

/** @param {Dimension} dim @param {V3} pos */
function touch(dim, pos) {
  try { noteChestUse(dim.id, pos); } catch { /* ledger is best-effort */ }
}

/** 2 planks become 4 sticks, in this chest, when a recipe is short. @param {Container} c @param {number} need */
function ensureSticks(c, need) {
  let have = countBox(c, (id) => id === "minecraft:stick");
  if (have >= need) return true;
  const batches = Math.ceil((need - have) / 4);
  const got = takeFrom(c, isPlanks, batches * 2);
  if (!got.ok) {
    refund(c, got.took);
    return false;
  }
  const made = new ItemStack("minecraft:stick", batches * 4);
  const rest = c.addItem(made);
  return !rest || countBox(c, (id) => id === "minecraft:stick") >= need;
}

/** @param {string} dimId @param {V3} at */
function forgeKey(dimId, at) {
  return spotKey(dimId, at);
}
/** @param {string} dimId @param {V3} at */
function readFuel(dimId, at) {
  const map = getJSON(world, FORGES, {});
  return map[forgeKey(dimId, at)]?.fuel ?? 0;
}
/** @param {string} dimId @param {V3} at @param {number} fuel */
function writeFuel(dimId, at, fuel) {
  const map = getJSON(world, FORGES, {});
  const k = forgeKey(dimId, at);
  if (fuel > 0) map[k] = { fuel };
  else delete map[k];
  setJSON(world, FORGES, map);
}

/**
 * Uses one smelt of fuel. Leftover charges stay on the forge.
 * @param {Dimension} dim @param {V3} forge @param {Container} inv @param {{pos: V3, c: Container}[]} local
 */
function burnOne(dim, forge, inv, local) {
  const have = readFuel(dim.id, forge);
  if (have > 0) {
    writeFuel(dim.id, forge, have - 1);
    return { ok: true, id: "charge" };
  }
  const pred = (id) => fuelOf(id) > 0;
  let got = takeFrom(inv, pred, 1, true);
  /** @type {Container | undefined} */
  let back = local[0]?.c;
  if (!got.ok) {
    for (const src of local) {
      got = takeFrom(src.c, pred, 1);
      if (got.ok) {
        back = src.c;
        touch(dim, src.pos);
        break;
      }
    }
  }
  if (!got.ok) return { ok: false };
  const id = got.took[0].id;
  const charges = fuelOf(id);
  if (id === "minecraft:lava_bucket" && back) {
    const rest = back.addItem(new ItemStack("minecraft:bucket", 1));
    if (rest) stash(inv, rest);
  }
  writeFuel(dim.id, forge, Math.max(0, charges - 1));
  return { ok: true, id };
}

/**
 * @param {string} item @param {string | undefined} tier
 * @returns {{ok: true, id: string, parts: Part[], copyDamage?: boolean} | {ok: false, message: string}}
 */
export function resolveCraft(item, tier) {
  const raw = String(item ?? "").trim().toLowerCase();
  const t = String(tier ?? "").toLowerCase();
  const full = /^minecraft:[a-z0-9_]+$/.test(raw) ? raw : "";
  let kind = raw;
  let mat = t;
  if (full) {
    const horse = /^minecraft:(leather|iron|golden|diamond)_horse_armor$/.exec(full);
    if (horse) return craftParts("horse", horse[1]);
    const m = /^minecraft:(wooden|stone|copper|iron|golden|diamond|netherite|leather)_(pickaxe|shovel|axe|hoe|sword|helmet|chestplate|leggings|boots)$/.exec(full);
    if (!m) return { ok: false, message: `I don't forge ${full}.` };
    kind = m[2];
    mat = m[1];
  }
  if (!kind) return { ok: false, message: "Say what to make." };
  return craftParts(kind, mat || LOW_TIER);
}

/** @param {string} kind @param {string} mat */
function craftParts(kind, mat) {
  if (kind === "horse") {
    const n = HORSE_N[mat];
    if (!n) return { ok: false, message: "I make leather, iron, gold, and diamond horse armor." };
    const id = mat === "leather" ? "minecraft:leather_horse_armor" : `minecraft:${mat}_horse_armor`;
    const part = mat === "leather" ? { kind: "id", id: "minecraft:leather", n } : { kind: "id", id: MAT[mat] === "planks" ? "minecraft:oak_planks" : MAT[mat], n };
    return { ok: true, id, parts: [/** @type {Part} */ (part)] };
  }
  const tools = TOOL_N[kind];
  const armor = ARMOR_N[kind];
  if (!tools && !armor) return { ok: false, message: `I don't forge a ${kind}.` };
  if (mat === "leather" && !armor) return { ok: false, message: "Leather is for armor, not tools." };
  if (mat === "netherite") {
    if (kind === "horse") return { ok: false, message: "I don't make netherite horse armor." };
    const diamond = `minecraft:diamond_${kind}`;
    return {
      ok: true,
      id: `minecraft:netherite_${kind}`,
      copyDamage: true,
      parts: [
        { kind: "id", id: diamond, n: 1 },
        { kind: "id", id: "minecraft:netherite_ingot", n: 1 },
        { kind: "id", id: TEMPLATE, n: 1 },
      ],
    };
  }
  const matId = MAT[mat];
  if (!matId) return { ok: false, message: `I don't work ${mat}.` };
  /** @type {Part[]} */
  const parts = [];
  if (matId === "planks") parts.push({ kind: "planks", n: tools ?? armor });
  else parts.push({ kind: "id", id: matId, n: tools ?? armor });
  if (tools) parts.push({ kind: "sticks", n: TOOL_STICKS[kind] });
  const id = mat === "leather" ? `minecraft:leather_${kind}` : `minecraft:${mat}_${kind}`;
  return { ok: true, id, parts };
}

/** @param {string} id */
function repairMaterial(id) {
  const horse = /^minecraft:(leather|iron|golden|diamond)_horse_armor$/.exec(id);
  if (horse) return horse[1] === "leather" ? "minecraft:leather" : MAT[horse[1]] === "planks" ? "planks" : MAT[horse[1]];
  const m = /^minecraft:(leather|wooden|stone|copper|iron|golden|diamond|netherite|chainmail)_(pickaxe|shovel|axe|hoe|sword|helmet|chestplate|leggings|boots)$/.exec(id);
  if (!m) return undefined;
  if (m[1] === "chainmail") return "minecraft:iron_nugget";
  if (m[1] === "wooden") return "planks";
  return MAT[m[1]] ?? undefined;
}

/**
 * @param {{id?: string, name?: string}} owner
 * @returns {string[]}
 */
function rosterRoles(owner) {
  const s = settlementOf(owner);
  const ids = new Set(s ? peopleOf(s).map((p) => p.id) : owner.id ? [owner.id] : []);
  /** @type {string[]} */
  const roles = [];
  const seenLoaded = new Set();
  for (const e of loadedWorkers()) {
    const m = meta(e);
    if (!ids.has(m.ownerId)) continue;
    seenLoaded.add(e.id);
    roles.push(roleOf(e));
  }
  const seen = getSeen();
  for (const r of Object.values(getRegistry())) {
    if (!ids.has(r.ownerId) || seenLoaded.has(r.id)) continue;
    const role = seen[r.id]?.role;
    if (role) roles.push(role);
  }
  return roles;
}

/** @param {Container | undefined} output @param {string} kind */
function woodenHave(output, kind) {
  return countBox(output, (id) => id === `minecraft:wooden_${kind}`);
}

/**
 * The next thing stock should do, or undefined when the chest is caught up and nothing will smelt.
 * @param {Dimension} dim @param {{id?: string, name?: string}} owner @param {V3} forge @param {Container} output
 */
function stockPlan(dim, owner, forge, output) {
  const inputs = inputChests(dim, owner, forge);
  const all = [...inputs, { pos: outputPos(forge), c: output }];
  /** @type {Record<string, number>} */
  const need = {};
  for (const role of rosterRoles(owner)) {
    const kind = PRIMARY[role];
    if (kind) need[kind] = (need[kind] ?? 0) + STOCK_EACH;
  }
  for (const [kind, n] of Object.entries(need)) {
    if (woodenHave(output, kind) >= n) continue;
    const recipe = resolveCraft(kind, LOW_TIER);
    if (recipe.ok && canAfford(all, recipe.parts)) return { op: "craft", recipe, label: `a wooden ${kind}` };
  }
  const ore = firstOre(inputs);
  if (ore) return { op: "smelt", input: ore, output: SMELT[ore], parts: [{ kind: "id", id: ore, n: 1 }], label: ore.replace("minecraft:", "").replace(/_/g, " ") };
  const packed = firstUnpack(inputs, true);
  if (packed) return { op: "unpack", ...packed };
  return undefined;
}

/** @param {{c: Container}[]} chests @param {Part[]} parts */
function canAfford(chests, parts) {
  let planks = countChests(chests, isPlanks);
  let sticks = countChests(chests, (id) => id === "minecraft:stick");
  for (const part of parts) {
    if (part.kind === "sticks") {
      if (sticks < part.n) {
        const batches = Math.ceil((part.n - sticks) / 4);
        if (planks < batches * 2) return false;
        planks -= batches * 2;
        sticks += batches * 4;
      }
      sticks -= part.n;
    } else if (part.kind === "planks") {
      if (planks < part.n) return false;
      planks -= part.n;
    } else if (part.kind === "id") {
      if (countChests(chests, (id) => id === part.id) < part.n) return false;
    }
  }
  return true;
}

/** @param {{c: Container}[]} chests */
function firstOre(chests) {
  for (const id of Object.keys(SMELT)) if (countChests(chests, (x) => x === id) > 0) return id;
  return undefined;
}

/** @param {{pos: V3, c: Container}[]} chests @param {boolean} rawOnly */
function firstUnpack(chests, rawOnly) {
  for (const [id, spec] of Object.entries(UNPACK)) {
    if (rawOnly && !id.includes("raw_")) continue;
    for (const src of chests) {
      if (countBox(src.c, (x) => x === id) > 0) return { pos: src.pos, id, out: spec[0], n: spec[1] };
    }
  }
  return undefined;
}

/**
 * One forge step. Items already in `inv` (haul slots) count. Far chests are not touched:
 * the caller walks there first.
 * @param {Dimension} dim
 * @param {{id?: string, name?: string}} owner
 * @param {V3} forge
 * @param {Container} inv
 * @param {{op: string, recipe?: any, input?: string, output?: string, parts?: Part[], label?: string, pos?: V3, id?: string, out?: string, n?: number}} plan
 */
export function runPlan(dim, owner, forge, inv, plan) {
  const output = boxAt(dim, outputPos(forge));
  if (!output) return { ok: false, message: "Put a chest under the forge. That's where I leave what I make." };
  const inputs = inputChests(dim, owner, forge);
  const local = localChests(inputs, forge);
  if (plan.op === "unpack") {
    const src = inputs.find((x) => samePos(x.pos, /** @type {V3} */ (plan.pos)));
    if (!src) return { ok: false, message: "That block of ore isn't where I left it." };
    if (!canFit(src.c, /** @type {string} */ (plan.out), /** @type {number} */ (plan.n))) return { ok: false, message: "The chest is too full to unpack that block." };
    const got = takeFrom(src.c, (id) => id === plan.id, 1);
    if (!got.ok) return { ok: false, message: "That block of ore is gone." };
    src.c.addItem(new ItemStack(/** @type {string} */ (plan.out), /** @type {number} */ (plan.n)));
    touch(dim, src.pos);
    return { ok: true, message: `Unpacked ${plan.id?.replace("minecraft:", "").replace(/_/g, " ")}.` };
  }
  if (plan.op === "smelt") {
    const part = { kind: "id", id: plan.input, n: 1 };
    const got = gather(dim, inv, local, [part]);
    if (!got.ok) return { ok: false, message: "That ore isn't in the chest I can reach.", missing: true };
    if (!canFit(output, /** @type {string} */ (plan.output), 1)) {
      refund(inv, got.took, true);
      return { ok: false, message: "The chest under the forge is full." };
    }
    const fuel = burnOne(dim, forge, inv, local);
    if (!fuel.ok) {
      refund(inv, got.took, true);
      return { ok: false, message: "I need fuel. Coal, charcoal, a lava bucket, wood, or planks.", missing: true };
    }
    output.addItem(new ItemStack(/** @type {string} */ (plan.output), 1));
    touch(dim, outputPos(forge));
    return { ok: true, message: `Smelted ${plan.label}.` };
  }
  if (plan.op === "craft") {
    const recipe = plan.recipe;
    const pools = [...local, { pos: outputPos(forge), c: output }];
    for (const src of pools) {
      const sticks = recipe.parts.find((p) => p.kind === "sticks");
      if (sticks) ensureSticks(src.c, sticks.n);
    }
    const got = gather(dim, inv, pools, recipe.parts);
    if (!got.ok) {
      const home = homeOnly(dim, owner, forge, recipe.parts);
      return { ok: false, message: home ? `I won't take ${home} from a home chest.` : `I can't make ${plan.label} from the depot or the settlement chests.`, missing: true };
    }
    if (!canFit(output, recipe.id, 1)) {
      refund(inv, got.took, true);
      return { ok: false, message: "The chest under the forge is full." };
    }
    const made = new ItemStack(recipe.id, 1);
    if (recipe.copyDamage) {
      const donor = got.took.find((t) => t.id.startsWith("minecraft:diamond_"));
      if (donor?.damage) made.damage = donor.damage;
    }
    output.addItem(made);
    touch(dim, outputPos(forge));
    for (const src of pools) touch(dim, src.pos);
    return { ok: true, message: `Made ${plan.label}.`, item: recipe.id };
  }
  return { ok: false, message: "I don't know that job." };
}

/**
 * Pulls `parts` into `inv` from `inv` itself and `pools`. On failure, nothing is kept.
 * @param {Dimension} dim @param {Container} inv @param {{pos: V3, c: Container}[]} pools @param {Part[]} parts
 */
function gather(dim, inv, pools, parts) {
  /** @type {{id: string, n: number, damage?: number}[]} */
  const took = [];
  for (const part of parts) {
    const pred = predOf(part);
    let left = part.n;
    const fromInv = takeFrom(inv, pred, left, true);
    took.push(...fromInv.took);
    left = part.n - fromInv.took.reduce((n, t) => n + t.n, 0);
    for (const src of pools) {
      if (left <= 0) break;
      if (part.kind === "sticks") ensureSticks(src.c, left);
      const got = takeFrom(src.c, pred, left);
      if (got.took.length) touch(dim, src.pos);
      took.push(...got.took);
      left -= got.took.reduce((n, t) => n + t.n, 0);
    }
    if (left > 0) {
      refund(inv, took, true);
      return { ok: false, took: [], message: `I still need ${left} more.` };
    }
  }
  return { ok: true, took };
}

/** @param {Dimension} dim @param {{id?: string, name?: string}} owner @param {V3} forge @param {Part[]} parts */
function homeOnly(dim, owner, forge, parts) {
  const homes = [];
  for (const e of loadedWorkers()) {
    const h = getHome(e);
    if (!h?.chest || h.dim !== dim.id) continue;
    const c = boxAt(dim, h.chest);
    if (c) homes.push(c);
  }
  if (!homes.length) return "";
  const inputs = inputChests(dim, owner, forge);
  for (const part of parts) {
    const pred = predOf(part);
    const inHome = homes.reduce((n, c) => n + countBox(c, pred), 0);
    const inInputs = countChests(inputs, pred);
    if (inHome > 0 && inInputs < part.n) return part.kind === "id" ? part.id?.replace("minecraft:", "").replace(/_/g, " ") ?? "that" : part.kind;
  }
  return "";
}

/**
 * Where to walk for the next piece this plan still needs, if it isn't already in hand or local.
 * @param {Dimension} dim @param {{id?: string, name?: string}} owner @param {V3} forge @param {Container} inv @param {{parts?: Part[]}} plan
 * @returns {V3 | undefined}
 */
export function gatherSpot(dim, owner, forge, inv, plan) {
  const parts = plan.parts ?? plan.recipe?.parts ?? [];
  const inputs = inputChests(dim, owner, forge);
  const local = localChests(inputs, forge);
  const output = boxAt(dim, outputPos(forge));
  const pools = plan.op === "craft" && output ? [...local, { pos: outputPos(forge), c: output }] : local;
  for (const part of parts) {
    const pred = predOf(part);
    let have = countInv(inv, pred) + countChests(pools, pred);
    if (part.kind === "sticks") have += Math.floor(countChests(pools, isPlanks) / 2) * 4;
    if (have >= part.n) continue;
    for (const src of inputs) {
      if (isLocal(forge, src.pos)) continue;
      if (countBox(src.c, pred) > 0 || (part.kind === "sticks" && countBox(src.c, isPlanks) >= 2)) return src.pos;
    }
    if (readFuel(dim.id, forge) > 0 && part.kind === "fuel") continue;
  }
  if (plan.op === "smelt" && readFuel(dim.id, forge) <= 0 && countInv(inv, (id) => fuelOf(id) > 0) === 0 && countChests(local, (id) => fuelOf(id) > 0) === 0) {
    for (const src of inputs) {
      if (!isLocal(forge, src.pos) && countBox(src.c, (id) => fuelOf(id) > 0) > 0) return src.pos;
    }
  }
  return undefined;
}

/** Moves what `plan` needs from the chest at `pos` into the haul slots. @param {Dimension} dim @param {Container} inv @param {V3} pos @param {any} plan */
export function pickupAt(dim, inv, pos, plan) {
  const c = boxAt(dim, pos);
  if (!c) return 0;
  const parts = plan.parts ?? plan.recipe?.parts ?? [];
  let n = 0;
  for (const part of parts) {
    const have = countInv(inv, predOf(part));
    if (have >= part.n) continue;
    if (part.kind === "sticks") ensureSticks(c, part.n - have);
    const got = takeFrom(c, predOf(part), part.n - have);
    for (const t of got.took) {
      const it = new ItemStack(t.id, t.n);
      if (t.damage) it.damage = t.damage;
      const rest = stash(inv, it);
      if (rest) c.addItem(rest);
      n += t.n - (rest?.amount ?? 0);
    }
  }
  if ((plan.op === "smelt" || plan.fuel) && countInv(inv, (id) => fuelOf(id) > 0) === 0 && readFuel(dim.id, pos) <= 0) {
    const got = takeFrom(c, (id) => fuelOf(id) > 0, 1);
    for (const t of got.took) {
      stash(inv, new ItemStack(t.id, t.n));
      n += t.n;
    }
  }
  if (n) touch(dim, pos);
  return n;
}

/**
 * One repair, in the chest the item already sits in.
 * @param {Dimension} dim @param {{id?: string, name?: string}} owner @param {V3} forge @param {Container} inv @param {string | undefined} item @param {string | undefined} tier
 */
export function repairOne(dim, owner, forge, inv, item, tier) {
  const want = resolveRepairId(item, tier);
  const inputs = inputChests(dim, owner, forge);
  const outputC = boxAt(dim, outputPos(forge));
  /** @type {{pos: V3, c: Container}[]} */
  const pools = [];
  if (outputC) pools.push({ pos: outputPos(forge), c: outputC });
  pools.push(...inputs);
  for (const src of pools) {
    for (let i = 0; i < src.c.size; i++) {
      const it = src.c.getItem(i);
      if (!it || (want && it.typeId !== want)) continue;
      if (!repairMaterial(it.typeId)) continue;
      const d = it.getComponent("minecraft:durability");
      if (!d) {
        if (want && /horse_armor$/.test(it.typeId)) return { ok: false, message: "That horse armor isn't damaged, so there's nothing to repair.", none: true };
        continue;
      }
      if (d.damage <= 0) continue;
      const mat = repairMaterial(it.typeId);
      const part = mat === "planks" ? { kind: "planks", n: 1 } : { kind: "id", id: mat, n: 1 };
      const local = localChests(inputs, forge);
      const matPools = outputC ? [...local, { pos: outputPos(forge), c: outputC }] : local;
      const got = gather(dim, inv, matPools, [/** @type {Part} */ (part)]);
      if (!got.ok) return { ok: false, message: `I need ${mat === "planks" ? "planks" : mat?.replace("minecraft:", "").replace(/_/g, " ")} to repair that.`, missing: true };
      const restore = Math.max(1, Math.ceil(d.maxDurability / 4));
      const next = it.clone();
      next.damage = Math.max(0, d.damage - restore);
      src.c.setItem(i, next);
      touch(dim, src.pos);
      return { ok: true, message: `Repaired the ${it.typeId.replace("minecraft:", "").replace(/_/g, " ")}.`, item: it.typeId };
    }
  }
  if (want && /horse_armor$/.test(want)) return { ok: false, message: "That horse armor isn't damaged, so there's nothing to repair.", none: true };
  return { ok: false, message: "I can't find a damaged piece to repair in the forge chest or the depot.", missing: true };
}

/** @param {string | undefined} item @param {string | undefined} tier */
function resolveRepairId(item, tier) {
  const raw = String(item ?? "").trim().toLowerCase();
  if (!raw || raw === "any") return "";
  if (raw.startsWith("minecraft:")) return raw;
  const made = resolveCraft(raw, tier || "iron");
  return made.ok ? made.id : "";
}

/**
 * @param {Dimension} dim @param {{id?: string, name?: string}} owner @param {V3} forge @param {Container} inv @param {any} job @param {any} st
 */
export function planStep(dim, owner, forge, inv, job, st) {
  const output = boxAt(dim, outputPos(forge));
  if (!output) return { ok: false, message: "Put a chest under the forge. That's where I leave what I make." };
  const action = job.action ?? "stock";
  if (action === "repair") {
    const r = repairOne(dim, owner, forge, inv, job.item, job.tier);
    if (r.ok) st.made = (st.made ?? 0) + 1;
    const done = r.none || (r.ok && st.made >= (job.count ?? 1));
    return { ...r, done };
  }
  if (!st.plan) {
    if (action === "stock") {
      const packed = stockPlan(dim, owner, forge, output);
      if (!packed) return { ok: true, idle: true, message: "The forge is stocked, and there's nothing here to smelt." };
      st.plan = packed.op === "craft" ? { ...packed, parts: packed.recipe.parts } : packed;
    } else if (action === "craft") {
      const recipe = resolveCraft(job.item, job.tier);
      if (!recipe.ok) return { ok: false, message: recipe.message, done: true };
      st.plan = { op: "craft", recipe, parts: recipe.parts, label: recipe.id.replace("minecraft:", "").replace(/_/g, " ") };
    } else if (action === "smelt") {
      const which = !job.item || job.item === "ore" ? firstOre(inputChests(dim, owner, forge)) : job.item.startsWith("minecraft:") ? job.item : `minecraft:${job.item}`;
      if (!which || !SMELT[which]) {
        const packed = firstUnpack(inputChests(dim, owner, forge), true);
        if (packed && (!job.item || job.item === "ore" || job.item.includes("raw"))) {
          st.plan = { op: "unpack", ...packed };
        } else return { ok: false, message: which ? `I don't smelt ${which}.` : "There's no ore to smelt.", missing: true };
      } else st.plan = { op: "smelt", input: which, output: SMELT[which], parts: [{ kind: "id", id: which, n: 1 }], label: which.replace("minecraft:", "").replace(/_/g, " ") };
    } else return { ok: false, message: "I don't know that job.", done: true };
  }
  const plan = st.plan;
  if (plan.op === "smelt" || plan.op === "craft") {
    const spot = gatherSpot(dim, owner, forge, inv, plan);
    if (spot) return { ok: true, walk: spot, plan };
  }
  if (plan.op === "unpack" && plan.pos && !isLocal(forge, plan.pos)) return { ok: true, walk: plan.pos, plan };
  const ran = runPlan(dim, owner, forge, inv, plan);
  st.plan = undefined;
  if (ran.ok && plan.op !== "unpack") st.made = (st.made ?? 0) + 1;
  const goal = job.count ?? 1;
  const done = action !== "stock" && plan.op !== "unpack" && ran.ok && (st.made ?? 0) >= goal;
  return { ...ran, done };
}

/** @param {any} job @param {any} st */
export function smithStatus(job, st) {
  if (st?.phase === "to_spot" || st?.phase === "pickup") return "Fetching materials";
  if (st?.phase === "to_forge") return "Walking to the forge";
  if (job?.action === "craft") return "Making";
  if (job?.action === "repair") return "Repairing";
  if (job?.action === "smelt") return "Smelting";
  return "At the forge";
}

/** One line for the menu. @param {Entity} e */
export function smithStatusLine(e) {
  const link = linkedForge(e);
  if (roleOf(e) !== "Smith") return "";
  if (!link) return "\nNo forge yet.";
  return `\nForge at ${fmt(link)}.`;
}

/**
 * Advances a Smith who is on a smith job. Walking comes from the engine.
 * @param {any} rt
 * @param {{walkTo: Function, startRest: Function, stopJob: Function}} ctx
 */
export function stepSmith(rt, ctx) {
  const { e, job, st } = rt;
  const inv = e.getComponent("minecraft:inventory")?.container;
  if (!inv) return;
  if (energy(e) < EXHAUSTED) {
    ctx.startRest(e, "tired");
    return;
  }
  e.setProperty("crew:anim", rt.walk?.path ? 1 : 0);
  if (st.phase === "to_spot" && st.spot) {
    if (ctx.walkTo(rt, st.spot, 2.6, true) !== "arrived") return;
    if (st.plan?.op === "unpack") {
      runPlan(e.dimension, ownerRef(e), job.at, inv, st.plan);
      st.plan = undefined;
    } else pickupAt(e.dimension, inv, st.spot, st.plan ?? {});
    st.phase = "to_forge";
    st.spot = undefined;
  }
  if (st.phase !== "work") {
    st.phase = "to_forge";
    if (ctx.walkTo(rt, job.at, 2.6, true) !== "arrived") return;
    st.phase = "work";
  }
  e.setProperty("crew:anim", 2);
  if ((st.cool ?? 0) > 0) {
    st.cool--;
    return;
  }
  const forge = job.at;
  const block = e.dimension.getBlock(forge);
  if (block?.typeId !== FORGE) {
    ctx.stopJob(e, "The forge is gone, so I stopped.");
    return;
  }
  forgetFuelIfGone(e.dimension, forge);
  const owner = ownerRef(e);
  const result = planStep(e.dimension, owner, forge, inv, job, st);
  if (result.walk) {
    st.spot = result.walk;
    st.phase = "to_spot";
    e.setProperty("crew:anim", 1);
    return;
  }
  const pace = /** @type {any} */ (globalThis).crewTestFast === true ? 4 : 20;
  st.cool = result.idle ? pace * 5 : pace;
  if (result.idle) {
    if (!st.toldIdle) {
      st.toldIdle = true;
      emit(e, "smith_idle", { message: result.message }, result.message);
    }
    return;
  }
  st.toldIdle = false;
  if (result.ok && !result.idle) {
    setEnergy(e, energy(e) - 0.2);
    emit(e, planEvent(job), { item: result.item ?? null }, result.message);
  } else if (!st.told) {
    st.told = result.message;
    emit(e, "smith_wait", { message: result.message }, result.message);
  } else if (st.told !== result.message) {
    st.told = result.message;
    emit(e, "smith_wait", { message: result.message }, result.message);
  }
  if (result.done) ctx.stopJob(e, result.message, true);
}

/** @param {any} job */
function planEvent(job) {
  if (job.action === "repair") return "repaired";
  if (job.action === "smelt") return "smelted";
  return "crafted";
}

/** @param {Dimension} dim @param {V3} forge */
function forgetFuelIfGone(dim, forge) {
  if (dim.getBlock(forge)?.typeId === FORGE) return;
  writeFuel(dim.id, forge, 0);
}

/**
 * Starts the stock job when a Smith is idle in the daytime with a forge.
 * The engine calls this. A player's Stop sets crew:smithOff until Continue.
 * @param {Entity} e @param {{startJob: Function}} ctx
 */
export function smithIdle(e, ctx) {
  if (roleOf(e) !== "Smith") return;
  if (e.getDynamicProperty("crew:smithOff")) return;
  if (getJSON(e, "crew:job", undefined)) return;
  const link = linkedForge(e);
  if (!link || link.dim !== e.dimension.id) return;
  if (e.dimension.getBlock(link)?.typeId !== FORGE) return;
  ctx.startJob(e, {
    type: "smith",
    id: `smith${Date.now().toString(36)}`,
    by: { name: "routine", console: true },
    at: { x: link.x, y: link.y, z: link.z },
    action: "stock",
    count: 1,
  });
}

/**
 * A Smith's output chest that holds a tool of `kinds` at or below `maxTier`.
 * Unknown tier means the lowest only (tier 0), so a worker never grabs a diamond unasked.
 * @param {Entity} worker @param {string | string[]} kinds @param {number | undefined} maxTier
 * @returns {V3 | undefined}
 */
export function smithToolSpot(worker, kinds, maxTier) {
  const list = Array.isArray(kinds) ? kinds : [kinds];
  const cap = maxTier === undefined ? 0 : maxTier;
  const m = meta(worker);
  const s = settlementOf({ id: m.ownerId, name: m.ownerName });
  const people = new Set(s ? peopleOf(s).map((p) => p.id) : [m.ownerId]);
  for (const e of loadedWorkers()) {
    if (!e.isValid || roleOf(e) !== "Smith") continue;
    if (!people.has(meta(e).ownerId)) continue;
    const link = linkedForge(e);
    if (!link || link.dim !== worker.dimension.id) continue;
    const pos = outputPos(link);
    const c = boxAt(worker.dimension, pos);
    if (c && bestIn(c, list, cap)) return pos;
  }
  return undefined;
}

/** Why a replacement isn't in a Smith's chest. @param {Entity} worker @param {string | string[]} kinds */
export function smithWaitLine(worker, kinds) {
  const list = (Array.isArray(kinds) ? kinds : [kinds]).join(" or ");
  const m = meta(worker);
  const s = settlementOf({ id: m.ownerId, name: m.ownerName });
  const people = new Set(s ? peopleOf(s).map((p) => p.id) : [m.ownerId]);
  const smiths = loadedWorkers().filter((e) => e.isValid && roleOf(e) === "Smith" && people.has(meta(e).ownerId) && linkedForge(e));
  if (!smiths.length) return `There's no Smith with a forge, so I'll wait. I won't make a ${list} at home.`;
  return `The Smith has no ${list} I can take, so I'll wait. I won't make one at home.`;
}

/** @param {Container} c @param {string[]} kinds @param {number} cap */
function bestIn(c, kinds, cap) {
  /** @type {{slot: number, info: import("./tools.js").ToolInfo, left: number} | undefined} */
  let best;
  for (let i = 0; i < c.size; i++) {
    const info = toolInfo(c.getItem(i));
    if (!info || !kinds.includes(info.kind) || info.tier > cap) continue;
    const it = c.getItem(i);
    const d = it?.getComponent("minecraft:durability");
    const left = d ? d.maxDurability - d.damage : 1;
    if (!best || info.tier > best.info.tier || (info.tier === best.info.tier && left < best.left)) best = { slot: i, info, left };
  }
  return best;
}

/**
 * Takes one allowed tool from the Smith's chest into the kit.
 * @param {Entity} e @param {V3} at @param {Container} inv @param {string[]} kinds @param {number | undefined} maxTier
 */
export function pullCappedTool(e, at, inv, kinds, maxTier) {
  const c = boxAt(e.dimension, at);
  if (!c) return "";
  const cap = maxTier === undefined ? 0 : maxTier;
  const best = bestIn(c, kinds, cap);
  if (!best) return "";
  const it = c.getItem(best.slot);
  if (!it) return "";
  const put = addToKit(inv, it);
  if (!put.ok) return "";
  c.setItem(best.slot, undefined);
  if (put.spill) {
    const rest = c.addItem(put.spill);
    if (rest) e.dimension.spawnItem(rest, e.location);
  }
  try { noteChestUse(e.dimension.id, at); } catch { /* ledger */ }
  return best.info.label;
}

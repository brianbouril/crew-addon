// Ongoing forest and field jobs (specs/woodcutter-farmer.md). The runner calls stepPlot; this
// file decides what to cut, plant, or leave. It does not cook.
import { BlockPermutation, ItemStack, world } from "@minecraft/server";
import { PLOT_HEIGHT } from "./catalog.js";
import { AIR } from "./blocks.js";
import { getHome } from "./life.js";
import { noteChestUse } from "./settlement.js";
import { KIT_SLOTS, chooseTool, kit, stash, ticksFor, toolInfo, toolPref, wear } from "./tools.js";
import { fmt } from "./util.js";
import { emit, holdTool } from "./workers.js";

/** @typedef {{x:number,y:number,z:number}} V3 */
/** @typedef {{min: V3, max: V3}} Box */

const DIR6 = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
const key = (/** @type {V3} */ p) => `${p.x},${p.y},${p.z}`;
const add = (/** @type {V3} */ p, /** @type {number[]} */ d) => ({ x: p.x + d[0], y: p.y + d[1], z: p.z + d[2] });
const cheb = (/** @type {V3} */ a, /** @type {V3} */ b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y), Math.abs(a.z - b.z));

const LOG = /^minecraft:(oak|spruce|birch|jungle|acacia|dark_oak|mangrove|cherry|pale_oak)_log$|^minecraft:(crimson|warped)_stem$/;
const BEE = /^minecraft:(bee_nest|beehive)$/;
const SAPLING = {
  oak: "minecraft:oak_sapling", spruce: "minecraft:spruce_sapling", birch: "minecraft:birch_sapling",
  jungle: "minecraft:jungle_sapling", acacia: "minecraft:acacia_sapling", dark_oak: "minecraft:dark_oak_sapling",
  mangrove: "minecraft:mangrove_propagule", cherry: "minecraft:cherry_sapling", pale_oak: "minecraft:pale_oak_sapling",
  crimson: "minecraft:crimson_fungus", warped: "minecraft:warped_fungus",
};

/**
 * What the farmer plants. `soil` is a block item the player must provide; the farmer does not
 * dig it out of the world. `mode` is how it grows: aged crop, stem (fruit beside it), cocoa on
 * a jungle log, berry bush, or a column that keeps its base.
 * @type {{item: string, block: string, age: number, ground: string, soil?: string, mode?: string, fruit?: string, space?: boolean}[]}
 */
export const CROPS = [
  { item: "minecraft:wheat_seeds", block: "minecraft:wheat", age: 7, ground: "minecraft:farmland" },
  { item: "minecraft:beetroot_seeds", block: "minecraft:beetroot", age: 3, ground: "minecraft:farmland" },
  { item: "minecraft:carrot", block: "minecraft:carrots", age: 7, ground: "minecraft:farmland" },
  { item: "minecraft:potato", block: "minecraft:potatoes", age: 7, ground: "minecraft:farmland" },
  { item: "minecraft:torchflower_seeds", block: "minecraft:torchflower_crop", age: 1, ground: "minecraft:farmland" },
  { item: "minecraft:pitcher_pod", block: "minecraft:pitcher_crop", age: 4, ground: "minecraft:farmland" },
  { item: "minecraft:pumpkin_seeds", block: "minecraft:pumpkin_stem", age: 7, ground: "minecraft:farmland", mode: "stem", fruit: "minecraft:pumpkin" },
  { item: "minecraft:melon_seeds", block: "minecraft:melon_stem", age: 7, ground: "minecraft:farmland", mode: "stem", fruit: "minecraft:melon" },
  { item: "minecraft:cocoa_beans", block: "minecraft:cocoa", age: 2, ground: "minecraft:jungle_log", soil: "minecraft:jungle_log", mode: "cocoa" },
  { item: "minecraft:sweet_berries", block: "minecraft:sweet_berry_bush", age: 3, ground: "minecraft:dirt", mode: "berry" },
  { item: "minecraft:nether_wart", block: "minecraft:nether_wart", age: 3, ground: "minecraft:soul_sand", soil: "minecraft:soul_sand" },
  { item: "minecraft:sugar_cane", block: "minecraft:sugar_cane", age: 0, ground: "minecraft:sand", soil: "minecraft:sand", mode: "column" },
  { item: "minecraft:cactus", block: "minecraft:cactus", age: 0, ground: "minecraft:sand", soil: "minecraft:sand", mode: "column", space: true },
  { item: "minecraft:bamboo", block: "minecraft:bamboo", age: 0, ground: "minecraft:dirt", mode: "column" },
];
/** A water row every 9 blocks, through the middle of each band, so crops stay within 4 of water. */
export const WATER_EVERY = 9;
const CROP_BY_BLOCK = Object.fromEntries(CROPS.map((c) => [c.block, c]));
const CROP_BY_ITEM = Object.fromEntries(CROPS.map((c) => [c.item, c]));
const TILL = new Set(["minecraft:dirt", "minecraft:grass_block"]);
/** Kept in the inventory for the next plant, not dumped in the deposit. */
const KEEP_CARRY = /_sapling$|_seeds$|^minecraft:(carrot|potato|beetroot_seeds|pitcher_pod|torchflower_seeds|nether_wart|crimson_fungus|warped_fungus|mangrove_propagule|bone_meal|soul_sand|cocoa_beans|sand|jungle_log)$/;

/** @param {string} id */
export function woodKind(id) {
  const m = LOG.exec(id);
  if (!m) return undefined;
  return m[1] ?? m[2];
}
/** @param {string} id */
function leafKind(id) {
  const m = /^minecraft:(oak|spruce|birch|jungle|acacia|dark_oak|mangrove|cherry|pale_oak|azalea|flowering_azalea)_leaves$/.exec(id);
  if (m) return m[1] === "flowering_azalea" ? "azalea" : m[1];
  if (id === "minecraft:nether_wart_block") return "crimson";
  if (id === "minecraft:warped_wart_block") return "warped";
  return undefined;
}
/** @param {string} wood @param {string} leafId */
function leafMatches(wood, leafId) {
  const k = leafKind(leafId);
  if (!k) return false;
  if (wood === "oak" && (k === "oak" || k === "azalea")) return true;
  return k === wood;
}

/** @param {V3} p @param {Box} box */
function inFoot(p, box) {
  return p.x >= box.min.x && p.x <= box.max.x && p.z >= box.min.z && p.z <= box.max.z && p.y >= box.min.y && p.y <= box.min.y + PLOT_HEIGHT - 1;
}

/**
 * Natural trees in the footprint: logs of one kind connected to matching leaves. Built logs
 * (no leaves) are not trees. Beehives next to the tree are reported, not cut.
 * @param {import("@minecraft/server").Dimension} dim @param {Box} box
 */
export function findTrees(dim, box) {
  const seen = new Set();
  /** @type {{kind: string, logs: V3[], leaves: V3[], hives: V3[], stumps: V3[]}[]} */
  const trees = [];
  for (let x = box.min.x; x <= box.max.x; x++) for (let z = box.min.z; z <= box.max.z; z++) {
    for (let y = box.min.y; y < box.min.y + PLOT_HEIGHT; y++) {
      const start = { x, y, z };
      if (seen.has(key(start)) || !woodKind(dim.getBlock(start)?.typeId ?? "")) continue;
      const kind = /** @type {string} */ (woodKind(dim.getBlock(start)?.typeId ?? ""));
      /** @type {V3[]} */
      const logs = [];
      const q = [start];
      while (q.length) {
        const c = /** @type {V3} */ (q.pop());
        const k = key(c);
        if (seen.has(k)) continue;
        const id = dim.getBlock(c)?.typeId ?? "";
        if (woodKind(id) !== kind || !inFoot(c, box)) continue;
        seen.add(k);
        logs.push(c);
        for (const d of DIR6) q.push(add(c, d));
      }
      /** @type {V3[]} */
      const leaves = [];
      const lseen = new Set(logs.map(key));
      const lq = [...logs];
      while (lq.length) {
        const c = /** @type {V3} */ (lq.pop());
        for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
          if (!dx && !dy && !dz) continue;
          const n = { x: c.x + dx, y: c.y + dy, z: c.z + dz };
          if (n.y < box.min.y || n.y >= box.min.y + PLOT_HEIGHT || lseen.has(key(n))) continue;
          const id = dim.getBlock(n)?.typeId ?? "";
          if (!leafMatches(kind, id)) continue;
          if (!logs.some((t) => cheb(t, n) <= 6)) continue;
          lseen.add(key(n));
          leaves.push(n);
          lq.push(n);
        }
      }
      if (!leaves.length) continue;
      /** @type {V3[]} */
      const hives = [];
      const hseen = new Set();
      for (const c of [...logs, ...leaves]) for (const d of DIR6) {
        const n = add(c, d);
        const id = dim.getBlock(n)?.typeId ?? "";
        if (BEE.test(id) && !hseen.has(key(n))) {
          hseen.add(key(n));
          hives.push(n);
        }
      }
      const y0 = Math.min(...logs.map((c) => c.y));
      const base = logs.filter((c) => c.y === y0);
      /** @type {V3[]} */
      let stumps = [base[0]];
      for (const a of base) {
        const sq = [[0, 0], [1, 0], [0, 1], [1, 1]].map(([dx, dz]) => base.find((b) => b.x === a.x + dx && b.z === a.z + dz));
        if (sq.every(Boolean)) {
          stumps = /** @type {V3[]} */ (sq);
          break;
        }
      }
      trees.push({ kind, logs, leaves, hives, stumps });
    }
  }
  return trees;
}

/**
 * Where the water channels go. They run along the longer side (east-west when the field is
 * square). Along the other side, each band of 9 blocks, and the shorter band at the end, gets
 * one water row through its middle.
 * @param {Box} box @returns {V3[]}
 */
export function channelCells(box) {
  const sx = box.max.x - box.min.x + 1, sz = box.max.z - box.min.z + 1;
  const alongX = sx >= sz;
  const span = alongX ? sz : sx;
  /** @type {V3[]} */
  const cells = [];
  for (let start = 0; start < span; start += WATER_EVERY) {
    const band = Math.min(WATER_EVERY, span - start);
    const at = start + Math.floor((band - 1) / 2);
    if (alongX) {
      const z = box.min.z + at;
      for (let x = box.min.x; x <= box.max.x; x++) cells.push({ x, y: box.min.y, z });
    } else {
      const x = box.min.x + at;
      for (let z = box.min.z; z <= box.max.z; z++) cells.push({ x, y: box.min.y, z });
    }
  }
  return cells;
}

const SIDES = [[1, 0], [-1, 0], [0, 1], [0, -1]];
/** @param {import("@minecraft/server").Dimension} dim @param {V3} at */
function sidesAir(dim, at) {
  return SIDES.every(([dx, dz]) => AIR.has(dim.getBlock({ x: at.x + dx, y: at.y, z: at.z + dz })?.typeId ?? "x"));
}
/** @param {import("@minecraft/server").Dimension} dim @param {V3} ground @param {Box} box */
function besideWater(dim, ground, box) {
  return SIDES.some(([dx, dz]) => {
    const n = { x: ground.x + dx, y: ground.y, z: ground.z + dz };
    if ((dim.getBlock(n)?.typeId ?? "") === "minecraft:water") return true;
    return channelCells(box).some((c) => c.x === n.x && c.y === n.y && c.z === n.z);
  });
}
/** Open side of a jungle log for a cocoa pod. Direction matches Bedrock's cocoa `direction` (0 south, 1 west, 2 north, 3 east). @param {import("@minecraft/server").Dimension} dim @param {V3} log */
function cocoaSide(dim, log) {
  const faces = [[0, -1, 2], [0, 1, 0], [1, 0, 3], [-1, 0, 1]];
  for (const [dx, dz, direction] of faces) {
    const at = { x: log.x + dx, y: log.y, z: log.z + dz };
    const id = dim.getBlock(at)?.typeId ?? "";
    if (AIR.has(id)) return { at, direction };
  }
  return undefined;
}

/**
 * What the field needs this pass. `plants` is what the player provided, crops already growing first.
 * @param {import("@minecraft/server").Dimension} dim @param {Box} box @param {typeof CROPS} plants
 */
export function findFieldWork(dim, box, plants) {
  /** @type {any[]} */
  const actions = [];
  for (const at of channelCells(box)) {
    if ((dim.getBlock(at)?.typeId ?? "") !== "minecraft:water") actions.push({ kind: "water", at });
  }
  for (let x = box.min.x; x <= box.max.x; x++) for (let z = box.min.z; z <= box.max.z; z++) {
    const ground = { x, y: box.min.y, z };
    const above = { x, y: box.min.y + 1, z };
    const gId = dim.getBlock(ground)?.typeId ?? "";
    const aBlock = dim.getBlock(above);
    const aId = aBlock?.typeId ?? "";
    if (aId === "minecraft:pumpkin" || aId === "minecraft:melon") actions.push({ kind: "fruit", at: above });
    if (gId === "minecraft:cocoa" || aId === "minecraft:cocoa") {
      const at = gId === "minecraft:cocoa" ? ground : above;
      const block = dim.getBlock(at);
      const age = Number(block?.permutation?.getState?.("age") ?? 0);
      const crop = CROP_BY_ITEM["minecraft:cocoa_beans"];
      actions.push(age >= 2 ? { kind: "cocoa-pick", at, crop } : { kind: "bonemeal", at, crop });
    }
    const crop = CROP_BY_BLOCK[aId];
    if (crop?.mode === "column") {
      let y = above.y + 1;
      while ((dim.getBlock({ x, y, z })?.typeId ?? "") === crop.block && y < box.min.y + PLOT_HEIGHT) {
        actions.push({ kind: "break", at: { x, y, z } });
        y++;
      }
      continue;
    }
    if (crop) {
      const age = Number(aBlock?.permutation?.getState?.("age") ?? 0);
      if (crop.mode === "berry") actions.push(age >= 2 ? { kind: "berry", at: above, crop } : { kind: "bonemeal", at: above, crop });
      else if (crop.mode === "stem") { if (age < crop.age) actions.push({ kind: "bonemeal", at: above, crop }); }
      else if (crop.mode !== "cocoa") actions.push(age >= crop.age ? { kind: "harvest", at: above, crop } : { kind: "bonemeal", at: above, crop });
      continue;
    }
    if (gId === "minecraft:jungle_log") {
      const side = cocoaSide(dim, ground);
      if (side && plants.some((p) => p.mode === "cocoa")) actions.push({ kind: "cocoa-plant", at: side.at, log: ground, direction: side.direction });
      continue;
    }
    if ((dim.getBlock(ground)?.typeId ?? "") === "minecraft:water" || (aId && !AIR.has(aId))) continue;
    const spec = plants.find((p) => p.mode !== "cocoa" && cellFits(dim, box, ground, above, gId, p));
    if (!spec) continue;
    if (gId === spec.ground || (spec.mode === "berry" && (gId === "minecraft:dirt" || gId === "minecraft:grass_block"))) actions.push({ kind: "plant", at: above, item: spec.item });
    else if (spec.soil) actions.push({ kind: "soil", at: ground, above, item: spec.item });
    else if (spec.ground === "minecraft:farmland" && TILL.has(gId)) actions.push({ kind: "till", at: ground, plant: spec.item });
  }
  return actions;
}

/** @param {import("@minecraft/server").Dimension} dim @param {Box} box @param {V3} ground @param {V3} above @param {string} gId @param {(typeof CROPS)[number]} spec */
function cellFits(dim, box, ground, above, gId, spec) {
  if (spec.mode === "cocoa") return false;
  if (spec.item === "minecraft:sugar_cane" && !besideWater(dim, ground, box)) return false;
  if (spec.space && !sidesAir(dim, above)) return false;
  if (gId === spec.ground) return true;
  if (spec.mode === "berry" && (gId === "minecraft:dirt" || gId === "minecraft:grass_block" || gId === "minecraft:podzol")) return true;
  if (spec.item === "minecraft:bamboo" && (gId === "minecraft:dirt" || gId === "minecraft:grass_block" || gId === "minecraft:sand" || gId === "minecraft:podzol")) return true;
  if (spec.soil && (TILL.has(gId) || gId === "minecraft:farmland" || gId === "minecraft:dirt")) return true;
  if (!spec.soil && spec.ground === "minecraft:farmland" && TILL.has(gId)) return true;
  return false;
}

const testFast = () => /** @type {any} */ (globalThis).crewTestFast === true;

/** @param {any} rt */
function invOf(rt) {
  return /** @type {import("@minecraft/server").Container} */ (rt.e.getComponent("minecraft:inventory")?.container);
}

/** @param {import("@minecraft/server").Container} inv @param {string} id */
function countOf(inv, id) {
  let n = 0;
  for (let i = 0; i < inv.size; i++) if (inv.getItem(i)?.typeId === id) n += inv.getItem(i).amount;
  return n;
}

/**
 * Makes sure the inventory holds at least n of id, drawing on the home chest and then the
 * deposit. Does not spend them. Returns how many are in the inventory afterwards.
 * @param {any} rt @param {import("@minecraft/server").Container} inv @param {string} id @param {number} n
 */
function pull(rt, inv, id, n) {
  let have = countOf(inv, id);
  const dim = rt.e.dimension;
  const takeChest = (/** @type {V3 | undefined} */ at) => {
    if (!at || have >= n) return;
    const c = dim.getBlock(at)?.getComponent("minecraft:inventory")?.container;
    if (!c) return;
    let moved = 0;
    for (let i = 0; i < c.size && have < n; i++) {
      const it = c.getItem(i);
      if (it?.typeId !== id) continue;
      const take = Math.min(it.amount, n - have);
      const part = it.clone();
      part.amount = take;
      const left = stash(inv, part);
      const got = take - (left?.amount ?? 0);
      if (!got) return;
      have += got;
      moved += got;
      if (it.amount > got) {
        it.amount -= got;
        c.setItem(i, it);
      } else c.setItem(i, undefined);
    }
    if (moved) noteChestUse(dim.id, at);
  };
  const home = getHome(rt.e);
  if (home?.chest && home.dim === dim.id) takeChest(home.chest);
  takeChest(rt.job.deposit);
  return have;
}

/** @param {any} rt @param {string} id @param {V3} at @param {string} why */
function logSkip(rt, id, at, why) {
  const st = rt.st;
  st.skipTotal = (st.skipTotal ?? 0) + 1;
  st.skipCount ??= {};
  const first = !st.skipCount[id];
  st.skipCount[id] = (st.skipCount[id] ?? 0) + 1;
  if (first) emit(rt.e, "skipped", { block: id, at: fmt(at), needs: why }, `left ${id.replace("minecraft:", "").replace(/_/g, " ")} at ${fmt(at)}: ${why}.`);
}

/** @param {any} rt @param {import("@minecraft/server").Container} inv @param {V3} c */
function breakAt(rt, inv, c) {
  const dim = rt.e.dimension;
  const block = dim.getBlock(c);
  if (!block || AIR.has(block.typeId)) return;
  const id = block.typeId;
  const k = kit(inv);
  let tool = chooseTool(k, id, toolPref(rt.e));
  const axe = k.find((t) => t.info.kind === "axe");
  const using = tool.use === "tool" ? tool.tool : leafKind(id) || CROP_BY_BLOCK[id] ? undefined : axe;
  if (woodKind(id) && !axe) {
    logSkip(rt, id, c, "it needs an axe");
    return;
  }
  const item = using ? inv.getItem(using.slot) : undefined;
  const drops = world.getLootTableManager().generateLootFromBlock(block, item) ?? [];
  dim.setBlockType(c, "minecraft:air");
  for (const drop of drops) {
    const left = stash(inv, drop);
    if (left) dim.spawnItem(left, rt.e.location);
  }
  if (using) wear(inv, using, rt.st.uses ??= {});
  holdTool(rt.e, using?.info.id);
}

/** @param {any} rt @param {import("@minecraft/server").Container} inv */
function dump(rt, inv) {
  const dep = rt.job.deposit;
  const chest = rt.e.dimension.getBlock(dep)?.getComponent("minecraft:inventory")?.container;
  if (!chest) {
    emit(rt.e, "deposit_missing", { deposit: dep.label }, `I can't find the chest at ${dep.label}.`);
    return;
  }
  let moved = 0;
  for (let i = 0; i < inv.size; i++) {
    const item = inv.getItem(i);
    if (!item || (i < KIT_SLOTS && toolInfo(item)) || item.typeId === "minecraft:torch" || KEEP_CARRY.test(item.typeId)) continue;
    const left = chest.addItem(item);
    inv.setItem(i, left);
    moved += item.amount - (left?.amount ?? 0);
    if (left) break;
  }
  if (moved) {
    emit(rt.e, "deposited", { items: moved, deposit: dep.label }, `dropped off ${moved} items at ${dep.label}.`);
    noteChestUse(dep.dim, dep);
  }
}

/** @param {any} rt @param {import("@minecraft/server").Container} inv @param {any} act */
function doAction(rt, inv, act) {
  const dim = rt.e.dimension;
  if (act.kind === "water") {
    if ((dim.getBlock(act.at)?.typeId ?? "") === "minecraft:water") return;
    if (pull(rt, inv, "minecraft:water_bucket", 1) < 1) {
      rt.st.noWater = true;
      logSkip(rt, "minecraft:water_bucket", act.at, "it needs a water bucket from home or the deposit");
      return;
    }
    spend(inv, "minecraft:water_bucket", 1);
    const above = { x: act.at.x, y: act.at.y + 1, z: act.at.z };
    const aboveId = dim.getBlock(above)?.typeId ?? "";
    if (aboveId && !AIR.has(aboveId)) breakAt(rt, inv, above);
    dim.setBlockType(act.at, "minecraft:water");
    const left = stash(inv, new ItemStack("minecraft:bucket", 1));
    if (left) dim.spawnItem(left, rt.e.location);
    return;
  }
  if (act.kind === "fruit") {
    breakAt(rt, inv, act.at);
    return;
  }
  if (act.kind === "berry") {
    const block = dim.getBlock(act.at);
    const age = Number(block?.permutation?.getState?.("age") ?? 0);
    if (!block || age < 2) return;
    const n = age >= 3 ? 3 : 2;
    block.setPermutation(BlockPermutation.resolve("minecraft:sweet_berry_bush", { age: 1 }));
    const left = stash(inv, new ItemStack("minecraft:sweet_berries", n));
    if (left) dim.spawnItem(left, rt.e.location);
    return;
  }
  if (act.kind === "cocoa-plant") {
    if ((dim.getBlock(act.log)?.typeId ?? "") !== "minecraft:jungle_log") return;
    if (!AIR.has(dim.getBlock(act.at)?.typeId ?? "x")) return;
    if (pull(rt, inv, "minecraft:cocoa_beans", 1) < 1) {
      logSkip(rt, "minecraft:cocoa_beans", act.at, "it needs cocoa beans");
      return;
    }
    spend(inv, "minecraft:cocoa_beans", 1);
    dim.getBlock(act.at)?.setPermutation(BlockPermutation.resolve("minecraft:cocoa", { age: 0, direction: act.direction }));
    return;
  }
  if (act.kind === "cocoa-pick") {
    breakAt(rt, inv, act.at);
    const log = SIDES.map(([dx, dz]) => ({ x: act.at.x + dx, y: act.at.y, z: act.at.z + dz })).find((p) => dim.getBlock(p)?.typeId === "minecraft:jungle_log");
    if (!log) return;
    const face = SIDES.findIndex(([dx, dz]) => act.at.x === log.x + dx && act.at.z === log.z + dz);
    const direction = [3, 1, 0, 2][face] ?? 2;
    if (pull(rt, inv, "minecraft:cocoa_beans", 1) < 1) {
      logSkip(rt, "minecraft:cocoa_beans", act.at, "it needs cocoa beans to replant");
      return;
    }
    spend(inv, "minecraft:cocoa_beans", 1);
    dim.getBlock(act.at)?.setPermutation(BlockPermutation.resolve("minecraft:cocoa", { age: 0, direction }));
    return;
  }
  if (act.kind === "break") {
    const id = dim.getBlock(act.at)?.typeId ?? "";
    if (!AIR.has(id)) breakAt(rt, inv, act.at);
    return;
  }
  if (act.kind === "hive") {
    emit(rt.e, "beehive", { at: fmt(act.at) }, `there's a beehive at ${fmt(act.at)}. I left it.`);
    return;
  }
  if (act.kind === "replant") {
    const id = SAPLING[/** @type {string} */ (act.wood)];
    const have = pull(rt, inv, id, act.n);
    if (have < act.n) {
      logSkip(rt, id, act.at[0], `it needs ${act.n} ${id.replace("minecraft:", "").replace(/_/g, " ")} and I have ${have}`);
      return;
    }
    // pull() removed them from the inventory when they were already there. Put one on each stump.
    let left = act.n;
    for (const at of act.at) {
      if (left <= 0) break;
      const b = dim.getBlock(at);
      if (b && AIR.has(b.typeId)) dim.setBlockType(at, id);
      left--;
    }
    return;
  }
  if (act.kind === "till") {
    const hoe = kit(inv).find((t) => t.info.kind === "hoe");
    const id = dim.getBlock(act.at)?.typeId ?? "";
    if (!TILL.has(id)) return;
    if (!hoe) {
      logSkip(rt, id, act.at, "it needs a hoe");
      return;
    }
    dim.setBlockType(act.at, "minecraft:farmland");
    wear(inv, hoe, rt.st.uses ??= {});
    holdTool(rt.e, hoe.info.id);
    if (act.plant) doAction(rt, inv, { kind: "plant", at: { x: act.at.x, y: act.at.y + 1, z: act.at.z }, item: act.plant });
    return;
  }
  if (act.kind === "plant" || act.kind === "soil") {
    const crop = act.crop ?? CROP_BY_ITEM[act.item];
    if (act.kind === "soil") {
      const chosen = CROPS.find((c) => c.soil && c.item === act.item);
      if (!chosen?.soil) return;
      if (dim.getBlock(act.at)?.typeId === chosen.ground) {
        doAction(rt, inv, { kind: "plant", at: act.above, item: chosen.item });
        return;
      }
      if (!TILL.has(dim.getBlock(act.at)?.typeId ?? "") && dim.getBlock(act.at)?.typeId !== "minecraft:farmland") return;
      if (pull(rt, inv, chosen.soil, 1) < 1) {
        logSkip(rt, chosen.item, act.at, `it needs ${chosen.soil.replace("minecraft:", "").replace(/_/g, " ")}, and I don't dig that up`);
        return;
      }
      spend(inv, chosen.soil, 1);
      dim.setBlockType(act.at, chosen.ground);
      doAction(rt, inv, { kind: "plant", at: act.above, item: chosen.item });
      return;
    }
    const item = act.item ?? crop?.item;
    const spec = CROP_BY_ITEM[item];
    if (!spec) {
      if (item) logSkip(rt, item, act.at, "I don't know how to plant that yet");
      return;
    }
    const ground = dim.getBlock({ x: act.at.x, y: act.at.y - 1, z: act.at.z })?.typeId;
    const groundOk = ground === spec.ground
      || (spec.mode === "berry" && (ground === "minecraft:dirt" || ground === "minecraft:grass_block" || ground === "minecraft:podzol"))
      || (spec.item === "minecraft:bamboo" && (ground === "minecraft:dirt" || ground === "minecraft:grass_block" || ground === "minecraft:sand" || ground === "minecraft:podzol"));
    if (!groundOk) return;
    if (spec.item === "minecraft:sugar_cane" && !besideWater(dim, { x: act.at.x, y: act.at.y - 1, z: act.at.z }, rt.job.box)) {
      logSkip(rt, spec.item, act.at, "sugar cane needs water beside the sand");
      return;
    }
    if (spec.space && !sidesAir(dim, act.at)) {
      logSkip(rt, spec.item, act.at, "cactus needs empty space on every side");
      return;
    }
    if (pull(rt, inv, spec.item, 1) < 1) return;
    spend(inv, spec.item, 1);
    const block = dim.getBlock(act.at);
    if (spec.mode === "column") dim.setBlockType(act.at, spec.block);
    else block?.setPermutation(BlockPermutation.resolve(spec.block, { age: 0 }));
    return;
  }
  if (act.kind === "bonemeal") {
    const block = dim.getBlock(act.at);
    const spec = act.crop;
    const age = Number(block?.permutation?.getState?.("age") ?? 0);
    if (!block || !spec || age >= spec.age) return;
    if (pull(rt, inv, "minecraft:bone_meal", 1) < 1) return;
    spend(inv, "minecraft:bone_meal", 1);
    block.setPermutation(BlockPermutation.resolve(spec.block, { age: age + 1 }));
    return;
  }
  if (act.kind === "harvest") {
    const spec = act.crop;
    if (spec?.mode === "stem") return;
    breakAt(rt, inv, act.at);
    doAction(rt, inv, { kind: "plant", at: act.at, item: spec.item });
  }
}

/** Removes n of id already sitting in the inventory. @param {import("@minecraft/server").Container} inv @param {string} id @param {number} n */
function spend(inv, id, n) {
  let need = n;
  for (let i = 0; i < inv.size && need > 0; i++) {
    const it = inv.getItem(i);
    if (it?.typeId !== id) continue;
    const take = Math.min(it.amount, need);
    need -= take;
    if (it.amount > take) {
      it.amount -= take;
      inv.setItem(i, it);
    } else inv.setItem(i, undefined);
  }
}

/**
 * One tick of a forest or field. `walkTo` is the runner's walker.
 * @param {any} rt
 * @param {{walkTo: (rt: any, goal: V3, reach: number, beside?: boolean) => "moving"|"arrived"|"failed"}} ctx
 */
export function stepPlot(rt, ctx) {
  const { e, job, st } = rt;
  const inv = invOf(rt);
  if (!inv) return;
  const box = /** @type {Box} */ (job.box);
  if ((st.cool ?? 0) > 0) {
    st.cool--;
    if (st.cool > 0) return;
  }
  switch (st.phase ?? "scan") {
    case "scan": {
      st.queue = job.type === "forest" ? forestQueue(e.dimension, box) : fieldQueue(e.dimension, box, inv);
      st.qi = 0;
      st.phase = st.queue.length ? "approach" : "watch";
      st.watch = testFast() ? 40 : 600;
      e.setProperty("crew:anim", 0);
      return;
    }
    case "watch": {
      e.setProperty("crew:anim", 0);
      if (--st.watch <= 0) st.phase = "scan";
      return;
    }
    case "approach": {
      const act = st.queue[st.qi];
      if (!act) {
        st.phase = "dump";
        return;
      }
      if (act.kind === "water" && st.noWater) {
        st.qi++;
        return;
      }
      const goal = act.at?.[0] && act.kind === "replant" ? act.at[0] : act.at;
      e.setProperty("crew:anim", rt.walk?.path ? 1 : 0);
      const w = ctx.walkTo(rt, goal, 2.4, true);
      if (w === "failed") {
        logSkip(rt, "path", goal, "I couldn't find a way that stays off the crops");
        st.qi++;
        return;
      }
      if (w !== "arrived") return;
      if (act.kind === "break") {
        const id = e.dimension.getBlock(act.at)?.typeId ?? "minecraft:air";
        const axe = kit(inv).find((t) => t.info.kind === "axe");
        st.cool = ticksFor(woodKind(id) ? axe : undefined, inv, testFast(), id || "minecraft:oak_log");
        holdTool(e, axe?.info.id);
        e.setProperty("crew:anim", 2);
        try {
          e.teleport(e.location, { facingLocation: { x: act.at.x + 0.5, y: act.at.y + 0.5, z: act.at.z + 0.5 } });
        } catch { /* cosmetic */ }
        st.phase = "swing";
        return;
      }
      st.phase = "act";
      return;
    }
    case "swing": {
      doAction(rt, inv, st.queue[st.qi]);
      st.qi++;
      st.phase = "approach";
      return;
    }
    case "act": {
      doAction(rt, inv, st.queue[st.qi]);
      st.qi++;
      st.phase = "approach";
      return;
    }
    case "dump": {
      e.setProperty("crew:anim", rt.walk?.path ? 1 : 0);
      if (ctx.walkTo(rt, job.deposit, 2.4, true) !== "arrived") return;
      dump(rt, inv);
      st.phase = "watch";
      st.watch = testFast() ? 40 : 600;
      return;
    }
    default:
      st.phase = "scan";
  }
}

/** @param {import("@minecraft/server").Dimension} dim @param {Box} box */
function forestQueue(dim, box) {
  /** @type {any[]} */
  const q = [];
  for (const tree of findTrees(dim, box)) {
    for (const h of tree.hives) q.push({ kind: "hive", at: h });
    const blocks = [...tree.leaves, ...tree.logs].sort((a, b) => b.y - a.y);
    for (const at of blocks) q.push({ kind: "break", at });
    q.push({ kind: "replant", at: tree.stumps, wood: tree.kind, n: tree.stumps.length });
  }
  return q;
}

/** @param {import("@minecraft/server").Dimension} dim @param {Box} box @param {import("@minecraft/server").Container} inv */
function fieldQueue(dim, box, inv) {
  const growing = new Set();
  for (let x = box.min.x; x <= box.max.x; x++) for (let z = box.min.z; z <= box.max.z; z++) {
    for (const y of [box.min.y, box.min.y + 1]) {
      const id = dim.getBlock({ x, y, z })?.typeId ?? "";
      const crop = CROP_BY_BLOCK[id];
      if (crop) growing.add(crop.item);
      if (id === "minecraft:pumpkin") growing.add("minecraft:pumpkin_seeds");
      if (id === "minecraft:melon") growing.add("minecraft:melon_seeds");
    }
  }
  const plants = [
    ...CROPS.filter((c) => growing.has(c.item)),
    ...CROPS.filter((c) => !growing.has(c.item) && countOf(inv, c.item) > 0),
  ];
  return findFieldWork(dim, box, plants);
}

/** Status line for a forest or field. @param {any} job @param {any} st */
export function plotStatus(job, st) {
  const name = job.type === "forest" ? "Forest" : "Field";
  const doing = st?.phase === "watch" ? "watching for the next one" : st?.phase === "dump" ? "dropping off" : "working";
  const skips = st?.skipTotal ? ` Left ${st.skipTotal} it couldn't replant or plant.` : "";
  return `${name}, ${doing}, at the plot.${skips}`;
}

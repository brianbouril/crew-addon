// Miner prospecting. The tunnel pattern lives in plans.js (a compact stair, then the hidden
// branch mine). This file is the part around that: where the mine may start, the home column
// it must not touch, the paid entrance, the quota, and a replacement pickaxe at home.
import { BlockPermutation, ItemStack } from "@minecraft/server";
import { CLAIM_RADIUS, PROSPECT_FLOOR, QUOTA_ORES } from "./catalog.js";
import { DIRS, rightOf } from "./plans.js";
import { addToKit, kit } from "./tools.js";
import { fmt, setJSON } from "./util.js";

export { CLAIM_RADIUS, PROSPECT_FLOOR, QUOTA_ORES };

/** @typedef {{x:number,y:number,z:number}} V3 */
/** @typedef {{dim: string, head: V3, foot: V3, chest?: V3}} Home */

/** The bed, its foot, and the home chest, plus this many blocks around each, at every depth. */
export const HOME_GUARD = 8;
/** Planks a wooden entrance costs. One log counts as four planks. */
export const WOOD_NEED = 8;

const LOG = /_(log|stem|hyphae)$/;
const PLANK = /_planks$/;
const ORE_NAME = { coal: "Coal", copper: "Copper", iron: "Iron", gold: "Gold", redstone: "Redstone", lapis: "Lapis", emerald: "Emerald", diamond: "Diamond" };

/** @param {string} ore */
export const oreBlock = (ore) => new RegExp(`(?:deepslate_)?${ore}_ore$`);

/**
 * @param {string} workerName @param {number} n @param {string | undefined} quotaOre @param {string | undefined} custom
 */
export function mineTitle(workerName, n, quotaOre, custom) {
  const typed = String(custom ?? "").replace(/§/g, "").trim().slice(0, 48);
  if (typed) return typed;
  const ore = quotaOre && ORE_NAME[/** @type {keyof typeof ORE_NAME} */ (quotaOre)];
  return `${workerName}'s ${ore ? `${ore} ` : ""}Mine No. ${n}`;
}

/** @param {Home | undefined} home */
export function guardOf(home) {
  if (!home) return undefined;
  const spots = [home.head, home.foot, home.chest].filter((/** @type {V3 | undefined} */ s) => !!s);
  return { r: HOME_GUARD, spots };
}

/** The entrance, just outside the home column, in the direction the mine will run. @param {Home} home @param {string} facing */
export function homeEntrance(home, facing) {
  const d = DIRS[facing] ?? DIRS.east;
  const head = home.head;
  const dist = HOME_GUARD + 2;
  return { x: head.x + d.x * dist, y: head.y, z: head.z + d.z * dist };
}

/** Posts, beam, sign, lantern and chest, beside the shaft so the stair does not dig them. @param {V3} anchor @param {string} facing */
export function entranceLayout(anchor, facing) {
  const d = DIRS[facing] ?? DIRS.east;
  const r = rightOf(d);
  const at = (/** @type {number} */ f, /** @type {number} */ s, /** @type {number} */ dy) => ({
    x: anchor.x + d.x * f + r.x * s, y: anchor.y + dy, z: anchor.z + d.z * f + r.z * s,
  });
  return {
    posts: [at(0, 2, 1), at(0, 2, 2), at(0, -2, 1), at(0, -2, 2)],
    beam: [at(0, 2, 3), at(0, -2, 3)],
    lantern: at(0, 2, 4),
    sign: at(-1, 2, 2),
    chest: at(0, 3, 1),
  };
}

/** @param {import("@minecraft/server").Dimension} dim @param {V3} pos */
const boxAt = (dim, pos) => dim.getBlock(pos)?.getComponent("minecraft:inventory")?.container;

/** @param {import("@minecraft/server").Container[]} containers @param {(id: string) => boolean} pred */
function countWhere(containers, pred) {
  let n = 0;
  for (const c of containers) {
    if (!c) continue;
    for (let i = 0; i < c.size; i++) {
      const it = c.getItem(i);
      if (it && pred(it.typeId)) n += it.amount;
    }
  }
  return n;
}

/**
 * Takes items. `per` is how many units one item counts as (a log is 4 planks).
 * @param {import("@minecraft/server").Container[]} containers
 * @param {(id: string) => boolean} pred @param {number} per @param {number} units
 */
function takeUnits(containers, pred, per, units) {
  let left = units;
  /** @type {{id: string, n: number}[]} */
  const took = [];
  for (const c of containers) {
    if (!c) continue;
    for (let i = 0; i < c.size && left > 0; i++) {
      const it = c.getItem(i);
      if (!it || !pred(it.typeId)) continue;
      const use = Math.min(it.amount, Math.ceil(left / per));
      if (use <= 0) continue;
      if (it.amount === use) c.setItem(i, undefined);
      else {
        it.amount -= use;
        c.setItem(i, it);
      }
      took.push({ id: it.typeId, n: use });
      left -= use * per;
    }
  }
  return { ok: left <= 0, took, left: Math.max(0, left) };
}

/** @param {import("@minecraft/server").Container[]} containers @param {(id: string) => boolean} pred @param {number} n */
const takeCount = (containers, pred, n) => takeUnits(containers, pred, 1, n);

/** @param {import("@minecraft/server").Dimension} dim @param {V3} pos */
function isChestBlock(dim, pos) {
  const b = dim.getBlock(pos);
  return !!b && /chest|barrel/.test(b.typeId) && !!b.getComponent("minecraft:inventory");
}

/** A chest the player already placed near the start, never the home chest. @param {import("@minecraft/server").Dimension} dim @param {V3} anchor @param {Home | undefined} home */
function playerChest(dim, anchor, home) {
  for (let dy = 0; dy <= 2; dy++) for (let dx = -4; dx <= 4; dx++) for (let dz = -4; dz <= 4; dz++) {
    const p = { x: anchor.x + dx, y: anchor.y + dy, z: anchor.z + dz };
    if (home?.chest && p.x === home.chest.x && p.y === home.chest.y && p.z === home.chest.z) continue;
    if (isChestBlock(dim, p)) return p;
  }
  return undefined;
}

/**
 * Places the paid entrance, or says what is missing and uses a chest the player placed.
 * `apply` false only looks (the order is refused before the job starts when there is no chest).
 * @param {import("@minecraft/server").Dimension} dim
 * @param {import("@minecraft/server").Entity} e
 * @param {any} job
 * @param {Home | undefined} home
 * @param {boolean} apply
 * @returns {{ok: true, message: string, chest: V3, decorative: boolean} | {ok: false, message: string}}
 */
export function buildEntrance(dim, e, job, home, apply) {
  /** @type {import("@minecraft/server").Container[]} */
  const supplies = [];
  for (const pos of job.supplies ?? []) {
    const c = boxAt(dim, pos);
    if (c) supplies.push(c);
  }
  const layout = entranceLayout(job.geom.anchor, job.geom.facing);
  const wood = countWhere(supplies, (id) => LOG.test(id)) * 4 + countWhere(supplies, (id) => PLANK.test(id));
  const chestItems = countWhere(supplies, (id) => id === "minecraft:chest");
  const lanterns = countWhere(supplies, (id) => id === "minecraft:lantern" || id === "minecraft:soul_lantern");
  const placed = chestItems > 0 ? layout.chest : undefined;
  const existing = placed ? undefined : playerChest(dim, job.geom.anchor, home);
  const chest = placed ?? existing;
  if (!chest) {
    return { ok: false, message: `${job.who ?? "I"} need a chest for the ore. Put a chest in the home chest, or place one by the mine start.` };
  }
  const decorative = wood >= WOOD_NEED;
  if (!apply) return { ok: true, message: "", chest, decorative };

  /** @type {V3[]} */
  const safe = [{ ...chest }];
  let woodNote = "";
  if (decorative) {
    const logsFirst = takeUnits(supplies, (id) => LOG.test(id), 4, WOOD_NEED);
    if (logsFirst.left > 0) takeUnits(supplies, (id) => PLANK.test(id), 1, logsFirst.left);
    const postId = logsFirst.took.length ? "minecraft:oak_log" : "minecraft:oak_planks";
    for (const p of layout.posts) placeBlock(dim, p, postId, { pillar_axis: "y" });
    for (const p of layout.beam) placeBlock(dim, p, "minecraft:oak_planks");
    safe.push(...layout.posts, ...layout.beam);
    const signDir = { south: 0, west: 4, north: 8, east: 12 }[/** @type {string} */ (job.geom.facing)] ?? 0;
    placeBlock(dim, layout.sign, "minecraft:oak_sign", { ground_sign_direction: signDir });
    safe.push(layout.sign);
    try {
      dim.getBlock(layout.sign)?.getComponent("minecraft:sign")?.setText(job.mineName);
    } catch {
      /* the name is still saved on the worker */
    }
    job.signAt = layout.sign;
    if (lanterns > 0) {
      takeCount(supplies, (id) => id === "minecraft:lantern" || id === "minecraft:soul_lantern", 1);
      placeBlock(dim, layout.lantern, "minecraft:lantern", { hanging: true });
      safe.push(layout.lantern);
    }
  } else {
    woodNote = ` I don't have ${WOOD_NEED} planks for an entrance (a log counts as 4), so I skipped the posts and the sign.`;
  }
  if (placed) {
    takeCount(supplies, (id) => id === "minecraft:chest", 1);
    placeBlock(dim, chest, "minecraft:chest");
  }
  job.safe = safe;
  job.decorative = decorative;
  job.deposit = { x: chest.x, y: chest.y, z: chest.z, dim: dim.id, label: `the mine chest at ${fmt(chest)}` };
  setJSON(e, "crew:lastDeposit", job.deposit);
  setJSON(e, "crew:mine", {
    name: job.mineName, number: job.mineNumber,
    chest: { x: chest.x, y: chest.y, z: chest.z, dim: dim.id },
    decorative, quotaOre: job.quotaOre ?? null, handoff: "sifter-chest",
  });
  const used = placed ? "I placed a chest for the ore" : `I'll use the chest at ${fmt(chest)}`;
  const built = decorative ? `Built the entrance for ${job.mineName}.` : `No wooden entrance.${woodNote}`;
  return { ok: true, message: `${built} ${used}.`, chest, decorative };
}

/** @param {import("@minecraft/server").Dimension} dim @param {V3} pos @param {string} id @param {Record<string, any>} [states] */
function placeBlock(dim, pos, id, states) {
  try {
    const block = dim.getBlock(pos);
    if (block) {
      block.setPermutation(BlockPermutation.resolve(id, states ?? {}));
      return;
    }
  } catch {
    /* fall through */
  }
  dim.setBlockType(pos, id);
}

// ---------- a replacement pickaxe (Brian, Nov 14) ----------
const PICKS = [
  { tier: 3, id: "minecraft:diamond_pickaxe", label: "Diamond Pickaxe", need: { "minecraft:diamond": 3, "minecraft:stick": 2 } },
  { tier: 2, id: "minecraft:iron_pickaxe", label: "Iron Pickaxe", need: { "minecraft:iron_ingot": 3, "minecraft:stick": 2 } },
  { tier: 1, id: "minecraft:stone_pickaxe", label: "Stone Pickaxe", need: { "minecraft:cobblestone": 3, "minecraft:stick": 2 } },
  { tier: 0, id: "minecraft:wooden_pickaxe", label: "Wooden Pickaxe", need: { "minecraft:stick": 2 }, planks: 3 },
  { tier: 0, id: "minecraft:golden_pickaxe", label: "Golden Pickaxe", need: { "minecraft:gold_ingot": 3, "minecraft:stick": 2 } },
];

/** A crafting table within 8 blocks of the bed. @param {import("@minecraft/server").Dimension} dim @param {Home} home */
export function craftingTableNear(dim, home) {
  if (!home || home.dim !== dim.id) return false;
  const h = home.head;
  for (let dy = -8; dy <= 8; dy++) for (let dx = -8; dx <= 8; dx++) for (let dz = -8; dz <= 8; dz++) {
    if (dx * dx + dy * dy + dz * dz > 64) continue;
    if (dim.getBlock({ x: h.x + dx, y: h.y + dy, z: h.z + dz })?.typeId === "minecraft:crafting_table") return true;
  }
  return false;
}

/** Why it cannot try to craft, or "" when the table is there and it should walk home. @param {import("@minecraft/server").Dimension} dim @param {Home | undefined} home */
export function whyNoCraft(dim, home) {
  if (!home?.chest) return "I have no home chest to make a new pickaxe from.";
  if (home.dim !== dim.id) return "My home is in another dimension, so I can't make a pickaxe there.";
  if (!craftingTableNear(dim, home)) return "There's no crafting table within 8 blocks of my bed, so I can't make a pickaxe.";
  return "";
}

/**
 * Makes the best pickaxe the home chest can pay for, never a higher tier than `capTier`
 * (netherite is capped at diamond: a crafting table cannot make netherite).
 * @param {import("@minecraft/server").Dimension} dim @param {Home} home
 * @param {import("@minecraft/server").Container} inv @param {number} capTier
 * @returns {{ok: boolean, message: string, tool?: string, label?: string}}
 */
export function craftPickaxe(dim, home, inv, capTier) {
  const blocked = whyNoCraft(dim, home);
  if (blocked) return { ok: false, message: blocked };
  const chest = boxAt(dim, /** @type {V3} */ (home.chest));
  if (!chest) return { ok: false, message: "I can't reach my home chest to make a pickaxe." };
  if (kit(inv).length >= 5) return { ok: false, message: "I'm out of pickaxes and my tool kit is full, so I can't put a new one in." };
  const cap = Math.min(capTier, 3);
  const supplies = [chest];
  // 2 planks make 4 sticks, and only when the recipe would otherwise be short.
  const haveSticks = countWhere(supplies, (id) => id === "minecraft:stick");
  if (haveSticks < 2) {
    const batches = Math.ceil((2 - haveSticks) / 4);
    const got = takeCount(supplies, (id) => PLANK.test(id), batches * 2);
    if (!got.ok) {
      // put nothing back: the take failed before removing a full batch only if it ran out mid-way.
      // takeCount removes as it goes. Roll back by returning the planks if it failed.
      for (const part of got.took) {
        const back = new ItemStack(part.id, part.n);
        chest.addItem(back);
      }
    } else {
      const made = new ItemStack("minecraft:stick", batches * 4);
      chest.addItem(made);
    }
  }
  for (const recipe of PICKS) {
    if (recipe.tier > cap) continue;
    const need = { ...recipe.need };
    if (recipe.planks) need.planks = recipe.planks;
    const affordable = Object.entries(need).every(([id, n]) => countWhere(supplies, (x) => id === "planks" ? PLANK.test(x) : x === id) >= n);
    if (!affordable) continue;
    /** @type {{id: string, n: number}[]} */
    const used = [];
    for (const [id, n] of Object.entries(need)) {
      const got = id === "planks" ? takeCount(supplies, (x) => PLANK.test(x), n) : takeCount(supplies, (x) => x === id, n);
      used.push(...got.took);
    }
    const item = new ItemStack(recipe.id, 1);
    if (!addToKit(inv, item).ok) return { ok: false, message: "I'm out of pickaxes and my tool kit is full, so I can't put a new one in." };
    const bits = used.map((u) => `${u.n} ${u.id.replace("minecraft:", "").replace(/_/g, " ")}`);
    const netherite = capTier >= 4 && recipe.tier === 3 ? " I can't make netherite at a crafting table." : "";
    return { ok: true, tool: recipe.id, label: recipe.label, message: `I made a ${recipe.label} from ${bits.join(" and ")}.${netherite}` };
  }
  const lost = ["a wooden pickaxe", "a stone pickaxe", "an iron pickaxe", "a diamond pickaxe", "a netherite pickaxe"][capTier] ?? "the pickaxe I lost";
  return { ok: false, message: `I'm out of pickaxes. I can't make a replacement from my home chest, and I won't make one better than ${lost}.` };
}

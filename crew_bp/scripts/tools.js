// The worker's tool kit: up to five tools kept in inventory slots 0-4. The kit sets the
// worker's default role, which tool breaks each block, how fast, and when to stop.
import { bestKind, hardness, requiredTier } from "./blocks.js";

export const KIT_SLOTS = 5;
/** tier = what it can harvest (vanilla rules); speed = the vanilla mining speed of that material. */
export const MATERIALS = {
  wooden: { tier: 0, speed: 2, name: "Wooden" },
  golden: { tier: 0, speed: 12, name: "Golden" },
  stone: { tier: 1, speed: 4, name: "Stone" },
  copper: { tier: 1, speed: 5, name: "Copper" },
  iron: { tier: 2, speed: 6, name: "Iron" },
  diamond: { tier: 3, speed: 8, name: "Diamond" },
  netherite: { tier: 4, speed: 9, name: "Netherite" },
};
export const ROLES = { pickaxe: "Miner", shovel: "Digger", axe: "Woodcutter", hoe: "Farmer" };
export const ROLE_LIST = ["Miner", "Digger", "Woodcutter", "Farmer"];
const TIER_NAMES = ["wooden", "stone", "iron", "diamond", "netherite"];
const KIND_NAMES = { pickaxe: "Pickaxe", shovel: "Shovel", axe: "Axe", hoe: "Hoe" };

/**
 * @typedef {import("@minecraft/server").ItemStack} ItemStack
 * @typedef {import("@minecraft/server").Container} Container
 * @typedef {{id: string, kind: "pickaxe"|"shovel"|"axe"|"hoe", material: string, tier: number, speed: number, label: string}} ToolInfo
 * @typedef {{slot: number, info: ToolInfo, left: number, max: number}} KitEntry
 */

/** @param {ItemStack | undefined} item @returns {ToolInfo | undefined} */
export function toolInfo(item) {
  if (!item) return undefined;
  const m = /^minecraft:(wooden|golden|stone|copper|iron|diamond|netherite)_(pickaxe|shovel|axe|hoe)$/.exec(item.typeId);
  if (!m) return undefined;
  const mat = /** @type {keyof typeof MATERIALS} */ (m[1]);
  const kind = /** @type {ToolInfo["kind"]} */ (m[2]);
  const spec = MATERIALS[mat];
  return { id: item.typeId, kind, material: mat, tier: spec.tier, speed: spec.speed, label: `${spec.name} ${KIND_NAMES[kind]}` };
}

/** @param {ItemStack} item @param {string} name */
function enchantLevel(item, name) {
  try {
    return item.getComponent("minecraft:enchantable")?.getEnchantment(name)?.level ?? 0;
  } catch {
    return 0;
  }
}

/** @param {ItemStack} item */
function durability(item) {
  const d = item.getComponent("minecraft:durability");
  return d ? { left: d.maxDurability - d.damage, max: d.maxDurability } : { left: 1, max: 1 };
}

/** The tools in slots 0-4. @param {Container} inv @returns {KitEntry[]} */
export function kit(inv) {
  /** @type {KitEntry[]} */
  const out = [];
  for (let slot = 0; slot < Math.min(KIT_SLOTS, inv.size); slot++) {
    const item = inv.getItem(slot);
    const info = toolInfo(item);
    if (item && info) out.push({ slot, info, ...durability(item) });
  }
  return out;
}

/** Role of the best tool (ties go to the pickaxe). @param {KitEntry[]} k */
export function defaultRole(k) {
  const order = ["pickaxe", "shovel", "axe", "hoe"];
  const best = [...k].sort((a, b) => b.info.tier - a.info.tier || order.indexOf(a.info.kind) - order.indexOf(b.info.kind))[0];
  return best ? ROLES[best.info.kind] : "Miner";
}

/** The worker's tool setting: "save" its best tools (default) or use the "fastest". @param {import("@minecraft/server").Entity} e @returns {"save"|"fastest"} */
export const toolPref = (e) => (e.getDynamicProperty("crew:toolPref") === "fastest" ? "fastest" : "save");
/** @param {import("@minecraft/server").Entity} e @param {"save"|"fastest"} v */
export const setToolPref = (e, v) => e.setDynamicProperty("crew:toolPref", v === "fastest" ? "fastest" : undefined);

/** @param {KitEntry[]} k */
export const kitText = (k) => (k.length ? k.map((t) => `${t.info.label} ${t.left}/${t.max}`).join(", ") : "no tools");

/**
 * Picks how to break a block: the right kind of tool at the lowest tier that still harvests it,
 * saving better tools; the most worn of equals goes first.
 * With `prefer` "fastest" (the worker's Tools setting) it takes the highest tier instead (the
 * fastest material of that tier, then the most worn), so it digs quicker but wears good tools.
 * @param {KitEntry[]} k @param {string} blockId @param {"save"|"fastest"} [prefer]
 * @returns {{use: "tool", tool: KitEntry} | {use: "hand"} | {use: "skip", need: string} | {use: "wait", need: string}}
 */
export function chooseTool(k, blockId, prefer = "save") {
  const kind = bestKind(blockId);
  const need = kind === "pickaxe" ? requiredTier(blockId) : 0;
  const fits = k.filter((t) => t.info.kind === kind && t.info.tier >= need).sort(prefer === "fastest"
    ? (a, b) => b.info.tier - a.info.tier || b.info.speed - a.info.speed || a.left - b.left
    : (a, b) => a.info.tier - b.info.tier || a.left - b.left);
  if (fits.length) return { use: "tool", tool: fits[0] };
  if (kind !== "pickaxe") return { use: "hand" };
  if (k.some((t) => t.info.kind === "pickaxe")) return { use: "skip", need: `${TIER_NAMES[need]} pickaxe or better` };
  return { use: "wait", need: "a pickaxe" };
}

/**
 * Ticks to break one block, the way a player's are worked out: tool speed (plus Efficiency) over
 * the block's hardness. By hand, speed 1. Only tools that can harvest the block are ever used, so
 * it's always the "right tool" rate: hardness 1.5 stone takes 0.6 s with a stone pickaxe, 0.4 s
 * with iron; obsidian about 9.4 s with diamond. `testFast` (mock tests only) is 5 times quicker.
 * @param {KitEntry | undefined} tool @param {Container} inv @param {boolean} testFast @param {string} blockId
 */
export function ticksFor(tool, inv, testFast, blockId) {
  let speed = 1;
  if (tool) {
    speed = tool.info.speed;
    const item = inv.getItem(tool.slot);
    const eff = item ? enchantLevel(item, "efficiency") : 0;
    if (eff > 0) speed += eff * eff + 1;
  }
  const h = hardness(blockId);
  const base = h <= 0 ? 1 : Math.max(1, Math.ceil((30 * h) / speed));
  return testFast ? Math.max(1, Math.round(base / 5)) : base;
}

/**
 * Wears the tool by one use. Unbreaking is applied deterministically: level N takes damage on
 * every (N+1)th use. Returns "broke" when the tool is used up (it's removed from the kit).
 * @param {Container} inv @param {KitEntry} tool @param {Record<string, number>} uses  per-slot counters, saved with the job
 * @returns {"ok" | "low" | "broke"}
 */
export function wear(inv, tool, uses) {
  const item = inv.getItem(tool.slot);
  const d = item?.getComponent("minecraft:durability");
  if (!item || !d) return "ok";
  const k = String(tool.slot);
  uses[k] = (uses[k] ?? 0) + 1;
  if (uses[k] % (enchantLevel(item, "unbreaking") + 1) !== 0) return "ok";
  const dmg = d.damage + 1;
  if (dmg >= d.maxDurability) {
    inv.setItem(tool.slot, undefined);
    uses[k] = 0;
    return "broke";
  }
  d.damage = dmg;
  inv.setItem(tool.slot, item);
  const left = d.maxDurability - dmg;
  return left === Math.floor(d.maxDurability / 10) ? "low" : "ok";
}

/**
 * Adds an item to the haul slots (5 and up), never into the tool kit. Returns what didn't fit.
 * @param {Container} inv @param {ItemStack} item @returns {ItemStack | undefined}
 */
export function stash(inv, item) {
  let left = item.amount;
  for (let i = KIT_SLOTS; i < inv.size && left > 0; i++) {
    const s = inv.getItem(i);
    if (!s || !s.isStackableWith(item) || s.amount >= s.maxAmount) continue;
    const n = Math.min(s.maxAmount - s.amount, left);
    s.amount += n;
    inv.setItem(i, s);
    left -= n;
  }
  for (let i = KIT_SLOTS; i < inv.size && left > 0; i++) {
    if (inv.getItem(i)) continue;
    const n = Math.min(item.maxAmount, left);
    const s = item.clone();
    s.amount = n;
    inv.setItem(i, s);
    left -= n;
  }
  if (left <= 0) return undefined;
  const rest = item.clone();
  rest.amount = left;
  return rest;
}

/** Free haul slots. @param {Container} inv */
export function freeHaulSlots(inv) {
  let n = 0;
  for (let i = KIT_SLOTS; i < inv.size; i++) if (!inv.getItem(i)) n++;
  return n;
}

/** Puts a tool into the first free kit slot. Returns false if the kit is full. @param {Container} inv @param {ItemStack} item */
export function addToKit(inv, item) {
  for (let slot = 0; slot < KIT_SLOTS; slot++) {
    const cur = inv.getItem(slot);
    if (cur && toolInfo(cur)) continue;
    inv.setItem(slot, item);
    if (cur) {
      const rest = stash(inv, cur); // something that isn't a tool ended up here; move it to the haul slots
      if (rest) return { ok: true, spill: rest };
    }
    return { ok: true, spill: undefined };
  }
  return { ok: false, spill: undefined };
}

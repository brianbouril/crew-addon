// Minimal in-memory mock of the parts of @minecraft/server the add-on uses.
// Tests run workers 5x faster (runner.js testFast); a test that wants real speed sets it false.
globalThis.crewTestFast = true;
export const CommandPermissionLevel = { Any: 0, GameDirectors: 1, Admin: 2, Host: 3, Owner: 4 };
export const GameMode = { survival: "survival", creative: "creative", adventure: "adventure", spectator: "spectator" };
export const CustomCommandParamType = new Proxy({}, { get: (_, k) => k });
export const CustomCommandSource = { Block: "Block", Entity: "Entity", NPCDialogue: "NPCDialogue", Server: "Server" };
export const CustomCommandStatus = { Success: 0, Failure: 1 };
const MAXDUR = { wooden: 59, golden: 32, stone: 131, copper: 190, iron: 250, diamond: 1561, netherite: 2031 };
// `data` (tests only) stands for item data such as banner patterns or firework flights: stacks with different data never stack.
export class ItemStack {
  constructor(typeId, amount = 1) { this.typeId = typeId; this.amount = amount; this.damage = 0; this.enchants = {}; }
  get maxAmount() { return /_(pickaxe|shovel|axe|hoe|sword)$|bundle|leather_boots|shulker_box/.test(this.typeId) ? 1 : 64; }
  isStackableWith(o) { return o.typeId === this.typeId && this.maxAmount > 1 && (o.nameTag ?? "") === (this.nameTag ?? "") && (o.data ?? "") === (this.data ?? ""); }
  clone() { const c = new ItemStack(this.typeId, this.amount); c.damage = this.damage; c.enchants = { ...this.enchants }; if (this.nameTag !== undefined) c.nameTag = this.nameTag; if (this.data !== undefined) c.data = this.data; return c; }
  getComponent(n) {
    const m = /^minecraft:(\w+?)_(pickaxe|shovel|axe|hoe)$/.exec(this.typeId);
    if (n === "minecraft:durability" && m) { const it = this; return { get damage() { return it.damage; }, set damage(v) { it.damage = v; }, maxDurability: MAXDUR[m[1]] }; }
    if (n === "minecraft:enchantable" && m) { const it = this; return { getEnchantment: (k) => (it.enchants[k] ? { level: it.enchants[k] } : undefined) }; }
    return undefined;
  }
}
export class Container {
  constructor(size) { this.size = size; this.items = new Array(size).fill(undefined); }
  get emptySlotsCount() { return this.items.filter((x) => !x).length; }
  getItem(i) { return this.items[i] && this.items[i].clone(); }
  setItem(i, it) { this.items[i] = it ? it.clone() : undefined; }
  clearAll() { this.items.fill(undefined); }
  addItem(it) {
    let left = it.amount;
    for (const s of this.items) if (s && s.isStackableWith(it) && s.amount < s.maxAmount && left) { const n = Math.min(s.maxAmount - s.amount, left); s.amount += n; left -= n; }
    for (let i = 0; i < this.size && left; i++) if (!this.items[i]) { const n = Math.min(it.maxAmount, left); const c = it.clone(); c.amount = n; this.items[i] = c; left -= n; }
    if (!left) return undefined; const r = it.clone(); r.amount = left; return r;
  }
}
/** @param {string} id @param {Record<string, any>} [states] */
const perm = (id, states = {}) => ({ id, states, type: { id }, getState: (n) => states[n], withState: (n, v) => perm(id, { ...states, [n]: v }) });
export const BlockPermutation = { resolve: (id, states) => perm(id, states) };
const key = (p) => `${Math.floor(p.x)},${Math.floor(p.y)},${Math.floor(p.z)}`;
export const log = { tele: 0, commands: [], spawnedItems: [] };
let tickingFull = false;
/** Tests: while on, `tickingarea add` fails (throws), as when the world's 10 ticking areas are taken. */
export const setTickingFull = (on) => { tickingFull = !!on; };
function command(c) { log.commands.push(c); if (tickingFull && /^tickingarea add/.test(c)) throw new Error("Too many ticking areas"); return { successCount: 1 }; }
class Dimension {
  constructor(id) { this.id = id; this.blocks = new Map(); this.states = new Map(); this.containers = new Map(); this.power = new Map(); this.entities = []; this.unloaded = new Set(); }
  /** Tests: make a block read as unloaded (getBlock returns undefined), or loaded again. */
  setUnloaded(p, on = true) { if (on) this.unloaded.add(key(p)); else this.unloaded.delete(key(p)); }
  typeAt(p) { const k = key(p); if (this.blocks.has(k)) return this.blocks.get(k); return Math.floor(p.y) <= 64 ? "minecraft:stone" : "minecraft:air"; }
  getBlock(p) {
    if (this.unloaded.has(key(p))) return undefined;
    const dim = this; const t = this.typeAt(p); const loc = { x: Math.floor(p.x), y: Math.floor(p.y), z: Math.floor(p.z) };
    return { typeId: t, isAir: t.endsWith("air"), isLiquid: /water|lava/.test(t), location: loc, x: loc.x, y: loc.y, z: loc.z, dimension: dim,
      getComponent(n) { if (n === "minecraft:inventory" && /chest|barrel/.test(t)) { const k = key(loc); if (!dim.containers.has(k)) dim.containers.set(k, new Container(54)); return { container: dim.containers.get(k) }; } return undefined; },
      below() { return dim.getBlock({ x: loc.x, y: loc.y - 1, z: loc.z }); }, bottomCenter() { return { x: loc.x + 0.5, y: loc.y, z: loc.z + 0.5 }; },
      getRedstonePower() { return dim.power.get(key(loc)) ?? 0; },
      get permutation() { return perm(t, dim.states.get(key(loc))); },
      setPermutation(p) { dim.setBlockType(loc, p.id); if (p.states && Object.keys(p.states).length) dim.states.set(key(loc), { ...p.states }); } };
  }
  setBlockType(p, t) { this.blocks.set(key(p), t); this.states.delete(key(p)); }
  getEntities(o) { if (o?.families) return this.entities.filter((e) => e.isValid && (e.families ?? []).some((f) => o.families.includes(f))); return this.entities.filter((e) => e.isValid && (!o?.type || e.typeId === o.type)); }
  spawnEntity(type, loc) { const e = new Entity(type, loc, this); this.entities.push(e); return e; }
  spawnItem(it, loc) { log.spawnedItems.push(it); }
  spawnParticle() {} playSound() {}
  runCommand(c) { return command(c); }
}
let nextId = 1;
class Entity {
  constructor(typeId, loc, dim) { this.typeId = typeId; this.location = { ...loc }; this.dimension = dim; this.id = String(nextId++); this.isValid = true; this.props = new Map(); this.inv = new Container(36); this.nameTag = ""; this.events = []; this.anim = 0; }
  getDynamicProperty(k) { return this.props.get(k); }
  setDynamicProperty(k, v) { if (v === undefined) this.props.delete(k); else this.props.set(k, v); }
  getComponent(n) { return n === "minecraft:inventory" ? { container: this.inv } : undefined; }
  teleport(loc) { this.location = { ...loc }; log.tele++; }
  triggerEvent(e) { this.events.push(e); }
  runCommand(c) { return command(c); }
  setProperty(k, v) { (this.eprops ??= new Map()).set(k, v); if (k === "crew:anim") this.anim = v; }
  getProperty(k) { return this.eprops?.get(k); }
  remove() { this.isValid = false; }
}
const dims = { "minecraft:overworld": new Dimension("minecraft:overworld"), "minecraft:nether": new Dimension("minecraft:nether"), "minecraft:the_end": new Dimension("minecraft:the_end") };
// Event signals record their handlers, so tests can fire them with fire("world.beforeEvents.explosion", ev).
/** @type {Record<string, Function[]>} */
const subs = {};
const sub = (scope) => (_, k) => ({ subscribe(fn) { (subs[`${scope}.${k}`] ??= []).push(fn); return fn; }, unsubscribe() {} });
/** Calls every handler subscribed to an event and returns the event (so tests can read ev.cancel). */
export function fire(path, ev = {}) { for (const fn of subs[path] ?? []) fn(ev); return ev; }
let players = [];
/** The players world.getAllPlayers() returns. */
export const setPlayers = (list) => { players = list; };
// Item ids that aren't blocks (BlockTypes.get returns undefined for them).
const NOT_BLOCKS = /_(pickaxe|shovel|axe|hoe|sword)$|^crew:(?!sieve$)|bread|apple|cooked|ingot|diamond$|^minecraft:coal$|stick/;
/** Tests: redstone power at a block (Block.getRedstonePower). @param {Dimension} dim @param {{x:number,y:number,z:number}} p @param {number} power */
export function setRedstonePower(dim, p, power) { dim.power.set(key(p), power); }
export const BlockTypes = { get: (id) => (NOT_BLOCKS.test(id) ? undefined : { id }) };
const wprops = new Map();
const LOOT = { "minecraft:stone": "minecraft:cobblestone", "minecraft:iron_ore": "minecraft:raw_iron", "minecraft:coal_ore": "minecraft:coal", "minecraft:diamond_ore": "minecraft:diamond", "minecraft:dirt": "minecraft:dirt", "minecraft:grass_block": "minecraft:dirt" };
const LEAF_SAPLING = {
  "minecraft:oak_leaves": "minecraft:oak_sapling", "minecraft:spruce_leaves": "minecraft:spruce_sapling",
  "minecraft:birch_leaves": "minecraft:birch_sapling", "minecraft:jungle_leaves": "minecraft:jungle_sapling",
  "minecraft:acacia_leaves": "minecraft:acacia_sapling", "minecraft:dark_oak_leaves": "minecraft:dark_oak_sapling",
  "minecraft:cherry_leaves": "minecraft:cherry_sapling", "minecraft:mangrove_leaves": "minecraft:mangrove_propagule",
  "minecraft:pale_oak_leaves": "minecraft:pale_oak_sapling",
};
export const lootCalls = [];
let timeOfDay = 1000; // day by default; tests move the clock with setTimeOfDay
export const setTimeOfDay = (t) => { timeOfDay = ((t % 24000) + 24000) % 24000; };
let day = 0; // world.getDay(); tests move it with setDay
export const setDay = (n) => { day = n; };
export const world = {
  getDimension: (id) => dims[id], getAllPlayers: () => players, getTimeOfDay: () => timeOfDay, getDay: () => day,
  getDynamicProperty: (k) => wprops.get(k), setDynamicProperty: (k, v) => (v === undefined ? wprops.delete(k) : wprops.set(k, v)), getDynamicPropertyIds: () => [...wprops.keys()],
  getLootTableManager: () => ({ generateLootFromBlock: (b, tool) => {
    lootCalls.push([b.typeId, tool?.typeId ?? "hand"]);
    if (LEAF_SAPLING[b.typeId]) return [new ItemStack(LEAF_SAPLING[b.typeId], 1), new ItemStack("minecraft:stick", 1), ...(b.typeId === "minecraft:oak_leaves" ? [new ItemStack("minecraft:apple", 1)] : [])];
    if (b.typeId === "minecraft:wheat") return [new ItemStack("minecraft:wheat", 1), new ItemStack("minecraft:wheat_seeds", 1)];
    if (b.typeId === "minecraft:nether_wart") return [new ItemStack("minecraft:nether_wart", 1)];
    if (b.typeId === "minecraft:melon") return [new ItemStack("minecraft:melon_slice", 4)];
    if (b.typeId === "minecraft:cocoa") return [new ItemStack("minecraft:cocoa_beans", 2)];
    return [new ItemStack(LOOT[b.typeId] ?? b.typeId, 1)];
  } }),
  afterEvents: new Proxy({}, { get: sub("world.afterEvents") }), beforeEvents: new Proxy({}, { get: sub("world.beforeEvents") }),
};
const intervals = [];
let currentTick = 0;
export const system = { run: (fn) => fn(), runInterval: (fn, n = 1) => intervals.push({ fn, n }), runTimeout: (fn) => fn(), waitTicks: async () => {}, beforeEvents: new Proxy({}, { get: sub("system.beforeEvents") }), get currentTick() { return currentTick; } };
export function tick(t) { currentTick = t; for (const i of intervals) if (t % i.n === 0) i.fn(); }

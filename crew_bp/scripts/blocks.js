// Block rules shared by the engine and the pathfinder.

export const AIR = new Set(["minecraft:air", "minecraft:cave_air", "minecraft:void_air"]);
/** Never broken, whatever tool the worker has. */
export const PROTECTED = new Set([
  "minecraft:bedrock", "minecraft:barrier", "minecraft:command_block", "minecraft:repeating_command_block",
  "minecraft:chain_command_block", "minecraft:structure_block", "minecraft:structure_void", "minecraft:jigsaw",
  "minecraft:end_portal_frame", "minecraft:end_portal", "minecraft:portal", "minecraft:end_gateway",
  "minecraft:mob_spawner", "minecraft:trial_spawner", "minecraft:vault", "minecraft:reinforced_deepslate",
  "minecraft:light_block", "minecraft:allow", "minecraft:deny", "minecraft:border_block",
  // invisible light blocks come in 16 ids (light_block_0 to _15); dynamic-light add-ons place them around mobs
  ...Array.from({ length: 16 }, (_, i) => `minecraft:light_block_${i}`),
]);
/** Invisible light blocks: walked through like air, never dug. */
export const LIGHT = /^minecraft:light_block(_\d+)?$/;
/** Blocks worth telling the owner about, and what they usually mean. */
export const SIGNS = {
  "minecraft:mob_spawner": "monster spawner (dungeon or mineshaft)",
  "minecraft:trial_spawner": "trial chamber",
  "minecraft:vault": "trial chamber vault",
  "minecraft:end_portal_frame": "stronghold portal room",
  "minecraft:reinforced_deepslate": "ancient city",
  "minecraft:sculk_shrieker": "ancient city",
  "minecraft:rail": "abandoned mineshaft (rails)",
  "minecraft:budding_amethyst": "amethyst geode",
  "minecraft:suspicious_sand": "archaeology site",
  "minecraft:suspicious_gravel": "archaeology site",
  "minecraft:ancient_debris": "ancient debris",
  "minecraft:diamond_ore": "diamonds",
  "minecraft:deepslate_diamond_ore": "diamonds",
};
/** Drops kept when keep = "valuables". */
export const VALUABLE = /(_ore$|^minecraft:raw_|coal$|diamond$|emerald$|lapis_lazuli$|redstone$|quartz$|amethyst_shard$|ancient_debris$|_nugget$|netherite_scrap$|^minecraft:flint$)/;
/** Ore blocks: mined out of tunnel walls when a branch mine passes them. */
export const ORE = /(_ore$|^minecraft:ancient_debris$)/;
/** Plain blocks a worker can use to fill the hole an ore left in a wall. */
export const FILL = /^minecraft:(cobblestone|cobbled_deepslate|stone|deepslate|dirt|tuff|andesite|diorite|granite|netherrack|blackstone)$/;
export const TORCH = "minecraft:torch";
/** Non-solid blocks the worker can move through. */
export const SOFT = /(grass$|fern$|flower|tulip|dandelion|poppy|orchid|allium|bluet|daisy|cornflower|lily_of_the_valley|wither_rose|torch|snow_layer|vine|sapling|mushroom$|deadbush|dead_bush|carpet|rail$|sign$|button$|lever$|pressure_plate$|seagrass|kelp|sugar_cane|sweet_berry|bush$|light$)/;
/** Blocks that fall when what's under them is removed. */
export const GRAVITY = /(^minecraft:(sand|red_sand|gravel|suspicious_sand|suspicious_gravel)$|concrete_powder$|^minecraft:(anvil|chipped_anvil|damaged_anvil|pointed_dripstone|scaffolding)$)/;

/** Which tool breaks a block best. Shovel and axe blocks also drop by hand; everything else needs a pickaxe. */
const SHOVEL = /^minecraft:(dirt|coarse_dirt|rooted_dirt|grass_block|grass_path|dirt_path|podzol|mycelium|farmland|mud|muddy_mangrove_roots|clay|sand|red_sand|gravel|suspicious_sand|suspicious_gravel|soul_sand|soul_soil|snow|snow_layer|powder_snow)$|concrete_powder$/;
const AXE = /(_log$|_wood$|_planks$|_stem$|_hyphae$|^minecraft:(bookshelf|chiseled_bookshelf|crafting_table|barrel|chest|trapped_chest|ladder|bamboo_block|melon_block|pumpkin|carved_pumpkin|lit_pumpkin|cocoa|mangrove_roots|note_block|jukebox|lectern|loom|cartography_table|fletching_table|smithing_table|composter|beehive|bee_nest)$|_fence$|_fence_gate$|_door$|_trapdoor$|_slab$|_stairs$)/;
const WOODEN_SHAPES = /(oak|spruce|birch|jungle|acacia|dark_oak|mangrove|cherry|pale_oak|bamboo|crimson|warped)_(slab|stairs|fence|fence_gate|door|trapdoor)$|^minecraft:(wooden_slab|wooden_door|trapdoor|fence_gate)$/;

/** @param {string} id @returns {"pickaxe"|"shovel"|"axe"} */
export function bestKind(id) {
  if (SHOVEL.test(id)) return "shovel";
  if (AXE.test(id) && (!/(_slab|_stairs|_fence|_fence_gate|_door|_trapdoor)$/.test(id) || WOODEN_SHAPES.test(id))) return "axe";
  return "pickaxe";
}

/** Lowest pickaxe tier that gets a drop: 0 wood/gold, 1 stone/copper, 2 iron, 3 diamond. */
export function requiredTier(id) {
  if (/^minecraft:(obsidian|crying_obsidian|ancient_debris|netherite_block|respawn_anchor)$/.test(id)) return 3;
  if (/^minecraft:(lit_)?(deepslate_)?(gold|diamond|emerald|redstone)_ore$/.test(id) || /^minecraft:(gold_block|diamond_block|emerald_block|raw_gold_block)$/.test(id)) return 2;
  if (/^minecraft:(deepslate_)?(iron|copper|lapis)_ore$/.test(id) || /^minecraft:(iron_block|lapis_block|raw_iron_block|raw_copper_block)$/.test(id) || (/copper/.test(id) && !/_ore$/.test(id))) return 1;
  return 0;
}

/** Vanilla block hardness, for player-like break times. Most stone-like blocks are 1.5. */
const HARDNESS = /** @type {[RegExp, number][]} */ ([
  [/^minecraft:(obsidian|crying_obsidian|respawn_anchor)$/, 50],
  [/^minecraft:(ancient_debris|netherite_block)$/, 30],
  [/^minecraft:(reinforced_deepslate)$/, 55],
  [/^minecraft:deepslate_.*_ore$|^minecraft:lit_deepslate_redstone_ore$/, 4.5],
  [/_ore$/, 3],
  [/^minecraft:(coal_block|iron_block|gold_block|diamond_block|emerald_block|redstone_block|copper_block|raw_\w+_block|anvil|end_stone|cobweb)$/, 3.5],
  [/^minecraft:(cobbled_deepslate|deepslate_bricks|deepslate_tiles|polished_deepslate)$/, 3.5],
  [/^minecraft:(deepslate|end_stone)$/, 3],
  [/^minecraft:(cobblestone|mossy_cobblestone|bricks|smooth_stone)$/, 2],
  [/_log$|_wood$|_planks$|_stem$|_hyphae$|^minecraft:(chest|trapped_chest|barrel|crafting_table|bookshelf)$/, 2],
  [/terracotta$/, 1.25],
  [/^minecraft:(basalt|polished_basalt|smooth_basalt)$/, 1.25],
  [/^minecraft:(calcite)$/, 0.75],
  [/sandstone$/, 0.8],
  [/^minecraft:(gravel|clay|grass_block|mycelium|podzol|farmland|dirt_path|grass_path|soul_soil|mud)$/, 0.6],
  [/^minecraft:(dirt|coarse_dirt|rooted_dirt|sand|red_sand|suspicious_sand|soul_sand|ice|packed_ice|magma|muddy_mangrove_roots)$|concrete_powder$/, 0.5],
  [/^minecraft:(netherrack|nylium|crimson_nylium|warped_nylium)$/, 0.4],
  [/^minecraft:(snow|snow_layer|powder_snow)$/, 0.2],
]);
/** @param {string} id */
export function hardness(id) {
  for (const [re, h] of HARDNESS) if (re.test(id)) return h;
  return 1.5;
}

/** Doors and fence gates a worker walks through (opening wooden ones, iron ones only if already open). */
const DOORWAY = /(_door$|^minecraft:wooden_door$|_fence_gate$|^minecraft:fence_gate$)/;
const IRON_DOOR = /^minecraft:iron_(door|trapdoor)$/;
/** Doors, gates and trapdoors are never broken, whatever the job. */
const KEEP_INTACT = /(_door$|^minecraft:wooden_door$|_fence_gate$|^minecraft:fence_gate$|_trapdoor$|^minecraft:trapdoor$)/;
/** Blocks a worker never breaks: bedrock, spawners, portals... and doors, gates and trapdoors. @param {string} id */
export const keepIntact = (id) => PROTECTED.has(id) || KEEP_INTACT.test(id);

/** @param {import("@minecraft/server").Block} b */
export function isOpen(b) {
  try {
    return !!b.permutation.getState(/** @type {any} */ ("open_bit"));
  } catch {
    return false;
  }
}
/** A door or gate it can walk through: wooden ones (it opens them), iron ones only when open. @param {import("@minecraft/server").Block} b */
export function isDoorway(b) {
  return DOORWAY.test(b.typeId) && (!IRON_DOOR.test(b.typeId) || isOpen(b));
}
/** A closed door or gate it should open to pass (wooden only). @param {import("@minecraft/server").Block} b */
export const needsOpening = (b) => DOORWAY.test(b.typeId) && !IRON_DOOR.test(b.typeId) && !isOpen(b);
/** Opens or closes a door or gate. Returns true if it changed. @param {import("@minecraft/server").Block} b @param {boolean} open */
export function setOpen(b, open) {
  try {
    if (isOpen(b) === open) return false;
    b.setPermutation(b.permutation.withState(/** @type {any} */ ("open_bit"), /** @type {any} */ (open)));
    return true;
  } catch {
    return false;
  }
}

/** @param {import("@minecraft/server").Dimension} dim @param {{x:number,y:number,z:number}} p */
export function passable(dim, p) {
  const b = dim.getBlock(p);
  if (!b) return false;
  return b.isAir || b.isLiquid || SOFT.test(b.typeId) || LIGHT.test(b.typeId) || isDoorway(b);
}

/**
 * Can a worker standing at cur see block c, with nothing solid in between (like a player, who
 * can't reach through a wall)? Traces from its eyes (about 1.6 up) to the nearest point of c's faces.
 * @param {import("@minecraft/server").Dimension} dim @param {{x:number,y:number,z:number}} cur @param {{x:number,y:number,z:number}} c
 */
export function canSee(dim, cur, c) {
  const eye = { x: cur.x + 0.5, y: cur.y + 1.6, z: cur.z + 0.5 };
  // the nearest point of the block to its eyes, nudged just inside the block
  const clampIn = (/** @type {number} */ v, /** @type {number} */ lo) => Math.min(lo + 0.95, Math.max(lo + 0.05, v));
  const to = { x: clampIn(eye.x, c.x), y: clampIn(eye.y, c.y), z: clampIn(eye.z, c.z) };
  const len = Math.hypot(to.x - eye.x, to.y - eye.y, to.z - eye.z);
  const steps = Math.max(1, Math.ceil(len / 0.2));
  for (let s = 1; s < steps; s++) {
    const f = s / steps;
    const p = { x: Math.floor(eye.x + (to.x - eye.x) * f), y: Math.floor(eye.y + (to.y - eye.y) * f), z: Math.floor(eye.z + (to.z - eye.z) * f) };
    if (p.x === c.x && p.y === c.y && p.z === c.z) return true;
    if (p.x === cur.x && p.z === cur.z && (p.y === cur.y || p.y === cur.y + 1)) continue; // its own body
    if (!passable(dim, p)) return false;
  }
  return true;
}

/** Most layers "Clear above" will take off over a quarry before it decides the dig is underground. */
export const CLEAR_ABOVE_MAX = 48;
/**
 * How many layers over a quarry's top hold something (hill, tree, overhang) that would be left
 * floating, up to open sky: the scan stops after 3 empty layers in a row.
 * `open` false = still solid after CLEAR_ABOVE_MAX layers (underground), or the area isn't loaded.
 * @param {import("@minecraft/server").Dimension} dim @param {{x:number,y:number,z:number}} min @param {{x:number,y:number,z:number}} max
 * @returns {{up: number, open: boolean, unloaded?: boolean}}
 */
export function layersAbove(dim, min, max) {
  let last = 0;
  let empty = 0;
  for (let k = 1; k <= CLEAR_ABOVE_MAX + 3; k++) {
    const y = max.y + k;
    let solid = false;
    for (let x = min.x; x <= max.x && !solid; x++) {
      for (let z = min.z; z <= max.z && !solid; z++) {
        const b = dim.getBlock({ x, y, z });
        if (!b) return { up: last, open: false, unloaded: true };
        if (!passable(dim, { x, y, z })) solid = true;
      }
    }
    if (solid) {
      if (k > CLEAR_ABOVE_MAX) return { up: CLEAR_ABOVE_MAX, open: false };
      last = k;
      empty = 0;
    } else if (++empty >= 3) return { up: last, open: true };
  }
  return { up: last, open: false };
}

/** Friendly block name: "minecraft:deepslate_diamond_ore" -> "deepslate diamond ore". @param {string} id */
export const blockName = (id) => id.replace(/^minecraft:/, "").replace(/_/g, " ");

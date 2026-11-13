// Block rules shared by the engine and the pathfinder.

export const AIR = new Set(["minecraft:air", "minecraft:cave_air", "minecraft:void_air"]);
/** Never broken, whatever tool the worker has. */
export const PROTECTED = new Set([
  "minecraft:bedrock", "minecraft:barrier", "minecraft:command_block", "minecraft:repeating_command_block",
  "minecraft:chain_command_block", "minecraft:structure_block", "minecraft:structure_void", "minecraft:jigsaw",
  "minecraft:end_portal_frame", "minecraft:end_portal", "minecraft:portal", "minecraft:end_gateway",
  "minecraft:mob_spawner", "minecraft:trial_spawner", "minecraft:vault", "minecraft:reinforced_deepslate",
  "minecraft:light_block", "minecraft:allow", "minecraft:deny", "minecraft:border_block",
]);
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

/** @param {import("@minecraft/server").Dimension} dim @param {{x:number,y:number,z:number}} p */
export function passable(dim, p) {
  const b = dim.getBlock(p);
  if (!b) return false;
  return b.isAir || b.isLiquid || SOFT.test(b.typeId);
}

/** Friendly block name: "minecraft:deepslate_diamond_ore" -> "deepslate diamond ore". @param {string} id */
export const blockName = (id) => id.replace(/^minecraft:/, "").replace(/_/g, " ");

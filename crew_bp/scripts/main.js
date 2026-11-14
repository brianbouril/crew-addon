// Crew Workers entry point.
import { system, world } from "@minecraft/server";
import { registerCommands } from "./commands.js";
import { startEngine } from "./runner.js";
import { toolSchemas } from "./catalog.js";
import { STAKE, stakeTap, stakeUse, startOutlines } from "./marker.js";
import { giveHeldTool, giveHeldTorches, openMenu } from "./ui.js";
import { TORCH } from "./blocks.js";
import { startWelcome } from "./guide.js";
import { KIT_SLOTS, toolInfo } from "./tools.js";
import { VERSION, tell } from "./util.js";
import { WORKER_TYPE, spawnWorker } from "./workers.js";

system.beforeEvents.startup.subscribe((ev) => {
  registerCommands(ev.customCommandRegistry);
});

startWelcome();

world.afterEvents.worldLoad.subscribe(() => {
  startEngine();
  startOutlines();
  console.log(`[Crew] v${VERSION} loaded`);
  console.log(`[Crew-Schema] ${JSON.stringify(toolSchemas())}`);
});

/** @param {Promise<any> | void} p */
const quiet = (p) => p?.catch?.((/** @type {any} */ err) => console.warn(`[Crew] ${err}`));

// Survey Stake on a block: plan a dig, or mark a deposit chest. Cancelled so chests don't open.
world.beforeEvents.playerInteractWithBlock.subscribe((ev) => {
  if (ev.itemStack?.typeId !== STAKE) return;
  ev.cancel = true;
  if (!ev.isFirstEvent) return;
  const { player, block } = ev;
  system.run(() => quiet(stakeTap(player, block)));
});

/** Player id -> tick their last worker menu opened, so one tap opens one menu. @type {Map<string, number>} */
const lastMenu = new Map();

/** Opens a worker's menu, once per tap. @param {import("@minecraft/server").Player} player @param {import("@minecraft/server").Entity} target */
function workerMenu(player, target) {
  const t = system.currentTick;
  if ((lastMenu.get(player.id) ?? -99) >= t - 4) return;
  lastMenu.set(player.id, t);
  system.run(() => quiet(openMenu(player, target)));
}

/** The worker the player is looking at, within reach. @param {import("@minecraft/server").Player} p */
function workerInSight(p) {
  try {
    return p.getEntitiesFromViewDirection({ maxDistance: 6 }).find((h) => h.entity.typeId === WORKER_TYPE)?.entity;
  } catch {
    return undefined;
  }
}

// Survey Stake in the air: open the current plan. Pointed at a worker, the tap is for the worker
// instead (crouching opens its menu), so the stake's plan menu doesn't cover the worker's.
world.afterEvents.itemUse.subscribe((ev) => {
  if (ev.itemStack?.typeId !== STAKE) return;
  const w = workerInSight(ev.source);
  if (w) {
    if (ev.source.isSneaking) workerMenu(ev.source, w);
    return;
  }
  quiet(stakeUse(ev.source));
});

// Crouch and use a worker: its menu (whatever is in hand).
// Plain use while holding a tool: hand the tool to the worker's kit. Holding torches: hand them over.
world.beforeEvents.playerInteractWithEntity.subscribe((ev) => {
  if (ev.target.typeId !== WORKER_TYPE) return;
  const { player, target } = ev;
  if (player.isSneaking) {
    ev.cancel = true;
    workerMenu(player, target);
  } else if (ev.itemStack?.typeId === TORCH) {
    ev.cancel = true;
    system.run(() => giveHeldTorches(player, target));
  } else if (toolInfo(ev.itemStack)) {
    ev.cancel = true;
    system.run(() => { giveHeldTool(player, target); });
  }
});

// Building a worker: a barrel holding at least one tool, then a carved pumpkin placed on top.
world.afterEvents.playerPlaceBlock.subscribe((ev) => {
  const head = ev.block;
  if (head.typeId !== "minecraft:carved_pumpkin" && head.typeId !== "minecraft:lit_pumpkin") return;
  const body = head.below();
  if (!body || body.typeId !== "minecraft:barrel") return;
  const barrel = body.getComponent("minecraft:inventory")?.container;
  if (!barrel) return;
  /** @type {import("@minecraft/server").ItemStack[]} */
  const items = [];
  for (let i = 0; i < barrel.size; i++) {
    const it = barrel.getItem(i);
    if (it) items.push(it);
  }
  const tools = items.filter((it) => toolInfo(it));
  if (!tools.length) {
    tell(ev.player, "To build a worker, put at least one tool (pickaxe, shovel, axe or hoe) in the barrel, then place the pumpkin again.");
    return;
  }
  barrel.clearAll();
  const dim = head.dimension;
  const at = body.bottomCenter();
  dim.setBlockType(head.location, "minecraft:air");
  dim.setBlockType(body.location, "minecraft:air");
  // tools first, so the kit gets them before anything else
  const ordered = [...tools, ...items.filter((it) => !toolInfo(it))];
  const { e, spill } = spawnWorker(dim, at, { id: ev.player.id, name: ev.player.name }, undefined, ordered);
  for (const it of spill) dim.spawnItem(it, at);
  const extra = tools.length > KIT_SLOTS ? ` Only ${KIT_SLOTS} tools fit in the kit; the other ${tools.length - KIT_SLOTS} are carried and will go in the deposit chest.` : "";
  tell(ev.player, `Crouch and use ${e.getDynamicProperty("crew:name")} to give it orders. New to workers? Type /crew:help.${extra}`);
});

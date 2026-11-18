// Crew Workers entry point.
import { BlockTypes, system, world } from "@minecraft/server";
import { registerCommands } from "./commands.js";
import { isResting, startEngine } from "./runner.js";
import { bedAt, getHome, sameBed } from "./life.js";
import { toolSchemas } from "./catalog.js";
import { STAKE, linkWorker, stakeTap, stakeUse, startOutlines } from "./marker.js";
import { bellMenu, giveHeldTool, giveHeldTorches, openMenu } from "./ui.js";
import { TORCH } from "./blocks.js";
import { startWelcome } from "./guide.js";
import { toolInfo } from "./tools.js";
import { VERSION, onlinePlayer, tell } from "./util.js";
import { WORKER_TYPE, buildFromBarrel, loadedWorkers, workerDied } from "./workers.js";
import { BELL, checkBells, forgetBell, getSettlements, isProtected, protectedKeys, recordBell, refreshStorage, syncOwners, takeQueued } from "./settlement.js";
import { dispatch } from "./orders.js";

system.beforeEvents.startup.subscribe((ev) => {
  registerCommands(ev.customCommandRegistry);
});

startWelcome();

world.afterEvents.worldLoad.subscribe(() => {
  startEngine();
  startOutlines();
  system.runInterval(settlementChores, 40);
  console.log(`[Crew] v${VERSION} loaded`);
  console.log(`[Crew-Schema] ${JSON.stringify(toolSchemas())}`);
});

/** @param {Promise<any> | void} p */
const quiet = (p) => p?.catch?.((/** @type {any} */ err) => console.warn(`[Crew] ${err}`));

/** Players with a stake menu open: further stake taps are ignored until it closes. @type {Set<string>} */
const stakeBusy = new Set();
/** Runs one stake flow at a time per player, so extra taps can't queue menus behind the open one. @param {import("@minecraft/server").Player} player @param {() => Promise<any> | void} fn */
function stakeOnce(player, fn) {
  if (stakeBusy.has(player.id)) return;
  stakeBusy.add(player.id);
  const done = () => system.runTimeout(() => stakeBusy.delete(player.id), 4);
  Promise.resolve().then(fn).catch((err) => console.warn(`[Crew] ${err}`)).finally(done);
}

// Survey Stake on a block: a bed (the linked worker's home), a chest (home chest, drop-off or named
// place), anything else (plan a dig). Cancelled so chests don't open and beds aren't slept in.
world.beforeEvents.playerInteractWithBlock.subscribe((ev) => {
  if (ev.itemStack?.typeId !== STAKE) return;
  ev.cancel = true;
  if (!ev.isFirstEvent) return;
  const { player, block } = ev;
  system.run(() => stakeOnce(player, () => stakeTap(player, block)));
});

// Crouch-tapping a bed a worker is sleeping in opens that worker's menu (lying down, the tap can
// land on the bed rather than on the worker). It keeps sleeping: Wake up is in the menu.
world.beforeEvents.playerInteractWithBlock.subscribe((ev) => {
  if (ev.itemStack?.typeId === STAKE || !ev.player.isSneaking || ev.block.typeId !== "minecraft:bed") return;
  const bed = bedAt(ev.block.dimension, ev.block.location);
  if (!bed) return;
  const sleeper = loadedWorkers().find((w) => {
    const home = getHome(w);
    return home && home.dim === ev.block.dimension.id && sameBed(home, bed) && isResting(w);
  });
  if (!sleeper) return;
  ev.cancel = true;
  if (ev.isFirstEvent) workerMenu(ev.player, sleeper);
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

/** Links the stake to a worker, once per tap. @param {import("@minecraft/server").Player} player @param {import("@minecraft/server").Entity} target */
function stakeLink(player, target) {
  const t = system.currentTick;
  if ((lastMenu.get(player.id) ?? -99) >= t - 4) return;
  lastMenu.set(player.id, t);
  system.run(() => linkWorker(player, target));
}

// Survey Stake in the air: the remote (the linked worker's orders, your plan). Pointed at a worker,
// the tap is for that worker instead: crouching opens its menu, a plain tap links the stake to it.
world.afterEvents.itemUse.subscribe((ev) => {
  if (ev.itemStack?.typeId !== STAKE) return;
  const w = workerInSight(ev.source);
  if (w) {
    if (ev.source.isSneaking) workerMenu(ev.source, w);
    else stakeLink(ev.source, w);
    return;
  }
  stakeOnce(ev.source, () => stakeUse(ev.source));
});

// Crouch and use a worker: its menu (whatever is in hand).
// Plain use holding the stake: link the stake to it. Holding a tool: hand it over for the kit.
// Holding torches: hand them over.
world.beforeEvents.playerInteractWithEntity.subscribe((ev) => {
  if (ev.target.typeId !== WORKER_TYPE) return;
  const { player, target } = ev;
  if (player.isSneaking) {
    ev.cancel = true;
    workerMenu(player, target);
  } else if (ev.itemStack?.typeId === STAKE) {
    ev.cancel = true;
    stakeLink(player, target);
  } else if (ev.itemStack?.typeId === TORCH) {
    ev.cancel = true;
    system.run(() => giveHeldTorches(player, target));
  } else if (toolInfo(ev.itemStack)) {
    ev.cancel = true;
    system.run(() => { giveHeldTool(player, target); });
  }
});

// Placing blocks: a pumpkin on a barrel of tools builds a worker; a bell is remembered as placed by
// that player (only bells you placed yourself can found a settlement).
world.afterEvents.playerPlaceBlock.subscribe((ev) => {
  if (ev.block.typeId === BELL) recordBell(ev.player, ev.block);
  else buildFromBarrel(ev.player, ev.block);
});

// Crouch-tapping a bell: found a settlement, or open its menu. Cancelled so the bell doesn't ring
// (and villagers don't run indoors). A plain tap rings as usual; crouching with a block in hand
// still places it.
world.beforeEvents.playerInteractWithBlock.subscribe((ev) => {
  if (ev.block.typeId !== BELL || !ev.player.isSneaking) return;
  const held = ev.itemStack?.typeId;
  // a held item whose id is also a block's is taken as "placing a block" (approximate: a few items,
  // like seeds or doors, place a block with another id, and those still open the menu)
  if (held === STAKE || (held && BlockTypes.get(held))) return;
  ev.cancel = true;
  if (!ev.isFirstEvent) return;
  const { player, block } = ev;
  system.run(() => quiet(bellMenu(player, block)));
});

// A settlement's bell (and the block holding it up) can't be broken: it's moved from the menu.
world.beforeEvents.playerBreakBlock.subscribe((ev) => {
  if (isProtected(ev.block)) {
    ev.cancel = true;
    const p = ev.player;
    system.run(() => tell(p, "That's a settlement bell. Move the bell from the settlement menu (crouch-tap it)."));
  } else if (ev.block.typeId === BELL) {
    const b = { typeId: ev.block.typeId, dimension: ev.block.dimension, location: ev.block.location };
    system.run(() => forgetBell(b));
  }
});

// Explosions skip settlement bells and what holds them up.
world.beforeEvents.explosion.subscribe((ev) => {
  const blocks = ev.getImpactedBlocks();
  const keys = protectedKeys();
  const keep = blocks.filter((b) => !isProtected(b, keys));
  if (keep.length !== blocks.length) ev.setImpactedBlocks(keep);
});

// A worker that dies no longer counts toward the worker limit or shows in the settlement list.
world.afterEvents.entityDie.subscribe((ev) => {
  if (ev.deadEntity.typeId === WORKER_TYPE) workerDied(ev.deadEntity);
});

/** Chores calls (2 s each) between re-reads of the settlement storage chests that are loaded. */
const STORAGE_EVERY = 3;
let storageIn = 0;
/**
 * Every 2 seconds: notice lost bells, keep workers owned by their settlement's founder, give loaded
 * workers the orders that waited for them; every 6 seconds re-read loaded storage chests.
 */
function settlementChores() {
  try {
    checkBells();
    syncOwners();
    if (--storageIn <= 0) {
      storageIn = STORAGE_EVERY;
      for (const s of Object.values(getSettlements())) refreshStorage(s);
    }
    for (const e of loadedWorkers()) {
      for (const q of takeQueued(e.id)) {
        const r = dispatch(q.by, q.order);
        if (!r.ok) tell(onlinePlayer(q.by), `§c${r.message}`);
      }
    }
  } catch (err) {
    console.warn(`[Crew] ${err}`);
  }
}

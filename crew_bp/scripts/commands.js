// Slash commands. Each one turns its arguments into an order or a small admin action.
// Callbacks run in a read-only "before" context, so all real work is deferred with later().
import { CommandPermissionLevel, CustomCommandParamType as T, CustomCommandSource, CustomCommandStatus, ItemStack } from "@minecraft/server";
import { KEEP, catalogText, toolSchemas } from "./catalog.js";
import { b64decode, fmt, onlinePlayer, setJSON, tell } from "./util.js";
import { getPlaces, canUsePlace, removePlace, savePlace, getRegistry } from "./store.js";
import { canCommand, canManage, dismissWorker, findWorker, later, loadedWorkers, meta, renameWorker, spawnWorker } from "./workers.js";
import { getPlan, giveStake, planOrder } from "./marker.js";
import { openMenu } from "./ui.js";
import { openGuide } from "./guide.js";
import { dispatch } from "./orders.js";
import { statusText, stopJob } from "./runner.js";
import { getCap, setCap } from "./settlement.js";

/** @typedef {import("./store.js").Commander & {player?: import("@minecraft/server").Player}} Who */

/** @param {import("@minecraft/server").CustomCommandOrigin} origin @returns {Who | undefined} */
function who(origin) {
  const src = origin.sourceEntity;
  if (src && src.typeId === "minecraft:player") {
    const p = /** @type {import("@minecraft/server").Player} */ (src);
    return { id: p.id, name: p.name, isOp: p.commandPermissionLevel >= CommandPermissionLevel.GameDirectors, player: p };
  }
  if (origin.sourceType === CustomCommandSource.Server) return { name: "console", isOp: true, console: true };
  return undefined;
}

/** @param {Who} by @param {boolean} ok @param {string} message */
function answer(by, ok, message) {
  if (by.player) tell(by.player, ok ? message : `§c${message}`);
  else console.log(`[Crew-Result] ${JSON.stringify({ ok, message })}`);
}

const OK = { status: CustomCommandStatus.Success };
const NEED_PLAYER = { status: CustomCommandStatus.Failure, message: "Crew commands need a player or the server console." };

/**
 * Registers a command whose body runs on the next tick with the resolved commander.
 * @param {import("@minecraft/server").CustomCommandRegistry} reg
 * @param {import("@minecraft/server").CustomCommand} def
 * @param {(by: Who, ...args: any[]) => void} body
 */
function cmd(reg, def, body) {
  reg.registerCommand({ cheatsRequired: false, ...def }, (origin, ...args) => {
    const by = who(origin);
    if (!by) return NEED_PLAYER;
    later(() => body(by, ...args));
    return OK;
  });
}

/** @param {Who} by @param {string} name */
function workerFor(by, name, manage = false) {
  const e = findWorker(name);
  if (!e) {
    answer(by, false, getRegistry()[name.toLowerCase()] ? `${name} isn't loaded right now.` : `No worker called '${name}'.`);
    return undefined;
  }
  const m = meta(e);
  if (manage ? !canManage(by, m) : !canCommand(by, m)) {
    answer(by, false, manage ? `Only ${m.ownerName} can do that with ${m.name}.` : `${m.name} only takes orders from ${m.ownerName} and their crew.`);
    return undefined;
  }
  return e;
}

/** @param {import("@minecraft/server").CustomCommandRegistry} reg */
export function registerCommands(reg) {
  reg.registerEnum("crew:keep", KEEP);
  const ANY = CommandPermissionLevel.Any;

  cmd(reg, { name: "crew:hire", description: "Debug: spawn a worker you own (operators only).", permissionLevel: CommandPermissionLevel.GameDirectors, optionalParameters: [{ name: "name", type: T.String }] },
    (by, name) => {
      if (!by.player) return answer(by, false, "Run /crew:hire as a player.");
      spawnWorker(by.player.dimension, by.player.location, { id: by.id, name: by.name }, name,
        [new ItemStack("minecraft:iron_pickaxe", 1), new ItemStack("minecraft:iron_shovel", 1)]);
    });

  cmd(reg, { name: "crew:stake", description: "Get a Survey Stake for marking dig boxes and deposit chests.", permissionLevel: ANY },
    (by) => {
      if (!by.player) return answer(by, false, "Run /crew:stake as a player.");
      const msg = giveStake(by.player);
      answer(by, msg.startsWith("Survey Stake added"), msg);
    });

  cmd(reg, { name: "crew:setplace", description: "Save the chest you're looking at (or where you stand) as a named place.", permissionLevel: ANY,
    mandatoryParameters: [{ name: "name", type: T.String }], optionalParameters: [{ name: "shared", type: T.Boolean }] },
    (by, name, shared) => {
      const p = by.player;
      if (!p) return answer(by, false, "Run /crew:setplace as a player.");
      const hit = p.getBlockFromViewDirection({ maxDistance: 6 });
      const isBox = !!hit?.block.getComponent("minecraft:inventory");
      const loc = isBox && hit ? hit.block.location : p.location;
      savePlace(by, name, p.dimension.id, loc, !!shared);
      answer(by, true, `Saved '${name}' at ${fmt(loc)}${isBox ? ` (${hit?.block.typeId.replace("minecraft:", "")})` : " (where you stand; look at a chest to save the chest)"}${shared ? ", shared with everyone" : ", private to you"}.`);
    });

  cmd(reg, { name: "crew:forget", description: "Delete one of your saved places.", permissionLevel: ANY, mandatoryParameters: [{ name: "name", type: T.String }] },
    (by, name) => {
      const n = removePlace(by, name);
      answer(by, n > 0, n > 0 ? `Forgot '${name}'.` : `You have no place called '${name}'.`);
    });

  cmd(reg, { name: "crew:places", description: "List the places you can use.", permissionLevel: ANY },
    (by) => {
      const list = getPlaces().filter((p) => canUsePlace(by, p));
      answer(by, true, list.length ? list.map((p) => `${p.name} @ ${p.x} ${p.y} ${p.z}${p.shared ? " (shared)" : ""} by ${p.ownerName}`).join("\n") : "No places yet. Look at a chest and run /crew:setplace \"name\".");
    });

  cmd(reg, { name: "crew:cap", description: "Operators: the worker limit, per person in a settlement and on your own (no number: show it).", permissionLevel: CommandPermissionLevel.GameDirectors,
    optionalParameters: [{ name: "workers", type: T.Integer }] },
    (by, n) => {
      if (n === undefined) return answer(by, true, `The worker limit is ${getCap()} for each person in a settlement, and ${getCap()} for a player on their own. To change it, put a number after the command, e.g. /crew:cap 8.`);
      const r = setCap(by, n);
      answer(by, r.ok, r.message);
    });

  cmd(reg, { name: "crew:workers", description: "List workers you can command.", permissionLevel: ANY },
    (by) => {
      const lines = [];
      const seen = new Set();
      for (const e of loadedWorkers()) {
        const m = meta(e);
        seen.add(m.name.toLowerCase());
        if (canCommand(by, m)) lines.push(`${m.name} (owner ${m.ownerName}): ${statusText(e)}`);
      }
      for (const [key, r] of Object.entries(getRegistry())) {
        if (!seen.has(key) && (by.isOp || r.ownerId === by.id)) lines.push(`${r.name} (owner ${r.ownerName}): not loaded`);
      }
      answer(by, true, lines.length ? lines.join("\n") : "You have no workers. Build one: put a pickaxe (and any other tools) in a barrel, then place a carved pumpkin on top.");
    });

  const order = (/** @type {Who} */ by, /** @type {any} */ o) => {
    const r = dispatch(by, o);
    answer(by, r.ok, r.message);
  };

  cmd(reg, { name: "crew:mine", description: "Start the dig you planned and confirmed with the Survey Stake.", permissionLevel: ANY,
    mandatoryParameters: [{ name: "worker", type: T.String }],
    optionalParameters: [{ name: "deposit", type: T.String }, { name: "crew:keep", type: T.Enum }] },
    (by, worker, deposit, keep) => {
      const p = by.player;
      if (!p) return answer(by, false, "From the console, use /crew:minebox or /crew:exec.");
      const plan = getPlan(p);
      if (!plan?.confirmed) return answer(by, false, "Plan a dig with the Survey Stake first (/crew:stake), then use it on the same block again and pick Confirm.");
      let dep = deposit;
      if (!dep) {
        const d = p.getDynamicProperty("crew:deposit");
        if (typeof d !== "object") return answer(by, false, "Where should it deposit? Use the stake on a chest, or name a place: /crew:mine Digby \"blue base\".");
        dep = [d.x, d.y, d.z];
      }
      const o = planOrder(plan);
      order(by, { worker, job: o.job, params: { ...o.params, deposit: dep, keep } });
    });

  cmd(reg, { name: "crew:menu", description: "Open a worker's menu (same as crouching and using it).", permissionLevel: ANY, mandatoryParameters: [{ name: "worker", type: T.String }] },
    (by, worker) => {
      if (!by.player) return answer(by, false, "Run /crew:menu as a player.");
      const e = findWorker(worker);
      if (!e) return answer(by, false, `No loaded worker called '${worker}'.`);
      const pl = by.player;
      openMenu(pl, e).catch((err) => console.warn(`[Crew] ${err}`));
    });

  cmd(reg, { name: "crew:minebox", description: "Quarry a box given by two corners.", permissionLevel: ANY,
    mandatoryParameters: [{ name: "worker", type: T.String }, { name: "from", type: T.Location }, { name: "to", type: T.Location }],
    optionalParameters: [{ name: "deposit", type: T.String }, { name: "crew:keep", type: T.Enum }] },
    (by, worker, from, to, deposit, keep) => {
      // quarry from two corners; the stairs start at the north-west top corner heading east
      let dep = deposit;
      if (!dep && by.player) {
        const d = by.player.getDynamicProperty("crew:deposit");
        if (typeof d === "object") dep = [d.x, d.y, d.z];
      }
      order(by, { worker, job: "quarry", params: { from, to, deposit: dep, keep } });
    });

  cmd(reg, { name: "crew:come", description: "Call a worker to you.", permissionLevel: ANY, mandatoryParameters: [{ name: "worker", type: T.String }] },
    (by, worker) => order(by, { worker, job: "come", params: {} }));

  cmd(reg, { name: "crew:halt", description: "Stop a worker's job.", permissionLevel: ANY, mandatoryParameters: [{ name: "worker", type: T.String }] },
    (by, worker) => order(by, { worker, job: "stop", params: {} }));

  cmd(reg, { name: "crew:continue", description: "Continue a worker's stopped quarry or branch mine where it left off.", permissionLevel: ANY, mandatoryParameters: [{ name: "worker", type: T.String }] },
    (by, worker) => order(by, { worker, job: "resume", params: {} }));

  cmd(reg, { name: "crew:status", description: "Show what a worker is doing.", permissionLevel: ANY, mandatoryParameters: [{ name: "worker", type: T.String }] },
    (by, worker) => order(by, { worker, job: "status", params: {} }));

  cmd(reg, { name: "crew:allow", description: "Let another player give orders to your worker.", permissionLevel: ANY,
    mandatoryParameters: [{ name: "worker", type: T.String }, { name: "player", type: T.PlayerSelector }] },
    (by, worker, players) => {
      const e = workerFor(by, worker, true);
      if (!e) return;
      const m = meta(e);
      const list = /** @type {import("@minecraft/server").Player[]} */ (players ?? []);
      for (const pl of list) if (!m.crew.some((c) => c.id === pl.id)) m.crew.push({ id: pl.id, name: pl.name });
      setJSON(e, "crew:crew", m.crew);
      answer(by, true, `${m.name}'s crew: ${m.crew.map((c) => c.name).join(", ") || "nobody yet"}.`);
      for (const pl of list) tell(pl, `${by.name} added you to ${m.name}'s crew. You can give it orders now.`);
    });

  cmd(reg, { name: "crew:deny", description: "Remove a player from your worker's crew.", permissionLevel: ANY,
    mandatoryParameters: [{ name: "worker", type: T.String }, { name: "player", type: T.String }] },
    (by, worker, player) => {
      const e = workerFor(by, worker, true);
      if (!e) return;
      const m = meta(e);
      const crew = m.crew.filter((c) => c.name.toLowerCase() !== String(player).toLowerCase());
      setJSON(e, "crew:crew", crew);
      answer(by, true, `${m.name}'s crew: ${crew.map((c) => c.name).join(", ") || "just you"}.`);
    });

  cmd(reg, { name: "crew:crew", description: "Show who can give orders to a worker.", permissionLevel: ANY, mandatoryParameters: [{ name: "worker", type: T.String }] },
    (by, worker) => {
      const e = findWorker(worker);
      if (!e) return answer(by, false, `No loaded worker called '${worker}'.`);
      const m = meta(e);
      answer(by, true, `${m.name}: owner ${m.ownerName}; also allowed: ${m.crew.map((c) => c.name).join(", ") || "nobody"}. Operators can always give orders.`);
    });

  cmd(reg, { name: "crew:rename", description: "Rename your worker.", permissionLevel: ANY,
    mandatoryParameters: [{ name: "worker", type: T.String }, { name: "name", type: T.String }] },
    (by, worker, name) => {
      const e = workerFor(by, worker, true);
      if (e) answer(by, true, `Renamed to ${renameWorker(e, name)}.`);
    });

  cmd(reg, { name: "crew:dismiss", description: "Dismiss your worker. It drops its tools, what it carries and its barrel and pumpkin.", permissionLevel: ANY,
    mandatoryParameters: [{ name: "worker", type: T.String }] },
    (by, worker) => {
      const e = workerFor(by, worker, true);
      if (!e) return;
      const name = meta(e).name;
      stopJob(e, undefined);
      dismissWorker(e);
      answer(by, true, `${name} dismissed.`);
    });

  cmd(reg, { name: "crew:jobs", description: "List the jobs workers know.", permissionLevel: ANY },
    (by) => answer(by, true, catalogText()));

  cmd(reg, { name: "crew:guide", description: "How Crew Workers work: a short in-game guide.", permissionLevel: ANY },
    (by) => {
      if (!by.player) return answer(by, true, "The guide is in game: players type /crew:guide.");
      openGuide(by.player).catch(() => {});
    });

  cmd(reg, { name: "crew:ask", description: "Give a worker an order in plain words (needs the Phase 2 bridge).", permissionLevel: ANY,
    mandatoryParameters: [{ name: "worker", type: T.String }, { name: "text", type: T.String }] },
    (by, worker, text) => {
      const e = workerFor(by, worker);
      if (!e) return;
      const m = meta(e);
      // The Phase 2 bridge reads this line, asks the LLM, and answers with /crew:exec.
      console.log(`[Crew-Event] ${JSON.stringify({ type: "ask", worker: m.name, owner: m.ownerName, by: by.name, at: fmt(e.location), text })}`);
      answer(by, true, `${m.name} heard you, but no brain is connected yet. For now use /crew:jobs to see the exact orders it understands.`);
    });

  cmd(reg, { name: "crew:exec", description: "Machine entry point: run an order given as JSON or base64 JSON (server console only).", permissionLevel: CommandPermissionLevel.Owner,
    mandatoryParameters: [{ name: "json", type: T.String }] },
    (by, raw) => {
      let o;
      try {
        const s = String(raw).trim();
        o = JSON.parse(s.startsWith("{") ? s : b64decode(s));
      } catch {
        return answer(by, false, "exec needs JSON like {\"by\":\"Steve\",\"worker\":\"Digby\",\"job\":\"status\",\"params\":{}}");
      }
      if (o.schema) return console.log(`[Crew-Schema] ${JSON.stringify(toolSchemas())}`);
      // The order runs with the permissions of the player it is on behalf of, so a bridge
      // can't make one player's request command another player's worker.
      const pl = o.by ? onlinePlayer({ name: String(o.by) }) : undefined;
      /** @type {Who} */
      const as = o.by ? { name: String(o.by), id: pl?.id, isOp: pl ? pl.commandPermissionLevel >= CommandPermissionLevel.GameDirectors : false } : by;
      const r = dispatch(as, o);
      console.log(`[Crew-Result] ${JSON.stringify({ ok: r.ok, message: r.message, worker: o.worker, job: o.job })}`);
    });
}

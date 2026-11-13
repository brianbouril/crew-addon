// The job engine. Every tick it advances each working worker by one small, predictable step.
// Digging follows the step list from plans.js; trips to the deposit and back use the A*
// pathfinder in path.js. Tools come from the worker's kit (tools.js).
import { world, system } from "@minecraft/server";
import { AIR, GRAVITY, PROTECTED, SIGNS, VALUABLE, blockName, passable } from "./blocks.js";
import { off, column, startCell, stepAt } from "./plans.js";
import { newSearch, advance } from "./path.js";
import { KIT_SLOTS, chooseTool, freeHaulSlots, kit, kitText, stash, ticksFor, toolInfo, wear } from "./tools.js";
import { center, dist, floorV, fmt, getJSON, lerp, setJSON, onlinePlayer, sameV } from "./util.js";
import { emit, loadedWorkers, meta } from "./workers.js";

/**
 * @typedef {import("@minecraft/server").Entity} Entity
 * @typedef {import("@minecraft/server").Container} Container
 * @typedef {{x:number,y:number,z:number}} V3
 * @typedef {{goal: V3, reach: number, search?: any, path?: V3[], idx: number, glide?: {from: V3, to: V3, t: number, n: number}, replans: number}} Walk
 * @typedef {{e: Entity, job: any, st: any, walk?: Walk, saveIn: number, area?: V3, areaIn: number, comeGoal?: V3}} Runtime
 */

/** @type {Map<string, Runtime>} */
const active = new Map();
const SEARCH_BUDGET = 150; // A* expansions per worker per tick
const MOVE_TICKS = { normal: 4, fast: 2 }; // ticks to step one block when not digging
const SKIP_LOG_MAX = 100;

// ---------- lifecycle ----------
/** @param {Entity} e @param {any} job */
export function startJob(e, job) {
  stopJob(e, undefined);
  const st = { phase: job.type === "come" ? "walking" : "travel_in", i: 0, pct: 0, finds: [], hazards: {}, blinks: 0, uses: {}, skipped: [], skipCount: {}, skipTotal: 0 };
  setJSON(e, "crew:job", job);
  setJSON(e, "crew:state", st);
  e.triggerEvent("crew:start_work");
  active.set(e.id, { e, job, st, saveIn: 20, areaIn: 0 });
  if (job.type === "quarry") {
    const g = job.geom;
    emit(e, "job_started", { mode: "quarry", corner: fmt(g.anchor), facing: g.facing, size: [g.L, g.W, g.D], blocks: g.total, deposit: job.deposit.label },
      `starting a ${g.L}x${g.W} quarry, ${g.D} deep (${g.total} blocks) from ${fmt(g.anchor)} heading ${g.facing}. Depositing at ${job.deposit.label}.`);
  } else if (job.type === "branch_mine") {
    const g = job.geom;
    emit(e, "job_started", { mode: "branch_mine", start: fmt(g.anchor), facing: g.facing, target_y: g.ty, trunk: g.L, branch: g.B, spacing: g.s, deposit: job.deposit.label },
      `starting a branch mine at ${fmt(g.anchor)} heading ${g.facing}: ${g.n > 0 ? `stairs down to Y ${g.ty}, ` : ""}a ${g.L}-block trunk, then ${g.branchAt.length * 2} branches ${g.B} long with ${g.s} blocks between. Depositing at ${job.deposit.label}.`);
  }
}

/** @param {Entity} e @param {string | undefined} why  undefined = silent */
export function stopJob(e, why) {
  const job = getJSON(e, "crew:job", undefined);
  if (job?.tickingArea) {
    try {
      e.dimension.runCommand(`tickingarea remove crew_${job.id}`);
    } catch {
      /* already gone */
    }
  }
  if (job && why) emit(e, "stopped", { reason: why }, why);
  active.delete(e.id);
  setJSON(e, "crew:job", undefined);
  setJSON(e, "crew:state", undefined);
  try {
    e.setProperty("crew:anim", 0);
    if (job) e.triggerEvent("crew:stop_work");
  } catch {
    /* entity gone */
  }
}

/** One-paragraph status for the menu and /crew:status. @param {Entity} e */
export function statusText(e) {
  const job = getJSON(e, "crew:job", undefined);
  const st = active.get(e.id)?.st ?? getJSON(e, "crew:state", {});
  const inv = /** @type {Container} */ (e.getComponent("minecraft:inventory")?.container);
  const hauling = inv ? inv.size - KIT_SLOTS - freeHaulSlots(inv) : 0;
  const tools = inv ? kitText(kit(inv)) : "no tools";
  const where = fmt(e.location);
  const last = getJSON(e, "crew:skipped", undefined);
  let line;
  if (!job) {
    line = `Idle at ${where}.`;
    if (last?.blocks?.length) line += ` Last job left ${last.total} block${last.total === 1 ? "" : "s"} its tools couldn't harvest.`;
  } else if (job.type === "come") {
    line = `Walking to ${job.target.name}.`;
  } else {
    const total = job.geom.total;
    const pct = Math.floor((100 * Math.min(st.i ?? 0, total)) / total);
    const what = job.type === "quarry" ? "Quarry" : "Branch mine";
    const doing = { travel_in: "heading to the site", working: "digging", to_deposit: "taking a load to the deposit", wait_deposit: "waiting for deposit space", wait_tool: `waiting at the deposit for ${st.needTool === "pickaxe" ? "a pickaxe" : "a tool"}`, return: "heading back to the dig" }[/** @type {string} */ (st.phase)] ?? st.phase;
    line = `${what} ${pct}% (step ${st.i ?? 0} of ${total}), ${doing}${st.wait ? ` (${st.wait})` : ""}, at ${where}.`;
    if (st.skipTotal) line += ` Left ${st.skipTotal} block${st.skipTotal === 1 ? "" : "s"} it couldn't harvest (${Object.entries(st.skipCount).map(([t, n]) => `${n} ${blockName(t)}`).join(", ")}).`;
  }
  return `${line}\nHauling ${hauling}/${inv ? inv.size - KIT_SLOTS : 22} stacks. Tools: ${tools}.`;
}

// ---------- the tick loop ----------
export function startEngine() {
  system.runInterval(() => {
    for (const rt of [...active.values()]) {
      if (!rt.e.isValid) {
        active.delete(rt.e.id); // unloaded; adopt() picks it up again when its chunk loads
        continue;
      }
      try {
        keepLoaded(rt);
        if (rt.job.type === "come") stepCome(rt);
        else stepDig(rt);
        if (--rt.saveIn <= 0 && active.has(rt.e.id)) {
          setJSON(rt.e, "crew:state", rt.st);
          rt.saveIn = 20;
        }
      } catch (err) {
        console.warn(`[Crew] job error: ${err}`);
        try {
          emit(rt.e, "job_failed", { reason: String(err) }, `had a problem and stopped: ${err}`);
          stopJob(rt.e, undefined);
        } catch {
          active.delete(rt.e.id);
        }
      }
    }
  }, 1);
  system.runInterval(adopt, 40);
}

/** Resumes saved jobs on workers that just loaded (after a restart or when a player comes back). */
function adopt() {
  for (const e of loadedWorkers()) {
    if (active.has(e.id)) continue;
    const job = getJSON(e, "crew:job", undefined);
    if (!job) continue;
    const st = getJSON(e, "crew:state", { phase: "travel_in", i: 0 });
    st.cool = 0;
    st.move = undefined;
    active.set(e.id, { e, job, st, saveIn: 20, areaIn: 0 });
    e.triggerEvent("crew:start_work");
  }
}

/** Keeps the chunks around a working worker loaded with a small ticking area that follows it. @param {Runtime} rt */
function keepLoaded(rt) {
  if (--rt.areaIn > 0) return;
  rt.areaIn = 40;
  const at = floorV(rt.e.location);
  if (rt.area && dist(rt.area, at) < 24) return;
  const dim = rt.e.dimension;
  try {
    if (rt.area || rt.job.tickingArea) dim.runCommand(`tickingarea remove crew_${rt.job.id}`);
  } catch {
    /* not there yet */
  }
  try {
    const r = dim.runCommand(`tickingarea add circle ${at.x} ${at.y} ${at.z} 2 crew_${rt.job.id} true`);
    if (r.successCount > 0 && !rt.job.tickingArea) {
      rt.job.tickingArea = true;
      setJSON(rt.e, "crew:job", rt.job);
    }
  } catch {
    /* the world's ticking-area limit (10) is reached; the job still runs while a player is near */
  }
  rt.area = at;
}

// ---------- come ----------
/** @param {Runtime} rt */
function stepCome(rt) {
  const p = onlinePlayer(rt.job.target);
  if (!p || p.dimension.id !== rt.e.dimension.id) {
    stopJob(rt.e, "can't find that player in this dimension, so I stopped.");
    return;
  }
  const here = floorV(p.location);
  if (!rt.comeGoal || dist(rt.comeGoal, here) > 3) {
    rt.comeGoal = here;
    rt.walk = undefined;
  }
  rt.e.setProperty("crew:anim", rt.walk?.path ? 1 : 0);
  if (walkTo(rt, rt.comeGoal, 2.2) === "arrived" && dist(rt.e.location, p.location) < 4) {
    emit(rt.e, "arrived", { to: p.name }, `here, ${p.name}.`);
    stopJob(rt.e, undefined);
  }
}

// ---------- digging jobs ----------
/** @param {Runtime} rt */
function stepDig(rt) {
  const { e, job, st } = rt;
  const inv = /** @type {Container} */ (e.getComponent("minecraft:inventory")?.container);
  if (!inv) throw new Error("worker has no inventory");
  switch (st.phase) {
    case "travel_in":
      e.setProperty("crew:anim", rt.walk?.path ? 1 : 0);
      if (walkTo(rt, startCell(job), 1.8) === "arrived") {
        st.phase = "working";
        st.cool = 0;
      }
      return;
    case "to_deposit": {
      e.setProperty("crew:anim", rt.walk?.path ? 1 : 0);
      if (walkTo(rt, job.deposit, 2.6) !== "arrived") return;
      const r = deposit(e, job, inv);
      if (r !== "ok") {
        st.phase = "wait_deposit";
        st.wait = r;
        st.retry = 100;
        emit(e, r === "full" ? "deposit_full" : "deposit_missing", { deposit: job.deposit.label },
          r === "full" ? `${job.deposit.label} is full. Waiting for space.` : `can't find a chest or barrel at ${job.deposit.label}. Waiting.`);
        return;
      }
      afterDeposit(rt);
      return;
    }
    case "wait_deposit":
      e.setProperty("crew:anim", 0);
      if (--st.retry > 0) return;
      st.retry = 100;
      if (deposit(e, job, inv) === "ok") {
        st.wait = undefined;
        afterDeposit(rt);
      }
      return;
    case "wait_tool": {
      e.setProperty("crew:anim", 0);
      if (--st.retry > 0) return;
      st.retry = 20;
      const k = kit(inv);
      if (st.needTool === "pickaxe" ? k.some((t) => t.info.kind === "pickaxe") : k.length > 0) {
        emit(e, "tool_ok", { tools: kitText(k) }, `got tools (${kitText(k)}). Back to work.`);
        st.needTool = undefined;
        st.phase = st.i === 0 ? "travel_in" : "return";
      }
      return;
    }
    case "return":
      e.setProperty("crew:anim", rt.walk?.path ? 1 : 0);
      if (walkTo(rt, st.stand ?? startCell(job), st.stand ? 0.5 : 1.8) === "arrived") {
        st.phase = "working";
        st.cool = 0;
      }
      return;
    case "working":
      work(rt, inv);
      return;
    default:
      st.phase = "working";
  }
}

/** @param {Runtime} rt @param {Container} inv */
function work(rt, inv) {
  const { e, job, st } = rt;
  const dim = e.dimension;

  // glide toward the cell just dug, one beat at a time
  if (st.cool > 0) {
    st.cool--;
    if (st.move) {
      const t = 1 - st.cool / st.move.n;
      e.teleport(lerp(st.move.from, st.move.to, t), st.move.face ? { facingLocation: st.move.face } : undefined);
    }
    return;
  }
  if (st.done) {
    st.done = false;
    if (st.grav && (st.regrav ?? 0) < 16) st.regrav = (st.regrav ?? 0) + 1; // sand or gravel was above: check this step again
    else {
      st.i++;
      st.regrav = 0;
      progress(rt);
    }
  }
  e.setProperty("crew:anim", 2);

  const total = job.geom.total;
  if (st.i >= total) {
    st.final = true;
    if (job.keep === "nothing" || freeHaulSlots(inv) === inv.size - KIT_SLOTS) finish(rt);
    else st.phase = "to_deposit";
    return;
  }
  if (job.keep !== "nothing" && freeHaulSlots(inv) <= 1) {
    st.phase = "to_deposit";
    return;
  }
  let k = kit(inv);
  if (!k.length) return needTool(rt, "tool");

  const s = stepAt(job, st.i);
  if (s.keep) {
    if (patchStair(rt, s.keep, inv, k) === "unloaded") st.wait = "chunk not loaded";
    else st.i++;
    return;
  }

  let ticks = 0;
  let grav = false;
  for (const c of s.mine ?? []) {
    const r = mineCell(rt, c, inv, k);
    if (r.res === "unloaded") {
      st.wait = "chunk not loaded";
      return;
    }
    if (r.res === "wait") return needTool(rt, "pickaxe");
    ticks += r.ticks;
    grav ||= r.grav;
    if (r.res === "broke") {
      k = kit(inv);
      if (!k.length) return needTool(rt, "tool");
    }
  }
  st.wait = undefined;

  /** @type {V3 | undefined} */
  let stand = s.stand;
  if (s.mine?.length && s.sides && s.mine.every((/** @type {V3} */ c) => !passable(dim, c))) {
    const d = detour(rt, s, inv, k);
    ticks += d.ticks;
    if (d.stand) stand = d.stand;
    if (d.res === "wait") return needTool(rt, "pickaxe");
  }

  const pace = /** @type {"normal"|"fast"} */ (job.pace);
  if (stand) {
    const n = Math.max(ticks, MOVE_TICKS[pace] ?? 4);
    const to = center(stand);
    const from = e.location;
    const face = sameV(floorV(from), stand) ? undefined : { x: to.x + (to.x - from.x), y: to.y + 0.5, z: to.z + (to.z - from.z) };
    st.stand = stand;
    st.move = { from, to, face, n };
    st.cool = n;
  } else {
    st.move = undefined;
    st.cool = ticks;
  }
  st.grav = grav;
  st.done = true;
}

/**
 * Breaks one block with the best tool in the kit.
 * @param {Runtime} rt @param {V3} c @param {Container} inv @param {import("./tools.js").KitEntry[]} k
 * @returns {{res: "air"|"mined"|"left"|"broke"|"wait"|"unloaded", ticks: number, grav: boolean}}
 */
function mineCell(rt, c, inv, k) {
  const { e, job, st } = rt;
  const dim = e.dimension;
  const block = dim.getBlock(c);
  if (!block) return { res: "unloaded", ticks: 0, grav: false };
  const id = block.typeId;
  const no = { ticks: 0, grav: false };
  if (AIR.has(id)) return { res: "air", ...no };
  if (block.isLiquid || id.endsWith("water") || id.endsWith("lava")) {
    if (id.includes("lava") && !st.hazards.lava) {
      st.hazards.lava = true;
      emit(e, "hazard", { kind: "lava", at: fmt(c) }, `hit lava at ${fmt(c)}. Leaving liquids in place and carrying on.`);
    }
    return { res: "air", ...no };
  }
  const sign = /** @type {Record<string,string>} */ (SIGNS)[id];
  if (PROTECTED.has(id)) {
    if (sign) noteFind(rt, sign, c);
    return { res: "left", ...no };
  }
  const box = block.getComponent("minecraft:inventory")?.container;
  if (box && box.emptySlotsCount < box.size) {
    noteFind(rt, "container with items (possible structure loot)", c);
    return { res: "left", ...no };
  }
  const choice = chooseTool(k, id);
  if (choice.use === "wait") return { res: "wait", ...no };
  if (choice.use === "skip") {
    logSkip(rt, id, c, choice.need);
    return { res: "left", ...no };
  }
  if (sign) noteFind(rt, sign, c);
  const tool = choice.use === "tool" ? choice.tool : undefined;
  const ticks = ticksFor(tool, inv, job.pace);
  const item = tool ? inv.getItem(tool.slot) : undefined;
  lootMgr ??= world.getLootTableManager();
  const drops = lootMgr.generateLootFromBlock(block, item) ?? [];
  const above = dim.getBlock({ x: c.x, y: c.y + 1, z: c.z });
  const grav = !!above && GRAVITY.test(above.typeId);
  dim.setBlockType(c, "minecraft:air");
  for (const drop of drops) {
    const keep = job.keep === "all" || (job.keep === "valuables" && VALUABLE.test(drop.typeId));
    if (!keep) continue;
    const left = stash(inv, drop);
    if (left) dim.spawnItem(left, e.location); // never lose items
  }
  if (!tool) return { res: "mined", ticks, grav };
  const label = tool.info.label;
  const w = wear(inv, tool, st.uses);
  if (w === "low") emit(e, "tool_low", { tool: label }, `my ${label} is nearly worn out (10% left).`);
  if (w === "broke") {
    const rest = kit(inv);
    const next = rest.filter((t) => t.info.kind === tool.info.kind);
    emit(e, "tool_broke", { tool: label, left: kitText(rest) },
      `my ${label} broke. ${next.length ? `Switching to the ${next[0].info.label}.` : rest.length ? `Still have: ${kitText(rest)}.` : "That was my last tool."}`);
    return { res: "broke", ticks, grav };
  }
  return { res: "mined", ticks, grav };
}
/** @type {import("@minecraft/server").LootTableManager | undefined} */
let lootMgr;

/**
 * Every cell of a tunnel step had to be left (nothing in the kit can harvest it), so dig a
 * U-shaped detour beside it: the side columns before, at and after the blocked spot.
 * @param {Runtime} rt @param {any} s @param {Container} inv @param {import("./tools.js").KitEntry[]} k
 * @returns {{res: string, ticks: number, stand?: V3}}
 */
function detour(rt, s, inv, k) {
  const dim = rt.e.dimension;
  let ticks = 0;
  for (const side of s.sides) {
    for (const m of [-1, 0, 1]) {
      for (const c of column(off(off(s.stand, s.fwd, m), side, 1), 2)) {
        const r = mineCell(rt, c, inv, k);
        if (r.res === "wait") return { res: "wait", ticks };
        ticks += r.ticks;
        if (r.res === "broke") k = kit(inv);
      }
    }
    const mid = off(s.stand, side, 1);
    const midUp = { x: mid.x, y: mid.y + 1, z: mid.z };
    if (passable(dim, mid) || passable(dim, midUp)) {
      emit(rt.e, "detour", { at: fmt(s.stand) }, `dug around blocks I can't harvest at ${fmt(s.stand)}.`);
      return { res: "ok", ticks, stand: passable(dim, mid) ? mid : midUp };
    }
  }
  return { res: "blocked", ticks };
}

/**
 * Quarry stair block: keep what's there if it's solid, or patch it with cobblestone so the
 * spiral stays walkable (sand and gravel are swapped out because they'd fall).
 * @param {Runtime} rt @param {V3} c @param {Container} inv @param {import("./tools.js").KitEntry[]} k
 */
function patchStair(rt, c, inv, k) {
  const dim = rt.e.dimension;
  const block = dim.getBlock(c);
  if (!block) return "unloaded";
  const id = block.typeId;
  if (PROTECTED.has(id)) return "kept";
  const soft = passable(dim, c);
  if (!soft && !GRAVITY.test(id)) return "kept";
  if (!soft) {
    const r = mineCell(rt, c, inv, k);
    if (r.res === "left" || r.res === "wait") return "kept";
  }
  dim.setBlockType(c, "minecraft:cobblestone");
  return "patched";
}

/** @param {Runtime} rt @param {string} id @param {V3} c @param {string} need */
function logSkip(rt, id, c, need) {
  const st = rt.st;
  st.skipTotal = (st.skipTotal ?? 0) + 1;
  const first = !st.skipCount[id];
  st.skipCount[id] = (st.skipCount[id] ?? 0) + 1;
  if (st.skipped.length < SKIP_LOG_MAX) st.skipped.push({ t: id, x: c.x, y: c.y, z: c.z });
  console.log(`[Crew-Event] ${JSON.stringify({ type: "skipped_block", worker: meta(rt.e).name, block: id, at: fmt(c), needs: need })}`);
  if (first) emit(rt.e, "skipped", { block: id, at: fmt(c), needs: need }, `left ${blockName(id)} at ${fmt(c)}: it needs a ${need}. I'll leave any more like it and log where.`);
}

/** @param {Runtime} rt @param {"pickaxe"|"tool"} what */
function needTool(rt, what) {
  const st = rt.st;
  if (!st.needTool) {
    st.needTool = what;
    emit(rt.e, "tool_needed", { needs: what }, `I need ${what === "pickaxe" ? "a pickaxe" : "a tool"} to keep going. Taking what I have to ${rt.job.deposit.label} and waiting there. Crouch and use me to add one.`);
  }
  st.phase = "to_deposit";
}

/** @param {Runtime} rt @param {string} kind @param {V3} at */
function noteFind(rt, kind, at) {
  const finds = /** @type {{kind:string,x:number,y:number,z:number}[]} */ (rt.st.finds);
  if (finds.some((f) => f.kind === kind && dist(f, at) < 24)) return;
  if (finds.length < 50) finds.push({ kind, x: at.x, y: at.y, z: at.z });
  emit(rt.e, "found", { kind, at: fmt(at) }, `found §e${kind}§r at ${fmt(at)}.`);
}

/** @param {Runtime} rt */
function progress(rt) {
  const { st, job, e } = rt;
  const total = job.geom.total;
  const pct = Math.floor((100 * st.i) / total);
  if (pct >= (st.pct ?? 0) + 10) {
    st.pct = pct - (pct % 10);
    emit(e, "progress", { percent: st.pct, step: st.i, total }, `${st.pct}% done.`);
  }
}

/** @param {Entity} e @param {any} job @param {Container} inv @returns {"ok"|"full"|"missing"} */
function deposit(e, job, inv) {
  const d = world.getDimension(job.deposit.dim);
  const block = d.getBlock(job.deposit);
  if (!block) return "missing";
  const chest = block.getComponent("minecraft:inventory")?.container;
  if (!chest) return "missing";
  let moved = 0;
  for (let i = 0; i < inv.size; i++) {
    const item = inv.getItem(i);
    if (!item || (i < KIT_SLOTS && toolInfo(item))) continue; // the tool kit stays with the worker
    const left = chest.addItem(item);
    inv.setItem(i, left);
    moved += item.amount - (left?.amount ?? 0);
    if (left) return "full";
  }
  if (moved > 0) emit(e, "deposited", { items: moved, deposit: job.deposit.label }, `dropped off ${moved} items at ${job.deposit.label}.`);
  return "ok";
}

/** @param {Runtime} rt */
function afterDeposit(rt) {
  const st = rt.st;
  if (st.needTool) {
    st.phase = "wait_tool";
    st.retry = 1;
    return;
  }
  if (st.final) return finish(rt);
  st.phase = st.i === 0 ? "travel_in" : "return";
}

/** @param {Runtime} rt */
function finish(rt) {
  const { e, job, st } = rt;
  const what = job.type === "quarry" ? `the quarry at ${fmt(job.geom.anchor)}` : `the branch mine at ${fmt(job.geom.anchor)}`;
  const skipped = st.skipTotal ? ` Left ${st.skipTotal} block${st.skipTotal === 1 ? "" : "s"} my tools couldn't harvest; their spots are logged.` : "";
  if (st.skipTotal) setJSON(e, "crew:skipped", { job: job.id, total: st.skipTotal, counts: st.skipCount, blocks: st.skipped });
  emit(e, "job_done", { mode: job.type, steps: job.geom.total, finds: st.finds.length, skipped: st.skipTotal ?? 0 },
    `finished ${what}. ${st.finds.length} finds reported.${skipped}`);
  stopJob(e, undefined);
}

// ---------- walking ----------
/**
 * Moves toward `goal` along an A* path, one block per beat. Searches a little each tick.
 * Falls back to a reported shortcut (teleport) if no route exists.
 * @param {Runtime} rt @param {V3} goal @param {number} reach
 * @returns {"moving" | "arrived"}
 */
function walkTo(rt, goal, reach) {
  const e = rt.e;
  const dim = e.dimension;
  if (!rt.walk || !sameV(rt.walk.goal, goal) || rt.walk.reach !== reach) rt.walk = { goal: { x: goal.x, y: goal.y, z: goal.z }, reach, idx: 0, replans: 0 };
  const w = rt.walk;
  if (w.glide) {
    w.glide.t++;
    const to = w.glide.to;
    e.teleport(lerp(w.glide.from, to, w.glide.t / w.glide.n), { facingLocation: { x: to.x + (to.x - w.glide.from.x), y: to.y + 0.5, z: to.z + (to.z - w.glide.from.z) } });
    if (w.glide.t >= w.glide.n) w.glide = undefined;
    return "moving";
  }
  if (!w.path) {
    if (dist(floorV(e.location), goal) <= reach) {
      rt.walk = undefined;
      return "arrived";
    }
    w.search ??= newSearch(dim, e.location, goal, reach);
    const r = advance(w.search, SEARCH_BUDGET);
    if (r === "searching") return "moving";
    if (r === "failed") return blink(rt, goal);
    w.path = w.search.path;
    w.search = undefined;
    w.idx = 0;
  }
  const path = /** @type {V3[]} */ (w.path);
  if (w.idx >= path.length) {
    rt.walk = undefined;
    return "arrived";
  }
  const next = path[w.idx];
  if (!passable(dim, next)) {
    // something changed (a block was placed); plan again
    w.path = undefined;
    if (++w.replans > 3) return blink(rt, goal);
    return "moving";
  }
  const cur = floorV(e.location);
  const dy = next.y - cur.y;
  w.glide = { from: e.location, to: center(next), t: 0, n: dy > 0 ? 6 : dy < 0 ? 3 + -dy : 4 };
  w.idx++;
  return "moving";
}

/** @param {Runtime} rt @param {V3} target @returns {"arrived"} */
function blink(rt, target) {
  const e = rt.e;
  const dim = e.dimension;
  let spot = { ...target };
  for (let k = 0; k < 12 && !passable(dim, spot); k++) spot = { x: spot.x, y: spot.y + 1, z: spot.z };
  e.teleport(center(spot));
  rt.walk = undefined;
  rt.st.blinks = (rt.st.blinks ?? 0) + 1;
  if (rt.st.blinks === 1) emit(e, "stuck", { at: fmt(e.location) }, "couldn't find a walkable route, so I took a shortcut.");
  return "arrived";
}

export const isWorking = (/** @type {Entity} */ e) => active.has(e.id) || !!e.getDynamicProperty("crew:job");
export { meta };

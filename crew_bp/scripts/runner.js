// The job engine. Every tick it advances each working worker by one small, predictable step.
// Digging follows the step list from plans.js; trips to the deposit and back use the A*
// pathfinder in path.js. Tools come from the worker's kit (tools.js).
import { world, system, BlockPermutation } from "@minecraft/server";
import { AIR, FILL, GRAVITY, ORE, SIGNS, TORCH, VALUABLE, bestKind, blockName, canSee, keepIntact, needsOpening, passable, setOpen } from "./blocks.js";
import { off, column, inBranchPlan, isStairBlock, startCell, stepAt } from "./plans.js";
import { advance, atGoal, near, newSearch } from "./path.js";
import { KIT_SLOTS, addToKit, chooseTool, freeHaulSlots, kit, kitText, roleKinds, stash, ticksFor, toolInfo, toolPref, wear } from "./tools.js";
import { center, dist, floorV, fmt, getJSON, lerp, setJSON, onlinePlayer, sameV, up } from "./util.js";
import { emit, holdTool, loadedWorkers, meta, migrateRole, roleOf, syncRole, updateTag } from "./workers.js";
import { isProtected, noteChestUse, saveSeen } from "./settlement.js";
import { DRAIN_PER_BLOCK, EXHAUSTED, REST, TIRED, TIRED_SLOWDOWN, bedPose, bedSafety, bedside, eatOne, energy, energyWord, getHome, isNight, isSupply, restock, setEnergy } from "./life.js";
import { CARGO_END, HAUL_SLOTS, SLOT_WORDS, haulStatus, haulerIdle, haulerIdleStatus, isHaulJob, keepsItem, newDay, showLoad, stepHaul } from "./hauler.js";

/**
 * @typedef {import("@minecraft/server").Entity} Entity
 * @typedef {import("@minecraft/server").Container} Container
 * @typedef {{x:number,y:number,z:number}} V3
 * @typedef {{goal: V3, reach: number, search?: any, path?: V3[], idx: number, glide?: {from: V3, to: V3, mid?: V3, t: number, n: number}, replans: number}} Walk
 * @typedef {{e: Entity, job: any, st: any, walk?: Walk, saveIn: number, area?: V3, areaIn: number, comeGoal?: V3}} Runtime
 */

/** @type {Map<string, Runtime>} */
const active = new Map();
const SEARCH_BUDGET = 150; // A* expansions per worker per tick
const MOVE_TICKS = { normal: 7, fast: 3 }; // ticks to step one block (normal: about a villager's walk, under 3 blocks a second)
/**
 * Mock tests only: dig and step 5x faster so the test suite runs quickly. Players can't turn it
 * on (it isn't an order option); the mock world sets `globalThis.crewTestFast`.
 */
const testFast = () => /** @type {any} */ (globalThis).crewTestFast === true;
const SKIP_LOG_MAX = 100;
const REACH_DOWN = 4; // a worker can dig up to this many blocks above where it stands
const VEIN_MAX = 32; // ore blocks taken out of the walls per tunnel step
const SPARE_MAX = 64; // voided stone/dirt remembered for filling ore holes
const DIR4 = [{ x: 1, z: 0 }, { x: -1, z: 0 }, { x: 0, z: 1 }, { x: 0, z: -1 }];
const DIR6 = [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0], [0, -1, 0]];

// ---------- where a worker can stand ----------
/** Two blocks of air (feet and head). @param {import("@minecraft/server").Dimension} dim @param {V3} c */
const roomAt = (dim, c) => passable(dim, c) && passable(dim, up(c));
/** Drops a spot down onto the floor below it (never stands on air). @param {import("@minecraft/server").Dimension} dim @param {V3} c */
function settle(dim, c) {
  const p = { ...c };
  for (let k = 0; k < 8 && passable(dim, p) && passable(dim, { x: p.x, y: p.y - 1, z: p.z }); k++) p.y--;
  return p;
}
/**
 * Where to stand for a step: the planned spot if it has a floor and headroom, else the nearest
 * alternative that does. In a tunnel the alternatives are the step's other floor cells (the
 * second lane of the trunk); in a quarry, the cells beside it. undefined = no good spot.
 * @param {Runtime} rt @param {V3} want @param {any} s the step
 */
function pickStand(rt, want, s) {
  const dim = rt.e.dimension;
  const cur = floorV(rt.e.location);
  /** @param {V3} c */
  const ok = (c) => {
    const p = settle(dim, c);
    return want.y - p.y <= REACH_DOWN && roomAt(dim, p) ? p : undefined;
  };
  const first = ok(want);
  if (first) return first;
  /** @type {V3[]} */
  const alts = s.sides
    ? s.mine.filter((/** @type {V3} */ c) => c.y === want.y && !sameV(c, want))
    : DIR4.map((d) => ({ x: want.x + d.x, y: want.y, z: want.z + d.z }));
  const ns = alts.sort((a, b) => dist(a, cur) - dist(b, cur));
  for (const n of ns) {
    const s = ok(n);
    if (s) return s;
  }
  return undefined;
}
/** Can it slide straight there (one block over, any drop, or one up) without passing through blocks? @param {import("@minecraft/server").Dimension} dim @param {V3} cur @param {V3} to */
function canGlide(dim, cur, to) {
  const flat = Math.abs(to.x - cur.x) + Math.abs(to.z - cur.z);
  const dy = to.y - cur.y;
  if (flat > 1 || dy > 1) return false;
  if (dy === 1) return passable(dim, { x: cur.x, y: cur.y + 2, z: cur.z }); // rise first, then step over
  if (dy < 0 && flat === 1) return roomAt(dim, { x: to.x, y: cur.y, z: to.z }); // step over, then drop
  return true;
}
/** Path for a glide: straight when level; over-then-down or up-then-over when not, never diagonally through air. @param {V3} from @param {V3} to */
function glideMid(from, to) {
  if (Math.abs(to.y - from.y) < 0.01) return undefined;
  return to.y < from.y ? { x: to.x, y: from.y, z: to.z } : { x: from.x, y: to.y, z: from.z };
}
/**
 * Eases a step in and out, so the worker slows down before it stops instead of halting at full
 * speed (the game overshoots a sudden stop and snaps back, which looked like bumping the block).
 * @param {number} t 0..1
 */
const ease = (t) => t * t * (3 - 2 * t);
/** Eases only the end of a step (the last step of a walk). @param {number} t 0..1 */
const easeOut = (t) => 1 - (1 - t) * (1 - t);
/** @param {{from: V3, to: V3, mid?: V3}} m @param {number} t 0..1 */
function glideAt(m, t) {
  if (!m.mid) return lerp(m.from, m.to, t);
  return t < 0.5 ? lerp(m.from, m.mid, t * 2) : lerp(m.mid, m.to, (t - 0.5) * 2);
}

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
      `starting a ${g.L}x${g.W} quarry, ${g.D} deep from ${fmt(g.anchor)} heading ${g.facing}${g.up ? `, clearing the ${g.up} layer${g.up === 1 ? "" : "s"} above it first` : ""}. Depositing at ${job.deposit.label}.`);
  } else if (job.type === "branch_mine") {
    const g = job.geom;
    emit(e, "job_started", { mode: "branch_mine", start: fmt(g.anchor), facing: g.facing, target_y: g.ty, trunk: g.L, trunk_width: g.w ?? 2, branch: g.B, spacing: g.s, deposit: job.deposit.label },
      `starting a branch mine at ${fmt(g.anchor)} heading ${g.facing}: ${g.n > 0 ? `stairs down to Y ${g.ty}, ` : ""}a ${g.L}-block trunk ${g.w ?? 2} wide, then ${g.branchAt.length * 2} branches ${g.B} long with ${g.s} blocks between. Depositing at ${job.deposit.label}.`);
  }
}

const isDig = (/** @type {any} */ job) => job?.type === "quarry" || job?.type === "branch_mine";
const digName = (/** @type {any} */ job) => (job.type === "quarry" ? "quarry" : job.type === "round" ? (/** @type {Record<string, string>} */ (SLOT_WORDS)[job.slot] ?? "round") : "branch mine");
/** How far along a job is (0..1): dig steps, or chests on a round. @param {any} job @param {any} st */
const doneShare = (job, st) => (job.type === "round" ? (job.route?.length ? Math.min(1, (st.idx ?? 0) / job.route.length) : 0) : st.i / job.geom.total);

/**
 * Stops whatever the worker is doing. An unfinished quarry or branch mine is kept as the paused
 * job (`crew:paused`), with its progress, so Continue picks it up where it left off.
 * A Hauler's unfinished round is kept the same way (`done`: it finished, nothing to keep).
 * @param {Entity} e @param {string | undefined} why  undefined = silent @param {boolean} [done]
 */
export function stopJob(e, why, done = false) {
  const job = getJSON(e, "crew:job", undefined);
  if (job?.tickingArea) {
    try {
      e.dimension.runCommand(`tickingarea remove crew_${job.id}`);
    } catch {
      /* already gone */
    }
  }
  if (isDig(job)) {
    const st = active.get(e.id)?.st ?? getJSON(e, "crew:state", undefined);
    if (st && st.i < job.geom.total) setJSON(e, "crew:paused", { job: { ...job, tickingArea: false }, st });
  }
  if (job?.type === "round" && !done) {
    const st = active.get(e.id)?.st ?? getJSON(e, "crew:state", undefined);
    if (st) setJSON(e, "crew:paused", { job: { ...job, tickingArea: false }, st });
  }
  if (job && why) emit(e, "stopped", { reason: why }, isDig(job) || (job.type === "round" && !done) ? `${why} Pick Continue in my menu to pick the ${digName(job)} up where I left off.` : why);
  if (job?.type === "rest") {
    // an order while it's lying in bed: get up beside the bed first
    const rst = active.get(e.id)?.st ?? getJSON(e, "crew:state", undefined);
    const home = getHome(e);
    if (rst?.inBed && home && home.dim === e.dimension.id) {
      const b = bedside(e.dimension, home);
      try {
        e.teleport({ x: b.x + 0.5, y: b.y, z: b.z + 0.5 });
      } catch {
        /* entity gone */
      }
    }
  }
  active.delete(e.id);
  setJSON(e, "crew:job", undefined);
  setJSON(e, "crew:state", undefined);
  try {
    e.setProperty("crew:anim", 0);
    if (job?.type === "rest") updateTag(e); // clears the Zzz
    if (job) e.triggerEvent("crew:stop_work");
  } catch {
    /* entity gone */
  }
}

/** The paused dig job, if any: what it is and how far along. @param {Entity} e */
export function pausedJob(e) {
  const saved = getJSON(e, "crew:paused", undefined);
  if (!saved?.job || !saved?.st) return undefined;
  return { name: digName(saved.job), pct: Math.floor(100 * doneShare(saved.job, saved.st)) };
}

/**
 * Picks the paused dig job back up from where it stopped (walks back to its last spot first).
 * Returns the job, or undefined if there's nothing to continue.
 * @param {Entity} e
 */
export function resumeJob(e) {
  const saved = getJSON(e, "crew:paused", undefined);
  if (!saved?.job || !saved?.st) return undefined;
  stopJob(e, undefined); // ends a drop-off or come-here in progress
  setJSON(e, "crew:paused", undefined);
  const job = { ...saved.job, tickingArea: false };
  const st = { ...saved.st, cool: 0, move: undefined, walkAfter: false, needTool: undefined, wait: undefined, blinks: 0, pause: 0, lastPos: undefined };
  st.phase = job.type === "round" ? "area" : st.i === 0 && !st.stand ? "travel_in" : "return";
  setJSON(e, "crew:job", job);
  setJSON(e, "crew:state", st);
  e.triggerEvent("crew:start_work");
  active.set(e.id, { e, job, st, saveIn: 20, areaIn: 0 });
  const pct = Math.floor(100 * doneShare(job, st));
  if (job.type === "round") emit(e, "job_resumed", { mode: "round", chest: st.idx ?? 0, chests: job.route?.length ?? 0 }, `picking the ${digName(job)} back up (${Math.min(job.route?.length ?? 0, (st.idx ?? 0) + 1)} of ${job.route?.length ?? 0} chests).`);
  else emit(e, "job_resumed", { mode: job.type, step: st.i, total: job.geom.total }, `picking the ${digName(job)} back up at ${pct}% (step ${st.i} of ${job.geom.total}).`);
  return job;
}

/** One-paragraph status for the menu and /crew:status. @param {Entity} e */
export function statusText(e) {
  const job = getJSON(e, "crew:job", undefined);
  const st = active.get(e.id)?.st ?? getJSON(e, "crew:state", {});
  const inv = /** @type {Container} */ (e.getComponent("minecraft:inventory")?.container);
  const isHauler = roleOf(e) === "Hauler";
  let hauling = inv ? inv.size - KIT_SLOTS - freeHaulSlots(inv) : 0;
  if (inv && isHauler) {
    hauling = 0;
    for (let i = KIT_SLOTS; i < Math.min(CARGO_END, inv.size); i++) if (inv.getItem(i)) hauling++;
  }
  const tools = inv ? kitText(kit(inv)) : "no tools";
  const where = fmt(e.location);
  const last = getJSON(e, "crew:skipped", undefined);
  let line;
  const paused = pausedJob(e);
  if (job && isHaulJob(job)) {
    line = `${haulStatus(e, job, st)}, at ${where}.`;
  } else if (!job) {
    line = isHauler ? `${haulerIdleStatus(e)}, at ${where}.` : `Idle at ${where}.`;
    if (paused) line += ` Its ${paused.name} is paused at ${paused.pct}%: pick Continue to pick it up.`;
    if (last?.blocks?.length) line += ` Last job left ${last.total} block${last.total === 1 ? "" : "s"} its tools couldn't harvest.`;
  } else if (job.type === "come") {
    line = `Walking to ${job.target?.name ?? job.label}.`;
  } else if (job.type === "drop_off") {
    line = `Taking what it carries to ${job.deposit.label}.`;
  } else if (job.type === "rest") {
    const where = st.quality ? REST[/** @type {"safe"|"unsafe"|"rough"} */ (st.quality)].label : "";
    line = st.phase === "asleep" ? `Asleep on ${where}.` : st.phase === "to_bed" ? "Walking home to sleep." : "Getting ready to sleep.";
    line += job.reason === "night" ? " Gets up at dawn (or pick Wake up)." : " Gets up once rested (or pick Wake up).";
    if (paused) line += ` Its ${paused.name} (${paused.pct}%) is paused until it wakes.`;
  } else {
    const total = job.geom.total;
    const pct = Math.floor((100 * Math.min(st.i ?? 0, total)) / total);
    const what = job.type === "quarry" ? "Quarry" : "Branch mine";
    const doing = { travel_in: "heading to the site", working: "digging", to_deposit: "taking a load to the deposit", wait_deposit: "waiting for deposit space", wait_tool: `waiting at the deposit for ${st.needTool === "pickaxe" ? "a pickaxe" : "a tool"} (put one in that chest or its home chest, or tap it holding one)`, fetch_tool: "fetching a tool from its home chest", return: "heading back to the dig" }[/** @type {string} */ (st.phase)] ?? st.phase;
    line = `${what} ${pct}% (step ${st.i ?? 0} of ${total}), ${doing}${st.wait ? ` (${st.wait})` : ""}, at ${where}.`;
    if (st.skipTotal) line += ` Left ${st.skipTotal} block${st.skipTotal === 1 ? "" : "s"} it couldn't harvest (${Object.entries(st.skipCount).map(([t, n]) => `${n} ${blockName(t)}`).join(", ")}).`;
  }
  const torches = inv ? countItem(inv, TORCH) : 0;
  const en = energy(e);
  const home = getHome(e);
  const homeLine = home ? `Home: the bed at ${fmt(home.head)}${home.chest ? `, chest at ${fmt(home.chest)}` : ", no home chest"}.` : "No home yet (stand by a bed and pick Home, Set home).";
  return `${line}\nEnergy ${Math.round(en)}% (${energyWord(en)}). ${homeLine}\nCarrying ${hauling}/${isHauler ? HAUL_SLOTS : inv ? inv.size - KIT_SLOTS : 31} stacks.${isHauler ? "" : ` Tools: ${tools}${toolPref(e) === "fastest" ? " (uses the fastest)" : ""}.`}${torches ? ` Torches: ${torches}.` : ""}`;
}

/** @param {Container} inv @param {string} id */
export function countItem(inv, id) {
  let n = 0;
  for (let i = 0; i < inv.size; i++) {
    const it = inv.getItem(i);
    if (it?.typeId === id) n += it.amount;
  }
  return n;
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
        // a Hauler's round takes its own work area (and waits for one); tidying the depot needs none
        if (rt.job.type !== "round" && rt.job.type !== "tidy") keepLoaded(rt);
        if (rt.job.type === "come") stepCome(rt);
        else if (rt.job.type === "drop_off") stepDropOff(rt);
        else if (rt.job.type === "rest") stepRest(rt);
        else if (isHaulJob(rt.job)) stepHaul(rt, haulCtx);
        else stepDig(rt);
        // twice a second: never inside a block (not while lying on its bed, which is meant to overlap)
        if (rt.job.type !== "rest" && active.get(rt.e.id) === rt && (rt.unstickIn = (rt.unstickIn ?? 10) - 1) <= 0) {
          rt.unstickIn = 10;
          unstick(rt);
        }
        // save progress now and then (only if this job is still the worker's job: a step may have started another)
        if (--rt.saveIn <= 0 && active.get(rt.e.id) === rt) {
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
  system.runInterval(routine, 20);
}

// ---------- the daily routine ----------
/** Seconds a worker woken (or given an order) at night stays up once it has nothing to do. */
const STAY_UP_IDLE = 60;
/**
 * Once a second: at night, a worker that is digging or idle goes home to sleep (no home: it lies
 * down where it is); the dig is paused and picked back up at dawn. Jobs a player gave directly (come here, drop off) are
 * left to finish first. Idle workers slowly get their energy back.
 * A worker a player woke up or gave an order at night (`crew:stayUp`) stays up while it has a job,
 * and goes back to bed after STAY_UP_IDLE seconds with nothing to do.
 */
/** Routine calls (one a second) between notes on what workers are doing, for the settlement roster. */
const SEEN_EVERY = 5;
let seenIn = 0;
function routine() {
  const night = isNight();
  if (--seenIn <= 0) {
    seenIn = SEEN_EVERY;
    noteSeen();
  }
  for (const e of loadedWorkers()) {
    try {
      const job = active.get(e.id)?.job ?? getJSON(e, "crew:job", undefined);
      if (!night && e.getDynamicProperty("crew:stayUp")) e.setDynamicProperty("crew:stayUp", undefined);
      const hauler = roleOf(e) === "Hauler";
      if (hauler && night) newDay(e);
      if (hauler) showLoad(e);
      if (job?.type === "rest") continue;
      if (!job) setEnergy(e, energy(e) + 0.1);
      if (!night) {
        // an idle Hauler starts its rounds, extra trips and tidying by itself
        if (hauler && !job) haulerIdle(e, haulCtx);
        continue;
      }
      const up = e.getDynamicProperty("crew:stayUp");
      if (typeof up === "number") {
        if (job) {
          e.setDynamicProperty("crew:stayUp", 1); // busy: the idle count starts over
          continue;
        }
        if (up < STAY_UP_IDLE) {
          e.setDynamicProperty("crew:stayUp", up + 1);
          continue;
        }
        e.setDynamicProperty("crew:stayUp", undefined);
      }
      if (isDig(job) || !job) startRest(e, "night");
    } catch (err) {
      console.warn(`[Crew] routine: ${err}`);
    }
  }
}

/**
 * At night: keep this worker up (a player woke it or gave it an order). The routine leaves it be
 * while it has a job and sends it back to bed once it has been idle for a minute.
 * @param {Entity} e
 */
export function keepUp(e) {
  if (isNight()) e.setDynamicProperty("crew:stayUp", 1);
}

/** Is it in bed (or on its way there)? @param {Entity} e */
export function isResting(e) {
  return (active.get(e.id)?.job ?? getJSON(e, "crew:job", undefined))?.type === "rest";
}

/**
 * Wakes a resting worker (from its menu). It gets up beside its bed and, if a dig was paused for
 * the night, goes back to it, keeping the rest it got so far. At night it then stays up a while.
 * @param {Entity} e
 */
export function wakeUp(e) {
  const rt = active.get(e.id);
  if (!rt || rt.job.type !== "rest") return false;
  keepUp(e);
  rt.st.byHand = true;
  rt.st.phase = "wake";
  return true;
}

/**
 * Sends a worker to bed. A dig in progress is paused and marked to pick back up when it wakes.
 * @param {Entity} e @param {"night" | "tired"} reason
 */
export function startRest(e, reason) {
  const job = active.get(e.id)?.job ?? getJSON(e, "crew:job", undefined);
  const resume = isDig(job);
  const home = getHome(e);
  startJob(e, { type: "rest", id: `rest${Date.now().toString(36)}`, by: { name: "routine", console: true }, reason });
  if (resume) e.setDynamicProperty("crew:autoResume", true);
  const what = resume ? ` I'll pick the ${digName(job)} back up ${reason === "night" ? "in the morning" : "after a rest"}.` : "";
  const where = home ? "heading home to sleep" : "sleeping right here (I have no home: set one by a bed for a proper rest)";
  emit(e, "rest", { reason, home: !!home }, reason === "night" ? `It's getting dark, so I'm ${where}.${what}` : `I'm worn out, so I'm ${where}.${what}`);
}

/**
 * The rest job: walk home, unload into the home chest, sleep until morning (or until rested after
 * a daytime nap), then restock from the home chest and pick the paused dig back up.
 * @param {Runtime} rt
 */
function stepRest(rt) {
  const { e, job, st } = rt;
  const dim = e.dimension;
  const home = getHome(e);
  const inv = /** @type {Container} */ (e.getComponent("minecraft:inventory")?.container);
  if (st.phase === "travel_in" || st.phase === "walking") st.phase = home ? "to_bed" : "lie_down";
  switch (st.phase) {
    case "to_bed": {
      if (!home || home.dim !== dim.id) {
        st.phase = "lie_down";
        return;
      }
      e.setProperty("crew:anim", rt.walk?.path ? 1 : 0);
      if (walkTo(rt, bedside(dim, home), 1.5) !== "arrived") return;
      if (home.chest && inv && roleOf(e) !== "Hauler") {
        const r = deposit(e, { deposit: { ...home.chest, dim: home.dim, label: `my home chest at ${fmt(home.chest)}` } }, inv);
        if (r === "full") emit(e, "deposit_full", { deposit: "home chest" }, "my home chest is full, so I kept the rest.");
      }
      st.phase = "lie_down";
      return;
    }
    case "lie_down": {
      /** @type {"safe"|"unsafe"|"rough"} */
      let quality = "rough";
      if (home && home.dim === dim.id) {
        const s = bedSafety(dim, home);
        quality = s.safe ? "safe" : "unsafe";
        if (!s.safe && !st.toldWhy) {
          st.toldWhy = true;
          emit(e, "unsafe_bed", { why: s.why }, `I won't sleep well tonight: ${s.why}.`);
        }
        const pose = bedPose(home);
        e.teleport(pose.at, { facingLocation: pose.face });
        st.inBed = true;
      }
      st.quality = quality;
      st.sleptNight = isNight();
      st.phase = "asleep";
      e.setProperty("crew:anim", 3);
      holdTool(e, undefined);
      e.nameTag = `${e.nameTag.split("\n§8Zzz")[0]}\n§8Zzz`;
      return;
    }
    case "asleep": {
      const q = REST[/** @type {"safe"|"unsafe"|"rough"} */ (st.quality ?? "rough")];
      if (energy(e) < q.cap) setEnergy(e, Math.min(q.cap, energy(e) + q.rate));
      const night = isNight();
      if (night) st.sleptNight = true;
      // wake at dawn after a night's sleep (fully rested for that bed), or once rested after a daytime nap
      if (!night && (st.sleptNight || energy(e) >= q.cap * 0.95)) {
        if (st.sleptNight) setEnergy(e, Math.max(energy(e), q.cap));
        st.phase = "wake";
      }
      return;
    }
    case "wake": {
      e.setProperty("crew:anim", 0);
      let took = "";
      // out of bed (only if it got that far: woken on the way home, it just stops where it is)
      if (home && home.dim === dim.id && (st.inBed || !st.byHand)) {
        const b = bedside(dim, home);
        e.teleport({ x: b.x + 0.5, y: b.y, z: b.z + 0.5 });
        if (inv) took = restock(dim, home, inv, roleOf(e));
      }
      updateTag(e);
      const auto = !!e.getDynamicProperty("crew:autoResume");
      e.setDynamicProperty("crew:autoResume", undefined);
      const paused = pausedJob(e);
      const morning = st.byHand ? `I'm up (energy ${Math.round(energy(e))}%).` : job.reason === "night" ? "Morning!" : "Rested.";
      if (st.byHand && !(auto && paused)) {
        emit(e, "woke", { energy: Math.round(energy(e)), took, by_hand: true }, `${morning}${took ? ` Took ${took} from home.` : ""}`);
        stopJob(e, undefined);
        return;
      }
      const stock = took ? ` Took ${took} from home.` : "";
      if (auto && paused) {
        emit(e, "woke", { energy: Math.round(energy(e)), took }, `${morning}${stock} Back to the ${paused.name}.`);
        resumeJob(e);
      } else {
        if (took || job.reason !== "night") emit(e, "woke", { energy: Math.round(energy(e)), took }, `${morning}${stock}`);
        stopJob(e, undefined);
      }
      return;
    }
    default:
      st.phase = home ? "to_bed" : "lie_down";
  }
}

/**
 * Every 5 seconds: what each loaded worker is doing, for the settlement roster (which also shows
 * workers that aren't loaded, from their last note).
 */
function noteSeen() {
  /** @type {Record<string, import("./settlement.js").Seen>} */
  const now = {};
  for (const e of loadedWorkers()) {
    try {
      const job = active.get(e.id)?.job ?? getJSON(e, "crew:job", undefined);
      const st = active.get(e.id)?.st ?? getJSON(e, "crew:state", {});
      const inv = e.getComponent("minecraft:inventory")?.container;
      const k = inv ? kit(inv) : [];
      const l = floorV(e.location);
      const home = getHome(e);
      const drop = getJSON(e, "crew:lastDeposit", undefined);
      now[e.id] = {
        home: home?.chest ? { dim: home.dim, ...home.chest } : undefined,
        drop: drop?.dim ? { dim: drop.dim, x: drop.x, y: drop.y, z: drop.z, label: drop.label } : undefined,
        role: roleOf(e), status: shortStatus(e, job, st), busy: !!job && job.type !== "rest",
        noTools: !k.length || !!st?.needTool, low: k.some((t) => t.left / t.max <= 0.1), ticking: !!job?.tickingArea,
        dim: e.dimension.id, x: l.x, y: l.y, z: l.z, ts: Date.now(),
      };
    } catch {
      /* entity gone */
    }
  }
  saveSeen(now);
}

/** A few words for the roster: "Quarry 40%", "Asleep at home", "Idle". @param {Entity} e @param {any} job @param {any} st */
function shortStatus(e, job, st) {
  if (!job) {
    const paused = pausedJob(e);
    if (roleOf(e) === "Hauler" && !paused) return haulerIdleStatus(e);
    return paused ? `Idle (${paused.name} paused at ${paused.pct}%)` : "Idle";
  }
  if (isHaulJob(job)) return haulStatus(e, job, st);
  if (job.type === "rest") return st?.phase === "asleep" ? (getHome(e) ? "Asleep at home" : "Asleep") : "Going to bed";
  if (job.type === "come") return `Walking to ${job.target?.name ?? job.label}`;
  if (job.type === "drop_off") return `Dropping off at ${job.deposit.label}`;
  const total = job.geom?.total ?? 1;
  const pct = Math.floor((100 * Math.min(st?.i ?? 0, total)) / total);
  return `${job.type === "quarry" ? "Quarry" : "Branch mine"} ${pct}%${st?.needTool ? ", waiting for a tool" : ""}`;
}

/** Resumes saved jobs on workers that just loaded (after a restart or when a player comes back). */
function adopt() {
  for (const e of loadedWorkers()) {
    migrateRole(e); // workers made before the Digger/Miner split become Diggers (once)
    syncRole(e); // workers made before skins existed pick theirs up here
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
  const at = rt.job.at;
  if (at) {
    // a fixed spot (a settlement's bell, home): walk there and wait
    if (at.dim && at.dim !== rt.e.dimension.id) {
      stopJob(rt.e, `${rt.job.label} is in another dimension, so I stopped.`);
      return;
    }
    rt.e.setProperty("crew:anim", rt.walk?.path ? 1 : 0);
    if (walkTo(rt, at, 2.5, !!rt.job.beside) === "arrived") {
      emit(rt.e, "arrived", { to: rt.job.label }, `at ${rt.job.label}.`);
      stopJob(rt.e, undefined);
    }
    return;
  }
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

// ---------- drop off ----------
/** Carry everything (not the kit or torches) to the deposit, then go idle. @param {Runtime} rt */
function stepDropOff(rt) {
  const { e, job } = rt;
  e.setProperty("crew:anim", rt.walk?.path ? 1 : 0);
  if (walkTo(rt, job.deposit, 2.6, true) !== "arrived") return;
  const inv = /** @type {Container} */ (e.getComponent("minecraft:inventory")?.container);
  const r = deposit(e, job, inv);
  if (r === "full") emit(e, "deposit_full", { deposit: job.deposit.label }, `${job.deposit.label} is full, so I kept the rest.`);
  else if (r === "missing") emit(e, "deposit_missing", { deposit: job.deposit.label }, `can't find a chest or barrel at ${job.deposit.label}.`);
  else {
    const paused = pausedJob(e);
    emit(e, "job_done", { mode: "drop_off" }, `all unloaded at ${job.deposit.label}.${paused ? ` Pick Continue in my menu to go back to the ${paused.name} (${paused.pct}% done).` : ""}`);
  }
  stopJob(e, undefined);
}

// ---------- digging jobs ----------
/** @param {Runtime} rt */
function stepDig(rt) {
  const { e, job, st } = rt;
  const inv = /** @type {Container} */ (e.getComponent("minecraft:inventory")?.container);
  if (!inv) throw new Error("worker has no inventory");
  switch (st.phase) {
    case "travel_in": {
      e.setProperty("crew:anim", rt.walk?.path ? 1 : 0);
      // clearing above first: the corner may be buried under the hill, so head for the ground on top of it
      if (job.geom.pre && st.i < job.geom.pre && !st.entry) {
        const a = job.geom.anchor;
        st.entry = groundNear(e.dimension, { x: a.x, y: a.y + job.geom.up + 1, z: a.z }, floorV(e.location), job.geom.up + 3) ?? startCell(job);
      }
      const goal = job.geom.pre && st.i < job.geom.pre ? st.entry : startCell(job);
      if (walkTo(rt, goal, 1.8) === "arrived") {
        st.phase = "working";
        st.cool = 0;
        st.move = undefined;
      }
      return;
    }
    case "to_deposit": {
      e.setProperty("crew:anim", rt.walk?.path ? 1 : 0);
      if (walkTo(rt, job.deposit, 2.6, true) !== "arrived") return;
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
      // a player handed it one, or someone put one in the chest it's waiting at: take it and go
      const took = hasNeededTool(rt, inv) ? "" : takeTools(rt, job.deposit, inv);
      if (hasNeededTool(rt, inv)) return backToWork(rt, inv, took, job.deposit.label);
      // none here: its home chest may have one (it checks every 5 seconds or so)
      const home = getHome(e);
      if (home?.chest && home.dim === e.dimension.id && !sameV(home.chest, job.deposit) && chestHasTool(rt, home.chest)) {
        st.phase = "fetch_tool";
        return;
      }
      st.retry = 100;
      return;
    }
    case "fetch_tool": {
      // walk to the home chest for the tool it saw there, then back to work
      const home = getHome(e);
      if (!home?.chest) {
        st.phase = "wait_tool";
        st.retry = 1;
        return;
      }
      e.setProperty("crew:anim", rt.walk?.path ? 1 : 0);
      if (walkTo(rt, home.chest, 2.6, true) !== "arrived") return;
      const took = takeTools(rt, home.chest, inv);
      if (hasNeededTool(rt, inv)) return backToWork(rt, inv, took, `my home chest at ${fmt(home.chest)}`);
      st.phase = "wait_tool";
      st.retry = 100;
      return;
    }
    case "return": {
      e.setProperty("crew:anim", rt.walk?.path ? 1 : 0);
      // a spot picked to see a block better is only worth it on foot: no shortcut there
      const r = walkTo(rt, st.stand ?? startCell(job), st.stand ? 0.5 : 1.8, false, !!st.view);
      if (r === "failed") st.stay = st.i; // can't get there: dig this one from where it is
      if (r !== "moving") {
        st.view = undefined;
        st.phase = "working";
        st.cool = 0;
        st.move = undefined;
      }
      return;
    }
    case "working":
      work(rt, inv);
      return;
    default:
      st.phase = "working";
  }
}

/**
 * One dig step, done the way a player digs: break one block, wait while it breaks (the tool's
 * speed), then the next. Blocks still to break wait in st.q, so a step survives a trip to the
 * chest or a restart. Stages: 0 start; 1 the step's own blocks; 2 ore in the walls is queued
 * and dug; then where to stand (clearing a diggable block at head height first, or digging a
 * detour around one it can't harvest); 4 torch and move.
 * @param {Runtime} rt @param {Container} inv
 */
function work(rt, inv) {
  const { e, job, st } = rt;
  const dim = e.dimension;

  // breaking a block, or gliding to the next spot
  if (st.cool > 0) {
    st.cool--;
    if (st.move) {
      const t = Math.min(1, Math.max(0, 1 - st.cool / st.move.n));
      e.teleport(glideAt(st.move, ease(t)), st.move.face ? { facingLocation: st.move.face } : undefined);
      if (st.cool === 0) st.move = undefined; // the step is done: never replay it during a swing
    }
    return;
  }
  if (st.walkAfter) {
    // the next spot is more than a step away, or around something solid: walk there by path
    st.walkAfter = false;
    st.phase = "return";
    return;
  }
  if (st.done) {
    st.done = false;
    st.stage = 0;
    if (st.grav && (st.regrav ?? 0) < 16) st.regrav = (st.regrav ?? 0) + 1; // sand or gravel was above: check this step again
    else {
      st.i++;
      st.regrav = 0;
      progress(rt);
    }
  }

  if (!st.stage) {
    if (st.i >= job.geom.total) {
      st.final = true;
      if (job.keep === "nothing" || freeHaulSlots(inv) === inv.size - KIT_SLOTS) finish(rt);
      else st.phase = "to_deposit";
      return;
    }
    if (job.keep !== "nothing" && freeHaulSlots(inv) <= 1) {
      st.phase = "to_deposit";
      return;
    }
  }
  const k = kit(inv);
  if (!k.length) return needTool(rt, "tool");
  let s = stepAt(job, st.i);

  if (!st.stage && job.type === "quarry" && !s.keep) {
    // Nothing to dig there (open air over a quarry, or a part already dug before a restart): skip
    // it without walking to it, so the worker heads straight for the next block still in place.
    let n = 0;
    while (!s.keep && s.mine && n < 512 && (passable(dim, s.mine[0]) || keepIntact(dim.getBlock(s.mine[0])?.typeId ?? ""))) {
      st.i++;
      n++;
      if (st.i >= job.geom.total) return;
      s = stepAt(job, st.i);
    }
    if (n) progress(rt);
    if (!s.keep && s.mine) {
      // out of reach from here (a treetop, the far side of a hill, a lower layer): walk over first.
      // Clearing above, it stands on the ground under it; in the pit, on top of the block itself.
      const c = s.mine[0];
      const cur = floorV(e.location);
      if (st.stay !== st.i && (!inReach(cur, c) || !canSee(dim, cur, c))) {
        // somewhere within reach with a clear view of it (else the nearest ground, as a last resort)
        const spot = groundNear(dim, c, cur, 12, !s.above, (p) => inReach(p, c) && canSee(dim, p, c)) ?? groundNear(dim, c, cur, 12, !s.above);
        if (spot && !sameV(spot, cur)) {
          st.stand = spot;
          st.view = true;
          st.phase = "return";
          return;
        }
        if (!canSee(dim, cur, c)) console.warn(`[Crew-NoSight] ${JSON.stringify({ worker: meta(e).name, at: fmt(cur), block: fmt(c), step: st.i })}`);
      }
    }
  }

  if (!st.stage) {
    // tired: eat if it carries food; worn out with nothing to eat: rest, then carry on
    const en = energy(e);
    if (en < TIRED && !st.saidTired) {
      st.saidTired = true;
      emit(e, "tired", { energy: Math.round(en) }, "I'm getting tired, so I'm digging slower. Food or a night's sleep will fix that.");
    }
    if (en < TIRED && eatOne(e, inv) > 0) {
      st.saidTired = false;
      e.setProperty("crew:anim", 4);
      st.move = undefined;
      st.cool = 30;
      return;
    }
    if (en < EXHAUSTED) {
      startRest(e, "tired");
      return;
    }
    if (s.keep) {
      if (patchStair(rt, s.keep, inv, k) === "unloaded") st.wait = "chunk not loaded";
      else {
        if (s.torch) placeTorch(rt, inv, up(s.keep));
        st.i++;
      }
      return;
    }
    st.q = (s.mine ?? []).map((/** @type {V3} */ c) => ({ x: c.x, y: c.y, z: c.z }));
    st.stage = 1;
    st.grav = false;
    st.hc = 0;
    st.side = 0;
    st.vs = undefined;
    st.vn = 0;
  }

  // the next block in the queue, like a player: face it and swing for as long as it takes to
  // break (tool speed against the block's hardness), then it breaks, then the next one
  while (st.q?.length) {
    const c = st.q[0];
    if (!c.s) {
      const pv = mineCell(rt, c, inv, k, true);
      if (pv.res === "unloaded") {
        st.wait = "chunk not loaded";
        return;
      }
      if (pv.res === "wait") return needTool(rt, "pickaxe");
      st.wait = undefined;
      if (pv.res === "air" || pv.res === "left") {
        st.q.shift(); // nothing to break there: straight on to the next
        continue;
      }
      c.s = 1;
      st.move = undefined;
      swingAt(rt, c, pv);
      st.cool = Math.max(0, pv.ticks - 1);
      if (st.cool > 0) return;
    }
    const r = mineCell(rt, c, inv, k);
    if (r.res === "unloaded") {
      st.wait = "chunk not loaded";
      return;
    }
    if (r.res === "wait") return needTool(rt, "pickaxe");
    st.q.shift();
    st.wait = undefined;
    if (r.res === "air" || r.res === "left") continue; // changed while it swung: on to the next
    st.grav ||= r.grav;
    if (c.v) {
      // ore from the wall: fill the hole back in and follow the vein
      const fill = takeFiller(rt, inv);
      if (fill) dim.setBlockType(c, fill);
      st.veins = (st.veins ?? 0) + 1;
      st.vn = (st.vn ?? 0) + 1;
      lookForOre(rt, c);
    }
    if (r.res === "broke" && !kit(inv).length) return needTool(rt, "tool");
    return; // the next block starts on the next tick
  }

  if (st.stage === 1) {
    // the step's blocks are out: look for ore in the walls around them
    st.stage = 2;
    if (job.type === "branch_mine" && s.mine?.length) {
      for (const c of s.mine) lookForOre(rt, c);
      if (st.q.length) return;
    }
  }

  if (st.stage === 2 && s.above) {
    // clearing above: follow the ground down as it's dug away, but never climb onto a tree or
    // up a cliff to stand somewhere it couldn't walk (it reaches up instead, like a player)
    const p = standOk(rt, s.stand, s.stand);
    const cur = floorV(e.location);
    st.next = p && Math.abs(p.y - cur.y) <= 1 && Math.abs(p.x - cur.x) + Math.abs(p.z - cur.z) <= 1 ? p : undefined;
    st.stage = 4;
  }

  if (st.stage === 2) {
    // where to stand next: somewhere with a floor and headroom, never inside a block
    if (!s.stand) {
      st.next = undefined;
      st.stage = 4;
    } else if (standOk(rt, s.stand, s.stand)) {
      st.next = standOk(rt, s.stand, s.stand);
      st.stage = 4;
    } else {
      // a block it can dig is at head height there: dig it out, like a player would
      const head = st.hc < 2 ? clearableHead(rt, s.stand, k) : undefined;
      if (head) {
        st.hc++;
        st.q.push(head);
        return;
      }
      const alt = pickStand(rt, s.stand, s);
      if (alt) {
        st.next = alt;
        st.stage = 4;
      } else if (s.sides && s.mine?.length) {
        // something it can't harvest blocks the tunnel: dig a U around it
        st.stage = 3;
        st.side = 0;
        st.q.push(...detourCells(s, 0));
        return;
      } else {
        st.next = undefined;
        st.stage = 4;
      }
    }
  }

  if (st.stage === 3) {
    const mid = settle(dim, off(s.stand, s.sides[st.side], 1));
    if (roomAt(dim, mid)) {
      emit(e, "detour", { at: fmt(s.stand) }, `dug around blocks I can't harvest at ${fmt(s.stand)}.`);
      st.next = mid;
      st.stage = 4;
    } else if (++st.side < s.sides.length) {
      st.q.push(...detourCells(s, st.side));
      return;
    } else {
      st.next = undefined;
      st.stage = 4;
    }
  }

  // stage 4: torch, then move to the next spot
  if (s.torch && s.stand) placeTorch(rt, inv, s.stand);
  /** @type {V3 | undefined} */
  const stand = st.next;
  st.next = undefined;
  const pace = testFast() ? "fast" : "normal";
  const cur = floorV(e.location);
  st.move = undefined;
  st.cool = 0;
  if (stand && !sameV(cur, stand) && canGlide(dim, cur, stand)) {
    const n = MOVE_TICKS[pace] ?? 4;
    const to = center(stand);
    const from = e.location;
    const face = { x: to.x + (to.x - from.x), y: to.y + 0.5, z: to.z + (to.z - from.z) };
    st.stand = stand;
    st.move = { from, to, mid: glideMid(from, to), face: Math.abs(to.x - from.x) + Math.abs(to.z - from.z) > 0.01 ? face : undefined, n };
    st.cool = n;
    e.setProperty("crew:anim", 1);
  } else if (stand && !sameV(cur, stand)) {
    // In a quarry, a worker on solid ground within reach just reaches over (like a player)
    // rather than walking: the next cell may not be reachable until the one beside it is dug.
    const reachOver = job.type === "quarry" && dist(cur, stand) <= 3 && roomAt(dim, cur) && !passable(dim, { x: cur.x, y: cur.y - 1, z: cur.z });
    if (!reachOver) {
      st.stand = stand;
      st.walkAfter = true;
    }
  }
  st.done = true;
}

/** Can it reach block c from standing at cur (eyes about 1.6 up), like a player? @param {V3} cur @param {V3} c */
function inReach(cur, c) {
  const dx = c.x - cur.x, dy = c.y - (cur.y + 1), dz = c.z - cur.z;
  return Math.hypot(dx, dy, dz) <= 5;
}


/**
 * Safety net: if a worker is ever inside a solid block (feet or head), move it up to the nearest
 * open spot and log it, so it never stands or walks inside blocks. @param {Runtime} rt
 */
function unstick(rt) {
  const e = rt.e;
  const dim = e.dimension;
  const cur = floorV(e.location);
  if (roomAt(dim, cur) || st_moving(rt)) return;
  const solid = [cur, up(cur)].find((p) => !passable(dim, p));
  for (let k = 1; k <= 6; k++) {
    const opts = [{ x: cur.x, y: cur.y + k, z: cur.z }, ...DIR4.map((d) => ({ x: cur.x + d.x, y: cur.y + k - 1, z: cur.z + d.z }))];
    const spot = opts.find((p) => roomAt(dim, p) && !passable(dim, { x: p.x, y: p.y - 1, z: p.z }));
    if (spot) {
      console.warn(`[Crew-Inside] ${JSON.stringify({ worker: meta(e).name, at: fmt(e.location), block: solid ? dim.getBlock(solid)?.typeId : "?", job: rt.job.type, phase: rt.st.phase, step: rt.st.i, movedTo: fmt(spot) })}`);
      e.teleport(center(spot));
      return;
    }
  }
}
/** Mid-step (gliding between two open spots), it may briefly overlap a block edge: leave it be. @param {Runtime} rt */
const st_moving = (rt) => !!(rt.st.move && rt.st.cool > 0) || !!rt.walk?.glide;

/**
 * Somewhere to stand on the ground under or beside block c (looking `depth` blocks down), the
 * closest to c. For reaching the blocks of a hill or tree over a quarry. `onTop`: standing on
 * top of c (or the blocks beside it) is fine too: in the pit, not for a tree it would climb.
 * `ok` (optional): only spots it accepts, e.g. ones with a clear view of c.
 * @param {import("@minecraft/server").Dimension} dim @param {V3} c @param {V3} cur @param {number} [depth] @param {boolean} [onTop] @param {(p: V3) => boolean} [ok]
 */
function groundNear(dim, c, cur, depth = 12, onTop = false, ok = () => true) {
  /** @type {V3 | undefined} */
  let best;
  let bestD = Infinity;
  for (let dx = -2; dx <= 2; dx++) {
    for (let dz = -2; dz <= 2; dz++) {
      for (let y = c.y + (onTop ? 1 : 0); y >= c.y - depth; y--) {
        const p = { x: c.x + dx, y, z: c.z + dz };
        if (!roomAt(dim, p)) continue;
        if (passable(dim, { x: p.x, y: p.y - 1, z: p.z })) continue;
        if (!ok(p)) break;
        const d = Math.hypot(p.x - c.x, p.y + 1 - c.y, p.z - c.z) + 0.01 * dist(p, cur);
        if (d < bestD) {
          bestD = d;
          best = p;
        }
        break;
      }
    }
  }
  return best;
}

/** The spot c settles to, if it has a floor and headroom and is within reach of `want`. @param {Runtime} rt @param {V3} want @param {V3} c */
function standOk(rt, want, c) {
  const dim = rt.e.dimension;
  const p = settle(dim, c);
  return want.y - p.y <= REACH_DOWN && roomAt(dim, p) ? p : undefined;
}

/**
 * A block at head height over the spot it wants to stand on, that its tools can break (and that
 * isn't a quarry stair step, a container with items, a liquid or a protected block).
 * @param {Runtime} rt @param {V3} want @param {import("./tools.js").KitEntry[]} k
 */
function clearableHead(rt, want, k) {
  const dim = rt.e.dimension;
  const feet = settle(dim, want);
  if (!passable(dim, feet) || want.y - feet.y > REACH_DOWN) return undefined;
  const h = up(feet);
  const b = dim.getBlock(h);
  if (!b || passable(dim, h) || b.isLiquid || keepIntact(b.typeId) || isProtected(b)) return undefined;
  if (rt.job.type === "quarry" && isStairBlock(rt.job.geom, h)) return undefined;
  const box = b.getComponent("minecraft:inventory")?.container;
  if (box && box.emptySlotsCount < box.size) return undefined;
  const ch = chooseTool(k, b.typeId);
  if (ch.use === "skip" || ch.use === "wait") return undefined;
  return { x: h.x, y: h.y, z: h.z };
}

/** The 2-tall side columns before, at and after a blocked tunnel spot, on one side. @param {any} s @param {number} i */
function detourCells(s, i) {
  /** @type {V3[]} */
  const out = [];
  for (const m of [-1, 0, 1]) for (const c of column(off(off(s.stand, s.fwd, m), s.sides[i], 1), 2)) out.push({ x: c.x, y: c.y, z: c.z });
  return out;
}

/**
 * Queues ore touching c that the plan won't dig anyway (the tunnel walls, floor and ceiling),
 * up to VEIN_MAX blocks per step. Each one is dug and its hole filled back in.
 * @param {Runtime} rt @param {V3} c
 */
function lookForOre(rt, c) {
  const { job, st } = rt;
  const dim = rt.e.dimension;
  const seen = (st.vs ??= []);
  for (const [dx, dy, dz] of DIR6) {
    const q = { x: c.x + dx, y: c.y + dy, z: c.z + dz };
    const kq = `${q.x},${q.y},${q.z}`;
    if (seen.includes(kq)) continue;
    seen.push(kq);
    if (inBranchPlan(job.geom, q)) continue;
    if ((st.vn ?? 0) + st.q.filter((/** @type {any} */ x) => x.v).length >= VEIN_MAX) return;
    const b = dim.getBlock(q);
    if (b && ORE.test(b.typeId)) st.q.push({ ...q, v: 1 });
  }
}

/** Turns to the block, swings, shows the tool in hand and plays the dig sound. @param {Runtime} rt @param {V3} c @param {{tool?: string, id?: string}} r */
function swingAt(rt, c, r) {
  const e = rt.e;
  try {
    e.teleport(e.location, { facingLocation: { x: c.x + 0.5, y: c.y + 0.5, z: c.z + 0.5 } });
  } catch {
    /* fine */
  }
  e.setProperty("crew:anim", 2);
  holdTool(e, r.tool);
  if (r.id) {
    try {
      e.dimension.playSound(digSound(r.id), c, { volume: 0.6 });
    } catch {
      /* cosmetic only */
    }
  }
}

/** @param {string} id */
function digSound(id) {
  if (/sand/.test(id)) return "dig.sand";
  if (/gravel/.test(id)) return "dig.gravel";
  if (/dirt|grass|mud|clay|podzol|mycelium|farmland|snow/.test(id)) return "dig.grass";
  if (bestKind(id) === "axe") return "dig.wood";
  return "dig.stone";
}

/** One block of stone or dirt to fill a hole: from what it dug and didn't keep, else from what it carries. @param {Runtime} rt @param {Container} inv */
function takeFiller(rt, inv) {
  const sp = rt.st.spare;
  if (sp) {
    for (const [id, n] of Object.entries(sp)) {
      if (n > 1) sp[id] = n - 1;
      else delete sp[id];
      return id;
    }
  }
  for (let i = KIT_SLOTS; i < inv.size; i++) {
    const it = inv.getItem(i);
    if (!it || !FILL.test(it.typeId)) continue;
    if (it.amount > 1) {
      it.amount--;
      inv.setItem(i, it);
    } else inv.setItem(i, undefined);
    return it.typeId;
  }
  return undefined;
}

/** Places a torch on the floor at c, if it carries one and the spot is open air on solid ground. @param {Runtime} rt @param {Container} inv @param {V3} c */
function placeTorch(rt, inv, c) {
  const dim = rt.e.dimension;
  const b = dim.getBlock(c);
  if (!b || !AIR.has(b.typeId) || passable(dim, { x: c.x, y: c.y - 1, z: c.z })) return;
  for (let i = 0; i < inv.size; i++) {
    const it = inv.getItem(i);
    if (it?.typeId !== TORCH) continue;
    try {
      b.setPermutation(BlockPermutation.resolve(TORCH, { torch_facing_direction: "top" }));
    } catch {
      dim.setBlockType(c, TORCH);
    }
    if (it.amount > 1) {
      it.amount--;
      inv.setItem(i, it);
    } else inv.setItem(i, undefined);
    rt.st.torches = (rt.st.torches ?? 0) + 1;
    return;
  }
  if (rt.st.torches && !rt.st.torchOut) {
    rt.st.torchOut = true;
    emit(rt.e, "torches_out", { placed: rt.st.torches }, `I'm out of torches after placing ${rt.st.torches}. Tap me holding torches to give me more.`);
  }
}

/**
 * Breaks one block with the best tool in the kit. With `dry`, only works out what it would do
 * (and how many ticks it takes) without breaking anything.
 * @param {Runtime} rt @param {V3} c @param {Container} inv @param {import("./tools.js").KitEntry[]} k @param {boolean} [dry]
 * @returns {{res: "air"|"mined"|"left"|"broke"|"wait"|"unloaded", ticks: number, grav: boolean, tool?: string, id?: string}}
 */
function mineCell(rt, c, inv, k, dry) {
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
  if (keepIntact(id) || isProtected(block)) {
    if (sign) noteFind(rt, sign, c);
    return { res: "left", ...no };
  }
  const box = block.getComponent("minecraft:inventory")?.container;
  if (box && box.emptySlotsCount < box.size) {
    noteFind(rt, "container with items (possible structure loot)", c);
    return { res: "left", ...no };
  }
  const choice = chooseTool(k, id, toolPref(e));
  if (choice.use === "wait") return { res: "wait", ...no };
  if (choice.use === "skip") {
    logSkip(rt, id, c, choice.need);
    return { res: "left", ...no };
  }
  const tool = choice.use === "tool" ? choice.tool : undefined;
  // a tired worker digs slower; every block it breaks tires it a little
  const tired = energy(e) < TIRED;
  const base = ticksFor(tool, inv, testFast(), id);
  const ticks = tired ? Math.round(base * TIRED_SLOWDOWN) : base;
  // first look: how long it takes and with what, so it can swing that long before the block breaks
  if (dry) return { res: "mined", ticks, grav: false, tool: tool?.info.id, id };
  if (sign) noteFind(rt, sign, c);
  setEnergy(e, energy(e) - DRAIN_PER_BLOCK);
  const item = tool ? inv.getItem(tool.slot) : undefined;
  lootMgr ??= world.getLootTableManager();
  const drops = lootMgr.generateLootFromBlock(block, item) ?? [];
  const above = dim.getBlock({ x: c.x, y: c.y + 1, z: c.z });
  const grav = !!above && GRAVITY.test(above.typeId);
  dim.setBlockType(c, "minecraft:air");
  for (const drop of drops) {
    const keep = job.keep === "all" || (job.keep === "valuables" && VALUABLE.test(drop.typeId));
    if (!keep) {
      // voided stone and dirt is remembered (up to a stack) to fill holes left by ore veins
      if (FILL.test(drop.typeId)) {
        const sp = (st.spare ??= {});
        const total = Object.values(sp).reduce((a, b) => a + b, 0);
        if (total < SPARE_MAX) sp[drop.typeId] = (sp[drop.typeId] ?? 0) + Math.min(drop.amount, SPARE_MAX - total);
      }
      continue;
    }
    const left = stash(inv, drop);
    if (left) dim.spawnItem(left, e.location); // never lose items
  }
  if (!tool) return { res: "mined", ticks, grav, id };
  const label = tool.info.label;
  const used = { tool: tool.info.id, id };
  const w = wear(inv, tool, st.uses);
  if (w === "low") emit(e, "tool_low", { tool: label }, `my ${label} is nearly worn out (10% left).`);
  if (w === "broke") {
    const rest = kit(inv);
    const next = rest.filter((t) => t.info.kind === tool.info.kind);
    emit(e, "tool_broke", { tool: label, left: kitText(rest) },
      `my ${label} broke. ${next.length ? `Switching to the ${next[0].info.label}.` : rest.length ? `Still have: ${kitText(rest)}.` : "That was my last tool."}`);
    return { res: "broke", ticks, grav, ...used };
  }
  return { res: "mined", ticks, grav, ...used };
}
/** @type {import("@minecraft/server").LootTableManager | undefined} */
let lootMgr;


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
  if (keepIntact(id)) return "kept";
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
    emit(rt.e, "tool_needed", { needs: what }, `I need ${what === "pickaxe" ? "a pickaxe" : "a tool"} to keep going. Taking what I have to ${rt.job.deposit.label} and waiting there. Put one in that chest or my home chest, or tap me holding one.`);
  }
  st.phase = "to_deposit";
}

/** The kinds of tool that would get it working again. @param {Runtime} rt */
function toolKinds(rt) {
  if (rt.st.needTool === "pickaxe") return ["pickaxe"];
  return roleKinds(roleOf(rt.e));
}
/** @param {Runtime} rt @param {Container} inv */
function hasNeededTool(rt, inv) {
  const k = kit(inv);
  return rt.st.needTool === "pickaxe" ? k.some((t) => t.info.kind === "pickaxe") : k.length > 0;
}
/** @param {Runtime} rt @param {V3} at */
function chestAt(rt, at) {
  return rt.e.dimension.getBlock(at)?.getComponent("minecraft:inventory")?.container;
}
/** Does the chest at `at` hold a tool it could use? @param {Runtime} rt @param {V3} at */
function chestHasTool(rt, at) {
  const c = chestAt(rt, at);
  if (!c) return false;
  const kinds = toolKinds(rt);
  for (let i = 0; i < c.size; i++) {
    const info = toolInfo(c.getItem(i));
    if (info && kinds.includes(info.kind)) return true;
  }
  return false;
}
/**
 * Takes the tools it needs from the chest at `at` into its kit (up to 5 tools). Returns what it
 * took, e.g. "Iron Pickaxe, Stone Pickaxe", or "".
 * @param {Runtime} rt @param {V3} at @param {Container} inv
 */
function takeTools(rt, at, inv) {
  const c = chestAt(rt, at);
  if (!c) return "";
  const kinds = toolKinds(rt);
  /** @type {string[]} */
  const took = [];
  for (let i = 0; i < c.size && kit(inv).length < KIT_SLOTS; i++) {
    const it = c.getItem(i);
    const info = toolInfo(it);
    if (!it || !info || !kinds.includes(info.kind)) continue;
    const r = addToKit(inv, it);
    if (!r.ok) break;
    c.setItem(i, undefined);
    if (r.spill) {
      const left = c.addItem(r.spill);
      if (left) rt.e.dimension.spawnItem(left, rt.e.location);
    }
    took.push(info.label);
  }
  if (took.length) {
    updateTag(rt.e);
    noteChestUse(rt.e.dimension.id, at);
  }
  return took.join(", ");
}
/** @param {Runtime} rt @param {Container} inv @param {string} took @param {string} from */
function backToWork(rt, inv, took, from) {
  const { e, st } = rt;
  const k = kit(inv);
  emit(e, "tool_ok", { tools: kitText(k), took }, took ? `took ${took} from ${from}. Back to work.` : `got tools (${kitText(k)}). Back to work.`);
  st.needTool = undefined;
  st.phase = st.i === 0 ? "travel_in" : "return";
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
    if (!item || keepsItem(e, i, item) || isSupply(item.typeId)) continue; // the tool kit (a Hauler's gear and chests), torches and food stay with the worker
    const left = chest.addItem(item);
    inv.setItem(i, left);
    moved += item.amount - (left?.amount ?? 0);
    if (left) return "full";
  }
  if (moved > 0) {
    emit(e, "deposited", { items: moved, deposit: job.deposit.label }, `dropped off ${moved} items at ${job.deposit.label}.`);
    noteChestUse(job.deposit.dim, job.deposit);
  }
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
  const veins = st.veins ? ` Dug ${st.veins} ore block${st.veins === 1 ? "" : "s"} out of the walls.` : "";
  const torches = st.torches ? ` Placed ${st.torches} torch${st.torches === 1 ? "" : "es"}.` : "";
  emit(e, "job_done", { mode: job.type, steps: job.geom.total, finds: st.finds.length, skipped: st.skipTotal ?? 0, ore_from_walls: st.veins ?? 0, torches: st.torches ?? 0 },
    `finished ${what}. ${st.finds.length} finds reported.${veins}${torches}${skipped}`);
  stopJob(e, undefined);
}

// ---------- walking ----------
/**
 * Moves toward `goal` along an A* path, one block per beat. Searches a little each tick.
 * Falls back to a reported shortcut (teleport) if no route exists.
 * `beside`: the goal is a chest or barrel to stand next to, never on top of.
 * `noShortcut`: if there's no way there on foot, give up ("failed") instead of teleporting.
 * @param {Runtime} rt @param {V3} goal @param {number} reach @param {boolean} [beside] @param {boolean} [noShortcut]
 * @returns {"moving" | "arrived" | "failed"}
 */
function walkTo(rt, goal, reach, beside = false, noShortcut = false) {
  const e = rt.e;
  const dim = e.dimension;
  if (!rt.walk || !sameV(rt.walk.goal, goal) || rt.walk.reach !== reach) {
    if (rt.walk) closeDoors(rt, undefined);
    rt.walk = { goal: { x: goal.x, y: goal.y, z: goal.z }, reach, idx: 0, replans: 0, beside };
  }
  const w = rt.walk;
  const done = () => {
    closeDoors(rt, [floorV(e.location)]);
    rt.walk = undefined;
    return /** @type {"arrived"} */ ("arrived");
  };
  if (w.glide) {
    w.glide.t++;
    const to = w.glide.to;
    const flat = Math.abs(to.x - w.glide.from.x) + Math.abs(to.z - w.glide.from.z) > 0.01;
    const t = w.glide.t / w.glide.n;
    e.teleport(glideAt(w.glide, w.glide.last ? easeOut(t) : t), flat ? { facingLocation: { x: to.x + (to.x - w.glide.from.x), y: to.y + 0.5, z: to.z + (to.z - w.glide.from.z) } } : undefined);
    if (w.glide.t >= w.glide.n) w.glide = undefined;
    return "moving";
  }
  if (!w.path) {
    if (atGoal(dim, floorV(e.location), goal, reach, beside)) return done();
    w.search ??= newSearch(dim, e.location, goal, reach, beside, noShortcut ? 1500 : undefined);
    const r = advance(w.search, SEARCH_BUDGET);
    if (r === "searching") return "moving";
    if (r === "failed") {
      if (noShortcut) {
        rt.walk = undefined;
        return "failed";
      }
      return blink(rt, goal);
    }
    w.path = w.search.path;
    w.search = undefined;
    w.idx = 0;
  }
  const path = /** @type {V3[]} */ (w.path);
  if (w.idx >= path.length) return done();
  const next = path[w.idx];
  if (!passable(dim, next)) {
    // something changed (a block was placed); plan again
    w.path = undefined;
    if (++w.replans > 3) return blink(rt, goal);
    return "moving";
  }
  const cur = floorV(e.location);
  // doors: shut the ones it opened and has walked past, then open any closed one it's stepping into
  closeDoors(rt, [cur, next]);
  for (const c of [next, up(next)]) openDoor(rt, c);
  const dy = next.y - cur.y;
  const to = center(next);
  w.idx++;
  const last = w.idx >= path.length;
  // about a villager's walking pace; a little slower up a step and on the last step (to stop gently)
  w.glide = { from: e.location, to, mid: glideMid(e.location, to), t: 0, n: Math.round(((dy > 0 ? 9 : dy < 0 ? 5 + -dy : 7) + (last ? 2 : 0)) * (rt.pace ?? 1)), last };
  return "moving";
}

/** Opens a closed wooden door or fence gate at c, and remembers it so it gets closed again. @param {Runtime} rt @param {V3} c */
function openDoor(rt, c) {
  const dim = rt.e.dimension;
  const b = dim.getBlock(c);
  if (!b || !needsOpening(b) || !setOpen(b, true)) return;
  (rt.walk.opened ??= []).push({ x: c.x, y: c.y, z: c.z });
  try {
    dim.playSound("random.door_open", c, { volume: 0.7 });
  } catch {
    /* cosmetic only */
  }
}

/**
 * Closes the doors it opened on this walk, except any in the columns it's standing in or stepping
 * into (keep), so it never shuts a door on itself. Doors someone else opened are left alone.
 * @param {Runtime} rt @param {V3[] | undefined} keep
 */
function closeDoors(rt, keep) {
  const w = rt.walk;
  if (!w?.opened?.length) return;
  const dim = rt.e.dimension;
  /** @type {V3[]} */
  const still = [];
  let shut = false;
  for (const p of w.opened) {
    if (keep?.some((k) => k.x === p.x && k.z === p.z)) {
      still.push(p);
      continue;
    }
    const b = dim.getBlock(p);
    if (b && setOpen(b, false)) shut = true;
  }
  w.opened = still;
  if (shut) {
    try {
      dim.playSound("random.door_close", rt.e.location, { volume: 0.7 });
    } catch {
      /* cosmetic only */
    }
  }
}

/**
 * The nearest place to stand around `target` (floor below, two blocks of room), searching out to 3
 * blocks sideways and 2 up or down. With `beside` (a chest): not on top of it, and able to see it.
 * @param {import("@minecraft/server").Dimension} dim @param {V3} target @param {boolean} beside
 */
function landingNear(dim, target, beside) {
  /** @type {V3 | undefined} */
  let best;
  let bestD = Infinity;
  for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) for (let dy = -2; dy <= 2; dy++) {
    if (beside && dx === 0 && dz === 0) continue;
    const p = { x: target.x + dx, y: target.y + dy, z: target.z + dz };
    const d = Math.abs(dx) + Math.abs(dz) + Math.abs(dy) * 1.5;
    if (d >= bestD || !roomAt(dim, p) || passable(dim, { x: p.x, y: p.y - 1, z: p.z })) continue;
    if (beside && !canSee(dim, p, target)) continue;
    best = p;
    bestD = d;
  }
  return best;
}

/** @param {Runtime} rt @param {V3} target @returns {"arrived"} */
function blink(rt, target) {
  const e = rt.e;
  const dim = e.dimension;
  const beside = !!rt.walk?.beside;
  closeDoors(rt, undefined);
  let spot = { ...target };
  // the nearest spot with a floor and room to stand (for a chest: beside it, not on it, and where
  // it can see it, so never on the far side of a wall)
  const side = landingNear(dim, target, beside);
  if (side) spot = side;
  else for (let k = 0; k < 12 && !roomAt(dim, spot); k++) spot = { x: spot.x, y: spot.y + 1, z: spot.z };
  e.teleport(center(spot));
  rt.walk = undefined;
  rt.st.blinks = (rt.st.blinks ?? 0) + 1;
  console.log(`[Crew-Blink] ${JSON.stringify({ worker: meta(e).name, to: fmt(spot), n: rt.st.blinks })}`);
  if (rt.st.blinks === 1) emit(e, "stuck", { at: fmt(e.location) }, "couldn't find a walkable route, so I took a shortcut.");
  return "arrived";
}

/** What hauler.js needs from the engine (passed in, so hauler.js doesn't import this module). */
const haulCtx = { walkTo, stopJob, startRest, startJob, resumeJob };

export const isWorking = (/** @type {Entity} */ e) => active.has(e.id) || !!e.getDynamicProperty("crew:job");
export { meta };

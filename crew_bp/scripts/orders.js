// One entry point for every order, whoever gives it: the worker menu, a slash command, the
// server console, or (Phase 2) an LLM bridge. Orders are plain objects:
//   { worker: "Digby", job: "quarry", params: { from, to, facing, deposit, keep, clear_above } }
import { JOBS, roleRefusal, roleTakes, validate } from "./catalog.js";
import { fmt, getJSON, setJSON } from "./util.js";
import { getRegistry, resolvePlace } from "./store.js";
import { canCommand, findWorker, loadedWorkers, meta, roleOf } from "./workers.js";
import { isResting, keepUp, pausedJob, resumeJob, startJob, stopJob, statusText } from "./runner.js";
import { SIEVE, linkSieve, pauseSieve, resumeSieve, sieveStatusLine } from "./sift.js";
import { bedAt, bedClaimedBy, bedSafety, bedside, chestNear, getHome, setHome } from "./life.js";
import { getSeen, peopleOf, queueOrder, rosterOf } from "./settlement.js";

/** A loaded worker by its entity id. @param {string} id */
const loadedWorkersById = (id) => loadedWorkers().find((w) => w.id === id);
/** Is this id a worker the registry still knows (loaded or not)? @param {string} id */
const isKnownWorker = (id) => Object.values(getRegistry()).some((r) => r.id === id);
import { kit } from "./tools.js";
import { CLEAR_ABOVE_MAX, layersAbove } from "./blocks.js";
import { quarryGeom } from "./plans.js";
import { HOLD_AFTER_ORDER, isHomeChest, isSettlementChest, roundJob } from "./hauler.js";

/** @typedef {import("./store.js").Commander} Commander */

const newId = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;

/**
 * @param {Commander} by
 * @param {{worker?: string, job?: string, params?: Record<string, any>, internal?: boolean}} order  internal: from the add-on itself (and tests), may run hidden jobs
 * @returns {{ok: boolean, message: string}}
 */
export function dispatch(by, order) {
  const r = dispatchOne(by, order);
  // a Hauler called somewhere stays there a minute before its routine takes it back to the depot
  if (r.ok && ["come", "go_home", "drop_off"].includes(String(order.job))) {
    const e = findWorker(String(order.worker ?? ""));
    if (e && roleOf(e) === "Hauler") e.setDynamicProperty("crew:hold", HOLD_AFTER_ORDER);
  }
  return r;
}

/** @param {Commander} by @param {{worker?: string, job?: string, params?: Record<string, any>, internal?: boolean}} order @returns {{ok: boolean, message: string}} */
function dispatchOne(by, order) {
  const name = String(order.worker ?? "").trim();
  if (!name) return { ok: false, message: "Which worker? Give its name." };
  const e = findWorker(name);
  if (!e) {
    const known = getRegistry()[name.toLowerCase()];
    return { ok: false, message: known ? `${known.name} isn't loaded right now (too far from any player).` : `No worker called '${name}'. Try /crew:workers.` };
  }
  const m = meta(e);
  if (!canCommand(by, m)) return { ok: false, message: `${m.name} only takes orders from ${m.ownerName} and the players they allow.` };

  const v = validate(String(order.job ?? "").trim(), order.params ?? {});
  if (!v.ok) return { ok: false, message: v.error };
  // hidden jobs (the branch mine, kept for prospecting) only run from internal orders, never a player's
  if (JOBS[v.job].hidden && !order.internal) return { ok: false, message: v.job === "branch_mine" ? "Branch mines aren't offered any more: the Miner's prospecting (coming next) will dig them on its own." : `Unknown job '${v.job}'.` };
  // decision 32: each role takes only its own jobs
  if (!roleTakes(v.job, roleOf(e))) return { ok: false, message: roleRefusal(m.name, roleOf(e), v.job) };
  const p = v.params;
  const byRef = { id: by.id, name: by.name, console: !!by.console };
  // an order that gives it something to do wakes it, and at night it stays up to do it
  // (go_home isn't here on purpose: sent at night, the worker walks home and the routine puts it to bed)
  if (["come", "drop_off", "resume", "quarry", "branch_mine", "forest", "field", "haul", "haul_now"].includes(v.job)) keepUp(e);
  const hauler = roleOf(e) === "Hauler";
  if (hauler && ["resume", "haul_now", "round"].includes(v.job)) e.setDynamicProperty("crew:hold", undefined);

  switch (v.job) {
    case "stop":
      e.setDynamicProperty("crew:autoResume", undefined); // a player's stop isn't picked back up in the morning
      pauseSieve(e);
      // a stopped Hauler starts no rounds by itself until Continue or Do a round now
      if (hauler) e.setDynamicProperty("crew:haulOff", true);
      stopJob(e, `stopped by ${by.name}.`);
      return { ok: true, message: `${m.name} stopped.` };
    case "set_home": {
      const dim = e.dimension;
      const bed = bedAt(dim, p.bed);
      if (!bed) return { ok: false, message: `There's no bed at ${fmt(p.bed)}.` };
      const owner = bedClaimedBy(dim.id, bed);
      if (owner && owner !== e.id) {
        const other = loadedWorkersById(owner);
        if (other || isKnownWorker(owner)) return { ok: false, message: `That bed already belongs to ${other ? meta(other).name : "another worker"}.` };
      }
      const chest = p.chest ?? chestNear(dim, bed.head, 8);
      if (p.chest && !dim.getBlock(p.chest)?.getComponent("minecraft:inventory")) return { ok: false, message: `There's no chest or barrel at ${fmt(p.chest)}.` };
      setHome(e, { dim: dim.id, head: bed.head, foot: bed.foot, chest });
      const s = bedSafety(dim, { dim: dim.id, head: bed.head, foot: bed.foot });
      const chestWords = chest ? `The chest at ${fmt(chest)} is its home chest: it drops off there and restocks torches, food and tools from it each morning.` : "There's no chest or barrel within 8 blocks, so it has no home chest yet (place one and set its home again).";
      return { ok: true, message: `${m.name} now lives at the bed at ${fmt(bed.head)}. ${chestWords} ${s.safe ? "The bed is safe." : `The bed isn't safe: ${s.why}. It will sleep badly there.`}` };
    }
    case "clear_home":
      setHome(e, undefined);
      return { ok: true, message: `${m.name} no longer has a home. It will sleep wherever it is at night.` };
    case "status":
      return { ok: true, message: `${m.name} (${roleOf(e)}): ${statusText(e)}${sieveStatusLine(e)}` };
    case "sift": {
      const block = e.dimension.getBlock(p.at);
      if (block?.typeId !== SIEVE) return { ok: false, message: `There's no sieve at ${fmt(p.at)}. Place one, put a chest of gravel, sand, dirt, or soul sand on top, and a chest underneath.` };
      stopJob(e, undefined);
      linkSieve(e, p.at);
      return { ok: true, message: `${m.name} will keep sifting at ${fmt(p.at)} while it's on duty. Gravel, sand, dirt, and soul sand go in the chest on top; the finds come out in the chest underneath. It sleeps at night and picks this up in the morning. Redstone runs that sieve even while it sleeps.` };
    }
    case "come": {
      if (p.at !== undefined) {
        const spot = depositFor(by, p.at, e.dimension.id);
        if (typeof spot === "string") return { ok: false, message: spot };
        if (p.dimension && p.dimension !== e.dimension.id) spot.dim = p.dimension;
        if (spot.dim !== e.dimension.id) return { ok: false, message: `${p.label ?? spot.label} is in another dimension from ${m.name}.` };
        const label = p.label ?? (typeof p.at === "string" ? spot.label : `the spot at ${fmt(spot)}`);
        startJob(e, { type: "come", id: newId(), by: byRef, at: spot, label, beside: true });
        return { ok: true, message: `${m.name} is on the way to ${label}.` };
      }
      const target = p.to ?? (by.console ? undefined : by.name);
      if (!target) return { ok: false, message: "come needs 'to' (a player name) when sent from the console." };
      startJob(e, { type: "come", id: newId(), by: byRef, target: { name: target } });
      return { ok: true, message: `${m.name} is on the way to ${target}.` };
    }
    case "go_home": {
      const home = getHome(e);
      if (!home) return { ok: true, message: `${m.name} has no home, so it stays where it is.` };
      if (home.dim !== e.dimension.id) return { ok: false, message: `${m.name}'s home is in another dimension.` };
      const b = bedside(e.dimension, home);
      startJob(e, { type: "come", id: newId(), by: byRef, at: { ...b, dim: home.dim }, label: "home" });
      return { ok: true, message: `${m.name} is going home.` };
    }
    case "resume": {
      const paused = pausedJob(e);
      const siftLine = resumeSieve(e);
      if (hauler) {
        e.setDynamicProperty("crew:haulOff", undefined);
        if (!paused) return { ok: true, message: `${m.name} is back on its rounds.${siftLine ? ` ${siftLine}` : ""}` };
      }
      if (!paused && !siftLine) return { ok: false, message: `${m.name} has no stopped job to continue.` };
      if (paused) {
        resumeJob(e); // any role finishes what it already started (workers converted to Diggers keep their old digs)
        const pctBit = paused.pct == null ? "" : ` (${paused.pct}% done)`;
        return { ok: true, message: `${m.name} is going back to the ${paused.name}${pctBit}.${siftLine ? ` ${siftLine}` : ""}` };
      }
      if (isResting(e)) stopJob(e, undefined);
      return { ok: true, message: siftLine };
    }
    case "drop_off": {
      if (hauler && p.deposit === undefined) {
        // a Hauler drops off at the depot (sorted, like the end of a round), never a home chest
        const r = roundJob(e, "extra", []);
        if (!r.ok) return r;
        startJob(e, r.job);
        return { ok: true, message: `${m.name} is taking what it carries to the depot.` };
      }
      const home = getHome(e);
      const homeChest = home?.chest ? { ...home.chest, dim: home.dim, label: `its home chest at ${fmt(home.chest)}` } : undefined;
      const dep = p.deposit === undefined ? getJSON(e, "crew:lastDeposit", undefined) ?? homeChest : depositFor(by, p.deposit, e.dimension.id);
      if (!dep) return { ok: false, message: `Where to? ${m.name} hasn't dropped off anywhere yet, so give a place or chest.` };
      if (typeof dep === "string") return { ok: false, message: dep };
      if (dep.dim !== e.dimension.id) return { ok: false, message: `${dep.label} is in another dimension from ${m.name}.` };
      if (hauler && isHomeChest(dep)) return { ok: false, message: `That's a worker's home chest: Haulers leave home chests alone. Pick another chest, or Drop off with no chest to use the depot.` };
      if (!hauler) setJSON(e, "crew:lastDeposit", dep);
      startJob(e, { type: "drop_off", id: newId(), by: byRef, deposit: dep });
      return { ok: true, message: `${m.name} is taking what it carries to ${dep.label}.` };
    }
    case "quarry":
    case "branch_mine": {
      const inv = e.getComponent("minecraft:inventory")?.container;
      if (!inv || !kit(inv).length) return { ok: false, message: `${m.name} has no tools. Crouch and use it to add a pickaxe.` };
      const dep = depositFor(by, p.deposit, e.dimension.id);
      if (typeof dep === "string") return { ok: false, message: dep };
      if (dep.dim !== e.dimension.id) return { ok: false, message: `${dep.label} is in another dimension from ${m.name}.` };
      if (v.job === "quarry" && p.clear_above) {
        // measure what's over the box now, so the hills and trees on it come off first
        const g0 = p.geom;
        const h = layersAbove(e.dimension, g0.min, g0.max);
        if (h.unloaded) return { ok: false, message: `The area over the quarry isn't loaded right now, so ${m.name} can't measure what to clear above it. Go closer and try again.` };
        if (!h.open) return { ok: false, message: `There's more than ${CLEAR_ABOVE_MAX} blocks of ground over that quarry (is it underground?). Turn off "Clear above" or plan it at the surface.` };
        p.geom = quarryGeom(g0.anchor, g0.facing, g0.L, g0.W, g0.D, h.up);
      }
      setJSON(e, "crew:lastDeposit", dep);
      const job = { type: v.job, id: newId(), by: byRef, geom: p.geom, keep: p.keep, deposit: dep };
      startJob(e, job);
      setJSON(e, "crew:paused", undefined); // a new dig replaces any stopped one
      const g = p.geom;
      const what = v.job === "quarry"
        ? `${g.L}x${g.W} quarry, ${g.D} deep, from ${fmt(g.anchor)} heading ${g.facing}${g.up ? `, first clearing ${g.up} layer${g.up === 1 ? "" : "s"} above it` : ""}`
        : `branch mine from ${fmt(g.anchor)} heading ${g.facing} at Y ${g.ty}: ${g.L}-block trunk ${g.w ?? 2} wide, ${g.branchAt.length * 2} branches of ${g.B}`;
      return { ok: true, message: `${m.name} is on it: ${what}. Depositing at ${dep.label}.` };
    }
    case "forest":
    case "field": {
      const inv = e.getComponent("minecraft:inventory")?.container;
      const kind = v.job === "forest" ? "axe" : "hoe";
      if (!inv || !kit(inv).some((t) => t.info.kind === kind)) return { ok: false, message: `${m.name} needs ${v.job === "forest" ? "an axe" : "a hoe"}.` };
      const dep = depositFor(by, p.deposit, e.dimension.id);
      if (typeof dep === "string") return { ok: false, message: dep };
      if (dep.dim !== e.dimension.id) return { ok: false, message: `${dep.label} is in another dimension from ${m.name}.` };
      setJSON(e, "crew:lastDeposit", dep);
      startJob(e, { type: v.job, id: newId(), by: byRef, box: p.box, keep: p.keep, deposit: dep });
      setJSON(e, "crew:paused", undefined);
      const b = p.box;
      const w = b.max.x - b.min.x + 1, l = b.max.z - b.min.z + 1;
      const name = v.job === "forest" ? "forest" : "field";
      return { ok: true, message: `${m.name} is on it: a ${w} by ${l} ${name} from ${fmt(b.min)}. Depositing at ${dep.label}.` };
    }
    case "haul": {
      const from = depositFor(by, p.from, e.dimension.id);
      if (typeof from === "string") return { ok: false, message: from };
      const to = depositFor(by, p.to, e.dimension.id);
      if (typeof to === "string") return { ok: false, message: to };
      for (const sp of [from, to]) {
        if (sp.dim !== e.dimension.id) return { ok: false, message: `${sp.label} is in another dimension from ${m.name}.` };
        if (isHomeChest(sp)) return { ok: false, message: `${sp.label} is a worker's home chest: Haulers leave home chests alone.` };
        if (!isSettlementChest(e, sp)) return { ok: false, message: `${sp.label} isn't one of your settlement's chests. A Hauler only moves things between its settlement's chests: its storage chests, named places, drop-offs, pickup points and depot.` };
      }
      if (from.x === to.x && from.y === to.y && from.z === to.z) return { ok: false, message: "From and to are the same chest." };
      const items = p.items === undefined ? undefined : String(p.items).split(",").map((s) => s.trim().toLowerCase()).filter((s) => s).map((s) => (s.includes(":") ? s : `minecraft:${s.replace(/ /g, "_")}`));
      if (items && !items.length) return { ok: false, message: "'items' lists no item ids." };
      startJob(e, { type: "haul", id: newId(), by: byRef, from, to, items });
      return { ok: true, message: `${m.name} is moving ${items ? items.map((i) => i.replace("minecraft:", "").replace(/_/g, " ")).join(", ") : "everything"} from ${from.label} to ${to.label}.` };
    }
    case "haul_now":
    case "round": {
      e.setDynamicProperty("crew:haulOff", undefined);
      const r = roundJob(e, v.job === "round" ? p.slot : "now");
      if (!r.ok) return r;
      if (!r.job.route.length) return { ok: false, message: `${m.name} has no chests to collect from: its settlement's Diggers and Miners haven't dropped off anywhere yet, and it has no pickup points (tap a chest with the Survey Stake while it's linked).` };
      stopJob(e, undefined, true); // a round in progress isn't kept to pick up later: this one replaces it
      setJSON(e, "crew:paused", undefined);
      startJob(e, r.job);
      return { ok: true, message: r.message };
    }
    default:
      return { ok: false, message: `${v.job} isn't wired up yet.` };
  }
}

/** What players see for each settlement order (job names, plus the bell). */
export const SETTLEMENT_ORDERS = /** @type {const} */ ([["stop", "Stop"], ["resume", "Continue"], ["drop_off", "Drop off"], ["go_home", "Go home"], ["come_bell", "Come to the bell"]]);

/**
 * A settlement order: the same typed order sent to every worker in the settlement, or to one role.
 * Loaded workers get it now; the others when their area loads. Only people in the settlement (and
 * operators) can give one.
 * @param {Commander} by @param {import("./settlement.js").Settlement} s
 * @param {string} what  a job from SETTLEMENT_ORDERS ("come_bell" = come to the settlement's bell)
 * @param {string} [role]  "all" (default) or a role name
 */
export function orderSettlement(by, s, what, role = "all") {
  if (!(by.console || by.isOp || peopleOf(s).some((pp) => pp.id === by.id))) return { ok: false, message: `Only people in ${s.name} can give its workers orders.` };
  const label = SETTLEMENT_ORDERS.find(([j]) => j === what)?.[1];
  if (!label) return { ok: false, message: `'${what}' isn't an order for everyone.` };
  let job = what;
  /** @type {Record<string, any>} */
  let params = {};
  if (what === "come_bell") {
    if (!s.bell) return { ok: false, message: `${s.name}'s bell isn't up. Place it and crouch-tap it first.` };
    job = "come";
    params = { at: [s.bell.x, s.bell.y, s.bell.z], label: `${s.name}'s bell`, dimension: s.bell.dim };
  }
  const loaded = new Map(loadedWorkers().map((w) => [w.id, w]));
  const seen = getSeen();
  let sent = 0, queued = 0;
  /** @type {string[]} */
  const failed = [];
  for (const r of rosterOf(s)) {
    const w = loaded.get(r.id);
    const workerRole = w ? roleOf(w) : seen[r.id]?.role;
    if (role !== "all" && workerRole !== role) continue;
    const order = { worker: r.name, job, params };
    if (!w) {
      queueOrder(r.id, by, order);
      queued++;
    } else if (what === "come_bell" && s.bell && w.dimension.id !== s.bell.dim) {
      failed.push(`${r.name} is in another dimension`);
    } else {
      const res = dispatch(by, order);
      if (res.ok) sent++;
      else failed.push(res.message);
    }
  }
  const who = role === "all" ? "" : ` (${role}s)`;
  if (!sent && !queued && !failed.length) return { ok: false, message: `${s.name} has no ${role === "all" ? "workers" : `${role}s`} to tell.` };
  let msg = `${label}${who}: sent to ${sent} worker${sent === 1 ? "" : "s"}.`;
  if (queued) msg += ` ${queued} far away will do it when their area loads.`;
  if (failed.length) msg += ` ${failed.length} couldn't: ${failed.slice(0, 3).join("; ")}${failed.length > 3 ? "; ..." : ""}`;
  return { ok: sent + queued > 0, message: msg };
}

/**
 * A deposit spot from a place name or chest coordinates; a string is an error message.
 * @param {Commander} by @param {any} d @param {string} dim
 * @returns {{x:number,y:number,z:number,dim:string,label:string} | string}
 */
function depositFor(by, d, dim) {
  if (typeof d === "string") {
    const place = resolvePlace(by, d);
    if (!place) return `No place called '${d}' that you can use. Save one with /crew:setplace.`;
    return { x: place.x, y: place.y, z: place.z, dim: place.dim, label: place.name };
  }
  return { ...d, dim, label: `the chest at ${fmt(d)}` };
}

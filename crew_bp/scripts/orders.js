// One entry point for every order, whoever gives it: the worker menu, a slash command, the
// server console, or (Phase 2) an LLM bridge. Orders are plain objects:
//   { worker: "Digby", job: "quarry", params: { from, to, facing, deposit, keep, clear_above } }
import { JOBS, roleRefusal, roleTakes, validate } from "./catalog.js";
import { fmt, getJSON, setJSON } from "./util.js";
import { getRegistry, resolvePlace } from "./store.js";
import { canCommand, findWorker, loadedWorkers, meta, roleOf } from "./workers.js";
import { keepUp, pausedJob, resumeJob, startJob, stopJob, statusText } from "./runner.js";
import { bedAt, bedClaimedBy, bedSafety, chestNear, getHome, setHome } from "./life.js";

/** A loaded worker by its entity id. @param {string} id */
const loadedWorkersById = (id) => loadedWorkers().find((w) => w.id === id);
/** Is this id a worker the registry still knows (loaded or not)? @param {string} id */
const isKnownWorker = (id) => Object.values(getRegistry()).some((r) => r.id === id);
import { kit } from "./tools.js";
import { CLEAR_ABOVE_MAX, layersAbove } from "./blocks.js";
import { quarryGeom } from "./plans.js";

/** @typedef {import("./store.js").Commander} Commander */

const newId = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;

/**
 * @param {Commander} by
 * @param {{worker?: string, job?: string, params?: Record<string, any>, internal?: boolean}} order  internal: from the add-on itself (and tests), may run hidden jobs
 * @returns {{ok: boolean, message: string}}
 */
export function dispatch(by, order) {
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
  if (["come", "drop_off", "resume", "quarry", "branch_mine"].includes(v.job)) keepUp(e);

  switch (v.job) {
    case "stop":
      e.setDynamicProperty("crew:autoResume", undefined); // a player's stop isn't picked back up in the morning
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
      return { ok: true, message: `${m.name} (${roleOf(e)}): ${statusText(e)}` };
    case "come": {
      const target = p.to ?? (by.console ? undefined : by.name);
      if (!target) return { ok: false, message: "come needs 'to' (a player name) when sent from the console." };
      startJob(e, { type: "come", id: newId(), by: byRef, target: { name: target } });
      return { ok: true, message: `${m.name} is on the way to ${target}.` };
    }
    case "resume": {
      const paused = pausedJob(e);
      if (!paused) return { ok: false, message: `${m.name} has no stopped dig to continue.` };
      resumeJob(e); // any role finishes what it already started (workers converted to Diggers keep their old digs)
      return { ok: true, message: `${m.name} is going back to the ${paused.name} (${paused.pct}% done).` };
    }
    case "drop_off": {
      const home = getHome(e);
      const homeChest = home?.chest ? { ...home.chest, dim: home.dim, label: `its home chest at ${fmt(home.chest)}` } : undefined;
      const dep = p.deposit === undefined ? getJSON(e, "crew:lastDeposit", undefined) ?? homeChest : depositFor(by, p.deposit, e.dimension.id);
      if (!dep) return { ok: false, message: `Where to? ${m.name} hasn't dropped off anywhere yet, so give a place or chest.` };
      if (typeof dep === "string") return { ok: false, message: dep };
      if (dep.dim !== e.dimension.id) return { ok: false, message: `${dep.label} is in another dimension from ${m.name}.` };
      setJSON(e, "crew:lastDeposit", dep);
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
    default:
      return { ok: false, message: `${v.job} isn't wired up yet.` };
  }
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

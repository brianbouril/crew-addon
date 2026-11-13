// One entry point for every order, whoever gives it: the worker menu, a slash command, the
// server console, or (Phase 2) an LLM bridge. Orders are plain objects:
//   { worker: "Digby", job: "quarry", params: { from, to, facing, deposit, keep, pace } }
import { validate } from "./catalog.js";
import { fmt } from "./util.js";
import { getRegistry, resolvePlace } from "./store.js";
import { canCommand, findWorker, meta, roleOf } from "./workers.js";
import { startJob, stopJob, statusText } from "./runner.js";
import { kit } from "./tools.js";

/** @typedef {import("./store.js").Commander} Commander */

const newId = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;

/**
 * @param {Commander} by
 * @param {{worker?: string, job?: string, params?: Record<string, any>}} order
 * @returns {{ok: boolean, message: string}}
 */
export function dispatch(by, order) {
  const name = String(order.worker ?? "").trim();
  if (!name) return { ok: false, message: "Which worker? Give its name." };
  const e = findWorker(name);
  if (!e) {
    const known = getRegistry()[name.toLowerCase()];
    return { ok: false, message: known ? `${known.name} isn't loaded right now (too far from any player).` : `No worker called '${name}'. Try /crew:list.` };
  }
  const m = meta(e);
  if (!canCommand(by, m)) return { ok: false, message: `${m.name} only takes orders from ${m.ownerName} and the players they allow.` };

  const v = validate(String(order.job ?? "").trim(), order.params ?? {});
  if (!v.ok) return { ok: false, message: v.error };
  const p = v.params;
  const byRef = { id: by.id, name: by.name, console: !!by.console };

  switch (v.job) {
    case "stop":
      stopJob(e, `stopped by ${by.name}.`);
      return { ok: true, message: `${m.name} stopped.` };
    case "status":
      return { ok: true, message: `${m.name} (${roleOf(e)}): ${statusText(e)}` };
    case "come": {
      const target = p.to ?? (by.console ? undefined : by.name);
      if (!target) return { ok: false, message: "come needs 'to' (a player name) when sent from the console." };
      startJob(e, { type: "come", id: newId(), by: byRef, target: { name: target } });
      return { ok: true, message: `${m.name} is on the way to ${target}.` };
    }
    case "quarry":
    case "branch_mine": {
      if (roleOf(e) !== "Miner") return { ok: false, message: `${m.name} is a ${roleOf(e)}. Set its role to Miner in its menu to dig.` };
      const inv = e.getComponent("minecraft:inventory")?.container;
      if (!inv || !kit(inv).length) return { ok: false, message: `${m.name} has no tools. Crouch and use it to add a pickaxe.` };
      /** @type {{x:number,y:number,z:number,dim:string,label:string}} */
      let dep;
      if (typeof p.deposit === "string") {
        const place = resolvePlace(by, p.deposit);
        if (!place) return { ok: false, message: `No place called '${p.deposit}' that you can use. Save one with /crew:place.` };
        dep = { x: place.x, y: place.y, z: place.z, dim: place.dim, label: place.name };
      } else {
        dep = { ...p.deposit, dim: e.dimension.id, label: `the chest at ${fmt(p.deposit)}` };
      }
      if (dep.dim !== e.dimension.id) return { ok: false, message: `${dep.label} is in another dimension from ${m.name}.` };
      const job = { type: v.job, id: newId(), by: byRef, geom: p.geom, keep: p.keep, pace: p.pace, deposit: dep };
      startJob(e, job);
      const g = p.geom;
      const what = v.job === "quarry"
        ? `${g.L}x${g.W} quarry, ${g.D} deep, from ${fmt(g.anchor)} heading ${g.facing}`
        : `branch mine from ${fmt(g.anchor)} heading ${g.facing} at Y ${g.ty}: ${g.L}-block trunk, ${g.branchAt.length * 2} branches of ${g.B}`;
      return { ok: true, message: `${m.name} is on it: ${what}. Depositing at ${dep.label}.` };
    }
    default:
      return { ok: false, message: `${v.job} isn't wired up yet.` };
  }
}

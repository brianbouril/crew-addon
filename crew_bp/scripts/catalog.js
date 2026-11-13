// The job catalog. This is the single source of truth for what a worker can do,
// and it doubles as the tool list an LLM will be given in Phase 2.
import { FACINGS, branchGeom, quarryFromBox } from "./plans.js";

export const MAX_SIDE = 128;
export const KEEP = ["valuables", "all", "nothing"];
export const PACE = ["normal", "fast"];
export const DEFAULTS = { trunk: 32, branch: 32, spacing: 2, targetY: -54 };

/**
 * type: vec3 = [x,y,z] or {x,y,z}; place = a saved place name or a vec3; enum; int; player = a player name.
 * @type {Record<string, {description: string, params: Record<string, {type: string, required?: boolean, values?: string[], default?: any, min?: number, max?: number, description: string}>}>}
 */
export const JOBS = {
  quarry: {
    description:
      "Dig out every block in the box from `from` to `to`, top layer first, leaving a 1-wide staircase spiralling down the walls so players and the worker can walk in and out. Uses the best tool in its kit for each block and leaves any block no tool can harvest (logged). Deposits whenever full and at the end.",
    params: {
      from: { type: "vec3", required: true, description: "One corner of the box (block coordinates)." },
      to: { type: "vec3", required: true, description: "The opposite corner (block coordinates)." },
      facing: { type: "enum", values: FACINGS, default: "east", description: "Which way the staircase starts along the wall from its top corner." },
      deposit: { type: "place", required: true, description: "A saved place name (e.g. 'blue base') or the coordinates of a chest or barrel." },
      keep: { type: "enum", values: KEEP, default: "valuables", description: "What to bring back. 'valuables' keeps ores, gems and raw metals and voids the rest." },
      pace: { type: "enum", values: PACE, default: "normal", description: "normal = tool speed (about 2 to 7 blocks a second), fast = five times faster." },
    },
  },
  branch_mine: {
    description:
      "Branch (strip) mine: dig a 3-tall staircase forward and down from `start` to `target_y`, then a 2-wide, 2-tall trunk `trunk_length` blocks forward. Coming back, cut 1-wide, 2-tall branches left and right with `spacing` solid blocks between them, far end first. Mines around blocks no tool can harvest.",
    params: {
      start: { type: "vec3", required: true, description: "The ground block where the stairs begin." },
      facing: { type: "enum", values: FACINGS, required: true, description: "Direction the trunk runs." },
      target_y: { type: "int", min: -64, max: 319, default: DEFAULTS.targetY, description: "Floor level of the tunnels (Y the worker walks at). Must be at or below the start." },
      trunk_length: { type: "int", min: 1, max: MAX_SIDE, default: DEFAULTS.trunk, description: "Trunk length in blocks." },
      branch_length: { type: "int", min: 0, max: MAX_SIDE, default: DEFAULTS.branch, description: "Length of each branch in blocks (0 = trunk only)." },
      spacing: { type: "int", min: 1, max: 16, default: DEFAULTS.spacing, description: "Solid blocks left between neighbouring branches." },
      deposit: { type: "place", required: true, description: "A saved place name or the coordinates of a chest or barrel." },
      keep: { type: "enum", values: KEEP, default: "valuables", description: "What to bring back." },
      pace: { type: "enum", values: PACE, default: "normal", description: "normal or fast." },
    },
  },
  come: {
    description: "Walk to a player and wait there.",
    params: { to: { type: "player", description: "Player name. Defaults to whoever gave the order." } },
  },
  stop: { description: "Stop the current job, keep what is carried, go idle.", params: {} },
  status: { description: "Report the current job, progress, tool kit and items carried.", params: {} },
};
/** v0.1 name, still accepted. */
const ALIASES = { mine_area: "quarry" };

/** Tool definitions in the shape LLM APIs expect (name, description, JSON schema). */
export function toolSchemas() {
  return Object.entries(JOBS).map(([name, job]) => {
    /** @type {Record<string, any>} */
    const properties = { worker: { type: "string", description: "Worker name." } };
    const required = ["worker"];
    for (const [p, spec] of Object.entries(job.params)) {
      if (spec.type === "vec3") properties[p] = { type: "array", items: { type: "integer" }, minItems: 3, maxItems: 3, description: spec.description };
      else if (spec.type === "enum") properties[p] = { type: "string", enum: spec.values, description: spec.description };
      else if (spec.type === "int") properties[p] = { type: "integer", minimum: spec.min, maximum: spec.max, description: spec.description };
      else if (spec.type === "place") properties[p] = { anyOf: [{ type: "string" }, { type: "array", items: { type: "integer" }, minItems: 3, maxItems: 3 }], description: spec.description };
      else properties[p] = { type: "string", description: spec.description };
      if (spec.required) required.push(p);
    }
    return { name, description: job.description, input_schema: { type: "object", properties, required } };
  });
}

/** @param {any} v */
function toVec3(v) {
  if (Array.isArray(v) && v.length === 3 && v.every((n) => Number.isFinite(Number(n)))) {
    return { x: Math.floor(Number(v[0])), y: Math.floor(Number(v[1])), z: Math.floor(Number(v[2])) };
  }
  if (v && typeof v === "object" && ["x", "y", "z"].every((k) => Number.isFinite(Number(v[k])))) {
    return { x: Math.floor(Number(v.x)), y: Math.floor(Number(v.y)), z: Math.floor(Number(v.z)) };
  }
  return undefined;
}

/**
 * Checks params against the catalog, fills defaults and works out the dig geometry.
 * Place names are left as strings and resolved later (that needs the world and permissions).
 * @param {string} jobName
 * @param {Record<string, any>} params
 * @returns {{ok: true, job: string, params: Record<string, any>} | {ok: false, error: string}}
 */
export function validate(jobName, params) {
  jobName = /** @type {Record<string,string>} */ (ALIASES)[jobName] ?? jobName;
  const job = JOBS[jobName];
  if (!job) return { ok: false, error: `Unknown job '${jobName}'. Jobs: ${Object.keys(JOBS).join(", ")}.` };
  /** @type {Record<string, any>} */
  const out = {};
  for (const [p, spec] of Object.entries(job.params)) {
    let v = params?.[p];
    if (v === undefined || v === null || v === "") {
      if (spec.required) return { ok: false, error: `${jobName} needs '${p}'.` };
      if (spec.default !== undefined) out[p] = spec.default;
      continue;
    }
    if (spec.type === "vec3") {
      const vec = toVec3(v);
      if (!vec) return { ok: false, error: `'${p}' must be three whole numbers.` };
      out[p] = vec;
    } else if (spec.type === "enum") {
      v = String(v).toLowerCase();
      if (!spec.values?.includes(v)) return { ok: false, error: `'${p}' must be one of: ${spec.values?.join(", ")}.` };
      out[p] = v;
    } else if (spec.type === "int") {
      const n = Math.round(Number(v));
      if (!Number.isFinite(n) || n < (spec.min ?? -Infinity) || n > (spec.max ?? Infinity)) return { ok: false, error: `'${p}' must be a whole number from ${spec.min} to ${spec.max}.` };
      out[p] = n;
    } else if (spec.type === "place") {
      out[p] = toVec3(v) ?? String(v);
    } else {
      out[p] = String(v);
    }
  }
  if (jobName === "quarry") {
    const a = out.from, b = out.to;
    const min = { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), z: Math.min(a.z, b.z) };
    const max = { x: Math.max(a.x, b.x), y: Math.max(a.y, b.y), z: Math.max(a.z, b.z) };
    const size = { x: max.x - min.x + 1, y: max.y - min.y + 1, z: max.z - min.z + 1 };
    if (size.x > MAX_SIDE || size.y > MAX_SIDE || size.z > MAX_SIDE) return { ok: false, error: `Box is ${size.x}x${size.y}x${size.z}; the limit is ${MAX_SIDE} on each side.` };
    if (size.x < 2 || size.z < 2) return { ok: false, error: "A quarry needs to be at least 2 blocks wide and long, so the staircase fits." };
    out.geom = quarryFromBox(min, max, out.facing);
  }
  if (jobName === "branch_mine") {
    if (out.target_y > out.start.y + 1) return { ok: false, error: `target_y (${out.target_y}) must be at or below the start (${out.start.y + 1}).` };
    out.geom = branchGeom(out.start, out.facing, { trunk: out.trunk_length, branch: out.branch_length, spacing: out.spacing, targetY: out.target_y });
  }
  return { ok: true, job: jobName, params: out };
}

export function catalogText() {
  return Object.entries(JOBS)
    .map(([name, job]) => {
      const ps = Object.entries(job.params)
        .map(([p, s]) => `${p}${s.required ? "" : "?"}:${s.type === "enum" ? s.values?.join("|") : s.type}`)
        .join(" ");
      return `§e${name}§r ${ps}\n  ${job.description}`;
    })
    .join("\n");
}

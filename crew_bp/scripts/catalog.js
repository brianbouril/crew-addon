// The job catalog. This is the single source of truth for what a worker can do,
// and it doubles as the tool list an LLM will be given in Phase 2.
import { FACINGS, branchGeom, quarryFromBox } from "./plans.js";

export const MAX_SIDE = 128;
/** Prospect claim, in blocks from the entrance. Matches prospect.js CLAIM_RADIUS. */
export const CLAIM_RADIUS = 64;
/** Deep overworld tunnel floor (diamonds and the other deep ores). */
export const PROSPECT_FLOOR = -59;
/** Quota ores. Nether ores are not in this list. */
export const QUOTA_ORES = ["coal", "copper", "iron", "gold", "redstone", "lapis", "emerald", "diamond"];
/** What to bring back. "all" (the default) keeps everything it digs, like a player picking up drops. */
export const KEEP = ["all", "valuables", "nothing"];
export const DEFAULTS = { trunk: 32, branch: 32, spacing: 2, targetY: -54, width: 2 };
export const MAX_TRUNK_WIDTH = 4;

/**
 * type: vec3 = [x,y,z] or {x,y,z}; place = a saved place name or a vec3; enum; int; player = a player name.
 * roles: which worker roles take the job (decision 32, a hard split); none = every role.
 * hidden: not offered to players or the LLM (kept for a later job to build on); only internal orders run it.
 * @type {Record<string, {description: string, roles?: string[], hidden?: boolean, params: Record<string, {type: string, required?: boolean, values?: string[], default?: any, min?: number, max?: number, description: string}>}>}
 */
export const JOBS = {
  quarry: {
    roles: ["Digger"],
    description:
      "Digger only. Dig out every block in the box from `from` to `to`, top layer first, leaving a 1-wide staircase spiralling down the walls so players and the worker can walk in and out. Uses the best tool in its kit for each block and leaves any block no tool can harvest (logged). Deposits whenever full and at the end.",
    params: {
      from: { type: "vec3", required: true, description: "One corner of the box (block coordinates)." },
      to: { type: "vec3", required: true, description: "The opposite corner (block coordinates)." },
      facing: { type: "enum", values: FACINGS, default: "east", description: "Which way the staircase starts along the wall from its top corner." },
      deposit: { type: "place", required: true, description: "A saved place name (e.g. 'blue base') or the coordinates of a chest or barrel." },
      keep: { type: "enum", values: KEEP, default: "all", description: "What to bring back. 'all' keeps everything it digs; 'valuables' keeps ores, gems and raw metals and throws the rest away; 'nothing' just digs." },
      clear_above: { type: "bool", default: false, description: "First clear everything over the box up to open sky (hills, trees, overhangs), top down, so nothing is left floating. Refused if there's more than 48 blocks of it (the box is underground)." },
    },
  },
  branch_mine: {
    roles: ["Miner"],
    hidden: true, // Brian, Nov 15: no longer offered; the Miner's prospecting (v0.6) builds on it
    description:
      "Miner only. Branch (strip) mine: dig a 3-tall staircase forward and down from `start` to `target_y`, then a `trunk_width`-wide (default 2), 2-tall trunk `trunk_length` blocks forward. Coming back, cut 1-wide, 2-tall branches left and right with `spacing` solid blocks between them, far end first. Mines around blocks no tool can harvest.",
    params: {
      start: { type: "vec3", required: true, description: "The ground block where the stairs begin." },
      facing: { type: "enum", values: FACINGS, required: true, description: "Direction the trunk runs." },
      target_y: { type: "int", min: -64, max: 319, default: DEFAULTS.targetY, description: "Floor level of the tunnels (Y the worker walks at). Must be at or below the start." },
      trunk_length: { type: "int", min: 1, max: MAX_SIDE, default: DEFAULTS.trunk, description: "Trunk length in blocks." },
      trunk_width: { type: "int", min: 1, max: MAX_TRUNK_WIDTH, default: DEFAULTS.width, description: "Trunk width in blocks (extra lanes go to the right of the stairs)." },
      branch_length: { type: "int", min: 0, max: MAX_SIDE, default: DEFAULTS.branch, description: "Length of each branch in blocks (0 = trunk only)." },
      spacing: { type: "int", min: 1, max: 16, default: DEFAULTS.spacing, description: "Solid blocks left between neighbouring branches." },
      deposit: { type: "place", required: true, description: "A saved place name or the coordinates of a chest or barrel." },
      keep: { type: "enum", values: KEEP, default: "all", description: "What to bring back: all (default), valuables, or nothing." },
    },
  },
  prospect: {
    roles: ["Miner"],
    description:
      "Miner only. Overworld only. Hunt any valuables from a branch mine at diamond depth, either around the worker's home (the home column is never dug) or from a Survey Stake start. Optional quota on one ore. Stops at night, when pickaxes run out, when the quota is met, or when the claim is mined out. Ore goes to a chest at the entrance.",
    params: {
      where: { type: "enum", values: ["home", "stake"], required: true, description: "home: the ground around the worker's bed. stake: the block in start." },
      start: { type: "vec3", description: "Ground block where a staked mine begins. Required when where is stake." },
      facing: { type: "enum", values: FACINGS, default: "east", description: "Direction the trunk runs, and (for home) which way from the bed the entrance sits." },
      quota_ore: { type: "enum", values: QUOTA_ORES, description: "Optional. Also stop after `quota` blocks of this ore. The miner still digs every other valuable." },
      quota: { type: "int", min: 1, max: 999, description: "How many quota_ore blocks to stop after. Requires quota_ore." },
      name: { type: "string", description: "Sign text. Blank uses an automatic name such as Digby's Diamond Mine No. 1." },
      range: { type: "int", min: 4, max: CLAIM_RADIUS, default: CLAIM_RADIUS, description: "How far from the entrance the tunnels may go. The menu and the stake use 64." },
      deposit: { type: "place", description: "A chest to take wood and a chest item from, after the home chest. Also used as the ore chest when the miner does not place one." },
    },
  },
  come: {
    description: "Walk to a player, or to a spot, and wait there.",
    params: {
      to: { type: "player", description: "Player name. Defaults to whoever gave the order." },
      at: { type: "place", description: "Walk to this spot instead of a player: a saved place name or coordinates (same dimension as the worker)." },
      label: { type: "string", description: "What to call the spot in messages (e.g. \"the bell\")." },
      dimension: { type: "string", description: "The spot's dimension (e.g. minecraft:overworld); a worker in another one refuses." },
    },
  },
  go_home: { description: "Walk home to its bed and wait there. A worker with no home stays where it is.", params: {} },
  stop: { description: "Stop the current job, keep what is carried, go idle. An unfinished quarry or branch mine is kept as paused, so `resume` can continue it.", params: {} },
  set_home: {
    description: "Give the worker a home: it claims the bed (one worker per bed) and the nearest chest or barrel within 8 blocks becomes its home chest and default drop-off. At dusk it goes home, unloads and sleeps; at dawn it restocks from the chest and goes back to work.",
    params: {
      bed: { type: "vec3", required: true, description: "Either block of the bed." },
      chest: { type: "vec3", description: "The home chest. Defaults to the nearest chest or barrel within 8 blocks of the bed." },
    },
  },
  clear_home: { description: "Forget the worker's home and free its bed.", params: {} },
  resume: { description: "Continue the paused quarry or branch mine from where it stopped (after stop, drop_off or come).", params: {} },
  drop_off: {
    description: "Stop the current job (if any), carry everything the worker holds (except its tool kit and torches) to a chest, and go idle there.",
    params: {
      deposit: { type: "place", description: "A saved place name or chest coordinates. Defaults to where its last dig job dropped off." },
    },
  },
  status: { description: "Report the current job, progress, tool kit and items carried.", params: {} },
};
/** v0.1 name, still accepted. */
const ALIASES = { mine_area: "quarry" };

/** The jobs players (and the LLM) can order. */
const offered = () => Object.entries(JOBS).filter(([, job]) => !job.hidden);

/** Does this role take this job? @param {string} jobName @param {string} role */
export const roleTakes = (jobName, role) => !JOBS[jobName]?.roles || /** @type {string[]} */ (JOBS[jobName].roles).includes(role);

/** Why a worker refuses a job that isn't its role's. @param {string} name @param {string} role @param {string} jobName */
export function roleRefusal(name, role, jobName) {
  const who = JOBS[jobName]?.roles?.[0] ?? "other";
  const tool = { Digger: "a shovel", Miner: "a pickaxe", Woodcutter: "an axe", Farmer: "a hoe" }[who] ?? "the right tool";
  const what = jobName === "quarry" ? "Quarries are" : jobName === "branch_mine" ? "Branch mines are" : jobName === "prospect" ? "Prospecting is" : `'${jobName}' is`;
  return `${name} is a ${role}. ${what} a ${who}'s job: build a ${who} (put ${tool} in the barrel first), or change ${name}'s role in its menu.`;
}

/** Tool definitions in the shape LLM APIs expect (name, description, JSON schema). */
export function toolSchemas() {
  return offered().map(([name, job]) => {
    /** @type {Record<string, any>} */
    const properties = { worker: { type: "string", description: "Worker name." } };
    const required = ["worker"];
    for (const [p, spec] of Object.entries(job.params)) {
      if (spec.type === "vec3") properties[p] = { type: "array", items: { type: "integer" }, minItems: 3, maxItems: 3, description: spec.description };
      else if (spec.type === "enum") properties[p] = { type: "string", enum: spec.values, description: spec.description };
      else if (spec.type === "int") properties[p] = { type: "integer", minimum: spec.min, maximum: spec.max, description: spec.description };
      else if (spec.type === "bool") properties[p] = { type: "boolean", description: spec.description };
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
  if (!job) return { ok: false, error: `Unknown job '${jobName}'. Jobs: ${offered().map(([n]) => n).join(", ")}.` };
  if (jobName === "prospect" && params?.quota_ore && /ancient|debris/.test(String(params.quota_ore).toLowerCase())) {
    return { ok: false, error: "Ancient debris waits. Prospecting stays in the overworld for now, and it hunts the ores it uncovers there." };
  }
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
    } else if (spec.type === "bool") {
      const s = String(v).toLowerCase();
      if (v === true || ["true", "yes", "on", "1"].includes(s)) out[p] = true;
      else if (v === false || ["false", "no", "off", "0"].includes(s)) out[p] = false;
      else return { ok: false, error: `'${p}' must be true or false.` };
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
    out.geom = branchGeom(out.start, out.facing, { trunk: out.trunk_length, branch: out.branch_length, spacing: out.spacing, targetY: out.target_y, width: out.trunk_width });
  }
  if (jobName === "prospect") {
    if (out.where === "stake" && !out.start) return { ok: false, error: "prospect needs 'start' when where is stake." };
    if (out.quota_ore && out.quota === undefined) return { ok: false, error: "prospect needs 'quota' (how many) with quota_ore." };
    if (out.quota !== undefined && !out.quota_ore) return { ok: false, error: "prospect needs 'quota_ore' with quota." };
  }
  return { ok: true, job: jobName, params: out };
}

export function catalogText() {
  return offered()
    .map(([name, job]) => {
      const ps = Object.entries(job.params)
        .map(([p, s]) => `${p}${s.required ? "" : "?"}:${s.type === "enum" ? s.values?.join("|") : s.type}`)
        .join(" ");
      return `§e${name}§r${job.roles ? ` §7(${job.roles.join(", ")})§r` : ""} ${ps}\n  ${job.description}`;
    })
    .join("\n");
}

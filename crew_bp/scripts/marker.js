// The Survey Stake planner. Use the stake on a ground block to start a plan there, facing the
// way you look; pick Quarry or Branch mine and the size; an outline shows while you hold the
// stake. Use the stake on the same block again to confirm, resize, turn or clear it.
// Use it on a chest or barrel to mark where workers drop things off.
import { ItemStack, system, world } from "@minecraft/server";
import { ActionFormData, ModalFormData } from "@minecraft/server-ui";
import { DEFAULTS, MAX_SIDE, MAX_TRUNK_WIDTH } from "./catalog.js";
import { arrow, branchGeom, facingFromYaw, outline, quarryGeom } from "./plans.js";
import { dist, fmt, getJSON, sameV, setJSON, tell } from "./util.js";
import { show } from "./forms.js";
import { PAGES, openGuide } from "./guide.js";

export const STAKE = "crew:survey_stake";

/**
 * @typedef {{x:number,y:number,z:number}} V3
 * @typedef {{mode: "quarry"|"branch", dim: string, anchor: V3, facing: string, confirmed: boolean,
 *   length: number, width: number, depth: number, trunk: number, trunkWidth?: number, branch: number, spacing: number, targetY: number}} Plan
 */

/** @param {import("@minecraft/server").Player} p @returns {Plan | undefined} */
export const getPlan = (p) => getJSON(p, "crew:plan", undefined);
/** @param {import("@minecraft/server").Player} p @param {Plan | undefined} plan */
const savePlan = (p, plan) => setJSON(p, "crew:plan", plan);

/** One line describing a plan. @param {Plan} plan */
export function planText(plan) {
  if (plan.mode === "quarry") {
    return `Quarry ${plan.length} forward x ${plan.width} to the right x ${plan.depth} deep from the corner at ${fmt(plan.anchor)}, heading ${plan.facing} (${plan.length * plan.width * plan.depth} blocks).`;
  }
  const g = branchGeom(plan.anchor, plan.facing, { ...plan, width: plan.trunkWidth ?? DEFAULTS.width });
  return `Branch mine from ${fmt(plan.anchor)} heading ${plan.facing}: ${g.n > 0 ? `stairs down to Y ${plan.targetY}, ` : ""}a ${plan.trunk}-block trunk ${g.w} wide, ${g.branchAt.length * 2} branches ${plan.branch} long with ${plan.spacing} solid blocks between.`;
}

/** The order a confirmed plan turns into (without deposit, keep and pace). @param {Plan} plan */
export function planOrder(plan) {
  if (plan.mode === "quarry") {
    const g = quarryGeom(plan.anchor, plan.facing, plan.length, plan.width, plan.depth);
    return { job: "quarry", params: { from: g.min, to: g.max, facing: plan.facing } };
  }
  return { job: "branch_mine", params: { start: plan.anchor, facing: plan.facing, target_y: plan.targetY, trunk_length: plan.trunk, trunk_width: plan.trunkWidth ?? DEFAULTS.width, branch_length: plan.branch, spacing: plan.spacing } };
}

/** Updates a plan's sizes from the worker menu (the outline follows). @param {import("@minecraft/server").Player} p @param {Partial<Plan>} change */
export function updatePlan(p, change) {
  const plan = getPlan(p);
  if (plan) savePlan(p, { ...plan, ...change });
}

/**
 * Stake used on a block.
 * @param {import("@minecraft/server").Player} p @param {import("@minecraft/server").Block} block
 */
export async function stakeTap(p, block) {
  if (block.getComponent("minecraft:inventory")) {
    p.setDynamicProperty("crew:deposit", block.location);
    tell(p, `Deposit set to the ${block.typeId.replace("minecraft:", "")} at ${fmt(block.location)}. To give it a name workers understand, look at it and run /crew:place "name".`);
    return;
  }
  const plan = getPlan(p);
  if (plan && plan.dim === block.dimension.id && sameV(plan.anchor, block.location)) return planActions(p);
  const facing = facingFromYaw(p.getRotation().y);
  const base = plan ?? { mode: "quarry", length: 16, width: 16, depth: 16, trunk: DEFAULTS.trunk, trunkWidth: DEFAULTS.width, branch: DEFAULTS.branch, spacing: DEFAULTS.spacing, targetY: DEFAULTS.targetY };
  /** @type {Plan} */
  const next = { ...base, dim: block.dimension.id, anchor: { ...block.location }, facing, confirmed: false };
  if (next.targetY > next.anchor.y + 1) next.targetY = next.anchor.y + 1;
  const f = new ActionFormData().title("Plan a dig here")
    .body(`Start: the block at ${fmt(block.location)}, heading ${facing} (the way you're facing).\n\nQuarry: this is the top corner. It digs forward and to your right, and leaves a staircase down the walls.\n\nBranch mine: stairs start here and go forward and down to the tunnel level.`)
    .button("Quarry").button("Branch mine").button("Cancel").button("Put the stake away");
  const r = await show(p, f);
  if (r?.selection === 3) return putAway(p);
  if (!r || r.selection === 2 || r.selection === undefined) return;
  next.mode = r.selection === 0 ? "quarry" : "branch";
  if (!(await sizeForm(p, next))) return;
  savePlan(p, next);
  tell(p, `${planText(next)}\nThe outline shows while you hold the stake. Use the stake on the same block again to confirm or change it.`);
}

/** Stake used in the air. @param {import("@minecraft/server").Player} p */
export async function stakeUse(p) {
  if (getPlan(p)) return planActions(p);
  const f = new ActionFormData().title("Survey Stake")
    .body("Use the stake on the ground block where a dig should start, facing the way it should go. Use it on a chest or barrel to mark the drop-off.")
    .button("OK").button("Put the stake away").button("How to plan a dig");
  const r = await show(p, f);
  if (r?.selection === 1) putAway(p);
  if (r?.selection === 2) await openGuide(p, PAGES.findIndex((pg) => pg.title.startsWith("Plan a dig")));
}

/** @param {import("@minecraft/server").Player} p */
export function hasStake(p) {
  const inv = p.getComponent("minecraft:inventory")?.container;
  if (!inv) return false;
  for (let i = 0; i < inv.size; i++) if (inv.getItem(i)?.typeId === STAKE) return true;
  return false;
}

/** Gives the player a Survey Stake, unless they already carry one. Returns the message to show. @param {import("@minecraft/server").Player} p */
export function giveStake(p) {
  if (hasStake(p)) return "You already have a Survey Stake.";
  const inv = p.getComponent("minecraft:inventory")?.container;
  if (!inv) return "Couldn't reach your inventory.";
  if (inv.addItem(new ItemStack(STAKE, 1))) return "Your inventory is full.";
  return "Survey Stake added. Use it on the ground where a dig should start (facing the way it should go) to plan a quarry or branch mine; use it on a chest to mark the drop-off.";
}

/** Takes the stake out of the player's inventory (the one in hand, else the first one). The plan is kept. @param {import("@minecraft/server").Player} p */
export function putAway(p) {
  const inv = p.getComponent("minecraft:inventory")?.container;
  if (!inv) return;
  let slot = inv.getItem(p.selectedSlotIndex)?.typeId === STAKE ? p.selectedSlotIndex : -1;
  for (let i = 0; slot < 0 && i < inv.size; i++) if (inv.getItem(i)?.typeId === STAKE) slot = i;
  if (slot < 0) return;
  inv.setItem(slot, undefined);
  tell(p, `Stake put away.${getPlan(p) ? " Your plan is kept." : ""} /crew:stake gives you a new one.`);
}

/** @param {import("@minecraft/server").Player} p */
async function planActions(p) {
  const plan = getPlan(p);
  if (!plan) return;
  const facing = facingFromYaw(p.getRotation().y);
  const other = plan.mode === "quarry" ? "Branch mine" : "Quarry";
  const f = new ActionFormData().title(plan.confirmed ? "Plan (confirmed)" : "Plan (not confirmed yet)").body(planText(plan))
    .button(plan.confirmed ? "Keep it" : "Confirm").button("Change the size").button(`Point it ${facing}`).button(`Switch to ${other}`).button("Clear the plan").button("Put the stake away");
  const r = await show(p, f);
  if (!r || r.selection === undefined) return;
  const next = { ...plan, confirmed: false };
  switch (r.selection) {
    case 0:
      savePlan(p, { ...plan, confirmed: true });
      tell(p, `Plan confirmed. Crouch and use a worker, then pick ${plan.mode === "quarry" ? "Quarry" : "Branch mine"}.`);
      return;
    case 1:
      if (!(await sizeForm(p, next))) return;
      break;
    case 2:
      next.facing = facing;
      break;
    case 3:
      next.mode = plan.mode === "quarry" ? "branch" : "quarry";
      if (!(await sizeForm(p, next))) return;
      break;
    case 4:
      savePlan(p, undefined);
      tell(p, "Plan cleared.");
      return;
    case 5:
      putAway(p);
      return;
  }
  savePlan(p, next);
  tell(p, `${planText(next)}\nUse the stake on the same block again to confirm.`);
}

/** Asks for the sizes of a plan; edits it in place. @param {import("@minecraft/server").Player} p @param {Plan} plan */
async function sizeForm(p, plan) {
  if (plan.mode === "quarry") {
    const f = new ModalFormData().title("Quarry size")
      .slider("Length (forward)", 2, MAX_SIDE, { defaultValue: clamp(plan.length, 2, MAX_SIDE), valueStep: 1 })
      .slider("Width (to the right)", 2, MAX_SIDE, { defaultValue: clamp(plan.width, 2, MAX_SIDE), valueStep: 1 })
      .slider("Depth (down, this block's layer included)", 1, MAX_SIDE, { defaultValue: clamp(plan.depth, 1, MAX_SIDE), valueStep: 1 })
      .submitButton("Show outline");
    const r = await show(p, f);
    if (!r?.formValues) return false;
    [plan.length, plan.width, plan.depth] = r.formValues.map(Number);
    return true;
  }
  const maxY = plan.anchor.y + 1;
  const f = new ModalFormData().title("Branch mine size")
    .slider("Trunk length", 1, MAX_SIDE, { defaultValue: clamp(plan.trunk, 1, MAX_SIDE), valueStep: 1 })
    .slider("Trunk width (extra lanes to the right)", 1, MAX_TRUNK_WIDTH, { defaultValue: clamp(plan.trunkWidth ?? DEFAULTS.width, 1, MAX_TRUNK_WIDTH), valueStep: 1 })
    .slider("Branch length (each side)", 0, MAX_SIDE, { defaultValue: clamp(plan.branch, 0, MAX_SIDE), valueStep: 1 })
    .slider("Solid blocks between branches", 1, 16, { defaultValue: clamp(plan.spacing, 1, 16), valueStep: 1 })
    .textField(`Tunnel floor Y (here is ${maxY})`, "-54", { defaultValue: String(Math.min(plan.targetY, maxY)) })
    .submitButton("Show outline");
  const r = await show(p, f);
  if (!r?.formValues) return false;
  const [t, tw, b, s, y] = r.formValues;
  plan.trunk = Number(t);
  plan.trunkWidth = Number(tw);
  plan.branch = Number(b);
  plan.spacing = Number(s);
  const ty = Math.round(Number(y));
  plan.targetY = Number.isFinite(ty) ? clamp(ty, -64, maxY) : Math.min(DEFAULTS.targetY, maxY);
  return true;
}

/** @param {number} v @param {number} lo @param {number} hi */
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, Math.round(Number(v) || lo)));

// ---------- the outline ----------
/** @type {Map<string, {key: string, pts: V3[], arrow: V3[]}>} */
const cache = new Map();
const MAX_POINTS = 300;

/** @param {Plan} plan */
function points(plan) {
  const segs = outline(plan);
  const total = segs.reduce((a, [p, q]) => a + dist(p, q), 0);
  const step = Math.max(0.5, total / MAX_POINTS);
  /** @type {V3[]} */
  const pts = [];
  for (const [p, q] of segs) {
    const n = Math.max(1, Math.round(dist(p, q) / step));
    for (let i = 0; i <= n; i++) pts.push({ x: p.x + ((q.x - p.x) * i) / n, y: p.y + ((q.y - p.y) * i) / n, z: p.z + ((q.z - p.z) * i) / n });
  }
  return pts;
}

/** Draws each player's plan while they hold the stake (only they see it). */
export function startOutlines() {
  system.runInterval(() => {
    for (const p of world.getAllPlayers()) {
      try {
        const inv = p.getComponent("minecraft:inventory")?.container;
        if (inv?.getItem(p.selectedSlotIndex)?.typeId !== STAKE) continue;
        const plan = getPlan(p);
        if (!plan || plan.dim !== p.dimension.id) continue;
        const key = JSON.stringify(plan);
        let c = cache.get(p.id);
        if (!c || c.key !== key) {
          c = { key, pts: points(plan), arrow: arrow(plan) };
          cache.set(p.id, c);
        }
        const fx = plan.confirmed ? "minecraft:villager_happy" : "minecraft:endrod";
        for (const pt of c.pts) if (dist(pt, p.location) < 96) p.spawnParticle(fx, pt);
        for (const pt of c.arrow) p.spawnParticle("minecraft:basic_flame_particle", pt);
      } catch {
        /* cosmetic only */
      }
    }
  }, 10);
}

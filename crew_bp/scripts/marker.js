// The Survey Stake planner. Use the stake on a ground block to start a plan there, facing the
// way you look; plan a quarry (a Digger's job) and its size; an outline shows while you hold the
// stake. Use the stake on the same block again to confirm, resize, turn or clear it.
// Use it on a chest or barrel to mark where workers drop things off.
import { ItemStack, system, world } from "@minecraft/server";
import { ActionFormData, ModalFormData } from "@minecraft/server-ui";
import { CLAIM_RADIUS, DEFAULTS, MAX_SIDE, MAX_TRUNK_WIDTH, QUOTA_ORES } from "./catalog.js";
import { arrow, branchGeom, facingFromYaw, outline, quarryGeom } from "./plans.js";
import { CLEAR_ABOVE_MAX, layersAbove } from "./blocks.js";
import { dist, fmt, getJSON, sameV, setJSON, tell } from "./util.js";
import { show } from "./forms.js";
import { PAGES, openGuide } from "./guide.js";
import { canCommand, loadedWorkers, meta, roleOf } from "./workers.js";
import { roleRefusal } from "./catalog.js";
import { digForm, openMenu, whoIs } from "./ui.js";
import { dispatch } from "./orders.js";
import { bedAt, bedSafety, chestNear, getHome } from "./life.js";
import { savePlace } from "./store.js";
import { addStorage, isStorage, removeStorage, settlementOf } from "./settlement.js";
import { statusText } from "./runner.js";

export const STAKE = "crew:survey_stake";

/**
 * @typedef {{x:number,y:number,z:number}} V3
 * @typedef {{mode: "quarry"|"branch"|"prospect", dim: string, anchor: V3, facing: string, confirmed: boolean,
 *   length: number, width: number, depth: number, trunk: number, trunkWidth?: number, branch: number, spacing: number, targetY: number,
 *   clearAbove?: boolean, above?: number, aboveTooHigh?: boolean, mineName?: string, quotaOre?: string, quota?: number, range?: number}} Plan
 */

/**
 * The player's plan. Branch mine plans saved before Nov 15 are dropped: the stake plans quarries
 * only now (the branch mine comes back inside the Miner's prospecting).
 * @param {import("@minecraft/server").Player} p @returns {Plan | undefined}
 */
export const getPlan = (p) => {
  const plan = getJSON(p, "crew:plan", undefined);
  return plan?.mode === "quarry" || plan?.mode === "prospect" ? plan : undefined;
};
/** @param {import("@minecraft/server").Player} p @param {Plan | undefined} plan */
const savePlan = (p, plan) => setJSON(p, "crew:plan", plan && measureAbove(plan));

/** For a quarry with Clear above: how many layers over it would be cleared (shown in the outline). @param {Plan} plan */
function measureAbove(plan) {
  if (plan.mode !== "quarry" || !plan.clearAbove) return { ...plan, above: undefined, aboveTooHigh: undefined };
  try {
    const g = quarryGeom(plan.anchor, plan.facing, plan.length, plan.width, plan.depth);
    const h = layersAbove(world.getDimension(plan.dim), g.min, g.max);
    return { ...plan, above: h.open ? h.up : undefined, aboveTooHigh: !h.open && !h.unloaded ? true : undefined };
  } catch {
    return plan;
  }
}

/**
 * The quarry Depth slider's label: a count of blocks down (not a Y level), so players don't look
 * for a negative number. @param {number} topY the staked block's Y (the top layer)
 */
export const depthLabel = (topY) => `Depth: how many blocks down (top layer is Y ${topY}, so 10 digs down to Y ${topY - 9})`;

/** One line describing a plan. @param {Plan} plan */
const ORE_LABEL = { coal: "Coal", copper: "Copper", iron: "Iron", gold: "Gold", redstone: "Redstone", lapis: "Lapis", emerald: "Emerald", diamond: "Diamond" };

export function planText(plan) {
  if (plan.mode === "prospect") {
    const quota = plan.quotaOre && plan.quota ? ` Stops after ${plan.quota} ${plan.quotaOre}.` : " It hunts any valuables.";
    const named = plan.mineName ? ` Sign: ${plan.mineName}.` : " The sign name is automatic.";
    return `Mine from ${fmt(plan.anchor)} heading ${plan.facing}, within ${plan.range ?? CLAIM_RADIUS} blocks. One entrance and one shaft. A quota branches at that ore's best depth; with no quota it adds a level for each ore the shaft can reach.${quota}${named} The home, if it is inside that ground, stays undug.`;
  }
  if (plan.mode === "quarry") {
    const above = !plan.clearAbove ? "" : plan.aboveTooHigh ? `\n§cClear above is on, but there's more than ${CLEAR_ABOVE_MAX} blocks over it (underground?): turn it off or plan at the surface.§r`
      : plan.above ? `\nFirst it clears the ${plan.above} layer${plan.above === 1 ? "" : "s"} above it (hills, trees), so nothing is left floating.` : "\nNothing above it to clear.";
    return `Quarry ${plan.length} forward x ${plan.width} to the right x ${plan.depth} deep (down to Y ${plan.anchor.y - plan.depth + 1}) from the corner at ${fmt(plan.anchor)}, heading ${plan.facing} (${plan.length * plan.width * plan.depth} blocks).${above}`;
  }
  const g = branchGeom(plan.anchor, plan.facing, { ...plan, width: plan.trunkWidth ?? DEFAULTS.width });
  return `Branch mine from ${fmt(plan.anchor)} heading ${plan.facing}: ${g.n > 0 ? `stairs down to Y ${plan.targetY}, ` : ""}a ${plan.trunk}-block trunk ${g.w} wide, ${g.branchAt.length * 2} branches ${plan.branch} long with ${plan.spacing} solid blocks between.`;
}

/** The order a confirmed plan turns into (without deposit, keep and pace). @param {Plan} plan */
export function planOrder(plan) {
  if (plan.mode === "prospect") {
    /** @type {Record<string, any>} */
    const params = { where: "stake", start: plan.anchor, facing: plan.facing, range: plan.range ?? CLAIM_RADIUS };
    if (plan.mineName) params.name = plan.mineName;
    if (plan.quotaOre && plan.quota) {
      params.quota_ore = plan.quotaOre;
      params.quota = plan.quota;
    }
    return { job: "prospect", params };
  }
  if (plan.mode === "quarry") {
    const g = quarryGeom(plan.anchor, plan.facing, plan.length, plan.width, plan.depth);
    return { job: "quarry", params: { from: g.min, to: g.max, facing: plan.facing, clear_above: !!plan.clearAbove } };
  }
  return { job: "branch_mine", params: { start: plan.anchor, facing: plan.facing, target_y: plan.targetY, trunk_length: plan.trunk, trunk_width: plan.trunkWidth ?? DEFAULTS.width, branch_length: plan.branch, spacing: plan.spacing } };
}

/** Updates a plan's sizes from the worker menu (the outline follows). @param {import("@minecraft/server").Player} p @param {Partial<Plan>} change */
export function updatePlan(p, change) {
  const plan = getPlan(p);
  if (plan) savePlan(p, { ...plan, ...change });
}

// ---------- the linked worker: the stake works as a remote for one worker at a time ----------
/** The worker this player's stake is linked to, if it's loaded. @param {import("@minecraft/server").Player} p */
export function linkedWorker(p) {
  const id = p.getDynamicProperty("crew:linked");
  return typeof id === "string" ? loadedWorkers().find((w) => w.id === id) : undefined;
}
/** @param {import("@minecraft/server").Player} p */
const linkedName = (p) => {
  const n = p.getDynamicProperty("crew:linkedName");
  return typeof n === "string" ? n : undefined;
};

/** Links the stake to a worker the player can give orders to. @param {import("@minecraft/server").Player} p @param {import("@minecraft/server").Entity} e */
export function linkWorker(p, e) {
  const m = meta(e);
  if (!canCommand(whoIs(p), m)) {
    tell(p, `§c${m.name} only takes orders from ${m.ownerName} and the players they allow.`);
    return;
  }
  p.setDynamicProperty("crew:linked", e.id);
  p.setDynamicProperty("crew:linkedName", m.name);
  tell(p, `Your Survey Stake is linked to §b${m.name}§r. With it: tap a bed to make it ${m.name}'s home, tap a chest for its home chest or a drop-off, tap the ground to plan a dig, and tap the air for ${m.name}'s orders from anywhere.`);
}

/** Bed tapped with the stake: make it the linked worker's home, from any distance. @param {import("@minecraft/server").Player} p @param {import("@minecraft/server").Block} block */
async function bedTapped(p, block) {
  const e = linkedWorker(p);
  if (!e) return notLinked(p, "make this bed a worker's home");
  const m = meta(e);
  const bed = bedAt(block.dimension, block.location);
  if (!bed) return;
  const home = { dim: block.dimension.id, head: bed.head, foot: bed.foot };
  const s = bedSafety(block.dimension, home);
  const chest = chestNear(block.dimension, bed.head, 8);
  const f = new ActionFormData().title(`${m.name}'s home?`)
    .body(`Make this bed ${m.name}'s home? ${s.safe ? "It's a safe bed." : `It isn't safe: ${s.why}, so ${m.name} would sleep badly.`}\n\n${chest ? `The chest at ${fmt(chest)} would be its home chest (tap another chest with the stake to change it).` : "There's no chest within 8 blocks, so it would have no home chest yet."}`)
    .button("Yes, this is its home").button("Cancel");
  const r = await show(p, f);
  if (r?.selection === 0) say(p, dispatch(whoIs(p), { worker: m.name, job: "set_home", params: { bed: bed.head } }));
}

/**
 * Chest or barrel tapped with the stake: the linked worker's home chest, the drop-off for digs you
 * plan, or a named place workers understand.
 * @param {import("@minecraft/server").Player} p @param {import("@minecraft/server").Block} block
 */
async function chestTapped(p, block) {
  const e = linkedWorker(p);
  const loc = { ...block.location };
  const what = block.typeId.replace("minecraft:", "").replace(/_/g, " ");
  /** @type {[string, () => any][]} */
  const b = [];
  if (e) b.push([`Make it ${meta(e).name}'s home chest`, () => {
    const m = meta(e);
    const home = getHome(e);
    if (!home) return tell(p, `§c${m.name} has no bed yet. Tap its bed with the stake first, then this chest.`);
    say(p, dispatch(whoIs(p), { worker: m.name, job: "set_home", params: { bed: home.head, chest: loc } }));
  }]);
  b.push(["Drop-off for digs I plan", () => {
    p.setDynamicProperty("crew:deposit", loc);
    tell(p, `Digs you start will drop off at the ${what} at ${fmt(loc)}.`);
  }]);
  b.push(["Save it as a named place", async () => {
    const f = new ModalFormData().title(`Name this ${what}`).textField("Name (for example: blue base)", "blue base").toggle("Let everyone's workers use it", { defaultValue: false }).submitButton("Save");
    const r = await show(p, f);
    const name = String(r?.formValues?.[0] ?? "").trim();
    if (!name) return;
    savePlace(whoIs(p), name, block.dimension.id, loc, !!r?.formValues?.[1]);
    tell(p, `Saved '${name}' at ${fmt(loc)}. Workers can drop off there by that name.`);
  }]);
  const s = settlementOf({ id: p.id, name: p.name });
  if (s) {
    if (!isStorage(s, block)) b.push(["Add to settlement storage", () => say(p, addStorage(whoIs(p), s, block))]);
    else if ((s.storage ?? []).some((x) => x.x === loc.x && x.y === loc.y && x.z === loc.z && x.dim === block.dimension.id)) b.push(["Remove from settlement storage", () => say(p, removeStorage(whoIs(p), s, block))]);
  }
  b.push(["Cancel", () => {}]);
  const f = new ActionFormData().title(`This ${what}`).body(`The ${what} at ${fmt(loc)}.${e ? "" : "\n\nTap one of your workers with the stake to link it; then this chest can be its home chest."}`);
  for (const [label] of b) f.button(label);
  const r = await show(p, f);
  if (r?.selection !== undefined) await b[r.selection]?.[1]();
}

/** @param {import("@minecraft/server").Player} p @param {string} doWhat */
function notLinked(p, doWhat) {
  const name = linkedName(p);
  tell(p, name ? `§c${name} is too far away right now (its area isn't loaded). Go closer, then try again.` : `To ${doWhat}, first tap one of your workers with the Survey Stake to link it.`);
}

/** @param {import("@minecraft/server").Player} p @param {{ok: boolean, message: string}} r */
const say = (p, r) => tell(p, r.ok ? r.message : `§c${r.message}`);

/**
 * Stake used on a block: a bed sets the linked worker's home, a chest or barrel its home chest
 * or a drop-off, anything else starts (or opens) a dig plan.
 * @param {import("@minecraft/server").Player} p @param {import("@minecraft/server").Block} block
 */
export async function stakeTap(p, block) {
  if (block.typeId === "minecraft:bed") return bedTapped(p, block);
  if (block.getComponent("minecraft:inventory")) return chestTapped(p, block);
  const plan = getPlan(p);
  // with an unconfirmed plan, any tap opens it (no need to find the exact start block again);
  // a confirmed plan opens from its start block, or offers to plan a new dig elsewhere
  if (plan && plan.dim === block.dimension.id && (!plan.confirmed || sameV(plan.anchor, block.location))) return planActions(p, block);
  if (plan?.confirmed && plan.dim === block.dimension.id) {
    const r = await show(p, new ActionFormData().title("Survey Stake").body(`${planText(plan)}\n\nYou tapped ${fmt(block.location)}, not the plan's start.`)
      .button("Open my plan").button(`Plan a new dig here`).button("Cancel"));
    if (r?.selection === 0) return planActions(p);
    if (r?.selection !== 1) return;
  }
  return newPlan(p, block, plan);
}

/**
 * Plans a new quarry starting at this block, then its size. (The branch-mine plan code below is
 * unused since Nov 15; the Miner's prospecting will plan its own tunnels.)
 * @param {import("@minecraft/server").Player} p @param {import("@minecraft/server").Block} block @param {Plan | undefined} plan
 */
async function newPlan(p, block, plan) {
  const facing = facingFromYaw(p.getRotation().y);
  const linked = linkedWorker(p);
  if (linked && roleOf(linked) === "Miner") {
    if (block.dimension.id !== "minecraft:overworld") {
      tell(p, "Prospecting stays in the overworld for now.");
      return;
    }
    /** @type {Plan} */
    const mine = {
      mode: "prospect", dim: block.dimension.id, anchor: { ...block.location }, facing, confirmed: false,
      length: 16, width: 16, depth: 16, trunk: DEFAULTS.trunk, branch: DEFAULTS.branch, spacing: DEFAULTS.spacing, targetY: DEFAULTS.targetY,
      range: CLAIM_RADIUS, mineName: "", quotaOre: "", quota: 0,
    };
    savePlan(p, mine);
    tell(p, `${planText(mine)}\nCheck the outline, then tap with the stake again to name it, set a quota, or confirm.`);
    return;
  }
  const base = plan ?? { mode: "quarry", length: 16, width: 16, depth: 16, trunk: DEFAULTS.trunk, trunkWidth: DEFAULTS.width, branch: DEFAULTS.branch, spacing: DEFAULTS.spacing, targetY: DEFAULTS.targetY, clearAbove: true };
  /** @type {Plan} */
  const next = { ...base, dim: block.dimension.id, anchor: { ...block.location }, facing, confirmed: false };
  if (next.targetY > next.anchor.y + 1) next.targetY = next.anchor.y + 1;
  const f = new ActionFormData().title("Plan a quarry here")
    .body(`Start: the block at ${fmt(block.location)}, heading ${facing} (the way you're facing).\n\nThis is the quarry's top corner. It digs forward and to your right, and leaves a staircase down the walls. A Digger digs it.`)
    .button("Plan a quarry").button("Cancel").button("Put the stake away");
  const r = await show(p, f);
  if (r?.selection === 2) return putAway(p);
  if (!r || r.selection !== 0) return;
  next.mode = "quarry";
  if (!(await sizeForm(p, next))) return;
  savePlan(p, next);
  tell(p, `${planText(getPlan(p) ?? next)}\nCheck the white outline, then tap any block (or the air) with the stake to confirm or change it.`);
}

/**
 * Stake used in the air: the remote. The linked worker's orders (from any distance, while its
 * area is loaded), your dig plan, switching to another worker, putting the stake away, the guide.
 * @param {import("@minecraft/server").Player} p
 */
export async function stakeUse(p) {
  const e = linkedWorker(p);
  const name = linkedName(p);
  const plan = getPlan(p);
  let body = e ? `Linked to §b${meta(e).name}§r: ${statusText(e).split("\n")[0]}` : name ? `Linked to ${name}, but it's too far away right now (its area isn't loaded).` : "Not linked to a worker yet: tap one of your workers with the stake.";
  body += "\n\nWith the stake: tap a bed to set the linked worker's home, a chest for its home chest or a drop-off, the ground to plan a dig.";
  /** @type {[string, () => any][]} */
  const b = [];
  if (e) b.push([`${meta(e).name}'s orders`, () => openMenu(p, e)]);
  if (plan) b.push([plan.confirmed ? "Your dig plan (confirmed)" : "Your dig plan", () => planActions(p)]);
  b.push([e || name ? "Link another worker" : "Link a worker", () => pickWorker(p)]);
  b.push(["Put the stake away", () => putAway(p)]);
  b.push(["How to use the stake", () => openGuide(p, PAGES.findIndex((pg) => pg.title.startsWith("The Survey Stake")))]);
  const f = new ActionFormData().title("Survey Stake").body(body);
  for (const [label] of b) f.button(label);
  const r = await show(p, f);
  if (r?.selection !== undefined) await b[r.selection]?.[1]();
}

/** Pick a worker to link from the ones you can give orders to (loaded ones). @param {import("@minecraft/server").Player} p */
async function pickWorker(p) {
  const by = whoIs(p);
  const mine = loadedWorkers().filter((w) => canCommand(by, meta(w)));
  if (!mine.length) return tell(p, "None of your workers are nearby enough to link from here. Tap one with the stake to link it.");
  const f = new ActionFormData().title("Link a worker").body("The stake then works as a remote for that worker.");
  for (const w of mine) f.button(`${meta(w).name}\n§8${statusText(w).split("\n")[0].slice(0, 48)}`);
  const r = await show(p, f);
  if (r?.selection !== undefined && mine[r.selection]) linkWorker(p, mine[r.selection]);
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
  return "Survey Stake added. Use it on the ground where a dig should start (facing the way it should go) to plan a quarry; use it on a chest to mark the drop-off.";
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

/**
 * The plan's menu: confirm (and start it with the linked worker), resize, turn, switch, clear.
 * Tapped on a block other than its start, it also offers to plan a new dig there.
 * @param {import("@minecraft/server").Player} p @param {import("@minecraft/server").Block} [tapped]
 */
async function planActions(p, tapped) {
  const plan = getPlan(p);
  if (!plan) return;
  const facing = facingFromYaw(p.getRotation().y);
  const elsewhere = tapped && !sameV(plan.anchor, tapped.location) ? tapped : undefined;
  const f = new ActionFormData().title(plan.confirmed ? "Plan (confirmed)" : "Plan (not confirmed yet)").body(planText(plan))
    .button(plan.confirmed ? "Keep it" : "Confirm").button(plan.mode === "prospect" ? "Name and quota" : "Change the size").button(`Point it ${facing}`).button("Clear the plan").button("Put the stake away");
  if (elsewhere) f.button(`Plan a new quarry at ${fmt(elsewhere.location)} instead`);
  const r = await show(p, f);
  if (!r || r.selection === undefined) return;
  const next = { ...plan, confirmed: false };
  switch (r.selection) {
    case 5:
      if (elsewhere) return newPlan(p, elsewhere, plan);
      return;
    case 0: {
      savePlan(p, { ...plan, confirmed: true });
      const e = linkedWorker(p);
      if (plan.mode === "prospect") {
        if (e && roleOf(e) !== "Miner") {
          tell(p, `Plan confirmed. ${roleRefusal(meta(e).name, roleOf(e), "prospect")}`);
          return;
        }
        if (e) {
          const m = meta(e);
          const go = await show(p, new ActionFormData().title("Plan confirmed").body(`Start this mine with ${m.name} now?`).button(`Start it with ${m.name}`).button("Not yet"));
          if (go?.selection === 0) {
            const o = planOrder(/** @type {Plan} */ (getPlan(p)));
            say(p, dispatch(whoIs(p), { worker: m.name, job: o.job, params: o.params }));
          }
        } else tell(p, "Plan confirmed. Link a Miner with the stake, then confirm again to start it.");
        return;
      }
      if (e && roleOf(e) !== "Digger") {
        tell(p, `Plan confirmed. ${roleRefusal(meta(e).name, roleOf(e), "quarry")}`);
        return;
      }
      if (e) {
        const m = meta(e);
        const go = await show(p, new ActionFormData().title("Plan confirmed").body(`Start this quarry with ${m.name} now?`).button(`Start it with ${m.name}`).button("Not yet"));
        if (go?.selection === 0) return digForm(p, whoIs(p), e, plan.mode);
      }
      tell(p, `Plan confirmed. ${e ? `Tap the air with the stake for ${meta(e).name}'s orders` : "Crouch and use a Digger"}, then pick Quarry.`);
      return;
    }
    case 1:
      if (!(await sizeForm(p, next))) return;
      break;
    case 2:
      next.facing = facing;
      break;
    case 3:
      savePlan(p, undefined);
      tell(p, "Plan cleared (just the outline). A worker already digging it keeps going: Stop it from its menu, or tap the air with the stake.");
      return;
    case 4:
      putAway(p);
      return;
  }
  savePlan(p, next);
  tell(p, `${planText(getPlan(p) ?? next)}\nCheck the outline, then tap with the stake again to confirm.`);
}

/** Asks for the sizes of a plan; edits it in place. @param {import("@minecraft/server").Player} p @param {Plan} plan */
async function sizeForm(p, plan) {
  if (plan.mode === "prospect") {
    const ores = ["No quota", ...QUOTA_ORES.map((id) => ORE_LABEL[/** @type {keyof typeof ORE_LABEL} */ (id)] ?? id)];
    const idx = Math.max(0, QUOTA_ORES.indexOf(plan.quotaOre ?? ""));
    const f = new ModalFormData().title("Mine name")
      .textField("Name on the sign (blank for an automatic name)", "Digby's Mine No. 1", { defaultValue: plan.mineName ?? "" })
      .dropdown("Stop after one ore", ores, { defaultValueIndex: plan.quotaOre ? idx + 1 : 0 })
      .textField("How many of that ore", "10", { defaultValue: plan.quota ? String(plan.quota) : "" })
      .submitButton("Show outline");
    const r = await show(p, f);
    if (!r?.formValues) return false;
    plan.mineName = String(r.formValues[0] ?? "").trim();
    const oreIdx = Number(r.formValues[1]);
    plan.quotaOre = oreIdx > 0 ? QUOTA_ORES[oreIdx - 1] : "";
    const n = Math.round(Number(r.formValues[2]));
    plan.quota = plan.quotaOre && Number.isFinite(n) && n > 0 ? n : 0;
    plan.range = CLAIM_RADIUS;
    return true;
  }
  if (plan.mode === "quarry") {
    const f = new ModalFormData().title("Quarry size")
      .slider("Length (forward)", 2, MAX_SIDE, { defaultValue: clamp(plan.length, 2, MAX_SIDE), valueStep: 1 })
      .slider("Width (to the right)", 2, MAX_SIDE, { defaultValue: clamp(plan.width, 2, MAX_SIDE), valueStep: 1 })
      .slider(depthLabel(plan.anchor.y), 1, MAX_SIDE, { defaultValue: clamp(plan.depth, 1, MAX_SIDE), valueStep: 1 })
      .toggle("Clear above first (hills, trees: nothing left floating)", { defaultValue: plan.clearAbove ?? true })
      .submitButton("Show outline");
    const r = await show(p, f);
    if (!r?.formValues) return false;
    const [l, w, d, ca] = r.formValues;
    [plan.length, plan.width, plan.depth] = [l, w, d].map(Number);
    plan.clearAbove = !!ca;
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

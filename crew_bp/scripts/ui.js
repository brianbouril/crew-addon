// The worker menu: crouch and use a worker. Players who can give it orders see the orders;
// the owner (or an operator) also sees name, role, tools and who can give orders.
// Everyone else sees status only.
import { CommandPermissionLevel, world } from "@minecraft/server";
import { ActionFormData, ModalFormData } from "@minecraft/server-ui";
import { KEEP, PACE } from "./catalog.js";
import { dispatch } from "./orders.js";
import { getPlan, planOrder, planText, updatePlan } from "./marker.js";
import { isWorking, statusText, stopJob } from "./runner.js";
import { canUsePlace, getPlaces } from "./store.js";
import { KIT_SLOTS, ROLE_LIST, addToKit, kit, toolInfo } from "./tools.js";
import { fmt, setJSON, tell } from "./util.js";
import { canCommand, canManage, dismissWorker, meta, renameWorker, roleOf, setRole, updateTag } from "./workers.js";
import { show } from "./forms.js";
import { MAX_SIDE } from "./catalog.js";

/**
 * @typedef {import("@minecraft/server").Player} Player
 * @typedef {import("@minecraft/server").Entity} Entity
 * @typedef {import("./store.js").Commander} Commander
 */

/** @param {Player} p @returns {Commander} */
const whoIs = (p) => ({ id: p.id, name: p.name, isOp: p.commandPermissionLevel >= CommandPermissionLevel.GameDirectors });

const KEEP_LABELS = ["Valuables only (ores, gems, raw metals)", "Everything", "Nothing (just dig)"];
const PACE_LABELS = ["Normal (tool speed)", "Fast (5x)"];

/**
 * Builds and shows an action form whose buttons each run a function.
 * @param {Player} p @param {string} title @param {string} body @param {[string, () => any][]} buttons
 */
async function menu(p, title, body, buttons) {
  const f = new ActionFormData().title(title).body(body);
  for (const [label] of buttons) f.button(label);
  const r = await show(p, f);
  if (r?.selection !== undefined) await buttons[r.selection]?.[1]();
}

/** @param {Player} p @param {Entity} e */
export async function openMenu(p, e) {
  if (!e.isValid) return;
  const by = whoIs(p);
  const m = meta(e);
  const can = canCommand(by, m), manage = canManage(by, m);
  const body = `${roleOf(e)}. Owner: ${m.ownerName}.\n${statusText(e)}`;
  if (!can) return menu(p, m.name, `${body}\n\nOnly ${m.ownerName} and the players they allow can give ${m.name} orders.`, [["Close", () => {}]]);
  /** @type {[string, () => any][]} */
  const b = [];
  if (roleOf(e) === "Miner") {
    b.push(["Quarry", () => digForm(p, by, e, "quarry")]);
    b.push(["Branch mine", () => digForm(p, by, e, "branch")]);
  }
  b.push(["Come here", () => say(p, dispatch(by, { worker: m.name, job: "come", params: {} }))]);
  if (isWorking(e)) b.push(["Stop", () => say(p, dispatch(by, { worker: m.name, job: "stop", params: {} }))]);
  b.push(["Tools", () => toolsMenu(p, by, e)]);
  if (manage) {
    b.push([`Role: ${roleOf(e)}`, () => roleForm(p, e)]);
    b.push(["Name", () => nameForm(p, e)]);
    b.push(["Who can give orders", () => crewMenu(p, e)]);
    b.push(["Dismiss", () => dismissForm(p, e)]);
  }
  b.push(["Close", () => {}]);
  await menu(p, m.name, body, b);
}

/** @param {Player} p @param {{ok: boolean, message: string}} r */
const say = (p, r) => tell(p, r.ok ? r.message : `§c${r.message}`);

/** Deposit choices: the chest marked with the stake, then saved places. @param {Player} p @param {Commander} by @param {string} dim */
function depositChoices(p, by, dim) {
  /** @type {{label: string, value: any}[]} */
  const out = [];
  const d = p.getDynamicProperty("crew:deposit");
  if (d && typeof d === "object") out.push({ label: `Chest you marked at ${fmt(/** @type {any} */ (d))}`, value: [d.x, d.y, d.z] });
  for (const pl of getPlaces()) if (pl.dim === dim && canUsePlace(by, pl)) out.push({ label: `${pl.name}${pl.shared ? " (shared)" : ""}`, value: pl.name });
  return out;
}

/** @param {Player} p @param {Commander} by @param {Entity} e @param {"quarry"|"branch"} mode */
async function digForm(p, by, e, mode) {
  const m = meta(e);
  const plan = getPlan(p);
  const label = mode === "quarry" ? "quarry" : "branch mine";
  if (!plan || plan.mode !== mode || !plan.confirmed) {
    const why = plan && plan.mode === mode ? "Your plan isn't confirmed yet: use the Survey Stake on its start block again and pick Confirm." :
      `No ${label} planned yet. Get a Survey Stake (/crew:stake), use it on the ground block where the ${label} should start while facing the way it should go, pick ${mode === "quarry" ? "Quarry" : "Branch mine"}, check the outline, then use it on the same block again to confirm.`;
    return menu(p, `${m.name}: ${label}`, why, [["OK", () => {}]]);
  }
  if (plan.dim !== e.dimension.id) return menu(p, m.name, `Your plan is in another dimension from ${m.name}.`, [["OK", () => {}]]);
  const deps = depositChoices(p, by, e.dimension.id);
  if (!deps.length) return menu(p, m.name, "Where should it drop things off? Use the Survey Stake on a chest or barrel, or save one with /crew:place \"name\".", [["OK", () => {}]]);

  const f = new ModalFormData().title(`${m.name}: ${label} at ${fmt(plan.anchor)} heading ${plan.facing}`);
  if (mode === "quarry") {
    f.slider("Length (forward)", 2, MAX_SIDE, { defaultValue: plan.length, valueStep: 1 })
      .slider("Width (to the right)", 2, MAX_SIDE, { defaultValue: plan.width, valueStep: 1 })
      .slider("Depth", 1, MAX_SIDE, { defaultValue: plan.depth, valueStep: 1 });
  } else {
    f.slider("Trunk length", 1, MAX_SIDE, { defaultValue: plan.trunk, valueStep: 1 })
      .slider("Branch length (each side)", 0, MAX_SIDE, { defaultValue: plan.branch, valueStep: 1 })
      .slider("Solid blocks between branches", 1, 16, { defaultValue: plan.spacing, valueStep: 1 })
      .textField(`Tunnel floor Y (start is ${plan.anchor.y + 1})`, "-54", { defaultValue: String(plan.targetY) });
  }
  f.dropdown("Drop off at", deps.map((d) => d.label))
    .dropdown("Bring back", KEEP_LABELS, { defaultValueIndex: 0 })
    .dropdown("Pace", PACE_LABELS, { defaultValueIndex: 0 })
    .submitButton("Start");
  const r = await show(p, f);
  if (!r?.formValues) return;
  const v = r.formValues;
  if (mode === "quarry") updatePlan(p, { length: Number(v[0]), width: Number(v[1]), depth: Number(v[2]), confirmed: true });
  else {
    const ty = Math.round(Number(v[3]));
    updatePlan(p, { trunk: Number(v[0]), branch: Number(v[1]), spacing: Number(v[2]), targetY: Number.isFinite(ty) ? ty : plan.targetY, confirmed: true });
  }
  const tail = v.slice(mode === "quarry" ? 3 : 4);
  const now = /** @type {import("./marker.js").Plan} */ (getPlan(p));
  const o = planOrder(now);
  const res = dispatch(by, { worker: m.name, job: o.job, params: { ...o.params, deposit: deps[Number(tail[0])].value, keep: KEEP[Number(tail[1])], pace: PACE[Number(tail[2])] } });
  say(p, res);
  if (res.ok) tell(p, `Plan: ${planText(now)}`);
}

/**
 * Hands the tool in the player's hand to the worker's kit (plain tap, or the Tools menu).
 * Only the owner, allowed players and operators can. Returns true if the tool moved.
 * @param {Player} p @param {Entity} e
 */
export function giveHeldTool(p, e) {
  if (!e.isValid) return false;
  const m = meta(e);
  if (!canCommand(whoIs(p), m)) { tell(p, `§cOnly ${m.ownerName} and the players they allow can give ${m.name} tools.`); return false; }
  const pinv = /** @type {import("@minecraft/server").Container} */ (p.getComponent("minecraft:inventory")?.container);
  const winv = /** @type {import("@minecraft/server").Container} */ (e.getComponent("minecraft:inventory")?.container);
  const cur = pinv?.getItem(p.selectedSlotIndex);
  const info = toolInfo(cur);
  if (!cur || !info || !winv) { tell(p, "§cHold the tool you want to give."); return false; }
  const r = addToKit(winv, cur);
  if (!r.ok) { tell(p, `§c${m.name}'s kit is full (${KIT_SLOTS} tools). Crouch and tap to take one back first.`); return false; }
  pinv.setItem(p.selectedSlotIndex, undefined);
  if (r.spill) e.dimension.spawnItem(r.spill, e.location);
  updateTag(e);
  tell(p, `${m.name} took the ${info.label}. Tools: ${kit(winv).map((t) => t.info.label).join(", ")}.`);
  return true;
}

/** @param {Player} p @param {Commander} by @param {Entity} e */
async function toolsMenu(p, by, e) {
  const m = meta(e);
  const manage = canManage(by, m);
  const winv = /** @type {import("@minecraft/server").Container} */ (e.getComponent("minecraft:inventory")?.container);
  const k = kit(winv);
  const pinv = /** @type {import("@minecraft/server").Container} */ (p.getComponent("minecraft:inventory")?.container);
  const held = pinv.getItem(p.selectedSlotIndex);
  const lines = k.length ? k.map((t) => `- ${t.info.label}: ${t.left}/${t.max} uses left`).join("\n") : "No tools. Add one so it can work.";
  /** @type {[string, () => any][]} */
  const b = [];
  if (toolInfo(held) && k.length < KIT_SLOTS) {
    b.push([`Add the ${toolInfo(held)?.label} in my hand`, () => giveHeldTool(p, e)]);
  }
  if (manage) {
    for (const t of k) {
      b.push([`Take back the ${t.info.label} (${t.left}/${t.max})`, () => {
        const item = winv.getItem(t.slot);
        if (!item || !toolInfo(item)) return;
        winv.setItem(t.slot, undefined);
        const left = pinv.addItem(item);
        if (left) p.dimension.spawnItem(left, p.location);
        updateTag(e);
        tell(p, `Took the ${t.info.label} back from ${m.name}.`);
      }]);
    }
  }
  b.push(["Back", () => openMenu(p, e)]);
  const how = toolInfo(held) ? "" : "\n\nTo add a tool, hold it and open this menu again.";
  await menu(p, `${m.name}: tools`, `Tool kit (up to ${KIT_SLOTS}). For each block it uses the right kind of tool at the lowest tier that can harvest it, and switches when one breaks.\n${lines}${how}`, b);
}

/** @param {Player} p @param {Entity} e */
async function roleForm(p, e) {
  const m = meta(e);
  if (isWorking(e)) return menu(p, m.name, `Stop ${m.name} before changing its role.`, [["OK", () => {}]]);
  const f = new ModalFormData().title(`${m.name}: role`)
    .dropdown("Role (only Miner has jobs so far; the others are coming)", ROLE_LIST, { defaultValueIndex: Math.max(0, ROLE_LIST.indexOf(roleOf(e))) })
    .submitButton("Save");
  const r = await show(p, f);
  if (!r?.formValues) return;
  const role = ROLE_LIST[Number(r.formValues[0])];
  setRole(e, role);
  tell(p, `${m.name} is now a ${role}.${role === "Miner" ? "" : " It has no jobs yet in this version."}`);
}

/** @param {Player} p @param {Entity} e */
async function nameForm(p, e) {
  const m = meta(e);
  const f = new ModalFormData().title(`Rename ${m.name}`).textField("Name", m.name, { defaultValue: m.name }).submitButton("Save");
  const r = await show(p, f);
  const name = String(r?.formValues?.[0] ?? "").trim();
  if (!name || name === m.name) return;
  tell(p, `Renamed to ${renameWorker(e, name)}.`);
}

/** @param {Player} p @param {Entity} e */
async function crewMenu(p, e) {
  const m = meta(e);
  /** @type {[string, () => any][]} */
  const b = [["Allow a player", async () => {
    const others = world.getAllPlayers().filter((pl) => pl.id !== m.ownerId && !m.crew.some((c) => c.id === pl.id || c.name === pl.name));
    if (!others.length) return menu(p, m.name, "Nobody else who isn't already allowed is online. You can also use /crew:allow later.", [["OK", () => crewMenu(p, e)]]);
    const f = new ModalFormData().title(`Who else can give ${m.name} orders?`).dropdown("Player", others.map((pl) => pl.name)).submitButton("Allow");
    const r = await show(p, f);
    if (!r?.formValues) return;
    const pl = others[Number(r.formValues[0])];
    const crew = meta(e).crew;
    crew.push({ id: pl.id, name: pl.name });
    setJSON(e, "crew:crew", crew);
    tell(p, `${pl.name} can now give ${m.name} orders.`);
    tell(pl, `${p.name} let you give orders to ${m.name}.`);
  }]];
  for (const c of m.crew) {
    b.push([`Remove ${c.name}`, () => {
      setJSON(e, "crew:crew", meta(e).crew.filter((x) => !(x.id === c.id && x.name === c.name)));
      tell(p, `${c.name} can no longer give ${m.name} orders.`);
    }]);
  }
  b.push(["Back", () => openMenu(p, e)]);
  const list = m.crew.length ? m.crew.map((c) => c.name).join(", ") : "nobody else yet";
  await menu(p, `${m.name}: who can give orders`, `Owner: ${m.ownerName}.\nAlso allowed: ${list}.\nServer operators can always give orders.`, b);
}

/** @param {Player} p @param {Entity} e */
async function dismissForm(p, e) {
  const m = meta(e);
  await menu(p, `Dismiss ${m.name}?`, `${m.name} stops work and drops its tools, everything it carries, and its barrel and pumpkin.`, [
    ["Dismiss", () => {
      stopJob(e, undefined);
      dismissWorker(e);
      tell(p, `${m.name} dismissed.`);
    }],
    ["Cancel", () => {}],
  ]);
}

// The worker menu: crouch and use a worker. Players who can give it orders see the orders;
// the owner (or an operator) also sees name, role, tools and who can give orders.
// Everyone else sees status only.
import { CommandPermissionLevel, world } from "@minecraft/server";
import { ActionFormData, ModalFormData } from "@minecraft/server-ui";
import { KEEP, PACE } from "./catalog.js";
import { dispatch } from "./orders.js";
import { getPlan, giveStake, hasStake, planOrder, planText, updatePlan } from "./marker.js";
import { countItem, isWorking, pausedJob, statusText, stopJob } from "./runner.js";
import { canUsePlace, getPlaces } from "./store.js";
import { KIT_SLOTS, ROLE_LIST, addToKit, kit, stash, toolInfo } from "./tools.js";
import { TORCH } from "./blocks.js";
import { TORCH_EVERY } from "./plans.js";
import { fmt, getJSON, setJSON, tell } from "./util.js";
import { bedNear, bedSafety, energy, energyWord, getHome, isSupply, sameBed } from "./life.js";
import { canCommand, canManage, dismissWorker, meta, renameWorker, roleOf, setRole, updateTag } from "./workers.js";
import { show } from "./forms.js";
import { openGuide } from "./guide.js";
import { DEFAULTS, MAX_SIDE, MAX_TRUNK_WIDTH } from "./catalog.js";

/**
 * @typedef {import("@minecraft/server").Player} Player
 * @typedef {import("@minecraft/server").Entity} Entity
 * @typedef {import("./store.js").Commander} Commander
 */

/** @param {Player} p @returns {Commander} */
export const whoIs = (p) => ({ id: p.id, name: p.name, isOp: p.commandPermissionLevel >= CommandPermissionLevel.GameDirectors });

const KEEP_LABELS = ["Everything it digs", "Valuables only (ores, gems, raw metals)", "Nothing (just dig)"]; // same order as KEEP
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
  const body = `${roleOf(e)}. Owner: ${m.ownerName}.\n${statusText(e)}${carriedLine(e)}`;
  if (!can) return menu(p, m.name, `${body}\n\nOnly ${m.ownerName} and the players they allow can give ${m.name} orders.`, [["How workers work", () => openGuide(p)], ["Close", () => {}]]);
  /** @type {[string, () => any][]} */
  const b = [];
  const paused = pausedJob(e);
  const digging = /quarry|branch_mine/.test(String(getJSON(e, "crew:job", undefined)?.type));
  if (roleOf(e) === "Miner" && paused && !digging) {
    b.push([`Continue the ${paused.name} (${paused.pct}% done)`, () => say(p, dispatch(by, { worker: m.name, job: "resume", params: {} }))]);
  }
  if (roleOf(e) === "Miner") {
    b.push(["Quarry", () => digForm(p, by, e, "quarry")]);
    b.push(["Branch mine", () => digForm(p, by, e, "branch")]);
    if (!hasStake(p)) b.push(["Get a Survey Stake", () => tell(p, giveStake(p))]);
  }
  b.push(["Come here", () => say(p, dispatch(by, { worker: m.name, job: "come", params: {} }))]);
  if (isWorking(e)) b.push(["Stop", () => stopMenu(p, by, e)]);
  const n = carried(e).reduce((a, x) => a + x.item.amount, 0);
  if (n > 0) {
    b.push([`Take what it carries (${n})`, () => takeCarried(p, e)]);
    b.push(["Drop off at a chest", () => dropOff(p, by, e)]);
  }
  b.push([getHome(e) ? "Home" : "Home: set one", () => homeMenu(p, by, e)]);
  b.push(["Tools", () => toolsMenu(p, by, e)]);
  if (manage) {
    b.push([`Role: ${roleOf(e)}`, () => roleForm(p, e)]);
    b.push(["Name", () => nameForm(p, e)]);
    b.push(["Who can give orders", () => crewMenu(p, e)]);
    b.push(["Dismiss", () => dismissForm(p, e)]);
  }
  b.push(["How workers work", () => openGuide(p)]);
  b.push(["Close", () => {}]);
  await menu(p, m.name, body, b);
}

/** @param {Player} p @param {{ok: boolean, message: string}} r */
const say = (p, r) => tell(p, r.ok ? r.message : `§c${r.message}`);

/**
 * Home: set it to the bed the player is standing by (the nearest chest within 8 becomes the home
 * chest), or clear it. Shows where it is and whether the bed is safe.
 * @param {Player} p @param {Commander} by @param {Entity} e
 */
async function homeMenu(p, by, e) {
  const m = meta(e);
  const home = getHome(e);
  const near = bedNear(p.dimension, p.location, 3);
  let body = `${m.name} works by day and sleeps at night. With a home it walks back at dusk, drops off what it dug in its home chest, sleeps in its bed, and in the morning takes torches, food and tools from the chest and picks its job back up. Without one it sleeps wherever it is, and doesn't rest as well.`;
  if (home) {
    const s = bedSafety(e.dimension, home);
    body += `\n\nHome: the bed at ${fmt(home.head)}${home.chest ? `, home chest at ${fmt(home.chest)}` : ", no home chest"}. ${s.safe ? "The bed is safe." : `The bed isn't safe: ${s.why}.`}`;
  }
  body += `\n\nEnergy: ${Math.round(energy(e))}% (${energyWord(energy(e))}).`;
  /** @type {[string, () => any][]} */
  const b = [];
  if (near) b.push([home && sameBed(home, near) ? "This bed is already its home" : "Make the bed next to me its home", () => say(p, dispatch(by, { worker: m.name, job: "set_home", params: { bed: near.head } }))]);
  else body += "\n\nTo set its home, stand next to a bed and open this menu again. Or, from any distance: tap the worker with your Survey Stake to link it, then tap the bed with the stake.";
  if (home) b.push(["Forget its home", () => say(p, dispatch(by, { worker: m.name, job: "clear_home", params: {} }))]);
  b.push(["Back", () => openMenu(p, e)]);
  await menu(p, `${m.name}: home`, body, b);
}

/** What the worker carries: everything but its tool kit and supplies (torches, food). @param {Entity} e */
function carried(e) {
  const inv = /** @type {import("@minecraft/server").Container} */ (e.getComponent("minecraft:inventory")?.container);
  /** @type {{slot: number, item: import("@minecraft/server").ItemStack}[]} */
  const out = [];
  if (!inv) return out;
  for (let i = 0; i < inv.size; i++) {
    const item = inv.getItem(i);
    if (!item || (i < KIT_SLOTS && toolInfo(item)) || isSupply(item.typeId)) continue;
    out.push({ slot: i, item });
  }
  return out;
}

/** What it carries, by item, most first: "Carrying: 64 cobblestone, 12 raw iron, ...". @param {Entity} e */
function carriedLine(e) {
  /** @type {Record<string, number>} */
  const n = {};
  for (const { item } of carried(e)) n[item.typeId] = (n[item.typeId] ?? 0) + item.amount;
  const list = Object.entries(n).sort((a, b) => b[1] - a[1]);
  if (!list.length) return "\nCarrying: nothing.";
  const words = list.slice(0, 6).map(([id, k]) => `${k} ${id.replace("minecraft:", "").replace(/_/g, " ")}`);
  return `\nCarrying: ${words.join(", ")}${list.length > 6 ? `, and ${list.length - 6} more kinds` : ""}.`;
}

/** Hands everything the worker carries to the player (what doesn't fit drops at their feet). @param {Player} p @param {Entity} e */
function takeCarried(p, e) {
  if (!e.isValid) return;
  const inv = /** @type {import("@minecraft/server").Container} */ (e.getComponent("minecraft:inventory")?.container);
  const pinv = /** @type {import("@minecraft/server").Container} */ (p.getComponent("minecraft:inventory")?.container);
  let n = 0, dropped = 0;
  for (const { slot, item } of carried(e)) {
    inv.setItem(slot, undefined);
    n += item.amount;
    const left = pinv.addItem(item);
    if (left) {
      dropped += left.amount;
      p.dimension.spawnItem(left, p.location);
    }
  }
  tell(p, `Took ${n} items from ${meta(e).name}.${dropped ? ` ${dropped} didn't fit and are at your feet.` : ""}`);
}

/** Drop-off: its last chest if it has one, otherwise pick one. @param {Player} p @param {Commander} by @param {Entity} e */
async function dropOff(p, by, e) {
  const m = meta(e);
  const last = e.getDynamicProperty("crew:lastDeposit") ?? getHome(e)?.chest; // with no last chest, the home chest
  const deps = depositChoices(p, by, e.dimension.id);
  if (!last && !deps.length) return menu(p, m.name, "Where should it drop things off? Use the Survey Stake on a chest or barrel, or save one with /crew:place \"name\".", [["OK", () => {}]]);
  if (last && !deps.length) return say(p, dispatch(by, { worker: m.name, job: "drop_off", params: {} }));
  const labels = [...(last ? [e.getDynamicProperty("crew:lastDeposit") ? "Where it dropped off last" : "Its home chest"] : []), ...deps.map((d) => d.label)];
  const f = new ModalFormData().title(`${m.name}: drop off`).dropdown("Take everything it carries to", labels).submitButton("Go");
  const r = await show(p, f);
  if (!r?.formValues) return;
  const i = Number(r.formValues[0]) - (last ? 1 : 0);
  say(p, dispatch(by, { worker: m.name, job: "drop_off", params: i < 0 ? {} : { deposit: deps[i].value } }));
}

/** @param {Player} p @param {Commander} by @param {Entity} e */
function stopMenu(p, by, e) {
  const m = meta(e);
  return menu(p, `Stop ${m.name}?`, "It saves its progress either way.", [
    ["Stop here", () => say(p, dispatch(by, { worker: m.name, job: "stop", params: {} }))],
    ["Stop and drop off what it carries", () => {
      if (e.getDynamicProperty("crew:lastDeposit") || getHome(e)?.chest) return say(p, dispatch(by, { worker: m.name, job: "drop_off", params: {} }));
      say(p, dispatch(by, { worker: m.name, job: "stop", params: {} }));
      return dropOff(p, by, e);
    }],
    ["Cancel", () => {}],
  ]);
}

/**
 * Hands the torches in the player's hand to the worker; it places them as it digs.
 * @param {Player} p @param {Entity} e
 */
export function giveHeldTorches(p, e) {
  if (!e.isValid) return;
  const m = meta(e);
  if (!canCommand(whoIs(p), m)) { tell(p, `§cOnly ${m.ownerName} and the players they allow can give ${m.name} things.`); return; }
  const pinv = /** @type {import("@minecraft/server").Container} */ (p.getComponent("minecraft:inventory")?.container);
  const winv = /** @type {import("@minecraft/server").Container} */ (e.getComponent("minecraft:inventory")?.container);
  const cur = pinv?.getItem(p.selectedSlotIndex);
  if (!cur || cur.typeId !== TORCH || !winv) return;
  const left = stash(winv, cur);
  pinv.setItem(p.selectedSlotIndex, left);
  const took = cur.amount - (left?.amount ?? 0);
  if (!took) { tell(p, `§c${m.name} has no room for torches.`); return; }
  tell(p, `${m.name} took ${took} torches (${countItem(winv, TORCH)} now). It places one every ${TORCH_EVERY} blocks of tunnel (closer in wide trunks), so nothing can spawn there.`);
}

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
export async function digForm(p, by, e, mode) {
  const m = meta(e);
  const plan = getPlan(p);
  const label = mode === "quarry" ? "quarry" : "branch mine";
  if (!plan || plan.mode !== mode || !plan.confirmed) {
    const why = plan && plan.mode === mode ? "Your plan isn't confirmed yet: use the Survey Stake on its start block again and pick Confirm." :
      `No ${label} planned yet. With a Survey Stake, use it on the ground block where the ${label} should start while facing the way it should go, pick ${mode === "quarry" ? "Quarry" : "Branch mine"}, check the outline, then use it on the same block again to confirm.`;
    /** @type {[string, () => any][]} */
    const buttons = hasStake(p) ? [["OK", () => {}]] : [["Give me a Survey Stake", () => tell(p, giveStake(p))], ["OK", () => {}]];
    return menu(p, `${m.name}: ${label}`, why, buttons);
  }
  if (plan.dim !== e.dimension.id) return menu(p, m.name, `Your plan is in another dimension from ${m.name}.`, [["OK", () => {}]]);
  const deps = depositChoices(p, by, e.dimension.id);
  const home = getHome(e);
  if (home?.chest && home.dim === e.dimension.id) deps.unshift({ label: `Its home chest at ${fmt(home.chest)}`, value: [home.chest.x, home.chest.y, home.chest.z] });
  if (!deps.length) return menu(p, m.name, "Where should it drop things off? Give it a home (Home in its menu), use the Survey Stake on a chest or barrel, or save one with /crew:place \"name\".", [["OK", () => {}]]);

  const f = new ModalFormData().title(`${m.name}: ${label} at ${fmt(plan.anchor)} heading ${plan.facing}`);
  if (mode === "quarry") {
    f.slider("Length (forward)", 2, MAX_SIDE, { defaultValue: plan.length, valueStep: 1 })
      .slider("Width (to the right)", 2, MAX_SIDE, { defaultValue: plan.width, valueStep: 1 })
      .slider("Depth", 1, MAX_SIDE, { defaultValue: plan.depth, valueStep: 1 });
  } else {
    f.slider("Trunk length", 1, MAX_SIDE, { defaultValue: plan.trunk, valueStep: 1 })
      .slider("Trunk width (extra lanes to the right)", 1, MAX_TRUNK_WIDTH, { defaultValue: plan.trunkWidth ?? DEFAULTS.width, valueStep: 1 })
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
    const ty = Math.round(Number(v[4]));
    updatePlan(p, { trunk: Number(v[0]), trunkWidth: Number(v[1]), branch: Number(v[2]), spacing: Number(v[3]), targetY: Number.isFinite(ty) ? ty : plan.targetY, confirmed: true });
  }
  const tail = v.slice(mode === "quarry" ? 3 : 5);
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

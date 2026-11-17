// The worker menu: crouch and use a worker. Players who can give it orders see the orders;
// the owner (or an operator) also sees name, role, tools and who can give orders.
// Everyone else sees status only.
import { CommandPermissionLevel, world } from "@minecraft/server";
import { ActionFormData, ModalFormData } from "@minecraft/server-ui";
import { KEEP } from "./catalog.js";
import { dispatch } from "./orders.js";
import { depthLabel, getPlan, giveStake, hasStake, planOrder, planText, updatePlan } from "./marker.js";
import { countItem, isResting, isWorking, pausedJob, statusText, stopJob, wakeUp } from "./runner.js";
import { canUsePlace, getPlaces } from "./store.js";
import { KIT_SLOTS, ROLE_LIST, addToKit, kit, setToolPref, stash, toolInfo, toolPref } from "./tools.js";
import { TORCH } from "./blocks.js";
import { TORCH_EVERY } from "./plans.js";
import { fmt, getJSON, setJSON, tell } from "./util.js";
import { bedNear, bedSafety, energy, energyWord, getHome, isSupply, sameBed } from "./life.js";
import { canCommand, canManage, dismissWorker, loadedWorkers, meta, renameWorker, roleOf, setRole, updateTag } from "./workers.js";
import { addMember, bellRefusal, bellTap, foundSettlement, getCap, getSeen, moveBell, packBell, queueOrder, removeMember, renameSettlement, rosterLine, rosterOf, setCap, settlementOf } from "./settlement.js";
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

/** What each role does, shown after its name in the menu. @type {Record<string, string>} */
const ROLE_JOBS = {
  Digger: " (quarries)",
  Miner: " (prospecting for ore is coming in the next version; it has no dig jobs until then)",
  Woodcutter: " (no jobs yet)",
  Farmer: " (no jobs yet)",
};

/** @param {Player} p @param {Entity} e */
export async function openMenu(p, e) {
  if (!e.isValid) return;
  const by = whoIs(p);
  const m = meta(e);
  const can = canCommand(by, m), manage = canManage(by, m);
  const body = `${roleOf(e)}${ROLE_JOBS[roleOf(e)] ?? ""}. Owner: ${m.ownerName}.\n${statusText(e)}${carriedLine(e)}`;
  if (!can) return menu(p, m.name, `${body}\n\nOnly ${m.ownerName} and the players they allow can give ${m.name} orders.`, [["How workers work", () => openGuide(p)], ["Close", () => {}]]);
  /** @type {[string, () => any][]} */
  const b = [];
  // asleep (or heading to bed): opening the menu doesn't wake it; Wake up does, and so does an order
  const resting = isResting(e);
  if (resting) b.push(["Wake up", () => tell(p, wakeUp(e) ? `${m.name} is getting up.` : `${m.name} is already up.`)]);
  const paused = pausedJob(e);
  const digging = /quarry|branch_mine/.test(String(getJSON(e, "crew:job", undefined)?.type));
  if (paused && !digging) {
    b.push([`Continue the ${paused.name} (${paused.pct}% done)`, () => say(p, dispatch(by, { worker: m.name, job: "resume", params: {} }))]);
  }
  // decision 32: each role offers only its own jobs. The Miner's (prospecting) come in v0.6.
  if (roleOf(e) === "Digger") {
    b.push(["Quarry", () => digForm(p, by, e, "quarry")]);
    if (!hasStake(p)) b.push(["Get a Survey Stake", () => tell(p, giveStake(p))]);
  }
  b.push(["Come here", () => say(p, dispatch(by, { worker: m.name, job: "come", params: {} }))]);
  if (isWorking(e) && !resting) b.push(["Stop", () => stopMenu(p, by, e)]);
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
  if (!last && !deps.length) return menu(p, m.name, "Where should it drop things off? Use the Survey Stake on a chest or barrel, or save one with /crew:setplace \"name\".", [["OK", () => {}]]);
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
    if (plan && plan.mode === mode) {
      // planned but not confirmed: confirm it right here instead of sending them back to the stake
      return menu(p, `${m.name}: ${label}`, `${planText(plan)}\n\nThis plan isn't confirmed yet. Did you check its outline?`,
        [["Confirm it and go on", () => { updatePlan(p, { confirmed: true }); return digForm(p, by, e, mode); }], ["Not yet", () => {}]]);
    }
    const why = `No ${label} planned yet. With a Survey Stake, tap the ground block where the ${label} should start while facing the way it should go, pick ${mode === "quarry" ? "Plan a quarry" : "Branch mine"}, check the outline, then tap with the stake again and pick Confirm.`;
    /** @type {[string, () => any][]} */
    const buttons = hasStake(p) ? [["OK", () => {}]] : [["Give me a Survey Stake", () => tell(p, giveStake(p))], ["OK", () => {}]];
    return menu(p, `${m.name}: ${label}`, why, buttons);
  }
  if (plan.dim !== e.dimension.id) return menu(p, m.name, `Your plan is in another dimension from ${m.name}.`, [["OK", () => {}]]);
  const deps = depositChoices(p, by, e.dimension.id);
  const home = getHome(e);
  if (home?.chest && home.dim === e.dimension.id) deps.unshift({ label: `Its home chest at ${fmt(home.chest)}`, value: [home.chest.x, home.chest.y, home.chest.z] });
  if (!deps.length) return menu(p, m.name, "Where should it drop things off? Give it a home (Home in its menu), use the Survey Stake on a chest or barrel, or save one with /crew:setplace \"name\".", [["OK", () => {}]]);

  const f = new ModalFormData().title(`${m.name}: ${label} at ${fmt(plan.anchor)} heading ${plan.facing}`);
  if (mode === "quarry") {
    f.slider("Length (forward)", 2, MAX_SIDE, { defaultValue: plan.length, valueStep: 1 })
      .slider("Width (to the right)", 2, MAX_SIDE, { defaultValue: plan.width, valueStep: 1 })
      .slider(depthLabel(plan.anchor.y), 1, MAX_SIDE, { defaultValue: plan.depth, valueStep: 1 })
      .toggle("Clear above first (hills, trees: nothing left floating)", { defaultValue: plan.clearAbove ?? true });
  } else {
    f.slider("Trunk length", 1, MAX_SIDE, { defaultValue: plan.trunk, valueStep: 1 })
      .slider("Trunk width (extra lanes to the right)", 1, MAX_TRUNK_WIDTH, { defaultValue: plan.trunkWidth ?? DEFAULTS.width, valueStep: 1 })
      .slider("Branch length (each side)", 0, MAX_SIDE, { defaultValue: plan.branch, valueStep: 1 })
      .slider("Solid blocks between branches", 1, 16, { defaultValue: plan.spacing, valueStep: 1 })
      .textField(`Tunnel floor Y (start is ${plan.anchor.y + 1})`, "-54", { defaultValue: String(plan.targetY) });
  }
  f.dropdown("Drop off at", deps.map((d) => d.label))
    .dropdown("Bring back", KEEP_LABELS, { defaultValueIndex: 0 })
    .submitButton("Start");
  const r = await show(p, f);
  if (!r?.formValues) return;
  const v = r.formValues;
  if (mode === "quarry") updatePlan(p, { length: Number(v[0]), width: Number(v[1]), depth: Number(v[2]), clearAbove: !!v[3], confirmed: true });
  else {
    const ty = Math.round(Number(v[4]));
    updatePlan(p, { trunk: Number(v[0]), trunkWidth: Number(v[1]), branch: Number(v[2]), spacing: Number(v[3]), targetY: Number.isFinite(ty) ? ty : plan.targetY, confirmed: true });
  }
  const tail = v.slice(mode === "quarry" ? 4 : 5);
  const now = /** @type {import("./marker.js").Plan} */ (getPlan(p));
  const o = planOrder(now);
  const res = dispatch(by, { worker: m.name, job: o.job, params: { ...o.params, deposit: deps[Number(tail[0])].value, keep: KEEP[Number(tail[1])] } });
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
  const pref = toolPref(e);
  const lines = (k.length ? k.map((t) => `- ${t.info.label}: ${t.left}/${t.max} uses left`).join("\n") : "No tools. Add one so it can work.") +
    `\n\n${pref === "fastest" ? "§eUses the fastest tool§r: its best tool that can do the job, so it digs quicker but wears good tools out." : "§eSaves its best tools§r: the weakest tool that can do the job, so the good ones last for ore."}`;
  /** @type {[string, () => any][]} */
  const b = [];
  if (toolInfo(held) && k.length < KIT_SLOTS) {
    b.push([`Add the ${toolInfo(held)?.label} in my hand`, () => giveHeldTool(p, e)]);
  }
  b.push([pref === "fastest" ? "Switch to: save my best tools" : "Switch to: use the fastest tool", () => {
    setToolPref(e, pref === "fastest" ? "save" : "fastest");
    tell(p, pref === "fastest" ? `${m.name} will save its best tools for the blocks that need them.` : `${m.name} will use its fastest tool for everything.`);
    return toolsMenu(p, by, e);
  }]);
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
    .dropdown("Role: Digger digs quarries; Miner will prospect for ore (next version); Woodcutter and Farmer are coming", ROLE_LIST, { defaultValueIndex: Math.max(0, ROLE_LIST.indexOf(roleOf(e))) })
    .submitButton("Save");
  const r = await show(p, f);
  if (!r?.formValues) return;
  const role = ROLE_LIST[Number(r.formValues[0])];
  setRole(e, role);
  tell(p, `${m.name} is now a ${role}.${role === "Digger" ? " It digs quarries." : " It has no dig jobs yet in this version."}`);
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

// ---------- the settlement (crouch-tap its bell) ----------
/**
 * Crouch-tapping a bell: found a settlement at your own bell, move or re-hang yours, or open the
 * settlement menu. Other bells just say whose they are.
 * @param {Player} p @param {import("@minecraft/server").Block} block
 */
export async function bellMenu(p, block) {
  const t = bellTap(p, block);
  if (t.kind === "menu" && t.s) return settlementMenu(p, t.s.id);
  if (t.kind === "rehang") return tell(p, moveBell(p, block).message);
  if (t.kind === "move" && t.s) {
    const from = t.s.bell;
    return menu(p, "Move your settlement here?", `${t.s.name}'s bell is at ${from ? fmt(from) : "?"}. Ring it from this bell instead? The old bell becomes an ordinary bell; workers, members and name stay the same.`, [
      ["Move it here", () => say(p, moveBell(p, block))],
      ["Cancel", () => {}],
    ]);
  }
  if (t.kind !== "found") return tell(p, bellRefusal(t));
  const f = new ModalFormData().title("Found a settlement here?")
    .textField("Every worker you build belongs to your settlement, and you can see them all from this bell. Name it:", `${p.name}'s Settlement`, { defaultValue: `${p.name}'s Settlement` })
    .submitButton("Found it");
  const r = await show(p, f);
  if (!r?.formValues) return;
  say(p, foundSettlement(p, block, String(r.formValues[0] ?? "")));
}

/** @param {Player} p @param {string} id  the settlement's id (re-read each time, so the menu is current) */
async function settlementMenu(p, id) {
  const s = settlementOf({ id: p.id, name: p.name });
  if (!s || s.id !== id) return tell(p, "You're no longer part of that settlement.");
  const by = whoIs(p);
  const owner = by.id === s.ownerId;
  const roster = rosterOf(s);
  const members = s.members.length ? s.members.map((m) => m.name).join(", ") : "none yet";
  const body = `Owner: ${s.ownerName}. Members: ${members}.\nWorkers: ${roster.length}. Each player may have up to ${getCap()}.${s.bell ? "" : "\n§eThe bell isn't up: place a bell and crouch-tap it.§r"}`;
  /** @type {[string, () => any][]} */
  const b = [[`Workers (${roster.length})`, () => rosterMenu(p, s.id)]];
  b.push([owner ? "Members" : "Leave the settlement", () => (owner ? membersMenu(p, s.id) : leaveForm(p, s.id))]);
  if (owner) {
    b.push(["Name", () => settlementNameForm(p, s.id)]);
    if (s.bell) b.push(["Move the bell", () => moveBellForm(p, s.id)]);
  }
  if (by.isOp) b.push([`Worker limit: ${getCap()} each`, () => capForm(p, s.id)]);
  b.push(["How workers work", () => openGuide(p)]);
  b.push(["Close", () => {}]);
  await menu(p, s.name, body, b);
}

/** One button per worker: name and role, then what it's doing and where. @param {Player} p @param {string} id */
async function rosterMenu(p, id) {
  const s = settlementOf({ id: p.id, name: p.name });
  if (!s || s.id !== id) return;
  const loaded = loadedWorkers();
  const loadedIds = new Set(loaded.map((e) => e.id));
  const roster = rosterOf(s);
  const now = Date.now();
  /** @type {[string, () => any][]} */
  const b = roster.map((r) => {
    const l = rosterLine(r, { viewer: p, loadedIds, now });
    return /** @type {[string, () => any]} */ ([`${l.title}\n§8${l.line}`, () => {
      const e = loaded.find((x) => x.id === r.id);
      return e ? openMenu(p, e) : farMenu(p, s.id, r);
    }]);
  });
  b.push(["Back", () => settlementMenu(p, s.id)]);
  await menu(p, `${s.name}: workers`, roster.length ? "Tap a worker for its menu." : "No workers yet. Build one: tools in a barrel, a carved pumpkin on top.", b);
}

/**
 * A worker that isn't loaded: what it was last doing, and orders that wait until its area loads.
 * @param {Player} p @param {string} id @param {{id: string, name: string, ownerId: string, ownerName: string}} r
 */
async function farMenu(p, id, r) {
  const by = whoIs(p);
  const seen = getSeen()[r.id];
  const can = canCommand(by, { name: r.name, ownerId: r.ownerId, ownerName: r.ownerName, crew: [] });
  const body = `${r.name} isn't loaded (nobody is near it).${seen ? ` Last seen at ${fmt(seen)}: ${seen.status}.` : ""}${can ? "\nOrders wait until its area is loaded again." : ""}`;
  /** @type {[string, () => any][]} */
  const b = [];
  if (can) {
    for (const [label, job] of [["Stop", "stop"], ["Continue its dig", "resume"], ["Drop off", "drop_off"]]) {
      b.push([label, () => say(p, queueOrder(r.id, by, { worker: r.name, job, params: {} }))]);
    }
  }
  b.push(["Back", () => rosterMenu(p, id)]);
  await menu(p, r.name, body, b);
}

/** @param {Player} p @param {string} id */
async function membersMenu(p, id) {
  const s = settlementOf({ id: p.id, name: p.name });
  if (!s || s.id !== id) return;
  const by = whoIs(p);
  /** @type {[string, () => any][]} */
  const b = [["Add a member", async () => {
    const others = world.getAllPlayers().filter((pl) => !settlementOf({ id: pl.id, name: pl.name }));
    if (!others.length) return menu(p, s.name, "Everyone online already belongs to a settlement.", [["OK", () => membersMenu(p, id)]]);
    const f = new ModalFormData().title(`Add a member to ${s.name}`)
      .dropdown("Members' workers join the settlement, and members can give orders to all its workers.", others.map((pl) => pl.name))
      .submitButton("Add");
    const r = await show(p, f);
    if (!r?.formValues) return;
    const pl = others[Number(r.formValues[0])];
    say(p, addMember(by, s, { id: pl.id, name: pl.name }));
  }]];
  for (const m of s.members) b.push([`Remove ${m.name}`, () => say(p, removeMember(by, s, m.id))]);
  b.push(["Back", () => settlementMenu(p, id)]);
  await menu(p, `${s.name}: members`, `Members: ${s.members.length ? s.members.map((m) => m.name).join(", ") : "none yet"}.\nA member's workers belong to the settlement, and every member can give orders to every worker in it.`, b);
}

/** @param {Player} p @param {string} id */
async function leaveForm(p, id) {
  const s = settlementOf({ id: p.id, name: p.name });
  if (!s || s.id !== id) return;
  await menu(p, `Leave ${s.name}?`, "Your workers leave with you. You can found your own settlement afterwards.", [
    ["Leave", () => say(p, removeMember(whoIs(p), s, p.id))],
    ["Cancel", () => settlementMenu(p, id)],
  ]);
}

/** @param {Player} p @param {string} id */
async function settlementNameForm(p, id) {
  const s = settlementOf({ id: p.id, name: p.name });
  if (!s || s.id !== id) return;
  const r = await show(p, new ModalFormData().title("Name").textField("Settlement name", s.name, { defaultValue: s.name }).submitButton("Save"));
  if (r?.formValues) say(p, renameSettlement(whoIs(p), s, String(r.formValues[0] ?? "")));
}

/** @param {Player} p @param {string} id */
async function moveBellForm(p, id) {
  const s = settlementOf({ id: p.id, name: p.name });
  if (!s || s.id !== id) return;
  await menu(p, "Move the bell", "The bell goes into your inventory. Your workers, members and name are kept, but the settlement menu isn't available until you place the bell and crouch-tap it.", [
    ["Take the bell down", () => say(p, packBell(p))],
    ["Cancel", () => settlementMenu(p, id)],
  ]);
}

/** Operators: the per-player worker limit. @param {Player} p @param {string} id */
async function capForm(p, id) {
  const r = await show(p, new ModalFormData().title("Worker limit")
    .slider("Workers each player may have (keeps the server running smoothly)", 1, 24, { defaultValue: Math.min(24, getCap()), valueStep: 1 })
    .submitButton("Save"));
  if (r?.formValues) say(p, setCap(whoIs(p), Number(r.formValues[0])));
  else settlementMenu(p, id);
}

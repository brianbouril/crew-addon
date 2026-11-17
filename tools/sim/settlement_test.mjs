// Settlement layer, release 1 (specs/settlement-layer.md, done criteria "Release 1"):
// founding at a bell you placed, the protected bell and Move the bell, one settlement per player,
// members, renaming, workers joining (old ones too), who can give orders, the roster lines, the
// per-player worker cap and its operator setting, and orders that wait for an unloaded worker.
import { world, tick, fire, setPlayers, ItemStack, Container, BlockPermutation } from "@minecraft/server";
import "./scripts/main.js";
import {
  bellTap, foundSettlement, moveBell, packBell, checkBells, settlementOf, addMember, removeMember, renameSettlement,
  rosterOf, rosterLine, getCap, setCap, capCheck, queueOrder, takeQueued, getSettlements, joinedMessage,
} from "./scripts/settlement.js";
import { spawnWorker, canCommand, meta } from "./scripts/workers.js";
import { dispatch } from "./scripts/orders.js";
import { getRegistry, saveRegistry } from "./scripts/store.js";
import { setJSON } from "./scripts/util.js";

const logs = []; const out = console.log; console.log = (...a) => logs.push(a.join(" ")); console.warn = (...a) => logs.push("WARN " + a.join(" "));
const ow = world.getDimension("minecraft:overworld");
/** A mock player. */
const mkPlayer = (id, name, op = false, at = { x: 2000, y: 65, z: 2000 }) => ({
  id, name, isValid: true, isSneaking: true, commandPermissionLevel: op ? 2 : 0, dimension: ow, location: { ...at }, msgs: [], inv: new Container(36),
  sendMessage(m) { this.msgs.push(String(m)); }, getComponent(n) { return n === "minecraft:inventory" ? { container: this.inv } : undefined; },
});
const brian = mkPlayer("p1", "Brian"), ann = mkPlayer("p2", "Ann"), cal = mkPlayer("p3", "Cal"), op = mkPlayer("p9", "Admin", true);
setPlayers([brian, ann, cal, op]);
const asBy = (p) => ({ id: p.id, name: p.name, isOp: p.commandPermissionLevel >= 1 });
fire("world.afterEvents.worldLoad", {});
let t = 0;
const run = (n) => { for (const end = t + n; t < end;) tick(++t); };

const fails = [];
const check = (name, ok, detail) => { if (!ok) fails.push(detail === undefined ? name : `${name}: ${JSON.stringify(detail)}`); };

/** Places a bell (standing on the block below) as `who` would, through the place-block event. */
function placeBell(who, at) {
  ow.setBlockType({ ...at, y: at.y - 1 }, "minecraft:stone");
  ow.getBlock(at).setPermutation(BlockPermutation.resolve("minecraft:bell", { attachment: "standing", direction: 0 }));
  if (who) fire("world.afterEvents.playerPlaceBlock", { player: who, block: ow.getBlock(at), dimension: ow });
  return ow.getBlock(at);
}
const crouchTap = (who, block, itemStack) => fire("world.beforeEvents.playerInteractWithBlock", { player: who, block, itemStack, isFirstEvent: true, cancel: false });

// ---- founding ----
const villageBell = placeBell(undefined, { x: 2010, y: 65, z: 2000 });
const tapVillage = crouchTap(brian, villageBell);
check("crouch-tap on a village bell is cancelled", tapVillage.cancel === true);
check("village bell answers", brian.msgs.some((m) => m.includes("This bell belongs to the village")), brian.msgs);
check("village bell founds nothing", !settlementOf({ id: "p1", name: "Brian" }));
const plainTap = fire("world.beforeEvents.playerInteractWithBlock", { player: { ...brian, isSneaking: false }, block: villageBell, isFirstEvent: true, cancel: false });
check("a plain tap rings as usual", plainTap.cancel === false);
const holdingBlock = crouchTap(brian, villageBell, new ItemStack("minecraft:cobblestone", 1));
check("crouching with a block in hand still places blocks", holdingBlock.cancel === false);

// a worker Brian built before he had a settlement (an old save), and one that isn't loaded now
const { e: digby } = spawnWorker(ow, { x: 2002.5, y: 65, z: 2002.5 }, { id: "p1", name: "Brian" }, "Digby", [new ItemStack("minecraft:iron_shovel")]);
const reg = getRegistry();
reg["faraway"] = { name: "Faraway", id: "unloaded-1", ownerId: "p1", ownerName: "Brian" };
saveRegistry(reg);

const bell = placeBell(brian, { x: 2000, y: 65, z: 2005 });
check("own placed bell offers founding", bellTap(brian, bell).kind === "found", bellTap(brian, bell));
check("someone else's placed bell isn't yours", bellTap(ann, bell).kind !== "found", bellTap(ann, bell));
const founded = foundSettlement(brian, bell, "");
const s = settlementOf({ id: "p1", name: "Brian" });
check("founded", founded.ok && !!s, founded);
check("default name", s?.name === "Brian's Settlement", s?.name);
check("old workers join, loaded or not", rosterOf(s).map((r) => r.name).sort().join() === "Digby,Faraway", rosterOf(s));
check("joined message", founded.message.includes("2 of your workers joined Brian's Settlement"), founded.message);
check("worker unchanged by joining", meta(digby).name === "Digby" && digby.getDynamicProperty("crew:role") === "Digger");
check("crouch-tap on the settlement bell opens the menu", bellTap(brian, bell).kind === "menu");
check("roster survives a reload", JSON.parse(String(world.getDynamicProperty("crew:settlements"))) && !!getSettlements()[s.id]);

// one settlement per player: a second bell offers a move, and moving keeps everything
const bell2 = placeBell(brian, { x: 2020, y: 65, z: 2005 });
check("second bell offers a move", bellTap(brian, bell2).kind === "move", bellTap(brian, bell2));
check("can't found twice", !foundSettlement(brian, bell2, "Two").ok);

// ---- members ----
const addAnn = addMember(asBy(brian), s, { id: "p2", name: "Ann" });
check("owner adds a member", addAnn.ok, addAnn);
const { e: annW } = spawnWorker(ow, { x: 2004.5, y: 65, z: 2002.5 }, { id: "p2", name: "Ann" }, "Annie", [new ItemStack("minecraft:iron_pickaxe")]);
check("member's worker joins", rosterOf(settlementOf({ id: "p1", name: "Brian" })).some((r) => r.name === "Annie"));
check("member can't found their own", !foundSettlement(ann, placeBell(ann, { x: 2030, y: 65, z: 2005 }), "Mine").ok);
check("member can order the owner's worker", canCommand(asBy(ann), meta(digby)));
check("owner can order the member's worker", canCommand(asBy(brian), meta(annW)));
check("outsider can't", !canCommand(asBy(cal), meta(digby)));
setJSON(digby, "crew:crew", [{ id: "p3", name: "Cal" }]);
check("outsider on the allowed list still can", canCommand(asBy(cal), meta(digby)));
setJSON(digby, "crew:crew", []);
const calTown = foundSettlement(cal, placeBell(cal, { x: 2040, y: 65, z: 2005 }), "Calton");
check("Cal founds his own", calTown.ok, calTown);
check("a player in another settlement can't be added", !addMember(asBy(brian), s, { id: "p3", name: "Cal" }).ok);
check("a member can't add members", !addMember(asBy(ann), getSettlements()[s.id], { id: "p5", name: "Eve" }).ok);
check("member can't rename", !renameSettlement(asBy(ann), getSettlements()[s.id], "Annville").ok);
check("owner renames", renameSettlement(asBy(brian), getSettlements()[s.id], "Bluebell").ok && settlementOf({ id: "p1", name: "Brian" }).name === "Bluebell");
check("remove member", removeMember(asBy(brian), settlementOf({ id: "p1", name: "Brian" }), "p2").ok && !rosterOf(settlementOf({ id: "p1", name: "Brian" })).some((r) => r.name === "Annie"));
check("removed member can't order", !canCommand(asBy(ann), meta(digby)));

// ---- the protected bell ----
const below = ow.getBlock({ x: 2000, y: 64, z: 2005 });
const brk = (who, block) => fire("world.beforeEvents.playerBreakBlock", { player: who, block, dimension: ow, cancel: false });
check("owner can't break the bell", brk(brian, bell).cancel === true);
check("nobody can", brk(cal, bell).cancel === true);
check("the block it stands on is protected", brk(cal, below).cancel === true);
check("an ordinary block isn't", brk(cal, ow.getBlock({ x: 2001, y: 64, z: 2005 })).cancel === false);
check("break refusal says how to move it", cal.msgs.some((m) => m.includes("Move the bell from the settlement menu")), cal.msgs);
let impacted = [bell, below, ow.getBlock({ x: 2001, y: 64, z: 2005 })];
fire("world.beforeEvents.explosion", { dimension: ow, getImpactedBlocks: () => impacted, setImpactedBlocks: (b) => { impacted = b; } });
check("explosions skip the bell and its support", impacted.length === 1 && impacted[0].x === 2001, impacted.map((b) => b.location));

// move the bell: owner only; the settlement is kept without a bell until it's hung again
check("a member can't pack the bell", !packBell(asBy(ann)).ok);
const packed = packBell(brian);
check("owner packs the bell", packed.ok && ow.getBlock(bell.location).typeId === "minecraft:air", packed);
check("bell goes to the owner's inventory", brian.inv.items.some((i) => i?.typeId === "minecraft:bell"));
check("settlement kept without a bell", !!settlementOf({ id: "p1", name: "Brian" }) && settlementOf({ id: "p1", name: "Brian" }).bell === null && rosterOf(settlementOf({ id: "p1", name: "Brian" })).length === 2);
const bell3 = placeBell(brian, { x: 2000, y: 65, z: 2010 });
check("hanging it again", bellTap(brian, bell3).kind === "rehang" && moveBell(brian, bell3).ok);
const s3 = settlementOf({ id: "p1", name: "Brian" });
check("moved bell keeps name and roster", s3.name === "Bluebell" && s3.bell?.z === 2010 && rosterOf(s3).length === 2, s3);
check("the old bell spot is ordinary again", brk(cal, bell2).cancel === false);
ow.setBlockType(bell3.location, "minecraft:air"); // e.g. /fill
checkBells();
check("a bell that vanished leaves the settlement without a bell", settlementOf({ id: "p1", name: "Brian" }).bell === null);
check("owner is told", brian.msgs.some((m) => m.includes("bell is gone")), brian.msgs.slice(-3));
moveBell(brian, placeBell(brian, { x: 2000, y: 65, z: 2012 }));

// ---- roster lines ----
run(200); // workers note what they're doing
const S = () => settlementOf({ id: "p1", name: "Brian" });
const lineFor = (name, opts = {}) => {
  const entry = rosterOf(S()).find((r) => r.name === name);
  const loaded = new Set(world.getDimension("minecraft:overworld").getEntities({ type: "crew:worker" }).map((e) => e.id));
  return rosterLine(entry, { viewer: brian, loadedIds: loaded, now: Date.now(), ...opts });
};
check("line 1 is name and role", lineFor("Digby").title === "Digby, Digger", lineFor("Digby"));
check("idle", lineFor("Digby").line.includes("Idle"), lineFor("Digby"));
check("distance and direction", /\d+ blocks [NSEW]{1,2}/.test(lineFor("Digby").line) || lineFor("Digby").line.includes("here"), lineFor("Digby"));
const inv = digby.getComponent("minecraft:inventory").container;
const shovel = inv.getItem(0); shovel.damage = 230; inv.setItem(0, shovel); // 20 of 250 left
run(200);
check("tools low", lineFor("Digby").line.includes("Tools low"), lineFor("Digby"));
inv.setItem(0, undefined);
run(200);
check("out of tools", lineFor("Digby").line.includes("Out of tools") && !lineFor("Digby").line.includes("Tools low"), lineFor("Digby"));
inv.setItem(0, new ItemStack("minecraft:iron_shovel"));
ow.setBlockType({ x: 2002, y: 65, z: 1990 }, "minecraft:chest");
const q = dispatch(asBy(brian), { worker: "Digby", job: "quarry", params: { from: [2001, 63, 1994], to: [2004, 64, 1997], facing: "south", deposit: [2002, 65, 1990], keep: "all" } });
run(200);
check("digging shows the job and progress", q.ok && /Quarry \d+%/.test(lineFor("Digby").line), lineFor("Digby"));
const far = { ...brian, location: { x: 2600, y: 65, z: 2000 } };
check("working far away (holds a ticking area)", lineFor("Digby", { viewer: far }).line.includes("Working far away"), lineFor("Digby", { viewer: far }));
check("never-seen unloaded worker", lineFor("Faraway").line.length > 0, lineFor("Faraway"));
// unload Digby mid-job
digby.remove();
check("paused: nobody nearby", lineFor("Digby").line.includes("Paused: nobody nearby"), lineFor("Digby"));
const { e: idler } = spawnWorker(ow, { x: 2006.5, y: 65, z: 2002.5 }, { id: "p1", name: "Brian" }, "Idler", [new ItemStack("minecraft:iron_shovel")]);
run(200);
idler.remove();
check("last seen", lineFor("Idler", { now: Date.now() + 5 * 60000 }).line.includes("last seen 5 min ago"), lineFor("Idler", { now: Date.now() + 5 * 60000 }));

// ---- orders that wait for an unloaded worker ----
const queued = queueOrder("unloaded-1", asBy(brian), { worker: "Faraway", job: "stop", params: {} });
check("order to an unloaded worker is queued", queued.ok && takeQueued("unloaded-1").length === 1, queued);
const { e: later } = spawnWorker(ow, { x: 2008.5, y: 65, z: 2002.5 }, { id: "p1", name: "Brian" }, "Later", [new ItemStack("minecraft:iron_shovel")]);
queueOrder(later.id, asBy(brian), { worker: "Later", job: "come", params: {} });
run(100);
check("a queued order runs once the worker is loaded", String(later.getDynamicProperty("crew:job") ?? "").includes('"come"') && takeQueued(later.id).length === 0);

// ---- worker cap ----
check("default cap is 6", getCap() === 6);
check("a non-operator can't change it", !setCap(asBy(brian), 3).ok && getCap() === 6);
check("an operator can", setCap(asBy(op), 3).ok && getCap() === 3);
/** Builds a worker the way a player does: tools in a barrel, then a pumpkin on top. */
function build(who, at) {
  ow.setBlockType(at, "minecraft:barrel");
  ow.getBlock(at).getComponent("minecraft:inventory").container.setItem(0, new ItemStack("minecraft:stone_shovel"));
  const head = { ...at, y: at.y + 1 };
  ow.setBlockType(head, "minecraft:carved_pumpkin");
  fire("world.afterEvents.playerPlaceBlock", { player: who, block: ow.getBlock(head), dimension: ow });
  return { barrel: ow.getBlock(at), head: ow.getBlock(head) };
}
const mine = () => Object.values(getRegistry()).filter((r) => r.ownerId === "p1").length;
const before = mine();
check("Brian is over a cap of 3 already", before > 3, before);
check("cap check", !capCheck("p1").ok && capCheck("p2").ok);
brian.msgs.length = 0;
const b4 = build(brian, { x: 2050, y: 65, z: 2000 });
check("building over the cap is refused", mine() === before, mine());
check("refusal message", brian.msgs.some((m) => m.includes(`You have ${before} workers, your limit is 3.`)), brian.msgs);
check("barrel and tools left as they were", b4.barrel.typeId === "minecraft:barrel" && b4.barrel.getComponent("minecraft:inventory").container.items.some((i) => i?.typeId === "minecraft:stone_shovel"));
check("workers over the cap keep working", rosterOf(S()).length === before);
const annCount = Object.values(getRegistry()).filter((r) => r.ownerId === "p2").length;
build(ann, { x: 2060, y: 65, z: 2000 });
check("the cap is per player", Object.values(getRegistry()).filter((r) => r.ownerId === "p2").length === annCount + 1);
const eve = mkPlayer("p5", "Eve"); setPlayers([brian, ann, cal, op, eve]);
build(eve, { x: 2070, y: 65, z: 2000 }); build(eve, { x: 2072, y: 65, z: 2000 }); build(eve, { x: 2074, y: 65, z: 2000 }); build(eve, { x: 2076, y: 65, z: 2000 });
check("applies without a settlement too", Object.values(getRegistry()).filter((r) => r.ownerId === "p5").length === 3);
setCap(asBy(op), 6);
check("joined message helper", joinedMessage(1, "Bluebell") === "1 of your workers joined Bluebell.");

console.log = out;
console.log(JSON.stringify({ checks: "settlement release 1", failed: fails.length }, null, 1));
for (const f of fails) console.log("FAIL", f);
const warns = logs.filter((l) => l.startsWith("WARN"));
if (warns.length) console.log(warns.slice(0, 5).join("\n"));
if (fails.length || warns.length) process.exit(1);

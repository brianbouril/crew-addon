// Settlement layer, release 2 (specs/settlement-layer.md, done criteria "Release 2"):
// storage chests (known chests plus ones added with the stake) and the ledger of their live
// contents; settlement orders (Stop, Continue, Drop off, Go home, Come to the bell) to everyone or
// one role, as normal typed orders, queued for unloaded workers, only from people in the settlement.
import { world, tick, fire, setPlayers, ItemStack, Container, BlockPermutation } from "@minecraft/server";
import "./scripts/main.js";
import { foundSettlement, settlementOf, addStorage, removeStorage, storageSpots, ledger, whereIs, noteChestUse, takeQueued, refreshStorage, getSettlements } from "./scripts/settlement.js";
import { orderSettlement } from "./scripts/orders.js";
import { spawnWorker } from "./scripts/workers.js";
import { savePlace, getRegistry, saveRegistry } from "./scripts/store.js";
import { setHome } from "./scripts/life.js";
import { getJSON, setJSON } from "./scripts/util.js";
import { dispatch } from "./scripts/orders.js";

const logs = []; const out = console.log; console.log = (...a) => logs.push(a.join(" ")); console.warn = (...a) => logs.push("WARN " + a.join(" "));
const ow = world.getDimension("minecraft:overworld");
const mkPlayer = (id, name, op = false, at = { x: 3000, y: 65, z: 3000 }) => ({
  id, name, isValid: true, isSneaking: true, commandPermissionLevel: op ? 2 : 0, dimension: ow, location: { ...at }, msgs: [], inv: new Container(36),
  sendMessage(m) { this.msgs.push(String(m)); }, getComponent(n) { return n === "minecraft:inventory" ? { container: this.inv } : undefined; },
});
const brian = mkPlayer("p1", "Brian"), cal = mkPlayer("p3", "Cal");
setPlayers([brian, cal]);
const asBy = (p) => ({ id: p.id, name: p.name, isOp: false });
fire("world.afterEvents.worldLoad", {});
let t = 0;
const run = (n) => { for (const end = t + n; t < end;) tick(++t); };
const fails = [];
const check = (name, ok, detail) => { if (!ok) fails.push(detail === undefined ? name : `${name}: ${JSON.stringify(detail)}`); };

// a settlement
const bellAt = { x: 3000, y: 65, z: 3010 };
ow.setBlockType({ ...bellAt, y: 64 }, "minecraft:stone");
ow.getBlock(bellAt).setPermutation(BlockPermutation.resolve("minecraft:bell", { attachment: "standing", direction: 0 }));
fire("world.afterEvents.playerPlaceBlock", { player: brian, block: ow.getBlock(bellAt), dimension: ow });
check("founded", foundSettlement(brian, ow.getBlock(bellAt), "Stockton").ok);
const S = () => settlementOf({ id: "p1", name: "Brian" });

// ---- storage chests ----
const chest = (at, items) => {
  ow.setBlockType(at, "minecraft:chest");
  const c = ow.getBlock(at).getComponent("minecraft:inventory").container;
  for (const [id, n] of items) c.addItem(new ItemStack(id, n));
  return c;
};
const homeChest = chest({ x: 3005, y: 65, z: 3000 }, [["minecraft:cobblestone", 100], ["minecraft:raw_iron", 5]]);
const placeChest = chest({ x: 3010, y: 65, z: 3000 }, [["minecraft:cobblestone", 20], ["minecraft:diamond", 3]]);
const stakeChest = chest({ x: 3015, y: 65, z: 3000 }, [["minecraft:shulker_box", 1], ["minecraft:oak_log", 64]]);
const strangerChest = chest({ x: 3020, y: 65, z: 3000 }, [["minecraft:diamond", 50]]);
// a double chest: both halves open the same 54 slots
const dbl = chest({ x: 3030, y: 65, z: 3000 }, [["minecraft:coal", 10]]);
ow.setBlockType({ x: 3031, y: 65, z: 3000 }, "minecraft:chest");
ow.containers.set("3031,65,3000", dbl);

// a worker with a home chest (known chest), a named place (known chest), a stake-added chest
ow.setBlockType({ x: 3004, y: 65, z: 3002 }, "minecraft:bed");
const { e: digby } = spawnWorker(ow, { x: 3002.5, y: 65, z: 3002.5 }, { id: "p1", name: "Brian" }, "Digby", [new ItemStack("minecraft:iron_shovel")]);
setHome(digby, { dim: "minecraft:overworld", head: { x: 3004, y: 65, z: 3002 }, foot: { x: 3004, y: 65, z: 3003 }, chest: { x: 3005, y: 65, z: 3000 } });
savePlace(asBy(brian), "blue base", "minecraft:overworld", { x: 3010, y: 65, z: 3000 }, false);
check("a member adds a chest with the stake", addStorage(asBy(brian), S(), ow.getBlock({ x: 3015, y: 65, z: 3000 })).ok);
check("an outsider can't", !addStorage(asBy(cal), S(), ow.getBlock({ x: 3020, y: 65, z: 3000 })).ok);
check("can't add twice", !addStorage(asBy(brian), S(), ow.getBlock({ x: 3015, y: 65, z: 3000 })).ok);
addStorage(asBy(brian), S(), ow.getBlock({ x: 3030, y: 65, z: 3000 }));
addStorage(asBy(brian), S(), ow.getBlock({ x: 3031, y: 65, z: 3000 }));
run(200); // workers report their home chest; storage is read
const keys = storageSpots(S()).map((sp) => `${sp.x}`).sort().join();
check("storage = home chest + named place + stake chests (not a stranger's)", keys === "3005,3010,3015,3030,3031", keys);
// a barrel right beside the double chest is its own storage, not "the other half"
ow.setBlockType({ x: 3029, y: 65, z: 3000 }, "minecraft:barrel");
const barrel = ow.getBlock({ x: 3029, y: 65, z: 3000 }).getComponent("minecraft:inventory").container;
barrel.addItem(new ItemStack("minecraft:coal", 5));
addStorage(asBy(brian), S(), ow.getBlock({ x: 3029, y: 65, z: 3000 }));
run(200);

/** What the loaded storage chests actually hold, summed (the double chest once). */
function actual() {
  const sum = {};
  for (const c of [homeChest, placeChest, stakeChest, dbl, barrel]) for (const it of c.items) if (it) sum[it.typeId] = (sum[it.typeId] ?? 0) + it.amount;
  return sum;
}
const asMap = () => Object.fromEntries(ledger(S()).totals.map((x) => [x.id, x.n]));
const same = (a, b) => JSON.stringify(Object.entries(a).sort()) === JSON.stringify(Object.entries(b).sort());
check("ledger totals = chest contents", same(asMap(), actual()), { ledger: asMap(), actual: actual() });
check("most first", ledger(S()).totals[0].id === "minecraft:cobblestone" && ledger(S()).totals[0].n === 120, ledger(S()).totals[0]);
check("a shulker box counts as one item", asMap()["minecraft:shulker_box"] === 1);
check("the double chest is counted once, and the barrel beside it too", asMap()["minecraft:coal"] === 15, asMap());
{
  // two separate double chests side by side, both full of cobblestone: both count
  const full = (x) => { const c = chest({ x, y: 65, z: 3020 }, []); for (let i = 0; i < 54; i++) c.setItem(i, new ItemStack("minecraft:cobblestone", 64)); return c; };
  full(3050); full(3051);
  const before = asMap()["minecraft:cobblestone"];
  addStorage(asBy(brian), S(), ow.getBlock({ x: 3050, y: 65, z: 3020 }));
  addStorage(asBy(brian), S(), ow.getBlock({ x: 3051, y: 65, z: 3020 }));
  run(200);
  check("two identical full chests side by side both count", asMap()["minecraft:cobblestone"] === before + 2 * 54 * 64, { before, now: asMap()["minecraft:cobblestone"] });
  check("and checking them changed nothing", ow.getBlock({ x: 3050, y: 65, z: 3020 }).getComponent("minecraft:inventory").container.items.every((i) => i?.typeId === "minecraft:cobblestone" && i.amount === 64));
  // a named shulker box in the double chest is never taken out to check it
  const shulker = new ItemStack("minecraft:shulker_box", 1);
  shulker.nameTag = "Diamonds";
  const coal = dbl.items[0];
  dbl.items[0] = shulker; // where the coal was, so it's the first slot
  run(200);
  check("checking a double chest never moves a valuable item", dbl.items[0] === shulker && dbl.items[0].nameTag === "Diamonds");
  check("and it still counts once", asMap()["minecraft:coal"] === 5 && asMap()["minecraft:shulker_box"] === 2, asMap());
  dbl.items[0] = coal;
  // a full double chest (no empty slot): still counted once, nothing changed
  const saved = [...dbl.items];
  for (let i = 0; i < 54; i++) dbl.items[i] = new ItemStack("minecraft:cobblestone", 64);
  const cob = asMap()["minecraft:cobblestone"];
  run(200);
  check("a full double chest counts once", asMap()["minecraft:cobblestone"] === cob + 54 * 64, { cob, now: asMap()["minecraft:cobblestone"] });
  check("and stays full", dbl.items.every((i) => i?.amount === 64));
  for (let i = 0; i < 54; i++) dbl.items[i] = saved[i];
  run(200);
  removeStorage(asBy(brian), S(), ow.getBlock({ x: 3050, y: 65, z: 3020 }));
  removeStorage(asBy(brian), S(), ow.getBlock({ x: 3051, y: 65, z: 3020 }));
  run(200);
}
check("a stranger's chest isn't counted", asMap()["minecraft:diamond"] === 3);
check("where is it", whereIs(S(), "minecraft:cobblestone").map((w) => w.n).join() === "100,20", whereIs(S(), "minecraft:cobblestone"));

// players add and take items: the next read picks it up
placeChest.addItem(new ItemStack("minecraft:diamond", 4));
homeChest.setItem(0, undefined); // 64 cobblestone taken out
run(200);
check("players' changes show within seconds", same(asMap(), actual()), { ledger: asMap(), actual: actual() });

// a worker's drop-off is read right away
homeChest.addItem(new ItemStack("minecraft:raw_iron", 7));
noteChestUse("minecraft:overworld", { x: 3005, y: 65, z: 3000 });
check("re-read right after a worker uses it", asMap()["minecraft:raw_iron"] === 12, asMap());

// a chest whose area isn't loaded keeps its last contents, with when
ow.setUnloaded({ x: 3010, y: 65, z: 3000 });
placeChest.addItem(new ItemStack("minecraft:diamond", 100)); // nobody can see this yet
const tsBefore = ledger(S()).chests.find((c) => c.x === 3010).ts;
run(200);
const far = ledger(S()).chests.find((c) => c.x === 3010);
check("unloaded chest keeps its last known contents", far.items["minecraft:diamond"] === 7 && far.ts === tsBefore, far);
ow.setUnloaded({ x: 3010, y: 65, z: 3000 }, false);
run(200);
check("and catches up once loaded", asMap()["minecraft:diamond"] === 107, asMap());

check("stake chests can be removed", removeStorage(asBy(brian), S(), ow.getBlock({ x: 3015, y: 65, z: 3000 })).ok && !storageSpots(S()).some((sp) => sp.x === 3015));
run(200);
check("removed chest no longer counts", !asMap()["minecraft:oak_log"], asMap());
check("and its saved contents are dropped", world.getDynamicProperty("crew:stock:minecraft:overworld|3015,65,3000") === undefined);
{
  // a worker that dropped off at someone else's named place: that chest isn't the settlement's
  chest({ x: 3060, y: 65, z: 3000 }, [["minecraft:emerald", 9]]);
  savePlace(asBy(cal), "cal's shop", "minecraft:overworld", { x: 3060, y: 65, z: 3000 }, true);
  setJSON(digby, "crew:lastDeposit", { x: 3060, y: 65, z: 3000, dim: "minecraft:overworld", label: "cal's shop" });
  run(200);
  check("another player's named place doesn't count", !storageSpots(S()).some((sp) => sp.x === 3060) && !asMap()["minecraft:emerald"], storageSpots(S()).map((sp) => sp.x));
  setJSON(digby, "crew:lastDeposit", undefined);
}
check("known chests can't be removed", !removeStorage(asBy(brian), S(), ow.getBlock({ x: 3005, y: 65, z: 3000 })).ok);

// ---- settlement orders ----
const { e: dig2 } = spawnWorker(ow, { x: 3006.5, y: 65, z: 3006.5 }, { id: "p1", name: "Brian" }, "Shovel", [new ItemStack("minecraft:iron_shovel")]);
const { e: miner } = spawnWorker(ow, { x: 3008.5, y: 65, z: 3006.5 }, { id: "p1", name: "Brian" }, "Picky", [new ItemStack("minecraft:iron_pickaxe")]);
const reg = getRegistry(); reg["faraway"] = { name: "Faraway", id: "far-1", ownerId: "p1", ownerName: "Brian" }; saveRegistry(reg);
const job = (e) => getJSON(e, "crew:job", undefined);
for (const w of [digby, dig2, miner]) dispatch(asBy(brian), { worker: w.getDynamicProperty("crew:name"), job: "come", params: { to: "Brian" } });
brian.location = { x: 3300, y: 65, z: 3000 }; // far enough that nobody arrives during the test
const stopDiggers = orderSettlement(asBy(brian), S(), "stop", "Digger");
check("stop the Diggers only", stopDiggers.ok && !job(digby) && !job(dig2) && job(miner)?.type === "come", stopDiggers);
check("outsiders can't give settlement orders", !orderSettlement(asBy(cal), S(), "stop").ok);
const bellOrder = orderSettlement(asBy(brian), S(), "come_bell");
check("come to the bell: everyone walks to the bell", bellOrder.ok && [digby, dig2, miner].every((w) => job(w)?.type === "come" && job(w).at?.x === 3000 && job(w).at?.z === 3010), bellOrder);
const q = takeQueued("far-1");
check("an unloaded worker gets the same typed order, queued", q.length === 1 && q[0].order.worker === "Faraway" && q[0].order.job === "come" && JSON.stringify(q[0].order.params.at) === "[3000,65,3010]" && q[0].order.params.dimension === "minecraft:overworld", q);
const wrongDim = dispatch(asBy(brian), { worker: "Picky", job: "come", params: { ...q[0].order.params, dimension: "minecraft:nether" } });
check("a worker in another dimension from the bell refuses", !wrongDim.ok && /another dimension/.test(wrongDim.message), wrongDim);
run(400);
check("they arrive and wait", [digby, dig2, miner].every((w) => !job(w)), [digby, dig2, miner].map(job));
const home = orderSettlement(asBy(brian), S(), "go_home");
check("go home: a worker with a home walks there; the others stay put", home.ok && job(digby)?.type === "come" && job(digby).label === "home" && !job(dig2) && !job(miner), { msg: home.message, d: job(digby), s: job(dig2) });
takeQueued("far-1");
// drop off: at each one's usual drop-off (Digby: its home chest)
digby.getComponent("minecraft:inventory").container.setItem(10, new ItemStack("minecraft:dirt", 30));
const drop = orderSettlement(asBy(brian), S(), "drop_off", "Digger");
check("drop off at the usual chest", job(digby)?.type === "drop_off" && job(digby).deposit.x === 3005, { msg: drop.message, j: job(digby) });
run(600);
check("the drop-off shows in the ledger", asMap()["minecraft:dirt"] === 30, asMap());
// continue: a paused dig picks up again
ow.setBlockType({ x: 3040, y: 65, z: 3000 }, "minecraft:chest");
dispatch(asBy(brian), { worker: "Shovel", job: "quarry", params: { from: [3040, 63, 3004], to: [3043, 64, 3007], facing: "south", deposit: [3040, 65, 3000], keep: "all" } });
run(100);
orderSettlement(asBy(brian), S(), "stop");
check("stopped dig is paused", !!dig2.getDynamicProperty("crew:paused"));
const cont = orderSettlement(asBy(brian), S(), "resume", "Digger");
check("continue picks it up", cont.ok && job(dig2)?.type === "quarry", cont);
check("an unknown order is refused", !orderSettlement(asBy(brian), S(), "quarry").ok);
check("come to the bell needs the bell up", (() => { const s = S(); s.bell = null; return !orderSettlement(asBy(brian), s, "come_bell").ok; })());

console.log = out;
console.log(JSON.stringify({ checks: "settlement release 2", failed: fails.length }, null, 1));
for (const f of fails) console.log("FAIL", f);
const warns = logs.filter((l) => l.startsWith("WARN"));
if (warns.length) console.log(warns.slice(0, 5).join("\n"));
if (fails.length || warns.length) process.exit(1);

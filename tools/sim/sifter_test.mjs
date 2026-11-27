// Sifter: sieve block, hand use, redstone, and a Sifter worker that counts toward the cap.
// Exit non-zero on a wrong result.
import { world, tick, fire, ItemStack, Container, setTimeOfDay, setRedstonePower, log } from "@minecraft/server";
import { CAP_DEFAULT } from "./scripts/settlement.js";
import { LOOT, SIEVE, handSift, outcome, rememberSieve, startSifter, tickSieves } from "./scripts/sift.js";
import { buildFromBarrel, roleOf, spawnWorker } from "./scripts/workers.js";
import { dispatch } from "./scripts/orders.js";
import { getRegistry } from "./scripts/store.js";
import { setEnergy } from "./scripts/life.js";

const fails = [];
let checks = 0;
/** @param {string} name @param {boolean} ok @param {any} [detail] */
function check(name, ok, detail) {
  checks++;
  if (!ok) fails.push(detail === undefined ? name : `${name}: ${typeof detail === "string" ? detail : JSON.stringify(detail)}`);
}

const ow = world.getDimension("minecraft:overworld");
const by = { id: "sifter-p", name: "Brian", isOp: false };
const owner = { id: "sifter-p", name: "Brian" };
startSifter();

function makePlayer() {
  const inv = new Container(36);
  return {
    id: "sifter-p", name: "Brian", isValid: true, selectedSlotIndex: 0, inv,
    sendMessage() {},
    getComponent: (n) => (n === "minecraft:inventory" ? { container: inv } : undefined),
  };
}
const player = makePlayer();

/** @param {import("@minecraft/server").Container[]} containers */
function totals(containers) {
  /** @type {Record<string, number>} */
  const m = {};
  for (const c of containers) {
    for (let i = 0; i < c.size; i++) {
      const it = c.getItem(i);
      if (it) m[it.typeId] = (m[it.typeId] ?? 0) + it.amount;
    }
  }
  return m;
}
/** @param {Record<string, number>} before @param {Record<string, number>} after @param {Record<string, number>} delta */
function badDelta(before, after, delta) {
  const keys = new Set([...Object.keys(before), ...Object.keys(after), ...Object.keys(delta)]);
  const bad = [];
  for (const k of keys) {
    const d = (after[k] ?? 0) - (before[k] ?? 0);
    if (d !== (delta[k] ?? 0)) bad.push(`${k} ${d} wanted ${delta[k] ?? 0}`);
  }
  return bad.join("; ");
}
/** @param {number} roll @param {() => void} fn */
function withRoll(roll, fn) {
  globalThis.crewSiftRoll = roll;
  try { fn(); } finally { delete globalThis.crewSiftRoll; }
}

// ---- loot table boundaries (balance numbers) ----
for (const [id, rows] of Object.entries(LOOT)) {
  const sum = rows.reduce((n, r) => n + r.weight, 0);
  check(`${id} weights sum to 10000`, sum === 10000, sum);
  let at = 0;
  for (const row of rows) {
    check(`${id} roll ${at}`, outcome(id, at) === row.item, outcome(id, at));
    check(`${id} roll ${at + row.weight - 1}`, outcome(id, at + row.weight - 1) === row.item, outcome(id, at + row.weight - 1));
    at += row.weight;
  }
}
check("no netherrack input", outcome("minecraft:netherrack", 0) === null);
check("no soul soil input", outcome("minecraft:soul_soil", 0) === null);
check("no red sand input", !LOOT["minecraft:red_sand"]);
check("no grass input", !LOOT["minecraft:grass_block"]);
check("cap default stays 6", CAP_DEFAULT === 6);

// ---- build and cap ----
world.setDynamicProperty("crew:cap", 1);
function build(at, stacks) {
  ow.setBlockType(at, "minecraft:barrel");
  const barrel = ow.getBlock(at).getComponent("minecraft:inventory").container;
  stacks.forEach((it, i) => barrel.setItem(i, it));
  const headAt = { x: at.x, y: at.y + 1, z: at.z };
  ow.setBlockType(headAt, "minecraft:carved_pumpkin");
  buildFromBarrel(player, ow.getBlock(headAt));
  return ow.getBlock(at);
}
const owned = () => Object.values(getRegistry()).filter((r) => r.ownerId === "sifter-p").length;
const beforeCap = owned();
const barrel1 = build({ x: 20, y: 80, z: 20 }, [new ItemStack(SIEVE, 1)]);
const sifter = ow.getEntities({ type: "crew:worker" }).find((e) => roleOf(e) === "Sifter");
check("sieve barrel builds a Sifter", !!sifter && roleOf(sifter) === "Sifter" && sifter.getProperty("crew:role") === 4, roleOf(sifter));
check("sieve is used up", sifter && !Array.from({ length: 36 }, (_, i) => sifter.getComponent("minecraft:inventory").container.getItem(i)).some((it) => it?.typeId === SIEVE));
check("build spends a cap slot", owned() === beforeCap + 1, owned());
check("barrel and pumpkin are gone", barrel1.typeId === "minecraft:air" && ow.getBlock({ x: 20, y: 81, z: 20 }).typeId === "minecraft:air");
const barrel2 = build({ x: 22, y: 80, z: 20 }, [new ItemStack(SIEVE, 1)]);
check("at the cap the barrel is kept", barrel2.typeId === "minecraft:barrel" && barrel2.getComponent("minecraft:inventory").container.getItem(0)?.typeId === SIEVE);
check("at the cap no second Sifter", owned() === beforeCap + 1);
world.setDynamicProperty("crew:cap", 6);

const mixed = build({ x: 24, y: 80, z: 20 }, [new ItemStack("minecraft:iron_shovel", 1), new ItemStack(SIEVE, 1)]);
const mixedWorker = ow.getEntities({ type: "crew:worker" }).filter((e) => e.isValid).sort((a, b) => Number(b.id) - Number(a.id))[0];
check("sieve plus a shovel is still a Sifter", roleOf(mixedWorker) === "Sifter");
const shovelOnly = spawnWorker(ow, { x: 26.5, y: 80, z: 20.5 }, owner, "DiggerDan", [new ItemStack("minecraft:stone_shovel")]);
const miner = spawnWorker(ow, { x: 28.5, y: 80, z: 20.5 }, owner, "Picky", [new ItemStack("minecraft:iron_pickaxe")]);
check("shovel alone is a Digger", roleOf(shovelOnly.e) === "Digger" && shovelOnly.e.getProperty("crew:role") === 1);
check("pickaxe alone is still Miner at index 0", roleOf(miner.e) === "Miner" && miner.e.getProperty("crew:role") === 0);
const stacked = build({ x: 30, y: 80, z: 20 }, [new ItemStack(SIEVE, 2)]);
const stackedWorker = ow.getEntities({ type: "crew:worker" }).filter((e) => e.isValid && roleOf(e) === "Sifter").sort((a, b) => Number(b.id) - Number(a.id))[0];
let carried = 0;
const stackedInv = stackedWorker.getComponent("minecraft:inventory").container;
for (let i = 0; i < stackedInv.size; i++) {
  const it = stackedInv.getItem(i);
  if (it?.typeId === SIEVE) carried += it.amount;
}
check("a stack of sieves keeps the extras", carried === 1, carried);
check("the kept sieve is not in the tool slots", !stackedInv.getItem(0) || stackedInv.getItem(0).typeId !== SIEVE);

// ---- roles ----
const sifterName = sifter.getDynamicProperty("crew:name");
ow.setBlockType({ x: 10, y: 80, z: 8 }, "minecraft:chest");
const quarry = { from: [10, 80, 10], to: [12, 81, 12], facing: "south", deposit: [10, 80, 8], keep: "all" };
const refusedQ = dispatch(by, { worker: sifterName, job: "quarry", params: quarry });
check("Sifter refuses a quarry", !refusedQ.ok && refusedQ.message.includes("Digger"), refusedQ.message);
const refusedS = dispatch(by, { worker: "DiggerDan", job: "sift", params: { at: [40, 80, 40] } });
check("Digger refuses sift", !refusedS.ok && refusedS.message.includes("Sifter"), refusedS.message);
const came = dispatch(by, { worker: sifterName, job: "come", params: {} });
check("come works for a Sifter", came.ok && String(sifter.getDynamicProperty("crew:job")).includes('"come"'), came.message);

// ---- a station: chest on top, chest underneath ----
function station(x, z) {
  const at = { x, y: 80, z };
  ow.setBlockType(at, SIEVE);
  ow.setBlockType({ x, y: 81, z }, "minecraft:chest");
  ow.setBlockType({ x, y: 79, z }, "minecraft:chest");
  rememberSieve(ow, at);
  return {
    at,
    block: ow.getBlock(at),
    input: ow.getBlock({ x, y: 81, z }).getComponent("minecraft:inventory").container,
    output: ow.getBlock({ x, y: 79, z }).getComponent("minecraft:inventory").container,
  };
}
const st = station(40, 40);
const linked = dispatch(by, { worker: sifterName, job: "sift", params: { at: [40, 80, 40] } });
check("sift links the Sifter", linked.ok && String(sifter.getDynamicProperty("crew:sieveLink")).includes("40"), linked.message);
const status = dispatch(by, { worker: sifterName, job: "status", params: {} });
check("status names the sieve", status.ok && status.message.includes("Sifting at 40 80 40"), status.message);

st.input.setItem(0, new ItemStack("minecraft:raw_iron", 10));
st.input.setItem(1, new ItemStack("minecraft:gravel", 4));
st.input.setItem(2, new ItemStack("minecraft:red_sand", 3));
st.input.setItem(3, new ItemStack("minecraft:grass_block", 2));
const beforeChest = totals([st.input, st.output]);
withRoll(0, () => tickSieves());
const afterFlint = totals([st.input, st.output]);
check("gravel becomes flint and the rest stays", badDelta(beforeChest, afterFlint, { "minecraft:gravel": -1, "minecraft:flint": 1 }) === "", badDelta(beforeChest, afterFlint, { "minecraft:gravel": -1, "minecraft:flint": 1 }));

const beforeNone = totals([st.input, st.output]);
withRoll(9999, () => tickSieves());
const afterNone = totals([st.input, st.output]);
check("a nothing roll only removes the gravel", badDelta(beforeNone, afterNone, { "minecraft:gravel": -1 }) === "", badDelta(beforeNone, afterNone, { "minecraft:gravel": -1 }));

// fill the output, then gravel must stay
for (let i = 0; i < st.output.size; i++) st.output.setItem(i, new ItemStack("minecraft:cobblestone", 64));
const gravelBeforeFull = st.input.getItem(1)?.amount;
withRoll(0, () => tickSieves());
check("a full output chest consumes nothing", st.input.getItem(1)?.amount === gravelBeforeFull, st.input.getItem(1)?.amount);
// empty the output again
st.output.clearAll();

// redstone, ongoing
const red = station(42, 40);
red.input.setItem(0, new ItemStack("minecraft:gravel", 3));
setRedstonePower(ow, red.at, 0);
// the Sifter is linked to the other sieve, so this one has no duty
withRoll(0, () => { tickSieves(); tickSieves(); tickSieves(); });
check("redstone off sifts nothing", red.input.getItem(0)?.amount === 3);
setRedstonePower(ow, red.at, 15);
withRoll(0, () => tickSieves());
check("redstone on sifts one", red.input.getItem(0)?.amount === 2, red.input.getItem(0)?.amount);
setRedstonePower(ow, red.at, 0);
withRoll(0, () => tickSieves());
check("redstone off again stops", red.input.getItem(0)?.amount === 2);
red.input.setItem(0, new ItemStack("minecraft:gravel", 4));
setRedstonePower(ow, red.at, 15);
withRoll(0, () => { tickSieves(); tickSieves(); });
check("more input while powered sifts again", red.input.getItem(0)?.amount === 2, red.input.getItem(0)?.amount);
setRedstonePower(ow, red.at, 0);

// duty by day, pause at night, redstone still runs at night
const day = station(44, 40);
dispatch(by, { worker: sifterName, job: "sift", params: { at: [44, 80, 40] } });
day.input.setItem(0, new ItemStack("minecraft:sand", 5));
setTimeOfDay(1000);
withRoll(0, () => tickSieves());
check("on duty by day, sand yields an iron nugget", day.input.getItem(0)?.amount === 4 && day.output.getItem(0)?.typeId === "minecraft:iron_nugget");
setTimeOfDay(18000);
const nightAmt = day.input.getItem(0).amount;
withRoll(0, () => tickSieves());
check("night pauses the Sifter", day.input.getItem(0)?.amount === nightAmt);
setRedstonePower(ow, day.at, 15);
withRoll(0, () => tickSieves());
check("redstone still sifts at night", day.input.getItem(0)?.amount === nightAmt - 1);
setRedstonePower(ow, day.at, 0);
setTimeOfDay(1000);

// stop and continue
const stopped = dispatch(by, { worker: sifterName, job: "stop", params: {} });
const pausedAmt = day.input.getItem(0).amount;
withRoll(0, () => tickSieves());
check("stop pauses sifting", stopped.ok && day.input.getItem(0)?.amount === pausedAmt && String(sifter.getDynamicProperty("crew:sievePaused")).includes('"x":44'), sifter.getDynamicProperty("crew:sievePaused"));
const again = dispatch(by, { worker: sifterName, job: "resume", params: {} });
withRoll(0, () => tickSieves());
check("continue picks the sieve up", again.ok && again.message.includes("sifting again") && day.input.getItem(0)?.amount === pausedAmt - 1, again.message);

// exhaustion
setEnergy(sifter, 5);
const tiredAmt = day.input.getItem(0).amount;
withRoll(0, () => tickSieves());
check("exhaustion rests the Sifter and does not sift", day.input.getItem(0)?.amount === tiredAmt && String(sifter.getDynamicProperty("crew:job")).includes('"rest"'));
setEnergy(sifter, 100);
dispatch(by, { worker: sifterName, job: "stop", params: {} });

// soul sand the player supplied; netherrack stays
const soul = station(46, 40);
soul.input.setItem(0, new ItemStack("minecraft:netherrack", 6));
soul.input.setItem(1, new ItemStack("minecraft:soul_sand", 2));
setRedstonePower(ow, soul.at, 15);
withRoll(0, () => tickSieves());
check("soul sand yields quartz and netherrack stays", soul.input.getItem(0)?.typeId === "minecraft:netherrack" && soul.input.getItem(0)?.amount === 6 && soul.input.getItem(1)?.amount === 1 && soul.output.getItem(0)?.typeId === "minecraft:quartz");
setRedstonePower(ow, soul.at, 0);

// dirt
const dirt = station(48, 40);
dirt.input.setItem(0, new ItemStack("minecraft:dirt", 1));
setRedstonePower(ow, dirt.at, 15);
withRoll(0, () => tickSieves());
check("dirt yields seeds", dirt.input.getItem(0) === undefined && dirt.output.getItem(0)?.typeId === "minecraft:wheat_seeds");
setRedstonePower(ow, dirt.at, 0);

// hand
const hand = station(50, 40);
player.inv.setItem(0, new ItemStack("minecraft:gravel", 3));
withRoll(0, () => handSift(player, hand.block));
check("holding gravel sifts into the inventory", player.inv.getItem(0)?.typeId === "minecraft:gravel" && player.inv.getItem(0)?.amount === 2);
let flint = 0;
for (let i = 0; i < player.inv.size; i++) if (player.inv.getItem(i)?.typeId === "minecraft:flint") flint += player.inv.getItem(i).amount;
check("hand sift gives one flint", flint === 1, flint);

player.inv.clearAll();
player.inv.setItem(0, new ItemStack("minecraft:gravel", 2));
for (let i = 1; i < player.inv.size; i++) player.inv.setItem(i, new ItemStack("minecraft:cobblestone", 64));
withRoll(0, () => handSift(player, hand.block));
check("a full inventory leaves the gravel", player.inv.getItem(0)?.amount === 2);
player.inv.clearAll();

hand.input.setItem(0, new ItemStack("minecraft:gravel", 2));
withRoll(9999, () => handSift(player, hand.block));
check("empty hand sifts the top chest", hand.input.getItem(0)?.amount === 1);

// one piece even if duty and redstone are both on
const both = station(52, 40);
dispatch(by, { worker: sifterName, job: "sift", params: { at: [52, 80, 40] } });
setEnergy(sifter, 100);
// stop the rest job so the worker is on duty
if (String(sifter.getDynamicProperty("crew:job")).includes("rest")) dispatch(by, { worker: sifterName, job: "sift", params: { at: [52, 80, 40] } });
both.input.setItem(0, new ItemStack("minecraft:gravel", 5));
setRedstonePower(ow, both.at, 15);
setTimeOfDay(1000);
withRoll(0, () => tickSieves());
check("duty and redstone share one piece", both.input.getItem(0)?.amount === 4, both.input.getItem(0)?.amount);
setRedstonePower(ow, both.at, 0);
dispatch(by, { worker: sifterName, job: "stop", params: {} });

// place event registers the sieve; break gives it back, creative does not
const placedAt = { x: 54, y: 80, z: 40 };
ow.setBlockType(placedAt, SIEVE);
ow.setBlockType({ x: 54, y: 81, z: 40 }, "minecraft:chest");
ow.setBlockType({ x: 54, y: 79, z: 40 }, "minecraft:chest");
fire("world.afterEvents.playerPlaceBlock", { block: ow.getBlock(placedAt), player, dimension: ow });
const placedIn = ow.getBlock({ x: 54, y: 81, z: 40 }).getComponent("minecraft:inventory").container;
const placedOut = ow.getBlock({ x: 54, y: 79, z: 40 }).getComponent("minecraft:inventory").container;
placedIn.setItem(0, new ItemStack("minecraft:gravel", 1));
setRedstonePower(ow, placedAt, 15);
withRoll(0, () => tickSieves());
check("placing a sieve registers it", placedIn.getItem(0) === undefined && placedOut.getItem(0)?.typeId === "minecraft:flint");
setRedstonePower(ow, placedAt, 0);
const dropsBefore = log.spawnedItems.length;
fire("world.afterEvents.playerBreakBlock", {
  brokenBlockPermutation: { type: { id: SIEVE } },
  block: { location: placedAt, dimension: ow },
  dimension: ow,
  player: { getGameMode: () => "survival" },
});
check("breaking a sieve gives it back", log.spawnedItems.length === dropsBefore + 1 && log.spawnedItems.at(-1)?.typeId === SIEVE);
ow.setBlockType(placedAt, SIEVE);
fire("world.afterEvents.playerPlaceBlock", { block: ow.getBlock(placedAt), player, dimension: ow });
const creativeBefore = log.spawnedItems.length;
fire("world.afterEvents.playerBreakBlock", {
  brokenBlockPermutation: { type: { id: SIEVE } },
  block: { location: placedAt, dimension: ow },
  dimension: ow,
  player: { getGameMode: () => "creative" },
});
check("creative break does not drop a second sieve", log.spawnedItems.length === creativeBefore);

// the once-a-second pass is on the interval
const timed = station(56, 40);
timed.input.setItem(0, new ItemStack("minecraft:gravel", 2));
setRedstonePower(ow, timed.at, 15);
withRoll(0, () => tick(20));
check("the interval sifts on tick 20", timed.input.getItem(0)?.amount === 1, timed.input.getItem(0)?.amount);
setRedstonePower(ow, timed.at, 0);

// stake use does not sift
const stakeEv = fire("world.beforeEvents.playerInteractWithBlock", {
  block: timed.block, player, itemStack: { typeId: "crew:survey_stake" }, isFirstEvent: true,
});
check("the Survey Stake does not sift", stakeEv.cancel !== true && timed.input.getItem(0)?.amount === 1);

const useEv = fire("world.beforeEvents.playerInteractWithBlock", {
  block: hand.block, player, itemStack: undefined, isFirstEvent: true,
});
check("using the sieve is cancelled and runs", useEv.cancel === true);

if (fails.length) {
  console.log(`FAIL ${fails.length}/${checks}`);
  for (const f of fails) console.log(" - " + f);
  process.exit(1);
}
console.log(`sifter ok: ${checks} checks`);

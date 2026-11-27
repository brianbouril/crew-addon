// Woodcutter and Farmer (specs/woodcutter-farmer.md). Exits 1 on a wrong result.
import { BlockPermutation, ItemStack, setTimeOfDay, tick, world } from "@minecraft/server";
import { startEngine } from "./scripts/runner.js";
import { roleOf, spawnWorker } from "./scripts/workers.js";
import { dispatch } from "./scripts/orders.js";
import { advance, newSearch } from "./scripts/path.js";

const logs = [];
const out = console.log;
console.log = (...a) => logs.push(a.join(" "));
console.warn = (...a) => logs.push("WARN " + a.join(" "));
const fails = [];
let passed = 0;
const check = (name, ok, detail) => { if (ok) passed++; else fails.push(detail === undefined ? name : `${name}: ${JSON.stringify(detail)}`); };
const ow = world.getDimension("minecraft:overworld");
const by = { id: "p1", name: "Brian", isOp: false };
const owner = { id: "p1", name: "Brian" };
startEngine();
let t = 0;
const run = (n) => { for (const end = t + n; t < end;) tick(++t); };
const runUntil = (cond, max) => { for (let i = 0; i < max && !cond(); i++) tick(++t); return !!cond(); };
const jobOf = (e) => JSON.parse(String(e.getDynamicProperty("crew:job") ?? "null"));
const stateOf = (e) => JSON.parse(String(e.getDynamicProperty("crew:state") ?? "{}"));
const idAt = (p) => ow.getBlock(p)?.typeId;
const count = (items, id) => items.filter((i) => i?.typeId === id).reduce((a, i) => a + i.amount, 0);
const chestItems = (p) => ow.getBlock(p).getComponent("minecraft:inventory").container.items;

// ---- roles and footprint ----
const { e: woody } = spawnWorker(ow, { x: 100.5, y: 65, z: 100.5 }, owner, "Woody", [new ItemStack("minecraft:iron_axe")]);
const { e: tillie } = spawnWorker(ow, { x: 200.5, y: 65, z: 200.5 }, owner, "Tillie", [new ItemStack("minecraft:iron_hoe")]);
const { e: dig } = spawnWorker(ow, { x: 300.5, y: 65, z: 300.5 }, owner, "Diggy", [new ItemStack("minecraft:iron_shovel")]);
check("axe builds a Woodcutter", roleOf(woody) === "Woodcutter", roleOf(woody));
check("hoe builds a Farmer", roleOf(tillie) === "Farmer", roleOf(tillie));
const digForest = dispatch(by, { worker: "Diggy", job: "forest", params: { from: [100, 64, 100], to: [102, 64, 102], deposit: [100, 65, 98] } });
const woodField = dispatch(by, { worker: "Woody", job: "field", params: { from: [200, 64, 200], to: [201, 64, 200], deposit: [200, 65, 198] } });
const woodQuarry = dispatch(by, { worker: "Woody", job: "quarry", params: { from: [100, 63, 100], to: [103, 64, 103], deposit: [100, 65, 98] } });
const farmForest = dispatch(by, { worker: "Tillie", job: "forest", params: { from: [100, 64, 100], to: [102, 64, 102], deposit: [100, 65, 98] } });
check("a Digger refuses a forest", !digForest.ok && /Woodcutter/.test(digForest.message), digForest.message);
check("a Woodcutter refuses a field", !woodField.ok && /Farmer/.test(woodField.message), woodField.message);
check("a Woodcutter refuses a quarry", !woodQuarry.ok && /Digger/.test(woodQuarry.message), woodQuarry.message);
check("a Farmer refuses a forest", !farmForest.ok && /Woodcutter/.test(farmForest.message), farmForest.message);
const tooBig = dispatch(by, { worker: "Woody", job: "forest", params: { from: [0, 64, 0], to: [64, 64, 64], deposit: [100, 65, 98] } });
check("65 by 65 is refused", !tooBig.ok && /64/.test(tooBig.message), tooBig.message);

// ---- forest ----
ow.setBlockType({ x: 100, y: 65, z: 98 }, "minecraft:chest");
ow.setBlockType({ x: 104, y: 65, z: 104 }, "minecraft:oak_log");
ow.setBlockType({ x: 104, y: 66, z: 104 }, "minecraft:oak_leaves");
ow.setBlockType({ x: 105, y: 65, z: 104 }, "minecraft:bee_nest");
ow.setBlockType({ x: 103, y: 65, z: 104 }, "minecraft:oak_planks");
ow.setBlockType({ x: 106, y: 65, z: 104 }, "minecraft:oak_log"); // no leaves: a built log
ow.setBlockType({ x: 104, y: 112, z: 106 }, "minecraft:oak_log");
ow.setBlockType({ x: 104, y: 113, z: 106 }, "minecraft:oak_leaves");
// 2x2 dark oak, four leaves so four saplings come from the cut
for (const [dx, dz] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
  ow.setBlockType({ x: 108 + dx, y: 65, z: 108 + dz }, "minecraft:dark_oak_log");
  ow.setBlockType({ x: 108 + dx, y: 66, z: 108 + dz }, "minecraft:dark_oak_leaves");
}
// crimson stem whose leaves don't drop a fungus, and no fungus in either chest
ow.setBlockType({ x: 112, y: 65, z: 104 }, "minecraft:crimson_stem");
ow.setBlockType({ x: 112, y: 66, z: 104 }, "minecraft:nether_wart_block");
const started = dispatch(by, { worker: "Woody", job: "forest", params: { from: [100, 64, 100], to: [116, 64, 116], deposit: [100, 65, 98] } });
check("forest starts", started.ok, started.message);
const grew = runUntil(() => idAt({ x: 104, y: 65, z: 104 }) === "minecraft:oak_sapling" && jobOf(woody)?.type === "forest", 8000);
check("oak is replanted on the stump and the job keeps going", grew, { at: idAt({ x: 104, y: 65, z: 104 }), job: jobOf(woody)?.type });
check("oak leaves are gone", idAt({ x: 104, y: 66, z: 104 }) !== "minecraft:oak_leaves");
check("the bee nest stays", idAt({ x: 105, y: 65, z: 104 }) === "minecraft:bee_nest");
check("a beehive is reported", logs.some((l) => l.includes('"beehive"')));
check("planks stay", idAt({ x: 103, y: 65, z: 104 }) === "minecraft:oak_planks");
check("a log with no leaves stays", idAt({ x: 106, y: 65, z: 104 }) === "minecraft:oak_log");
check("a tree above 48 blocks stays", idAt({ x: 104, y: 112, z: 106 }) === "minecraft:oak_log");
const dumped = runUntil(() => count(chestItems({ x: 100, y: 65, z: 98 }), "minecraft:oak_log") >= 1, 4000);
check("the log and the apple are in the deposit", dumped && count(chestItems({ x: 100, y: 65, z: 98 }), "minecraft:apple") >= 1, chestItems({ x: 100, y: 65, z: 98 }).filter(Boolean).map((i) => [i.typeId, i.amount]));
const dark = [[0, 0], [1, 0], [0, 1], [1, 1]].every(([dx, dz]) => idAt({ x: 108 + dx, y: 65, z: 108 + dz }) === "minecraft:dark_oak_sapling");
const darkDone = dark || runUntil(() => [[0, 0], [1, 0], [0, 1], [1, 1]].every(([dx, dz]) => idAt({ x: 108 + dx, y: 65, z: 108 + dz }) === "minecraft:dark_oak_sapling"), 8000);
check("a 2 by 2 trunk gets four saplings", darkDone);
const skippedFungus = runUntil(() => logs.some((l) => l.includes("crimson fungus") && l.includes('"skipped"')), 8000);
check("no fungus to replant is logged, and none is placed", skippedFungus && idAt({ x: 112, y: 65, z: 104 }) !== "minecraft:crimson_fungus", idAt({ x: 112, y: 65, z: 104 }));

// ---- night, then the same forest in the morning ----
setTimeOfDay(13000);
runUntil(() => jobOf(woody)?.type === "rest", 80);
check("at night the woodcutter sleeps", jobOf(woody)?.type === "rest", jobOf(woody));
check("the forest is paused for morning", !!woody.getDynamicProperty("crew:paused"));
setTimeOfDay(1000);
const back = runUntil(() => jobOf(woody)?.type === "forest", 400);
check("in the morning the forest resumes", back, jobOf(woody)?.type);
dispatch(by, { worker: "Woody", job: "stop", params: {} });
check("stop ends it", !jobOf(woody));
const again = dispatch(by, { worker: "Woody", job: "resume", params: {} });
check("resume picks the forest back up", again.ok && jobOf(woody)?.type === "forest", again.message);

// ---- field ----
ow.setBlockType({ x: 200, y: 65, z: 198 }, "minecraft:chest");
ow.setBlockType({ x: 202, y: 64, z: 200 }, "minecraft:dirt");
ow.setBlockType({ x: 203, y: 64, z: 200 }, "minecraft:dirt");
ow.getBlock({ x: 203, y: 65, z: 200 }).setPermutation(BlockPermutation.resolve("minecraft:wheat", { age: 7 }));
ow.setBlockType({ x: 203, y: 64, z: 200 }, "minecraft:farmland");
ow.setBlockType({ x: 204, y: 64, z: 200 }, "minecraft:dirt");
tillie.inv.setItem(6, new ItemStack("minecraft:wheat_seeds", 4));
tillie.inv.setItem(7, new ItemStack("minecraft:pumpkin_seeds", 2));
tillie.inv.setItem(8, new ItemStack("minecraft:bone_meal", 1));
const field = dispatch(by, { worker: "Tillie", job: "field", params: { from: [202, 64, 200], to: [205, 64, 200], deposit: [200, 65, 198] } });
check("field starts", field.ok, field.message);
const planted = runUntil(() => idAt({ x: 202, y: 64, z: 200 }) === "minecraft:farmland" && idAt({ x: 202, y: 65, z: 200 }) === "minecraft:wheat", 6000);
check("empty dirt is tilled and planted", planted, { ground: idAt({ x: 202, y: 64, z: 200 }), crop: idAt({ x: 202, y: 65, z: 200 }) });
const harvested = runUntil(() => count(chestItems({ x: 200, y: 65, z: 198 }), "minecraft:wheat") >= 1 && idAt({ x: 203, y: 65, z: 200 }) === "minecraft:wheat", 6000);
check("mature wheat is harvested, replanted, and stored", harvested, { crop: idAt({ x: 203, y: 65, z: 200 }), chest: count(chestItems({ x: 200, y: 65, z: 198 }), "minecraft:wheat") });
check("pumpkin seeds are not invented into a block", logs.some((l) => l.includes("pumpkin_seeds") && l.includes('"skipped"')));
check("nothing is cooked", ![...tillie.inv.items, ...chestItems({ x: 200, y: 65, z: 198 })].some((i) => /baked|cooked|bread/.test(i?.typeId ?? "")));
// nether wart: dirt, no soul sand, then soul sand arrives
ow.setBlockType({ x: 206, y: 64, z: 210 }, "minecraft:dirt");
ow.setBlockType({ x: 206, y: 65, z: 208 }, "minecraft:chest");
const { e: nether } = spawnWorker(ow, { x: 206.5, y: 65, z: 209.5 }, owner, "Nelly", [new ItemStack("minecraft:iron_hoe")]);
nether.inv.setItem(6, new ItemStack("minecraft:nether_wart", 2));
dispatch(by, { worker: "Nelly", job: "field", params: { from: [206, 64, 210], to: [206, 64, 210], deposit: [206, 65, 208] } });
const toldSoil = runUntil(() => logs.some((l) => l.includes("soul sand") && l.includes("Nelly") && l.includes('"skipped"')), 4000);
check("nether wart without soul sand is skipped and the dirt stays", toldSoil && idAt({ x: 206, y: 64, z: 210 }) === "minecraft:dirt", idAt({ x: 206, y: 64, z: 210 }));
nether.inv.setItem(7, new ItemStack("minecraft:soul_sand", 1));
const wart = runUntil(() => idAt({ x: 206, y: 64, z: 210 }) === "minecraft:soul_sand" && idAt({ x: 206, y: 65, z: 210 }) === "minecraft:nether_wart", 4000);
check("soul sand the player provided is placed, then the wart", wart, { ground: idAt({ x: 206, y: 64, z: 210 }), crop: idAt({ x: 206, y: 65, z: 210 }) });

// bonemeal advances one stage, from the player's stock
ow.setBlockType({ x: 210, y: 64, z: 220 }, "minecraft:farmland");
ow.getBlock({ x: 210, y: 65, z: 220 }).setPermutation(BlockPermutation.resolve("minecraft:wheat", { age: 6 }));
ow.setBlockType({ x: 210, y: 65, z: 218 }, "minecraft:chest");
const { e: bon } = spawnWorker(ow, { x: 210.5, y: 65, z: 219.5 }, owner, "Bonny", [new ItemStack("minecraft:iron_hoe")]);
bon.inv.setItem(6, new ItemStack("minecraft:bone_meal", 1));
bon.inv.setItem(7, new ItemStack("minecraft:wheat_seeds", 2));
dispatch(by, { worker: "Bonny", job: "field", params: { from: [210, 64, 220], to: [210, 64, 220], deposit: [210, 65, 218] } });
const aged = runUntil(() => count(bon.inv.items, "minecraft:bone_meal") === 0, 3000);
const ageNow = ow.getBlock({ x: 210, y: 65, z: 220 })?.permutation?.getState?.("age");
check("one bonemeal advances the crop one stage", aged && (ageNow === 7 || count(chestItems({ x: 210, y: 65, z: 218 }), "minecraft:wheat") >= 1), { age: ageNow, meal: count(bon.inv.items, "minecraft:bone_meal") });

// ---- path goes around a crop when it can ----
ow.setBlockType({ x: 0, y: 65, z: 2 }, "minecraft:farmland");
const search = newSearch(ow, { x: 0.5, y: 65, z: 0.5 }, { x: 0, y: 65, z: 4 }, 1.2, false);
let guard = 0;
let found = "searching";
while (found === "searching" && guard++ < 50) found = advance(search, 200);
const stepped = (search.path ?? []).some((p) => p.x === 0 && p.y === 65 && p.z === 2);
check("the path walks around the crop", found === "found" && !stepped, { found, path: search.path });

check("no job errors", !logs.some((l) => /job error|job_failed/.test(l)), logs.filter((l) => /job error|job_failed/.test(l)).slice(0, 4));

console.log = out;
console.log(JSON.stringify({ checks: "woodcutter and farmer", passed, failed: fails.length }, null, 1));
for (const f of fails) console.log("FAIL", f);
if (fails.length || logs.some((l) => /job error|job_failed/.test(l))) process.exit(1);

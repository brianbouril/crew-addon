// Woodcutter and Farmer (specs/woodcutter-farmer.md). Exits 1 on a wrong result.
import { BlockPermutation, ItemStack, setTimeOfDay, tick, world } from "@minecraft/server";
import { startEngine } from "./scripts/runner.js";
import { roleOf, spawnWorker } from "./scripts/workers.js";
import { dispatch } from "./scripts/orders.js";
import { advance, newSearch } from "./scripts/path.js";
import { channelCells } from "./scripts/plots.js";

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
check("wheat is still what gets planted when the field is already wheat", idAt({ x: 202, y: 65, z: 200 }) === "minecraft:wheat");
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

// ---- water channels: long side, middle of each 9-block band ----
const band = channelCells({ min: { x: 0, y: 64, z: 0 }, max: { x: 8, y: 64, z: 2 } });
check("a 9 by 3 field waters the middle row, along its length", band.length === 9 && band.every((c) => c.z === 1 && c.y === 64), band);
const square = channelCells({ min: { x: 0, y: 64, z: 0 }, max: { x: 8, y: 64, z: 8 } });
check("a square field's channel runs east-west", square.every((c) => c.z === 4) && new Set(square.map((c) => c.x)).size === 9);
ow.setBlockType({ x: 500, y: 65, z: 498 }, "minecraft:chest");
const { e: wet } = spawnWorker(ow, { x: 500.5, y: 65, z: 499.5 }, owner, "Wendy", [new ItemStack("minecraft:iron_hoe")]);
for (let i = 0; i < 9; i++) wet.inv.setItem(6 + i, new ItemStack("minecraft:water_bucket", 1));
dispatch(by, { worker: "Wendy", job: "field", params: { from: [500, 64, 500], to: [508, 64, 502], deposit: [500, 65, 498] } });
const watered = runUntil(() => [500, 504, 508].every((x) => idAt({ x, y: 64, z: 501 }) === "minecraft:water") && idAt({ x: 500, y: 64, z: 500 }) !== "minecraft:water", 8000);
check("buckets become a water row, and the crop rows stay dry", watered, { mid: idAt({ x: 504, y: 64, z: 501 }), edge: idAt({ x: 500, y: 64, z: 500 }) });
const dry = dispatch(by, { worker: "Tillie", job: "stop", params: {} });
check("stop still works", dry.ok, dry.message);
const toldDry = logs.some((l) => l.includes("water_bucket") && l.includes('"skipped"'));
check("no bucket is reported, and a lake is not used", toldDry && idAt({ x: 206, y: 64, z: 209 }) !== "minecraft:water");

// ---- stems, cocoa, berries, columns ----
ow.setBlockType({ x: 320, y: 64, z: 320 }, "minecraft:farmland");
ow.getBlock({ x: 320, y: 65, z: 320 }).setPermutation(BlockPermutation.resolve("minecraft:pumpkin_stem", { age: 7 }));
ow.setBlockType({ x: 321, y: 65, z: 320 }, "minecraft:pumpkin");
ow.setBlockType({ x: 320, y: 65, z: 318 }, "minecraft:chest");
const { e: patch } = spawnWorker(ow, { x: 320.5, y: 65, z: 319.5 }, owner, "Patch", [new ItemStack("minecraft:iron_hoe")]);
dispatch(by, { worker: "Patch", job: "field", params: { from: [320, 64, 320], to: [322, 64, 322], deposit: [320, 65, 318] } });
const fruit = runUntil(() => idAt({ x: 321, y: 65, z: 320 }) !== "minecraft:pumpkin" && idAt({ x: 320, y: 65, z: 320 }) === "minecraft:pumpkin_stem", 5000);
check("the pumpkin is picked and the stem stays", fruit, { fruit: idAt({ x: 321, y: 65, z: 320 }), stem: idAt({ x: 320, y: 65, z: 320 }) });
ow.setBlockType({ x: 330, y: 65, z: 330 }, "minecraft:jungle_log");
ow.setBlockType({ x: 331, y: 65, z: 330 }, "minecraft:air");
ow.getBlock({ x: 331, y: 65, z: 330 }).setPermutation(BlockPermutation.resolve("minecraft:cocoa", { age: 2, direction: 3 }));
ow.setBlockType({ x: 330, y: 65, z: 328 }, "minecraft:chest");
const { e: coco } = spawnWorker(ow, { x: 330.5, y: 66, z: 329.5 }, owner, "Coco", [new ItemStack("minecraft:iron_hoe")]);
dispatch(by, { worker: "Coco", job: "field", params: { from: [330, 65, 330], to: [332, 65, 332], deposit: [330, 65, 328] } });
const pod = runUntil(() => {
  const b = ow.getBlock({ x: 331, y: 65, z: 330 });
  return b?.typeId === "minecraft:cocoa" && Number(b.permutation?.getState?.("age") ?? 9) === 0;
}, 5000);
check("cocoa is picked and replanted on the jungle log", pod, ow.getBlock({ x: 331, y: 65, z: 330 })?.typeId);
ow.setBlockType({ x: 340, y: 64, z: 340 }, "minecraft:dirt");
ow.getBlock({ x: 340, y: 65, z: 340 }).setPermutation(BlockPermutation.resolve("minecraft:sweet_berry_bush", { age: 3 }));
ow.setBlockType({ x: 340, y: 65, z: 338 }, "minecraft:chest");
const { e: berry } = spawnWorker(ow, { x: 340.5, y: 65, z: 339.5 }, owner, "Berry", [new ItemStack("minecraft:iron_hoe")]);
dispatch(by, { worker: "Berry", job: "field", params: { from: [340, 64, 340], to: [342, 64, 342], deposit: [340, 65, 338] } });
const picked = runUntil(() => Number(ow.getBlock({ x: 340, y: 65, z: 340 })?.permutation?.getState?.("age") ?? 9) === 1, 5000);
check("berries are picked and the bush stays at age 1", picked && idAt({ x: 340, y: 65, z: 340 }) === "minecraft:sweet_berry_bush");
ow.setBlockType({ x: 350, y: 64, z: 350 }, "minecraft:sand");
ow.setBlockType({ x: 351, y: 64, z: 350 }, "minecraft:water");
ow.setBlockType({ x: 350, y: 65, z: 350 }, "minecraft:sugar_cane");
ow.setBlockType({ x: 350, y: 66, z: 350 }, "minecraft:sugar_cane");
ow.setBlockType({ x: 350, y: 65, z: 348 }, "minecraft:chest");
const { e: cane } = spawnWorker(ow, { x: 350.5, y: 65, z: 349.5 }, owner, "Cane", [new ItemStack("minecraft:iron_hoe")]);
dispatch(by, { worker: "Cane", job: "field", params: { from: [350, 64, 350], to: [350, 64, 350], deposit: [350, 65, 348] } });
const cutCane = runUntil(() => idAt({ x: 350, y: 66, z: 350 }) !== "minecraft:sugar_cane" && idAt({ x: 350, y: 65, z: 350 }) === "minecraft:sugar_cane", 5000);
check("sugar cane keeps its base", cutCane, { base: idAt({ x: 350, y: 65, z: 350 }), top: idAt({ x: 350, y: 66, z: 350 }) });
ow.setBlockType({ x: 360, y: 64, z: 360 }, "minecraft:sand");
ow.setBlockType({ x: 360, y: 65, z: 360 }, "minecraft:cactus");
ow.setBlockType({ x: 360, y: 66, z: 360 }, "minecraft:cactus");
ow.setBlockType({ x: 360, y: 65, z: 358 }, "minecraft:chest");
const { e: cact } = spawnWorker(ow, { x: 360.5, y: 65, z: 359.5 }, owner, "Barb", [new ItemStack("minecraft:iron_hoe")]);
dispatch(by, { worker: "Barb", job: "field", params: { from: [360, 64, 360], to: [360, 64, 360], deposit: [360, 65, 358] } });
const cutCactus = runUntil(() => idAt({ x: 360, y: 66, z: 360 }) !== "minecraft:cactus" && idAt({ x: 360, y: 65, z: 360 }) === "minecraft:cactus", 5000);
check("cactus keeps its base", cutCactus, { base: idAt({ x: 360, y: 65, z: 360 }), top: idAt({ x: 360, y: 66, z: 360 }) });
ow.setBlockType({ x: 370, y: 64, z: 370 }, "minecraft:dirt");
ow.setBlockType({ x: 370, y: 65, z: 370 }, "minecraft:bamboo");
ow.setBlockType({ x: 370, y: 66, z: 370 }, "minecraft:bamboo");
ow.setBlockType({ x: 370, y: 65, z: 368 }, "minecraft:chest");
const { e: bam } = spawnWorker(ow, { x: 370.5, y: 65, z: 369.5 }, owner, "Bam", [new ItemStack("minecraft:iron_hoe")]);
dispatch(by, { worker: "Bam", job: "field", params: { from: [370, 64, 370], to: [370, 64, 370], deposit: [370, 65, 368] } });
const cutBam = runUntil(() => idAt({ x: 370, y: 66, z: 370 }) !== "minecraft:bamboo" && idAt({ x: 370, y: 65, z: 370 }) === "minecraft:bamboo", 5000);
check("bamboo keeps its base", cutBam, { base: idAt({ x: 370, y: 65, z: 370 }), top: idAt({ x: 370, y: 66, z: 370 }) });
ow.setBlockType({ x: 380, y: 64, z: 380 }, "minecraft:dirt");
ow.setBlockType({ x: 380, y: 65, z: 378 }, "minecraft:chest");
const { e: nosand } = spawnWorker(ow, { x: 380.5, y: 65, z: 379.5 }, owner, "Sandy", [new ItemStack("minecraft:iron_hoe")]);
nosand.inv.setItem(6, new ItemStack("minecraft:sugar_cane", 2));
dispatch(by, { worker: "Sandy", job: "field", params: { from: [380, 64, 380], to: [382, 64, 382], deposit: [380, 65, 378] } });
const needsSand = runUntil(() => logs.some((l) => l.includes("Sandy") && l.includes("sand") && l.includes('"skipped"')), 4000);
check("cane without sand is reported and the dirt stays", needsSand && idAt({ x: 380, y: 64, z: 380 }) === "minecraft:dirt", idAt({ x: 380, y: 64, z: 380 }));

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

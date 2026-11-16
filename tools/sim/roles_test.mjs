// Digger and Miner, a hard split (decision 32, Brian Nov 15):
// - the first tool in the barrel sets the role (a shovel first makes a Digger even with a diamond pickaxe);
// - a Miner refuses a quarry, and nobody is offered the branch mine any more (it's kept for prospecting);
// - workers built before the split become Diggers once, and still continue a dig they had paused.
import { world, tick, ItemStack } from "@minecraft/server";
import { startEngine } from "./scripts/runner.js";
import { roleOf, spawnWorker } from "./scripts/workers.js";
import { dispatch } from "./scripts/orders.js";
import { catalogText, toolSchemas } from "./scripts/catalog.js";
import { roleKinds } from "./scripts/tools.js";

const logs = []; const out = console.log; console.log = (...a) => logs.push(a.join(" ")); console.warn = (...a) => logs.push("WARN " + a.join(" "));
const ow = world.getDimension("minecraft:overworld");
const by = { id: "p1", name: "Brian", isOp: false };
const owner = { id: "p1", name: "Brian" };
startEngine();
let t = 0;
const run = (n) => { for (const end = t + n; t < end;) tick(++t); };
ow.setBlockType({ x: 1800, y: 65, z: 1790 }, "minecraft:chest");
const quarry = { from: [1800, 63, 1800], to: [1803, 64, 1803], facing: "south", deposit: [1800, 65, 1790], keep: "all" };
const branch = { start: [1820, 64, 1800], facing: "south", target_y: 62, trunk_length: 6, branch_length: 2, spacing: 2, deposit: [1800, 65, 1790], keep: "all" };

// 1. role at build: the first tool's kind
const { e: dig } = spawnWorker(ow, { x: 1798.5, y: 65, z: 1798.5 }, owner, "Shovelly", [new ItemStack("minecraft:iron_shovel"), new ItemStack("minecraft:diamond_pickaxe")]);
const { e: min } = spawnWorker(ow, { x: 1818.5, y: 65, z: 1798.5 }, owner, "Picky", [new ItemStack("minecraft:stone_pickaxe"), new ItemStack("minecraft:diamond_shovel")]);
const roles = { shovelFirst: roleOf(dig), pickaxeFirst: roleOf(min) };

// 2. orders by role
const minerQuarry = dispatch(by, { worker: "Picky", job: "quarry", params: quarry });
const minerBranch = dispatch(by, { worker: "Picky", job: "branch_mine", params: branch });
const diggerBranch = dispatch(by, { worker: "Shovelly", job: "branch_mine", params: branch });
const diggerQuarry = dispatch(by, { worker: "Shovelly", job: "quarry", params: quarry });
run(4000);
const quarryDone = !dig.getDynamicProperty("crew:job");

// 3. a worker from before the split: a Miner with a paused branch mine becomes a Digger and can still continue it
const internalBranch = dispatch(by, { internal: true, worker: "Picky", job: "branch_mine", params: { ...branch, trunk_length: 24, branch_length: 6 } });
const waited = 400;
run(waited);
dispatch(by, { worker: "Picky", job: "stop", params: {} });
const pausedBefore = !!min.getDynamicProperty("crew:paused");
min.setDynamicProperty("crew:roleSplit", undefined); // as if built by 0.4.0
run(100);
const migrated = { role: roleOf(min), told: logs.some((l) => l.includes('"role_changed"')) };
const pausedAt = JSON.parse(String(min.getDynamicProperty("crew:paused") ?? "{}")).st?.i ?? 0;
const cont = dispatch(by, { worker: "Picky", job: "resume", params: {} });
run(1500);
// it's back on the same branch mine and getting further (as a Digger)
const jobNow = JSON.parse(String(min.getDynamicProperty("crew:job") ?? "{}"));
const stNow = JSON.parse(String(min.getDynamicProperty("crew:state") ?? "{}"));
const branchGoesOn = jobNow.type === "branch_mine" && (stNow.i ?? 0) > pausedAt;
run(100);
const toldTwice = logs.filter((l) => l.includes('"role_changed"')).length;

console.log = out;
const result = {
  roles,
  minerQuarryRefused: !minerQuarry.ok && minerQuarry.message.includes("Digger's job"),
  minerBranchRefused: !minerBranch.ok && minerBranch.message.includes("aren't offered"),
  diggerBranchRefused: !diggerBranch.ok,
  diggerQuarry: diggerQuarry.ok, quarryDone,
  branchHidden: !catalogText().includes("branch_mine") && !toolSchemas().some((s) => s.name === "branch_mine"),
  diggerKeepsPickaxes: roleKinds("Digger").includes("pickaxe"),
  pausedBefore, migrated, continued: cont.ok, branchGoesOn, toldOnce: toldTwice === 1,
};
console.log(JSON.stringify(result, null, 1));
console.log(minerQuarry.message);
console.log("internal branch:", internalBranch.message, "| waited", waited, "| continue:", cont.message);
console.log(logs.filter((l) => /WARN|failed/.test(l)).join("\n"));
const ok = roles.shovelFirst === "Digger" && roles.pickaxeFirst === "Miner" && result.minerQuarryRefused && result.minerBranchRefused && result.diggerBranchRefused
  && diggerQuarry.ok && quarryDone && result.branchHidden && result.diggerKeepsPickaxes && pausedBefore && migrated.role === "Digger" && migrated.told && cont.ok && branchGoesOn && result.toldOnce;
if (!ok) { console.log("FAIL"); process.exit(1); }

// Branch mine: stairs down, 2x2 trunk, 1x2 branches with 2 solid blocks between, far end first.
// Two obsidian blocks fill one branch cell top and bottom: the worker digs a detour around them.
import { world, tick, ItemStack } from "@minecraft/server";
import { startEngine } from "./scripts/runner.js";
import { findWorker, setRole, spawnWorker } from "./scripts/workers.js";
import { dispatch } from "./scripts/orders.js";

const logs = []; const out = console.log; console.log = (...a) => logs.push(a.join(" ")); console.warn = (...a) => logs.push("WARN " + a.join(" "));
const ow = world.getDimension("minecraft:overworld");
ow.setBlockType({ x: 40, y: 65, z: 46 }, "minecraft:chest");
const start = { x: 40, y: 64, z: 40 }, ty = 52, L = 20, B = 8, S = 2; // heading north (-z); right = east (+x)
const W = Number(process.argv[2] ?? 2); // trunk width
// obsidian in the 3rd cell of the left branch at trunk index 14 (both feet and head)
const n = start.y + 1 - ty;
const P = (j) => ({ x: start.x, y: ty, z: start.z + 1 - 1 - (n + j) });
const ob = { x: P(14).x - 3, y: ty, z: P(14).z };
ow.setBlockType(ob, "minecraft:obsidian"); ow.setBlockType({ ...ob, y: ty + 1 }, "minecraft:obsidian");
ow.setBlockType({ x: P(5).x + 4, y: ty, z: P(5).z }, "minecraft:diamond_ore");
// an iron vein in the trunk's left wall at index 10 (not a branch spot): one block in the wall, two behind it
const vein = [{ x: P(10).x - 1, y: ty, z: P(10).z }, { x: P(10).x - 2, y: ty, z: P(10).z }, { x: P(10).x - 2, y: ty + 1, z: P(10).z }];
for (const v of vein) ow.setBlockType(v, "minecraft:iron_ore");
const veinKeys = new Set(vein.map((v) => `${v.x},${v.y},${v.z}`));
const before = new Map(ow.blocks);
startEngine();
const by = { id: "p1", name: "Brian", isOp: false };
// one iron pickaxe (250 uses) can't finish ~600 blocks, so give it Unbreaking III; no diamond tool, so obsidian stays a skip
const ub = new ItemStack("minecraft:iron_pickaxe"); ub.enchants.unbreaking = 3;
const { e } = spawnWorker(ow, { x: 40.5, y: 65, z: 48.5 }, { id: "p1", name: "Brian" }, "Pip", [ub, new ItemStack("minecraft:torch", 32)]);
const order = dispatch(by, { internal: true, worker: "Pip", job: "branch_mine", params: { start: [start.x, start.y, start.z], facing: "north", target_y: ty, trunk_length: L, trunk_width: W, branch_length: B, spacing: S, deposit: [40, 65, 46], keep: "valuables" } });
let t = 0;
while (e.getDynamicProperty("crew:job") && t < 200000) tick(++t);
// expected open cells
const want = new Set(); const add = (x, y, z) => want.add(`${x},${y},${z}`);
for (let k = 1; k <= n; k++) for (let h = 0; h < 3; h++) add(start.x, start.y + 1 - k + h, start.z - (k - 1));
const branchAt = []; for (let j = S; j < L; j += S + 1) branchAt.push(j);
for (let j = 0; j < L; j++) for (let dx = 0; dx < W; dx++) for (const h of [0, 1]) add(P(j).x + dx, ty + h, P(j).z);
for (const j of branchAt) for (let m = 1; m <= B; m++) for (const h of [0, 1]) { add(P(j).x - m, ty + h, P(j).z); add(P(j).x + W - 1 + m, ty + h, P(j).z); }
let missing = [], extra = [], torches = [];
for (let x = start.x - B - 4; x <= start.x + B + 5; x++) for (let y = ty - 2; y <= start.y + 3; y++) for (let z = start.z - n - L - 3; z <= start.z + 3; z++) {
  const k = `${x},${y},${z}`; const tt = ow.typeAt({ x, y, z }); const open = /air|torch/.test(tt);
  if (/torch/.test(tt)) torches.push(k);
  const changed = ow.blocks.get(k) !== before.get(k);
  if (want.has(k) && !open) missing.push(`${tt}@${k}`);
  if (!want.has(k) && changed && !veinKeys.has(k)) extra.push(k);
}
// the vein: mined and the holes filled back with what it dug, so the wall stays solid
const veinNow = vein.map((v) => ow.typeAt(v).replace("minecraft:", ""));
const ironKept = e.inv.items.concat(ow.getBlock({ x: 40, y: 65, z: 46 }).getComponent("minecraft:inventory").container.items).filter((s) => s?.typeId === "minecraft:raw_iron").reduce((a, s) => a + s.amount, 0);
// torches: every tunnel block within 6 blocks (walking) of one, so light stays 8+
const tunnel = [...want].map((k) => k.split(",").map(Number)).filter(([, y]) => y === ty);
const tp = torches.map((k) => k.split(",").map(Number));
const darkest = Math.max(...tunnel.map(([x, , z]) => Math.min(...tp.map(([a, , c]) => Math.abs(a - x) + Math.abs(c - z)))));
// between neighbouring branches on the left side, count solid blocks along the trunk
const gaps = branchAt.slice(1).map((j, i) => j - branchAt[i] - 1);
console.log = out;
console.log(JSON.stringify({ trunkWidth: W, order: order.message, ticks: t, minutes: +(t / 1200).toFixed(1), stairs: n, branchAt, solidBetweenBranches: [...new Set(gaps)],
  expectedOpen: want.size, missing, extraDugCells: extra.length, extraDug: extra.slice(0, 12),
  veinAfter: veinNow, rawIronCollected: ironKept, torchesPlaced: torches.length, farthestFromTorch: darkest, skipped: JSON.parse(e.getDynamicProperty("crew:skipped") ?? "null"),
  shortcutsTaken: logs.filter((l) => l.includes('"stuck"')).length }, null, 1));
console.log(logs.filter((l) => /job_started|skipped"|detour|job_done|stuck|WARN|failed/.test(l)).slice(0, 20).join("\n"));

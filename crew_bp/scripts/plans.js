// Geometry for the two dig modes. A job stores a handful of numbers, and every step is
// computed from its index, so even a 128x128x128 quarry never needs a big list saved.
//
// A step is { stand?, mine?, keep?, sides? }:
//   mine  = cells to break (in order), stand = where the worker moves after,
//   keep  = a quarry stair block to leave (or patch with cobblestone),
//   fwd   = direction of travel, sides = offsets to try for a detour around a step whose
//           cells all had to be left in place (blocks no tool in the kit can harvest).

/** @typedef {{x:number,y:number,z:number}} V3 */

export const FACINGS = ["north", "east", "south", "west"];
/** @type {Record<string, {x:number,z:number}>} */
export const DIRS = { north: { x: 0, z: -1 }, east: { x: 1, z: 0 }, south: { x: 0, z: 1 }, west: { x: -1, z: 0 } };
/** Right-hand side of a direction (looking down from above). @param {{x:number,z:number}} d */
export const rightOf = (d) => ({ x: -d.z, z: d.x });
/** Cardinal facing from a yaw in degrees (0 = south, 90 = west, 180 = north, -90 = east). @param {number} yaw */
export function facingFromYaw(yaw) {
  const a = ((Math.round(yaw / 90) % 4) + 4) % 4;
  return ["south", "west", "north", "east"][a];
}

/** @param {V3} p @param {{x:number,z:number}} v @param {number} m */
export const off = (p, v, m) => ({ x: p.x + v.x * m, y: p.y, z: p.z + v.z * m });
/** @param {V3} p @param {number} h */
export const column = (p, h) => Array.from({ length: h }, (_, i) => ({ x: p.x, y: p.y + i, z: p.z }));

// ---------------- quarry ----------------
/**
 * Quarry from the corner block on the surface: L blocks forward, W to the right, D down
 * (the corner's own layer included). A 1-wide staircase spirals down the walls clockwise,
 * starting at the corner, one block down per block along.
 * @param {V3} anchor @param {string} facing @param {number} L @param {number} W @param {number} D
 */
export function quarryGeom(anchor, facing, L, W, D) {
  const d = DIRS[facing], r = rightOf(d);
  const far = off(off(anchor, d, L - 1), r, W - 1);
  const min = { x: Math.min(anchor.x, far.x), y: anchor.y - D + 1, z: Math.min(anchor.z, far.z) };
  const max = { x: Math.max(anchor.x, far.x), y: anchor.y, z: Math.max(anchor.z, far.z) };
  const size = { x: max.x - min.x + 1, y: D, z: max.z - min.z + 1 };
  return { anchor, facing, L, W, D, min, max, size, total: size.x * size.y * size.z };
}

/** Quarry geometry from two corners (for orders that only give a box). @param {V3} min @param {V3} max @param {string} facing */
export function quarryFromBox(min, max, facing) {
  const d = DIRS[facing], r = rightOf(d);
  const anchor = { x: d.x + r.x > 0 ? min.x : max.x, y: max.y, z: d.z + r.z > 0 ? min.z : max.z };
  const ext = { x: max.x - min.x + 1, z: max.z - min.z + 1 };
  const L = d.x !== 0 ? ext.x : ext.z;
  const W = d.x !== 0 ? ext.z : ext.x;
  return quarryGeom(anchor, facing, L, W, max.y - min.y + 1);
}

/** k-th cell of the wall ring, clockwise from the corner. @param {any} g @param {number} k */
export function ringAt(g, k) {
  const d = DIRS[g.facing], r = rightOf(d);
  const { L, W, anchor } = g;
  const P = 2 * (L + W) - 4;
  let t = ((k % P) + P) % P;
  if (t < L) return off(anchor, d, t);
  t -= L;
  if (t < W - 1) return off(off(anchor, d, L - 1), r, t + 1);
  t -= W - 1;
  if (t < L - 1) return off(off(anchor, r, W - 1), d, L - 2 - t);
  t -= L - 1;
  return off(anchor, r, W - 2 - t);
}

/** Stair block under step k (k = 0 .. D-2); the worker stands on it at y = top - k. @param {any} g @param {number} k */
export const stairBlock = (g, k) => ({ ...ringAt(g, k), y: g.max.y - 1 - k });
/** @param {any} g @param {V3} c */
export function isStairBlock(g, c) {
  const k = g.max.y - 1 - c.y;
  if (k < 0 || k > g.D - 2) return false;
  const s = ringAt(g, k);
  return s.x === c.x && s.z === c.z;
}

/** Cell i: layers top-down, serpentine rows, every other layer reversed so cells stay adjacent. @param {any} g @param {number} i */
export function quarryCell(g, i) {
  const { min, max, size } = g;
  const per = size.x * size.z;
  const layer = Math.floor(i / per);
  let k = i % per;
  if (layer % 2 === 1) k = per - 1 - k;
  const row = Math.floor(k / size.x);
  let col = k % size.x;
  if (row % 2 === 1) col = size.x - 1 - col;
  return { x: min.x + col, y: max.y - layer, z: min.z + row };
}

// ---------------- branch mine ----------------
/**
 * Branch mine from the ground block where the stairs start. Stairs (3 tall) go down forward
 * to targetY, then a 2-wide x 2-tall trunk runs `trunk` blocks forward. Coming back, the worker
 * cuts 1-wide x 2-tall branches left and right every (spacing + 1) blocks, far end first.
 * @param {V3} anchor @param {string} facing @param {{trunk:number, branch:number, spacing:number, targetY:number}} o
 */
export function branchGeom(anchor, facing, o) {
  const O = { x: anchor.x, y: anchor.y + 1, z: anchor.z };
  const n = O.y - o.targetY;
  /** @type {number[]} */
  const at = [];
  for (let j = o.spacing; j < o.trunk; j += o.spacing + 1) at.push(j);
  const g = { anchor, facing, O, n, L: o.trunk, B: o.branch, s: o.spacing, ty: o.targetY, branchAt: at, total: 0 };
  g.total = segments(g).reduce((a, s) => a + s.n, 0);
  return g;
}

/** @type {Map<string, {n:number, at:(t:number)=>any}[]>} */
const segCache = new Map();

/** @param {any} g */
function segments(g) {
  const key = JSON.stringify([g.anchor, g.facing, g.L, g.B, g.s, g.ty]);
  const hit = segCache.get(key);
  if (hit) return hit;
  const d = DIRS[g.facing], r = rightOf(d), l = { x: -r.x, z: -r.z };
  const { O, n, L, B, ty } = g;
  /** @param {number} j */
  const P = (j) => ({ x: O.x + d.x * (n + j), y: ty, z: O.z + d.z * (n + j) });
  /** @type {{n:number, at:(t:number)=>any}[]} */
  const segs = [];
  if (n > 0) {
    segs.push({ n, at: (t) => {
      const k = t + 1;
      const S = { x: O.x + d.x * (k - 1), y: O.y - k, z: O.z + d.z * (k - 1) };
      return { stand: S, mine: column(S, 3), fwd: d };
    } });
  }
  segs.push({ n: L, at: (j) => {
    const p = P(j);
    return { stand: p, mine: [...column(p, 2), ...column(off(p, r, 1), 2)], fwd: d, sides: [l, { x: r.x * 2, z: r.z * 2 }] };
  } });
  let cur = L - 1;
  for (const j of [...g.branchAt].reverse()) {
    const from = cur;
    if (from !== j) segs.push({ n: from - j, at: (t) => ({ stand: P(from - 1 - t) }) });
    const base = P(j);
    if (B > 0) {
      segs.push({ n: B, at: (t) => { const q = off(base, r, -(t + 1)); return { stand: q, mine: column(q, 2), fwd: l, sides: [d, { x: -d.x, z: -d.z }] }; } });
      segs.push({ n: B, at: (t) => ({ stand: off(base, r, -(B - 1 - t)) }) });
      segs.push({ n: 1, at: () => ({ stand: off(base, r, 1) }) });
      segs.push({ n: B, at: (t) => { const q = off(base, r, t + 2); return { stand: q, mine: column(q, 2), fwd: r, sides: [d, { x: -d.x, z: -d.z }] }; } });
      segs.push({ n: B + 1, at: (t) => ({ stand: off(base, r, B - t) }) });
    }
    cur = j;
  }
  segCache.set(key, segs);
  if (segCache.size > 64) segCache.delete(/** @type {string} */ (segCache.keys().next().value));
  return segs;
}

// ---------------- shared ----------------
/** @param {any} job @param {number} i */
export function stepAt(job, i) {
  if (job.type === "quarry") {
    const c = quarryCell(job.geom, i);
    return isStairBlock(job.geom, c) ? { keep: c } : { stand: c, mine: [c] };
  }
  let k = i;
  for (const s of segments(job.geom)) {
    if (k < s.n) return s.at(k);
    k -= s.n;
  }
  return {};
}

/** Where the worker should walk to before the first step. @param {any} job */
export function startCell(job) {
  if (job.type === "quarry") return { ...job.geom.anchor };
  const g = job.geom;
  return g.n > 0 ? { ...g.anchor } : { ...g.O };
}

// ---------------- outlines for the Survey Stake preview ----------------
/**
 * Line segments to draw for a plan, in world coordinates (block edges).
 * Branch mines are drawn as a map on the surface, since the tunnels are underground.
 * @param {any} plan @returns {[V3, V3][]}
 */
export function outline(plan) {
  /** @type {[V3, V3][]} */
  const segs = [];
  if (plan.mode === "quarry") {
    const g = quarryGeom(plan.anchor, plan.facing, plan.length, plan.width, plan.depth);
    const a = g.min, b = { x: g.max.x + 1, y: g.max.y + 1, z: g.max.z + 1 };
    const xs = [a.x, b.x], ys = [a.y, b.y], zs = [a.z, b.z];
    for (const y of ys) for (const z of zs) segs.push([{ x: a.x, y, z }, { x: b.x, y, z }]);
    for (const x of xs) for (const z of zs) segs.push([{ x, y: a.y, z }, { x, y: b.y, z }]);
    for (const x of xs) for (const y of ys) segs.push([{ x, y, z: a.z }, { x, y, z: b.z }]);
    return segs;
  }
  const g = branchGeom(plan.anchor, plan.facing, { trunk: plan.trunk, branch: plan.branch, spacing: plan.spacing, targetY: plan.targetY });
  const d = DIRS[plan.facing], r = rightOf(d);
  const y = plan.anchor.y + 1.05;
  /** Rectangle covering two cells and everything between them. @param {V3} c1 @param {V3} c2 */
  const rect = (c1, c2) => {
    const x0 = Math.min(c1.x, c2.x), x1 = Math.max(c1.x, c2.x) + 1, z0 = Math.min(c1.z, c2.z), z1 = Math.max(c1.z, c2.z) + 1;
    segs.push([{ x: x0, y, z: z0 }, { x: x1, y, z: z0 }], [{ x: x1, y, z: z0 }, { x: x1, y, z: z1 }],
      [{ x: x1, y, z: z1 }, { x: x0, y, z: z1 }], [{ x: x0, y, z: z1 }, { x: x0, y, z: z0 }]);
  };
  const O = g.O;
  /** @param {number} j */
  const P = (j) => off(O, d, g.n + j);
  if (g.n > 0) rect(plan.anchor, off(O, d, g.n - 1));
  rect(P(0), off(P(g.L - 1), r, 1));
  if (g.B > 0) {
    for (const j of g.branchAt) {
      rect(off(P(j), r, -1), off(P(j), r, -g.B));
      rect(off(P(j), r, 2), off(P(j), r, g.B + 1));
    }
  }
  return segs;
}

/** A short arrow from the anchor showing which way is "forward". @param {any} plan @returns {V3[]} */
export function arrow(plan) {
  const d = DIRS[plan.facing];
  const c = { x: plan.anchor.x + 0.5, y: plan.anchor.y + 1.3, z: plan.anchor.z + 0.5 };
  return Array.from({ length: 7 }, (_, i) => ({ x: c.x + d.x * i * 0.5, y: c.y, z: c.z + d.z * i * 0.5 }));
}

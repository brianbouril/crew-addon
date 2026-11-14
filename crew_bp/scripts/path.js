// A* pathfinder for the worker's trips (to the deposit, back to work, to a player).
// The Script API has no pathfinding call, so this searches blocks directly. It runs a fixed
// number of expansions per tick, so a long search never stalls the server.
// The worker is villager-sized (under two blocks tall), so it needs two blocks of air on top of
// something solid; it can step up 1 and drop up to 3.
import { passable } from "./blocks.js";
import { floorV } from "./util.js";

/** @typedef {{x:number,y:number,z:number}} V3 */
const DIR4 = [{ x: 1, z: 0 }, { x: -1, z: 0 }, { x: 0, z: 1 }, { x: 0, z: -1 }];
const MAX_NODES = 40000;
const key = (/** @type {V3} */ p) => `${p.x},${p.y},${p.z}`;

/**
 * @param {import("@minecraft/server").Dimension} dim
 * @param {V3} from  worker location
 * @param {V3} goal  block position
 * @param {number} reach  arrive when within this distance (block centers)
 * @param {boolean} [beside]  the goal is a block to stand next to (a chest), not on top of
 */
export function newSearch(dim, from, goal, reach, beside = false) {
  const start = floorV(from);
  const s = {
    dim, start, goal, reach, beside,
    /** @type {Map<string, boolean>} */ pass: new Map(),
    /** @type {Map<string, number>} */ g: new Map([[key(start), 0]]),
    /** @type {Map<string, V3>} */ came: new Map(),
    /** @type {[number, number, V3][]} */ heap: [],
    seq: 0, expanded: 0,
    /** @type {V3[] | undefined} */ path: undefined,
  };
  push(s.heap, [h(start, goal), s.seq++, start]);
  return s;
}

/** @param {V3} a @param {V3} b */
const h = (a, b) => 1.2 * Math.max(Math.abs(a.x - b.x) + Math.abs(a.z - b.z), Math.abs(a.y - b.y));
/**
 * Close enough to the goal. With `beside`, standing on top of the goal block doesn't count.
 * @param {V3} a @param {V3} b @param {number} reach @param {boolean} [beside]
 */
export const near = (a, b, reach, beside = false) =>
  Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) <= reach && !(beside && a.x === b.x && a.z === b.z && a.y > b.y);

/** @param {ReturnType<typeof newSearch>} s @param {V3} p */
function free(s, p) {
  const k = key(p);
  let v = s.pass.get(k);
  if (v === undefined) {
    v = passable(s.dim, p);
    s.pass.set(k, v);
  }
  return v;
}

/** @param {ReturnType<typeof newSearch>} s @param {V3} c */
function* neighbors(s, c) {
  for (const d of DIR4) {
    const n = { x: c.x + d.x, y: c.y, z: c.z + d.z };
    if (free(s, n) && free(s, { x: n.x, y: n.y + 1, z: n.z })) {
      // walk, or walk off an edge and drop up to 3 (the column above is open, so the head fits)
      let y = n.y;
      for (let drop = 0; drop <= 3; drop++, y--) {
        const m = { x: n.x, y, z: n.z };
        if (!free(s, m)) break;
        if (!free(s, { x: n.x, y: y - 1, z: n.z })) {
          yield { p: m, cost: 1 + drop * 0.5 };
          break;
        }
      }
    } else if (!free(s, n)) {
      // step up one onto the block ahead: room for the body there, and headroom to rise here
      const u = { x: n.x, y: n.y + 1, z: n.z };
      if (free(s, u) && free(s, { x: u.x, y: u.y + 1, z: u.z }) && free(s, { x: c.x, y: c.y + 2, z: c.z })) yield { p: u, cost: 1.5 };
    }
  }
}

/**
 * Runs up to `budget` expansions. "found" leaves the path (excluding the start) in s.path.
 * @param {ReturnType<typeof newSearch>} s @param {number} budget
 * @returns {"searching" | "found" | "failed"}
 */
export function advance(s, budget) {
  const goalC = { x: s.goal.x, y: s.goal.y, z: s.goal.z };
  for (let n = 0; n < budget; n++) {
    const top = pop(s.heap);
    if (!top) return "failed";
    const c = top[2];
    const kc = key(c);
    const gc = /** @type {number} */ (s.g.get(kc));
    if (near(c, goalC, s.reach, s.beside)) {
      /** @type {V3[]} */
      const path = [];
      let p = c;
      while (key(p) !== key(s.start)) {
        path.push(p);
        p = /** @type {V3} */ (s.came.get(key(p)));
      }
      s.path = path.reverse();
      return "found";
    }
    if (++s.expanded > MAX_NODES) return "failed";
    for (const { p, cost } of neighbors(s, c)) {
      const kp = key(p);
      const ng = gc + cost;
      const old = s.g.get(kp);
      if (old !== undefined && old <= ng) continue;
      s.g.set(kp, ng);
      s.came.set(kp, c);
      push(s.heap, [ng + h(p, goalC), s.seq++, p]);
    }
  }
  return "searching";
}

// ---- binary heap ordered by [f, seq] ----
/** @param {[number, number, V3][]} a @param {number} i @param {number} j */
const less = (a, i, j) => a[i][0] < a[j][0] || (a[i][0] === a[j][0] && a[i][1] < a[j][1]);
/** @param {[number, number, V3][]} a @param {[number, number, V3]} x */
function push(a, x) {
  a.push(x);
  let i = a.length - 1;
  while (i > 0) {
    const p = (i - 1) >> 1;
    if (!less(a, i, p)) break;
    [a[i], a[p]] = [a[p], a[i]];
    i = p;
  }
}
/** @param {[number, number, V3][]} a */
function pop(a) {
  if (!a.length) return undefined;
  const top = a[0];
  const last = /** @type {[number, number, V3]} */ (a.pop());
  if (a.length) {
    a[0] = last;
    let i = 0;
    for (;;) {
      const l = 2 * i + 1, r = l + 1;
      let m = i;
      if (l < a.length && less(a, l, m)) m = l;
      if (r < a.length && less(a, r, m)) m = r;
      if (m === i) break;
      [a[i], a[m]] = [a[m], a[i]];
      i = m;
    }
  }
  return top;
}

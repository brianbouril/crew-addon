// Shared test check: is a worker inside a solid block (feet or head)? Workers must only ever be
// in open space (decision 14), so any tick where this is true is a bug (passing through a block).
import { passable } from "./scripts/blocks.js";

/** @param {any} e @returns {string | undefined} the solid block it's in, if any */
export function insideSolid(e) {
  const l = e.location;
  for (const dy of [0.1, 1.2]) {
    const p = { x: Math.floor(l.x), y: Math.floor(l.y + dy), z: Math.floor(l.z) };
    if (!passable(e.dimension, p)) return `${e.dimension.getBlock(p)?.typeId}@${p.x},${p.y},${p.z}`;
  }
  return undefined;
}

/** Counts ticks spent inside solid blocks and remembers the first few. */
export function insideTracker() {
  const t = { ticks: 0, first: /** @type {string[]} */ ([]) };
  return {
    /** @param {any} e @param {number} tick */
    check(e, tick) {
      const s = insideSolid(e);
      if (!s) return;
      t.ticks++;
      if (t.first.length < 5) t.first.push(`t${tick}: ${s}`);
    },
    result: () => t,
  };
}

/** @param {string[]} logs */
export const blinkCount = (logs) => logs.filter((l) => l.startsWith("[Crew-Blink]")).length;

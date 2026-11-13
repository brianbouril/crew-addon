// World-level saved data: named places and the worker registry.
// Everything is JSON in world dynamic properties, so it survives restarts.
import { world } from "@minecraft/server";
import { getJSON, setJSON } from "./util.js";

/**
 * @typedef {{id?: string, name: string, isOp: boolean, console?: boolean}} Commander
 * @typedef {{name: string, dim: string, x: number, y: number, z: number, ownerId: string, ownerName: string, shared: boolean}} Place
 * @typedef {{name: string, id: string, ownerId: string, ownerName: string}} WorkerEntry
 */

/** @returns {Place[]} */
export const getPlaces = () => getJSON(world, "crew:places", []);
/** @param {Place[]} list */
const savePlaces = (list) => setJSON(world, "crew:places", list);

/**
 * @param {Commander} by
 * @param {string} name
 * @param {string} dim
 * @param {{x:number,y:number,z:number}} loc
 * @param {boolean} shared
 */
export function savePlace(by, name, dim, loc, shared) {
  const key = name.trim().toLowerCase();
  const list = getPlaces().filter((p) => !(p.name.toLowerCase() === key && p.ownerId === by.id));
  list.push({ name: name.trim(), dim, x: Math.floor(loc.x), y: Math.floor(loc.y), z: Math.floor(loc.z), ownerId: by.id ?? "console", ownerName: by.name, shared });
  savePlaces(list);
}

/** @param {Commander} by @param {Place} p */
export const canUsePlace = (by, p) => by.isOp || by.console || p.shared || p.ownerId === by.id;

/** Own place first, then a shared one, then (operators only) anyone's. @param {Commander} by @param {string} name */
export function resolvePlace(by, name) {
  const key = name.trim().toLowerCase();
  const matches = getPlaces().filter((p) => p.name.toLowerCase() === key);
  return matches.find((p) => p.ownerId === by.id) ?? matches.find((p) => p.shared) ?? matches.find((p) => canUsePlace(by, p));
}

/** @param {Commander} by @param {string} name */
export function removePlace(by, name) {
  const key = name.trim().toLowerCase();
  const before = getPlaces();
  const after = before.filter((p) => !(p.name.toLowerCase() === key && (p.ownerId === by.id || by.isOp)));
  savePlaces(after);
  return before.length - after.length;
}

/** @returns {Record<string, WorkerEntry>} keyed by lower-case name */
export const getRegistry = () => getJSON(world, "crew:workers", {});
/** @param {Record<string, WorkerEntry>} r */
export const saveRegistry = (r) => setJSON(world, "crew:workers", r);

/** Picks a free worker name: the wanted one, or "Name 2", "Name 3"... @param {string | undefined} wanted */
export function freeName(wanted) {
  const reg = getRegistry();
  if (wanted) {
    const base = wanted.trim().slice(0, 24) || "Worker";
    if (!reg[base.toLowerCase()]) return base;
    for (let i = 2; ; i++) if (!reg[`${base} ${i}`.toLowerCase()]) return `${base} ${i}`;
  }
  const n = Number(world.getDynamicProperty("crew:count") ?? 0) + 1;
  world.setDynamicProperty("crew:count", n);
  const pick = ["Digby", "Rocco", "Pip", "Moss", "Flint", "Tilly", "Grit", "Nugget", "Bolt", "Cobble"];
  return freeName(`${pick[(n - 1) % pick.length]}`);
}

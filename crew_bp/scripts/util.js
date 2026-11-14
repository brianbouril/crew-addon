// Small shared helpers. No game state lives here.
import { world } from "@minecraft/server";

export const VERSION = "0.4.0";
export const DIMS = ["minecraft:overworld", "minecraft:nether", "minecraft:the_end"];

/** @param {{x:number,y:number,z:number}} v */
export const floorV = (v) => ({ x: Math.floor(v.x), y: Math.floor(v.y + 0.01), z: Math.floor(v.z) });
/** @param {{x:number,y:number,z:number}} v */
export const center = (v) => ({ x: v.x + 0.5, y: v.y, z: v.z + 0.5 });
/** @param {{x:number,y:number,z:number}} v */
export const fmt = (v) => `${Math.floor(v.x)} ${Math.floor(v.y)} ${Math.floor(v.z)}`;
/** @param {{x:number,y:number,z:number}} a @param {{x:number,y:number,z:number}} b */
export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
/** @param {{x:number,y:number,z:number}} a @param {{x:number,y:number,z:number}} b */
export const sameV = (a, b) => !!a && !!b && a.x === b.x && a.y === b.y && a.z === b.z;
/** @param {{x:number,y:number,z:number}} v @param {number} [n] */
export const up = (v, n = 1) => ({ x: v.x, y: v.y + n, z: v.z });
/** @param {{x:number,y:number,z:number}} a @param {{x:number,y:number,z:number}} b @param {number} t */
export const lerp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t });

/**
 * Reads JSON stored in a dynamic property.
 * @param {{getDynamicProperty(id:string): unknown}} holder
 * @param {string} key
 * @param {any} fallback
 */
export function getJSON(holder, key, fallback) {
  try {
    const s = holder.getDynamicProperty(key);
    return typeof s === "string" ? JSON.parse(s) : fallback;
  } catch {
    return fallback;
  }
}

/**
 * @param {{setDynamicProperty(id:string, v?: string): void}} holder
 * @param {string} key
 * @param {any} value  undefined clears the property
 */
export function setJSON(holder, key, value) {
  holder.setDynamicProperty(key, value === undefined ? undefined : JSON.stringify(value));
}

/** Finds an online player by stable id or by name. @param {{id?:string,name?:string}} who */
export function onlinePlayer(who) {
  const name = who.name ? String(who.name).toLowerCase() : undefined;
  for (const p of world.getAllPlayers()) {
    if ((who.id && p.id === who.id) || (name && p.name.toLowerCase() === name)) return p;
  }
  return undefined;
}

/** @param {import("@minecraft/server").Player | undefined} player @param {string} msg */
export function tell(player, msg) {
  if (player && player.isValid) player.sendMessage(`§6[Crew]§r ${msg}`);
}

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
/** Decodes base64 into a UTF-8 string (the scripting runtime has no atob). @param {string} s */
export function b64decode(s) {
  const clean = s.replace(/[^A-Za-z0-9+/]/g, "");
  /** @type {number[]} */
  const bytes = [];
  let buf = 0, bits = 0;
  for (const ch of clean) {
    buf = (buf << 6) | B64.indexOf(ch);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buf >> bits) & 0xff);
    }
  }
  let out = "";
  for (let i = 0; i < bytes.length; ) {
    const b = bytes[i++];
    if (b < 0x80) out += String.fromCharCode(b);
    else if (b < 0xe0) out += String.fromCharCode(((b & 0x1f) << 6) | (bytes[i++] & 0x3f));
    else if (b < 0xf0) out += String.fromCharCode(((b & 0x0f) << 12) | ((bytes[i++] & 0x3f) << 6) | (bytes[i++] & 0x3f));
    else {
      const cp = ((b & 0x07) << 18) | ((bytes[i++] & 0x3f) << 12) | ((bytes[i++] & 0x3f) << 6) | (bytes[i++] & 0x3f);
      out += String.fromCodePoint(cp);
    }
  }
  return out;
}

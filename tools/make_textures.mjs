// Draws the Crew textures from scratch (no third-party art). Node 18+, no installs.
// Usage: node tools/make_textures.mjs   (from the project folder)
//
// Worker skins follow the cube layout in crew_rp/models/entity/worker.geo.json (64x64):
//   head 8x10x8 at (0,0)   nose 2x4x2 at (24,0)   hard hat dome (head size, inflated) at (32,0)
//   body 8x12x6 at (16,20) arms 4x10x4 at (44,20)  legs 4x12x4 at (0,22)
//   hat brim: one colour patch at (28,46)          hat lamp: 2x2 patch at (40,46)
//   Hauler only: cap peak patch at (0,40), backpack leather patch at (0,46) (its cap dome uses the hat's area)
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// ---------- PNG ----------
const CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
function chunk(type, data) {
  const t = Buffer.from(type, "ascii");
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}
function png(path, w, h, px) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    for (let x = 0; x < w; x++) {
      const [r, g, b, a] = px[y * w + x];
      raw.set([r, g, b, a], y * (w * 4 + 1) + 1 + x * 4);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr.set([8, 6, 0, 0, 0], 8);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]));
}

// ---------- canvas helpers ----------
const T = [0, 0, 0, 0];
function canvas(w, h, bg = T) {
  const px = new Array(w * h).fill(bg);
  const set = (x, y, c) => { if (x >= 0 && y >= 0 && x < w && y < h) px[y * w + x] = c; };
  const rect = (x0, y0, x1, y1, c) => { for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) set(x, y, c); };
  /** Paints a box-UV cube: fn(face, x, y, fw, fh) returns a colour for each texel of each face. */
  const box = (u, v, w_, h_, d, fn) => {
    const faces = {
      up: [u + d, v, w_, d], down: [u + d + w_, v, w_, d],
      east: [u, v + d, d, h_], north: [u + d, v + d, w_, h_], west: [u + d + w_, v + d, d, h_], south: [u + 2 * d + w_, v + d, w_, h_],
    };
    for (const [face, [fx, fy, fw, fh]] of Object.entries(faces)) {
      for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) {
        const c = fn(face, x, y, fw, fh);
        if (c) set(fx + x, fy + y, c);
      }
    }
  };
  return { px, set, rect, box };
}

// ---------- the worker skins ----------
const SKIN = [190, 140, 105, 255], SKIN_D = [160, 112, 82, 255], NOSE = [172, 122, 90, 255];
const BROW = [70, 45, 30, 255], EYE_W = [235, 235, 235, 255], EYE = [40, 120, 60, 255], HAIR = [85, 58, 36, 255];
const JEANS = [45, 65, 115, 255], JEANS_D = [35, 50, 92, 255], BOOT = [92, 60, 34, 255], BELT = [66, 44, 26, 255];

const ROLES = {
  miner: {
    hat: [245, 196, 20, 255], hatD: [205, 155, 10, 255], lamp: [255, 250, 200, 255],
    sleeve: [52, 92, 170, 255], pants: JEANS, pantsD: JEANS_D,
    torso: (x, y, fw, face) => {
      // hi-vis orange vest over a blue shirt, reflective stripe
      if (y === 11) return BELT;
      if (y === 7 || y === 8) return [240, 240, 205, 255];
      if (face === "north" && (x === 3 || x === 4) && y < 7) return [52, 92, 170, 255];
      return (x + y) % 5 === 0 ? [228, 98, 12, 255] : [255, 122, 22, 255];
    },
  },
  digger: {
    hat: [236, 236, 236, 255], hatD: [196, 196, 196, 255], lamp: [236, 236, 236, 255],
    sleeve: [168, 58, 48, 255], pants: [120, 86, 52, 255], pantsD: [98, 70, 42, 255],
    torso: (x, y, fw, face) => {
      // brown overalls with straps over a red shirt
      const overalls = [120, 86, 52, 255], shirt = [168, 58, 48, 255];
      if (y >= 5) return y === 11 ? [98, 70, 42, 255] : overalls;
      if ((face === "north" || face === "south") && (x === 1 || x === fw - 2)) return overalls;
      if (face === "north" && y >= 3 && x >= 2 && x <= fw - 3) return overalls;
      return shirt;
    },
  },
  woodcutter: {
    hat: [222, 84, 32, 255], hatD: [180, 62, 20, 255], lamp: [222, 84, 32, 255],
    sleeve: "plaid", pants: JEANS, pantsD: JEANS_D,
    torso: (x, y) => (y === 11 ? BELT : plaid(x, y)),
  },
  hauler: {
    // brown leather cap, tan and brown clothes, leather boots; the backpack is drawn below
    hat: [122, 78, 44, 255], hatD: [96, 60, 34, 255], lamp: [96, 60, 34, 255],
    sleeve: [196, 164, 112, 255], pants: [110, 78, 50, 255], pantsD: [92, 64, 40, 255],
    boots: [150, 96, 56, 255], bootsD: [118, 74, 42, 255],
    torso: (x, y, fw, face) => {
      // a tan shirt under a brown leather vest, with the backpack straps over the shoulders
      const shirt = [196, 164, 112, 255], vest = [124, 86, 52, 255], strap = [84, 54, 30, 255];
      if (y === 11) return BELT;
      if ((face === "north" || face === "south") && (x === 1 || x === fw - 2) && y < 9) return strap;
      if (face === "north" && x >= 3 && x <= fw - 4) return shirt;
      return (x + y) % 7 === 0 ? [110, 76, 46, 255] : vest;
    },
    pack: true,
  },
  farmer: {
    hat: [222, 192, 112, 255], hatD: [186, 156, 78, 255], lamp: [222, 192, 112, 255],
    sleeve: [228, 222, 196, 255], pants: [72, 122, 62, 255], pantsD: [58, 100, 50, 255],
    torso: (x, y, fw, face) => {
      // green overalls over a cream shirt
      const overalls = [72, 122, 62, 255], shirt = [228, 222, 196, 255];
      if (y >= 5) return y === 11 ? [58, 100, 50, 255] : overalls;
      if ((face === "north" || face === "south") && (x === 1 || x === fw - 2)) return overalls;
      if (face === "north" && y >= 3 && x >= 2 && x <= fw - 3) return overalls;
      return shirt;
    },
  },
};
function plaid(x, y) {
  const a = (x >> 1) % 2, b = (y >> 1) % 2;
  return a && b ? [70, 20, 20, 255] : a || b ? [150, 32, 32, 255] : [196, 48, 44, 255];
}

function worker(path, r) {
  const { px, rect, box } = canvas(64, 64);
  // head: face on the front, hair under the hat
  box(0, 0, 8, 10, 8, (face, x, y) => {
    if (face === "up") return HAIR;
    if (face === "down") return SKIN_D;
    if (face === "north") {
      if (y < 3) return HAIR;
      if (y === 3) return x >= 1 && x <= 6 ? BROW : SKIN;
      if (y === 4) return x === 1 || x === 6 ? EYE_W : x === 2 || x === 5 ? EYE : SKIN;
      return y === 9 ? SKIN_D : SKIN;
    }
    if (face === "south") return y < 6 ? HAIR : SKIN;
    return y < 4 ? HAIR : SKIN; // sides
  });
  box(24, 0, 2, 4, 2, () => NOSE);
  // hard hat: dome top and the top three rows of each side; the rest stays see-through
  box(32, 0, 8, 10, 8, (face, x, y) => {
    if (face === "up") return (x + y) % 6 === 0 ? r.hatD : r.hat;
    if (face === "down") return undefined;
    if (y < 2) return r.hat;
    if (y === 2) return r.hatD;
    return undefined;
  });
  rect(28, 46, 40, 58, r.hatD); // brim
  rect(40, 46, 42, 48, r.lamp); // lamp (hat-coloured unless it's a miner)
  // body
  box(16, 20, 8, 12, 6, (face, x, y, fw) => {
    if (face === "up") return r.sleeve === "plaid" ? plaid(x, y) : r.sleeve;
    if (face === "down") return BELT;
    return r.torso(x, y, fw, face);
  });
  // arms: sleeves, hands at the bottom
  box(44, 20, 4, 10, 4, (face, x, y) => {
    const sleeve = r.sleeve === "plaid" ? plaid(x, y) : r.sleeve;
    if (face === "up") return sleeve;
    if (face === "down") return SKIN;
    return y >= 7 ? SKIN : sleeve;
  });
  // legs: trousers, boots at the bottom (a Hauler's leather boots come up higher)
  box(0, 22, 4, 12, 4, (face, x, y) => {
    if (face === "up") return r.pants;
    if (face === "down") return r.boots ? r.bootsD : BOOT;
    if (r.boots && y >= 7) return y === 7 ? r.bootsD : r.boots;
    if (y >= 10) return BOOT;
    return x % 4 === 0 ? r.pantsD : r.pants;
  });
  if (r.pack) {
    rect(0, 40, 12, 44, r.hatD); // cap peak
    // backpack: bundle-brown leather with darker stitching and a flap
    const LEATHER = [138, 92, 54, 255], STITCH = [96, 62, 34, 255], FLAP = [116, 76, 44, 255];
    for (let y = 46; y < 60; y++) for (let x = 0; x < 14; x++) {
      const c = y < 49 ? FLAP : (x === 0 || y === 59 || x === 13 || (x + y) % 5 === 0) ? STITCH : LEATHER;
      px[y * 64 + x] = c;
    }
  }
  png(path, 64, 64, px);
  if (PREVIEW) {
    // 8x enlarged copy on a grey background, for looking at the layout
    const S = 8, big = new Array(64 * S * 64 * S);
    for (let y = 0; y < 64 * S; y++) for (let x = 0; x < 64 * S; x++) {
      const c = px[Math.floor(y / S) * 64 + Math.floor(x / S)];
      big[y * 64 * S + x] = c[3] ? c : (((x >> 5) + (y >> 5)) % 2 ? [90, 90, 90, 255] : [110, 110, 110, 255]);
    }
    png(join(PREVIEW, path.replace(/^.*[\\/]/, "")), 64 * S, 64 * S, big);
  }
}
const PREVIEW = process.argv[2];

// ---------- survey stake and pack icon (same art as before) ----------
function stake(path) {
  const { px, set } = canvas(16, 16);
  const WOOD = [140, 95, 50, 255], WOOD_D = [100, 65, 35, 255], FLAG = [255, 120, 20, 255], FLAG_D = [220, 90, 10, 255];
  for (let i = 3; i < 15; i++) { const x = i - 1, y = 16 - i; set(x, y, WOOD); if (x + 1 < 16) set(x + 1, y, WOOD_D); }
  for (let y = 1; y < 6; y++) for (let x = 9; x < 15 - Math.floor((y - 1) / 2); x++) set(x, y, (x + y) % 3 ? FLAG : FLAG_D);
  png(path, 16, 16, px);
}
function icon(path) {
  const { px, rect } = canvas(64, 64, [40, 46, 60, 255]);
  const HAT = [245, 196, 20, 255], HAT_D = [214, 160, 10, 255];
  rect(16, 18, 48, 50, [214, 160, 120, 255]);
  rect(12, 10, 52, 22, HAT); rect(8, 20, 56, 24, HAT_D);
  rect(22, 30, 28, 36, [40, 30, 30, 255]); rect(36, 30, 42, 36, [40, 30, 30, 255]);
  rect(26, 42, 38, 45, [150, 90, 70, 255]);
  rect(12, 50, 52, 64, [255, 120, 20, 255]); rect(12, 56, 52, 59, [240, 240, 200, 255]);
  png(path, 64, 64, px);
}

for (const [name, r] of Object.entries(ROLES)) worker(join(ROOT, `crew_rp/textures/entity/worker_${name}.png`), r);
stake(join(ROOT, "crew_rp/textures/items/crew_survey_stake.png"));
icon(join(ROOT, "crew_rp/pack_icon.png"));
icon(join(ROOT, "crew_bp/pack_icon.png"));
console.log("textures written");

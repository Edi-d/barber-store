/**
 * Generates the salon map-marker bubble images used by the discover map.
 *
 * Why this exists: salon pins must (a) render reliably at any map position
 * (only a native Mapbox SymbolLayer does this — MarkerView drops far-away pins,
 * even when centred and selected) and (b) keep the brand "squircle" bubble shape
 * (asymmetric corners, not a plain circle). A SymbolLayer draws an image, so we
 * bake the squircle into PNGs here — one per visual state — and tint them by
 * swapping the iconImage.
 *
 * Shape matches constants/theme.ts `Bubble.radiiSm` (TL/BR/BL = 18, TR = 8) and
 * a 2px border, rendered at 3x for crisp display. Re-run with:
 *   node scripts/generate-salon-markers.js
 */
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const SCALE = 3;
const SIZE = 44 * SCALE; // 132px canvas
const BORDER = 2 * SCALE; // 6px border
// Bubble.radiiSm scaled to 3x
const R = { tl: 18 * SCALE, tr: 8 * SCALE, br: 18 * SCALE, bl: 18 * SCALE };

const hex = (h) => [
  parseInt(h.slice(1, 3), 16),
  parseInt(h.slice(3, 5), 16),
  parseInt(h.slice(5, 7), 16),
];

// [fillRGB, borderRGB] per state
const VARIANTS = {
  "salon-pin-default": [hex("#ffffff"), hex("#e2e8f0")], // white fill, grey border
  "salon-pin-available": [hex("#ffffff"), hex("#7cc4ff")], // white fill, blue border
  "salon-pin-selected": [hex("#0a85f4"), hex("#0a85f4")], // blue fill, blue border
};

// Is point (x,y) inside a rounded rect [0,w]x[0,h] with the given corner radii?
function insideRRect(x, y, w, h, r) {
  if (x < r.tl && y < r.tl) return Math.hypot(x - r.tl, y - r.tl) <= r.tl;
  if (x > w - r.tr && y < r.tr) return Math.hypot(x - (w - r.tr), y - r.tr) <= r.tr;
  if (x > w - r.br && y > h - r.br) return Math.hypot(x - (w - r.br), y - (h - r.br)) <= r.br;
  if (x < r.bl && y > h - r.bl) return Math.hypot(x - r.bl, y - (h - r.bl)) <= r.bl;
  return x >= 0 && x <= w && y >= 0 && y <= h;
}

function buildRGBA(fill, border) {
  const w = SIZE;
  const h = SIZE;
  const SS = 4; // 4x4 supersample for anti-aliasing
  const innerR = {
    tl: Math.max(R.tl - BORDER, 0),
    tr: Math.max(R.tr - BORDER, 0),
    br: Math.max(R.br - BORDER, 0),
    bl: Math.max(R.bl - BORDER, 0),
  };
  const buf = Buffer.alloc(w * h * 4);
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      let outer = 0;
      let inner = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const px = i + (sx + 0.5) / SS;
          const py = j + (sy + 0.5) / SS;
          if (insideRRect(px, py, w, h, R)) outer++;
          if (insideRRect(px - BORDER, py - BORDER, w - 2 * BORDER, h - 2 * BORDER, innerR)) inner++;
        }
      }
      const tot = SS * SS;
      const outerCov = outer / tot;
      const innerCov = inner / tot;
      const borderCov = Math.max(outerCov - innerCov, 0);
      const alpha = outerCov;
      const idx = (j * w + i) * 4;
      if (alpha <= 0) {
        buf[idx] = buf[idx + 1] = buf[idx + 2] = buf[idx + 3] = 0;
        continue;
      }
      const r = (fill[0] * innerCov + border[0] * borderCov) / alpha;
      const g = (fill[1] * innerCov + border[1] * borderCov) / alpha;
      const b = (fill[2] * innerCov + border[2] * borderCov) / alpha;
      buf[idx] = Math.round(r);
      buf[idx + 1] = Math.round(g);
      buf[idx + 2] = Math.round(b);
      buf[idx + 3] = Math.round(alpha * 255);
    }
  }
  return buf;
}

// ─── Minimal PNG encoder (RGBA, 8-bit) ──────────────────────────────────────
const CRC_TABLE = (() => {
  const t = new Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}
function encodePNG(rgba, w, h) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  const raw = Buffer.alloc(h * (w * 4 + 1));
  for (let j = 0; j < h; j++) {
    raw[j * (w * 4 + 1)] = 0;
    rgba.copy(raw, j * (w * 4 + 1) + 1, j * w * 4, (j + 1) * w * 4);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]);
}

const outDir = path.join(__dirname, "..", "assets", "markers");
fs.mkdirSync(outDir, { recursive: true });
for (const [name, [fill, border]] of Object.entries(VARIANTS)) {
  const rgba = buildRGBA(fill, border);
  const png = encodePNG(rgba, SIZE, SIZE);
  const file = path.join(outDir, `${name}.png`);
  fs.writeFileSync(file, png);
  console.log(`wrote ${file} (${png.length} bytes)`);
}
console.log("done");

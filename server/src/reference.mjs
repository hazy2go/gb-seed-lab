// Reference build of the generator (gen.wasm, same C source as the ROM): traits, expected tiles, PNG.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { createRequire } from 'node:module';
import { REPO_DIR } from './config.mjs';

const require = createRequire(import.meta.url);
const { load } = require(path.join(REPO_DIR, 'web', 'seedlab.js'));
export const lab = await load(fs.readFileSync(path.join(REPO_DIR, 'web', 'gen.wasm')));
export const romBytes = fs.readFileSync(path.join(REPO_DIR, 'gb', 'seedlab.gb'));
try { lab.special(0); } catch { throw new Error('web/gen.wasm has no 1/1 scenes (no "special" export): rebuild it (cd gen && make)'); }

// 1/1s: special(id) is set around every render of that piece and always reset (docs/ONE-OF-ONES.md). special 0 = normal.
export function withSpecial(special, fn) {
  if (!special) return fn();
  lab.special(special);
  try { return fn(); } finally { lab.special(0); }
}
export const drawPiece = (seed, special = 0) => withSpecial(special, () => lab.draw(seed));
export const traitsOf = (seed, special = 0) => withSpecial(special, () => lab.traits(seed));
export const bannerOf = (seed, special = 0) => withSpecial(special, () => lab.banner(seed));

// shades (160x144, 0..3) -> 2bpp tiles in ROM order (360 x 16 bytes)
export function toTiles(px) {
  const out = Buffer.alloc(360 * 16);
  for (let n = 0; n < 360; n++) {
    const tx = n % 20, ty = Math.floor(n / 20);
    for (let r = 0; r < 8; r++) {
      let lo = 0, hi = 0;
      for (let c = 0; c < 8; c++) { const s = px[(ty * 8 + r) * 160 + tx * 8 + c]; lo = (lo << 1) | (s & 1); hi = (hi << 1) | (s >> 1); }
      out[n * 16 + r * 2] = lo; out[n * 16 + r * 2 + 1] = hi;
    }
  }
  return out;
}
export function fromTiles(tiles) {
  const px = new Uint8Array(160 * 144);
  for (let n = 0; n < 360; n++) {
    const tx = n % 20, ty = Math.floor(n / 20);
    for (let r = 0; r < 8; r++) {
      const lo = tiles[n * 16 + r * 2], hi = tiles[n * 16 + r * 2 + 1];
      for (let c = 0; c < 8; c++) px[(ty * 8 + r) * 160 + tx * 8 + c] = ((lo >> (7 - c)) & 1) | (((hi >> (7 - c)) & 1) << 1);
    }
  }
  return px;
}

const CRC = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (b) => { let c = 0xffffffff; for (const x of b) c = CRC[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const b = Buffer.concat([Buffer.from(t), d]); const s = Buffer.alloc(4); s.writeUInt32BE(crc(b)); return Buffer.concat([l, b, s]); };
// shades -> PNG with the palette, scaled by an integer factor (nearest neighbour)
export function png(px, colors, scale = 1, w = 160, h = 144) {
  const rgb = colors.map(c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16)));
  const W = w * scale, H = h * scale, raw = Buffer.alloc((W * 3 + 1) * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const c = rgb[px[Math.floor(y / scale) * w + Math.floor(x / scale)]]; raw.set(c, y * (W * 3 + 1) + 1 + x * 3); }
  const ih = Buffer.alloc(13); ih.writeUInt32BE(W, 0); ih.writeUInt32BE(H, 4); ih[8] = 8; ih[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

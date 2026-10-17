// Every screen the reference build shows while drawing one piece: per gen_phase, the dithered shades (160x144,
// one byte per pixel), concatenated, to stdout. tools/phasecheck.py compares them with the ROM's screen.
//   node tools/phases.mjs <seed>
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { load } = require('../web/seedlab.js');
const lab = await load(fs.readFileSync(new URL('../web/gen.wasm', import.meta.url)));
const BAYER = [0,32,8,40,2,34,10,42,48,16,56,24,50,18,58,26,12,44,4,36,14,46,6,38,60,28,52,20,62,30,54,22,3,35,11,43,1,33,9,41,51,19,59,27,49,17,57,25,15,47,7,39,13,45,5,37,63,31,55,23,61,29,53,21];
const out = [];
lab.draw(Number(process.argv[2]) >>> 0, (phase, raw) => {
  if (!raw) return;
  const px = Buffer.alloc(160 * 144);
  for (let y = 0; y < 144; y++) for (let x = 0; x < 160; x++) {
    const v = raw[y * 160 + x];
    if (v >= 200) px[y * 160 + x] = v & 3; else { const t = v + BAYER[(y & 7) * 8 + (x & 7)]; px[y * 160 + x] = t >= 192 ? 3 : t >> 6; }
  }
  out.push(px);
});
process.stdout.write(Buffer.concat(out));

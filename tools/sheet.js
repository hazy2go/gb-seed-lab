// Contact sheet of landscapes as a PNG.
// node tools/sheet.js [--out sheet.png] [--cols 4] [--scale 2] [--tall] [--view Original|Thermal|...] seed seed ...
// A range works too: 1-16
const fs = require('fs');
const path = require('path');
const { load } = require('../web/seedlab.js');
const png = require('./png.js');

const args = process.argv.slice(2), opt = { out: 'sheet.png', cols: 4, scale: 2, tall: false, view: null }, seeds = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--out') opt.out = args[++i];
  else if (a === '--cols') opt.cols = +args[++i];
  else if (a === '--scale') opt.scale = +args[++i];
  else if (a === '--view') opt.view = args[++i];
  else if (a === '--tall') opt.tall = true;
  else if (/^\d+-\d+$/.test(a)) { const [lo, hi] = a.split('-').map(Number); for (let s = lo; s <= hi; s++) seeds.push(s); }
  else seeds.push(+a);
}
if (!seeds.length) for (let s = 1; s <= 16; s++) seeds.push(s);

(async () => {
const lab = await load(fs.readFileSync(path.join(__dirname, '../web/gen.wasm')));
const PALETTES = lab.palettes.map(p => [p.name, 0, p.colors]);
const traitRows = (t) => [t.palette, t.time, t.sky, t.terrain, t.ground, t.weather, t.ridges + ' ridges', ...t.extras].map(v => [0, v]);
const H = opt.tall ? 432 : 144, S = opt.scale, G = 4, cols = Math.min(opt.cols, seeds.length), rows = Math.ceil(seeds.length / cols);
const W = (160 * S + G) * cols - G, HH = (H * S + G) * rows - G, rgb = Buffer.alloc(W * HH * 3, 255);
const hex = (h) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const view = opt.view && PALETTES.find(p => p[0] === opt.view);
seeds.forEach((seed, k) => {
  const art = lab.draw(seed, H), pal = (view ? view[2] : art.colors).map(hex);
  console.log(seed, traitRows(art.traits).map(r => r[1]).join(' | '));
  const ox = (k % cols) * (160 * S + G), oy = Math.floor(k / cols) * (H * S + G);
  for (let y = 0; y < H * S; y++) for (let x = 0; x < 160 * S; x++) {
    const c = pal[art.px[Math.floor(y / S) * 160 + Math.floor(x / S)]], o = ((oy + y) * W + ox + x) * 3;
    rgb[o] = c[0]; rgb[o + 1] = c[1]; rgb[o + 2] = c[2];
  }
});
fs.writeFileSync(opt.out, png(W, HH, rgb));
console.log('wrote', opt.out);
})();

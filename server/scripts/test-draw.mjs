// Full test drawing on the real Game Boy, no payment, no mint: send seeds, wait for 'done', compare the final tiles
// with the reference build (web/gen.wasm), exactly like the server's check. Stop the server first (one port owner).
//   node scripts/test-draw.mjs [hexseed ...]      (default: a few seeds covering the art-fix traits)
//   node scripts/test-draw.mjs special [id ...]   the 1/1 scenes (default all ten; start frame special byte = id)
import { HardwareLane } from '../src/lanes/hardware.mjs';
import { lab, toTiles, drawPiece } from '../src/reference.mjs';
import { config } from '../src/config.mjs';
import { fixedSeed, title, COUNT } from '../src/oneofone.mjs';

const specialMode = process.argv[2] === 'special';
const ids = specialMode ? (process.argv.length > 3 ? process.argv.slice(3).map(Number) : Array.from({ length: COUNT }, (_, i) => i + 1)) : [];
let seeds = specialMode ? ids.map(fixedSeed) : process.argv.slice(2).map(s => parseInt(s, 16));
if (!seeds.length) {   // first seed found per trait the art fixes touched
  const want = { volcano: t => t.terrain === 'volcano', oasis: t => t.ground === 'oasis', mesas: t => t.terrain === 'mesas', gibbous: t => t.sky === 'gibbous moon', cabin: t => t.extras.includes('cabin') };
  let s = 12345;
  for (const [k, f] of Object.entries(want)) { for (;;) { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; if (f(lab.traits ? lab.traits(s) : lab.draw(s).traits)) { seeds.push(s); console.log(k, s.toString(16)); break; } } }
}
const lane = new HardwareLane({ port: config.serial });
const wait = (ev, ms) => new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('timeout waiting for ' + ev)), ms); lane.once(ev, (x) => { clearTimeout(t); res(x); }); });
lane.on('fault', f => console.log('fault:', f.reason));
let last = null; lane.on('phase', p => { last = p.tiles; });
await wait('ready', 30000); console.log('Game Boy ready');
let ok = 0;
for (const [i, seed] of seeds.entries()) {
  while (!lane.ready) await new Promise(r => setTimeout(r, 500));
  last = null; const t0 = Date.now();
  const special = specialMode ? ids[i] : 0;
  lane.draw(seed, 60000 + i, special);
  await wait('begin', 8000);
  const d = await wait('done', special ? 600000 : 240000);   // a 1/1 may take a few minutes (verify on the DMG)
  const match = d.screenOk && last && toTiles(drawPiece(seed, special).px).equals(last);
  console.log(`${special ? `1/1 #${special} ${title(special)}` : `seed ${seed.toString(16)}`}: ${((Date.now() - t0) / 1000).toFixed(1)} s, frames ${d.frames}, screen CRC ${d.screenOk ? 'ok' : 'BAD'}, tiles ${match ? 'MATCH the reference' : 'DIFFER'}`);
  if (match) ok++;
}
console.log(`${ok}/${seeds.length} match`); process.exit(ok === seeds.length ? 0 : 3);

// The WASM build (web page, mint server) must match the native build pixel for pixel.
// Run gen/gen_host first (make -C gen).
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const { load } = require('../web/seedlab.js');
const N = +(process.argv[2] || 500);
const fnv = (px) => { let f = 2166136261; for (const v of px) { f ^= v; f = Math.imul(f, 16777619) >>> 0; } return f.toString(16).padStart(8, '0'); };
(async () => {
  const lab = await load(fs.readFileSync(path.join(__dirname, '../web/gen.wasm')));
  const native = execFileSync(path.join(__dirname, '../gen/gen_host'), ['hash', '1', String(N)]).toString().trim().split('\n').map(l => l.split(' ')[1]);
  let bad = 0;
  for (let s = 1; s <= N; s++) if (fnv(lab.draw(s).px) !== native[s - 1]) { if (bad++ < 5) console.error('mismatch seed', s); }
  const tallN = execFileSync(path.join(__dirname, '../gen/gen_host'), ['hash', '1', '20', 'tall']).toString().trim().split('\n').map(l => l.split(' ')[1]);
  for (let s = 1; s <= 20; s++) if (fnv(lab.draw(s, 432).px) !== tallN[s - 1]) { if (bad++ < 5) console.error('mismatch tall seed', s); }
  if (bad) { console.error('FAIL:', bad, 'mismatches'); process.exit(1); }
  console.log('ok: wasm = native for', N, 'screens and 20 scrolls');
})();

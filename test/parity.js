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
  // the ten 1/1 scenes (docs/ONE-OF-ONES.md): native `gen_host special <id> raw` = WASM with special(id)
  for (let id = 1; id <= 10; id++) {
    const want = execFileSync(path.join(__dirname, '../gen/gen_host'), ['special', String(id), 'raw']);
    lab.special(id); const got = lab.draw(0).px; lab.special(0);
    if (Buffer.compare(Buffer.from(got), want) !== 0) { bad++; console.error('mismatch 1/1', id); }
  }
  if (bad) { console.error('FAIL:', bad, 'mismatches'); process.exit(1); }
  console.log('ok: wasm = native for', N, 'screens and the ten 1/1s');
})();

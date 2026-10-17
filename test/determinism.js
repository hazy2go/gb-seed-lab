// Same seed must give the same pixels, forever. Golden hashes (FNV-1a of the shades) in test/golden.txt,
// from the native C build. Run `make -C gen` first.
// node test/determinism.js           check
// node test/determinism.js --update  rewrite golden.txt (only when the art is meant to change; log why)
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const host = path.join(__dirname, '../gen/gen_host'), file = path.join(__dirname, 'golden.txt');
const now = execFileSync(host, ['hash', '1', '300']).toString();
if (process.argv.includes('--update')) { fs.writeFileSync(file, now); console.log('golden.txt updated'); process.exit(0); }
const want = fs.readFileSync(file, 'utf8').trim().split('\n'), got = now.trim().split('\n');
const bad = want.filter((l, i) => l !== got[i]);
if (bad.length || want.length !== got.length) { console.error('FAIL:', bad.length, 'pieces changed:', bad.slice(0, 5).join(', ')); process.exit(1); }
console.log('ok:', want.length, 'pieces match golden.txt');

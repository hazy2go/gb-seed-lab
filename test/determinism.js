// Same seed must give the same traits and pixels. Golden hashes in test/golden.json.
// node test/determinism.js          check
// node test/determinism.js --update rewrite golden.json (only when the art is meant to change)
const fs = require('fs'), crypto = require('crypto'), path = require('path');
const { landscape } = require('../web/gen.js');
const file = path.join(__dirname, 'golden.json');
const hash = (seed, H) => { const a = landscape(seed, H); return crypto.createHash('sha256').update(a.px).update(JSON.stringify(a.traits)).digest('hex').slice(0, 16); };
const now = {};
for (let s = 1; s <= 200; s++) now[s] = hash(s, 144);
for (const s of [1, 2, 3, 4]) now[s + ':tall'] = hash(s, 432);
// running twice in one process must agree too
for (const s of [1, 50, 199]) if (hash(s, 144) !== now[s]) { console.error('FAIL: seed', s, 'differs between two runs'); process.exit(1); }
if (process.argv.includes('--update')) { fs.writeFileSync(file, JSON.stringify(now, null, 1) + '\n'); console.log('golden.json updated'); process.exit(0); }
const gold = JSON.parse(fs.readFileSync(file, 'utf8'));
const bad = Object.keys(gold).filter(k => gold[k] !== now[k]);
if (bad.length) { console.error('FAIL:', bad.length, 'seeds changed:', bad.slice(0, 10).join(' ')); process.exit(1); }
console.log('ok:', Object.keys(gold).length, 'pieces match golden.json');

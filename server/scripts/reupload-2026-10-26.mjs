// One-off (Hazy 2026-10-26): arweave.net never indexed five of the files of Nos. 39 and 40 (Turbo says FINALIZED,
// ardrive.net serves them byte-identical; arweave.net and the Helius CDN 404). Upload those files again (new ids,
// same bytes), then a new metadata JSON naming them. Writes data/reupload-2026-10-26.json; the pieces get pointed at
// the new JSON with `cold-tx.mjs piece-uri` (cold wallet). Does not touch state.json.
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../src/config.mjs';
import { storeFile, storeJson, FILES } from '../src/storage.mjs';
const BROKEN = { 39: ['image', 'replay'], 40: ['image', 'x1'] };
const state = JSON.parse(fs.readFileSync(path.join(config.dataDir, 'state.json'), 'utf8'));
const out = {}, dir = path.join(config.dataDir, 'pieces');
for (const [n, fields] of Object.entries(BROKEN)) {
  const p = state.pieces.find(x => x.n === +n);
  let json = fs.readFileSync(path.join(dir, `${n}.json`), 'utf8');
  const ids = {};
  for (const f of fields) {
    const [, suffix, type] = FILES.find(x => x[0] === f);
    const url = await storeFile(path.join(dir, `${n}${suffix}`), type);
    ids[f] = url.split('/').pop();
    if (!json.includes(p.ar[f])) console.log(`note: ${n}.json does not mention ${f}`);
    json = json.split(p.ar[f]).join(ids[f]);
  }
  const jsonUrl = await storeJson(JSON.parse(json));
  out[n] = { old: p.ar, replaced: ids, json: jsonUrl };
  console.log(n, JSON.stringify(out[n]));
}
fs.writeFileSync(path.join(config.dataDir, 'reupload-2026-10-26.json'), JSON.stringify(out, null, 1));

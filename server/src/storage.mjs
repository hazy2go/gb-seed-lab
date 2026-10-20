// Permanent storage for the minted files: Arweave through ArDrive Turbo (STORAGE=arweave), or this server's own
// /pieces/ (STORAGE=local, development). Turbo charged 0 winc for uploads up to 106000 bytes signed by an unfunded key
// (tested 2026-10-17, LOGBOOK); our files are 3-85 KB, so a piece costs nothing while that holds. If Turbo starts
// charging, uploads fail, the piece waits (minting waits for its metadata) and an alert goes out; fund the upload key
// with Turbo credits then (Hazy's job).
//
// The upload key is its own Solana keypair (.keys/arweave.json, generated if missing; it holds no funds and only
// marks who uploaded). Uploads are idempotent per file: each Arweave id is recorded in the piece before the next one.
import fs from 'node:fs';
import path from 'node:path';
import { Keypair } from '@solana/web3.js';
import { TurboFactory } from '@ardrive/turbo-sdk';
import { base58 } from '@metaplex-foundation/umi/serializers';
import { config, SERVER_DIR } from './config.mjs';

export const GATEWAY = 'https://arweave.net';
const KEY_FILE = path.join(path.dirname(config.keyFile || path.join(SERVER_DIR, '.keys', 'x')), 'arweave.json');
export const FILES = [   // [field, file suffix, content type]
  ['image', '.png', 'image/png'], ['hires', '.hires.png', 'image/png'], ['x1', '.1x.png', 'image/png'], ['replay', '.replay.json', 'application/json'],
];

let turbo;
function client() {
  if (turbo) return turbo;
  if (!fs.existsSync(KEY_FILE)) {
    fs.mkdirSync(path.dirname(KEY_FILE), { recursive: true, mode: 0o700 });
    fs.writeFileSync(KEY_FILE, JSON.stringify(Array.from(Keypair.generate().secretKey)), { mode: 0o600 });
  }
  const kp = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(KEY_FILE, 'utf8'))));
  turbo = TurboFactory.authenticated({ privateKey: base58.deserialize(kp.secretKey)[0], token: 'solana' });
  return turbo;
}

async function put(data, type, tags = []) {
  if (process.env.STORAGE_FAKE === '1') return 'fake-' + (await import('node:crypto')).createHash('sha256').update(data).digest('hex').slice(0, 16);   // tests only
  const r = await client().upload({ data, dataItemOpts: { tags: [{ name: 'Content-Type', value: type }, { name: 'App-Name', value: 'Slow Horizons' }, ...tags] } });
  if (r.winc !== '0') console.log(new Date().toISOString(), 'arweave upload was charged', r.winc, 'winc for', r.id);
  return r.id;
}

// URLs of a piece's files: on Arweave once uploaded, else on this server.
export function urls(p) {
  const local = (suffix) => `${config.publicUrl}/pieces/${p.n}${suffix}`;
  const ar = p.ar || {};
  const out = {};
  for (const [field, suffix] of FILES) out[field] = ar[field] ? `${GATEWAY}/${ar[field]}` : local(suffix);
  out.json = ar.json ? `${GATEWAY}/${ar.json}` : local('.json');
  return out;
}

// Upload whatever is missing for piece p, then its metadata (built by makeMetadata from the final URLs).
// save() persists the piece after every file so a crash never uploads the same file twice.
export async function storePiece(p, dir, makeMetadata, save) {
  if (config.storage !== 'arweave') return true;
  p.ar ||= {};
  const tags = [{ name: 'Piece', value: String(p.n) }, { name: 'Network', value: config.network }];
  for (const [field, suffix, type] of FILES) {
    if (p.ar[field]) continue;
    p.ar[field] = await put(fs.readFileSync(path.join(dir, `${p.n}${suffix}`)), type, tags);
    save();
  }
  if (!p.ar.json) {
    const meta = JSON.stringify(makeMetadata(p), null, 1);
    fs.writeFileSync(path.join(dir, `${p.n}.json`), meta);
    p.ar.json = await put(Buffer.from(meta), 'application/json', tags);
    save();
  }
  return true;
}

// Is the piece readable where wallets look? Wallets and indexers fetch the metadata URI right after the mint lands and
// cache what they get; arweave.net answered 404 for the first ~5-15 min after an upload (ardrive.net already had it), so
// Phantom kept the collection's default description and no attributes for those pieces (mainnet 2026-10-20). Minting
// waits until this passes. Checks exactly what a wallet loads: the metadata JSON (valid, with this piece's name) and the
// image it points to (an image, not an HTML error page). Never throws: any error or timeout is just "not yet".
export async function checkLive(p, { fetch: f = globalThis.fetch, timeoutMs = 20000 } = {}) {
  if (config.storage !== 'arweave') return true;
  if (process.env.STORAGE_FAKE === '1') return true;   // fake ids exist nowhere (tests only)
  if (!p.ar?.json || !p.ar?.image) return false;
  // one deadline for the whole check, bodies included: a gateway that sends headers and then stalls must not hold the
  // caller (audit 2026-10-20: the first version only timed the headers)
  const ac = new AbortController(), t = setTimeout(() => ac.abort(), timeoutMs);
  const timeout = new Promise((_, rej) => ac.signal.addEventListener('abort', () => rej(new Error('timeout')), { once: true }));
  const within = (promise) => Promise.race([promise, timeout]);
  const get = (url) => within(f(url, { signal: ac.signal, redirect: 'follow', headers: { 'cache-control': 'no-cache' } }));
  try {
    const u = urls(p);
    const rj = await get(u.json);
    if (!rj.ok) return false;
    let meta;
    try { meta = JSON.parse(await within(rj.text())); } catch { return false; }
    const name = String(meta?.name ?? ''), want = `Slow Horizons #${p.n}`;
    if ((name !== want && !name.startsWith(want + ': ')) || meta.image !== u.image) return false;   // a 1/1: "Slow Horizons #N: Title"
    const ri = await get(u.image);
    if (!ri.ok || !/^image\//.test(ri.headers.get('content-type') || '')) return false;
    await within(ri.arrayBuffer());   // the whole file arrives (a gateway that only knows the header is not enough)
    return true;
  } catch { return false; }
  finally { clearTimeout(t); timeout.catch(() => {}); }
}

export async function storeJson(obj) { return `${GATEWAY}/${await put(Buffer.from(JSON.stringify(obj, null, 1)), 'application/json')}`; }
export async function storeFile(file, type) { return `${GATEWAY}/${await put(fs.readFileSync(file), type)}`; }

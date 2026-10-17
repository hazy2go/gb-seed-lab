// Local demo of the mint page under load, for screenshots: a fake server that speaks the real page's API and live
// feed, with SIMULATED data only. A full queue, a filled gallery, a piece drawing phase by phase (the reference
// build's real pixels for each seed), new commissions arriving, and a heartbeat. No chain, no Game Boy, no keys.
//   node scripts/demo.mjs [port]      then open http://localhost:<port>/ (default 8795)
// Never deploy this: it exists so the page can be seen busy before launch.
// Allowlists (simulated): the page gets a fake Solana wallet and a fake Ethereum wallet (web/… is served with
// demo-wallets.js injected, demo only; they sign nothing real). Every wallet is on "OG allowlist" (2 free) and
// "Partner holders" (1 at 0.02 SOL); after the Ethereum check it also holds a "Punks holder" (1 free).
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { WebSocketServer } from 'ws';
import { REPO_DIR } from '../src/config.mjs';
import { lab, toTiles, png } from '../src/reference.mjs';
import { describe } from '../src/describe.mjs';
import { gallery } from '../src/gallery.mjs';
import { Transaction, SystemProgram, PublicKey, TransactionInstruction, Keypair } from '@solana/web3.js';

const PORT = +(process.argv[2] || 8795);
const WEB = path.join(REPO_DIR, 'web');
const FPS = 4194304 / 70224;
const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const rnd = (n) => crypto.randomInt(n);
const wallet = () => Array.from({ length: 44 }, () => B58[rnd(58)]).join('');
const sig = () => Array.from({ length: 88 }, () => B58[rnd(58)]).join('');
const seedOk = (s) => { const r = lab.draw(s); const used = new Set(r.px); return used.size === 4; };
// deterministic: the same numbers get the same seeds on every restart (so cached images never disagree with the page)
let rs = 0x5eed1234;
const nextRand = () => { rs ^= rs << 13; rs >>>= 0; rs ^= rs >>> 17; rs ^= rs << 5; rs >>>= 0; return rs; };
const newSeed = () => { for (;;) { const s = nextRand(); if (seedOk(s)) return s; } };

const SOLD0 = 412, MAX = 2000;
const pieces = new Map();
let next = 1;
const now = Date.now();
function make(n, status, t) {
  const seed = newSeed(), r = lab.draw(seed), w = wallet();
  const frames = Math.round((52 + rnd(26)) * FPS);
  const p = { n, wallet: w, short: w.slice(0, 4) + '…' + w.slice(-4), seed, seedHex: seed.toString(16).padStart(8, '0'), status, dev: false,
    traits: r.traits, paidAt: t, drawStart: null, drawEnd: null, frames: null, heartbeat: null, match: null, signature: sig(), mint: null,
    description: describe(r.traits), seedBlock: 380000000 + n * 37, seedBlockhash: null, image: null, hires: null, stream: null };
  if (status === 'minted') {
    p.drawStart = t + 20000; p.drawEnd = p.drawStart + frames / FPS * 1000; p.frames = frames; p.match = true;
    p.heartbeat = { ppm: -56.2 - Math.random() * 1.6, intervals: 4000 + rnd(900), reports: 30 + rnd(8) };
    p.mint = { signature: sig(), assetId: wallet() };
    p.image = `/pieces/${n}.png?s=${p.seedHex}`; p.hires = p.image;
  }
  if (status === 'seeding') { p.hidden = { traits: p.traits, seedHex: p.seedHex, seed: p.seed, description: p.description }; p.traits = null; p.seedHex = null; p.seed = null; p.description = null; }   // like the real server: nothing known before the seed
  pieces.set(n, p);
  return p;
}
// history: finished pieces, then the line
for (let i = 0; i < SOLD0 - 140; i++) { const n = next++; if (i >= SOLD0 - 140 - 160) make(n, 'minted', now - (SOLD0 - i) * 75000); else pieces.set(n, { n, status: 'minted', stub: true }); }
export const DEMO_WALLET = 'DemoCo11ectorWa11et1111111111111111111111111';
for (let i = 0; i < 140; i++) make(next++, i >= 138 ? 'seeding' : 'queued', now - (140 - i) * 9000);   // only the newest few are still waiting for their seed block
setTimeout(() => { for (const p of pieces.values()) if (p.status === 'seeding') { Object.assign(p, p.hidden || {}); delete p.hidden; p.status = 'queued'; send({ type: 'status', piece: pub(p) }); } }, 13000);
{ const p = pieces.get(next - 100); p.wallet = DEMO_WALLET; p.short = 'Demo…1111'; }   // one piece in line belongs to the demo collector (?as=<DEMO_WALLET>)
const pub = (p) => { const { hidden, ...rest } = p; return rest; };
const queue = () => [...pieces.values()].filter((p) => !p.stub && ['seeding', 'queued', 'drawing'].includes(p.status)).sort((a, b) => a.n - b.n);
const recent = () => [...pieces.values()].filter((p) => p.drawEnd).sort((a, b) => b.n - a.n).slice(0, 24);
const sold = () => pieces.size;

if (process.env.DEMO_FIRST_SEEDING) { for (const p of [...pieces.values()]) if (['queued', 'seeding'].includes(p.status)) pieces.delete(p.n); make(next++, 'seeding', Date.now()); }
let live = null, hb = { ppm: -56.84, samples: 4096, at: Date.now() };
const lane = () => ({ kind: 'hardware', label: 'Real Game Boy (DMG) via gb-link-usb', port: '/dev/cu.usbmodem', ready: true, idle: !live, paused: false, busy: !!live, current: live?.p.n ?? null });
const snapshot = () => ({
  type: 'snapshot', network: 'mainnet-beta', priceLamports: 50000000, treasury: '5Uav4kePCC5iMev3X7zXkPciTXKPiTnVzcPF6m8FNSVT', collection: null,
  romSha256: crypto.createHash('sha256').update(fs.readFileSync(path.join(REPO_DIR, 'gb', 'seedlab.gb'))).digest('hex'),
  offers: { lists: 3, eth: true },
  lane: lane(), secondsPerPiece: 70, dev: false, heartbeat: hb, maxSupply: MAX, sold: sold(), closed: false, mintOpen: true, mintClosedReason: null,
  queue: queue().map(pub), recent: recent().map(pub),
  live: live ? { n: live.p.n, piece: pub(live.p), seq: live.sent.length, phases: live.sent.map((x) => x.phase), tiles: live.sent.at(-1)?.tiles ?? null } : null,
});

const BAYER = [0,32,8,40,2,34,10,42,48,16,56,24,50,18,58,26,12,44,4,36,14,46,6,38,60,28,52,20,62,30,54,22,3,35,11,43,1,33,9,41,51,19,59,27,49,17,57,25,15,47,7,39,13,45,5,37,63,31,55,23,61,29,53,21];
function dither(raw) {
  const px = new Uint8Array(160 * 144);
  for (let y = 0; y < 144; y++) for (let x = 0; x < 160; x++) {
    const v = raw[y * 160 + x];
    if (v >= 200) px[y * 160 + x] = v & 3; else { const t = v + BAYER[(y & 7) * 8 + (x & 7)]; px[y * 160 + x] = t >= 192 ? 3 : t >> 6; }
  }
  return px;
}
const clients = new Set();
const send = (m) => { const s = JSON.stringify(m); for (const c of clients) if (c.readyState === 1) c.send(s); };

// drawing: the reference build's real frames for this seed, one screen update per phase, ~60-75 s per piece
function startNext() {
  const p = queue().find((x) => x.status === 'queued');
  if (!p) return;
  const frames = [];
  // each phase's buffer is the tone field; the ROM dithers it on the copy to video memory (gen_host.c does the same)
  lab.draw(p.seed, (phase, raw) => { if (raw) frames.push({ phase, tiles: toTiles(dither(raw)).toString('base64') }); });
  p.status = 'drawing'; p.drawStart = Date.now();
  live = { p, frames, sent: [] };
  send({ type: 'drawing', piece: pub(p), lane: lane() });
  const step = () => {
    if (!live || live.p !== p) return;
    const f = frames[live.sent.length];
    if (!f) return finish(p);
    live.sent.push(f);
    send({ type: 'phase', n: p.n, phase: f.phase, seq: live.sent.length, t: Date.now() - p.drawStart, tiles: f.tiles });
    setTimeout(step, 6000 + rnd(4000));
  };
  setTimeout(step, 2500);
}
function finish(p) {
  p.status = 'minted'; p.drawEnd = Date.now(); p.frames = Math.round((p.drawEnd - p.drawStart) / 1000 * FPS); p.match = true;
  p.heartbeat = { ppm: hb.ppm, intervals: 4100, reports: 33 }; p.mint = { signature: sig(), assetId: wallet() };
  p.image = `/pieces/${p.n}.png?s=${p.seedHex}`; p.hires = p.image;
  send({ type: 'drawn', piece: pub(p) });
  live = null;
  setTimeout(startNext, 9000);
}
// new commissions keep arriving
setInterval(() => { const p = make(next++, 'seeding', Date.now()); send({ type: 'queued', piece: pub(p) }); setTimeout(() => { Object.assign(p, p.hidden || {}); delete p.hidden; p.status = 'queued'; send({ type: 'status', piece: pub(p) }); }, 13000); }, 7000);
// heartbeat: around a DMG's typical offset, drifting slightly
setInterval(() => { hb = { ppm: Math.round((hb.ppm + (Math.random() - 0.5) * 0.06) * 100) / 100, samples: 4096, at: Date.now() }; send({ type: 'heartbeat', ...hb, piece: live?.p.n ?? null }); }, 2000);

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.wasm': 'application/wasm', '.woff2': 'font/woff2', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp' };
const json = (res, code, o) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x'), p = url.pathname;
  if (p === '/api/state') return json(res, 200, snapshot());
  if (p === '/api/piece') { const pc = pieces.get(+url.searchParams.get('n')); return pc && !pc.stub ? json(res, 200, { piece: pub(pc), romSha256: snapshot().romSha256, network: 'mainnet-beta' }) : json(res, 404, { error: 'No piece with that number yet.' }); }
  if (p === '/api/pieces') return json(res, 200, { pieces: [], refunds: [] });
  if (p === '/api/gallery') return json(res, 200, gallery([...pieces.values()].filter((x) => !x.stub), url.searchParams, pub));
  if (p.startsWith('/api/eligibility') || p.startsWith('/api/eth/') || p.startsWith('/api/claim') || p === '/api/ticket' || p === '/api/submit') return demoAllowlist(req, res, url, p);
  if (p === '/demo-wallets.js') { res.writeHead(200, { 'content-type': 'text/javascript' }); return res.end(DEMO_WALLETS); }
  if (p === '/' || p === '/index.html') { res.writeHead(200, { 'content-type': TYPES['.html'] }); return res.end(fs.readFileSync(path.join(WEB, 'index.html'), 'utf8').replace('<script src="vendor/web3.iife.min.js">', '<script src="demo-wallets.js"></script><script src="vendor/web3.iife.min.js">')); }
  let m;
  if ((m = p.match(/^\/pieces\/(\d+)\.png$/))) {
    const pc = pieces.get(+m[1]); if (!pc || pc.stub) { res.writeHead(404); return res.end(); }
    const r = lab.draw(pc.seed); res.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'no-cache' }); return res.end(png(r.px, r.colors, 6));
  }
  const f = path.join(WEB, path.normalize(p === '/' ? '/index.html' : p));
  if (!f.startsWith(WEB) || !fs.existsSync(f) || !fs.statSync(f).isFile()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
// ---------------------------------------------------------------- simulated allowlists
const unitOf = (w, list) => crypto.createHash('sha256').update(list + w).digest('hex').slice(0, 24);
const demoUse = new Map(), demoLinked = new Set(), demoGrants = new Map();
const DEMO_LISTS = [
  { list: 'og', name: 'OG allowlist', chain: 'solana', type: 'wallets', per: 'wallet', limit: 2, price: 0 },
  { list: 'partners', name: 'Partner holders', chain: 'solana', type: 'collection', per: 'nft', limit: 1, price: 20000000 },
  { list: 'punks', name: 'Punks holder', chain: 'ethereum', type: 'collection', per: 'nft', limit: 1, price: 0, eth: true },
];
function demoOffers(w) {
  return DEMO_LISTS.filter(l => !l.eth || demoLinked.has(w)).map(({ eth, ...l }) => {
    const remaining = Math.max(0, l.limit - (demoUse.get(l.list + w) || 0));
    return { ...l, remaining, units: remaining ? [{ unit: unitOf(w, l.list), remaining }] : [] };
  });
}
const readBody = (req) => new Promise((r) => { let d = ''; req.on('data', c => { d += c; }); req.on('end', () => { try { r(JSON.parse(d || '{}')); } catch { r({}); } }); });
function demoPiece(w, list) {
  const pc = make(next++, 'seeding', Date.now()); pc.wallet = w; pc.short = w.slice(0, 4) + '…' + w.slice(-4); pc.claim = list === 'og' || list === 'punks';
  send({ type: 'queued', piece: pub(pc) });
  setTimeout(() => { Object.assign(pc, pc.hidden || {}); delete pc.hidden; pc.status = 'queued'; send({ type: 'status', piece: pub(pc) }); }, 13000);
  return pc;
}
async function demoAllowlist(req, res, url, p) {
  const q = url.searchParams;
  if (p === '/api/eligibility') return json(res, 200, { offers: demoOffers(q.get('wallet')), unavailable: [], eth: true, ethLinked: demoLinked.has(q.get('wallet')) ? 1 : 0 });
  if (p === '/api/eth/challenge') return json(res, 200, { nonce: crypto.randomBytes(16).toString('hex'), expires: Date.now() + 600000, message: `Slow Horizons: link this Ethereum wallet to a Solana wallet for the holder mint.\n\nSite: localhost (demo)\nEthereum wallet: ${q.get('eth')}\nSolana wallet (receives the pieces): ${q.get('sol')}\nChain: Ethereum mainnet\nNonce: demo\n\nThis is a signature only: no transaction, no fees, no approval.` });
  if (p === '/api/eth/link') { const b = await readBody(req); demoLinked.add(b.sol); return json(res, 200, { offers: demoOffers(b.sol).filter(o => o.chain === 'ethereum'), unavailable: [] }); }
  if (p === '/api/claim/challenge') return json(res, 200, { nonce: crypto.randomBytes(16).toString('hex'), expires: Date.now() + 600000, message: `Slow Horizons: claim a free piece.\n\nSite: localhost (demo)\nWallet: ${q.get('wallet')}\nList: OG allowlist\n\nSigning is free and sends nothing.` });
  if (p === '/api/claim') {
    const b = await readBody(req), o = demoOffers(b.wallet).find(x => x.list === b.list);
    if (!o || o.price !== 0 || o.remaining < 1) return json(res, 409, { error: 'This offer is used up.' });
    demoUse.set(b.list + b.wallet, (demoUse.get(b.list + b.wallet) || 0) + 1);
    return json(res, 200, { n: demoPiece(b.wallet, b.list).n });
  }
  if (p === '/api/ticket') {
    const b = await readBody(req);
    if (!b.list) return json(res, 400, { error: 'This is a local demo: the public mint cannot be bought here. Try an allowlist offer.' });
    const o = demoOffers(b.wallet).find(x => x.list === b.list);
    if (!o || o.remaining < 1) return json(res, 409, { error: 'This offer is used up.' });
    const ticket = crypto.randomBytes(8).toString('hex'), treasury = new PublicKey('5Uav4kePCC5iMev3X7zXkPciTXKPiTnVzcPF6m8FNSVT'), payer = new PublicKey(b.wallet);
    const tx = new Transaction({ feePayer: payer, blockhash: 'GHtXQBsoZHVnNFa9YevAzFr17DJjgHXk3ycTKD5xD3Zi', lastValidBlockHeight: 1 });
    tx.add(SystemProgram.transfer({ fromPubkey: payer, toPubkey: treasury, lamports: o.price }));
    tx.add(new TransactionInstruction({ programId: new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr'), keys: [], data: Buffer.from('slowhorizons:' + ticket) }));
    demoGrants.set(ticket, { wallet: b.wallet, list: b.list });
    return json(res, 200, { ticket, tx: tx.serialize({ requireAllSignatures: false, verifySignatures: false }).toString('base64'), priceLamports: o.price, treasury: treasury.toBase58(), network: 'mainnet-beta', grant: { list: o.list, name: o.name, price: o.price, expires: Date.now() + 600000 } });
  }
  if (p === '/api/submit') {
    const b = await readBody(req), g = demoGrants.get(b.ticket);
    if (!g) return json(res, 400, { error: 'This is a local demo: nothing can be bought here.' });
    demoGrants.delete(b.ticket);
    demoUse.set(g.list + g.wallet, (demoUse.get(g.list + g.wallet) || 0) + 1);
    const pc = demoPiece(g.wallet, g.list);
    return json(res, 202, { signature: pc.signature, note: 'Demo: nothing was sent.' });
  }
  return json(res, 404, { error: 'not found' });
}
// fake wallets for the demo page only: a Wallet Standard Solana wallet (a throwaway key made at demo start, never
// funded, so the page's real sign-and-check path runs) and an EIP-6963 Ethereum wallet
const DEMO_KEY = Keypair.generate();
const DEMO_WALLETS = `(() => {
  const icon = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><rect width="24" height="24" fill="#17181b"/></svg>');
  const address = '${DEMO_KEY.publicKey.toBase58()}', secret = Uint8Array.from(${JSON.stringify(Array.from(DEMO_KEY.secretKey))});
  const w = { version: '1.0.0', name: 'Demo wallet', icon, chains: ['solana:mainnet'], accounts: [],
    features: {
      'standard:connect': { version: '1.0.0', connect: async () => ({ accounts: [{ address, chains: ['solana:mainnet'], features: [] }] }) },
      'solana:signTransaction': { version: '1.0.0', signTransaction: async ({ transaction }) => { const tx = solanaWeb3.Transaction.from(transaction); tx.partialSign(solanaWeb3.Keypair.fromSecretKey(secret)); return [{ signedTransaction: tx.serialize() }]; } },
      'solana:signMessage': { version: '1.0.0', signMessage: async () => [{ signature: new Uint8Array(64).fill(7) }] },
    } };
  window.addEventListener('wallet-standard:app-ready', (e) => e.detail.register(w));
  const eth = { request: async ({ method }) => method === 'eth_requestAccounts' ? ['0xDe000000000000000000000000000000000000De'] : method === 'personal_sign' ? '0x' + 'ab'.repeat(65) : null };
  window.addEventListener('eip6963:requestProvider', () => window.dispatchEvent(new CustomEvent('eip6963:announceProvider', { detail: Object.freeze({ info: { uuid: 'demo-eth', name: 'Demo ETH wallet', icon, rdns: 'demo.eth' }, provider: eth }) })));
})();`;

const wss = new WebSocketServer({ server, path: '/live' });
wss.on('connection', (ws) => { clients.add(ws); ws.send(JSON.stringify(snapshot())); ws.on('close', () => clients.delete(ws)); });
server.listen(PORT, '127.0.0.1', () => { console.log(`demo (simulated data) on http://localhost:${PORT}/  · as a collector: http://localhost:${PORT}/?as=${DEMO_WALLET}`); startNext(); });

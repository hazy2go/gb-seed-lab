// Mint server: payments in, one lane draws in order, tiles checked against the reference, compressed NFT out.
// HTTP API + WebSocket live feed. See docs/MINT.md.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { WebSocketServer } from 'ws';
import { config, REPO_DIR } from './config.mjs';
import { lab, toTiles, fromTiles, png, romBytes } from './reference.mjs';
import { HardwareLane } from './lanes/hardware.mjs';
import * as sol from './solana.mjs';
import { PublicKey } from '@solana/web3.js';

const FPS = 4194304 / 70224;
const ROM_SHA256 = crypto.createHash('sha256').update(romBytes).digest('hex');
const PIECES = path.join(config.dataDir, 'pieces');
const STATE = path.join(config.dataDir, 'state.json');
fs.mkdirSync(PIECES, { recursive: true });

// ---------------------------------------------------------------- state

const state = fs.existsSync(STATE) ? JSON.parse(fs.readFileSync(STATE, 'utf8')) : { nextIndex: 1, tickets: {}, pieces: [], usedSignatures: {} };
function save() {
  fs.writeFileSync(STATE + '.tmp', JSON.stringify(state, null, 1));
  fs.renameSync(STATE + '.tmp', STATE);
}
const log = (...a) => console.log(new Date().toISOString(), ...a);
const seedFrom = (signature) => crypto.createHash('sha256').update(signature, 'utf8').digest().readUInt32LE(0);
const shortWallet = (w) => w.length > 12 ? w.slice(0, 4) + '…' + w.slice(-4) : w;

function enqueue({ wallet, signature, ticket, dev = false, paidAt = Date.now(), lamports = 0 }) {
  if (state.usedSignatures[signature]) return null;
  const seed = seedFrom(signature);
  const piece = { n: state.nextIndex++, wallet, signature, ticket, seed, dev, lamports, paidAt, status: 'queued', attempts: 0, traits: lab.traits(seed) };
  state.usedSignatures[signature] = piece.n;
  state.pieces.push(piece);
  if (ticket && state.tickets[ticket]) state.tickets[ticket].status = 'paid';
  save();
  log('queued', piece.n, shortWallet(wallet), 'seed', seed.toString(16));
  broadcast({ type: 'queued', piece: publicPiece(piece) });
  pump();
  return piece;
}

function publicPiece(p) {
  return {
    n: p.n, wallet: p.wallet, short: shortWallet(p.wallet), seed: p.seed, seedHex: p.seed.toString(16).padStart(8, '0'), status: p.status,
    dev: !!p.dev, lane: p.lane || null, traits: p.traits, paidAt: p.paidAt, drawStart: p.drawStart || null, drawEnd: p.drawEnd || null,
    frames: p.frames || null, match: p.match ?? null, signature: p.signature, mint: p.mint || null,
    image: p.drawEnd ? `${config.publicUrl}/pieces/${p.n}.png` : null,
    stream: p.drawStart && config.streamUrl ? config.streamUrl.replace('{t}', Math.floor(p.drawStart / 1000)) : null,
  };
}

// ---------------------------------------------------------------- lane

// Only the real Game Boy draws. No fallback: if it is not connected, minting is closed and paid pieces wait.
const lane = new HardwareLane({ port: config.serial });
let current = null;   // { piece, phases: [], lastTiles }
let lastLaneMsg = '', lastReady = null;
lane.on('error', (e) => {
  // the Pico retry fires every 5 s; log and tell the pages only when something actually changed
  if (e.message !== lastLaneMsg) { log('lane error:', e.message); lastLaneMsg = e.message; }
  if (lane.ready !== lastReady) { lastReady = lane.ready; broadcast({ type: 'lane', lane: laneInfo() }); }
});
lane.on('ready', () => { log('lane ready:', lane.kind); lastLaneMsg = ''; lastReady = true; broadcast({ type: 'lane', lane: laneInfo() }); pump(); });
lane.on('phase', ({ seq, phase, tiles }) => {
  if (!current) return;
  const t = Date.now() - current.piece.drawStart;
  current.phases.push({ seq: seq ?? current.phases.length + 1, phase, t, tiles: tiles.toString('base64') });
  current.lastTiles = tiles;
  broadcast({ type: 'phase', n: current.piece.n, phase, seq: current.phases.length, t, tiles: tiles.toString('base64') });
});
lane.on('done', (d) => finish(d).catch((e) => { log('finish failed:', e); }));

function laneInfo() {
  return { ...lane.info(), ready: lane.ready, busy: !!current, current: current ? current.piece.n : null };
}

function pump() {
  if (current || !lane.ready) return;
  const piece = state.pieces.find(p => p.status === 'queued');
  if (!piece) return;
  piece.status = 'drawing'; piece.lane = lane.kind; piece.drawStart = Date.now(); piece.attempts++;
  current = { piece, phases: [], lastTiles: null };
  save();
  log('drawing', piece.n, 'on', lane.kind, 'seed', piece.seed.toString(16));
  broadcast({ type: 'drawing', piece: publicPiece(piece), lane: laneInfo() });
  lane.draw(piece.seed);
}

async function finish({ seed, frames, heartbeat }) {
  if (!current) return;
  const { piece, phases, lastTiles } = current;
  if (seed !== piece.seed) log('warning: lane finished seed', seed, 'expected', piece.seed);
  piece.drawEnd = Date.now(); piece.frames = frames; piece.heartbeat = heartbeat;
  const ref = lab.draw(piece.seed);
  piece.match = !!lastTiles && toTiles(ref.px).equals(lastTiles);
  fs.writeFileSync(path.join(PIECES, `${piece.n}.replay.json`), JSON.stringify({ n: piece.n, seed: piece.seed, lane: lane.kind, phases }));
  current = null;
  if (!piece.match) {
    log('MISMATCH piece', piece.n, 'attempt', piece.attempts);
    piece.status = piece.attempts < 2 ? 'queued' : 'failed';
    if (piece.status === 'failed') piece.error = 'tiles did not match the reference twice; refund by hand';
    save(); broadcast({ type: 'status', piece: publicPiece(piece) }); pump();
    return;
  }
  const px = fromTiles(lastTiles);   // what the lane actually drew (equal to the reference, checked above)
  fs.writeFileSync(path.join(PIECES, `${piece.n}.png`), png(px, ref.colors, 6));
  fs.writeFileSync(path.join(PIECES, `${piece.n}.1x.png`), png(px, ref.colors, 1));
  fs.writeFileSync(path.join(PIECES, `${piece.n}.json`), JSON.stringify(metadata(piece), null, 1));
  piece.status = 'drawn';
  save();
  log('drawn', piece.n, frames, 'frames', (frames / FPS).toFixed(0) + ' s');
  broadcast({ type: 'drawn', piece: publicPiece(piece) });
  pump();
  await mint(piece);
}

function metadata(p) {
  const t = p.traits, secs = Math.round(p.frames / FPS);
  return {
    name: `Seed Lab #${p.n}`,
    symbol: 'SEEDLAB',
    description: `Landscape drawn by a real Game Boy from seed ${p.seed.toString(16).padStart(8, '0')}, the hash of its payment transaction. The ROM's SHA-256 is recorded; the source and ROM are to be published after the mint so anyone can redraw it and check it pixel for pixel.`,
    image: `${config.publicUrl}/pieces/${p.n}.png`,
    external_url: `${config.publicUrl}/pieces/${p.n}.json`,
    attributes: [
      { trait_type: 'Palette', value: t.palette }, { trait_type: 'Time', value: t.time }, { trait_type: 'Sky', value: t.sky },
      { trait_type: 'Terrain', value: t.terrain }, { trait_type: 'Ground', value: t.ground }, { trait_type: 'Weather', value: t.weather },
      { trait_type: 'Ridges', value: String(t.ridges) }, { trait_type: 'Snowcaps', value: t.snowcaps ? 'yes' : 'no' },
      ...t.extras.map(e => ({ trait_type: 'Extra', value: e })),
      { trait_type: 'Draw time', value: `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}` },
    ],
    properties: {
      category: 'image',
      files: [{ uri: `${config.publicUrl}/pieces/${p.n}.png`, type: 'image/png' }, { uri: `${config.publicUrl}/pieces/${p.n}.1x.png`, type: 'image/png' }],
      seed: p.seed, payment_signature: p.signature, lane: p.lane, rom_sha256: ROM_SHA256,
      draw_start: new Date(p.drawStart).toISOString(), draw_end: new Date(p.drawEnd).toISOString(), frames: p.frames,
      heartbeat_ppm: p.heartbeat ?? null, check: 'final tiles equal the reference build of the same C source',
      replay: `${config.publicUrl}/pieces/${p.n}.replay.json`,
    },
  };
}

async function mint(piece) {
  if (!config.mint || !config.tree || !config.collection) { log('mint skipped for', piece.n, '(MINT=0 or no tree/collection)'); return; }
  if (piece.dev) { log('mint skipped for dev piece', piece.n); return; }
  try {
    piece.status = 'minting'; save(); broadcast({ type: 'status', piece: publicPiece(piece) });
    piece.mint = await sol.mintPiece({ owner: piece.wallet, name: `Seed Lab #${piece.n}`, uri: `${config.publicUrl}/pieces/${piece.n}.json` });
    piece.status = 'minted';
    log('minted', piece.n, piece.mint.signature);
  } catch (e) {
    piece.status = 'mint-failed'; piece.error = String(e.message || e);
    log('mint failed', piece.n, piece.error);
  }
  save(); broadcast({ type: 'status', piece: publicPiece(piece) });
}

// ---------------------------------------------------------------- payments

async function acceptSignature(signature, hintTicket) {
  if (state.usedSignatures[signature]) return { already: state.usedSignatures[signature] };
  const v = await sol.verifyPayment(signature);
  if (!v) return null;
  if (hintTicket && v.ticket !== hintTicket) return null;
  const piece = enqueue({ wallet: v.wallet, signature, ticket: v.ticket, paidAt: (v.blockTime || Date.now() / 1000) * 1000, lamports: v.lamports });
  return piece ? { n: piece.n } : null;
}

async function pollPayments() {
  try {
    for (const sig of await sol.recentPaymentSignatures()) if (!state.usedSignatures[sig]) await acceptSignature(sig);
  } catch (e) { log('poll error:', e.message); }
}
setInterval(pollPayments, 6000);

// ---------------------------------------------------------------- HTTP + WebSocket

const clients = new Set();
function broadcast(msg) { const s = JSON.stringify(msg); for (const c of clients) if (c.readyState === 1) c.send(s); }

function eta() {
  const done = state.pieces.filter(p => p.frames).slice(-20);
  const avg = done.length ? done.reduce((a, p) => a + p.frames, 0) / done.length : 25000;
  const perPiece = avg / FPS + 70;   // + link transfers
  return Math.round(perPiece);
}
function snapshot() {
  const queue = state.pieces.filter(p => p.status === 'queued' || p.status === 'drawing');
  return {
    type: 'snapshot', network: config.network, priceLamports: config.priceLamports, treasury: sol.treasury.toBase58(),
    collection: config.collection || null, romSha256: ROM_SHA256, lane: laneInfo(), secondsPerPiece: eta(), dev: config.dev,
    queue: queue.map(publicPiece), recent: state.pieces.filter(p => p.drawEnd).slice(-24).reverse().map(publicPiece),
    minted: state.pieces.filter(p => p.status === 'minted').length, total: state.pieces.length,
    live: current ? { n: current.piece.n, piece: publicPiece(current.piece), seq: current.phases.length, phases: current.phases.map(p => p.phase), tiles: current.lastTiles?.toString('base64') || null } : null,
  };
}

const json = (res, code, obj) => { res.writeHead(code, { 'content-type': 'application/json', 'access-control-allow-origin': config.cors }); res.end(JSON.stringify(obj)); };
const body = (req) => new Promise((res, rej) => { let d = ''; req.on('data', c => { d += c; if (d.length > 1e5) req.destroy(); }); req.on('end', () => { try { res(d ? JSON.parse(d) : {}); } catch (e) { rej(e); } }); });
const TYPES = { '.png': 'image/png', '.json': 'application/json', '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.wasm': 'application/wasm', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.webp': 'image/webp', '.jpg': 'image/jpeg' };
function serveFile(res, root, rel) {
  const f = path.resolve(root, '.' + rel);
  if (!f.startsWith(path.resolve(root)) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) return false;
  res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream', 'access-control-allow-origin': config.cors, 'cache-control': 'no-cache' });
  fs.createReadStream(f).pipe(res);
  return true;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    if (req.method === 'OPTIONS') { res.writeHead(204, { 'access-control-allow-origin': config.cors, 'access-control-allow-headers': 'content-type', 'access-control-allow-methods': 'GET,POST' }); return res.end(); }
    if (url.pathname === '/api/state') return json(res, 200, snapshot());
    if (url.pathname === '/api/ticket' && req.method === 'POST') {
      const { wallet } = await body(req);
      if (!lane.ready) return json(res, 503, { error: 'The Game Boy is not connected, so minting is closed right now. Nothing was charged.' });
      try { new PublicKey(wallet); } catch { return json(res, 400, { error: 'That is not a Solana address.' }); }
      const ticket = crypto.randomBytes(8).toString('hex');
      const { tx, lastValidBlockHeight } = await sol.buildPayment(wallet, ticket);
      state.tickets[ticket] = { ticket, wallet, created: Date.now(), status: 'open' };
      save();
      return json(res, 200, { ticket, tx, lastValidBlockHeight, priceLamports: config.priceLamports, treasury: sol.treasury.toBase58(), network: config.network });
    }
    if (url.pathname === '/api/submit' && req.method === 'POST') {
      // the wallet signed; we broadcast on our network so a wallet set to another network cannot misroute it
      const { ticket, tx } = await body(req);
      if (!state.tickets[ticket]) return json(res, 400, { error: 'Unknown ticket. Start again.' });
      let signature;
      try { signature = await sol.connection.sendRawTransaction(Buffer.from(String(tx), 'base64'), { skipPreflight: false }); }
      catch (e) { return json(res, 400, { error: 'The network rejected the transaction: ' + String(e.message || e).split('\n')[0] }); }
      try { await sol.connection.confirmTransaction(signature, 'confirmed'); } catch { /* the poller still finds it */ }
      const r = await acceptSignature(signature, String(ticket));
      return json(res, r ? 200 : 202, r ? { ...r, signature } : { pending: true, signature, note: 'Sent. It is picked up automatically once it confirms.' });
    }
    if (url.pathname === '/collection.json') return json(res, 200, { name: 'Seed Lab', symbol: 'SEEDLAB', description: 'Landscapes drawn live by a Game Boy, one seed per payment. The ROM hash is in every record; the source is to be published after the mint so every piece can be redrawn and checked.', image: `${config.publicUrl}/pieces/1.png`, external_url: config.publicUrl });
    if (url.pathname === '/api/paid' && req.method === 'POST') {
      const { ticket, signature } = await body(req);
      for (let i = 0; i < 10; i++) {   // the transaction may need a few seconds to be visible as confirmed
        const r = await acceptSignature(String(signature), String(ticket));
        if (r) return json(res, 200, r);
        await new Promise(r => setTimeout(r, 2000));
      }
      return json(res, 202, { pending: true, note: 'Not confirmed yet. Your payment is picked up automatically once it lands.' });
    }
    if (url.pathname === '/api/pieces') {
      const owner = url.searchParams.get('owner');
      const list = state.pieces.filter(p => !owner || p.wallet === owner).map(publicPiece);
      return json(res, 200, { pieces: list });
    }
    if (url.pathname === '/api/dev/pay' && req.method === 'POST') {
      if (!config.dev) return json(res, 404, { error: 'not found' });
      const { wallet } = await body(req);
      const signature = 'dev-' + crypto.randomBytes(16).toString('hex');
      const p = enqueue({ wallet: wallet || 'dev-wallet', signature, dev: true });
      return json(res, 200, { n: p.n, seed: p.seed });
    }
    if (url.pathname.startsWith('/pieces/') && serveFile(res, PIECES, url.pathname.slice('/pieces'.length))) return;
    // local development: serve the site too
    let rel = url.pathname === '/' ? '/index.html' : url.pathname;
    if (rel.endsWith('/')) rel += 'index.html';
    if (serveFile(res, path.join(REPO_DIR, 'web'), rel)) return;
    json(res, 404, { error: 'not found' });
  } catch (e) {
    log('http error', e);
    json(res, 500, { error: 'Server error. Nothing was charged by this request.' });
  }
});

const wss = new WebSocketServer({ server, path: '/live' });
wss.on('connection', (ws) => { clients.add(ws); ws.send(JSON.stringify(snapshot())); ws.on('close', () => clients.delete(ws)); });

// resume after a restart: a piece that was mid-draw goes back to the front of the queue
for (const p of state.pieces) if (p.status === 'drawing') { p.status = 'queued'; p.attempts = Math.max(0, p.attempts - 1); }
save();
server.listen(config.port, () => log(`seed lab server on :${config.port}, ${config.network}, lane ${lane.kind}, treasury ${sol.treasury.toBase58()}, ROM ${ROM_SHA256.slice(0, 12)}`));

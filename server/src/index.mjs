// Slow Horizons mint server. Payments in (treasury watcher), one real Game Boy draws in order, tiles checked against
// the reference build, compressed NFT out. HTTP API + WebSocket live feed + admin API. See docs/MINT.md.
//
// Piece lifecycle: seeding (paid, waiting for the seed block) -> queued -> drawing -> drawn (checked, files written)
// -> minting -> minted. Payments that cannot become a piece (underpaid, sold out, closed) become refund records.
// Nothing is ever deleted; payments.jsonl and events.jsonl are append-only.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { WebSocketServer } from 'ws';
import { config, checkConfig, REPO_DIR, SERVER_DIR, GENESIS } from './config.mjs';
import { openLists, isSolAddress, isEthAddress, listActive } from './lists.mjs';
import { createHoldings } from './holdings.mjs';
import { createEthVerifier } from './sigs.mjs';
import { createAllowlist, AllowError, isUnit } from './allowlist.mjs';
import { createAdmin } from './admin/admin.mjs';
import { createAccessVerifier } from './admin/access.mjs';
import { issueSetupCode } from './admin/passkeys.mjs';
import { lab, toTiles, fromTiles, png, romBytes } from './reference.mjs';
import { HardwareLane, crc16 } from './lanes/hardware.mjs';
import { describe } from './describe.mjs';
import { gallery } from './gallery.mjs';
import { openStore } from './store.mjs';
import * as sol from './solana.mjs';
import * as storage from './storage.mjs';
import { PublicKey } from '@solana/web3.js';

checkConfig();
await sol.checkNetwork();

const FPS = 4194304 / 70224;
const ROM_SHA256 = crypto.createHash('sha256').update(romBytes).digest('hex');
const store = openStore(config.dataDir, { network: config.network, genesis: GENESIS[config.network], treasury: sol.treasury.toBase58(), collection: config.collection || null });
const { state } = store;
state.refunds ||= [];
const PIECES = store.piecesDir;

const log = (...a) => console.log(new Date().toISOString(), ...a);
const shortWallet = (w) => w.length > 12 ? w.slice(0, 4) + '…' + w.slice(-4) : w;
const minted = () => state.pieces.filter(p => !p.dev).length;   // pieces with a number (each one will be minted)

// ---------------------------------------------------------------- allowlists and holder mints (src/allowlist.mjs)

const lists = openLists({ dataDir: config.dataDir, seedFile: config.listsSeed, maxPriceLamports: config.priceLamports, log });
const ethEnabled = !!config.alchemyKey;
if (!ethEnabled) log(`Ethereum lists disabled: ALCHEMY_API_KEY is not set${lists.all().some(l => l.chain === 'ethereum') ? ` (${lists.all().filter(l => l.chain === 'ethereum').length} Ethereum list(s) give no offers)` : ''}; Solana lists work`);
const SITE_HOST = (() => { try { return new URL(config.siteUrl || config.publicUrl).host; } catch { return 'slow horizons'; } })();
const allowlist = createAllowlist({
  state, save: () => store.save(), event: (o) => store.event(o), payment: (o) => store.payment(o), lists, ethEnabled, domain: SITE_HOST,
  holdings: createHoldings({ dasUrl: config.rpc, alchemyKey: config.alchemyKey }),
  verifyEth: createEthVerifier({ rpcUrl: config.alchemyRpc || `https://eth-mainnet.g.alchemy.com/v2/${config.alchemyKey}` }),
  maxSupply: config.maxSupply, minted, mintOpen: () => mintOpen(), getSlot: () => sol.connection.getSlot('confirmed'),
  createClaimPiece: (c) => createClaimPiece(c), log,
});
setInterval(() => allowlist.expireTick(), 30000);
// A free claim becomes a piece like a payment would, without a payment signature. Its seed stays unpredictable:
// seed = sha256(claim id || blockhash of the first block >= claim slot + SEED_DELAY_SLOTS), the claim id being random
// and made by the server (deriveSeed, same anti-grinding idea as for payments).
function createClaimPiece({ wallet, claimId, slot, list, listName, unit }) {
  const p = { n: state.nextIndex++, wallet, signature: null, claimId, slot, list, listName, unit, received: 0, price: 0, paidAt: Date.now(), status: 'seeding', attempts: 0 };
  state.pieces.push(p);
  store.event({ n: p.n, status: 'seeding', claim: claimId, wallet, list });
  store.save();
  log('claimed', p.n, shortWallet(wallet), list);
  broadcast({ type: 'queued', piece: publicPiece(p) });
  setImmediate(seedTick);
  return p.n;
}

// ---------------------------------------------------------------- alerts

let alertTimes = {};
const recentAlerts = [];   // for the admin page
async function alert(kind, text, { force = false } = {}) {   // force: admin actions and lockouts always go out
  log('ALERT', kind, text);
  store.event({ alert: kind, text });
  recentAlerts.push({ at: Date.now(), kind, text: String(text).slice(0, 300) }); if (recentAlerts.length > 50) recentAlerts.shift();
  if (!config.alertWebhook) return;
  if (!force && Date.now() - (alertTimes[kind] || 0) < 5 * 60 * 1000) return;   // at most one per kind per 5 min
  alertTimes[kind] = Date.now();
  try { await fetch(config.alertWebhook, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ content: `Slow Horizons (${config.network}): ${text}` }) }); }
  catch (e) { log('alert webhook failed:', e.message); }
}
process.on('unhandledRejection', (e) => { alert('crash', 'unhandled rejection: ' + (e?.stack || e)); });
process.on('uncaughtException', (e) => { alert('crash', 'uncaught exception: ' + (e?.stack || e)); setTimeout(() => process.exit(1), 500); });

function setStatus(p, status, extra = {}) {
  Object.assign(p, extra);
  p.status = status;
  store.event({ n: p.n, status, ...extra });
  store.save();
  broadcast({ type: 'status', piece: publicPiece(p) });
}

// ---------------------------------------------------------------- payments

const DUST_LAMPORTS = 1_000_000;   // under 0.001 SOL with our memo = spam, not a buyer
const ignoredSigs = new Set();   // treasury txs without our memo (not ours) or failed txs
function mintOpen() {
  if (state.closed) return { open: false, reason: 'closed' };
  if (minted() >= config.maxSupply) return { open: false, reason: 'sold out' };
  if (!laneOnline()) return { open: false, reason: 'Game Boy offline' };
  if (Date.now() - lastPollOk > 120000) return { open: false, reason: 'payment watcher behind' };
  if (hotBalance !== null && hotBalance < 0.02e9) return { open: false, reason: 'minting wallet empty' };   // payments would queue with no way to mint
  return { open: true };
}

// The poller and the /api/submit fast path can ask about the same signature at once: share one in-flight
// evaluation per signature so a payment can never become two pieces (audit 2026-10-18).
const inFlight = new Map();
function handlePayment(signature) {
  if (!inFlight.has(signature)) inFlight.set(signature, evaluatePayment(signature).finally(() => inFlight.delete(signature)));
  return inFlight.get(signature);
}
async function evaluatePayment(signature) {
  if (state.usedSignatures[signature] || ignoredSigs.has(signature)) return state.usedSignatures[signature] || 'ignored';
  const info = await sol.inspectPayment(signature, 'finalized');
  if (info === null || info.status === 'failed') { ignoredSigs.add(signature); return 'ignored'; }
  if (info.status === 'not-found') return 'pending';
  // an allowlist grant prices this payment if it is for this payer and the payment's block time is before it expired;
  // decided and recorded below with no await in between (two payments on one grant: the first takes it)
  const grant = allowlist.grantFor({ ticket: info.ticket, wallet: info.wallet, blockTime: info.blockTime });
  const price = grant ? grant.price : config.priceLamports;
  if (info.received < DUST_LAMPORTS) {   // spam with our memo (0 or a few lamports): note it, no refund record, no alert
    store.payment({ signature, wallet: info.wallet, received: info.received, verdict: 'dust', ticket: info.ticket, slot: info.slot });
    state.usedSignatures[signature] = 'dust'; store.save(); return 'dust';
  }
  let verdict = 'ok';
  if (info.received < price) verdict = 'underpaid';
  else if (state.closed) verdict = 'closed';
  else if (minted() >= config.maxSupply) verdict = 'sold-out';
  const excess = verdict === 'ok' ? info.received - price : 0;
  store.payment({ signature, wallet: info.wallet, received: info.received, verdict, excess, ticket: info.ticket, slot: info.slot, price, ...(grant ? { grant: grant.ticket, list: grant.list, unit: grant.unit } : {}) });
  if (verdict !== 'ok') {
    if (grant) allowlist.settle(grant, { verdict, signature });
    const r = { id: state.refunds.length + 1, signature, wallet: info.wallet, lamports: info.received, reason: verdict, status: 'due', at: Date.now() };
    state.refunds.push(r); state.usedSignatures[signature] = 'refund:' + r.id; store.save();
    alert('refund', `refund due: ${(r.lamports / 1e9).toFixed(4)} SOL to ${info.wallet} (${verdict})`);
    return 'refund:' + r.id;
  }
  if (excess > 0) {
    const r = { id: state.refunds.length + 1, signature, wallet: info.wallet, lamports: excess, reason: 'overpaid', status: 'due', at: Date.now() };
    state.refunds.push(r);
    alert('refund', `overpayment: refund ${(excess / 1e9).toFixed(4)} SOL to ${info.wallet}`);
  }
  const p = { n: state.nextIndex++, wallet: info.wallet, signature, slot: info.slot, ticket: info.ticket, received: info.received, paidAt: (info.blockTime || Date.now() / 1000) * 1000, status: 'seeding', attempts: 0 };
  if (grant) { Object.assign(p, { price, grant: grant.ticket, list: grant.list, listName: grant.listName, unit: grant.unit }); allowlist.settle(grant, { verdict: 'ok', signature, n: p.n }); }
  state.usedSignatures[signature] = p.n;
  state.pieces.push(p);
  store.event({ n: p.n, status: 'seeding', signature, wallet: info.wallet });
  store.save();
  log('paid', p.n, shortWallet(p.wallet));
  broadcast({ type: 'queued', piece: publicPiece(p) });
  seedTick();
  return p.n;
}

// treasury watcher: every finalized treasury tx since the saved cursor, oldest first, one poll at a time
let lastPollOk = Date.now(), polling = false;
async function poll() {
  if (polling) return;
  polling = true;
  try {
    if (!state.cursor) {   // first start: begin from now (there are no earlier payments for this collection)
      const [newest] = await sol.connection.getSignaturesForAddress(sol.treasury, { limit: 1 }, 'finalized');
      state.cursor = newest?.signature || 'none'; state.startCursor ||= state.cursor; store.save();
    } else {
      const { newest, ours } = await sol.treasurySignaturesSince(state.cursor === 'none' ? undefined : state.cursor);
      for (const sig of ours) {
        const r = await handlePayment(sig);
        if (r === 'pending') throw new Error('payment ' + sig + ' not readable yet');   // keep the cursor, retry next poll
      }
      if (newest && newest !== state.cursor) { state.cursor = newest; store.save(); }
    }
    lastPollOk = Date.now();
  } catch (e) {
    log('poll error:', e.message);
    if (Date.now() - lastPollOk > 120000) alert('poller', 'payment watcher failing for 2 min: ' + e.message);
  } finally { polling = false; }
}
setInterval(poll, 8000);

// seeds: once the block SEED_DELAY_SLOTS after the payment is final, the seed is fixed and the piece joins the queue
let seeding = false;
async function seedTick() {
  if (seeding) return;
  seeding = true;
  try {
    for (const p of state.pieces.filter(p => p.status === 'seeding')) {
      const s = await sol.deriveSeed(p.signature || p.claimId, p.slot);   // free claims: the server's random claim id
      if (!s) continue;
      setStatus(p, 'queued', { seed: s.seed, seedSlot: s.seedSlot, seedBlockhash: s.seedBlockhash, traits: lab.traits(s.seed) });
    }
  } catch (e) { log('seed error:', e.message); }
  finally { seeding = false; }
  pump();
}
setInterval(seedTick, 5000);

// ---------------------------------------------------------------- the Game Boy

const lane = new HardwareLane({ port: config.serial });
let current = null, lanePaused = !!state.lanePaused, faultsInARow = 0, lastHeartbeat = null;   // pause is saved: a restart must not resume after a mismatch
let lastLaneMsg = '';
lane.on('error', (e) => { if (e.message !== lastLaneMsg) { log('lane:', e.message); lastLaneMsg = e.message; } });
lane.on('ready', () => { broadcast({ type: 'lane', lane: laneInfo() }); pump(); });
lane.on('down', () => { broadcast({ type: 'lane', lane: laneInfo() }); });   // also normal while drawing
setInterval(() => {   // offline only after 2 minutes of silence with nothing being drawn
  if (!current && lane.silentFor > 120000 && !lane.offlineAlerted) { lane.offlineAlerted = true; alert('lane', 'Game Boy silent for 2 minutes (off, crashed or cable out)'); }
  if (lane.silentFor < 1000) lane.offlineAlerted = false;
}, 5000);
lane.on('hello', (v) => log('Game Boy hello', v));
lane.on('fault', ({ reason }) => { log('lane fault:', reason); if (current) abort(reason); });
lane.on('begin', ({ seed, piece }) => { if (current && seed === current.piece.seed && piece === (current.piece.n & 0xffff)) { current.began = true; current.lastEvent = Date.now(); } });
lane.on('phase', ({ seq, phase, tiles, rows }) => {
  if (!current?.began) return;
  current.lastEvent = Date.now();
  const t = Date.now() - current.piece.drawStart;
  current.phases.push({ seq, phase, t, rows, tiles: tiles.toString('base64') });
  current.lastTiles = tiles;
  log(`No. ${current.piece.n}: phase ${phase}, ${rows} rows, ${(t / 1000).toFixed(1)} s`);
  broadcast({ type: 'phase', n: current.piece.n, phase, seq, t, tiles: tiles.toString('base64') });
});
lane.on('done', (d) => finish(d).catch((e) => alert('crash', 'finish failed: ' + e.stack)));
lane.on('heartbeat', (h) => {
  lastHeartbeat = { ppm: h.ppb / 1000, samples: h.n, at: h.at };
  if (current) current.hb.push(h);
  broadcast({ type: 'heartbeat', ...lastHeartbeat, piece: current ? current.piece.n : null });
});

function laneOnline() { return lane.open_ && (!!current || lane.silentFor < 120000); }   // connected and heard from (idle or drawing)
function laneInfo() { return { ...lane.info(), ready: laneOnline(), idle: lane.ready, paused: lanePaused, busy: !!current, current: current ? current.piece.n : null }; }
function pieceHeartbeat(list) {
  const n = list.reduce((a, h) => a + h.n, 0);
  return n ? { ppm: Math.round(list.reduce((a, h) => a + h.ppb * h.n, 0) / n) / 1000, intervals: n, reports: list.length } : null;
}

function pump() {
  if (current || !lane.ready || lanePaused) return;
  const p = state.pieces.find(p => p.status === 'queued');
  if (!p) return;
  p.attempts = (p.attempts || 0) + 1;
  setStatus(p, 'drawing', { drawStart: Date.now() });
  current = { piece: p, phases: [], lastTiles: null, hb: [], began: false, resent: false, sentAt: Date.now(), lastEvent: Date.now() };
  log('drawing', p.n, 'seed', p.seed.toString(16), 'attempt', p.attempts);
  broadcast({ type: 'drawing', piece: publicPiece(p), lane: laneInfo() });
  lane.draw(p.seed, p.n);
}

// stall detection: the seed must be acknowledged, phases must keep coming, and a drawing has a total budget
setInterval(() => {
  if (!current) return;
  const now = Date.now();
  if (!current.began && now - current.sentAt > 6000) {
    if (!current.resent) { current.resent = true; current.sentAt = now; log('no begin, resending seed'); lane.draw(current.piece.seed, current.piece.n); }
    else abort('the Game Boy did not start the drawing');
  } else if (current.began && now - current.lastEvent > 150000) abort('no screen update for 150 s');
  else if (now - current.piece.drawStart > 12 * 60000) abort('drawing took longer than 12 minutes');
}, 1000);

function abort(reason) {
  const p = current.piece;
  current = null;
  lane.want = null; lane.inDraw = null;   // forget the abandoned drawing
  faultsInARow++;
  setStatus(p, 'queued', { lastFault: reason });
  log('aborted', p.n, reason);
  alert('fault', `No. ${p.n}: ${reason} (attempt ${p.attempts}); back in the queue`);
  if (faultsInARow >= 3) { lanePaused = true; state.lanePaused = true; store.save(); alert('lane', 'three faults in a row: drawing paused, check the Game Boy, then POST /admin/resume'); broadcast({ type: 'lane', lane: laneInfo() }); }
  setTimeout(pump, 5000);
}

async function finish({ seed, piece, frames, screenOk }) {
  if (!current) return;
  const c = current, p = c.piece;
  if (seed !== p.seed || piece !== (p.n & 0xffff)) return abort(`finished seed ${seed.toString(16)} piece ${piece}, expected ${p.seed.toString(16)} piece ${p.n}`);
  if (!screenOk || !c.lastTiles) return abort('screen checksum did not match the transferred tiles');
  const ref = lab.draw(p.seed);
  const match = toTiles(ref.px).equals(c.lastTiles);
  fs.writeFileSync(path.join(PIECES, `${p.n}.replay.json`), JSON.stringify({ n: p.n, seed: p.seed, phases: c.phases }));
  current = null;
  if (!match) {
    // a clean transfer that differs from the reference means the Game Boy and the reference disagree: stop and look
    lanePaused = true; state.lanePaused = true; store.save();
    setStatus(p, p.attempts >= 2 ? 'failed' : 'queued', { match: false, lastFault: 'tiles differ from the reference' });
    alert('mismatch', `No. ${p.n}: tiles differ from the reference (attempt ${p.attempts}); drawing paused`);
    broadcast({ type: 'lane', lane: laneInfo() });
    return;
  }
  faultsInARow = 0;
  const px = fromTiles(c.lastTiles);
  fs.writeFileSync(path.join(PIECES, `${p.n}.png`), png(px, ref.colors, 6));
  fs.writeFileSync(path.join(PIECES, `${p.n}.1x.png`), png(px, ref.colors, 1));
  fs.writeFileSync(path.join(PIECES, `${p.n}.hires.png`), png(px, ref.colors, 12));
  setStatus(p, 'drawn', { drawEnd: Date.now(), frames, match: true, heartbeat: pieceHeartbeat(c.hb) });
  fs.writeFileSync(path.join(PIECES, `${p.n}.json`), JSON.stringify(metadata(p), null, 1));
  log('drawn', p.n, frames, 'frames', (frames / FPS).toFixed(0) + ' s');
  broadcast({ type: 'drawn', piece: publicPiece(p) });
  pump();
  storeTick();
}

// ---------------------------------------------------------------- metadata

function metadata(p) {
  const t = p.traits, secs = Math.round(p.frames / FPS), hb = p.heartbeat, u = storage.urls(p);
  const desc = describe(t);
  return {
    name: `Slow Horizons #${p.n}`,
    symbol: 'SLOWHZN',
    description: `${desc} Drawn live by a real Game Boy in ${Math.floor(secs / 60)} min ${secs % 60} s from seed ${p.seed.toString(16).padStart(8, '0')}.`,
    image: u.image,
    external_url: `${config.siteUrl}/#piece-${p.n}`,
    attributes: [
      { trait_type: 'Description', value: desc },
      { trait_type: 'Palette', value: t.palette }, { trait_type: 'Time', value: t.time }, { trait_type: 'Sky', value: t.sky },
      { trait_type: 'Terrain', value: t.terrain }, { trait_type: 'Ground', value: t.ground }, { trait_type: 'Weather', value: t.weather },
      { trait_type: 'Ridges', value: String(t.ridges) }, { trait_type: 'Snowcaps', value: t.snowcaps ? 'Yes' : 'No' },
      ...(t.extras.length ? t.extras.map(e => ({ trait_type: 'Extra', value: e })) : [{ trait_type: 'Extra', value: 'None' }]),
      { trait_type: 'Draw time', value: `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}` },
      { trait_type: 'Heartbeat', value: hb ? `${hb.ppm >= 0 ? '+' : ''}${hb.ppm.toFixed(2)} ppm` : 'not measured' },
    ],
    properties: {
      category: 'image',
      files: [
        { uri: u.image, type: 'image/png' },
        { uri: u.hires, type: 'image/png' },
        { uri: u.x1, type: 'image/png' },
      ],
      seed: p.seed, seed_block: p.seedSlot, seed_blockhash: p.seedBlockhash, payment_signature: p.signature || null,
      ...(p.claimId ? { claim_id: p.claimId, seed_formula: 'first 4 bytes LE of sha256(utf8(claim_id) || utf8(seed_blockhash))' } : {}),
      ...(p.list ? { allowlist: p.listName || p.list } : {}),
      rom_sha256: ROM_SHA256, draw_start: new Date(p.drawStart).toISOString(), draw_end: new Date(p.drawEnd).toISOString(), frames: p.frames,
      heartbeat: hb ? { ...hb, meaning: 'Game Boy link clock offset from nominal 8192 Hz in parts per million, timed by the bridge against its own crystal while this piece was drawn' } : null,
      check: 'final tiles equal the reference build of the same C source',
      replay: u.replay,
    },
  };
}

// ---------------------------------------------------------------- permanent storage (before minting)

let storing = false;
async function storeTick() {
  if (storing) return;
  storing = true;
  try {
    for (const p of state.pieces.filter(p => p.status === 'drawn' && !p.dev && config.storage === 'arweave' && !p.ar?.json)) {
      try { await storage.storePiece(p, PIECES, metadata, () => store.save()); log('stored', p.n, p.ar.json); }
      catch (e) { log('store', p.n, e.message); alert('storage', `No. ${p.n}: Arweave upload failed (${e.message}); minting waits, retrying`); break; }
    }
  } finally { storing = false; }
  mintTick();
}
setInterval(storeTick, 60000);
const stored = (p) => config.storage !== 'arweave' || !!p.ar?.json;

// ---------------------------------------------------------------- minting (idempotent, one at a time)

let minting = false;
async function mintTick() {
  if (minting || !config.mint || !config.tree || !config.collection) return;
  minting = true;
  try {
    for (const p of state.pieces.filter(p => (p.status === 'drawn' || p.status === 'minting') && !p.dev && stored(p))) {
      if (p.mintTx) {   // a mint was signed and maybe sent: find out what happened before doing anything else
        const st = await sol.mintStatus(p.mintTx.signature, p.mintTx.lastValidBlockHeight);
        if (st === 'landed') { setStatus(p, 'minted', { mint: { signature: p.mintTx.signature, assetId: await sol.assetIdOf(p.mintTx.signature) } }); log('minted', p.n); continue; }
        if (st === 'pending') continue;
        log('mint', p.n, st, 'rebuilding'); p.mintTx = null; store.save();   // failed or expired: safe to rebuild
      }
      const prepared = await sol.prepareMint({ owner: p.wallet, name: `Slow Horizons #${p.n}`, uri: storage.urls(p).json });
      p.mintAttempts = (p.mintAttempts || 0) + 1;
      setStatus(p, 'minting', { mintTx: { signature: prepared.signature, lastValidBlockHeight: prepared.lastValidBlockHeight } });
      try { await sol.sendMint(prepared); } catch (e) { log('mint send', p.n, e.message); }
      const st = await sol.mintStatus(prepared.signature, prepared.lastValidBlockHeight);
      if (st === 'landed') { setStatus(p, 'minted', { mint: { signature: prepared.signature, assetId: await sol.assetIdOf(prepared.signature) } }); log('minted', p.n); }
      else if (p.mintAttempts >= 5) alert('mint', `No. ${p.n}: mint not landed after ${p.mintAttempts} attempts (${st})`);
    }
  } catch (e) { log('mint error:', e.message); alert('mint', 'mint worker error: ' + e.message); }
  finally { minting = false; }
}
setInterval(mintTick, 10000);
let hotBalance = null;
async function checkBalance() {
  try { const b = hotBalance = await sol.authorityBalance(); if (b < 0.05e9) alert('balance', `minting wallet ${sol.authority.publicKey.toBase58()} is low: ${(b / 1e9).toFixed(4)} SOL`); }
  catch (e) { log('balance check:', e.message); }
}
setInterval(checkBalance, 10 * 60000); checkBalance();

// ---------------------------------------------------------------- public views

function publicPiece(p) {
  return {
    n: p.n, wallet: p.wallet, short: shortWallet(p.wallet), seed: p.seed ?? null, seedHex: p.seed != null ? p.seed.toString(16).padStart(8, '0') : null,
    status: p.status, dev: !!p.dev, traits: p.traits || null, paidAt: p.paidAt, drawStart: p.drawStart || null, drawEnd: p.drawEnd || null,
    frames: p.frames || null, heartbeat: p.heartbeat || null, match: p.match ?? null, signature: p.signature || null, claim: !!p.claimId,
    mint: p.mint || null, description: p.traits ? describe(p.traits) : null, seedBlock: p.seedSlot || null, seedBlockhash: p.seedBlockhash || null,
    image: p.drawEnd ? `${config.publicUrl}/pieces/${p.n}.png` : null,   // the page loads from here (fast); the NFT points at Arweave
    hires: p.drawEnd ? `${config.publicUrl}/pieces/${p.n}.hires.png` : null,
    arweave: p.ar?.json ? storage.urls(p).json : null,
    stream: p.drawStart && config.streamUrl ? config.streamUrl.replace('{t}', Math.floor(p.drawStart / 1000)) : null,
  };
}
function eta() {
  const done = state.pieces.filter(p => p.frames).slice(-20);
  return Math.round((done.length ? done.reduce((a, p) => a + p.frames, 0) / done.length : 4500) / FPS + 10);
}
function snapshot() {
  const queue = state.pieces.filter(p => ['seeding', 'queued', 'drawing'].includes(p.status));
  const mo = mintOpen();
  return {
    type: 'snapshot', network: config.network, priceLamports: config.priceLamports, treasury: sol.treasury.toBase58(),
    collection: config.collection || null, romSha256: ROM_SHA256, lane: laneInfo(), secondsPerPiece: eta(), dev: config.dev,
    heartbeat: lastHeartbeat, maxSupply: config.maxSupply, sold: minted(), closed: !!state.closed, mintOpen: mo.open, mintClosedReason: mo.reason || null,
    offers: { lists: lists.all().filter(l => listActive(l)).length, eth: ethEnabled },
    queue: queue.map(publicPiece), recent: state.pieces.filter(p => p.drawEnd).slice(-24).reverse().map(publicPiece),
    live: current ? { n: current.piece.n, piece: publicPiece(current.piece), seq: current.phases.length, phases: current.phases.map(p => p.phase), tiles: current.lastTiles?.toString('base64') || null } : null,
  };
}

// ---------------------------------------------------------------- HTTP

const clients = new Set();
function broadcast(msg) {
  const s = JSON.stringify(msg);
  for (const c of clients) if (c.readyState === 1 && c.bufferedAmount < 1 << 20) c.send(s);
}

const buckets = new Map();   // per-IP rate limits: key -> {tokens, at}
function allow(ip, key, perMin) {
  const k = ip + ':' + key, now = Date.now(), b = buckets.get(k) || { tokens: perMin, at: now };
  b.tokens = Math.min(perMin, b.tokens + (now - b.at) * perMin / 60000); b.at = now;
  if (b.tokens < 1) { buckets.set(k, b); return false; }
  b.tokens -= 1; buckets.set(k, b); return true;
}
setInterval(() => { const cut = Date.now() - 10 * 60000; for (const [k, b] of buckets) if (b.at < cut) buckets.delete(k); }, 60000);
const clientIp = (req) => req.headers['cf-connecting-ip'] || req.socket.remoteAddress || '?';

const tickets = new Map();   // ticket -> {wallet, exp}; in memory only (payments are accepted without a known ticket)
function newTicket(wallet) {
  if (tickets.size > 20000) for (const [k, v] of tickets) if (v.exp < Date.now()) tickets.delete(k);
  const t = crypto.randomBytes(8).toString('hex');
  tickets.set(t, { wallet, exp: Date.now() + 10 * 60000 });
  return t;
}

const json = (res, code, obj) => { res.writeHead(code, { 'content-type': 'application/json', 'access-control-allow-origin': config.cors, 'cache-control': 'no-store' }); res.end(JSON.stringify(obj)); };
const body = (req, limit = 16384) => new Promise((resolve, reject) => {
  let d = '', size = 0;
  req.on('data', c => { size += c.length; if (size > limit) { reject(new Error('too large')); req.destroy(); } else d += c; });
  req.on('end', () => { try { resolve(d ? JSON.parse(d) : {}); } catch (e) { reject(e); } });
  req.on('error', reject);
});
const TYPES = { '.png': 'image/png', '.json': 'application/json', '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.wasm': 'application/wasm', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.webp': 'image/webp', '.jpg': 'image/jpeg' };
function serveFile(res, root, rel) {
  let f;
  try { f = fs.realpathSync(path.join(root, path.normalize('/' + rel))); } catch { return false; }
  const r = fs.realpathSync(root);
  if (!(f === r || f.startsWith(r + path.sep)) || !fs.statSync(f).isFile()) return false;
  res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream', 'access-control-allow-origin': config.cors, 'cache-control': 'no-cache', 'x-content-type-options': 'nosniff' });
  fs.createReadStream(f).on('error', () => res.destroy()).pipe(res);
  return true;
}

// operator actions, shared by the localhost token API (/admin/*) and the admin web page (src/admin/admin.mjs)
const ops = {
  open() { const before = !!state.closed; state.closed = false; store.save(); store.event({ admin: 'open' }); broadcast(snapshot()); return { before: { closed: before }, after: { closed: false } }; },
  close() { const before = !!state.closed; state.closed = true; store.save(); store.event({ admin: 'close' }); broadcast(snapshot()); return { before: { closed: before }, after: { closed: true } }; },
  resume() { const before = lanePaused; lanePaused = false; state.lanePaused = false; store.save(); faultsInARow = 0; store.event({ admin: 'resume' }); pump(); broadcast({ type: 'lane', lane: laneInfo() }); return { before: { paused: before }, after: { paused: false } }; },
  requeue(n) { const pc = state.pieces.find(x => x.n === +n); if (!pc || pc.status !== 'failed') throw new Error('no failed piece with that number'); pc.attempts = 0; setStatus(pc, 'queued'); pump(); return { before: { n: pc.n, status: 'failed' }, after: { n: pc.n, status: 'queued' } }; },
  refunded(id, signature) { const r = state.refunds.find(x => x.id === +id); if (!r || !signature) throw new Error('id and refund signature required'); if (r.status === 'refunded') throw new Error('already marked refunded'); const before = r.status; r.status = 'refunded'; r.refundSignature = String(signature); r.refundedAt = Date.now(); store.save(); store.event({ admin: 'refunded', id: r.id, signature }); return { before: { id: r.id, status: before }, after: { id: r.id, status: 'refunded', refundSignature: r.refundSignature } }; },
  refunds: () => state.refunds.slice(-500).reverse(),
  status() {
    const mo = mintOpen(), q = state.pieces.filter(p => ['seeding', 'queued', 'drawing'].includes(p.status));
    const lite = (p) => ({ n: p.n, short: shortWallet(p.wallet), status: p.status, list: p.listName || p.list || null, claim: !!p.claimId, lastFault: p.lastFault || null });
    return {
      network: config.network, treasury: sol.treasury.toBase58(), priceSol: config.priceLamports / 1e9, sold: minted(), maxSupply: config.maxSupply, closed: !!state.closed,
      mintOpen: mo.open, mintClosedReason: mo.reason || null, lane: laneInfo(), heartbeat: lastHeartbeat, faultsInARow, pollAgeSec: Math.round((Date.now() - lastPollOk) / 1000),
      hotWallet: sol.authority.publicKey.toBase58(), hotBalanceSol: hotBalance == null ? null : hotBalance / 1e9, queueLength: q.length, queueHead: q.slice(0, 12).map(lite),
      failed: state.pieces.filter(p => p.status === 'failed').map(lite), refundsDue: state.refunds.filter(r => r.status === 'due').length,
      reservedGrants: allowlist.reservedCount(), alerts: recentAlerts.slice(-30).reverse(), ethEnabled,
    };
  },
  lists, allowlist, ethEnabled, publicPriceLamports: config.priceLamports,
};
const admin = config.adminHost ? createAdmin({
  host: config.adminHost, pathPrefix: config.adminPath, origin: `https://${config.adminHost}`, rpId: config.adminHost,
  access: createAccessVerifier({ team: config.cfAccessTeam, aud: config.cfAccessAud, emails: config.adminEmails, log }),
  dataDir: config.dataDir, uiDir: path.join(SERVER_DIR, 'admin-ui'), fontsDir: path.join(REPO_DIR, 'web', 'fonts'), ops, alert, log,
}) : null;
if (admin && admin.passkeyCount() === 0) {
  const { code, expires } = issueSetupCode(config.dataDir);
  log(`admin page: no passkey yet. One-time setup code ${code} (valid until ${new Date(expires).toISOString()}); open https://${config.adminHost}${config.adminPath}/ and enter it. New code: node scripts/admin-passkey.mjs`);
}

function adminOk(req) {
  if (!config.adminToken) return false;
  const local = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
  if (!local || req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for']) return false;   // never through the tunnel
  const t = Buffer.from(String(req.headers['x-admin-token'] || '')), want = Buffer.from(config.adminToken);
  return t.length === want.length && crypto.timingSafeEqual(t, want);
}

async function route(req, res, url) {
  const ip = clientIp(req), p = url.pathname;
  // the admin page lives only on ADMIN_HOST (behind Cloudflare Access); there everything else is a 404
  if (admin && admin.matches(req)) return admin.handle(req, res, url, ip);
  if (req.method === 'OPTIONS') { res.writeHead(204, { 'access-control-allow-origin': config.cors, 'access-control-allow-headers': 'content-type', 'access-control-allow-methods': 'GET,POST' }); return res.end(); }
  if (!allow(ip, 'all', 600)) return json(res, 429, { error: 'Too many requests. Wait a minute.' });

  if (p === '/api/health') return json(res, 200, { ok: true, lane: laneOnline(), idle: lane.ready, paused: lanePaused, pollAgeSec: Math.round((Date.now() - lastPollOk) / 1000), current: current?.piece.n || null });
  if (p === '/api/state') return json(res, 200, snapshot());
  if (p === '/api/ticket' && req.method === 'POST') {
    if (!allow(ip, 'ticket', 6)) return json(res, 429, { error: 'Too many tries. Wait a minute.' });
    const mo = mintOpen();
    if (!mo.open) return json(res, 503, { error: `Minting is closed right now (${mo.reason}). Nothing was charged.` });
    const { wallet, list, unit } = await body(req);
    if (!isSolAddress(wallet)) return json(res, 400, { error: 'That is not a Solana address.' });
    if (list == null) {
      const ticket = newTicket(wallet);
      const { tx, lastValidBlockHeight } = await sol.buildPayment(wallet, ticket);
      return json(res, 200, { ticket, tx, lastValidBlockHeight, priceLamports: config.priceLamports, treasury: sol.treasury.toBase58(), network: config.network });
    }
    // an allowlist offer: reserve the unit, persist the grant, build the payment at the grant's price
    if (typeof list !== 'string' || !isUnit(unit)) return json(res, 400, { error: 'Unknown offer.' });
    const g = await allowlist.reserve({ wallet, list, unit });
    if (!g.tx) {
      try { const b = await sol.buildPayment(wallet, g.ticket, g.price); g.tx = b.tx; g.lvbh = b.lastValidBlockHeight; store.save(); }
      catch (e) { allowlist.voidGrant(g.ticket, 'payment build failed'); throw e; }
    }
    return json(res, 200, { ticket: g.ticket, tx: g.tx, lastValidBlockHeight: g.lvbh, priceLamports: g.price, treasury: sol.treasury.toBase58(), network: config.network, grant: { list: g.list, name: g.listName, price: g.price, expires: g.exp } });
  }
  if (p === '/api/submit' && req.method === 'POST') {
    if (!allow(ip, 'submit', 6)) return json(res, 429, { error: 'Too many tries. Wait a minute.' });
    const { ticket, tx } = await body(req);
    const grant = state.allowlist.grants[String(ticket)];
    const grantOk = grant && grant.status === 'reserved' && Date.now() < grant.exp;
    if (!tickets.has(String(ticket)) && !grantOk) return json(res, 400, { error: 'Unknown or expired ticket. Start again; nothing was charged.' });
    const raw = Buffer.from(String(tx), 'base64');
    let bad;
    try { bad = sol.checkSignedPayment(raw, String(ticket), grantOk ? grant.price : config.priceLamports); } catch { bad = 'unreadable'; }
    if (bad) return json(res, 400, { error: `That transaction is not the payment we prepared (${bad}). Nothing was sent.` });
    let signature;
    try { signature = await sol.connection.sendRawTransaction(raw, { skipPreflight: false }); }
    catch (e) { return json(res, 400, { error: 'The network rejected the transaction: ' + String(e.message || e).split('\n')[0] }); }
    tickets.delete(String(ticket));
    // the watcher picks it up once final; also try directly for a faster answer
    (async () => { for (let i = 0; i < 12; i++) { await new Promise(r => setTimeout(r, 5000)); try { if (await handlePayment(signature) !== 'pending') return; } catch { /* the watcher covers it */ } } })();
    return json(res, 202, { signature, note: 'Sent. It joins the line once the network finalizes it (about 15 s), even if you close this page.' });
  }
  // ---- allowlists and holder mints
  if (p === '/api/eligibility') {
    if (!allow(ip, 'elig', 20)) return json(res, 429, { error: 'Too many tries. Wait a minute.' });
    const w = url.searchParams.get('wallet');
    if (!isSolAddress(w)) return json(res, 400, { error: 'That is not a Solana address.' });
    const r = await allowlist.offers(w);
    return json(res, 200, { ...r, eth: ethEnabled, ethLinked: allowlist.linkedEths(w).length });
  }
  if (p === '/api/eth/challenge') {
    if (!allow(ip, 'ethc', 10)) return json(res, 429, { error: 'Too many tries. Wait a minute.' });
    const solW = url.searchParams.get('sol'), eth = url.searchParams.get('eth');
    if (!isSolAddress(solW) || !isEthAddress(eth)) return json(res, 400, { error: 'Connect a Solana wallet and an Ethereum wallet first.' });
    return json(res, 200, allowlist.ethChallenge(solW, eth));
  }
  if (p === '/api/eth/link' && req.method === 'POST') {
    if (!allow(ip, 'ethl', 6)) return json(res, 429, { error: 'Too many tries. Wait a minute.' });
    const { sol: solW, eth, signature, nonce } = await body(req);
    if (!isSolAddress(solW) || !isEthAddress(eth) || typeof signature !== 'string' || !/^0x[0-9a-fA-F]{130,4000}$/.test(signature) || typeof nonce !== 'string' || !/^[0-9a-f]{32}$/.test(nonce)) return json(res, 400, { error: 'That request is not valid.' });
    return json(res, 200, await allowlist.ethLink({ sol: solW, eth, signature, nonce }));
  }
  if (p === '/api/claim/challenge') {
    if (!allow(ip, 'claimc', 10)) return json(res, 429, { error: 'Too many tries. Wait a minute.' });
    const w = url.searchParams.get('wallet'), list = url.searchParams.get('list');
    if (!isSolAddress(w) || typeof list !== 'string' || list.length > 32) return json(res, 400, { error: 'That request is not valid.' });
    return json(res, 200, allowlist.claimChallenge(w, list));
  }
  if (p === '/api/claim' && req.method === 'POST') {
    if (!allow(ip, 'claim', 6)) return json(res, 429, { error: 'Too many tries. Wait a minute.' });
    const { wallet, list, unit, nonce, signature } = await body(req);
    if (!isSolAddress(wallet) || typeof list !== 'string' || list.length > 32 || !isUnit(unit) || (nonce != null && (typeof nonce !== 'string' || !/^[0-9a-f]{32}$/.test(nonce))) || (signature != null && (typeof signature !== 'string' || signature.length > 100))) return json(res, 400, { error: 'That request is not valid.' });
    const r = await allowlist.claimFree({ wallet, list, unit, nonce, signature });
    return json(res, 200, { n: r.n, note: 'Claimed. Your piece gets its seed with the next Solana blocks (about 15 s) and joins the line.' });
  }
  if (p === '/api/piece') {   // one piece, for the gallery and #piece-N links
    const pc = state.pieces.find(x => x.n === +url.searchParams.get('n'));
    return pc ? json(res, 200, { piece: publicPiece(pc), romSha256: ROM_SHA256, network: config.network }) : json(res, 404, { error: 'No piece with that number yet.' });
  }
  if (p === '/api/gallery') return json(res, 200, gallery(state.pieces, url.searchParams, publicPiece));
  if (p === '/api/pieces') {
    const owner = url.searchParams.get('owner');
    if (!owner) return json(res, 400, { error: 'owner required' });
    return json(res, 200, { pieces: state.pieces.filter(x => x.wallet === owner).map(publicPiece), refunds: state.refunds.filter(r => r.wallet === owner).map(r => ({ id: r.id, lamports: r.lamports, reason: r.reason, status: r.status })) });
  }
  if (p === '/api/dev/pay' && req.method === 'POST') {
    if (!config.dev || config.network !== 'devnet') return json(res, 404, { error: 'not found' });
    const { wallet } = await body(req);
    const signature = 'dev-' + crypto.randomBytes(16).toString('hex');
    const seed = crypto.createHash('sha256').update(signature).digest().readUInt32LE(0);
    const pc = { n: state.nextIndex++, wallet: String(wallet || 'dev-wallet'), signature, seed, traits: lab.traits(seed), dev: true, paidAt: Date.now(), status: 'queued', attempts: 0 };
    state.pieces.push(pc); state.usedSignatures[signature] = pc.n; store.save();
    broadcast({ type: 'queued', piece: publicPiece(pc) }); pump();
    return json(res, 200, { n: pc.n, seed });
  }
  if (p === '/collection.json') return json(res, 200, { name: 'Slow Horizons', symbol: 'SLOWHZN', description: 'Landscapes drawn live by a real Game Boy, one per payment. Every piece records its seed, the ROM hash and the console\'s heartbeat.', image: `${config.publicUrl}/pieces/1.png`, external_url: config.siteUrl });

  // admin (localhost + token only)
  if (p.startsWith('/admin/')) {
    if (!adminOk(req)) return json(res, 404, { error: 'not found' });
    if (p === '/admin/status') return json(res, 200, { ...snapshot(), refunds: state.refunds, faultsInARow, cursor: state.cursor });
    if (p === '/admin/lists') return json(res, 200, { eth: ethEnabled, file: lists.file, warnings: lists.warnings(), reservedNow: allowlist.reservedCount(), lists: allowlist.usageReport() });
    if (p === '/admin/close' && req.method === 'POST') { ops.close(); return json(res, 200, { closed: true }); }
    if (p === '/admin/open' && req.method === 'POST') { ops.open(); return json(res, 200, { closed: false }); }
    if (p === '/admin/resume' && req.method === 'POST') { ops.resume(); return json(res, 200, { paused: false }); }
    if (p === '/admin/requeue' && req.method === 'POST') { const { n } = await body(req); try { ops.requeue(n); } catch (e) { return json(res, 400, { error: e.message }); } return json(res, 200, { ok: true }); }
    if (p === '/admin/refunded' && req.method === 'POST') { const { id, signature } = await body(req); try { ops.refunded(id, signature); } catch (e) { return json(res, 400, { error: e.message }); } return json(res, 200, state.refunds.find(x => x.id === +id)); }
    if (p === '/admin/refunds.csv') { res.writeHead(200, { 'content-type': 'text/csv' }); return res.end('id,wallet,sol,reason,status,payment,refund\n' + state.refunds.map(r => [r.id, r.wallet, (r.lamports / 1e9).toFixed(9), r.reason, r.status, r.signature, r.refundSignature || ''].join(',')).join('\n') + '\n'); }
    return json(res, 404, { error: 'not found' });
  }

  if (p.startsWith('/pieces/') && serveFile(res, PIECES, p.slice('/pieces/'.length))) return;
  if (config.serveSite) {
    let rel = p === '/' ? 'index.html' : p.slice(1);
    if (rel.endsWith('/')) rel += 'index.html';
    if (serveFile(res, path.join(REPO_DIR, 'web'), rel)) return;
  }
  json(res, 404, { error: 'not found' });
}

const server = http.createServer((req, res) => {
  let url;
  try { url = new URL(req.url, 'http://x'); } catch { return json(res, 400, { error: 'bad request' }); }   // a malformed path must never crash the process (security audit C1)
  route(req, res, url).catch((e) => {
    log('http error', url.pathname, e.message);
    if (e instanceof AllowError) { if (!res.headersSent) json(res, e.status, { error: e.message }); return; }
    if (!res.headersSent) json(res, e.message === 'too large' ? 413 : 500, { error: 'Something went wrong on our side. If you sent a payment, it is picked up automatically.' });
  });
});
server.headersTimeout = 15000; server.requestTimeout = 30000;

const wss = new WebSocketServer({ server, path: '/live', maxPayload: 1024 });
const perIp = new Map();
wss.on('connection', (ws, req) => {
  const ip = clientIp(req);
  if (config.cors !== '*' && req.headers.origin && req.headers.origin !== config.cors) return ws.close(1008, 'origin');
  if ((perIp.get(ip) || 0) >= 6) return ws.close(1013, 'too many connections');
  perIp.set(ip, (perIp.get(ip) || 0) + 1);
  ws.alive = true;
  ws.on('pong', () => { ws.alive = true; });
  ws.on('message', () => {});   // clients only listen
  ws.on('error', () => ws.terminate());   // oversized or malformed frames: without a listener ws throws and the process exits
  clients.add(ws);
  ws.send(JSON.stringify(snapshot()));
  ws.on('close', () => { clients.delete(ws); const n = (perIp.get(ip) || 1) - 1; if (n > 0) perIp.set(ip, n); else perIp.delete(ip); });
});
setInterval(() => { for (const ws of clients) { if (!ws.alive) { ws.terminate(); continue; } ws.alive = false; ws.ping(); } }, 30000);

// ---------------------------------------------------------------- start

for (const p of state.pieces) if (p.status === 'drawing') { p.status = 'queued'; store.event({ n: p.n, status: 'queued', note: 'restart during drawing' }); }
// REWRITE_METADATA=1: rebuild every local metadata file from the stored piece records (after a metadata fix; pieces
// already on Arweave need a new upload and an on-chain uri update, see docs/SERVER-SETUP.md).
if (process.env.REWRITE_METADATA === '1') for (const p of state.pieces) if (p.drawEnd && !p.ar?.json) { fs.writeFileSync(path.join(PIECES, `${p.n}.json`), JSON.stringify(metadata(p), null, 1)); log('metadata rewritten', p.n); }
store.save();
server.listen(config.port, config.host, () => {
  log(`slow horizons server on ${config.host}:${config.port}, ${config.network}, treasury ${sol.treasury.toBase58()}, minting wallet ${sol.authority.publicKey.toBase58()}, ROM ${ROM_SHA256.slice(0, 12)}, sold ${minted()}/${config.maxSupply}${state.closed ? ', CLOSED' : ''}`);
  poll(); seedTick(); storeTick();
});

// One-of-ones end to end: the real server (src/index.mjs) with the SIMULATED Game Boy lane (test/helpers/sim-loader.mjs)
// against the fake Solana RPC, MAX_SUPPLY 12 so the 1/1s actually hit. No network, no keys, no transactions.
// Covers: dev pieces never take one, a restart halfway keeps the assigned ids, the sell-out hands out all ten exactly
// once, the drawn tiles/PNG are the 1/1 scene, metadata (name, Edition, Title, one_of_one proof), the Discord webhook's
// loud message with the image, /api/one-of-ones, and reconcile.mjs re-deriving every decision.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { Keypair } from '@solana/web3.js';
import { startFakeRpc } from './helpers/fake-rpc.mjs';
import { request } from './helpers/http.mjs';
import { verify, TITLES, RULE } from '../src/oneofone.mjs';
import { SCENES } from '../src/describe.mjs';
import { drawPiece, png } from '../src/reference.mjs';

const SERVER_DIR = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 30000, what = 'condition') { const t = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t > ms) throw new Error('timed out waiting for ' + what); await sleep(200); } }

test('one-of-ones on the real server: supply 12, sell-out, restart, metadata, webhook, reconcile', { timeout: 180000 }, async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sh-1of1-'));
  const treasury = Keypair.generate().publicKey.toBase58();
  const rpc = await startFakeRpc({ treasury });
  t.after(() => rpc.close());
  const hooks = [];   // the Discord webhook
  const hook = http.createServer((req, res) => { let d = ''; req.on('data', c => { d += c; }); req.on('end', () => { hooks.push(JSON.parse(d)); res.writeHead(204); res.end(); }); });
  await new Promise(r => hook.listen(0, '127.0.0.1', r));
  t.after(() => hook.close());
  fs.writeFileSync(path.join(dir, 'lists.json'), '{"lists":[]}');
  const port = 20000 + Math.floor(Math.random() * 2000);
  const env = { ...process.env, NETWORK: 'devnet', RPC_URL: rpc.url, DATA_DIR: path.join(dir, 'data'), KEY_FILE: path.join(dir, 'key.json'), PORT: String(port), HOST: '127.0.0.1',
    TREASURY: treasury, PRICE_SOL: '0.05', MAX_SUPPLY: '12', MINT: '0', STORAGE: 'local', SERIAL_PORT: '/dev/null', LISTS_FILE: path.join(dir, 'lists.json'), ADMIN_TOKEN: 't'.repeat(40),
    ALCHEMY_API_KEY: '', ALCHEMY_RPC: '', SEED_DELAY_SLOTS: '8', PUBLIC_URL: `http://localhost:${port}`, SITE_URL: '', CORS_ORIGIN: '*', DEV: '1', SIM_PHASE_MS: '40',
    ALERT_WEBHOOK: `http://127.0.0.1:${hook.address().port}/hook`, ADMIN_HOST: '', ADMIN_PATH: '' };
  let proc, out = '';
  async function start() {
    proc = spawn(process.execPath, ['--import', path.join(SERVER_DIR, 'test/helpers/sim-loader.mjs'), 'src/index.mjs'], { cwd: SERVER_DIR, env, stdio: ['ignore', 'pipe', 'pipe'] });
    proc.stdout.on('data', d => { out += d; }); proc.stderr.on('data', d => { out += d; });
    await until(async () => { try { const r = await request(port, 'GET', '/api/state'); return r.status === 200 && r.json.mintOpen; } catch { return false; } }, 30000, 'server start\n' + out);
  }
  async function stop() { proc.kill('SIGTERM'); await new Promise(r => proc.once('exit', r)); }
  t.after(() => { try { proc.kill('SIGKILL'); } catch { /* gone */ } });
  const api = (method, p, body, headers) => request(port, method, p, { body, headers });
  const state = () => JSON.parse(fs.readFileSync(path.join(dir, 'data', 'state.json'), 'utf8'));
  const pay = (k) => rpc.addPayment({ from: Keypair.generate().publicKey.toBase58(), lamports: 50_000_000, memo: 'slowhorizons:' + k.toString(16).padStart(16, '0') });

  await start();
  // ---- dev pieces (test seeds): never a 1/1, not counted
  for (let i = 0; i < 2; i++) assert.equal((await api('POST', '/api/dev/pay', { wallet: 'dev' })).status, 200);
  // ---- first half, then a restart while pieces are still in the line
  for (let k = 1; k <= 6; k++) pay(k);
  await until(() => state().pieces.filter(p => !p.dev && p.seed != null).length === 6, 30000, 'six seeds');
  const mid = state();
  const midAssigned = { ...mid.oneOfOne.assigned };
  assert.ok(Object.keys(midAssigned).length >= 4, 'with 12 for 10, at least 4 of the first 6 are 1/1s');
  await stop();
  await start();
  assert.deepEqual(state().oneOfOne.assigned, midAssigned, 'restart keeps the assigned ids');
  for (let k = 7; k <= 12; k++) pay(k);
  await until(() => { const s = state(); return s.pieces.filter(p => !p.dev && p.status === 'drawn').length === 12 && s.pieces.filter(p => p.dev && p.drawEnd).length === 2; }, 90000, 'all drawn\n' + out.slice(-2000));
  const st = state(), real = st.pieces.filter(p => !p.dev);
  for (const [id, n] of Object.entries(midAssigned)) assert.equal(st.oneOfOne.assigned[id], n, 'nothing assigned before the restart moved');

  // ---- exactly ten, each once, by the rule
  const ones = real.filter(p => p.special);
  assert.equal(ones.length, 10);
  assert.deepEqual(ones.map(p => p.special).sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.equal(st.pieces.filter(p => p.dev && p.special).length, 0, 'dev pieces never take one');
  assert.deepEqual(verify(st, 12).problems, []);
  assert.ok(real.every(p => p.specialRoll && p.specialRoll.left_mints === 12 - real.filter(x => x.n < p.n).length));
  const snap = (await api('GET', '/api/state')).json;
  assert.equal(snap.mintOpen, false); assert.equal(snap.mintClosedReason, 'sold out');
  assert.deepEqual(snap.oneOfOnes, { total: 10, assigned: 10 });

  // ---- a 1/1: the scene's picture, its metadata and the public view
  const p = ones[0], title = TITLES[p.special - 1];
  const ref = drawPiece(p.seed, p.special);
  assert.ok(fs.readFileSync(path.join(dir, 'data', 'pieces', `${p.n}.1x.png`)).equals(png(ref.px, ref.colors, 1)), 'the PNG is the 1/1 scene');
  const meta = JSON.parse(fs.readFileSync(path.join(dir, 'data', 'pieces', `${p.n}.json`), 'utf8'));
  assert.equal(meta.name, `Slow Horizons #${p.n}: ${title}`);
  assert.deepEqual(meta.attributes.slice(0, 3), [{ trait_type: 'Edition', value: '1/1' }, { trait_type: 'Title', value: title }, { trait_type: 'Description', value: SCENES[p.special] }]);
  assert.ok(meta.description.startsWith(SCENES[p.special] + ' Drawn live by a real Game Boy'));
  assert.deepEqual(meta.properties.one_of_one, { id: p.special, title, roll: p.specialRoll.roll, roll2: p.specialRoll.roll2, left_1of1: p.specialRoll.left_1of1, left_mints: p.specialRoll.left_mints, rule: RULE });
  assert.equal(meta.properties.seed, p.seed);
  const pub = (await api('GET', `/api/piece?n=${p.n}`)).json.piece;
  assert.deepEqual([pub.special, pub.title, pub.description], [p.special, title, SCENES[p.special]]);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'data', 'pieces', `${p.n}.replay.json`), 'utf8')).special, p.special);
  // a normal piece: no new trait, no one_of_one
  const plain = real.find(x => !x.special);
  const pm = JSON.parse(fs.readFileSync(path.join(dir, 'data', 'pieces', `${plain.n}.json`), 'utf8'));
  assert.equal(pm.name, `Slow Horizons #${plain.n}`);
  assert.ok(!pm.attributes.some(a => a.trait_type === 'Edition' || a.trait_type === 'Title'));
  assert.equal(pm.properties.one_of_one, undefined);

  // ---- /api/one-of-ones: enough to re-check it
  const pubOnes = (await api('GET', '/api/one-of-ones')).json;
  assert.equal(pubOnes.rule, RULE); assert.equal(pubOnes.maxSupply, 12);
  assert.deepEqual(pubOnes.remaining, []);
  assert.deepEqual(pubOnes.assigned.map(x => [x.id, x.n]), Object.entries(st.oneOfOne.assigned).map(([id, n]) => [+id, n]).sort((a, b) => a[0] - b[0]));

  // ---- the Discord webhook: one loud message per 1/1, with title, number and image
  await until(() => hooks.filter(h => /1\/1 HIT/.test(h.content)).length === 10, 10000, 'ten webhook messages');
  const msg = hooks.find(h => h.content.includes(`No. ${p.n} is "${title}"`));
  assert.ok(msg, 'message for ' + p.n);
  assert.equal(msg.embeds[0].title, `Slow Horizons #${p.n}: ${title}`);
  assert.equal(msg.embeds[0].image.url, `http://localhost:${port}/pieces/${p.n}.png`);

  // ---- cancel: only pieces not drawn yet
  assert.equal((await api('POST', '/admin/cancel', { n: p.n }, { 'x-admin-token': 't'.repeat(40) })).status, 400, 'a drawn piece cannot be cancelled');
  await stop();

  // ---- reconcile (read-only) re-derives every decision
  const rec = await new Promise((resolve) => { const r = spawn(process.execPath, ['scripts/reconcile.mjs'], { cwd: SERVER_DIR, env }); let o = ''; r.stdout.on('data', d => { o += d; }); r.stderr.on('data', d => { o += d; }); r.on('exit', (code) => resolve({ code, o })); });
  assert.match(rec.o, /one-of-ones: 10\/10 assigned, 12 decisions replayed/);
  assert.equal(rec.code, 0, rec.o);
  // (STUCK pieces: MINT=0 leaves them 'drawn'; only the 1/1 lines matter here)
  // tampering is caught: one 1/1 moved to another piece
  const bad = state(); const [a, b] = bad.pieces.filter(x => !x.dev && x.special); [a.special, b.special] = [b.special, a.special];
  fs.writeFileSync(path.join(dir, 'data', 'state.json'), JSON.stringify(bad));
  const rec2 = await new Promise((resolve) => { const r = spawn(process.execPath, ['scripts/reconcile.mjs'], { cwd: SERVER_DIR, env }); let o = ''; r.stdout.on('data', d => { o += d; }); r.on('exit', (code) => resolve({ code, o })); });
  assert.equal(rec2.code, 3);
  assert.match(rec2.o, /1\/1: No\. \d+: holds #\d+, the rule gives #\d+/);
});

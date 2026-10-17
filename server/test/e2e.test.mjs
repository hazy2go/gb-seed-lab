// End to end: the real server (src/index.mjs) against a fake Solana RPC + DAS, with a fake always-online Game Boy
// lane (test/helpers/loader.mjs swaps the module). No network, no real keys, no transactions anywhere.
// Covers: eligibility, free claim (signMessage) -> exactly one piece with an unpredictable seed, two claims at once,
// a discounted payment through ticket/submit/watcher at the grant price, underpaid vs the grant price, a public
// payment, restart keeping grants and usage, and the admin routes staying unreachable from the public side.
// Review fixes 2026-10-18: a list ticket needs the wallet's signMessage proof (same proof = same reservation within
// 50 s), /api/submit refuses a grant payment from another wallet, a free claim's sha256(claim id) is broadcast before
// its seed block and the claim id only after.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction } from '@solana/web3.js';
import { WebSocket } from 'ws';
import { startFakeRpc } from './helpers/fake-rpc.mjs';
import { request } from './helpers/http.mjs';
import { unitRef } from '../src/allowlist.mjs';

const SERVER_DIR = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const signSol = (kp, message) => crypto.sign(null, Buffer.from(message, 'utf8'), crypto.createPrivateKey({ key: Buffer.concat([Buffer.from('302e020100300506032b657004220420', 'hex'), Buffer.from(kp.secretKey.slice(0, 32))]), format: 'der', type: 'pkcs8' })).toString('base64');
async function until(fn, ms = 20000, what = 'condition') { const t = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t > ms) throw new Error('timed out waiting for ' + what); await sleep(200); } }

test('allowlist end to end on the real server', { timeout: 120000 }, async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sh-e2e-'));
  const treasury = Keypair.generate().publicKey.toBase58();
  const rpc = await startFakeRpc({ treasury });
  t.after(() => rpc.close());
  const A = Keypair.generate(), B = Keypair.generate(), C = Keypair.generate();
  const a = A.publicKey.toBase58(), b = B.publicKey.toBase58(), c = C.publicKey.toBase58();
  const COLL = Keypair.generate().publicKey.toBase58(), asset = Keypair.generate().publicKey.toBase58();
  rpc.assets[b] = [{ id: asset, collection: COLL }];
  fs.writeFileSync(path.join(dir, 'seed-lists.json'), JSON.stringify({ lists: [
    { id: 'og', name: 'OG allowlist', chain: 'solana', type: 'wallets', wallets: [a], priceSol: 0, limit: 1, per: 'wallet' },
    { id: 'disc', name: 'Friends', chain: 'solana', type: 'wallets', wallets: [a, c], priceSol: 0.02, limit: 2, per: 'wallet' },
    { id: 'hold', name: 'Test holders', chain: 'solana', type: 'collection', collection: COLL, priceSol: 0, limit: 1, per: 'nft' },
    { id: 'punks', name: 'ETH test', chain: 'ethereum', type: 'wallets', wallets: ['0x' + '11'.repeat(20)], priceSol: 0, limit: 1, per: 'wallet' },
  ] }));
  const port = 18000 + Math.floor(Math.random() * 2000);
  const env = { ...process.env, NETWORK: 'devnet', RPC_URL: rpc.url, DATA_DIR: path.join(dir, 'data'), KEY_FILE: path.join(dir, 'key.json'), PORT: String(port), HOST: '127.0.0.1',
    TREASURY: treasury, PRICE_SOL: '0.05', MAX_SUPPLY: '2000', MINT: '0', STORAGE: 'local', SERIAL_PORT: '/dev/null', LISTS_FILE: path.join(dir, 'seed-lists.json'), ADMIN_TOKEN: 't'.repeat(40),
    ALCHEMY_API_KEY: '', ALCHEMY_RPC: '', SEED_DELAY_SLOTS: '32', PUBLIC_URL: `http://localhost:${port}`, SITE_URL: '', CORS_ORIGIN: '*', DEV: '0', ALERT_WEBHOOK: '',
    ADMIN_HOST: 'admin.test', ADMIN_PATH: '/k3J9xQ2mP7vR4tW8yZ1a', CF_ACCESS_TEAM: 'gblabs', CF_ACCESS_AUD: 'a'.repeat(64), ADMIN_EMAILS: 'hazy@example.com' };
  let proc, out = '';
  async function start() {
    proc = spawn(process.execPath, ['--import', path.join(SERVER_DIR, 'test/helpers/loader.mjs'), 'src/index.mjs'], { cwd: SERVER_DIR, env, stdio: ['ignore', 'pipe', 'pipe'] });
    proc.stdout.on('data', d => { out += d; }); proc.stderr.on('data', d => { out += d; });
    await until(async () => { try { const r = await request(port, 'GET', '/api/state'); return r.status === 200 && r.json.mintOpen; } catch { return false; } }, 30000, 'server start\n' + out);
  }
  async function stop() { proc.kill('SIGTERM'); await new Promise(r => proc.once('exit', r)); }
  t.after(() => { try { proc.kill('SIGKILL'); } catch { /* gone */ } });
  const api = (method, p, body, headers) => request(port, method, p, { body, headers });
  const proof = async (kp, list) => { const c = (await api('GET', `/api/claim/challenge?wallet=${kp.publicKey.toBase58()}&list=${list}`)).json; return { nonce: c.nonce, signature: signSol(kp, c.message) }; };
  const ticket = async (kp, list, unit) => api('POST', '/api/ticket', { wallet: kp.publicKey.toBase58(), list, unit, ...(await proof(kp, list)) });
  await start();
  const feed = [], ws = new WebSocket(`ws://127.0.0.1:${port}/live`);
  ws.on('message', (d) => feed.push(JSON.parse(d)));
  await new Promise(r => ws.once('open', r));
  t.after(() => ws.terminate());
  assert.match(out, /Ethereum lists disabled: ALCHEMY_API_KEY is not set \(1 Ethereum list/);
  assert.match(out, /admin page: no passkey yet\. One-time setup code [A-Z2-9-]{19}/);

  // ---- eligibility
  let e = (await api('GET', `/api/eligibility?wallet=${a}`)).json;
  assert.deepEqual(e.offers.map(o => [o.list, o.price, o.remaining]).sort(), [['disc', 20000000, 2], ['og', 0, 1]]);
  assert.equal(e.eth, false);
  assert.equal((await api('GET', '/api/eligibility?wallet=nope')).status, 400);
  e = (await api('GET', `/api/eligibility?wallet=${b}`)).json;
  assert.deepEqual(e.offers.map(o => [o.list, o.remaining, o.units[0].unit]), [['hold', 1, unitRef(asset)]]);

  // ---- free claims: two at once for the same unit, one wins
  const ch1 = (await api('GET', `/api/claim/challenge?wallet=${a}&list=og`)).json, ch2 = (await api('GET', `/api/claim/challenge?wallet=${a}&list=og`)).json;
  const [r1, r2] = await Promise.all([
    api('POST', '/api/claim', { wallet: a, list: 'og', unit: unitRef(a), nonce: ch1.nonce, signature: signSol(A, ch1.message) }),
    api('POST', '/api/claim', { wallet: a, list: 'og', unit: unitRef(a), nonce: ch2.nonce, signature: signSol(A, ch2.message) }),
  ]);
  assert.deepEqual([r1.status, r2.status].sort(), [200, 409]);
  const claimN = (r1.status === 200 ? r1 : r2).json.n;
  const ch3 = (await api('GET', `/api/claim/challenge?wallet=${a}&list=og`)).json;
  assert.equal((await api('POST', '/api/claim', { wallet: a, list: 'og', unit: unitRef(a), nonce: ch3.nonce, signature: signSol(A, ch3.message) })).status, 409, 'used up');
  // holder claim (DAS), then the asset moves to C: spent
  const ch4 = (await api('GET', `/api/claim/challenge?wallet=${b}&list=hold`)).json;
  assert.equal((await api('POST', '/api/claim', { wallet: b, list: 'hold', unit: unitRef(asset), nonce: ch4.nonce, signature: signSol(B, ch4.message) })).status, 200);
  rpc.assets[c] = rpc.assets[b]; delete rpc.assets[b];
  const ch5 = (await api('GET', `/api/claim/challenge?wallet=${c}&list=hold`)).json;
  assert.equal((await api('POST', '/api/claim', { wallet: c, list: 'hold', unit: unitRef(asset), nonce: ch5.nonce, signature: signSol(C, ch5.message) })).status, 409);
  // the claim piece gets a seed from its claim id + a later blockhash
  const claimPiece = await until(async () => { const p = (await api('GET', `/api/piece?n=${claimN}`)).json.piece; return p.status === 'queued' && p; }, 20000, 'claim seed');
  assert.equal(claimPiece.signature, null); assert.equal(claimPiece.claim, true);
  // commitment: the queued broadcast (before the seed block) carries sha256(claim id) but not the claim id
  const announced = feed.find(m => m.type === 'queued' && m.piece.n === claimN);
  assert.ok(announced, 'queued broadcast seen');
  assert.equal(announced.piece.claimId, null);
  assert.match(announced.piece.claimCommit, /^[0-9a-f]{64}$/);
  assert.equal(crypto.createHash('sha256').update(claimPiece.claimId, 'utf8').digest('hex'), announced.piece.claimCommit, 'the published claim id matches the earlier commitment');
  assert.ok(claimPiece.seedBlock >= claimPiece.claimSlot + 32);
  const st = JSON.parse(fs.readFileSync(path.join(dir, 'data', 'state.json'), 'utf8'));
  const sp = st.pieces.find(p => p.n === claimN);
  assert.match(sp.claimId, /^claim-[0-9a-f]{32}$/);
  assert.ok(sp.seedSlot >= sp.slot + 32);
  const want = crypto.createHash('sha256').update(sp.claimId, 'utf8').update(rpc.blockhashOf(sp.seedSlot), 'utf8').digest().readUInt32LE(0);
  assert.equal(sp.seed, want);

  // ---- a discounted payment: ticket at the grant price, signed by the buyer, relayed, priced by the watcher
  assert.equal((await api('POST', '/api/ticket', { wallet: a, list: 'disc', unit: unitRef(a) })).status, 401, 'no wallet proof: no reservation');
  const pfA = await proof(A, 'disc');
  const tk = await api('POST', '/api/ticket', { wallet: a, list: 'disc', unit: unitRef(a), ...pfA });
  assert.equal(tk.status, 200, tk.body);
  assert.equal((await api('POST', '/api/ticket', { wallet: a, list: 'disc', unit: unitRef(a), ...pfA })).json.ticket, tk.json.ticket, 'retry with the same signature: same reservation');
  assert.equal(tk.json.priceLamports, 20_000_000);
  assert.deepEqual([tk.json.grant.list, tk.json.grant.price], ['disc', 20_000_000]);
  const tx = Transaction.from(Buffer.from(tk.json.tx, 'base64'));
  assert.equal(Number(tx.instructions[0].data.readBigUInt64LE(4)), 20_000_000);
  // the same grant paid from another wallet: not relayed
  const foreign = new Transaction({ feePayer: B.publicKey, blockhash: tx.recentBlockhash, lastValidBlockHeight: tk.json.lastValidBlockHeight });
  foreign.add(SystemProgram.transfer({ fromPubkey: B.publicKey, toPubkey: new PublicKey(treasury), lamports: 20_000_000 }));
  foreign.add(new TransactionInstruction({ programId: new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr'), keys: [], data: Buffer.from('slowhorizons:' + tk.json.ticket, 'utf8') }));
  foreign.sign(B);
  const fsub = await api('POST', '/api/submit', { ticket: tk.json.ticket, tx: foreign.serialize().toString('base64') });
  assert.equal(fsub.status, 400); assert.match(fsub.json.error, /not from the wallet that reserved/);
  tx.partialSign(A);
  const sub = await api('POST', '/api/submit', { ticket: tk.json.ticket, tx: tx.serialize().toString('base64') });
  assert.equal(sub.status, 202, sub.body);
  const paid = await until(async () => (await api('GET', `/api/pieces?owner=${a}`)).json.pieces.find(p => p.signature === sub.json.signature), 30000, 'grant payment');
  assert.ok(paid.n > claimN);
  // ---- underpaid against the grant price: refund, grant void, unit free again
  const tk2 = (await ticket(C, 'disc', unitRef(c))).json;
  rpc.addPayment({ from: c, lamports: 10_000_000, memo: 'slowhorizons:' + tk2.ticket });
  const ref = await until(async () => (await api('GET', `/api/pieces?owner=${c}`)).json.refunds.find(r => r.reason === 'underpaid'), 30000, 'underpaid refund');
  assert.equal(ref.lamports, 10_000_000);
  // ---- the public price for a payment without a grant (another wallet reusing a grant memo pays full price)
  const tk3 = (await ticket(C, 'disc', unitRef(c))).json;
  rpc.addPayment({ from: b, lamports: 20_000_000, memo: 'slowhorizons:' + tk3.ticket });
  await until(async () => (await api('GET', `/api/pieces?owner=${b}`)).json.refunds.find(r => r.reason === 'underpaid'), 30000, 'foreign payer refund');
  rpc.addPayment({ from: b, lamports: 50_000_000, memo: 'slowhorizons:' + 'ab'.repeat(8) });
  await until(async () => (await api('GET', `/api/pieces?owner=${b}`)).json.pieces.some(p => p.signature), 30000, 'public payment');
  const payments = fs.readFileSync(path.join(dir, 'data', 'payments.jsonl'), 'utf8').trim().split('\n').map(l => JSON.parse(l));
  assert.equal(payments.filter(p => p.verdict === 'claim').length, 2);
  assert.ok(payments.some(p => p.verdict === 'ok' && p.grant === tk.json.ticket && p.price === 20_000_000));
  assert.ok(payments.some(p => p.verdict === 'underpaid' && p.grant === tk2.ticket && p.price === 20_000_000));
  assert.ok(payments.some(p => p.verdict === 'underpaid' && !p.grant && p.price === 50_000_000 && p.received === 20_000_000));

  // ---- restart: the open reservation (tk3, C) and usage survive
  await stop();
  await start();
  e = (await api('GET', `/api/eligibility?wallet=${a}`)).json;
  assert.equal(e.offers.find(o => o.list === 'disc').remaining, 1, 'A used 1 of 2');
  assert.equal(e.offers.find(o => o.list === 'og').remaining, 0);
  e = (await api('GET', `/api/eligibility?wallet=${c}`)).json;
  assert.equal(e.offers.find(o => o.list === 'disc').remaining, 1, 'C: 2 minus the open reservation');
  rpc.addPayment({ from: c, lamports: 20_000_000, memo: 'slowhorizons:' + tk3.ticket });
  await until(async () => (await api('GET', `/api/pieces?owner=${c}`)).json.pieces.length === 1, 30000, 'grant payment after restart');
  const lists = (await api('GET', '/admin/lists', undefined, { 'x-admin-token': 't'.repeat(40) })).json;
  const disc = lists.lists.find(l => l.id === 'disc');
  assert.deepEqual([disc.piecesUsed, disc.paid, disc.reservedNow], [2, 2, 0]);
  assert.equal(lists.lists.find(l => l.id === 'og').freeClaims, 1);
  assert.equal(lists.lists.find(l => l.id === 'punks').unavailable, true);

  // ---- admin stays unreachable from the public side
  assert.equal((await api('GET', '/admin/lists', undefined, { 'x-admin-token': 't'.repeat(40), 'cf-connecting-ip': '1.2.3.4' })).status, 404, 'token API through the tunnel');
  assert.equal((await api('GET', '/k3J9xQ2mP7vR4tW8yZ1a/api/me')).status, 404, 'admin path on the public host');
  assert.equal((await api('GET', '/k3J9xQ2mP7vR4tW8yZ1a/', undefined, { host: 'admin.test' })).status, 404, 'admin host without an Access JWT');
  assert.equal((await api('GET', '/api/state', undefined, { host: 'admin.test' })).status, 404, 'public API is not on the admin host');
  assert.equal((await api('GET', '/k3J9xQ2mP7vR4tW8yZ1a/api/me', undefined, { host: 'admin.test', 'cf-access-jwt-assertion': 'x.y.z' })).status, 404, 'garbage JWT');
  await stop();
  // reconcile (read-only) agrees: every payment is a piece or a refund, claims and grants add up
  const rec = await new Promise((resolve) => { const r = spawn(process.execPath, ['scripts/reconcile.mjs'], { cwd: SERVER_DIR, env }); let o = ''; r.stdout.on('data', d => { o += d; }); r.stderr.on('data', d => { o += d; }); r.on('exit', (code) => resolve({ code, o })); });
  assert.equal(rec.code, 0, rec.o);
  assert.match(rec.o, /allowlists: 2 free claims, 2 discounted pieces, 0 reservations open/);
});

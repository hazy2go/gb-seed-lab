// Devnet end-to-end queue test (Hazy 2026-10-18: "when someone queues up, will he receive the NFT when it is his turn").
// Starts a separate devnet server (port 8796, its own data dir, SIMULATED Game Boy lane, fresh tree + collection with a
// cold authority and the hot key as UpdateDelegate, royalty plugin), then N throwaway buyers pay at nearly the same
// time through the website's path (/api/ticket -> sign -> /api/submit). Checks: every payment becomes exactly one
// piece, numbers follow payment order, pieces are drawn one at a time in number order, each is minted to the wallet
// that paid it (DAS owner), metadata + royalty correct. Never touches mainnet or the production server.
//   KEY_FILE=/tmp/sh-devkey.json node scripts/devnet-queue-test.mjs [buyers=4]
// One-of-ones (docs/ONE-OF-ONES.md test 4): ONE_OF_ONES=1 sets MAX_SUPPLY = buyers, so with 12 buyers all ten 1/1s hit;
// also checks their metadata (name with the title, Edition 1/1, one_of_one proof) and the Discord webhook messages
// (a local catcher, nothing leaves the Mac).
//   ONE_OF_ONES=1 KEY_FILE=/tmp/sh-devkey.json node scripts/devnet-queue-test.mjs 12
// Several pieces in one payment (Hazy 2026-10-18): MULTI=5 makes the first buyer pay for 5 in one transaction; checks
// they show up in the line together, in a row, each with its own seed, and all 5 are minted to that wallet.
//   MULTI=5 KEY_FILE=/tmp/sh-devkey.json node scripts/devnet-queue-test.mjs 2
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Keypair, Transaction, SystemProgram, sendAndConfirmTransaction, PublicKey } from '@solana/web3.js';

const N = +(process.argv[2] || 4), PORT = 8796, API = `http://127.0.0.1:${PORT}`, ONES = process.env.ONE_OF_ONES === '1';
const hooks = [], hook = http.createServer((req, res) => { let d = ''; req.on('data', c => { d += c; }); req.on('end', () => { try { hooks.push(JSON.parse(d)); } catch { /* not json */ } res.writeHead(204); res.end(); }); });
await new Promise(r => hook.listen(0, '127.0.0.1', r)); hook.unref();
const RPC = process.env.DEVNET_RPC || (fs.readFileSync(new URL('../.env', import.meta.url), 'utf8').match(/^RPC_URL=(.*)$/m)?.[1] || '').replace('mainnet.helius-rpc.com', 'devnet.helius-rpc.com');
if (!/devnet/.test(RPC)) throw new Error('need a devnet RPC (DEVNET_RPC)');
const KEY = process.env.KEY_FILE || '/tmp/sh-devkey.json';
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'sh-queue-'));
const treasury = Keypair.generate().publicKey.toBase58();
const base = { ...process.env, NETWORK: 'devnet', RPC_URL: RPC, KEY_FILE: KEY, TREASURY: treasury, STORAGE: process.env.QUEUE_STORAGE || 'local', SERVE_SITE: '0', CORS_ORIGIN: '*', DATA_DIR: DATA,
  PORT: String(PORT), PUBLIC_URL: API, SITE_URL: API, ALERT_WEBHOOK: `http://127.0.0.1:${hook.address().port}/hook`, MAX_SUPPLY: ONES ? String(N) : '2000', SIM_PHASE_MS: ONES ? '1500' : '2500', ADMIN_HOST: '', ADMIN_PATH: '', ADMIN_TOKEN: 'devnet-queue-test', MINT: '1', SEED_DELAY_SLOTS: '32', MERKLE_TREE: '', COLLECTION: '' };
const run = (args, env) => new Promise((res, rej) => { const p = spawn(process.execPath, args, { env, cwd: new URL('..', import.meta.url).pathname }); let out = ''; p.stdout.on('data', d => out += d); p.stderr.on('data', d => out += d); p.on('exit', c => c ? rej(new Error(out)) : res(out)); });
const sleep = ms => new Promise(r => setTimeout(r, ms));

// 1. fresh devnet tree + collection (cold authority + hot delegate) + royalties, like mainnet
const setup = await run(['--input-type=module', '-e', `
  import { Keypair } from '@solana/web3.js'; import { publicKey } from '@metaplex-foundation/umi';
  import { addCollectionPlugin } from '@metaplex-foundation/mpl-core';
  import { config } from './src/config.mjs'; import { getUmi, setupCollection, royaltyReceiver } from './src/solana.mjs';
  const { tree, collection } = await setupCollection({ uri: 'https://example.com/c.json', coldAuthority: Keypair.generate().publicKey.toBase58() });
  const u = getUmi();
  await addCollectionPlugin(u, { collection: publicKey(collection), plugin: { type: 'Royalties', basisPoints: config.royaltyBps, creators: [{ address: publicKey(royaltyReceiver().toBase58()), percentage: 100 }], ruleSet: { type: 'None' } } }).sendAndConfirm(u);
  console.log(JSON.stringify({ tree, collection })); process.exit(0);`], base);
const { tree, collection } = JSON.parse(setup.trim().split('\n').pop());
console.log('devnet tree', tree, 'collection', collection);

// 2. the real server with the simulated lane
const env = { ...base, MERKLE_TREE: tree, COLLECTION: collection };
const log = [];
let srv;
async function startServer() {
  srv = spawn(process.execPath, ['--import', './test/helpers/sim-loader.mjs', 'src/index.mjs'], { env, cwd: new URL('..', import.meta.url).pathname });
  srv.stdout.on('data', d => log.push(String(d))); srv.stderr.on('data', d => log.push(String(d)));
  for (let i = 0; i < 60; i++) { try { const h = await (await fetch(API + '/api/health')).json(); if (h.lane) break; } catch { /* starting */ } await sleep(1000); }
}
process.on('exit', () => srv?.kill());
await startServer();
console.log('server up:', JSON.stringify(await (await fetch(API + '/api/health')).json()));

// 3. N buyers, funded from the devnet hot key, pay at nearly the same time
const { Connection } = await import('@solana/web3.js');
const conn = new Connection(RPC, 'confirmed');
const hot = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(KEY, 'utf8'))));
const MULTI = +(process.env.MULTI || 0), qtyOf = (i) => (i === 0 && MULTI > 1 ? MULTI : 1);
const buyers = Array.from({ length: N }, () => Keypair.generate());
const PRICE = 0.05e9, TOTAL = buyers.reduce((a, _, i) => a + qtyOf(i), 0);
const fund = new Transaction(); buyers.forEach((b, i) => fund.add(SystemProgram.transfer({ fromPubkey: hot.publicKey, toPubkey: b.publicKey, lamports: qtyOf(i) * PRICE + 0.01e9 })));
await sendAndConfirmTransaction(conn, fund, [hot]);
console.log('funded', N, 'buyers' + (MULTI > 1 ? ` (the first buys ${MULTI} in one payment)` : ''));
const paid = await Promise.all(buyers.map(async (b, i) => {
  await sleep(i * 400);
  const t = await (await fetch(API + '/api/ticket', { method: 'POST', body: JSON.stringify({ wallet: b.publicKey.toBase58(), qty: qtyOf(i) }) })).json();
  if (!t.tx) throw new Error('ticket: ' + JSON.stringify(t));
  if (t.qty !== qtyOf(i) || t.totalLamports !== qtyOf(i) * PRICE) throw new Error('ticket amount: ' + JSON.stringify(t));
  const tx = Transaction.from(Buffer.from(t.tx, 'base64')); tx.sign(b);
  const r = await (await fetch(API + '/api/submit', { method: 'POST', body: JSON.stringify({ ticket: t.ticket, tx: tx.serialize().toString('base64') }) })).json();
  if (!r.signature) throw new Error('submit: ' + JSON.stringify(r));
  return { wallet: b.publicKey.toBase58(), signature: r.signature, qty: qtyOf(i), at: Date.now() };
}));
console.log('all paid:', paid.map(p => p.wallet.slice(0, 4) + (p.qty > 1 ? ` x${p.qty}` : '')).join(' '));

// 4. wait until every piece is minted; on the way, what the public line (/api/state queue) shows for the multi buyer
let state, lineSeen = null, restartedMidWait = null;
for (let i = 0; i < 900; i++) {
  state = JSON.parse(fs.readFileSync(path.join(DATA, 'state.json'), 'utf8'));
  if (MULTI > 1 && !lineSeen) { const q = (await (await fetch(API + '/api/state')).json()).queue.filter(p => p.wallet === paid[0].wallet); if (q.length === MULTI) lineSeen = q; }
  // RESTART_MID_WAIT=1: restart the server while a piece is uploaded but not yet confirmed live on arweave.net
  if (process.env.RESTART_MID_WAIT === '1' && !restartedMidWait && state.pieces.some(p => p.ar?.json && !p.arLive && !p.mintTx)) {
    const waitingN = state.pieces.filter(p => p.ar?.json && !p.arLive && !p.mintTx).map(p => p.n);
    console.log(`\nrestarting the server while No. ${waitingN.join(', ')} wait for arweave.net`);
    srv.kill('SIGTERM'); await new Promise(r => srv.once('exit', r)); await startServer();
    restartedMidWait = waitingN;
  }
  const st = state.pieces.map(p => p.status);
  process.stdout.write(`\r${new Date().toISOString().slice(11, 19)} ${st.join(' ')}   `);
  if (st.length === TOTAL && st.every(s => s === 'minted' || s === 'failed')) break;
  await sleep(3000);
}
console.log();
const fails = [];
const ok = (c, m) => { console.log((c ? 'OK   ' : 'FAIL ') + m); if (!c) fails.push(m); };
const pieces = state.pieces.slice().sort((a, b) => a.n - b.n);
ok(pieces.length === TOTAL, `${N} payments -> ${pieces.length} pieces (want ${TOTAL})`);
ok(paid.every(b => pieces.filter(p => p.signature === b.signature).length === b.qty), 'each payment became exactly the pieces it paid for');
if (MULTI > 1) {
  const mine = pieces.filter(p => p.signature === paid[0].signature);
  ok(mine.every((p, k) => k === 0 || p.n === mine[k - 1].n + 1) && mine.every((p, k) => (p.batch?.i ?? -1) === k && p.batch?.of === MULTI), `the ${MULTI} are numbered in a row: ` + mine.map(p => '#' + p.n).join(' '));
  ok(new Set(mine.map(p => p.seed)).size === MULTI, `${MULTI} different seeds: ` + mine.map(p => p.seed.toString(16)).join(' '));
  ok(!!lineSeen && lineSeen.map(p => p.n).join() === mine.map(p => p.n).join(), `all ${MULTI} showed up in the public line together: ` + (lineSeen ? lineSeen.map(p => `#${p.n} ${p.status}`).join(', ') : 'never seen'));
  for (const p of mine) {
    const m = await (await fetch(`${API}/pieces/${p.n}.json`)).json();
    const input = p.batch.i ? `${p.signature}:${p.batch.i}` : p.signature;
    ok(m.properties.seed_input === input && m.properties.payment_piece?.index === p.batch.i && m.properties.payment_signature === p.signature, `#${p.n}: metadata seed_input ${p.batch.i ? '…:' + p.batch.i : 'signature'}, piece ${p.batch.i + 1} of ${MULTI}`);
  }
  ok(!(state.refunds || []).length, 'no refunds (paid exactly)');
}
ok(pieces.every(p => p.status === 'minted'), 'every piece minted: ' + pieces.map(p => `#${p.n} ${p.status}`).join(', '));
ok(pieces.every((p, i) => i === 0 || p.slot >= pieces[i - 1].slot), 'numbers follow payment order (finalized slot)');
ok(pieces.every((p, i) => i === 0 || p.drawStart >= pieces[i - 1].drawEnd), 'drawn one at a time, in number order: ' + pieces.map(p => `#${p.n} ${new Date(p.drawStart).toISOString().slice(14, 19)}-${new Date(p.drawEnd).toISOString().slice(14, 19)}`).join(', '));
for (const p of pieces) {
  const buyer = paid.find(x => x.signature === p.signature);
  ok(!!buyer && buyer.wallet === p.wallet, `#${p.n}: recorded owner = the wallet that paid (${p.wallet.slice(0, 6)})`);
  let a = null;
  for (let i = 0; i < 20 && !a; i++) { const r = await (await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getAsset', params: { id: p.mint.assetId } }) })).json(); a = r.result; if (!a) await sleep(3000); }
  ok(!!a && a.ownership.owner === p.wallet, `#${p.n}: on-chain owner (DAS) = buyer, asset ${p.mint.assetId}`);
  ok(!!a && a.content?.metadata?.name === `Slow Horizons #${p.n}` && a.royalty?.basis_points === 500 && a.grouping?.[0]?.group_value === collection, `#${p.n}: name, 5% royalty, in the collection`);
}
if (process.env.RESTART_MID_WAIT === '1') {
  ok(!!restartedMidWait, 'the server was restarted while a piece waited for arweave.net' + (restartedMidWait ? ` (No. ${restartedMidWait.join(', ')})` : ''));
  ok(new Set(pieces.map(p => p.mint?.assetId)).size === pieces.length && pieces.every(p => p.mint?.assetId), 'every piece minted exactly once (distinct asset ids) across the restart');
}
if (process.env.QUEUE_STORAGE === 'arweave') {   // minting waited for arweave.net (Hazy 2026-10-20)
  ok(pieces.every(p => p.ar?.json && p.arLive && !p.arLiveTimedOut), 'every piece was confirmed live on arweave.net before minting (no 30-min fallback): ' + pieces.map(p => `#${p.n} ${p.arLiveAt && p.storedAt ? Math.round((p.arLiveAt - p.storedAt) / 1000) + 's' : '?'}`).join(', '));
  for (const p of pieces) {
    const r = await fetch(`https://arweave.net/${p.ar.json}`); const j = r.ok ? await r.json() : null;
    ok(!!j && j.name.startsWith(`Slow Horizons #${p.n}`) && j.attributes?.length > 5, `#${p.n}: arweave.net serves its metadata (${r.status}, ${j?.attributes?.length ?? 0} attributes)`);
  }
}
if (ONES) {
  const { verify, title } = await import('../src/oneofone.mjs');
  const ones = pieces.filter(p => p.special), want = Math.min(10, N);
  ok(ones.length === want && new Set(ones.map(p => p.special)).size === want, `${want} 1/1s, all different: ` + ones.map(p => `#${p.n}=${p.special}`).join(' '));
  ok(verify(state, N).problems.length === 0, '1/1 replay: ' + (verify(state, N).problems.join('; ') || 'every decision re-derives from its seed'));
  for (const p of ones) {
    const m = await (await fetch(`${API}/pieces/${p.n}.json`)).json();
    ok(m.name === `Slow Horizons #${p.n}: ${title(p.special)}` && m.attributes[0].value === '1/1' && m.attributes[1].value === title(p.special) && m.properties.one_of_one?.id === p.special, `#${p.n}: 1/1 metadata (${m.name})`);
  }
  ok(hooks.filter(h => /1\/1 HIT/.test(h.content || '') && h.embeds?.[0]?.image?.url).length === ones.length, `webhook: ${hooks.filter(h => /1\/1 HIT/.test(h.content || '')).length} loud 1/1 messages with the image`);
}
console.log(fails.length ? `\n${fails.length} FAILED` : '\nALL PASSED');
if (fails.length) console.log(log.join('').slice(-3000));
srv.kill(); process.exit(fails.length ? 1 : 0);

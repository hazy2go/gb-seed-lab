// Allowlist engine with mocks: lists validation, signatures (EOA + mocked ERC-1271), nonces, limits per wallet and
// per NFT, grants and their price, free claims, restart, concurrency, fail-closed holdings; review fixes 2026-10-18
// (farmable setups refused, wallet proof for reservations and every claim, relayed/retired/late grants, DoS bounds,
// list changes void reservations).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { custom } from 'viem';
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';
import { Keypair } from '@solana/web3.js';
import { openLists, validateLists } from '../src/lists.mjs';
import { createAllowlist, unitRef, GRANT_TTL, GRANT_GRACE, NONCE_TTL, MAX_LINKS_PER_SOL, MAX_NONCES_PER_IP, MAX_LOOKUPS, CACHE_MAX } from '../src/allowlist.mjs';
import { createEthVerifier, verifySol } from '../src/sigs.mjs';
import { createHoldings } from '../src/holdings.mjs';

const PRICE = 50_000_000;
const solKey = () => Keypair.generate();
const signSol = (kp, message) => {
  const pk = crypto.createPrivateKey({ key: Buffer.concat([Buffer.from('302e020100300506032b657004220420', 'hex'), Buffer.from(kp.secretKey.slice(0, 32))]), format: 'der', type: 'pkcs8' });
  return crypto.sign(null, Buffer.from(message, 'utf8'), pk).toString('base64');
};
const COLL = Keypair.generate().publicKey.toBase58();
const CONTRACT = '0x' + 'ab'.repeat(20), C1155 = '0x' + 'cd'.repeat(20);

function harness({ lists: docLists, solHold = {}, ethHold = {}, verifyEth, state = {}, ethEnabled = true, failSol = false, failEth = false, failEthContract = null, open = true, delay = 5 } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sh-allow-'));
  fs.writeFileSync(path.join(dir, 'seed.json'), JSON.stringify({ lists: docLists }));
  const lists = openLists({ dataDir: dir, seedFile: path.join(dir, 'seed.json'), maxPriceLamports: PRICE });
  let clock = 1_800_000_000_000;
  const pieces = [], payments = [], events = [];
  let saves = 0, slotDelay = 0;
  const calls = { solana: 0, ethereum: 0 };
  const holdings = {
    solana: async (owner) => { calls.solana++; if (failSol) throw new Error('DAS down'); if (delay) await new Promise(r => setTimeout(r, delay)); return solHold[owner] || []; },
    ethereum: async (owner, list) => { calls.ethereum++; if (failEth || failEthContract === list.contract) throw new Error('Alchemy down'); if (delay) await new Promise(r => setTimeout(r, delay)); return (ethHold[owner] || {})[list.contract] || []; },
  };
  const al = createAllowlist({
    state, save: () => { saves++; }, event: (e) => events.push(e), payment: (p) => payments.push(p), lists, holdings, ethEnabled, domain: 'www.gameboylabs.xyz',
    verifyEth: verifyEth || (async () => true), maxSupply: 2000, minted: () => pieces.length, mintOpen: () => open ? { open: true } : { open: false, reason: 'closed' },
    getSlot: async () => { await new Promise(r => setTimeout(r, slotDelay)); return 1000; }, now: () => clock,
    createClaimPiece: (c) => { pieces.push(c); return pieces.length; },
  });
  return { al, state, pieces, payments, events, lists, calls, advance: (ms) => { clock += ms; }, get saves() { return saves; }, setSlotDelay: (d) => { slotDelay = d; }, get now() { return clock; } };
}
const offerOf = (r, id) => r.offers.find(o => o.list === id);
// a signMessage proof from the wallet for one list (free claim or reservation)
const prove = (h, kp, list, ip) => { const c = h.al.challenge(kp.publicKey.toBase58(), list, ip); return { nonce: c.nonce, signature: signSol(kp, c.message) }; };
const reserveAs = (h, kp, list, unit) => h.al.reserve({ wallet: kp.publicKey.toBase58(), list, unit, ...prove(h, kp, list) });
const claimAs = (h, kp, list, unit) => h.al.claimFree({ wallet: kp.publicKey.toBase58(), list, unit, ...prove(h, kp, list) });

test('lists.json validation refuses bad files and normalises good ones', () => {
  const w = solKey().publicKey.toBase58();
  assert.throws(() => validateLists({ lists: [{ id: 'x', name: 'X', chain: 'solana', type: 'wallets', wallets: ['notanaddress'], priceSol: 0, limit: 1, per: 'wallet' }] }), /not Solana addresses/);
  assert.throws(() => validateLists({ lists: [{ id: 'x', name: 'X', chain: 'solana', type: 'wallets', wallets: [w], priceSol: 0.06, limit: 1, per: 'wallet' }] }, { maxPriceLamports: PRICE }), /above the public price/);
  assert.throws(() => validateLists({ lists: [{ id: 'x', name: 'X', chain: 'solana', type: 'wallets', wallets: [w], priceSol: 0, limit: 1, per: 'nft' }] }), /counts per wallet/);
  assert.throws(() => validateLists({ lists: [{ id: 'x', name: 'X', chain: 'ethereum', type: 'collection', contract: CONTRACT, priceSol: 0, limit: 1, per: 'nft' }] }), /standard/);
  // farmable setups are refused, not just warned about (review 2026-10-18)
  assert.throws(() => validateLists({ lists: [{ id: 'x', name: 'X', chain: 'solana', type: 'collection', collection: COLL, priceSol: 0, limit: 1, per: 'wallet' }] }), /free \+ per wallet/);
  assert.throws(() => validateLists({ lists: [{ id: 'x', name: 'X', chain: 'ethereum', type: 'collection', contract: CONTRACT, standard: 'erc721', priceSol: 0, limit: 1, per: 'wallet' }] }), /free \+ per wallet/);
  assert.throws(() => validateLists({ lists: [{ id: 'x', name: 'X', chain: 'ethereum', type: 'collection', contract: C1155, standard: 'erc1155', priceSol: 0.02, limit: 1, per: 'nft' }] }), /ERC-1155/);
  assert.equal(validateLists({ lists: [{ id: 'x', name: 'X', chain: 'solana', type: 'collection', collection: COLL, priceSol: 0.02, limit: 1, per: 'wallet' }] }).lists.length, 1, 'paid per wallet is fine');
  assert.equal(validateLists({ lists: [{ id: 'x', name: 'X', chain: 'solana', type: 'wallets', wallets: [w], priceSol: 0, limit: 1, per: 'wallet' }] }).lists.length, 1, 'free wallet lists are fine');
  assert.throws(() => validateLists({ lists: [{ id: 'x', name: '<b>', chain: 'solana', type: 'wallets', wallets: [w], priceSol: 0, limit: 1, per: 'wallet', extra: 1 }] }), /unknown field "extra"[\s\S]*name/);
  assert.throws(() => validateLists({ lists: [{ id: 'a', name: 'A', chain: 'solana', type: 'collection', collection: COLL, priceSol: 0, limit: 1, per: 'nft' }, { id: 'a', name: 'B', chain: 'solana', type: 'collection', collection: 'creator:' + COLL, priceSol: 0, limit: 1, per: 'nft' }] }), /duplicate id/);
  const ok = validateLists({ lists: [{ id: 'eth', name: 'E', chain: 'ethereum', type: 'wallets', wallets: ['0x' + 'AB'.repeat(20), '0x' + 'ab'.repeat(20)], priceSol: 0.02, limit: 1, per: 'wallet' }] });
  assert.deepEqual(ok.lists[0].wallets, ['0x' + 'ab'.repeat(20)]);
  assert.equal(ok.lists[0].priceLamports, 20_000_000);
  assert.ok(ok.warnings.some(x => /duplicate/.test(x)));
  // the committed seed file is valid and empty
  const seed = JSON.parse(fs.readFileSync(new URL('../lists.json', import.meta.url)));
  assert.equal(validateLists(seed).lists.length, 0);
  assert.ok(validateLists(JSON.parse(fs.readFileSync(new URL('../lists.example.json', import.meta.url)))).lists.length >= 3);
});

test('Ethereum signatures: EOA offline, ERC-1271 smart wallet through the RPC (mocked), wrong signer refused', async () => {
  const pk = generatePrivateKey(), acct = privateKeyToAccount(pk);
  const message = 'Slow Horizons test\nNonce: 1';
  const sig = await acct.signMessage({ message });
  let rpcCalls = 0;
  const transport = (answer) => custom({ async request({ method }) { rpcCalls++; if (method === 'eth_chainId') return '0x1'; if (method === 'eth_call') return answer; throw new Error('unexpected ' + method); } });
  const eoa = createEthVerifier({ transport: transport('0x' + '0'.repeat(64)) });
  assert.equal(await eoa(message, sig, acct.address), true);
  assert.equal(rpcCalls, 0, 'EOA needs no RPC call');
  const other = privateKeyToAccount(generatePrivateKey());
  assert.equal(await eoa(message, sig, other.address), false, 'signature from another key');
  assert.equal(await eoa(message + 'x', sig, acct.address), false, 'other message');
  // smart wallet: the validator answers true for this address (ERC-6492 universal validator returns 0x01)
  const smart = '0x' + '5a'.repeat(20);
  const scSig = '0x' + 'ee'.repeat(65);
  const yes = createEthVerifier({ transport: transport('0x' + '0'.repeat(63) + '1') });
  assert.equal(await yes(message, scSig, smart), true);
  assert.ok(rpcCalls > 0);
  const no = createEthVerifier({ transport: transport('0x' + '0'.repeat(64)) });
  assert.equal(await no(message, scSig, smart), false);
  const down = createEthVerifier({ transport: custom({ async request() { throw new Error('rpc down'); } }) });
  assert.equal(await down(message, scSig, smart), false, 'RPC down fails closed');
  assert.equal(await yes(message, 'nothex', smart), false);
});

test('Solana signMessage verify', () => {
  const kp = solKey(), m = 'hello';
  assert.equal(verifySol(m, signSol(kp, m), kp.publicKey.toBase58()), true);
  assert.equal(verifySol(m + '!', signSol(kp, m), kp.publicKey.toBase58()), false);
  assert.equal(verifySol(m, signSol(kp, m), solKey().publicKey.toBase58()), false);
  assert.equal(verifySol(m, 'AAAA', kp.publicKey.toBase58()), false);
});

test('ETH link: nonce single use, expiry, wrong Solana wallet; link authorises only that Solana wallet', async () => {
  const acct = privateKeyToAccount(generatePrivateKey()), eth = acct.address;
  const ka = solKey(), kb = solKey(), a = ka.publicKey.toBase58(), b = kb.publicKey.toBase58();
  const h = harness({
    lists: [{ id: 'mad', name: 'Mad holders', chain: 'ethereum', type: 'collection', contract: CONTRACT, standard: 'erc721', priceSol: 0, limit: 1, per: 'nft' }],
    ethHold: { [eth.toLowerCase()]: { [CONTRACT]: [{ tokenId: '7', balance: 1 }] } },
    verifyEth: createEthVerifier({ transport: custom({ async request() { throw new Error('no rpc in this test'); } }) }),
  });
  const c = h.al.ethChallenge(a, eth);
  assert.match(c.message, new RegExp(a)); assert.match(c.message, new RegExp(eth)); assert.match(c.message, /no transaction, no fees/);
  const signature = await acct.signMessage({ message: c.message });
  await assert.rejects(h.al.ethLink({ sol: b, eth, signature, nonce: c.nonce }), /expired or was already used/, 'challenge for another Solana wallet');
  await assert.rejects(h.al.ethLink({ sol: a, eth, signature, nonce: c.nonce }), /expired or was already used/, 'that failed attempt burnt the nonce');
  const c2 = h.al.ethChallenge(a, eth);
  const bad = await privateKeyToAccount(generatePrivateKey()).signMessage({ message: c2.message });
  await assert.rejects(h.al.ethLink({ sol: a, eth, signature: bad, nonce: c2.nonce }), /did not check out/);
  const c3 = h.al.ethChallenge(a, eth);
  h.advance(NONCE_TTL + 1);
  await assert.rejects(h.al.ethLink({ sol: a, eth, signature: await acct.signMessage({ message: c3.message }), nonce: c3.nonce }), /expired/);
  const c4 = h.al.ethChallenge(a, eth);
  const r = await h.al.ethLink({ sol: a, eth, signature: await acct.signMessage({ message: c4.message }), nonce: c4.nonce });
  assert.equal(r.linked, true);
  assert.equal(offerOf(r, 'mad').remaining, 1);
  assert.equal(offerOf(r, 'mad').units, undefined, 'the link answer carries no unit refs');
  await assert.rejects(h.al.ethLink({ sol: a, eth, signature: await acct.signMessage({ message: c4.message }), nonce: c4.nonce }), /already used/, 'replay');
  // only wallet a sees it
  assert.equal((await h.al.offers(b)).offers.length, 0);
  const unit = offerOf(await h.al.offers(a), 'mad').units[0].unit;
  await assert.rejects(claimAs(h, kb, 'mad', unit), /not eligible/);
  // a free claim on an Ethereum list needs the Solana wallet's signature too (review 2026-10-18)
  await assert.rejects(h.al.claimFree({ wallet: a, list: 'mad', unit }), /expired or was already used/, 'no Solana signature');
  const cx = h.al.challenge(a, 'mad');
  await assert.rejects(h.al.claimFree({ wallet: a, list: 'mad', unit, nonce: cx.nonce, signature: signSol(kb, cx.message) }), /did not check out/, 'signed by another wallet');
  assert.equal(h.pieces.length, 0);
  const ok = await claimAs(h, ka, 'mad', unit);
  assert.equal(ok.n, 1);
  assert.equal(h.pieces[0].wallet, a);
  // the eligibility answer reveals neither the ETH address nor the token
  assert.ok(!JSON.stringify(await h.al.offers(a)).toLowerCase().includes(eth.slice(2).toLowerCase()));
});

test('per wallet vs per NFT: an NFT passed to another wallet cannot claim again (per nft); per-wallet holder lists also count per NFT', async () => {
  const a = solKey(), b = solKey(), A = a.publicKey.toBase58(), B = b.publicKey.toBase58();
  const asset = Keypair.generate().publicKey.toBase58(), asset2 = Keypair.generate().publicKey.toBase58();
  const solHold = { [A]: [asset] };
  const h = harness({ solHold, lists: [
    { id: 'pernft', name: 'Per NFT', chain: 'solana', type: 'collection', collection: COLL, priceSol: 0, limit: 1, per: 'nft' },
    { id: 'perwal', name: 'Per wallet', chain: 'solana', type: 'collection', collection: COLL, priceSol: 0.02, limit: 2, per: 'wallet' },
    { id: 'og', name: 'OG', chain: 'solana', type: 'wallets', wallets: [B], priceSol: 0, limit: 1, per: 'wallet' },
  ] });
  const pay = async (kp, unit) => { const g = await reserveAs(h, kp, 'perwal', unit); h.al.settle(h.al.grantFor({ ticket: g.ticket, wallet: g.wallet, blockTime: h.now / 1000 }), { verdict: 'ok', signature: 's' + g.ticket, n: 1 }); return g; };
  let o = await h.al.offers(A);
  assert.equal(offerOf(o, 'pernft').remaining, 1); assert.equal(offerOf(o, 'perwal').remaining, 2);
  assert.equal(offerOf(o, 'pernft').units[0].unit, unitRef(asset));
  await claimAs(h, a, 'pernft', unitRef(asset));
  await assert.rejects(claimAs(h, a, 'pernft', unitRef(asset)), /used up/);
  const g1 = await pay(a, unitRef(A)); await pay(a, unitRef(A));
  assert.equal(g1.nft, asset, 'the grant records the NFT it used');
  await assert.rejects(reserveAs(h, a, 'perwal', unitRef(A)), /used up/);
  // the NFT moves to B
  delete solHold[A]; solHold[B] = [asset];
  o = await h.al.offers(B, { fresh: true });
  assert.equal(offerOf(o, 'pernft').remaining, 0, 'per nft: the token is spent');
  await assert.rejects(claimAs(h, b, 'pernft', unitRef(asset)), /used up/);
  assert.equal(offerOf(o, 'perwal').remaining, 0, 'per wallet: the NFT already gave its 2 on this list, a new wallet gets nothing from it');
  await assert.rejects(reserveAs(h, b, 'perwal', unitRef(B)), /used up/);
  // a second, unused NFT gives B its own allowance
  solHold[B] = [asset, asset2];
  o = await h.al.offers(B, { fresh: true });
  assert.equal(offerOf(o, 'perwal').remaining, 2);
  assert.equal((await pay(b, unitRef(B))).nft, asset2);
  assert.equal(h.state.allowlist.nftUsage.perwal[asset], 2);
  assert.equal(h.state.allowlist.nftUsage.perwal[asset2], 1);
  // signature checks for free claims
  const c = h.al.challenge(B, 'og');
  await assert.rejects(h.al.claimFree({ wallet: B, list: 'og', unit: unitRef(B), nonce: c.nonce, signature: signSol(a, c.message) }), /did not check out/);
  await assert.rejects(h.al.claimFree({ wallet: B, list: 'og', unit: unitRef(B), nonce: c.nonce, signature: signSol(b, c.message) }), /already used/, 'nonce burnt by the failed try');
  await assert.rejects(h.al.claimFree({ wallet: B, list: 'og', unit: unitRef(B) }), /expired or was already used/, 'no signature at all');
  const cp = h.al.challenge(B, 'perwal');
  await assert.rejects(h.al.claimFree({ wallet: B, list: 'og', unit: unitRef(B), nonce: cp.nonce, signature: signSol(b, cp.message) }), /expired or was already used/, 'a proof for another list');
  assert.equal(h.pieces.length, 1);
  assert.equal(h.payments.filter(p => p.verdict === 'claim').length, 1);
});

test('ERC-1155: per wallet (paid) counts per ETH address', async () => {
  const acct = privateKeyToAccount(generatePrivateKey()), eth = acct.address.toLowerCase(), A = solKey().publicKey.toBase58();
  const h = harness({ state: { allowlist: { links: { [eth]: { sol: A, at: 1 } } } },   // links from state.json: the index is built at start
    lists: [{ id: 'pass', name: 'Pass', chain: 'ethereum', type: 'collection', contract: C1155, standard: 'erc1155', priceSol: 0.02, limit: 2, per: 'wallet' }],
    ethHold: { [eth]: { [C1155]: [{ tokenId: '1', balance: 3 }] } } });
  const o = await h.al.offers(A);
  assert.equal(offerOf(o, 'pass').remaining, 2);
  assert.equal(offerOf(o, 'pass').units[0].unit, unitRef(eth));
});

test('free claim: exactly one piece per unit, concurrent claims for one unit -> one wins', async () => {
  const a = solKey(), A = a.publicKey.toBase58();
  const h = harness({ lists: [{ id: 'og', name: 'OG', chain: 'solana', type: 'wallets', wallets: [A], priceSol: 0, limit: 1, per: 'wallet' }] });
  h.setSlotDelay(30);
  const c1 = h.al.claimChallenge(A, 'og'), c2 = h.al.claimChallenge(A, 'og');
  const results = await Promise.allSettled([
    h.al.claimFree({ wallet: A, list: 'og', unit: unitRef(A), nonce: c1.nonce, signature: signSol(a, c1.message) }),
    h.al.claimFree({ wallet: A, list: 'og', unit: unitRef(A), nonce: c2.nonce, signature: signSol(a, c2.message) }),
  ]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.match(results.find(r => r.status === 'rejected').reason.message, /still running|used up/);
  assert.equal(h.pieces.length, 1);
  // and once it finished, a third try is "used up"
  const c3 = h.al.claimChallenge(A, 'og');
  await assert.rejects(h.al.claimFree({ wallet: A, list: 'og', unit: unitRef(A), nonce: c3.nonce, signature: signSol(a, c3.message) }), /used up/);
  // claims respect mintOpen
  const h2 = harness({ open: false, lists: [{ id: 'og', name: 'OG', chain: 'solana', type: 'wallets', wallets: [A], priceSol: 0, limit: 1, per: 'wallet' }] });
  const c4 = h2.al.claimChallenge(A, 'og');
  await assert.rejects(h2.al.claimFree({ wallet: A, list: 'og', unit: unitRef(A), nonce: c4.nonce, signature: signSol(a, c4.message) }), /closed/);
});

test('grants: reserved unit, price for the right payer before expiry, consumed only by an accepted payment, survive a restart', async () => {
  const ka = solKey(), kb = solKey(), A = ka.publicKey.toBase58(), B = kb.publicKey.toBase58();
  const state = {};
  const doc = [{ id: 'disc', name: 'Discount', chain: 'solana', type: 'wallets', wallets: [A], priceSol: 0.02, limit: 1, per: 'wallet' }];
  let h = harness({ state, lists: doc });
  const u = unitRef(A);
  await assert.rejects(reserveAs(h, kb, 'disc', u), /not eligible/);
  const g = await reserveAs(h, ka, 'disc', u);
  assert.equal(g.price, 20_000_000);
  assert.match(g.ticket, /^[0-9a-f]{16}$/);
  assert.equal((await h.al.offers(A)).offers[0].remaining, 0, 'the reservation holds the unit');
  // a payment from another wallet with this memo pays the public price
  assert.equal(h.al.grantFor({ ticket: g.ticket, wallet: B, blockTime: h.now / 1000 }), null);
  // restart: a new engine on the same state keeps the grant
  h = harness({ state, lists: doc });
  const again = h.al.grantFor({ ticket: g.ticket, wallet: A, blockTime: h.now / 1000 });
  assert.equal(again?.price, 20_000_000);
  // underpaid against the grant price: the grant is void, the unit free again
  h.al.settle(again, { verdict: 'underpaid', signature: 'sig1' });
  assert.equal((await h.al.offers(A)).offers[0].remaining, 1);
  // a new reservation, paid in full: consumed
  const g2 = await reserveAs(h, ka, 'disc', u);
  const at = h.al.grantFor({ ticket: g2.ticket, wallet: A, blockTime: h.now / 1000 });
  h.al.settle(at, { verdict: 'ok', signature: 'sig2', n: 1 });
  assert.equal(state.allowlist.usage.disc[A], 1);
  assert.equal(h.al.grantFor({ ticket: g2.ticket, wallet: A, blockTime: h.now / 1000 }), null, 'a grant pays once');
  // restart keeps the usage
  h = harness({ state, lists: doc });
  assert.equal((await h.al.offers(A)).offers[0].remaining, 0);
  await assert.rejects(reserveAs(h, ka, 'disc', u), /used up/);
});

test('grants expire: a payment after expiry pays the public price; the unit is released after the grace period', async () => {
  const ka = solKey(), A = ka.publicKey.toBase58();
  const h = harness({ lists: [{ id: 'disc', name: 'Discount', chain: 'solana', type: 'wallets', wallets: [A], priceSol: 0.02, limit: 1, per: 'wallet' }] });
  const g = await reserveAs(h, ka, 'disc', unitRef(A));
  const t0 = h.now;
  assert.ok(h.al.grantFor({ ticket: g.ticket, wallet: A, blockTime: (t0 + GRANT_TTL - 1000) / 1000 }), 'paid in time (chain time), even if read later');
  h.advance(GRANT_TTL + 1000);
  assert.equal(h.al.grantFor({ ticket: g.ticket, wallet: A, blockTime: h.now / 1000 }), null);
  assert.equal((await h.al.offers(A)).offers[0].remaining, 0, 'still held during the grace period');
  h.advance(GRANT_GRACE);
  h.al.expireTick();
  assert.equal(h.state.allowlist.grants[g.ticket].status, 'expired');
  assert.equal((await h.al.offers(A)).offers[0].remaining, 1);
  // free lists cannot be reserved, paid lists cannot be claimed
  await assert.rejects(h.al.claimFree({ wallet: A, list: 'disc', unit: unitRef(A) }), /not free/);
});

test('a payment with block time before expiry keeps its grant even if the watcher reads it after expireTick, if the unit has room', async () => {
  const ka = solKey(), A = ka.publicKey.toBase58();
  const h = harness({ lists: [{ id: 'disc', name: 'Discount', chain: 'solana', type: 'wallets', wallets: [A], priceSol: 0.02, limit: 1, per: 'wallet' }] });
  const g = await reserveAs(h, ka, 'disc', unitRef(A));
  const paidAt = (h.now + GRANT_TTL - 5000) / 1000;
  h.advance(GRANT_TTL + GRANT_GRACE + 60000);   // the watcher was down for a while
  h.al.expireTick();
  assert.equal(h.state.allowlist.grants[g.ticket].status, 'expired');
  const late = h.al.grantFor({ ticket: g.ticket, wallet: A, blockTime: paidAt });
  assert.equal(late?.ticket, g.ticket, 'paid on time: still the list price');
  assert.equal(h.al.grantFor({ ticket: g.ticket, wallet: A, blockTime: paidAt + GRANT_TTL / 1000 }), null, 'paid after expiry: public price');
  h.al.settle(late, { verdict: 'ok', signature: 'sigL', n: 1 });
  assert.equal(h.state.allowlist.usage.disc[A], 1);
  // without room it is refused: another grant on a limit-1 unit already paid
  const h2 = harness({ lists: [{ id: 'disc', name: 'Discount', chain: 'solana', type: 'wallets', wallets: [A], priceSol: 0.02, limit: 1, per: 'wallet' }] });
  const x = await reserveAs(h2, ka, 'disc', unitRef(A));
  const xPaid = (h2.now + 1000) / 1000;
  h2.advance(GRANT_TTL + GRANT_GRACE + 1000); h2.al.expireTick();
  const y = await reserveAs(h2, ka, 'disc', unitRef(A));
  h2.al.settle(h2.al.grantFor({ ticket: y.ticket, wallet: A, blockTime: h2.now / 1000 }), { verdict: 'ok', signature: 'sigY', n: 2 });
  assert.equal(h2.al.grantFor({ ticket: x.ticket, wallet: A, blockTime: xPaid }), null, 'the unit is used up: public price');
});

test('retired reservations: a relayed one is never retired; a retired one paid on time takes the room from the newer unpaid one', async () => {
  const ka = solKey(), A = ka.publicKey.toBase58();
  const doc = [{ id: 'disc', name: 'Discount', chain: 'solana', type: 'wallets', wallets: [A], priceSol: 0.02, limit: 1, per: 'wallet' }];
  // 1) relayed: the wallet asks again after 2 min, the relayed reservation keeps its unit, the new ask is refused
  let h = harness({ lists: doc });
  const g = await reserveAs(h, ka, 'disc', unitRef(A)); g.tx = 'tx';
  h.al.markRelayed(g.ticket, 'sigR');
  h.advance(130000);
  await assert.rejects(reserveAs(h, ka, 'disc', unitRef(A)), /used up/);
  assert.equal(h.state.allowlist.grants[g.ticket].status, 'reserved');
  assert.ok(h.al.grantFor({ ticket: g.ticket, wallet: A, blockTime: h.now / 1000 }));
  // 2) not relayed: retired, a new reservation is made; the old payment lands on time: it wins, the newer one is void
  h = harness({ lists: doc });
  const old = await reserveAs(h, ka, 'disc', unitRef(A)); old.tx = 'tx';
  const oldPaid = (h.now + 100000) / 1000;
  h.advance(130000);
  const neu = await reserveAs(h, ka, 'disc', unitRef(A));
  assert.equal(h.state.allowlist.grants[old.ticket].status, 'replaced');
  const got = h.al.grantFor({ ticket: old.ticket, wallet: A, blockTime: oldPaid });
  assert.equal(got?.ticket, old.ticket, 'the on-time payment keeps its price');
  h.al.settle(got, { verdict: 'ok', signature: 'sigO', n: 1 });
  assert.equal(h.state.allowlist.grants[neu.ticket].status, 'void');
  assert.match(h.state.allowlist.grants[neu.ticket].verdict, /superseded/);
  assert.equal(h.al.held('disc', A), 1, 'never more than the limit');
  // 3) the newer one was relayed (its payment is on its way): the older payment does not take its room
  h = harness({ lists: doc });
  const o3 = await reserveAs(h, ka, 'disc', unitRef(A)); o3.tx = 'tx';
  const o3Paid = (h.now + 100000) / 1000;
  h.advance(130000);
  const n3 = await reserveAs(h, ka, 'disc', unitRef(A));
  h.al.markRelayed(n3.ticket, 'sigN');
  assert.equal(h.al.grantFor({ ticket: o3.ticket, wallet: A, blockTime: o3Paid }), null);
  assert.equal(h.state.allowlist.grants[n3.ticket].status, 'reserved');
});

test('reservations need the wallet signature; the same signature gets the same reservation back within 50 s', async () => {
  const ka = solKey(), kb = solKey(), A = ka.publicKey.toBase58();
  const h = harness({ lists: [
    { id: 'disc', name: 'Discount', chain: 'solana', type: 'wallets', wallets: [A], priceSol: 0.02, limit: 1, per: 'wallet' },
    { id: 'og', name: 'OG', chain: 'solana', type: 'wallets', wallets: [A], priceSol: 0, limit: 1, per: 'wallet' },
  ] });
  const u = unitRef(A);
  await assert.rejects(h.al.reserve({ wallet: A, list: 'disc', unit: u }), /expired or was already used/, 'no proof');
  const c = h.al.challenge(A, 'disc');
  assert.match(c.message, /reserve a piece at an allowlist price/); assert.match(c.message, new RegExp(A)); assert.match(c.message, /Discount \(disc\)/); assert.match(c.message, /Site: www\.gameboylabs\.xyz/);
  await assert.rejects(h.al.reserve({ wallet: A, list: 'disc', unit: u, nonce: c.nonce, signature: signSol(kb, c.message) }), /did not check out/, 'signed by another wallet');
  const cf = h.al.challenge(A, 'og');
  await assert.rejects(h.al.reserve({ wallet: A, list: 'disc', unit: u, nonce: cf.nonce, signature: signSol(ka, cf.message) }), /expired or was already used/, 'a free-claim proof for another list');
  assert.equal(Object.keys(h.state.allowlist.grants).length, 0, 'nothing reserved');
  const pf = prove(h, ka, 'disc');
  const g = await h.al.reserve({ wallet: A, list: 'disc', unit: u, ...pf }); g.tx = 'tx';
  h.advance(20000);
  assert.equal((await h.al.reserve({ wallet: A, list: 'disc', unit: u, ...pf })).ticket, g.ticket, 'cancelled in the wallet, tried again: same reservation');
  h.advance(40000);
  await assert.rejects(h.al.reserve({ wallet: A, list: 'disc', unit: u, ...pf }), /expired or was already used/, 'after 50 s the old signature is spent');
});

test('a list disabled, deleted or repriced voids its open reservations', async () => {
  const ka = solKey(), A = ka.publicKey.toBase58();
  const disc = { id: 'disc', name: 'Discount', chain: 'solana', type: 'wallets', wallets: [A], priceSol: 0.02, limit: 2, per: 'wallet' };
  const h = harness({ lists: [disc] });
  const g1 = await reserveAs(h, ka, 'disc', unitRef(A));
  assert.equal(h.al.openGrant(g1.ticket)?.ticket, g1.ticket);
  h.lists.replace({ lists: [{ ...disc, priceSol: 0.03 }] });
  assert.equal(h.al.grantFor({ ticket: g1.ticket, wallet: A, blockTime: h.now / 1000 }), null, 'repriced: public price (lazy check)');
  assert.equal(h.al.openGrant(g1.ticket), null, '/api/submit refuses it');
  h.al.syncLists();
  assert.equal(h.state.allowlist.grants[g1.ticket].status, 'void');
  const g2 = await reserveAs(h, ka, 'disc', unitRef(A));
  assert.equal(g2.price, 30_000_000);
  h.lists.replace({ lists: [{ ...disc, priceSol: 0.03, disabled: true }] });
  h.al.syncLists();
  assert.equal(h.state.allowlist.grants[g2.ticket].status, 'void');
  assert.equal(h.al.grantFor({ ticket: g2.ticket, wallet: A, blockTime: h.now / 1000 }), null);
  // edited by hand + restart: the new engine voids at start
  h.lists.replace({ lists: [{ ...disc, priceSol: 0.03 }] });
  const g3 = await reserveAs(h, ka, 'disc', unitRef(A));
  h.lists.replace({ lists: [] });
  harness({ state: h.state, lists: [] });
  assert.equal(h.state.allowlist.grants[g3.ticket].status, 'void');
});

test('DoS bounds: links per Solana wallet, nonces per IP, lookups per eligibility request, cache size', async () => {
  const A = solKey().publicKey.toBase58();
  const accts = Array.from({ length: MAX_LINKS_PER_SOL + 2 }, () => privateKeyToAccount(generatePrivateKey()));
  const ethHold = Object.fromEntries(accts.map((a, i) => [a.address.toLowerCase(), { [CONTRACT]: [{ tokenId: String(100 + i), balance: 1 }] }]));   // only holders get linked
  const h = harness({ lists: [{ id: 'mad', name: 'Mad', chain: 'ethereum', type: 'collection', contract: CONTRACT, standard: 'erc721', priceSol: 0, limit: 1, per: 'nft' }], ethHold });
  for (const [i, acct] of accts.entries()) {
    const c = h.al.ethChallenge(A, acct.address, 'ip-' + acct.address);
    const p = h.al.ethLink({ sol: A, eth: acct.address, signature: await acct.signMessage({ message: c.message }), nonce: c.nonce });
    if (i < MAX_LINKS_PER_SOL) await p; else await assert.rejects(p, /already has 5 linked/);
    h.advance(1000);
  }
  const stored = Object.entries(h.state.allowlist.links).filter(([, l]) => l.sol === A).map(([e]) => e);
  assert.equal(stored.length, MAX_LINKS_PER_SOL, 'at most 5 links per Solana wallet');
  assert.deepEqual(stored.sort(), accts.slice(0, MAX_LINKS_PER_SOL).map(a => a.address.toLowerCase()).sort(), 'the first five stay: newer links never push older ones out');
  assert.deepEqual(h.al.linkedEths(A).sort(), stored.sort());
  // nonces: one IP holds at most MAX_NONCES_PER_IP, its oldest go; another IP is untouched
  const kb = solKey(), B = kb.publicKey.toBase58();
  const h2 = harness({ lists: [{ id: 'og', name: 'OG', chain: 'solana', type: 'wallets', wallets: [B], priceSol: 0, limit: 1, per: 'wallet' }] });
  const other = h2.al.challenge(B, 'og', '9.9.9.9');
  const first = h2.al.challenge(B, 'og', '1.1.1.1');
  for (let i = 0; i < MAX_NONCES_PER_IP; i++) h2.al.challenge(B, 'og', '1.1.1.1');
  assert.equal(h2.al._nonces.size, MAX_NONCES_PER_IP + 1);
  await assert.rejects(h2.al.claimFree({ wallet: B, list: 'og', unit: unitRef(B), nonce: first.nonce, signature: signSol(kb, first.message) }), /expired or was already used/, 'pushed out by the same IP');
  assert.equal((await h2.al.claimFree({ wallet: B, list: 'og', unit: unitRef(B), nonce: other.nonce, signature: signSol(kb, other.message) })).n, 1, 'another IP keeps its nonce');
  h2.advance(NONCE_TTL + 1); h2.al.challenge(B, 'og', '2.2.2.2');
  assert.equal(h2.al._nonces.size, 1, 'expired nonces dropped from the front');
  // eligibility: at most MAX_LOOKUPS holdings lookups per request, the rest is "unavailable"; one lookup per collection
  const colls = Array.from({ length: MAX_LOOKUPS + 5 }, () => Keypair.generate().publicKey.toBase58());
  const many = colls.map((c, i) => ({ id: 'c' + i, name: 'C' + i, chain: 'solana', type: 'collection', collection: c, priceSol: 0, limit: 1, per: 'nft' }));
  many.push({ id: 'dup', name: 'Dup', chain: 'solana', type: 'collection', collection: colls[0], priceSol: 0.02, limit: 1, per: 'nft' });
  const h3 = harness({ delay: 0, lists: many });
  const r = await h3.al.offers(A);
  assert.equal(h3.calls.solana, MAX_LOOKUPS);
  assert.equal(r.unavailable.length, 5);
  assert.ok(!r.unavailable.some(x => x.list === 'dup'), 'a second list on a cached collection needs no lookup');
  // the cache stays bounded, oldest out first
  const h4 = harness({ delay: 0, lists: [{ id: 'c', name: 'C', chain: 'solana', type: 'collection', collection: COLL, priceSol: 0, limit: 1, per: 'nft' }] });
  const owners = Array.from({ length: CACHE_MAX + 10 }, () => Keypair.generate().publicKey.toBase58());
  for (const o of owners) await h4.al.offers(o);
  assert.equal(h4.al._cache.size, CACHE_MAX);
  assert.ok(!h4.al._cache.has(`s:${COLL}:${owners[0]}`) && h4.al._cache.has(`s:${COLL}:${owners.at(-1)}`));
});

test('holdings errors fail closed: no offer, no claim', async () => {
  const a = solKey(), A = a.publicKey.toBase58();
  const h = harness({ failSol: true, lists: [{ id: 'hold', name: 'Holders', chain: 'solana', type: 'collection', collection: COLL, priceSol: 0, limit: 1, per: 'nft' }] });
  const o = await h.al.offers(A);
  assert.equal(o.offers.length, 0); assert.equal(o.unavailable[0].list, 'hold');
  await assert.rejects(claimAs(h, a, 'hold', unitRef(A)), /Could not check/);
  assert.equal(h.pieces.length, 0);
  // without an Alchemy key, Ethereum lists give nothing (and say so to the admin)
  const h2 = harness({ ethEnabled: false, lists: [{ id: 'e', name: 'E', chain: 'ethereum', type: 'wallets', wallets: ['0x' + '11'.repeat(20)], priceSol: 0, limit: 1, per: 'wallet' }] });
  assert.throws(() => h2.al.ethChallenge(A, '0x' + '11'.repeat(20)), /not available/);
  assert.equal(h2.al.usageReport()[0].unavailable, true);
});

test('holdings parsers (Helius DAS, Alchemy) check the answer and fail closed', async () => {
  const owner = solKey().publicKey.toBase58(), asset = Keypair.generate().publicKey.toBase58(), other = solKey().publicKey.toBase58();
  const calls = [];
  const das = (items, extra = {}) => async (url, init) => { calls.push({ url, body: JSON.parse(init.body) }); return { ok: true, json: async () => ({ result: { items }, ...extra }) }; };
  const list = { collection: COLL };
  let hd = createHoldings({ dasUrl: 'https://rpc.example/?api-key=k', fetchImpl: das([
    { id: asset, burnt: false, ownership: { owner }, grouping: [{ group_key: 'collection', group_value: COLL }] },
    { id: Keypair.generate().publicKey.toBase58(), ownership: { owner: other }, grouping: [{ group_key: 'collection', group_value: COLL }] },   // not this owner
    { id: Keypair.generate().publicKey.toBase58(), ownership: { owner }, grouping: [{ group_key: 'collection', group_value: other }] },   // other collection
    { id: Keypair.generate().publicKey.toBase58(), burnt: true, ownership: { owner }, grouping: [{ group_key: 'collection', group_value: COLL }] },
    { id: Keypair.generate().publicKey.toBase58(), ownership: { owner }, grouping: [{ group_key: 'collection', group_value: COLL, verified: false }] },   // unverified grouping
  ]) });
  assert.deepEqual(await hd.solana(owner, list), [asset]);
  assert.deepEqual(calls[0].body.params.grouping, ['collection', COLL]);
  hd = createHoldings({ dasUrl: 'https://rpc.example', fetchImpl: das([], { error: { code: -32000 } }) });
  await assert.rejects(hd.solana(owner, list), /DAS error/);
  hd = createHoldings({ dasUrl: 'https://rpc.example', fetchImpl: async () => ({ ok: false, status: 429 }) });
  await assert.rejects(hd.solana(owner, list), /429/);
  // creator lists ask for verified creators
  hd = createHoldings({ dasUrl: 'https://rpc.example', fetchImpl: das([{ id: asset, ownership: { owner }, creators: [{ address: COLL, verified: true }] }, { id: other, ownership: { owner }, creators: [{ address: COLL, verified: false }] }]) });
  assert.deepEqual(await hd.solana(owner, { collection: 'creator:' + COLL }), [asset]);
  assert.equal(calls.at(-1).body.params.creatorVerified, true);
  // Alchemy
  const eth = '0x' + '12'.repeat(20);
  let seen;
  const al = createHoldings({ alchemyKey: 'KEY', fetchImpl: async (url) => { seen = url; return { ok: true, json: async () => ({ ownedNfts: [{ contractAddress: CONTRACT, tokenId: '42', balance: '1' }, { contractAddress: '0x' + '99'.repeat(20), tokenId: '1' }, { contract: { address: CONTRACT.toUpperCase().replace('0X', '0x') }, tokenId: '0x2b', balance: '2' }] }) }; } });
  assert.deepEqual(await al.ethereum(eth, { contract: CONTRACT, standard: 'erc721' }), [{ tokenId: '42', balance: 1 }, { tokenId: '43', balance: 1 }]);
  assert.match(seen, /^https:\/\/eth-mainnet\.g\.alchemy\.com\/nft\/v3\/KEY\/getNFTsForOwner\?owner=0x/);
  assert.match(seen, /contractAddresses%5B%5D=0xabab/);
  await assert.rejects(createHoldings({ alchemyKey: 'KEY', fetchImpl: async () => ({ ok: true, json: async () => ({ error: 'x' }) }) }).ethereum(eth, { contract: CONTRACT }), /no ownedNfts/);
  await assert.rejects(createHoldings({ alchemyKey: 'KEY', fetchImpl: async () => ({ ok: true, json: async () => ({}) }) }).ethereum('0xnope', { contract: CONTRACT }), /bad owner/);
});

test('ALCHEMY_RPC must be Ethereum mainnet', async () => {
  const { config, checkConfig } = await import('../src/config.mjs');
  const before = config.alchemyRpc;
  try {
    config.alchemyRpc = 'https://polygon-mainnet.g.alchemy.com/v2/abc';
    assert.throws(() => checkConfig(), /ALCHEMY_RPC must be an https:\/\/eth-mainnet/);
    config.alchemyRpc = 'https://eth-sepolia.g.alchemy.com/v2/abc';
    assert.throws(() => checkConfig(), /ALCHEMY_RPC/);
    config.alchemyRpc = 'https://eth-mainnet.g.alchemy.com/v2/abc_DEF-1';
    assert.doesNotThrow(() => checkConfig());
  } finally { config.alchemyRpc = before; }
});

test('maxTotal caps the whole list across wallets (free claims and paid reservations)', async () => {
  assert.throws(() => validateLists({ lists: [{ id: 'x', name: 'X', chain: 'solana', type: 'wallets', wallets: [solKey().publicKey.toBase58()], priceSol: 0, limit: 1, per: 'wallet', maxTotal: 0 }] }), /maxTotal/);
  const ks = [solKey(), solKey(), solKey()], ws = ks.map(k => k.publicKey.toBase58());
  // free: 3 eligible wallets, 1 each, but only 2 for the whole list
  const h = harness({ lists: [{ id: 'free', name: 'Free', chain: 'solana', type: 'wallets', wallets: ws, priceSol: 0, limit: 1, per: 'wallet', maxTotal: 2 }] });
  for (const i of [0, 1]) await claimAs(h, ks[i], 'free', offerOf(await h.al.offers(ws[i]), 'free').units[0].unit);
  const third = offerOf(await h.al.offers(ws[2]), 'free');
  assert.equal(third.remaining, 0);
  await assert.rejects(claimAs(h, ks[2], 'free', unitRef(ws[2])), /used up/);
  assert.equal(h.pieces.length, 2);
  // paid: two open reservations fill a cap of 2; the third waits until one expires
  const p = harness({ lists: [{ id: 'paid', name: 'Paid', chain: 'solana', type: 'wallets', wallets: ws, priceSol: 0.02, limit: 1, per: 'wallet', maxTotal: 2 }] });
  await reserveAs(p, ks[0], 'paid', unitRef(ws[0]));
  await reserveAs(p, ks[1], 'paid', unitRef(ws[1]));
  await assert.rejects(reserveAs(p, ks[2], 'paid', unitRef(ws[2])), /used up/);
  p.advance(GRANT_TTL + GRANT_GRACE + 1000); p.al.expireTick();
  const g = await reserveAs(p, ks[2], 'paid', unitRef(ws[2]));
  assert.equal(g.status, 'reserved');
  // a late payment for an expired grant is refused its price when the list is full again
  const old = Object.values(p.state.allowlist.grants).find(x => x.wallet === ws[0]);
  await reserveAs(p, ks[1], 'paid', unitRef(ws[1]));
  assert.equal(p.al.grantFor({ ticket: old.ticket, wallet: ws[0], blockTime: Math.floor((old.exp - 1000) / 1000) }), null);
});

test('ETH link without the Solana wallet (paste flow): empty addresses are not linked, answer covers this ETH address only', async () => {
  const victim = solKey().publicKey.toBase58();
  const holder = privateKeyToAccount(generatePrivateKey()), other = privateKeyToAccount(generatePrivateKey());
  const empties = Array.from({ length: MAX_LINKS_PER_SOL + 1 }, () => privateKeyToAccount(generatePrivateKey()));
  const h = harness({
    lists: [{ id: 'mad', name: 'Mad', chain: 'ethereum', type: 'collection', contract: CONTRACT, standard: 'erc721', priceSol: 0, limit: 1, per: 'nft' },
            { id: 'later', name: 'Later', chain: 'ethereum', type: 'collection', contract: C1155, standard: 'erc1155', priceSol: 0.01, limit: 1, per: 'wallet', start: '2030-01-01T00:00:00Z' }],
    ethHold: { [holder.address.toLowerCase()]: { [CONTRACT]: [{ tokenId: '1', balance: 1 }] }, [other.address.toLowerCase()]: { [C1155]: [{ tokenId: '5', balance: 2 }] } },
  });
  const link = async (acct, sol) => { const c = h.al.ethChallenge(sol, acct.address, 'ip-' + acct.address); return h.al.ethLink({ sol, eth: acct.address, signature: await acct.signMessage({ message: c.message }), nonce: c.nonce }); };
  const r1 = await link(holder, victim);
  assert.equal(r1.linked, true); assert.deepEqual(r1.offers.map(o => o.list), ['mad']);
  // an address holding nothing on any enabled Ethereum list is never stored, so strangers cannot push the real link out
  for (const e of empties) assert.equal((await link(e, victim)).linked, false);
  assert.deepEqual(h.al.linkedEths(victim), [holder.address.toLowerCase()]);
  assert.equal(offerOf(await h.al.offers(victim), 'mad').remaining, 1);
  // a list that opens later counts (link ahead of time); its offer shows open: false and the answer mentions only this address
  const r2 = await link(other, victim);
  assert.equal(r2.linked, true); assert.deepEqual(r2.offers.map(o => [o.list, o.open]), [['later', false]]);
  assert.ok(!r2.offers.some(o => o.list === 'mad'), 'nothing about the other linked address');
  // a holdings outage refuses the link (nothing stored) instead of guessing
  const h2 = harness({ lists: [{ id: 'mad', name: 'Mad', chain: 'ethereum', type: 'collection', contract: CONTRACT, standard: 'erc721', priceSol: 0, limit: 1, per: 'nft' }], failEth: true });
  const acct = privateKeyToAccount(generatePrivateKey()), sol = solKey().publicKey.toBase58();
  const c = h2.al.ethChallenge(sol, acct.address);
  await assert.rejects(h2.al.ethLink({ sol, eth: acct.address, signature: await acct.signMessage({ message: c.message }), nonce: c.nonce }), /Could not check your Ethereum NFTs/);
  assert.deepEqual(h2.al.linkedEths(sol), []);
});

test('ETH link slots: a full Solana wallet frees only links that hold nothing now; one failing list does not block the link', async () => {
  const S = solKey().publicKey.toBase58();
  const accts = Array.from({ length: MAX_LINKS_PER_SOL + 1 }, () => privateKeyToAccount(generatePrivateKey()));
  const ethHold = Object.fromEntries(accts.map((a, i) => [a.address.toLowerCase(), { [CONTRACT]: [{ tokenId: String(i), balance: 1 }] }]));
  const h = harness({ lists: [{ id: 'mad', name: 'Mad', chain: 'ethereum', type: 'collection', contract: CONTRACT, standard: 'erc721', priceSol: 0, limit: 1, per: 'nft' }], ethHold });
  const link = async (acct) => { const c = h.al.ethChallenge(S, acct.address, 'ip-' + acct.address); return h.al.ethLink({ sol: S, eth: acct.address, signature: await acct.signMessage({ message: c.message }), nonce: c.nonce }); };
  for (const a of accts.slice(0, MAX_LINKS_PER_SOL)) await link(a);
  await assert.rejects(link(accts[MAX_LINKS_PER_SOL]), /already has 5 linked/);
  delete ethHold[accts[2].address.toLowerCase()];   // that address sold its NFT
  const r = await link(accts[MAX_LINKS_PER_SOL]);
  assert.equal(r.linked, true);
  assert.ok(!h.al.linkedEths(S).includes(accts[2].address.toLowerCase()), 'the empty link made room');
  assert.equal(h.al.linkedEths(S).length, MAX_LINKS_PER_SOL);
  // two Ethereum lists, one lookup failing: the other list's holdings still link
  const acct = privateKeyToAccount(generatePrivateKey()), T2 = solKey().publicKey.toBase58();
  const h2 = harness({ lists: [{ id: 'a', name: 'A', chain: 'ethereum', type: 'collection', contract: CONTRACT, standard: 'erc721', priceSol: 0, limit: 1, per: 'nft' },
                               { id: 'b', name: 'B', chain: 'ethereum', type: 'collection', contract: C1155, standard: 'erc1155', priceSol: 0.01, limit: 1, per: 'wallet' }],
    ethHold: { [acct.address.toLowerCase()]: { [C1155]: [{ tokenId: '1', balance: 1 }] } }, failEthContract: CONTRACT });
  const c = h2.al.ethChallenge(T2, acct.address);
  const r2 = await h2.al.ethLink({ sol: T2, eth: acct.address, signature: await acct.signMessage({ message: c.message }), nonce: c.nonce });
  assert.equal(r2.linked, true); assert.deepEqual(r2.offers.map(o => o.list), ['b']);
});

test('ETH link: used-up allowances neither link nor hold a slot', async () => {
  const sK = solKey(), S = sK.publicKey.toBase58(), user = solKey(), U = user.publicKey.toBase58();
  const accts = Array.from({ length: MAX_LINKS_PER_SOL + 2 }, () => privateKeyToAccount(generatePrivateKey()));
  const ethHold = Object.fromEntries(accts.map((a, i) => [a.address.toLowerCase(), { [CONTRACT]: [{ tokenId: String(i), balance: 1 }] }]));
  const h = harness({ lists: [{ id: 'mad', name: 'Mad', chain: 'ethereum', type: 'collection', contract: CONTRACT, standard: 'erc721', priceSol: 0, limit: 1, per: 'nft' }], ethHold });
  const linkTo = async (acct, sol) => { const c = h.al.ethChallenge(sol, acct.address, 'ip-' + acct.address); return h.al.ethLink({ sol, eth: acct.address, signature: await acct.signMessage({ message: c.message }), nonce: c.nonce }); };
  // address 0 is used up by its owner first: it cannot be linked anywhere else
  await linkTo(accts[0], U);
  await claimAs(h, user, 'mad', offerOf(await h.al.offers(U), 'mad').units[0].unit);
  const r0 = await linkTo(accts[0], S);
  assert.equal(r0.linked, false); assert.equal(r0.offers[0].remaining, 0, 'reported as used up');
  // fill S with 5 live links; a 6th is refused while all five still give something
  for (const a of accts.slice(1, MAX_LINKS_PER_SOL + 1)) assert.equal((await linkTo(a, S)).linked, true);
  await assert.rejects(linkTo(accts[MAX_LINKS_PER_SOL + 1], S), /already has 5 linked/);
  // S uses one NFT up: that link gives nothing now and makes room
  await claimAs(h, sK, 'mad', offerOf(await h.al.offers(S), 'mad').units[0].unit);
  assert.equal((await linkTo(accts[MAX_LINKS_PER_SOL + 1], S)).linked, true);
  assert.equal(h.al.linkedEths(S).length, MAX_LINKS_PER_SOL);
});

test('maxPerWallet: a holder of many NFTs gets at most N pieces, per Solana wallet and per ETH address', async () => {
  assert.throws(() => validateLists({ lists: [{ id: 'x', name: 'X', chain: 'solana', type: 'collection', collection: COLL, priceSol: 0, limit: 1, per: 'nft', maxPerWallet: 0 }] }), /maxPerWallet/);
  // Solana collection, 1 per NFT, at most 3 per wallet: a wallet with 10 NFTs gets 3, another holder is not affected
  const whale = solKey(), small = solKey(), W = whale.publicKey.toBase58(), S = small.publicKey.toBase58();
  const assets = Array.from({ length: 10 }, () => Keypair.generate().publicKey.toBase58()), mine = Keypair.generate().publicKey.toBase58();
  const h = harness({ solHold: { [W]: assets, [S]: [mine] }, lists: [
    { id: 'free', name: 'Free', chain: 'solana', type: 'collection', collection: COLL, priceSol: 0, limit: 1, per: 'nft', maxPerWallet: 3 },
    { id: 'paid', name: 'Paid', chain: 'solana', type: 'collection', collection: COLL, priceSol: 0.02, limit: 1, per: 'nft', maxPerWallet: 2 }] });
  assert.equal(offerOf(await h.al.offers(W), 'free').remaining, 3);
  for (let i = 0; i < 3; i++) await claimAs(h, whale, 'free', unitRef(assets[i]));
  assert.equal(offerOf(await h.al.offers(W, { fresh: true }), 'free').remaining, 0);
  await assert.rejects(claimAs(h, whale, 'free', unitRef(assets[3])), /used up/);
  assert.equal(offerOf(await h.al.offers(S), 'free').remaining, 1);
  await claimAs(h, small, 'free', unitRef(mine));
  assert.equal(h.pieces.length, 4);
  // paid: open reservations count toward the cap; an expired one frees its place
  await reserveAs(h, whale, 'paid', unitRef(assets[0]));
  await reserveAs(h, whale, 'paid', unitRef(assets[1]));
  await assert.rejects(reserveAs(h, whale, 'paid', unitRef(assets[2])), /used up/);
  h.advance(GRANT_TTL + GRANT_GRACE + 1000); h.al.expireTick();
  assert.equal((await reserveAs(h, whale, 'paid', unitRef(assets[2]))).status, 'reserved');
  // a late payment for the expired grant does not get its price while the wallet is at its cap again
  await reserveAs(h, whale, 'paid', unitRef(assets[3]));
  const old = Object.values(h.state.allowlist.grants).find(g => g.list === 'paid' && g.status === 'expired');
  assert.equal(h.al.grantFor({ ticket: old.ticket, wallet: W, blockTime: Math.floor((old.exp - 1000) / 1000) }), null);

  // Ethereum: the cap follows the ETH address, so re-linking the same NFTs to a fresh Solana wallet does not start over
  const holder = privateKeyToAccount(generatePrivateKey()), s1 = solKey(), s2 = solKey(), S1 = s1.publicKey.toBase58(), S2 = s2.publicKey.toBase58();
  const e = harness({ lists: [{ id: 'mad', name: 'Mad', chain: 'ethereum', type: 'collection', contract: CONTRACT, standard: 'erc721', priceSol: 0, limit: 1, per: 'nft', maxPerWallet: 2 }],
    ethHold: { [holder.address.toLowerCase()]: { [CONTRACT]: Array.from({ length: 5 }, (_, i) => ({ tokenId: String(i + 1), balance: 1 })) } } });
  const link = async (sol) => { const c = e.al.ethChallenge(sol, holder.address, 'ip'); return e.al.ethLink({ sol, eth: holder.address, signature: await holder.signMessage({ message: c.message }), nonce: c.nonce }); };
  assert.equal((await link(S1)).linked, true);
  const o1 = offerOf(await e.al.offers(S1), 'mad');
  assert.equal(o1.remaining, 2);
  await claimAs(e, s1, 'mad', o1.units[0].unit); await claimAs(e, s1, 'mad', o1.units[1].unit);
  await assert.rejects(claimAs(e, s1, 'mad', o1.units[2].unit), /used up/);
  // the same address moves its link to another Solana wallet: nothing more (and the link answer says used up, so it is not even stored)
  const r = await link(S2);
  assert.equal(r.linked, false);
  assert.equal(r.offers[0].remaining, 0);
  assert.equal(e.pieces.length, 2);
});

test('code lists: validation (Solana, per wallet, total required, unique code, stored in capitals)', () => {
  const base = { id: 'st', name: 'Superteam', chain: 'solana', type: 'code', code: 'superteam', priceSol: 0, limit: 2, per: 'wallet', maxTotal: 50 };
  const r = validateLists({ lists: [base] });
  assert.equal(r.lists[0].code, 'SUPERTEAM');
  assert.equal(validateLists({ lists: [{ ...base, priceSol: 0.02 }] }).lists.length, 1, 'paid codes are fine');
  assert.throws(() => validateLists({ lists: [{ ...base, maxTotal: undefined }] }), /needs a total/);
  assert.throws(() => validateLists({ lists: [{ ...base, chain: 'ethereum' }] }), /code list is on Solana/);
  assert.throws(() => validateLists({ lists: [{ ...base, per: 'nft' }] }), /code counts per wallet/);
  assert.throws(() => validateLists({ lists: [{ ...base, code: 'ab' }] }), /code: 3-32/);
  assert.throws(() => validateLists({ lists: [{ ...base, code: 'has space' }] }), /code: 3-32/);
  assert.throws(() => validateLists({ lists: [{ ...base, wallets: [solKey().publicKey.toBase58()] }] }), /no wallets/);
  assert.throws(() => validateLists({ lists: [base, { ...base, id: 'st2', code: 'SuperTeam' }] }), /already used by list "st"/);
  assert.throws(() => validateLists({ lists: [{ id: 'x', name: 'X', chain: 'solana', type: 'wallets', wallets: [solKey().publicKey.toBase58()], code: 'ABC', priceSol: 0, limit: 1, per: 'wallet' }] }), /only a code list/);
});

test('code lists: offer only with the right code, limit per wallet, total cap across wallets', async () => {
  const keys = [solKey(), solKey(), solKey()], W = keys.map(k => k.publicKey.toBase58());
  const h = harness({ lists: [{ id: 'st', name: 'Superteam', chain: 'solana', type: 'code', code: 'GBLAB', priceSol: 0, limit: 2, per: 'wallet', maxTotal: 3 }] });
  assert.equal(offerOf(await h.al.offers(W[0]), 'st'), undefined, 'no code: no offer');
  assert.equal(offerOf(await h.al.offers(W[0], { code: 'WRONG' }), 'st'), undefined, 'wrong code: no offer');
  const r = await h.al.offers(W[0], { code: ' gblab ' });
  assert.equal(r.codeList, 'st');
  assert.equal(offerOf(r, 'st').remaining, 2);
  const claim = (i, code) => { const c = h.al.challenge(W[i], 'st'); return h.al.claimFree({ wallet: W[i], list: 'st', unit: unitRef(W[i]), nonce: c.nonce, signature: signSol(keys[i], c.message), code }); };
  await assert.rejects(claim(0, null), /code is not valid/);
  await assert.rejects(claim(0, 'NOPE'), /code is not valid/);
  await claim(0, 'gblab'); await claim(0, 'GBLAB');
  await assert.rejects(claim(0, 'GBLAB'), /used up/, 'limit per wallet');
  await claim(1, 'GBLAB');
  assert.equal(offerOf(await h.al.offers(W[2], { code: 'GBLAB' }), 'st').remaining, 0, 'the total is used up');
  await assert.rejects(claim(2, 'GBLAB'), /used up/);
  assert.equal(h.pieces.length, 3);
});

test('code lists: a paid code reserves at its price; changing the code voids the reservation', async () => {
  const ka = solKey(), A = ka.publicKey.toBase58();
  const doc = { id: 'cd', name: 'Friends', chain: 'solana', type: 'code', code: 'FRIENDS', priceSol: 0.02, limit: 1, per: 'wallet', maxTotal: 10 };
  const h = harness({ lists: [doc] });
  const c = h.al.challenge(A, 'cd');
  await assert.rejects(h.al.reserve({ wallet: A, list: 'cd', unit: unitRef(A), nonce: c.nonce, signature: signSol(ka, c.message) }), /code is not valid/);
  const c2 = h.al.challenge(A, 'cd');
  const g = await h.al.reserve({ wallet: A, list: 'cd', unit: unitRef(A), nonce: c2.nonce, signature: signSol(ka, c2.message), code: 'friends' });
  assert.equal(g.price, 20_000_000);
  assert.ok(h.al.grantFor({ ticket: g.ticket, wallet: A, blockTime: h.now / 1000 }));
  h.lists.replace({ version: 1, lists: [{ ...doc, code: 'NEWCODE' }] }); h.al.syncLists();
  assert.equal(h.al.grantFor({ ticket: g.ticket, wallet: A, blockTime: h.now / 1000 }), null, 'old code: public price');
});

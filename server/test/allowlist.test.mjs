// Allowlist engine with mocks: lists validation, signatures (EOA + mocked ERC-1271), nonces, limits per wallet and
// per NFT, grants and their price, free claims, restart, concurrency, fail-closed holdings.
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
import { createAllowlist, unitRef, GRANT_TTL, GRANT_GRACE, NONCE_TTL } from '../src/allowlist.mjs';
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

function harness({ lists: docLists, solHold = {}, ethHold = {}, verifyEth, state = {}, ethEnabled = true, failSol = false, open = true } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sh-allow-'));
  fs.writeFileSync(path.join(dir, 'seed.json'), JSON.stringify({ lists: docLists }));
  const lists = openLists({ dataDir: dir, seedFile: path.join(dir, 'seed.json'), maxPriceLamports: PRICE });
  let clock = 1_800_000_000_000;
  const pieces = [], payments = [], events = [];
  let saves = 0, slotDelay = 0;
  const holdings = {
    solana: async (owner) => { if (failSol) throw new Error('DAS down'); await new Promise(r => setTimeout(r, 5)); return solHold[owner] || []; },
    ethereum: async (owner, list) => { await new Promise(r => setTimeout(r, 5)); return (ethHold[owner] || {})[list.contract] || []; },
  };
  const al = createAllowlist({
    state, save: () => { saves++; }, event: (e) => events.push(e), payment: (p) => payments.push(p), lists, holdings, ethEnabled, domain: 'www.gameboylabs.xyz',
    verifyEth: verifyEth || (async () => true), maxSupply: 2000, minted: () => pieces.length, mintOpen: () => open ? { open: true } : { open: false, reason: 'closed' },
    getSlot: async () => { await new Promise(r => setTimeout(r, slotDelay)); return 1000; }, now: () => clock,
    createClaimPiece: (c) => { pieces.push(c); return pieces.length; },
  });
  return { al, state, pieces, payments, events, lists, advance: (ms) => { clock += ms; }, get saves() { return saves; }, setSlotDelay: (d) => { slotDelay = d; }, get now() { return clock; } };
}
const offerOf = (r, id) => r.offers.find(o => o.list === id);

test('lists.json validation refuses bad files and normalises good ones', () => {
  const w = solKey().publicKey.toBase58();
  assert.throws(() => validateLists({ lists: [{ id: 'x', name: 'X', chain: 'solana', type: 'wallets', wallets: ['notanaddress'], priceSol: 0, limit: 1, per: 'wallet' }] }), /not Solana addresses/);
  assert.throws(() => validateLists({ lists: [{ id: 'x', name: 'X', chain: 'solana', type: 'wallets', wallets: [w], priceSol: 0.06, limit: 1, per: 'wallet' }] }, { maxPriceLamports: PRICE }), /above the public price/);
  assert.throws(() => validateLists({ lists: [{ id: 'x', name: 'X', chain: 'solana', type: 'wallets', wallets: [w], priceSol: 0, limit: 1, per: 'nft' }] }), /counts per wallet/);
  assert.throws(() => validateLists({ lists: [{ id: 'x', name: 'X', chain: 'ethereum', type: 'collection', contract: CONTRACT, priceSol: 0, limit: 1, per: 'nft' }] }), /standard/);
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
  const a = solKey().publicKey.toBase58(), b = solKey().publicKey.toBase58();
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
  assert.equal(offerOf(r, 'mad').remaining, 1);
  await assert.rejects(h.al.ethLink({ sol: a, eth, signature: await acct.signMessage({ message: c4.message }), nonce: c4.nonce }), /already used/, 'replay');
  // only wallet a sees it
  assert.equal((await h.al.offers(b)).offers.length, 0);
  const unit = offerOf(r, 'mad').units[0].unit;
  await assert.rejects(h.al.claimFree({ wallet: b, list: 'mad', unit }), /not eligible/);
  const ok = await h.al.claimFree({ wallet: a, list: 'mad', unit });
  assert.equal(ok.n, 1);
  assert.equal(h.pieces[0].wallet, a);
  // the eligibility answer reveals neither the ETH address nor the token
  assert.ok(!JSON.stringify(await h.al.offers(a)).toLowerCase().includes(eth.slice(2).toLowerCase()));
});

test('per wallet vs per NFT: an NFT passed to another wallet cannot claim again (per nft), a wallet keeps its own count (per wallet)', async () => {
  const a = solKey(), b = solKey(), A = a.publicKey.toBase58(), B = b.publicKey.toBase58();
  const asset = Keypair.generate().publicKey.toBase58();
  const solHold = { [A]: [asset] };
  const h = harness({ solHold, lists: [
    { id: 'pernft', name: 'Per NFT', chain: 'solana', type: 'collection', collection: COLL, priceSol: 0, limit: 1, per: 'nft' },
    { id: 'perwal', name: 'Per wallet', chain: 'solana', type: 'collection', collection: COLL, priceSol: 0, limit: 2, per: 'wallet' },
  ] });
  const claim = async (kp, list, unit) => { const c = h.al.claimChallenge(kp.publicKey.toBase58(), list); return h.al.claimFree({ wallet: kp.publicKey.toBase58(), list, unit, nonce: c.nonce, signature: signSol(kp, c.message) }); };
  let o = await h.al.offers(A);
  assert.equal(offerOf(o, 'pernft').remaining, 1); assert.equal(offerOf(o, 'perwal').remaining, 2);
  assert.equal(offerOf(o, 'pernft').units[0].unit, unitRef(asset));
  await claim(a, 'pernft', unitRef(asset));
  await assert.rejects(claim(a, 'pernft', unitRef(asset)), /used up/);
  await claim(a, 'perwal', unitRef(A)); await claim(a, 'perwal', unitRef(A));
  await assert.rejects(claim(a, 'perwal', unitRef(A)), /used up/);
  // the NFT moves to B
  delete solHold[A]; solHold[B] = [asset];
  o = await h.al.offers(B, { fresh: true });
  assert.equal(offerOf(o, 'pernft').remaining, 0, 'per nft: the token is spent');
  await assert.rejects(claim(b, 'pernft', unitRef(asset)), /used up/);
  assert.equal(offerOf(o, 'perwal').remaining, 2, 'per wallet: a new wallet has its own count');
  // signature checks for free Solana claims
  const c = h.al.claimChallenge(B, 'perwal');
  await assert.rejects(h.al.claimFree({ wallet: B, list: 'perwal', unit: unitRef(B), nonce: c.nonce, signature: signSol(a, c.message) }), /did not check out/);
  await assert.rejects(h.al.claimFree({ wallet: B, list: 'perwal', unit: unitRef(B), nonce: c.nonce, signature: signSol(b, c.message) }), /already used/, 'nonce burnt by the failed try');
  await assert.rejects(h.al.claimFree({ wallet: B, list: 'perwal', unit: unitRef(B) }), /expired or was already used/, 'no signature at all');
  assert.equal(h.pieces.length, 3);
  assert.equal(h.payments.filter(p => p.verdict === 'claim').length, 3);
});

test('ERC-1155 per nft: units per token id per holder, times the balance', async () => {
  const acct = privateKeyToAccount(generatePrivateKey()), eth = acct.address.toLowerCase(), A = solKey().publicKey.toBase58();
  const h = harness({ lists: [{ id: 'pass', name: 'Pass', chain: 'ethereum', type: 'collection', contract: C1155, standard: 'erc1155', priceSol: 0, limit: 1, per: 'nft' }],
    ethHold: { [eth]: { [C1155]: [{ tokenId: '1', balance: 3 }] } } });
  h.state.allowlist.links[eth] = { sol: A, at: 1 };
  const o = await h.al.offers(A);
  assert.equal(offerOf(o, 'pass').remaining, 3);
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
  const A = solKey().publicKey.toBase58(), B = solKey().publicKey.toBase58();
  const state = {};
  const doc = [{ id: 'disc', name: 'Discount', chain: 'solana', type: 'wallets', wallets: [A], priceSol: 0.02, limit: 1, per: 'wallet' }];
  let h = harness({ state, lists: doc });
  const u = unitRef(A);
  await assert.rejects(h.al.reserve({ wallet: B, list: 'disc', unit: u }), /not eligible/);
  const g = await h.al.reserve({ wallet: A, list: 'disc', unit: u });
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
  const g2 = await h.al.reserve({ wallet: A, list: 'disc', unit: u });
  const at = h.al.grantFor({ ticket: g2.ticket, wallet: A, blockTime: h.now / 1000 });
  h.al.settle(at, { verdict: 'ok', signature: 'sig2', n: 1 });
  assert.equal(state.allowlist.usage.disc[A], 1);
  assert.equal(h.al.grantFor({ ticket: g2.ticket, wallet: A, blockTime: h.now / 1000 }), null, 'a grant pays once');
  // restart keeps the usage
  h = harness({ state, lists: doc });
  assert.equal((await h.al.offers(A)).offers[0].remaining, 0);
  await assert.rejects(h.al.reserve({ wallet: A, list: 'disc', unit: u }), /used up/);
});

test('grants expire: a payment after expiry pays the public price; the unit is released after the grace period', async () => {
  const A = solKey().publicKey.toBase58();
  const h = harness({ lists: [{ id: 'disc', name: 'Discount', chain: 'solana', type: 'wallets', wallets: [A], priceSol: 0.02, limit: 1, per: 'wallet' }] });
  const g = await h.al.reserve({ wallet: A, list: 'disc', unit: unitRef(A) });
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

test('holdings errors fail closed: no offer, no claim', async () => {
  const a = solKey(), A = a.publicKey.toBase58();
  const h = harness({ failSol: true, lists: [{ id: 'hold', name: 'Holders', chain: 'solana', type: 'collection', collection: COLL, priceSol: 0, limit: 1, per: 'wallet' }] });
  const o = await h.al.offers(A);
  assert.equal(o.offers.length, 0); assert.equal(o.unavailable[0].list, 'hold');
  const c = h.al.claimChallenge(A, 'hold');
  await assert.rejects(h.al.claimFree({ wallet: A, list: 'hold', unit: unitRef(A), nonce: c.nonce, signature: signSol(a, c.message) }), /Could not check/);
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

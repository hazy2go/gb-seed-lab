// Devnet experiment: can a hot key mint into a collection whose update authority is a separate cold key, and what
// can that hot key still change? Tries both ways Core lets the cold key delegate (UpdateDelegate plugin authority,
// or additionalDelegates), mints with the hot key, tries metadata updates with each key, then removes the delegate
// and tries minting again. Proofs are computed locally (tiny tree, we know every leaf), so no DAS RPC is needed.
// Usage: node scripts/authority-test.mjs   (devnet only; spends ~0.1 devnet SOL from the hot key)
import { config } from '../src/config.mjs';
import { getUmi, authority } from '../src/solana.mjs';
import { generateSigner, publicKey, some, createSignerFromKeypair, sol, transactionBuilder } from '@metaplex-foundation/umi';
import { transferSol } from '@metaplex-foundation/mpl-toolbox';
import { createTreeV2, mintV2, updateMetadataV2, hashLeafV2, getMerkleRoot, getMerkleProofAtIndex } from '@metaplex-foundation/mpl-bubblegum';
import { createCollection, removeCollectionPlugin } from '@metaplex-foundation/mpl-core';

if (config.network !== 'devnet') throw new Error('devnet only');
const u = getUmi();
const hot = u.identity;
const cold = createSignerFromKeypair(u, u.eddsa.generateKeypair());
console.log('hot ', hot.publicKey.toString(), '\ncold', cold.publicKey.toString());
await transferSol(u, { destination: cold.publicKey, amount: sol(0.05) }).sendAndConfirm(u);

const DEPTH = 3;
const tree = generateSigner(u);
await (await createTreeV2(u, { merkleTree: tree, maxDepth: DEPTH, maxBufferSize: 8, public: false })).sendAndConfirm(u);
const leaves = Array.from({ length: 2 ** DEPTH }, () => publicKey(new Uint8Array(32)));
const owner = publicKey(authority.publicKey.toBase58());
let next = 0;

async function tryIt(label, fn) {
  await new Promise(r => setTimeout(r, 3000));   // the public devnet RPC rate-limits hard
  try { await fn(); console.log('OK  ', label); return true; }
  catch (e) {
    const logs = (e.logs || e.cause?.logs || []).filter(l => /Error|error|failed|Mismatch/.test(l)).slice(0, 4);
    console.log('FAIL', label, '-', (e.message || '').split('\n')[0].slice(0, 120), logs.length ? '\n     ' + logs.join('\n     ') : '');
    return false;
  }
}
const meta = (coll, uri) => ({ name: 'test', symbol: 'SLOWHZN', uri, sellerFeeBasisPoints: 0, collection: some(coll), creators: [] });

async function mint(coll, signer) {
  const idx = next;
  const m = meta(coll, 'https://example.com/a.json');
  await mintV2(u, { leafOwner: owner, merkleTree: tree.publicKey, coreCollection: coll, collectionAuthority: signer, metadata: m }).sendAndConfirm(u);
  leaves[idx] = publicKey(hashLeafV2(u, { merkleTree: tree.publicKey, owner, leafIndex: idx, metadata: m }));
  next++;
  return { idx, m };
}
async function update(coll, leaf, signer, uri) {
  await updateMetadataV2(u, {
    authority: signer, leafOwner: owner, merkleTree: tree.publicKey, coreCollection: coll,
    root: getMerkleRoot(leaves, DEPTH), nonce: leaf.idx, index: leaf.idx, currentMetadata: leaf.m,
    proof: getMerkleProofAtIndex(leaves, DEPTH, leaf.idx), updateArgs: { uri },
  }).sendAndConfirm(u);
  leaf.m = { ...leaf.m, uri };
  leaves[leaf.idx] = publicKey(hashLeafV2(u, { merkleTree: tree.publicKey, owner, leafIndex: leaf.idx, metadata: leaf.m }));
}

const variants = {
  'plugin authority': { type: 'UpdateDelegate', authority: { type: 'Address', address: hot.publicKey }, additionalDelegates: [] },
  'additionalDelegates': { type: 'UpdateDelegate', additionalDelegates: [hot.publicKey] },
};
for (const [name, plugin] of Object.entries(variants).slice(0, Number(process.env.ONLY || 2))) {
  console.log(`\n== cold update authority, hot as UpdateDelegate (${name})`);
  const coll = generateSigner(u);
  await createCollection(u, { collection: coll, updateAuthority: cold.publicKey, name: 'auth test', uri: 'https://example.com/c.json', plugins: [{ type: 'BubblegumV2' }, plugin] }).sendAndConfirm(u);
  let leaf = null;
  await tryIt('hot mints', async () => { leaf = await mint(coll.publicKey, hot); });
  if (leaf) {
    await tryIt('hot updates metadata', () => update(coll.publicKey, leaf, hot, 'https://example.com/hot.json'));
    await tryIt('cold updates metadata', () => update(coll.publicKey, leaf, cold, 'https://example.com/cold.json'));
  }
  await tryIt('cold removes the delegate', () => removeCollectionPlugin(u, { collection: coll.publicKey, authority: cold, plugin: { type: 'UpdateDelegate' } }).sendAndConfirm(u));
  await tryIt('hot mints after removal (should fail)', async () => { await mint(coll.publicKey, hot); });
}

console.log('\n== control: cold update authority, no delegate');
const coll = generateSigner(u);
await createCollection(u, { collection: coll, updateAuthority: cold.publicKey, name: 'auth test', uri: 'https://example.com/c.json', plugins: [{ type: 'BubblegumV2' }] }).sendAndConfirm(u);
await tryIt('hot mints (should fail)', async () => { await mint(coll.publicKey, hot); });
let leaf = null;
await tryIt('cold mints', async () => { leaf = await mint(coll.publicKey, cold); });
if (leaf) await tryIt('hot updates metadata (should fail)', () => update(coll.publicKey, leaf, hot, 'https://example.com/hot.json'));
console.log('\ntree', tree.publicKey.toString());

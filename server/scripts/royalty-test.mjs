// Devnet check of royalties: collection with a cold authority + hot UpdateDelegate (as on mainnet), the hot key adds
// the Core Royalties plugin, one piece minted with leaf royalty, then DAS shows both.
//   NETWORK=devnet RPC_URL=<devnet DAS RPC> KEY_FILE=/tmp/devkey.json node scripts/royalty-test.mjs
import { Keypair } from '@solana/web3.js';
import { generateSigner, publicKey } from '@metaplex-foundation/umi';
import { addCollectionPlugin, fetchCollection } from '@metaplex-foundation/mpl-core';
import { config } from '../src/config.mjs';
import { getUmi, setupCollection, prepareMint, sendMint, assetIdOf, royaltyReceiver } from '../src/solana.mjs';

if (config.network !== 'devnet') throw new Error('devnet only');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const { tree, collection } = await setupCollection({ uri: 'https://example.com/c.json', coldAuthority: Keypair.generate().publicKey.toBase58() });
config.tree = tree; config.collection = collection;
const u = getUmi();
await addCollectionPlugin(u, { collection: publicKey(collection), plugin: { type: 'Royalties', basisPoints: config.royaltyBps, creators: [{ address: publicKey(royaltyReceiver().toBase58()), percentage: 100 }], ruleSet: { type: 'None' } } }).sendAndConfirm(u);
const c = await fetchCollection(u, publicKey(collection));
console.log('collection', collection, 'royalties plugin:', c.royalties?.basisPoints, 'bps to', c.royalties?.creators.map(x => x.address.toString()));
const p = await prepareMint({ owner: generateSigner(u).publicKey.toString(), name: 'Royalty test #1', uri: 'https://example.com/1.json' });
await sendMint(p);
const id = await assetIdOf(p.signature);
console.log('minted', id);
for (let i = 0; i < 30; i++) {
  const r = await fetch(config.rpc, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getAsset', params: { id } }) }).then(r => r.json());
  if (r.result) { console.log('DAS royalty', JSON.stringify(r.result.royalty), 'creators', JSON.stringify(r.result.creators)); process.exit(0); }
  await sleep(3000);
}
throw new Error('DAS never returned the asset');

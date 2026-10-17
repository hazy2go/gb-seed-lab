// Adds the Core Royalties plugin to the collection (ROYALTY_BPS to ROYALTY_ADDRESS, default the treasury), signed by
// the hot key as the collection's UpdateDelegate. Dry run by default; CONFIRM=yes sends (costs a few thousand
// lamports of rent + fee from the hot key). Pieces carry the same royalty in their own metadata (solana.mjs).
//   node scripts/set-royalties.mjs            # shows what it would set
//   CONFIRM=yes node scripts/set-royalties.mjs
import { publicKey } from '@metaplex-foundation/umi';
import { addCollectionPlugin, updateCollectionPlugin, fetchCollection } from '@metaplex-foundation/mpl-core';
import { config } from '../src/config.mjs';
import { getUmi, checkNetwork, royaltyReceiver } from '../src/solana.mjs';

if (!config.collection) throw new Error('COLLECTION is not set');
await checkNetwork();
const u = getUmi();
const coll = await fetchCollection(u, publicKey(config.collection));
const plugin = { type: 'Royalties', basisPoints: config.royaltyBps, creators: [{ address: publicKey(royaltyReceiver().toBase58()), percentage: 100 }], ruleSet: { type: 'None' } };
console.log(`${config.network} collection ${config.collection}\nnow: ${coll.royalties ? `${coll.royalties.basisPoints} bps to ${coll.royalties.creators.map(c => c.address).join(', ')}` : 'no Royalties plugin'}\nset: ${config.royaltyBps} bps to ${royaltyReceiver().toBase58()}`);
if (process.env.CONFIRM !== 'yes') { console.log('dry run. CONFIRM=yes to send.'); process.exit(0); }
const b = coll.royalties ? updateCollectionPlugin(u, { collection: coll.publicKey, plugin }) : addCollectionPlugin(u, { collection: coll.publicKey, plugin });
const r = await b.sendAndConfirm(u);
const after = await fetchCollection(u, publicKey(config.collection));
console.log('sent', (await import('@metaplex-foundation/umi/serializers')).base58.deserialize(r.signature)[0]);
console.log('after:', after.royalties ? `${after.royalties.basisPoints} bps to ${after.royalties.creators.map(c => `${c.address} ${c.percentage}%`).join(', ')}` : 'no Royalties plugin');

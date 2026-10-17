// Builds an unsigned transaction for Hazy's cold wallet (the collection's update authority) to sign in its own wallet
// app via web/sign.html. The cold key never touches this machine. Prints base64; paste it into the sign page.
//
//   node scripts/cold-tx.mjs remove-delegate          # after the mint: the hot key can no longer mint or edit
//   node scripts/cold-tx.mjs add-delegate             # give the hot key the UpdateDelegate role back (e.g. reopen)
//   node scripts/cold-tx.mjs collection-uri <uri>     # point the collection at new collection.json
//   node scripts/cold-tx.mjs piece-uri <n> <uri>      # point piece n at new metadata (needs a DAS RPC for the proof)
//   node scripts/cold-tx.mjs lock-piece <n>           # make piece n immutable for good (cannot be undone)
import { createNoopSigner, publicKey } from '@metaplex-foundation/umi';
import { removeCollectionPlugin, addCollectionPlugin, updateCollection, fetchCollection } from '@metaplex-foundation/mpl-core';
import { updateMetadataV2, getAssetWithProof } from '@metaplex-foundation/mpl-bubblegum';
import { dasApi } from '@metaplex-foundation/digital-asset-standard-api';
import { base64 } from '@metaplex-foundation/umi/serializers';
import { config } from '../src/config.mjs';
import { getUmi, authority, checkNetwork } from '../src/solana.mjs';
import { openStore } from '../src/store.mjs';
import { GENESIS } from '../src/config.mjs';

const [cmd, a1, a2] = process.argv.slice(2);
if (!config.collection) throw new Error('COLLECTION is not set');
await checkNetwork();
const u = getUmi().use(dasApi());
const coll = await fetchCollection(u, publicKey(config.collection));
const cold = createNoopSigner(coll.updateAuthority);
if (coll.updateAuthority.toString() === authority.publicKey.toBase58()) throw new Error('this collection\'s update authority is the hot key itself; no cold wallet to sign');
const coll_ = publicKey(config.collection);

let builder;
if (cmd === 'remove-delegate') builder = removeCollectionPlugin(u, { collection: coll_, authority: cold, payer: cold, plugin: { type: 'UpdateDelegate' } });
else if (cmd === 'add-delegate') builder = addCollectionPlugin(u, { collection: coll_, authority: cold, payer: cold, plugin: { type: 'UpdateDelegate', authority: { type: 'Address', address: u.identity.publicKey }, additionalDelegates: [] } });
else if (cmd === 'collection-uri' && a1) builder = updateCollection(u, { collection: coll_, authority: cold, payer: cold, uri: a1 });
else if ((cmd === 'piece-uri' && a1 && a2) || (cmd === 'lock-piece' && a1)) {
  const store = openStore(config.dataDir, { network: config.network, genesis: GENESIS[config.network], treasury: config.treasury || authority.publicKey.toBase58(), collection: config.collection });
  const p = store.state.pieces.find(x => x.n === +a1);
  if (!p?.mint?.assetId) throw new Error(`piece ${a1} has no minted asset id`);
  const asset = await getAssetWithProof(u, publicKey(p.mint.assetId), { truncateCanopy: true });   // needs a DAS-capable RPC_URL
  builder = updateMetadataV2(u, {
    ...asset, leafOwner: asset.leafOwner, authority: cold, payer: cold, coreCollection: coll_,
    currentMetadata: asset.metadata, updateArgs: cmd === 'lock-piece' ? { isMutable: false } : { uri: a2 },
  });
} else { console.log('usage: see the top of this file'); process.exit(1); }

const bh = await u.rpc.getLatestBlockhash({ commitment: 'confirmed' });
const tx = builder.setFeePayer(cold).setBlockhash(bh).build(u);
console.log(`cold wallet ${coll.updateAuthority} must sign (${cmd}). Valid ~60 s. Paste into web/sign.html:\n`);
console.log(base64.deserialize(u.transactions.serialize(tx))[0]);

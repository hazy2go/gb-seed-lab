// One-time collection setup for any network (mainnet included): cover image and collection.json to Arweave, then the
// Merkle tree and the Core collection, with Hazy's cold wallet as the collection's update authority and this server's
// hot key as its UpdateDelegate (see docs/SERVER-SETUP.md, "Keys").
//
//   COLD_AUTHORITY=<cold wallet address> COVER_SEED=<hex seed> node scripts/mainnet-setup.mjs           # dry run: prints costs
//   COLD_AUTHORITY=... COVER_SEED=... CONFIRM=yes node scripts/mainnet-setup.mjs                         # spends SOL
//
// Spends real SOL on mainnet (tree rent + fees, paid by the hot key). Only run it when Hazy said go.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { getMerkleTreeSize } from '@metaplex-foundation/mpl-account-compression';
import { config, checkConfig } from '../src/config.mjs';
import { connection, authority, checkNetwork, setupCollection } from '../src/solana.mjs';
import { lab, png } from '../src/reference.mjs';
import { storeFile, storeJson } from '../src/storage.mjs';

const cold = process.env.COLD_AUTHORITY || '';
const coverSeed = parseInt(process.env.COVER_SEED || '', 16);
if (!cold) throw new Error('COLD_AUTHORITY (Hazy\'s separate cold wallet address) is required');
new PublicKey(cold);   // throws on a bad address
if (cold === authority.publicKey.toBase58()) throw new Error('the cold authority must not be the hot key');
if (cold === config.treasury) throw new Error('the cold authority must be a separate wallet, not the treasury (Hazy, 2026-10-17)');
if (!(coverSeed >= 0)) throw new Error('COVER_SEED (hex) is required: the piece shown as the collection image');
if (config.tree || config.collection) throw new Error('MERKLE_TREE / COLLECTION already set in .env; refusing to make a second collection');
config.siteUrl ||= config.publicUrl;
await checkNetwork();

// depth 14 / buffer 64 / canopy 8 (as in setupCollection): 16384 leaves
const TREE_BYTES = getMerkleTreeSize(14, 64, 8);
const rent = await connection.getMinimumBalanceForRentExemption(TREE_BYTES);
const bal = await connection.getBalance(authority.publicKey);
console.log(`network ${config.network}\nhot key ${authority.publicKey.toBase58()} balance ${(bal / LAMPORTS_PER_SOL).toFixed(4)} SOL`);
console.log(`cold authority ${cold}\ntree rent ${(rent / LAMPORTS_PER_SOL).toFixed(4)} SOL + collection ~0.003 SOL + fees`);
console.log(`cover seed ${coverSeed.toString(16).padStart(8, '0')}, storage ${config.storage}`);
if (process.env.CONFIRM !== 'yes') { console.log('\ndry run. Set CONFIRM=yes to create the collection.'); process.exit(0); }
checkConfig();

const ref = lab.draw(coverSeed);
const coverFile = path.join(os.tmpdir(), 'slowhorizons-cover.png');
fs.writeFileSync(coverFile, png(ref.px, ref.colors, 6));
const image = config.storage === 'arweave' ? await storeFile(coverFile, 'image/png') : `${config.publicUrl}/cover.png`;
const collectionJson = {
  name: 'Slow Horizons', symbol: 'SLOWHZN',
  description: 'Landscapes drawn live by a real Game Boy, one per payment. Every piece records its seed, the ROM hash and the console\'s heartbeat.',
  image, external_url: config.siteUrl, properties: { category: 'image', files: [{ uri: image, type: 'image/png' }] },
};
const uri = config.storage === 'arweave' ? await storeJson(collectionJson) : `${config.publicUrl}/collection.json`;
console.log('collection.json', uri);
const { tree, collection } = await setupCollection({ name: 'Slow Horizons', uri, coldAuthority: cold });
console.log(`\nput these in server/.env:\nMERKLE_TREE=${tree}\nCOLLECTION=${collection}\nCOLLECTION_URI=${uri}`);

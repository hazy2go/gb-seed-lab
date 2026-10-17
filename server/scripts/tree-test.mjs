// Devnet check of the production tree shape (TREE in config.mjs): create tree + collection (cold authority + hot
// UpdateDelegate, as on mainnet), mint one cNFT, fetch it with its proof from a DAS RPC and transfer it.
//   NETWORK=devnet RPC_URL=<devnet DAS RPC> KEY_FILE=/tmp/devkey.json node scripts/tree-test.mjs
import { Keypair, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { generateSigner, publicKey, createSignerFromKeypair } from '@metaplex-foundation/umi';
import { transferV2, getAssetWithProof } from '@metaplex-foundation/mpl-bubblegum';
import { config, TREE } from '../src/config.mjs';
import { connection, authority, getUmi, setupCollection, prepareMint, sendMint, assetIdOf } from '../src/solana.mjs';

if (config.network !== 'devnet') throw new Error('devnet only');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let bal = await connection.getBalance(authority.publicKey);
console.log('hot key', authority.publicKey.toBase58(), bal / LAMPORTS_PER_SOL, 'SOL');
if (bal < 0.3 * LAMPORTS_PER_SOL) throw new Error('fund the devnet hot key first (faucet.solana.com)');
const cold = Keypair.generate();
const { tree, collection } = await setupCollection({ uri: 'https://example.com/c.json', coldAuthority: cold.publicKey.toBase58() });
console.log('tree', tree, TREE, '\ncollection', collection);
config.tree = tree; config.collection = collection;
const u = getUmi();
const owner = generateSigner(u);
const p = await prepareMint({ owner: owner.publicKey.toString(), name: 'Tree test #1', uri: 'https://example.com/1.json' });
await sendMint(p);
const id = await assetIdOf(p.signature);
console.log('minted', id);
let a;
for (let i = 0; i < 30 && !a; i++) { try { a = await getAssetWithProof(u, publicKey(id), { truncateCanopy: true }); } catch { await sleep(3000); } }
if (!a) throw new Error('DAS never returned the asset');
console.log('proof nodes after canopy', a.proof.length, '(expect', TREE.maxDepth - TREE.canopyDepth + ')');
const to = generateSigner(u);
await transferV2(u, { ...a, authority: owner, newLeafOwner: to.publicKey, coreCollection: publicKey(collection) }).sendAndConfirm(u);
for (let i = 0; i < 20; i++) {
  const now = await getAssetWithProof(u, publicKey(id), { truncateCanopy: true }).catch(() => null);
  if (now && now.leafOwner.toString() === to.publicKey.toString()) { console.log('transfer OK, new owner', to.publicKey.toString()); process.exit(0); }
  await sleep(3000);
}
throw new Error('transfer not seen by DAS');

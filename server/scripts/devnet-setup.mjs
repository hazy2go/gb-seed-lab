// One-time devnet setup: test SOL for the authority (airdrop, free), Merkle tree, Core collection.
// Prints the env lines to put in server/.env. Refuses to run on anything but devnet.
import { config } from '../src/config.mjs';
import { connection, authority, setupCollection } from '../src/solana.mjs';
import { LAMPORTS_PER_SOL } from '@solana/web3.js';

if (config.network !== 'devnet') throw new Error('devnet only');
let bal = await connection.getBalance(authority.publicKey);
console.log('authority', authority.publicKey.toBase58(), bal / LAMPORTS_PER_SOL, 'SOL (devnet)');
if (bal < 1.5 * LAMPORTS_PER_SOL) {
  try {
    const sig = await connection.requestAirdrop(authority.publicKey, 2 * LAMPORTS_PER_SOL);
    await connection.confirmTransaction(sig, 'confirmed');
    bal = await connection.getBalance(authority.publicKey);
    console.log('airdrop ok, balance', bal / LAMPORTS_PER_SOL);
  } catch (e) {
    console.log('airdrop failed (devnet faucet is rate limited):', e.message.split('\n')[0]);
    console.log('fund it by hand at https://faucet.solana.com with', authority.publicKey.toBase58());
    process.exit(1);
  }
}
const uri = `${config.publicUrl}/collection.json`;
const { tree, collection } = await setupCollection({ name: 'Seed Lab', uri });
console.log(`MERKLE_TREE=${tree}\nCOLLECTION=${collection}`);

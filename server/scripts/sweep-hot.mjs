// After the mint (Hazy 2026-10-26): send everything left on the hot minting key to the treasury, minus the fee.
// Reads the key like the server does; never prints it.  node scripts/sweep-hot.mjs [CONFIRM=yes to send]
import { SystemProgram, Transaction, PublicKey, sendAndConfirmTransaction } from '@solana/web3.js';
import { connection, authority, treasury, checkNetwork } from '../src/solana.mjs';
await checkNetwork();
const bal = await connection.getBalance(authority.publicKey, 'confirmed'), fee = 5000;
const to = treasury instanceof PublicKey ? treasury : new PublicKey(treasury);
console.log('hot', authority.publicKey.toBase58(), (bal / 1e9).toFixed(9), 'SOL ->', to.toBase58(), ((bal - fee) / 1e9).toFixed(9));
if (process.env.CONFIRM !== 'yes' || bal <= fee) process.exit(0);
const tx = new Transaction().add(SystemProgram.transfer({ fromPubkey: authority.publicKey, toPubkey: to, lamports: bal - fee }));
const sig = await sendAndConfirmTransaction(connection, tx, [authority], { commitment: 'confirmed' });
console.log('sent https://solscan.io/tx/' + sig, 'left', await connection.getBalance(authority.publicKey, 'confirmed'));

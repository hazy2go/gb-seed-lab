// Simulate an unsigned cold-wallet transaction (base64 from cold-tx.mjs) against the live chain: no signature checks,
// nothing sent. Proves the instruction works on the real accounts before the cold wallet signs it.
//   node scripts/simulate-tx.mjs <base64>
import { VersionedTransaction } from '@solana/web3.js';
import { connection } from '../src/solana.mjs';
const tx = VersionedTransaction.deserialize(Buffer.from(process.argv[2], 'base64'));
const r = await connection.simulateTransaction(tx, { sigVerify: false, replaceRecentBlockhash: true, commitment: 'confirmed' });
console.log(r.value.err ? 'FAILED ' + JSON.stringify(r.value.err) : 'OK', 'units', r.value.unitsConsumed);
for (const l of (r.value.logs || []).slice(-8)) console.log(' ', l);
process.exit(r.value.err ? 3 : 0);

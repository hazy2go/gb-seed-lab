// Retries the devnet faucet every 10 minutes (max 12 tries); when funded, creates the tree and collection
// and writes them to server/.env. Devnet only; test SOL has no value.
import fs from 'node:fs';
import path from 'node:path';
import { config, SERVER_DIR } from '../src/config.mjs';
import { connection, authority, setupCollection } from '../src/solana.mjs';

if (config.network !== 'devnet') throw new Error('devnet only');
for (let i = 0; i < 12; i++) {
  let bal = await connection.getBalance(authority.publicKey);
  if (bal < 0.5e9) {
    try { const s = await connection.requestAirdrop(authority.publicKey, 1e9); await connection.confirmTransaction(s, 'confirmed'); } catch (e) { console.log(new Date().toISOString(), 'airdrop refused:', e.message.slice(0, 60)); }
    bal = await connection.getBalance(authority.publicKey);
  }
  if (bal >= 0.5e9) {
    console.log('funded:', bal / 1e9, 'SOL');
    const { tree, collection } = await setupCollection({ name: 'Seed Lab', uri: `${config.publicUrl}/collection.json` });
    const env = path.join(SERVER_DIR, '.env');
    fs.appendFileSync(env, `MERKLE_TREE=${tree}\nCOLLECTION=${collection}\n`);
    console.log('MERKLE_TREE=' + tree + '\nCOLLECTION=' + collection + '\nwritten to server/.env');
    process.exit(0);
  }
  await new Promise(r => setTimeout(r, 10 * 60 * 1000));
}
console.log('gave up; fund', authority.publicKey.toBase58(), 'at https://faucet.solana.com (devnet)');

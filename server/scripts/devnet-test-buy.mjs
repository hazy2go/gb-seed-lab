// Devnet end-to-end test: a throwaway buyer wallet (funded from the authority) buys one piece through the API,
// like the website does: ticket -> sign -> send -> /api/paid. Then waits for the mint.
import { Keypair, SystemProgram, Transaction, sendAndConfirmTransaction } from '@solana/web3.js';
import { config } from '../src/config.mjs';
import { connection, authority } from '../src/solana.mjs';

if (config.network !== 'devnet') throw new Error('devnet only');
const API = process.env.API || `http://localhost:${config.port}`;
const buyer = Keypair.generate();
await sendAndConfirmTransaction(connection, new Transaction().add(SystemProgram.transfer({ fromPubkey: authority.publicKey, toPubkey: buyer.publicKey, lamports: 0.1e9 })), [authority]);
console.log('buyer', buyer.publicKey.toBase58(), 'funded 0.1 devnet SOL');
const t = await (await fetch(`${API}/api/ticket`, { method: 'POST', body: JSON.stringify({ wallet: buyer.publicKey.toBase58() }) })).json();
const tx = Transaction.from(Buffer.from(t.tx, 'base64'));
tx.sign(buyer);
const signature = await connection.sendRawTransaction(tx.serialize());
console.log('paid, ticket', t.ticket, 'signature', signature);
if (!process.env.CLOSE_TAB) console.log('server:', await (await fetch(`${API}/api/paid`, { method: 'POST', body: JSON.stringify({ ticket: t.ticket, signature }) })).json());
for (let i = 0; i < 120; i++) {
  const { pieces } = await (await fetch(`${API}/api/pieces?owner=${buyer.publicKey.toBase58()}`)).json();
  const p = pieces[0];
  if (p && (p.status === 'minted' || p.status.includes('fail'))) { console.log(JSON.stringify(p, null, 1)); process.exit(p.status === 'minted' ? 0 : 1); }
  await new Promise(r => setTimeout(r, 3000));
}
console.log('timeout');

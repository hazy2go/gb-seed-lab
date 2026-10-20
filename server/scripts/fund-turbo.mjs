// Fund the Arweave upload key with Turbo credits (2026-10-20: a 1/1's hires PNG, 109 KB, passed Turbo's free limit).
//   node scripts/fund-turbo.mjs quote <lamports>      what the credits would be, nothing sent
//   node scripts/fund-turbo.mjs send <lamports>       minting wallet -> upload key (plain SOL transfer)
//   node scripts/fund-turbo.mjs topup <lamports>      upload key's SOL -> Turbo credits
//   node scripts/fund-turbo.mjs balance               upload key SOL + Turbo credits
import fs from 'node:fs';
import { Connection, Keypair, SystemProgram, Transaction, sendAndConfirmTransaction } from '@solana/web3.js';
import { TurboFactory } from '@ardrive/turbo-sdk';
import { base58 } from '@metaplex-foundation/umi/serializers';
import { config } from '../src/config.mjs';

const MAX = 100_000_000;   // never more than 0.1 SOL per run (Hazy 2026-10-20: top up 0.1 when credits run low)
const [cmd, amt] = process.argv.slice(2);
const lamports = Number(amt || 0);
if (['send', 'topup', 'quote'].includes(cmd) && !(lamports > 0 && lamports <= MAX)) throw new Error(`amount must be 1..${MAX} lamports`);
const load = (f) => Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(f, 'utf8'))));
const upload = load(new URL('../.keys/arweave.json', import.meta.url));
const conn = new Connection(config.rpc, 'confirmed');
const turbo = TurboFactory.authenticated({ privateKey: base58.deserialize(upload.secretKey)[0], token: 'solana', gatewayUrl: config.rpc });

if (cmd === 'balance') {
  console.log('upload key', upload.publicKey.toBase58(), (await conn.getBalance(upload.publicKey)) / 1e9, 'SOL');
  console.log('turbo', JSON.stringify(await turbo.getBalance()));
} else if (cmd === 'quote') {
  console.log(JSON.stringify(await turbo.getWincForToken({ tokenAmount: lamports })));
} else if (cmd === 'send') {
  const from = load(config.keyFile);
  const tx = new Transaction().add(SystemProgram.transfer({ fromPubkey: from.publicKey, toPubkey: upload.publicKey, lamports }));
  console.log('sent', await sendAndConfirmTransaction(conn, tx, [from], { commitment: 'confirmed' }), 'from', from.publicKey.toBase58());
} else if (cmd === 'topup') {
  console.log(JSON.stringify(await turbo.topUpWithTokens({ tokenAmount: lamports })));
} else throw new Error('usage: quote|send|topup <lamports> | balance');

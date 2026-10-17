// Solana side: payment transactions in, compressed NFTs (Bubblegum V2, Core collection) out.
// Devnet by default. Nothing here runs on mainnet unless NETWORK, keys and price are set on purpose (Hazy).
import fs from 'node:fs';
import path from 'node:path';
import { Connection, Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction } from '@solana/web3.js';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { keypairIdentity, generateSigner, publicKey, some } from '@metaplex-foundation/umi';
import { mplBubblegum, mintV2, createTreeV2, parseLeafFromMintV2Transaction } from '@metaplex-foundation/mpl-bubblegum';
import { mplCore, createCollection } from '@metaplex-foundation/mpl-core';
import { base58 } from '@metaplex-foundation/umi/serializers';
import { config } from './config.mjs';

export const MEMO_PROGRAM = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');
export const MEMO_PREFIX = 'slowhorizons:';

export function loadAuthority() {
  if (!fs.existsSync(config.keyFile)) {
    fs.mkdirSync(path.dirname(config.keyFile), { recursive: true, mode: 0o700 });
    fs.writeFileSync(config.keyFile, JSON.stringify(Array.from(Keypair.generate().secretKey)), { mode: 0o600 });
  }
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(config.keyFile, 'utf8'))));
}

export const authority = loadAuthority();
export const connection = new Connection(config.rpc, 'confirmed');
export const treasury = new PublicKey(config.treasury || authority.publicKey.toBase58());

let umi;
export function getUmi() {
  if (!umi) {
    umi = createUmi(config.rpc).use(mplBubblegum()).use(mplCore());
    umi.use(keypairIdentity(umi.eddsa.createKeypairFromSecretKey(authority.secretKey)));
  }
  return umi;
}

// Unsigned payment transaction for the buyer's wallet to sign and send: price to the treasury + memo with the ticket.
export async function buildPayment(wallet, ticket) {
  const payer = new PublicKey(wallet);
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
  const tx = new Transaction({ feePayer: payer, blockhash, lastValidBlockHeight });
  tx.add(SystemProgram.transfer({ fromPubkey: payer, toPubkey: treasury, lamports: config.priceLamports }));
  tx.add(new TransactionInstruction({ programId: MEMO_PROGRAM, keys: [], data: Buffer.from(MEMO_PREFIX + ticket, 'utf8') }));
  return { tx: tx.serialize({ requireAllSignatures: false, verifySignatures: false }).toString('base64'), lastValidBlockHeight };
}

// Checks a confirmed transaction: right payer, right amount to the treasury, memo with our ticket.
// Returns { ticket, wallet, lamports, slot, blockTime } or null.
export async function verifyPayment(signature) {
  const tx = await connection.getParsedTransaction(signature, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 });
  if (!tx || tx.meta?.err) return null;
  let paid = null, memo = null;
  for (const ix of tx.transaction.message.instructions) {
    if (ix.program === 'system' && ix.parsed?.type === 'transfer') {
      const i = ix.parsed.info;
      if (i.destination === treasury.toBase58() && i.lamports >= config.priceLamports) paid = { wallet: i.source, lamports: i.lamports };
    }
    if (ix.programId?.equals?.(MEMO_PROGRAM) || ix.program === 'spl-memo') {
      const text = typeof ix.parsed === 'string' ? ix.parsed : '';
      if (text.startsWith(MEMO_PREFIX)) memo = text.slice(MEMO_PREFIX.length);
    }
  }
  if (!paid || !memo) return null;
  return { ticket: memo, wallet: paid.wallet, lamports: paid.lamports, slot: tx.slot, blockTime: tx.blockTime };
}

// Recent treasury transactions that carry one of our memos (finds payments from buyers who closed the page).
export async function recentPaymentSignatures(limit = 50) {
  const sigs = await connection.getSignaturesForAddress(treasury, { limit }, 'confirmed');
  return sigs.filter(s => !s.err && s.memo && s.memo.includes(MEMO_PREFIX)).map(s => s.signature);
}

// One-time setup on devnet: Merkle tree (depth 14 = 16,384 leaves) and the Core collection with the BubblegumV2 plugin.
export async function setupCollection({ name = 'Slow Horizons', uri }) {
  const u = getUmi();
  const merkleTree = generateSigner(u);
  await (await createTreeV2(u, { merkleTree, maxDepth: 14, maxBufferSize: 64, canopyDepth: 8, public: false })).sendAndConfirm(u);
  const collection = generateSigner(u);
  await createCollection(u, { collection, name, uri, plugins: [{ type: 'BubblegumV2' }] }).sendAndConfirm(u);
  return { tree: merkleTree.publicKey.toString(), collection: collection.publicKey.toString() };
}

export async function mintPiece({ owner, name, uri }) {
  const u = getUmi();
  const { signature } = await mintV2(u, {
    leafOwner: publicKey(owner),
    merkleTree: publicKey(config.tree),
    coreCollection: publicKey(config.collection),
    collectionAuthority: u.identity,
    metadata: { name, symbol: 'SLOWHZN', uri, sellerFeeBasisPoints: 0, collection: some(publicKey(config.collection)), creators: [] },
  }).sendAndConfirm(u);
  let assetId = null;
  for (let i = 0; i < 5 && !assetId; i++) {   // the transaction can take a moment to be readable
    try { assetId = (await parseLeafFromMintV2Transaction(u, signature)).id.toString(); } catch { await new Promise(r => setTimeout(r, 2000)); }
  }
  return { signature: base58.deserialize(signature)[0], assetId };
}

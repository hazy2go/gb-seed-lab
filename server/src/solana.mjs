// Solana side: payments in, compressed NFTs (Bubblegum V2, Core collection) out.
// Safety model: buyers pay the treasury, whose key never touches this machine. The hot "authority" key here only
// pays mint fees and signs mints; keep a small balance on it. See docs/MINT.md.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { Connection, Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction } from '@solana/web3.js';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { keypairIdentity, generateSigner, publicKey, some, createNoopSigner } from '@metaplex-foundation/umi';
import { mplBubblegum, mintV2, createTreeV2, parseLeafFromMintV2Transaction, getAssetWithProof, transferV2 } from '@metaplex-foundation/mpl-bubblegum';
import { dasApi } from '@metaplex-foundation/digital-asset-standard-api';
import { toWeb3JsInstruction } from '@metaplex-foundation/umi-web3js-adapters';
import { mplCore, createCollection } from '@metaplex-foundation/mpl-core';
import { base58 } from '@metaplex-foundation/umi/serializers';
import { config, GENESIS, TREE } from './config.mjs';

export const MEMO_PROGRAM = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');
export const MEMO_PREFIX = 'slowhorizons:';
const COMPUTE_BUDGET = new PublicKey('ComputeBudget111111111111111111111111111111');
// Phantom appends Lighthouse assertion instructions while signing (docs.phantom.com/developer-powertools/lighthouse):
// they only make the transaction fail if state differs from the wallet's simulation and cannot move funds out of the
// treasury (it never signs). Mainnet 2026-10-20: every Phantom payment was refused as "unexpected instructions".
export const LIGHTHOUSE = new PublicKey('L2TExMFKdjpN9kozasaurPirfHy9P8sbXoAN1qA3S95');
const LIGHTHOUSE_MAX = 8;
const MEMO_RE = /slowhorizons:([0-9a-f]{16})/;

function loadAuthority() {
  if (!fs.existsSync(config.keyFile)) {
    if (config.network !== 'devnet') throw new Error('authority key missing');   // checkConfig also refuses this
    fs.mkdirSync(path.dirname(config.keyFile), { recursive: true, mode: 0o700 });
    fs.writeFileSync(config.keyFile, JSON.stringify(Array.from(Keypair.generate().secretKey)), { mode: 0o600 });
  }
  try { fs.chmodSync(config.keyFile, 0o600); } catch { /* not ours to fix */ }
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(config.keyFile, 'utf8'))));
}

export const authority = loadAuthority();
export const connection = new Connection(config.rpc, 'confirmed');
export const treasury = new PublicKey(config.treasury || authority.publicKey.toBase58());
if (config.network !== 'devnet' && treasury.equals(authority.publicKey)) throw new Error('the treasury must not be the hot authority key');

export async function checkNetwork() {
  const g = await connection.getGenesisHash();
  if (g !== GENESIS[config.network]) throw new Error(`RPC ${config.rpc} is on genesis ${g}, not ${config.network}`);
}

let umi;
export function getUmi() {
  if (!umi) {
    umi = createUmi(config.rpc).use(mplBubblegum()).use(mplCore());
    umi.use(keypairIdentity(umi.eddsa.createKeypairFromSecretKey(authority.secretKey)));
  }
  return umi;
}

// ---------------------------------------------------------------- payments

// Unsigned payment transaction for the buyer's wallet: exactly a transfer of the price to the treasury and our memo.
export async function buildPayment(wallet, ticket, lamports = config.priceLamports) {   // lamports: an allowlist grant's price
  const payer = new PublicKey(wallet);
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
  const tx = new Transaction({ feePayer: payer, blockhash, lastValidBlockHeight });
  tx.add(SystemProgram.transfer({ fromPubkey: payer, toPubkey: treasury, lamports }));
  tx.add(new TransactionInstruction({ programId: MEMO_PROGRAM, keys: [], data: Buffer.from(MEMO_PREFIX + ticket, 'utf8') }));
  return { tx: tx.serialize({ requireAllSignatures: false, verifySignatures: false }).toString('base64'), lastValidBlockHeight };
}

// Before relaying a signed transaction for a buyer: it must be exactly our payment (no extra instructions).
export function checkSignedPayment(raw, ticket, lamports = config.priceLamports, wallet = null) {   // wallet: an allowlist grant's, which must pay
  const tx = Transaction.from(raw);
  // Wallets may add priority-fee instructions while signing (ComputeBudget SetComputeUnitLimit / SetComputeUnitPrice,
  // paid by the buyer). Allow those, nothing else (audit 2026-10-18).
  const cb = tx.instructions.filter(i => i.programId.equals(COMPUTE_BUDGET));
  if (cb.length > 2 || cb.some(i => ![2, 3].includes(i.data[0]))) return 'unexpected compute budget instructions';
  const lh = tx.instructions.filter(i => i.programId.equals(LIGHTHOUSE));
  if (lh.length > LIGHTHOUSE_MAX) return 'too many wallet guard instructions';
  const rest = tx.instructions.filter(i => !i.programId.equals(COMPUTE_BUDGET) && !i.programId.equals(LIGHTHOUSE));
  if (rest.length !== 2) return 'unexpected instructions';
  const [t, m] = rest;
  if (!t.programId.equals(SystemProgram.programId) || t.data.readUInt32LE(0) !== 2) return 'not a transfer';
  if (!t.keys[1]?.pubkey.equals(treasury)) return 'wrong recipient';
  if (Number(t.data.readBigUInt64LE(4)) !== lamports) return 'wrong amount';
  if (!m.programId.equals(MEMO_PROGRAM) || m.data.toString('utf8') !== MEMO_PREFIX + ticket) return 'wrong memo';
  if (!tx.feePayer || !tx.feePayer.equals(t.keys[0].pubkey)) return 'fee payer is not the sender';
  if (wallet && !t.keys[0].pubkey.equals(new PublicKey(wallet))) return 'not from the wallet that reserved this price';
  return null;
}

// ---------------------------------------------------------------- holder transfers
// Wallets (Phantom: "fees can't be calculated", Tensor) could not send Bubblegum V2 pieces (mainnet 2026-10-21), so the
// page offers Send: this builds the V2 transfer for the holder's wallet to sign. No server key is involved; the holder
// signs and is the fee payer. The built instruction is kept so the relay only sends exactly it (plus wallet guards).
const BUBBLEGUM = new PublicKey('BGUMAp9Gq7iTEuizy4pqaxsTyUCBK68MDfK752saRPUY');
let dasUmi;
export async function buildTransfer(assetId, owner, to) {
  dasUmi ||= createUmi(config.rpc).use(mplBubblegum()).use(dasApi());
  const a = await getAssetWithProof(dasUmi, publicKey(assetId), { truncateCanopy: true });
  if (a.rpcAsset.grouping?.find(g => g.group_key === 'collection')?.group_value !== config.collection) throw new Error('not a piece of this collection');
  if (String(a.leafOwner) !== owner) throw new Error('this wallet does not hold the piece');
  const signer = createNoopSigner(publicKey(owner));
  const ixs = transferV2(dasUmi, { ...a, authority: signer, payer: signer, leafOwner: publicKey(owner), newLeafOwner: publicKey(to), coreCollection: publicKey(config.collection) }).getInstructions().map(toWeb3JsInstruction);
  if (ixs.length !== 1 || !ixs[0].programId.equals(BUBBLEGUM)) throw new Error('unexpected transfer instructions');
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
  const tx = new Transaction({ feePayer: new PublicKey(owner), blockhash, lastValidBlockHeight }).add(ixs[0]);
  const sim = await connection.simulateTransaction(tx);   // fails here, not in the wallet, if anything is off
  if (sim.value.err) throw new Error('the transfer does not simulate: ' + JSON.stringify(sim.value.err));
  return { tx: tx.serialize({ requireAllSignatures: false, verifySignatures: false }).toString('base64'), ix: ixs[0], lastValidBlockHeight };
}
// The signed transfer must carry exactly the instruction we built; wallets may add priority fees and Lighthouse guards.
export function checkSignedTransfer(raw, ix, owner) {
  const tx = Transaction.from(raw);
  const cb = tx.instructions.filter(i => i.programId.equals(COMPUTE_BUDGET));
  if (cb.length > 2 || cb.some(i => ![2, 3].includes(i.data[0]))) return 'unexpected compute budget instructions';
  if (tx.instructions.filter(i => i.programId.equals(LIGHTHOUSE)).length > LIGHTHOUSE_MAX) return 'too many wallet guard instructions';
  const rest = tx.instructions.filter(i => !i.programId.equals(COMPUTE_BUDGET) && !i.programId.equals(LIGHTHOUSE));
  if (rest.length !== 1) return 'unexpected instructions';
  const t = rest[0];
  if (!t.programId.equals(ix.programId) || !Buffer.from(t.data).equals(Buffer.from(ix.data)) || t.keys.length !== ix.keys.length || t.keys.some((k, i) => !k.pubkey.equals(ix.keys[i].pubkey))) return 'not the transfer we prepared';
  if (!tx.feePayer?.equals(new PublicKey(owner))) return 'fee payer is not the holder';
  return null;
}

// Program ids of a signed transaction's instructions, in order (logging a refused payment); null if unreadable.
export function signedPrograms(raw) {
  try { return Transaction.from(raw).instructions.map(i => i.programId.toBase58()); } catch { return null; }
}

// Reads a transaction and decides what it means for us. Returns null if it carries no slowhorizons memo.
// The amount is the treasury's balance change, so transfers inside other programs (smart wallets) count too.
export async function inspectPayment(signature, commitment = 'finalized') {
  const tx = await connection.getParsedTransaction(signature, { commitment, maxSupportedTransactionVersion: 0 });
  if (!tx) return { status: 'not-found' };
  const memoText = [
    ...tx.transaction.message.instructions.filter(ix => ix.program === 'spl-memo' || ix.programId?.equals?.(MEMO_PROGRAM)).map(ix => typeof ix.parsed === 'string' ? ix.parsed : ''),
    ...(tx.meta?.logMessages || []).filter(l => l.includes('Memo')),
  ].join(' ');
  const memo = memoText.match(MEMO_RE);
  if (!memo) return null;
  const keys = tx.transaction.message.accountKeys.map(k => (k.pubkey || k).toBase58());
  const ti = keys.indexOf(treasury.toBase58());
  const received = ti >= 0 && tx.meta ? tx.meta.postBalances[ti] - tx.meta.preBalances[ti] : 0;
  // who paid: the source of a direct transfer to the treasury, else the fee payer
  let from = keys[0];
  for (const ix of tx.transaction.message.instructions) {
    if (ix.program === 'system' && ix.parsed?.type === 'transfer' && ix.parsed.info.destination === treasury.toBase58()) { from = ix.parsed.info.source; break; }
  }
  return { status: tx.meta?.err ? 'failed' : 'ok', signature, ticket: memo[1], wallet: from, received, slot: tx.slot, blockTime: tx.blockTime };
}

// All treasury signatures since `until` (oldest first), paging backwards. Only those with our memo are returned.
export async function treasurySignaturesSince(until) {
  const out = [];
  let before;
  for (let page = 0; page < 50; page++) {
    const sigs = await connection.getSignaturesForAddress(treasury, { before, until, limit: 1000 }, 'finalized');
    if (!sigs.length) break;
    out.push(...sigs);
    before = sigs[sigs.length - 1].signature;
    if (sigs.length < 1000) break;
  }
  return {
    newest: out[0]?.signature || until,
    ours: out.filter(s => !s.err && s.memo && s.memo.includes(MEMO_PREFIX)).map(s => s.signature).reverse(),
  };
}

// Seed = first 4 bytes (LE) of sha256(signature || blockhash of the first block at or after slot + delay).
// The buyer cannot know that blockhash when signing, so they cannot grind for rare traits. Anyone can recompute it.
// Split in two so the pieces of one multi-piece payment (same slot) share one block lookup.
export async function seedBlock(slot) {
  const target = slot + config.seedDelaySlots;
  const height = await connection.getSlot('finalized');
  if (height < target) return null;   // not yet
  const blocks = await connection.getBlocks(target, target + 200, 'finalized');
  if (!blocks.length) return null;
  const block = await connection.getBlock(blocks[0], { commitment: 'finalized', transactionDetails: 'none', rewards: false, maxSupportedTransactionVersion: 0 });
  return { seedSlot: blocks[0], seedBlockhash: block.blockhash };
}
export const seedOf = (input, blockhash) => crypto.createHash('sha256').update(input, 'utf8').update(blockhash, 'utf8').digest().readUInt32LE(0);
export async function deriveSeed(signature, slot) {
  const b = await seedBlock(slot);
  return b && { seed: seedOf(signature, b.seedBlockhash), ...b };
}

// ---------------------------------------------------------------- minting (idempotent)

// Creator royalty on every piece (sellerFeeBasisPoints + the royalty receiver as an unverified creator taking 100%); the
// collection carries the same in its Core Royalties plugin (scripts/set-royalties.mjs).
// Plus the minting key as a 0% creator, verified at mint because it signs the mint: wallets use a verified creator as a
// trust signal, and the receiver (the cold treasury) never signs mints (Hazy 2026-10-20, from No. 5 on; simulated first).
export const royaltyReceiver = () => new PublicKey(config.royaltyAddress || config.treasury || authority.publicKey.toBase58());
export function creatorList() {
  const minter = authority.publicKey.toBase58(), receiver = royaltyReceiver().toBase58();
  if (config.royaltyBps <= 0 || receiver === minter) return [{ address: minter, verified: true, share: 100 }];
  return [{ address: receiver, verified: false, share: 100 }, { address: minter, verified: true, share: 0 }];
}
export function royaltyMeta() {
  return { sellerFeeBasisPoints: Math.max(0, config.royaltyBps), creators: creatorList().map(c => ({ ...c, address: publicKey(c.address) })) };
}
// Step 1: build and sign, return the signature and expiry so the caller can record them BEFORE sending.
export async function prepareMint({ owner, name, uri }) {
  const u = getUmi();
  const bh = await u.rpc.getLatestBlockhash({ commitment: 'confirmed' });
  const builder = mintV2(u, {
    leafOwner: publicKey(owner),
    merkleTree: publicKey(config.tree),
    coreCollection: publicKey(config.collection),
    collectionAuthority: u.identity,
    metadata: { name, symbol: 'SLOWHZN', uri, collection: some(publicKey(config.collection)), ...royaltyMeta() },
  }).setBlockhash(bh);
  const tx = await builder.buildAndSign(u);
  return { tx, signature: base58.deserialize(tx.signatures[0])[0], lastValidBlockHeight: bh.lastValidBlockHeight, blockhash: bh.blockhash };
}
// Step 2: send it and wait for confirmation.
export async function sendMint(prepared) {
  const u = getUmi();
  // Preflight at the same commitment the blockhash was fetched at: umi's connection has no default commitment, so
  // web3.js preflighted at 'finalized', where a fresh 'confirmed' blockhash does not exist yet -> every mint failed
  // with "Blockhash not found" (mainnet launch 2026-10-20).
  const sig = await u.rpc.sendTransaction(prepared.tx, { skipPreflight: false, preflightCommitment: 'confirmed', maxRetries: 5 });
  await u.rpc.confirmTransaction(sig, { strategy: { type: 'blockhash', blockhash: prepared.blockhash, lastValidBlockHeight: prepared.lastValidBlockHeight } });
}
// After a crash or timeout: did a recorded mint land? 'landed', 'failed', 'expired' (safe to rebuild) or 'pending'.
// Height is read FIRST and at finalized: once the finalized height is past lastValidBlockHeight (plus a margin for
// RPC nodes that lag), the tx can no longer land, so a status read after that is final. The old order (status, then
// height) could call a mint that landed in between 'expired' and mint it twice (audit 2026-10-18).
export async function mintStatus(signature, lastValidBlockHeight) {
  const height = await connection.getBlockHeight('finalized');
  const [st] = (await connection.getSignatureStatuses([signature], { searchTransactionHistory: true })).value;
  if (st && st.err) return 'failed';
  if (st && (st.confirmationStatus === 'confirmed' || st.confirmationStatus === 'finalized')) return 'landed';
  return height > lastValidBlockHeight + 30 ? 'expired' : 'pending';
}
export async function assetIdOf(signature) {
  const u = getUmi();
  for (let i = 0; i < 5; i++) {
    try { return (await parseLeafFromMintV2Transaction(u, base58.serialize(signature))).id.toString(); }
    catch { await new Promise(r => setTimeout(r, 2000)); }
  }
  return null;
}

export async function authorityBalance() { return connection.getBalance(authority.publicKey, 'confirmed'); }

// One-time setup: Merkle tree and the Core collection with the BubblegumV2 plugin. With `coldAuthority` (a wallet
// whose key stays offline) that wallet becomes the collection's update authority and this hot key only gets an
// UpdateDelegate, which lets it mint (and edit metadata) until the cold wallet removes it (tested on devnet,
// scripts/authority-test.mjs). The cold wallet does not need to sign here.
export async function setupCollection({ name = 'Slow Horizons', uri, coldAuthority = null }) {
  const u = getUmi();
  const merkleTree = generateSigner(u);
  await (await createTreeV2(u, { merkleTree, ...TREE, public: false })).sendAndConfirm(u);
  const collection = generateSigner(u);
  const plugins = [{ type: 'BubblegumV2' }];
  if (coldAuthority) plugins.push({ type: 'UpdateDelegate', authority: { type: 'Address', address: u.identity.publicKey }, additionalDelegates: [] });
  await createCollection(u, { collection, name, uri, plugins, ...(coldAuthority ? { updateAuthority: publicKey(coldAuthority) } : {}) }).sendAndConfirm(u);
  return { tree: merkleTree.publicKey.toString(), collection: collection.publicKey.toString() };
}

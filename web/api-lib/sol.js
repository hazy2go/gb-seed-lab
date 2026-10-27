// Shared by the api/ functions: the Slow Horizons collection, a DAS-capable RPC (RPC_URL, set in Vercel), the transfer
// builder and check ported from server/src/solana.mjs (same libraries, same rules).
import { Connection, PublicKey, Transaction } from '@solana/web3.js';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { publicKey, createNoopSigner } from '@metaplex-foundation/umi';
import { mplBubblegum, getAssetWithProof, transferV2 } from '@metaplex-foundation/mpl-bubblegum';
import { dasApi } from '@metaplex-foundation/digital-asset-standard-api';
import { toWeb3JsInstruction } from '@metaplex-foundation/umi-web3js-adapters';

export const COLLECTION = 'FwhoBPWniQQSKeDG3rNPGTmLXvVoPhPNKwV5YcTDmzRu';     // Slow Horizons (MPL Core), mainnet
const BUBBLEGUM = new PublicKey('BGUMAp9Gq7iTEuizy4pqaxsTyUCBK68MDfxqQgJDCMSa');
const COMPUTE_BUDGET = new PublicKey('ComputeBudget111111111111111111111111111111');
const LIGHTHOUSE = new PublicKey('L2TExMFKdjpN9kozasaurPirfHy9P8sbXoAN1qA3S95');
const LIGHTHOUSE_MAX = 4;
const RPC = process.env.RPC_URL;
export const configured = () => !!RPC;
export const isAddr = (s) => typeof s === 'string' && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s);
let conn, umi;
const connection = () => (conn ||= new Connection(RPC, 'confirmed'));
const das = () => (umi ||= createUmi(RPC).use(mplBubblegum()).use(dasApi()));

export async function owned(owner) {
  const ids = [];
  for (let page = 1; page <= 5; page++) {
    const r = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(15000),
      body: JSON.stringify({ jsonrpc: '2.0', id: 'own', method: 'searchAssets', params: { ownerAddress: owner, grouping: ['collection', COLLECTION], limit: 1000, page } }) }).then((x) => x.json());
    if (!r.result) throw new Error(r.error?.message || 'DAS error');
    for (const a of r.result.items || []) if (!a.burnt) ids.push(a.id);
    if ((r.result.items || []).length < 1000) break;
  }
  return ids;
}

export async function buildTransferIx(assetId, owner, to) {
  const a = await getAssetWithProof(das(), publicKey(assetId), { truncateCanopy: true });
  if (a.rpcAsset.grouping?.find((g) => g.group_key === 'collection')?.group_value !== COLLECTION) throw new Error('not a piece of this collection');
  if (String(a.leafOwner) !== owner) throw new Error('this wallet does not hold the piece');
  const signer = createNoopSigner(publicKey(owner));
  const ixs = transferV2(das(), { ...a, authority: signer, payer: signer, leafOwner: publicKey(owner), newLeafOwner: publicKey(to), coreCollection: publicKey(COLLECTION) })
    .getInstructions().map(toWeb3JsInstruction);
  if (ixs.length !== 1 || !ixs[0].programId.equals(BUBBLEGUM)) throw new Error('unexpected transfer instructions');
  return ixs[0];
}

export async function buildTransfer(assetId, owner, to) {
  const ix = await buildTransferIx(assetId, owner, to);
  const { blockhash, lastValidBlockHeight } = await connection().getLatestBlockhash('confirmed');
  const tx = new Transaction({ feePayer: new PublicKey(owner), blockhash, lastValidBlockHeight }).add(ix);
  const sim = await connection().simulateTransaction(tx);
  if (sim.value.err) throw new Error('the transfer does not simulate: ' + JSON.stringify(sim.value.err));
  return tx.serialize({ requireAllSignatures: false, verifySignatures: false }).toString('base64');
}

// The signed transaction must carry exactly the transfer instruction (wallets may add priority fees and Lighthouse guards).
export function checkSigned(raw, ix, owner) {
  const tx = Transaction.from(raw);
  const cb = tx.instructions.filter((i) => i.programId.equals(COMPUTE_BUDGET));
  if (cb.length > 2 || cb.some((i) => ![2, 3].includes(i.data[0]))) return 'unexpected compute budget instructions';
  if (tx.instructions.filter((i) => i.programId.equals(LIGHTHOUSE)).length > LIGHTHOUSE_MAX) return 'too many wallet guard instructions';
  const rest = tx.instructions.filter((i) => !i.programId.equals(COMPUTE_BUDGET) && !i.programId.equals(LIGHTHOUSE));
  if (rest.length !== 1) return 'unexpected instructions';
  const t = rest[0];
  if (!t.programId.equals(ix.programId) || !Buffer.from(t.data).equals(Buffer.from(ix.data)) || t.keys.length !== ix.keys.length || t.keys.some((k, i) => !k.pubkey.equals(ix.keys[i].pubkey))) return 'not the transfer we prepared';
  if (!tx.feePayer?.equals(new PublicKey(owner))) return 'fee payer is not the holder';
  if (!tx.signatures.find((s) => s.publicKey.equals(new PublicKey(owner)))?.signature) return 'not signed by the holder';
  return null;
}
export async function send(raw) { return connection().sendRawTransaction(raw, { skipPreflight: false, preflightCommitment: 'confirmed' }); }

export async function readJson(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  let s = ''; for await (const c of req) { s += c; if (s.length > 20000) throw new Error('too large'); }
  return JSON.parse(s || '{}');
}
export function reply(res, code, obj) { res.statusCode = code; res.setHeader('content-type', 'application/json'); res.setHeader('cache-control', 'no-store'); res.end(JSON.stringify(obj)); }

// Read-only cross-check of money against records. Safe while the server runs (reads state.json, never writes).
// Walks the treasury's finalized history back to the server's first start (state.startCursor, or SINCE=<signature>), takes every transaction carrying our
// memo, and checks each one became its pieces (one, or one complete multi-piece batch) or a refund record. Also lists stuck pieces and refunds due.
// Allowlists: free claims (pieces without a payment) must match their claim records and payments.jsonl, every
// discounted piece must match a used grant, and per-unit usage must equal claims + used grants (and stay within the
// list's limit where the limit is fixed).
// One-of-ones: replays every 1/1 decision in order (src/oneofone.mjs verify): no id assigned twice, every assignment
// (and every miss) re-derives from its seed with the published rule, MAX_SUPPLY as configured now.
//   node scripts/reconcile.mjs            exit 0 = all accounted for, 3 = something needs a look
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../src/config.mjs';
import { connection, treasury, checkNetwork, inspectPayment, MEMO_PREFIX } from '../src/solana.mjs';
import { verify as verifyOneOfOnes, title } from '../src/oneofone.mjs';

await checkNetwork();
const state = JSON.parse(fs.readFileSync(path.join(config.dataDir, 'state.json'), 'utf8'));
const used = state.usedSignatures || {};
// only payments after the server's first start belong to this collection (earlier ones: other test data)
const since = process.env.SINCE || (state.startCursor && state.startCursor !== 'none' ? state.startCursor : undefined);
const sigs = [];
let before;
for (;;) {
  const page = await connection.getSignaturesForAddress(treasury, { before, until: since, limit: 1000 }, 'finalized');
  sigs.push(...page);
  if (page.length < 1000) break;
  before = page[page.length - 1].signature;
}
const ours = sigs.filter(s => !s.err && s.memo && s.memo.includes(MEMO_PREFIX));
console.log(`${config.network} treasury ${treasury.toBase58()}: ${sigs.length} transactions, ${ours.length} with our memo`);

let problems = 0, total = 0;
for (const s of ours) {
  const rec = used[s.signature];
  if (rec === undefined) {
    const info = await inspectPayment(s.signature);
    console.log(`UNRECORDED payment ${s.signature} from ${info?.wallet} ${(info?.received / 1e9).toFixed(4)} SOL (slot ${s.slot}): not a piece, not a refund`);
    problems++;
  } else if (typeof rec === 'number') {
    const p = state.pieces.find(x => x.n === rec);
    if (!p) { console.log(`piece ${rec} for ${s.signature} is missing from state`); problems++; }
    else total += state.pieces.filter(x => !x.dev && x.signature === s.signature).reduce((a, x) => a + (x.received || 0), 0);
  }
}
const bySig = new Set(ours.map(s => s.signature));
// one payment is one piece, or, for a multi-piece payment, exactly pieces 0..of-1 of its batch, each once (a payment
// must never become more pieces than it bought; audit 2026-10-18, multi-piece payments 2026-10-18)
const sigPieces = new Map();
for (const p of state.pieces.filter(p => !p.dev && !p.claimId && !p.leftover)) sigPieces.set(p.signature, [...(sigPieces.get(p.signature) || []), p]);
for (const [sig, ps] of sigPieces) {
  if (ps.length === 1 && !ps[0].batch) continue;
  const of = ps[0].batch?.of, idx = ps.map(p => p.batch?.i).sort((x, y) => x - y);
  if (!of || ps.some(p => p.batch?.of !== of) || ps.length !== of || idx.some((v, k) => v !== k)) { console.log(`DUPLICATE: pieces ${ps.map(p => p.n).join(', ')} share payment ${sig} but are not one complete batch`); problems++; }
}
for (const p of state.pieces.filter(p => !p.dev && !p.claimId && !p.leftover && !bySig.has(p.signature))) { console.log(`piece ${p.n} has no matching treasury payment (${p.signature})`); problems++; }

// ---- allowlists: claims, grants, usage
const al = state.allowlist || { usage: {}, grants: {}, claims: {} };
const claimLog = new Map();
try { for (const l of fs.readFileSync(path.join(config.dataDir, 'payments.jsonl'), 'utf8').trim().split('\n').filter(Boolean)) { const r = JSON.parse(l); if (r.verdict === 'claim') claimLog.set(r.claim, r); } } catch { /* no payments yet */ }
const claimPieces = state.pieces.filter(p => p.claimId);
for (const p of claimPieces) {
  const c = al.claims?.[p.claimId];
  if (!c) { console.log(`claim piece ${p.n} (${p.claimId}) has no claim record`); problems++; }
  else if (c.n !== p.n || c.wallet !== p.wallet || c.list !== p.list) { console.log(`claim ${p.claimId}: record says No. ${c.n} ${c.wallet} ${c.list}, piece says No. ${p.n} ${p.wallet} ${p.list}`); problems++; }
  if (!claimLog.has(p.claimId)) { console.log(`claim ${p.claimId} (No. ${p.n}) is missing from payments.jsonl`); problems++; }
}
for (const id of Object.keys(al.claims || {})) if (!claimPieces.some(p => p.claimId === id)) { console.log(`claim record ${id} has no piece`); problems++; }
const grants = Object.values(al.grants || {});
for (const g of grants.filter(g => g.status === 'used')) {
  const p = state.pieces.find(x => x.signature === g.signature);
  if (!p || p.grant !== g.ticket) { console.log(`grant ${g.ticket} (${g.list}) is used by ${g.signature} but no piece carries it`); problems++; }
}
for (const p of state.pieces.filter(p => p.grant)) { const g = al.grants?.[p.grant]; if (!g || g.status !== 'used' || g.signature !== p.signature) { console.log(`piece ${p.n} was priced by grant ${p.grant}, which is not recorded as used by its payment`); problems++; } }
let listDefs = [];
try { listDefs = JSON.parse(fs.readFileSync(path.join(config.dataDir, 'lists.json'), 'utf8')).lists || []; } catch { /* no lists */ }
for (const [list, units] of Object.entries(al.usage || {})) {
  const def = listDefs.find(l => l.id === list);
  for (const [unit, n] of Object.entries(units)) {
    const expect = claimPieces.filter(p => p.list === list && p.unit === unit).length + grants.filter(g => g.status === 'used' && g.list === list && g.unit === unit).length;
    if (expect !== n) { console.log(`usage ${list} / ${unit}: recorded ${n}, but ${expect} claims + paid grants`); problems++; }
    if (def && def.standard !== 'erc1155' && n > def.limit) { console.log(`OVER LIMIT ${list} / ${unit}: ${n} used, limit ${def.limit}`); problems++; }
  }
}
// per-collector caps (maxPerWallet): used claims + paid grants per Solana wallet, and per ETH address on Ethereum lists
for (const def of listDefs.filter(l => l.maxPerWallet)) {
  const used = [...Object.values(al.claims || {}), ...Object.values(al.grants || {}).filter(g => g.status === 'used')].filter(r => r.list === def.id);
  const count = (key) => used.reduce((m, r) => (r[key] && m.set(r[key], (m.get(r[key]) || 0) + 1), m), new Map());
  for (const [key, label] of [['wallet', 'wallet'], ['via', 'ETH address']]) for (const [who, n] of count(key)) if (n > def.maxPerWallet) { console.log(`OVER PER-WALLET CAP ${def.id} / ${label} ${who}: ${n} used, max ${def.maxPerWallet}`); problems++; }
}
// whole-list caps (maxTotal)
for (const def of listDefs.filter(l => l.maxTotal)) { const n = Object.values(al.usage?.[def.id] || {}).reduce((a, x) => a + x, 0); if (n > def.maxTotal) { console.log(`OVER LIST CAP ${def.id}: ${n} used, max ${def.maxTotal}`); problems++; } }
// per-NFT counts on per-wallet holder lists: each NFT used = claims + paid grants that took it, within the limit
for (const [list, keys] of Object.entries(al.nftUsage || {})) {
  const def = listDefs.find(l => l.id === list);
  for (const [key, n] of Object.entries(keys)) {
    const expect = Object.values(al.claims || {}).filter(c => c.list === list && c.nft === key).length + grants.filter(g => g.status === 'used' && g.list === list && g.nft === key).length;
    if (expect !== n) { console.log(`nft usage ${list} / ${key}: recorded ${n}, but ${expect} claims + paid grants`); problems++; }
    if (def && n > def.limit) { console.log(`OVER LIMIT ${list} / NFT ${key}: ${n} used, limit ${def.limit}`); problems++; }
  }
}
console.log(`allowlists: ${claimPieces.length} free claims, ${state.pieces.filter(p => p.grant).length} discounted pieces, ${grants.filter(g => g.status === 'reserved').length} reservations open`);

// ---- one-of-ones
const one = verifyOneOfOnes(state, config.maxSupply);
for (const m of one.problems) { console.log('1/1: ' + m); problems++; }
const holders = Object.entries(state.oneOfOne?.assigned || {}).map(([id, n]) => `#${id} ${title(+id)} -> No. ${n}`);
console.log(`one-of-ones: ${one.assigned}/10 assigned, ${one.decided} decisions replayed${one.legacy ? `, ${one.legacy} pieces seeded before the rule` : ''}${holders.length ? '\n  ' + holders.join('\n  ') : ''}`);

const now = Date.now(), counts = {};
for (const p of state.pieces.filter(p => !p.dev)) {
  counts[p.status] = (counts[p.status] || 0) + 1;
  if (p.status !== 'minted' && p.status !== 'cancelled' && now - p.paidAt > 6 * 3600e3) { console.log(`STUCK piece ${p.n}: ${p.status} since payment ${new Date(p.paidAt).toISOString()}${p.lastFault ? ' (' + p.lastFault + ')' : ''}`); problems++; }
}
const due = (state.refunds || []).filter(r => r.status === 'due');
console.log('pieces by status:', JSON.stringify(counts), `| received for pieces ${(total / 1e9).toFixed(4)} SOL`);
console.log(`refunds due: ${due.length}${due.length ? ' (' + (due.reduce((a, r) => a + r.lamports, 0) / 1e9).toFixed(4) + ' SOL; see /admin/refunds.csv)' : ''}`);
for (const r of due) console.log(`  refund ${r.id}: ${(r.lamports / 1e9).toFixed(4)} SOL to ${r.wallet} (${r.reason})`);
console.log(problems ? `\n${problems} thing(s) need a look` : '\nall payments accounted for');
process.exit(problems ? 3 : 0);

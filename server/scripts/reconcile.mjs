// Read-only cross-check of money against records. Safe while the server runs (reads state.json, never writes).
// Walks the treasury's finalized history back to the server's first start (state.startCursor, or SINCE=<signature>), takes every transaction carrying our
// memo, and checks each one became exactly one piece or one refund record. Also lists stuck pieces and refunds due.
// Allowlists: free claims (pieces without a payment) must match their claim records and payments.jsonl, every
// discounted piece must match a used grant, and per-unit usage must equal claims + used grants (and stay within the
// list's limit where the limit is fixed).
//   node scripts/reconcile.mjs            exit 0 = all accounted for, 3 = something needs a look
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../src/config.mjs';
import { connection, treasury, checkNetwork, inspectPayment, MEMO_PREFIX } from '../src/solana.mjs';

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
    else total += p.received || 0;
  }
}
const bySig = new Set(ours.map(s => s.signature));
const seenSig = new Map();   // one payment must never be two pieces (audit 2026-10-18)
for (const p of state.pieces.filter(p => !p.dev && !p.claimId)) { if (seenSig.has(p.signature)) { console.log(`DUPLICATE: pieces ${seenSig.get(p.signature)} and ${p.n} share payment ${p.signature}`); problems++; } else seenSig.set(p.signature, p.n); }
for (const p of state.pieces.filter(p => !p.dev && !p.claimId && !bySig.has(p.signature))) { console.log(`piece ${p.n} has no matching treasury payment (${p.signature})`); problems++; }

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
console.log(`allowlists: ${claimPieces.length} free claims, ${state.pieces.filter(p => p.grant).length} discounted pieces, ${grants.filter(g => g.status === 'reserved').length} reservations open`);

const now = Date.now(), counts = {};
for (const p of state.pieces.filter(p => !p.dev)) {
  counts[p.status] = (counts[p.status] || 0) + 1;
  if (p.status !== 'minted' && now - p.paidAt > 6 * 3600e3) { console.log(`STUCK piece ${p.n}: ${p.status} since payment ${new Date(p.paidAt).toISOString()}${p.lastFault ? ' (' + p.lastFault + ')' : ''}`); problems++; }
}
const due = (state.refunds || []).filter(r => r.status === 'due');
console.log('pieces by status:', JSON.stringify(counts), `| received for pieces ${(total / 1e9).toFixed(4)} SOL`);
console.log(`refunds due: ${due.length}${due.length ? ' (' + (due.reduce((a, r) => a + r.lamports, 0) / 1e9).toFixed(4) + ' SOL; see /admin/refunds.csv)' : ''}`);
for (const r of due) console.log(`  refund ${r.id}: ${(r.lamports / 1e9).toFixed(4)} SOL to ${r.wallet} (${r.reason})`);
console.log(problems ? `\n${problems} thing(s) need a look` : '\nall payments accounted for');
process.exit(problems ? 3 : 0);

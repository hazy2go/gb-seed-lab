// Read-only cross-check of money against records. Safe while the server runs (reads state.json, never writes).
// Walks the treasury's finalized history back to the server's first start (state.startCursor, or SINCE=<signature>), takes every transaction carrying our
// memo, and checks each one became exactly one piece or one refund record. Also lists stuck pieces and refunds due.
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
for (const p of state.pieces.filter(p => !p.dev)) { if (seenSig.has(p.signature)) { console.log(`DUPLICATE: pieces ${seenSig.get(p.signature)} and ${p.n} share payment ${p.signature}`); problems++; } else seenSig.set(p.signature, p.n); }
for (const p of state.pieces.filter(p => !p.dev && !bySig.has(p.signature))) { console.log(`piece ${p.n} has no matching treasury payment (${p.signature})`); problems++; }

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

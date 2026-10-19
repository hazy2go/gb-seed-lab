// Activity log for the admin page: who visited, connected, checked, linked, paid, claimed, and what went wrong.
//   activity.jsonl  append-only, one line per thing that happened ({ at, kind, src, ... })
// src 'server' lines are facts the server saw itself (eligibility checks, links, tickets, claims, errors).
// src 'page' lines are what a visitor's page reported (visits, wallet connects): unverified, never used for money.
// No IP addresses are stored; a visit carries only a random id the page keeps in localStorage.
import fs from 'node:fs';
import path from 'node:path';

export const PAGE_KINDS = ['view', 'connect', 'disconnect', 'error', 'step'];
const RING = 3000, PAGE_FILE_CAP = 200 * 1024 * 1024, SET_CAP = 200000, KEY_CAP = 2000;

export function openActivity(dir, { now = Date.now } = {}) {
  const file = path.join(dir, 'activity.jsonl');
  const ring = [];
  const agg = blank();
  let size = 0;
  try { size = fs.statSync(file).size; } catch { /* no log yet */ }
  const put = (set, v) => { if (set.size < SET_CAP) set.add(v); };   // bounded memory whatever the visitors send
  const bump = (obj, k) => { if (k in obj || Object.keys(obj).length < KEY_CAP) obj[k] = (obj[k] || 0) + 1; };

  function blank() {
    return { counts: {}, visitors: new Set(), sol: new Set(), eth: new Set(), apps: {}, appWallets: {}, devices: {}, checked: new Set(),
      eligible: new Set(), linkedEth: new Set(), linkedSol: new Set(), ticketWallets: new Set(), sentWallets: new Set(), claimWallets: new Set(),
      errors: {}, refs: {}, firstAt: null, lastAt: null };
  }
  function add(e) {
    const a = agg;
    a.counts[e.kind] = (a.counts[e.kind] || 0) + 1;
    a.firstAt ||= e.at; a.lastAt = e.at;
    if (e.vid) put(a.visitors, e.vid);
    if (e.kind === 'view' && e.ref) bump(a.refs, e.ref);
    if (e.kind === 'connect') {
      put(e.chain === 'eth' ? a.eth : a.sol, e.address);
      const app = (e.chain === 'eth' ? 'ETH ' : 'SOL ') + (e.app || 'unknown');
      if (a.appWallets[app] || Object.keys(a.appWallets).length < KEY_CAP) put(a.appWallets[app] ||= new Set(), e.address);
      if (e.device) bump(a.devices, e.device);
    }
    if (e.kind === 'eligibility') { put(a.checked, e.wallet); if (e.lists?.length) put(a.eligible, e.wallet); }
    if (e.kind === 'eth_link' && e.linked) { put(a.linkedEth, e.eth); put(a.linkedSol, e.sol); }
    if (e.kind === 'ticket') put(a.ticketWallets, e.wallet);
    if (e.kind === 'sent') put(a.sentWallets, e.wallet);
    if (e.kind === 'claim') put(a.claimWallets, e.wallet);
    if (e.kind === 'error') bump(a.errors, String(e.msg || '').slice(0, 120));   // server errors only; page reports are page_error
    ring.push(e); if (ring.length > RING) ring.shift();
  }
  try {
    for (const l of fs.readFileSync(file, 'utf8').split('\n')) { if (!l) continue; try { add(JSON.parse(l)); } catch { /* a torn last line */ } }
  } catch { /* no log yet */ }

  function record(kind, data = {}, src = 'server') {
    const e = { at: new Date(now()).toISOString(), kind, src, ...data };
    if (src === 'page' && size > PAGE_FILE_CAP) return e;   // a flood must never fill the disk state.json lives on
    try {
      const line = JSON.stringify(e) + '\n';
      const fd = fs.openSync(file, 'a', 0o600);
      fs.writeSync(fd, line); fs.closeSync(fd);
      size += Buffer.byteLength(line);
    } catch { /* tracking must never break the mint */ }
    add(e);
    return e;
  }

  function summary() {
    const a = agg;
    return {
      since: a.firstAt, last: a.lastAt, counts: a.counts,
      visitors: a.visitors.size, views: a.counts.view || 0,
      solWallets: a.sol.size, ethWallets: a.eth.size,
      apps: Object.fromEntries(Object.entries(a.appWallets).map(([k, s]) => [k, s.size]).sort((x, y) => y[1] - x[1])),
      devices: a.devices,
      checked: a.checked.size, eligible: a.eligible.size, linkedEth: a.linkedEth.size, linkedSol: a.linkedSol.size,
      ticketWallets: a.ticketWallets.size, sentWallets: a.sentWallets.size, claimWallets: a.claimWallets.size,
      errors: Object.entries(a.errors).sort((x, y) => y[1] - x[1]).slice(0, 15).map(([msg, n]) => ({ msg, n })),
      refs: Object.entries(a.refs).sort((x, y) => y[1] - x[1]).slice(0, 10).map(([ref, n]) => ({ ref, n })),
    };
  }
  // newest first; kind filter and a substring search over the whole line (address, list, message)
  function recent({ kind = '', q = '', limit = 200 } = {}) {
    const out = [], needle = String(q).toLowerCase();
    for (let i = ring.length - 1; i >= 0 && out.length < limit; i--) {
      const e = ring[i];
      if (kind && e.kind !== kind) continue;
      if (needle && !JSON.stringify(e).toLowerCase().includes(needle)) continue;
      out.push(e);
    }
    return out;
  }
  const csv = () => { try { return fs.readFileSync(file, 'utf8'); } catch { return ''; } };

  return { record, summary, recent, raw: csv, file };
}

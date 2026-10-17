// Allowlists and holder lists: schema, strict validation, atomic storage.
//   data/lists.json   the live lists (edited from the admin page or by hand), atomic write + backups in data/backups/
//   server/lists.json committed seed, copied to data/ on the first start only (empty by default; see lists.example.json)
// A bad file refuses to start the server: a typo must never silently turn into "free for everyone".
import fs from 'node:fs';
import path from 'node:path';

export const B58_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
export const ETH_RE = /^0x[0-9a-fA-F]{40}$/;
const ID_RE = /^[a-z0-9][a-z0-9-]{0,31}$/;
const NAME_RE = /^[^<>&"'`\u0000-\u001f\u007f]{1,60}$/;
export const MAX_WALLETS = 20000;
export const MAX_LISTS = 50;

// base58 is not enough for a Solana address: it must decode to exactly 32 bytes
const ALPHA = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
export function b58decode(s) {
  if (typeof s !== 'string' || !/^[1-9A-HJ-NP-Za-km-z]*$/.test(s)) return null;
  let n = 0n;
  for (const c of s) n = n * 58n + BigInt(ALPHA.indexOf(c));
  const out = [];
  while (n > 0n) { out.unshift(Number(n & 255n)); n >>= 8n; }
  for (const c of s) { if (c !== '1') break; out.unshift(0); }
  return Uint8Array.from(out);
}
export const isSolAddress = (s) => typeof s === 'string' && B58_RE.test(s) && b58decode(s)?.length === 32;
export const isEthAddress = (s) => typeof s === 'string' && ETH_RE.test(s);

function isoOrNull(v, field, errs) {
  if (v == null || v === '') return null;
  const t = Date.parse(v);
  if (typeof v !== 'string' || !Number.isFinite(t)) { errs.push(`${field}: not a date (use ISO, e.g. 2026-11-01T18:00:00Z)`); return null; }
  return new Date(t).toISOString();
}

// One list. Returns { list, errs, warnings }. `maxPriceLamports`: a list price may never exceed the public price.
export function validateList(raw, { maxPriceLamports } = {}) {
  const errs = [], warnings = [];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { errs: ['not an object'], warnings };
  const allowed = new Set(['id', 'name', 'chain', 'type', 'wallets', 'collection', 'contract', 'standard', 'priceSol', 'limit', 'maxTotal', 'per', 'start', 'end', 'disabled', 'note']);
  for (const k of Object.keys(raw)) if (!allowed.has(k)) errs.push(`unknown field "${k}"`);
  const id = raw.id, label = typeof id === 'string' ? id : '?';
  if (!ID_RE.test(id || '')) errs.push('id: 1-32 of a-z, 0-9, "-"');
  if (typeof raw.name !== 'string' || !NAME_RE.test(raw.name.trim())) errs.push('name: 1-60 characters, no < > & quotes');
  if (!['solana', 'ethereum'].includes(raw.chain)) errs.push('chain: "solana" or "ethereum"');
  if (!['wallets', 'collection'].includes(raw.type)) errs.push('type: "wallets" or "collection"');
  if (!['wallet', 'nft'].includes(raw.per)) errs.push('per: "wallet" or "nft"');
  if (raw.type === 'wallets' && raw.per === 'nft') errs.push('per: a wallet list counts per wallet');
  if (!Number.isInteger(raw.limit) || raw.limit < 1 || raw.limit > 100) errs.push('limit: a whole number 1-100');
  if (typeof raw.priceSol !== 'number' || !Number.isFinite(raw.priceSol) || raw.priceSol < 0) errs.push('priceSol: a number >= 0 (0 = free)');
  const priceLamports = Math.round((raw.priceSol || 0) * 1e9);
  if (raw.priceSol > 0 && priceLamports < 1_000_000) errs.push('priceSol: at least 0.001, or 0 for free');
  if (maxPriceLamports && priceLamports > maxPriceLamports) errs.push(`priceSol: above the public price (${maxPriceLamports / 1e9} SOL)`);
  const list = { id, name: typeof raw.name === 'string' ? raw.name.trim() : '', chain: raw.chain, type: raw.type, per: raw.per, limit: raw.limit, priceSol: raw.priceSol, priceLamports, disabled: raw.disabled === true };
  // optional cap on the whole list (Hazy 2026-10-18): at most this many pieces through this list, all units together
  if (raw.maxTotal != null) { if (!Number.isInteger(raw.maxTotal) || raw.maxTotal < 1 || raw.maxTotal > 16384) errs.push('maxTotal: a whole number 1-16384, or leave it out for no cap'); else list.maxTotal = raw.maxTotal; }
  if (raw.disabled != null && typeof raw.disabled !== 'boolean') errs.push('disabled: true or false');
  if (raw.note != null) { if (typeof raw.note !== 'string' || raw.note.length > 200) errs.push('note: text up to 200 characters'); else list.note = raw.note; }
  if (raw.type === 'wallets') {
    if (raw.collection != null || raw.contract != null || raw.standard != null) errs.push('a wallet list has no collection/contract/standard');
    if (!Array.isArray(raw.wallets) || !raw.wallets.length) errs.push('wallets: a non-empty array of addresses');
    else if (raw.wallets.length > MAX_WALLETS) errs.push(`wallets: at most ${MAX_WALLETS}`);
    else {
      const bad = [], set = new Set();
      for (const w of raw.wallets) {
        const ok = raw.chain === 'ethereum' ? isEthAddress(w) : isSolAddress(w);
        if (!ok) bad.push(String(w).slice(0, 50)); else set.add(raw.chain === 'ethereum' ? w.toLowerCase() : w);
      }
      if (bad.length) errs.push(`wallets: ${bad.length} not ${raw.chain === 'ethereum' ? 'Ethereum (0x…)' : 'Solana'} addresses, e.g. ${bad.slice(0, 3).join(', ')}`);
      if (set.size < raw.wallets.length) warnings.push(`${raw.wallets.length - set.size} duplicate wallets ignored`);
      list.wallets = [...set];
    }
  } else if (raw.type === 'collection') {
    if (raw.wallets != null) errs.push('a collection list has no wallets');
    if (raw.chain === 'solana') {
      if (raw.contract != null || raw.standard != null) errs.push('Solana collection: use "collection", not contract/standard');
      const c = raw.collection;
      const m = typeof c === 'string' && c.match(/^creator:(.+)$/);
      if (m ? !isSolAddress(m[1]) : !isSolAddress(c)) errs.push('collection: a Solana collection address, or "creator:<verified creator address>"');
      else list.collection = c;
    } else if (raw.chain === 'ethereum') {
      if (raw.collection != null) errs.push('Ethereum collection: use "contract", not collection');
      if (!isEthAddress(raw.contract)) errs.push('contract: an Ethereum contract address (0x…)');
      else list.contract = raw.contract.toLowerCase();
      if (!['erc721', 'erc1155'].includes(raw.standard)) errs.push('standard: "erc721" or "erc1155"');
      else list.standard = raw.standard;
      if (raw.standard === 'erc1155' && raw.per === 'nft') errs.push('per: ERC-1155 copies have no identity, so per "nft" is farmable (a copy moved to a new wallet claims again); use per "wallet" with a price');
    }
  }
  list.start = isoOrNull(raw.start, 'start', errs);
  list.end = isoOrNull(raw.end, 'end', errs);
  if (list.start && list.end && list.start >= list.end) errs.push('end must be after start');
  if (raw.type === 'collection' && raw.per === 'wallet' && priceLamports === 0) errs.push('free + per wallet on a holder list is farmable (one NFT passed between wallets claims from each): use per "nft", or a price');
  return { list, errs: errs.map(e => `list "${label}": ${e}`), warnings: warnings.map(w => `list "${label}": ${w}`) };
}

export function validateLists(doc, opts = {}) {
  const errs = [], warnings = [];
  if (!doc || typeof doc !== 'object' || !Array.isArray(doc.lists)) throw new Error('lists file: expected { "lists": [ ... ] }');
  for (const k of Object.keys(doc)) if (!['lists', 'version', '$schema', 'comment'].includes(k)) errs.push(`lists file: unknown field "${k}"`);
  if (doc.lists.length > MAX_LISTS) errs.push(`lists file: at most ${MAX_LISTS} lists`);
  const out = [], ids = new Set();
  for (const raw of doc.lists) {
    const r = validateList(raw, opts);
    errs.push(...r.errs); warnings.push(...r.warnings);
    if (r.list?.id) { if (ids.has(r.list.id)) errs.push(`list "${r.list.id}": duplicate id`); ids.add(r.list.id); }
    if (r.list) out.push(r.list);
  }
  if (errs.length) throw new Error('lists file is invalid:\n  ' + errs.join('\n  '));
  return { lists: out, warnings };
}

// back to the file format (what an admin edits)
export function toFile(lists) {
  return {
    version: 1,
    lists: lists.map(l => {
      const o = { id: l.id, name: l.name, chain: l.chain, type: l.type };
      if (l.type === 'wallets') o.wallets = l.wallets;
      if (l.collection) o.collection = l.collection;
      if (l.contract) { o.contract = l.contract; o.standard = l.standard; }
      Object.assign(o, { priceSol: l.priceSol, limit: l.limit, per: l.per });
      if (l.maxTotal) o.maxTotal = l.maxTotal;
      if (l.start) o.start = l.start;
      if (l.end) o.end = l.end;
      if (l.disabled) o.disabled = true;
      if (l.note) o.note = l.note;
      return o;
    }),
  };
}

export const listActive = (l, now = Date.now()) => !l.disabled && (!l.start || Date.parse(l.start) <= now) && (!l.end || Date.parse(l.end) > now);

// Live lists in DATA_DIR. On the first start they are seeded from server/lists.json (committed, empty by default).
export function openLists({ dataDir, seedFile, maxPriceLamports, log = () => {} }) {
  const file = path.join(dataDir, 'lists.json');
  fs.mkdirSync(path.join(dataDir, 'backups'), { recursive: true });
  let doc;
  const src = fs.existsSync(file) ? file : seedFile && fs.existsSync(seedFile) ? seedFile : null;
  if (src) {
    try { doc = JSON.parse(fs.readFileSync(src, 'utf8')); }
    catch (e) { throw new Error(`${src} is not valid JSON (${e.message})`); }
  } else doc = { version: 1, lists: [] };
  let { lists, warnings } = validateLists(doc, { maxPriceLamports });
  for (const w of warnings) log('lists warning:', w);
  if (src !== file) write(lists);

  function write(next) {
    const data = JSON.stringify(toFile(next), null, 1), tmp = file + '.tmp';
    const fd = fs.openSync(tmp, 'w', 0o600);
    fs.writeSync(fd, data); fs.fsyncSync(fd); fs.closeSync(fd);
    fs.renameSync(tmp, file);
    fs.writeFileSync(path.join(dataDir, 'backups', `lists-${new Date().toISOString().replace(/[:.]/g, '-')}.json`), data, { mode: 0o600 });
    const all = fs.readdirSync(path.join(dataDir, 'backups')).filter(f => f.startsWith('lists-')).sort();
    for (const f of all.slice(0, Math.max(0, all.length - 200))) fs.unlinkSync(path.join(dataDir, 'backups', f));
  }
  return {
    file,
    all: () => lists,
    get: (id) => lists.find(l => l.id === id) || null,
    warnings: () => warnings,
    // replace the whole set (validated as a whole; throws on any error, nothing written)
    replace(nextDoc) {
      const r = validateLists(nextDoc, { maxPriceLamports });
      write(r.lists); lists = r.lists; warnings = r.warnings;
      return r;
    },
  };
}

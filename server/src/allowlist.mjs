// Allowlist and holder mints, alongside the public mint. See docs/MINT.md "Allowlists and holder mints".
//
// A list gives eligible wallets a price (0 = free) and a limit. The limit counts per UNIT:
//   per 'wallet': unit = the Solana wallet (Solana lists) or the Ethereum address (Ethereum lists)
//   per 'nft':    unit = the Solana asset id, or `contract:tokenId` (ERC-721)
// so an NFT used once cannot be used again from another wallet. Per-wallet holder lists also count per NFT used
// (each NFT gives at most `limit` pieces on that list, whoever holds it), so one NFT passed between wallets gets
// nothing more. Free + per wallet on a holder list and ERC-1155 + per nft are refused by the validator (farmable).
//
// Paid offers: /api/ticket reserves a unit and creates a GRANT (saved in state.json, survives restarts) whose memo
// ticket carries the discounted price. The payment watcher prices a payment by its grant (same payer, chain time
// before the grant expires); anything else pays the public price. Only an accepted payment consumes the unit.
// Every reservation and every free claim needs a Solana signMessage proof from the wallet (single-use nonce);
// Ethereum lists also need the ETH link, which the ETH holder signed naming the Solana wallet.
//
// Concurrency: one process. Every claim/reserve holds a lock on its wallet and on its (list, unit) for its whole
// duration, so two requests for the same unit can never both pass; supply and the unit's room are checked again
// after every await.
import crypto from 'node:crypto';
import { listActive, isSolAddress, isEthAddress } from './lists.mjs';
import { verifySol, ethLinkMessage, solClaimMessage } from './sigs.mjs';

export const GRANT_TTL = 10 * 60000;      // a reservation waits this long for its payment
export const GRANT_GRACE = 3 * 60000;     // and keeps its unit a little longer, so a payment finalizing late cannot double-use it
export const NONCE_TTL = 5 * 60000;
export const MAX_LINKS_PER_SOL = 5, MAX_NONCES = 50000, MAX_NONCES_PER_IP = 20, MAX_LOOKUPS = 20, CACHE_MAX = 5000;
const CACHE_TTL = 30000, REUSE_MS = 50000, RETIRE_MS = 120000;

export class AllowError extends Error { constructor(status, message) { super(message); this.status = status; } }
const UNIT_RE = /^[0-9A-Za-z:]{1,140}$/;
export const isUnit = (s) => typeof s === 'string' && UNIT_RE.test(s);
// The page only ever sees an opaque reference per unit, so an eligibility answer never reveals which Ethereum
// address is linked to a Solana wallet (or which token it holds).
export const unitRef = (unit) => crypto.createHash('sha256').update('slowhorizons-unit:' + unit).digest('hex').slice(0, 24);
const proofOf = (nonce, sig) => typeof nonce === 'string' && typeof sig === 'string' ? crypto.createHash('sha256').update(nonce + ':' + sig).digest('hex') : null;

export function createAllowlist({ state, save, event = () => {}, payment = () => {}, lists, holdings, verifyEth, ethEnabled, domain,
  maxSupply, minted, mintOpen, getSlot, createClaimPiece, now = Date.now, log = () => {} }) {
  const A = state.allowlist ||= {};
  A.usage ||= {}; A.nftUsage ||= {}; A.grants ||= {}; A.links ||= {}; A.claims ||= {};
  const locks = new Set();
  const walletSets = new WeakMap();
  const inList = (list, w) => { let s = walletSets.get(list); if (!s) walletSets.set(list, s = new Set(list.wallets)); return s.has(w); };

  // ---------------------------------------------------------------- holdings cache
  // Map insertion order = age: a refresh moves a key to the end, the oldest go first when full. Keys are per
  // collection (not per list), so two lists on one collection share one lookup; byOwner lets forget() skip a scan.
  const cache = new Map(), byOwner = new Map();
  function drop(k) { const v = cache.get(k); if (!v) return; cache.delete(k); const s = byOwner.get(v.owner); if (s) { s.delete(k); if (!s.size) byOwner.delete(v.owner); } }
  async function cached(key, owner, fresh, budget, fn) {
    const c = cache.get(key);
    if (!fresh && c && now() - c.at < CACHE_TTL) return c.val;
    if (budget && budget.left-- <= 0) throw new Error('too many lookups in one request');   // the rest of the lists: "try again"
    const val = await fn();
    drop(key);
    cache.set(key, { at: now(), val, owner });
    let s = byOwner.get(owner); if (!s) byOwner.set(owner, s = new Set()); s.add(key);
    while (cache.size > CACHE_MAX) drop(cache.keys().next().value);
    return val;
  }
  const forget = (owner) => { for (const k of [...(byOwner.get(owner) || [])]) drop(k); };

  // ---------------------------------------------------------------- ETH links (indexed by Solana wallet)
  const bySol = new Map();
  const index = (sol, eth) => { let s = bySol.get(sol); if (!s) bySol.set(sol, s = new Set()); s.add(eth); };
  for (const [e, l] of Object.entries(A.links)) index(l.sol, e);
  const linksOf = (sol) => [...(bySol.get(sol) || [])].sort((a, b) => A.links[b].at - A.links[a].at);   // newest first
  const linkedEths = (sol) => linksOf(sol).slice(0, MAX_LINKS_PER_SOL);

  async function ethUnits(eth, list, fresh, budget) {
    if (list.type === 'wallets') return inList(list, eth) ? [{ unit: eth, cap: list.limit, via: eth }] : [];
    const toks = await cached(`e:${list.contract}:${list.standard}:${eth}`, eth, fresh, budget, () => holdings.ethereum(eth, list));
    if (list.per === 'wallet') return toks.length ? [{ unit: eth, cap: list.limit, via: eth, nfts: list.standard === 'erc721' ? toks.map(t => `${list.contract}:${t.tokenId}`) : null }] : [];
    return toks.map(t => ({ unit: `${list.contract}:${t.tokenId}`, cap: list.limit, via: eth }));   // erc721 only (validator)
  }
  // the units this Solana wallet may use on a list (Ethereum lists: through its linked ETH addresses only)
  async function unitsFor(sol, list, fresh, budget = null) {
    if (list.chain === 'solana') {
      if (list.type === 'wallets') return inList(list, sol) ? [{ unit: sol, cap: list.limit }] : [];
      const ids = await cached(`s:${list.collection}:${sol}`, sol, fresh, budget, () => holdings.solana(sol, list));
      if (list.per === 'wallet') return ids.length ? [{ unit: sol, cap: list.limit, nfts: ids }] : [];
      return ids.map(id => ({ unit: id, cap: list.limit }));
    }
    if (!ethEnabled) return [];
    const out = new Map();
    for (const eth of linkedEths(sol)) for (const u of await ethUnits(eth, list, fresh, budget)) if (!out.has(u.unit)) out.set(u.unit, u);
    return [...out.values()];
  }

  // ---------------------------------------------------------------- room
  const activeReservation = (g) => g.status === 'reserved' && now() < g.exp + GRANT_GRACE;   // 'replaced'/'expired' hold nothing (grantFor checks room if they land)
  function held(listId, unit, exceptTicket = null) {
    let n = A.usage[listId]?.[unit] || 0;
    for (const g of Object.values(A.grants)) if (g.list === listId && g.unit === unit && g.ticket !== exceptTicket && activeReservation(g)) n++;
    return n;
  }
  function nftHeld(listId, key, exceptTicket = null) {
    let n = A.nftUsage[listId]?.[key] || 0;
    for (const g of Object.values(A.grants)) if (g.list === listId && g.nft === key && g.ticket !== exceptTicket && activeReservation(g)) n++;
    return n;
  }
  // the whole list's cap (maxTotal): used pieces of every unit plus open reservations
  function listHeld(listId, exceptTicket = null) {
    let n = Object.values(A.usage[listId] || {}).reduce((a, x) => a + x, 0);
    for (const g of Object.values(A.grants)) if (g.list === listId && g.ticket !== exceptTicket && activeReservation(g)) n++;
    return n;
  }
  const listRoom = (list) => list.maxTotal ? Math.max(0, list.maxTotal - listHeld(list.id)) : Infinity;
  // the per-wallet cap (maxPerWallet): pieces one collector gets through a list, however many NFTs it holds. A piece
  // counts for the Solana wallet that received it and, on Ethereum lists, for the ETH address it came through, so
  // re-linking the same NFTs to a fresh Solana wallet does not start over. Used claims and grants plus open reservations.
  function walletHeld(listId, wallet, via, exceptTicket = null) {
    const mine = (r) => r.list === listId && ((wallet && r.wallet === wallet) || (via && r.via === via));
    let n = 0;
    for (const c of Object.values(A.claims)) if (mine(c)) n++;
    for (const g of Object.values(A.grants)) if (g.ticket !== exceptTicket && mine(g) && (g.status === 'used' || activeReservation(g))) n++;
    return n;
  }
  // room left under maxPerWallet for this wallet, per ETH address (memoised for one request)
  function walletLeft(list, wallet) {
    const memo = new Map();
    return (via = null) => {
      if (!list.maxPerWallet) return Infinity;
      if (!memo.has(via)) memo.set(via, Math.max(0, list.maxPerWallet - walletHeld(list.id, wallet, via)));
      return memo.get(via);
    };
  }
  function room(list, u, left = null) {
    let r = Math.min(u.cap - held(list.id, u.unit), listRoom(list));
    if (left) r = Math.min(r, left(u.via || null));
    if (u.nfts) r = Math.min(r, u.nfts.reduce((a, k) => a + Math.max(0, list.limit - nftHeld(list.id, k)), 0));
    return Math.max(0, r);
  }
  const pickNft = (list, u) => u.nfts ? u.nfts.find(k => nftHeld(list.id, k) < list.limit) || null : null;
  const reservedCount = (exceptTicket = null) => Object.values(A.grants).filter(g => g.ticket !== exceptTicket && activeReservation(g)).length;
  // a grant still matches its list: not deleted, disabled or repriced since (and, given a time, inside the window then)
  function grantCurrent(g, at = null) {
    const l = lists.get(g.list);
    return !!l && l.priceLamports === g.price && (at == null ? !l.disabled : listActive(l, at));
  }
  function voidG(g, why) { g.status = 'void'; g.verdict = why; delete g.tx; event({ allowlist: 'grant void', ticket: g.ticket, verdict: why }); }

  function checkOpen() {
    const mo = mintOpen();
    if (!mo.open) throw new AllowError(503, `Minting is closed right now (${mo.reason}). Nothing was charged.`);
    if (minted() + reservedCount() >= maxSupply) throw new AllowError(503, 'Every piece is taken or reserved right now. Nothing was charged.');
  }
  function activeList(id) {
    const list = typeof id === 'string' ? lists.get(id) : null;
    if (!list || !listActive(list, now()) || (list.chain === 'ethereum' && !ethEnabled)) throw new AllowError(404, 'That offer is not open right now.');
    return list;
  }
  async function withLocks(keys, fn) {
    if (keys.some(k => locks.has(k))) throw new AllowError(409, 'Another request for this is still running. Wait a moment and try again.');
    for (const k of keys) locks.add(k);
    try { return await fn(); } finally { for (const k of keys) locks.delete(k); }
  }
  async function freshUnit(wallet, list, ref) {
    let units;
    try { units = await unitsFor(wallet, list, true); }
    catch (e) { log('holdings', list.id, e.message); throw new AllowError(503, 'Could not check your NFTs right now. Nothing was charged. Try again in a minute.'); }
    const u = units.find(x => unitRef(x.unit) === ref);
    if (!u) throw new AllowError(403, 'This wallet is not eligible for that offer (or the NFT has moved).');
    return u;
  }

  // ---------------------------------------------------------------- eligibility
  async function offers(sol, { fresh = false, chain = null } = {}) {
    const res = { offers: [], unavailable: [] }, budget = { left: MAX_LOOKUPS };   // bounded holdings lookups per request
    for (const list of lists.all()) {
      if (!listActive(list, now()) || (chain && list.chain !== chain)) continue;
      if (list.chain === 'ethereum' && (!ethEnabled || !bySol.get(sol)?.size)) continue;
      let units;
      try { units = await unitsFor(sol, list, fresh, budget); }
      catch (e) { log('eligibility', list.id, e.message); res.unavailable.push({ list: list.id, name: list.name }); continue; }
      if (!units.length) continue;
      const left = walletLeft(list, sol);
      const u = units.map(x => ({ unit: unitRef(x.unit), remaining: room(list, x, left) }));
      res.offers.push({ list: list.id, name: list.name, chain: list.chain, type: list.type, per: list.per, limit: list.limit, price: list.priceLamports,
        remaining: Math.min(u.reduce((a, x) => a + x.remaining, 0), listRoom(list), left()), units: u.filter(x => x.remaining > 0).slice(0, 50) });
    }
    return res;
  }
  // admin preview: any Solana or Ethereum address against every list (Ethereum addresses need no link here)
  async function preview(addr) {
    if (isSolAddress(addr)) return offers(addr, { fresh: true });
    if (!isEthAddress(addr)) throw new AllowError(400, 'Not a Solana or Ethereum address.');
    const eth = addr.toLowerCase(), res = { offers: [], unavailable: [], linkedTo: A.links[eth]?.sol || null }, budget = { left: MAX_LOOKUPS };
    for (const list of lists.all().filter(l => l.chain === 'ethereum')) {
      if (!ethEnabled) { res.unavailable.push({ list: list.id, name: list.name, reason: 'ALCHEMY_API_KEY not set' }); continue; }
      let units;
      try { units = await ethUnits(eth, list, true, budget); } catch { res.unavailable.push({ list: list.id, name: list.name }); continue; }
      if (!units.length) continue;
      const left = walletLeft(list, null);
      const u = units.map(x => ({ unit: x.unit, remaining: room(list, x, left) }));
      res.offers.push({ list: list.id, name: list.name, price: list.priceLamports, active: listActive(list, now()), remaining: Math.min(u.reduce((a, x) => a + x.remaining, 0), listRoom(list), left(eth)), units: u.slice(0, 50) });
    }
    return res;
  }

  // ---------------------------------------------------------------- nonces
  // All nonces live NONCE_TTL, so insertion order is expiry order: expired ones are dropped from the front.
  // One IP holds at most MAX_NONCES_PER_IP open nonces (its oldest go), so a few hundred IPs cannot fill the map.
  const nonces = new Map(), ipNonces = new Map();
  function dropNonce(k) {
    const rec = nonces.get(k); if (!rec) return;
    nonces.delete(k);
    const l = ipNonces.get(rec.ip); if (l) { const i = l.indexOf(k); if (i >= 0) l.splice(i, 1); if (!l.length) ipNonces.delete(rec.ip); }
  }
  function newNonce(rec, ip = '?') {
    for (const [k, v] of nonces) { if (v.exp >= now()) break; dropNonce(k); }
    const mine = ipNonces.get(ip) || [];
    while (mine.length >= MAX_NONCES_PER_IP) dropNonce(mine[0]);
    if (nonces.size >= MAX_NONCES) throw new AllowError(503, 'Too many open requests. Try again in a minute.');
    const nonce = crypto.randomBytes(16).toString('hex');
    rec.ip = ip;
    nonces.set(nonce, rec); mine.push(nonce); ipNonces.set(ip, mine);
    return nonce;
  }
  function takeNonce(nonce, check) {   // single use: removed before anything is verified
    const rec = typeof nonce === 'string' ? nonces.get(nonce) : null;
    if (rec) dropNonce(nonce);
    if (!rec || rec.exp < now() || !check(rec)) throw new AllowError(401, 'That signature request expired or was already used. Start again.');
    return rec;
  }

  // ---------------------------------------------------------------- Ethereum link
  function ethChallenge(sol, eth, ip) {
    if (!ethEnabled) throw new AllowError(503, 'Ethereum holder checks are not available right now.');
    const exp = now() + NONCE_TTL, rec = { kind: 'eth', sol, eth, exp };
    const nonce = newNonce(rec, ip);
    rec.message = ethLinkMessage({ domain, sol, eth, nonce, expires: exp });
    return { nonce, message: rec.message, expires: exp };
  }
  async function ethLink({ sol, eth, signature, nonce }) {
    if (!ethEnabled) throw new AllowError(503, 'Ethereum holder checks are not available right now.');
    const rec = takeNonce(nonce, r => r.kind === 'eth' && r.sol === sol && r.eth.toLowerCase() === eth.toLowerCase());
    if (!(await verifyEth(rec.message, signature, rec.eth))) throw new AllowError(401, 'The Ethereum signature did not check out. Nothing was linked.');
    const key = eth.toLowerCase();
    // The Solana wallet does not sign the link (a phone user links from the ETH wallet's browser by pasting the address,
    // 2026-10-18). So: (1) only an address that holds something on an enabled Ethereum list (open now or later) is
    // linked; (2) a full Solana wallet (5 links) drops only links whose address no longer holds anything, and otherwise
    // refuses the new link: links are never pushed out by newer ones, so a stranger cannot remove someone's real link;
    // (3) the answer covers this Ethereum address only (no unit refs, nothing about the Solana wallet's other links).
    const budget = { left: MAX_LOOKUPS };   // one lookup budget for the whole request, re-checks included
    const { found: mine, failed } = await holdsAny(key, budget);
    if (!mine.some(o => o.remaining > 0)) {   // nothing, or only used-up allowances: linking would give nothing
      if (!mine.length && failed) throw new AllowError(503, 'Could not check your Ethereum NFTs right now. Nothing was linked. Try again in a minute.');
      return { linked: false, sol, offers: mine };
    }
    if (A.links[key]?.sol !== sol && linksOf(sol).length >= MAX_LINKS_PER_SOL) {
      for (const e of linksOf(sol)) {   // re-check the existing links; one that gives nothing any more (sold, or used up) makes room
        const r = await holdsAny(e, budget);
        if (!r.failed && !r.found.some(o => o.remaining > 0) && A.links[e]?.sol === sol) { delete A.links[e]; bySol.get(sol)?.delete(e); forget(e); event({ allowlist: 'unlink', eth: e, sol, why: 'gives nothing any more' }); }
      }
    }
    // no await from here on: decide and record in one go
    if (A.links[key]?.sol !== sol && linksOf(sol).length >= MAX_LINKS_PER_SOL) { save(); throw new AllowError(409, `That Solana wallet already has ${MAX_LINKS_PER_SOL} linked Ethereum addresses that hold eligible NFTs. Use another Solana wallet.`); }
    const before = A.links[key]?.sol || null;
    if (before) bySol.get(before)?.delete(key);
    A.links[key] = { sol, at: now() };
    index(sol, key);
    forget(key);
    save(); event({ allowlist: 'link', eth: key, sol, before });
    return { linked: true, sol, offers: mine };
  }
  // what an Ethereum address holds on the enabled Ethereum lists (open now or later); a failed lookup on one list does
  // not hide what another list found
  async function holdsAny(eth, budget) {
    const found = [];
    let failed = false;
    for (const list of lists.all().filter(l => l.chain === 'ethereum' && !l.disabled && (!l.end || Date.parse(l.end) > now()))) {
      let units;
      try { units = await ethUnits(eth, list, true, budget); }
      catch (e) { log('eth link', list.id, e.message); failed = true; continue; }
      if (units.length) found.push({ list: list.id, name: list.name, price: list.priceLamports, per: list.per, limit: list.limit, open: listActive(list, now()),
        remaining: (() => { const left = walletLeft(list, null); return Math.min(units.reduce((a, u) => a + room(list, u, left), 0), listRoom(list), left(eth)); })() });
    }
    return { found, failed };
  }

  // ---------------------------------------------------------------- wallet proof (reservations and free claims)
  function challenge(wallet, listId, ip) {
    const list = activeList(listId);
    const exp = now() + NONCE_TTL, free = list.priceLamports === 0, rec = { kind: 'sol', wallet, list: list.id, free, exp };
    const nonce = newNonce(rec, ip);
    rec.message = solClaimMessage({ domain, wallet, listName: list.name, listId: list.id, free, nonce, expires: exp });
    return { nonce, message: rec.message, expires: exp };
  }
  function proveWallet(wallet, list, nonce, signature) {
    const rec = takeNonce(nonce, r => r.kind === 'sol' && r.wallet === wallet && r.list === list.id && r.free === (list.priceLamports === 0));
    if (!verifySol(rec.message, signature, wallet)) throw new AllowError(401, 'The wallet signature did not check out. Nothing was done.');
  }

  // ---------------------------------------------------------------- paid offers (grants)
  const reusable = (wallet, list, ref) => Object.values(A.grants).find(g => g.wallet === wallet && g.list === list.id && g.unitRef === ref && g.status === 'reserved' && g.tx && now() - g.at < REUSE_MS && grantCurrent(g));
  async function reserve({ wallet, list: listId, unit: ref, nonce, signature }) {
    const list = activeList(listId);
    if (list.priceLamports === 0) throw new AllowError(400, 'That offer is free: claim it instead.');
    checkOpen();
    // the page retrying (cancelled in the wallet) with the signature that made a still-signable reservation gets it back
    const again = reusable(wallet, list, ref), proof = proofOf(nonce, signature);
    if (!(again && proof && again.proof === proof)) proveWallet(wallet, list, nonce, signature);
    return withLocks([`w:${wallet}`, `u:${list.id}:${ref}`], async () => {
      // reuse a reservation whose transaction can still be signed; retire older ones whose blockhash has surely
      // expired, unless we relayed a payment for it (that one may still land and keeps its unit)
      for (const g of Object.values(A.grants)) {
        if (g.wallet !== wallet || g.list !== list.id || g.unitRef !== ref || g.status !== 'reserved') continue;
        if (!grantCurrent(g)) { voidG(g, 'list changed'); continue; }
        if (now() - g.at < REUSE_MS && g.tx) return g;
        if (now() - g.at > RETIRE_MS && !g.relayed) { g.status = 'replaced'; g.replacedAt = now(); }
      }
      const u = await freshUnit(wallet, list, ref);
      checkOpen();
      if (room(list, u, walletLeft(list, wallet)) <= 0) throw new AllowError(409, 'This offer is used up (or your last approval is still pending: try again in two minutes).');
      const ticket = crypto.randomBytes(8).toString('hex');
      const g = { ticket, wallet, list: list.id, listName: list.name, unit: u.unit, unitRef: ref, via: u.via || null, cap: u.cap, nft: pickNft(list, u), nftCap: list.limit,
        price: list.priceLamports, status: 'reserved', at: now(), exp: now() + GRANT_TTL, proof };
      A.grants[ticket] = g;
      save(); event({ allowlist: 'reserved', ticket, wallet, list: list.id, unit: u.unit, nft: g.nft, price: g.price });
      return g;
    });
  }
  // newer unpaid reservations of the same wallet for the same unit: they give way to an older payment that lands on time
  const bumpable = (g) => Object.values(A.grants).filter(x => x !== g && x.wallet === g.wallet && x.list === g.list && x.unit === g.unit && x.status === 'reserved' && !x.relayed && x.at > g.at && activeReservation(x));
  function fits(g) {   // room for a grant that holds nothing right now (retired, or expired by the wall clock)
    const b = bumpable(g);
    if (held(g.list, g.unit, g.ticket) - b.length >= g.cap) return false;
    if (g.nft && nftHeld(g.list, g.nft, g.ticket) - b.filter(x => x.nft === g.nft).length >= (g.nftCap || g.cap)) return false;
    const l = lists.get(g.list);
    if (l?.maxTotal && listHeld(g.list, g.ticket) - b.length >= l.maxTotal) return false;   // the whole list is full
    if (l?.maxPerWallet && walletHeld(g.list, g.wallet, g.via, g.ticket) - b.length >= l.maxPerWallet) return false;   // this collector is full
    return true;
  }
  // The price a payment owes: its grant's, if the grant is for this payer, the payment's block time is before the
  // grant expired and the list still has that price; otherwise null (the caller uses the public price). A grant the
  // wall clock already retired or expired still counts if the unit has room (the watcher may read a payment late).
  // Synchronous: the caller decides and records in one go, with no await in between.
  function grantFor({ ticket, wallet, blockTime }) {
    const g = typeof ticket === 'string' && Object.hasOwn(A.grants, ticket) ? A.grants[ticket] : null;
    if (!g || g.wallet !== wallet) return null;
    if (!['reserved', 'replaced', 'expired'].includes(g.status)) return null;
    const at = blockTime ? blockTime * 1000 : now();
    if (at > g.exp || !grantCurrent(g, at)) return null;
    if (!activeReservation(g) && !fits(g)) return null;
    return g;
  }
  // an open grant /api/submit may relay a payment for
  function openGrant(ticket) {
    const g = typeof ticket === 'string' && Object.hasOwn(A.grants, ticket) ? A.grants[ticket] : null;
    return g && g.status === 'reserved' && now() < g.exp && grantCurrent(g, now()) ? g : null;
  }
  function markRelayed(ticket, signature) { const g = A.grants[ticket]; if (g) { g.relayed = signature; save(); } }
  function settle(g, { verdict, signature, n }) {   // caller saves
    if (verdict === 'ok') {
      const late = !activeReservation(g);
      g.status = 'used'; g.signature = signature; g.n = n; g.usedAt = now();
      (A.usage[g.list] ||= {})[g.unit] = (A.usage[g.list][g.unit] || 0) + 1;
      if (g.nft) (A.nftUsage[g.list] ||= {})[g.nft] = (A.nftUsage[g.list][g.nft] || 0) + 1;
      const lmax = lists.get(g.list)?.maxTotal, wmax = lists.get(g.list)?.maxPerWallet;
      if (late) for (const x of bumpable(g).sort((a, b) => b.at - a.at)) {   // newest first, only as many as needed
        if ((lmax && listHeld(g.list) > lmax) || (wmax && walletHeld(g.list, g.wallet, g.via) > wmax) || held(g.list, g.unit) > g.cap || (g.nft && x.nft === g.nft && nftHeld(g.list, g.nft) > (g.nftCap || g.cap))) voidG(x, 'superseded by an earlier payment');
      }
      forget(g.wallet);
    } else { g.status = 'void'; g.verdict = verdict; g.signature = signature; }
    delete g.tx;
    event({ allowlist: 'grant ' + g.status, ticket: g.ticket, signature, n: n ?? null, verdict });
  }
  function voidGrant(ticket, why) { const g = A.grants[ticket]; if (g && g.status === 'reserved') { g.status = 'void'; g.verdict = why; delete g.tx; save(); } }
  function expireTick() {
    let changed = false;
    for (const g of Object.values(A.grants)) if ((g.status === 'reserved' || g.status === 'replaced') && now() > g.exp + GRANT_GRACE) { g.status = 'expired'; delete g.tx; changed = true; }
    if (changed) save();
  }
  // a list disabled, deleted or repriced voids its open reservations (a payment for one pays the public price)
  function syncLists() {
    let changed = false;
    for (const g of Object.values(A.grants)) if ((g.status === 'reserved' || g.status === 'replaced') && !grantCurrent(g)) { voidG(g, 'list changed'); changed = true; }
    if (changed) save();
  }
  syncLists();   // lists edited by hand + restart

  // ---------------------------------------------------------------- free offers
  async function claimFree({ wallet, list: listId, unit: ref, nonce, signature }) {
    const list = activeList(listId);
    if (list.priceLamports !== 0) throw new AllowError(400, 'That offer is not free: buy it instead.');
    proveWallet(wallet, list, nonce, signature);   // every free claim, Solana and Ethereum lists alike
    checkOpen();
    return withLocks([`w:${wallet}`, `u:${list.id}:${ref}`], async () => {
      const u = await freshUnit(wallet, list, ref);   // Ethereum: only units reached through an ETH address linked to this wallet
      if (room(list, u, walletLeft(list, wallet)) <= 0) throw new AllowError(409, 'This offer is used up.');
      const slot = await getSlot();
      checkOpen();
      if (room(list, u, walletLeft(list, wallet)) <= 0) throw new AllowError(409, 'This offer is used up.');
      const claimId = 'claim-' + crypto.randomBytes(16).toString('hex');
      const unit = u.unit, nft = pickNft(list, u);
      (A.usage[list.id] ||= {})[unit] = (A.usage[list.id][unit] || 0) + 1;
      if (nft) (A.nftUsage[list.id] ||= {})[nft] = (A.nftUsage[list.id][nft] || 0) + 1;
      A.claims[claimId] = { claimId, wallet, list: list.id, unit, nft, via: u.via || null, slot, at: now() };
      const n = createClaimPiece({ wallet, claimId, slot, list: list.id, listName: list.name, unit });   // saves state
      A.claims[claimId].n = n;
      payment({ claim: claimId, wallet, list: list.id, unit, via: u.via || null, verdict: 'claim', n, slot, received: 0 });
      save(); forget(wallet);
      return { n, claimId };
    });
  }

  // ---------------------------------------------------------------- admin view
  function usageReport() {
    return lists.all().map(l => {
      const used = A.usage[l.id] || {};
      const grants = Object.values(A.grants).filter(g => g.list === l.id);
      return {
        id: l.id, name: l.name, chain: l.chain, type: l.type, per: l.per, limit: l.limit, maxTotal: l.maxTotal || null, maxPerWallet: l.maxPerWallet || null, priceSol: l.priceSol, active: listActive(l, now()),
        disabled: l.disabled, start: l.start, end: l.end, wallets: l.wallets?.length ?? null, collection: l.collection || null, contract: l.contract || null, standard: l.standard || null,
        piecesUsed: Object.values(used).reduce((a, n) => a + n, 0), unitsUsed: Object.keys(used).length,
        freeClaims: Object.values(A.claims).filter(c => c.list === l.id).length, paid: grants.filter(g => g.status === 'used').length,
        reservedNow: grants.filter(activeReservation).length, unavailable: l.chain === 'ethereum' && !ethEnabled,
      };
    });
  }
  // who used each list: free claims and paid reservations, with the Ethereum address that made them eligible (admin page)
  function holders() {
    const out = [];
    for (const c of Object.values(A.claims)) out.push({ kind: 'claim', list: c.list, wallet: c.wallet, eth: c.via && c.via.startsWith('0x') ? c.via : null, nft: c.nft || null, unit: c.unit, at: c.at });
    for (const g of Object.values(A.grants)) if (g.status === 'used') out.push({ kind: 'paid', list: g.list, wallet: g.wallet, eth: g.via && g.via.startsWith('0x') ? g.via : null, nft: g.nft || null, unit: g.unit, lamports: g.price, at: g.at });
    const links = Object.entries(A.links).map(([eth, l]) => ({ eth, sol: l.sol, at: l.at }));
    return { uses: out.sort((x, y) => (y.at || 0) - (x.at || 0)), links: links.sort((x, y) => y.at - x.at) };
  }
  const hasHistory = (id) => Object.keys(A.usage[id] || {}).length > 0 || Object.values(A.grants).some(g => g.list === id && activeReservation(g));

  return { offers, preview, ethChallenge, ethLink, reserve, grantFor, openGrant, markRelayed, settle, voidGrant, expireTick, syncLists,
    challenge, claimChallenge: challenge, claimFree, usageReport, holders, hasHistory, held, nftHeld, walletHeld, reservedCount, linkedEths, _nonces: nonces, _locks: locks, _cache: cache };
}

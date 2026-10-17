// Allowlist and holder mints, alongside the public mint. See docs/MINT.md "Allowlists and holder mints".
//
// A list gives eligible wallets a price (0 = free) and a limit. The limit counts per UNIT:
//   per 'wallet': unit = the Solana wallet (Solana lists) or the Ethereum address (Ethereum lists)
//   per 'nft':    unit = the Solana asset id, or `contract:tokenId` (ERC-721), or `contract:tokenId:holder` (ERC-1155)
// so an NFT used once cannot be used again from another wallet.
//
// Paid offers: /api/ticket reserves a unit and creates a GRANT (saved in state.json, survives restarts) whose memo
// ticket carries the discounted price. The payment watcher prices a payment by its grant (same payer, chain time
// before the grant expires); anything else pays the public price. Only an accepted payment consumes the unit.
// Free offers: /api/claim creates a piece directly (Solana lists: signMessage proof; Ethereum lists: the ETH link,
// which the ETH holder signed naming the Solana wallet) after a fresh holdings check.
//
// Concurrency: one process. Every claim/reserve holds a lock on its wallet and on its (list, unit) for its whole
// duration, so two requests for the same unit can never both pass; supply and the unit's room are checked again
// after every await.
import crypto from 'node:crypto';
import { listActive, isSolAddress, isEthAddress } from './lists.mjs';
import { verifySol, ethLinkMessage, solClaimMessage } from './sigs.mjs';

export const GRANT_TTL = 10 * 60000;      // a reservation waits this long for its payment
export const GRANT_GRACE = 3 * 60000;     // and keeps its unit a little longer, so a payment finalizing late cannot double-use it
export const NONCE_TTL = 10 * 60000;
const CACHE_TTL = 30000, MAX_LINKS_PER_SOL = 5;

export class AllowError extends Error { constructor(status, message) { super(message); this.status = status; } }
const UNIT_RE = /^[0-9A-Za-z:]{1,140}$/;
export const isUnit = (s) => typeof s === 'string' && UNIT_RE.test(s);
// The page only ever sees an opaque reference per unit, so an eligibility answer never reveals which Ethereum
// address is linked to a Solana wallet (or which token it holds).
export const unitRef = (unit) => crypto.createHash('sha256').update('slowhorizons-unit:' + unit).digest('hex').slice(0, 24);

export function createAllowlist({ state, save, event = () => {}, payment = () => {}, lists, holdings, verifyEth, ethEnabled, domain,
  maxSupply, minted, mintOpen, getSlot, createClaimPiece, now = Date.now, log = () => {} }) {
  const A = state.allowlist ||= {};
  A.usage ||= {}; A.grants ||= {}; A.links ||= {}; A.claims ||= {};
  const nonces = new Map(), cache = new Map(), locks = new Set();
  const walletSets = new WeakMap();
  const inList = (list, w) => { let s = walletSets.get(list); if (!s) walletSets.set(list, s = new Set(list.wallets)); return s.has(w); };

  async function cached(key, fresh, fn) {
    const c = cache.get(key);
    if (!fresh && c && now() - c.at < CACHE_TTL) return c.val;
    const val = await fn();
    if (cache.size > 5000) for (const [k, v] of cache) if (now() - v.at > CACHE_TTL) cache.delete(k);
    cache.set(key, { at: now(), val });
    return val;
  }
  const forget = (part) => { for (const k of cache.keys()) if (k.includes(part)) cache.delete(k); };

  function linkedEths(sol) {
    return Object.entries(A.links).filter(([, l]) => l.sol === sol).sort((a, b) => b[1].at - a[1].at).slice(0, MAX_LINKS_PER_SOL).map(([e]) => e);
  }
  async function ethUnits(eth, list, fresh) {
    if (list.type === 'wallets') return inList(list, eth) ? [{ unit: eth, cap: list.limit, via: eth }] : [];
    const toks = await cached(`e:${list.id}:${eth}`, fresh, () => holdings.ethereum(eth, list));
    if (list.per === 'wallet') return toks.length ? [{ unit: eth, cap: list.limit, via: eth }] : [];
    return toks.map(t => list.standard === 'erc1155'
      ? { unit: `${list.contract}:${t.tokenId}:${eth}`, cap: list.limit * t.balance, via: eth }
      : { unit: `${list.contract}:${t.tokenId}`, cap: list.limit, via: eth });
  }
  // the units this Solana wallet may use on a list (Ethereum lists: through its linked ETH addresses only)
  async function unitsFor(sol, list, fresh) {
    if (list.chain === 'solana') {
      if (list.type === 'wallets') return inList(list, sol) ? [{ unit: sol, cap: list.limit }] : [];
      const ids = await cached(`s:${list.id}:${sol}`, fresh, () => holdings.solana(sol, list));
      if (list.per === 'wallet') return ids.length ? [{ unit: sol, cap: list.limit }] : [];
      return ids.map(id => ({ unit: id, cap: list.limit }));
    }
    if (!ethEnabled) return [];
    const out = new Map();
    for (const eth of linkedEths(sol)) for (const u of await ethUnits(eth, list, fresh)) if (!out.has(u.unit)) out.set(u.unit, u);
    return [...out.values()];
  }

  const activeReservation = (g) => g.status === 'reserved' && now() < g.exp + GRANT_GRACE;   // a 'replaced' one holds nothing (grantFor checks room if it lands)
  function held(listId, unit, exceptTicket = null) {
    let n = A.usage[listId]?.[unit] || 0;
    for (const g of Object.values(A.grants)) if (g.list === listId && g.unit === unit && g.ticket !== exceptTicket && activeReservation(g)) n++;
    return n;
  }
  const reservedCount = () => Object.values(A.grants).filter(activeReservation).length;
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
    const res = { offers: [], unavailable: [] };
    for (const list of lists.all()) {
      if (!listActive(list, now()) || (chain && list.chain !== chain)) continue;
      if (list.chain === 'ethereum' && (!ethEnabled || !linkedEths(sol).length)) continue;
      let units;
      try { units = await unitsFor(sol, list, fresh); }
      catch (e) { log('eligibility', list.id, e.message); res.unavailable.push({ list: list.id, name: list.name }); continue; }
      if (!units.length) continue;
      const u = units.map(x => ({ unit: unitRef(x.unit), remaining: Math.max(0, x.cap - held(list.id, x.unit)) }));
      res.offers.push({ list: list.id, name: list.name, chain: list.chain, type: list.type, per: list.per, limit: list.limit, price: list.priceLamports,
        remaining: u.reduce((a, x) => a + x.remaining, 0), units: u.filter(x => x.remaining > 0).slice(0, 50) });
    }
    return res;
  }
  // admin preview: any Solana or Ethereum address against every list (Ethereum addresses need no link here)
  async function preview(addr) {
    if (isSolAddress(addr)) return offers(addr, { fresh: true });
    if (!isEthAddress(addr)) throw new AllowError(400, 'Not a Solana or Ethereum address.');
    const eth = addr.toLowerCase(), res = { offers: [], unavailable: [], linkedTo: A.links[eth]?.sol || null };
    for (const list of lists.all().filter(l => l.chain === 'ethereum')) {
      if (!ethEnabled) { res.unavailable.push({ list: list.id, name: list.name, reason: 'ALCHEMY_API_KEY not set' }); continue; }
      let units;
      try { units = await ethUnits(eth, list, true); } catch { res.unavailable.push({ list: list.id, name: list.name }); continue; }
      if (!units.length) continue;
      const u = units.map(x => ({ unit: x.unit, remaining: Math.max(0, x.cap - held(list.id, x.unit)) }));
      res.offers.push({ list: list.id, name: list.name, price: list.priceLamports, active: listActive(list, now()), remaining: u.reduce((a, x) => a + x.remaining, 0), units: u.slice(0, 50) });
    }
    return res;
  }

  // ---------------------------------------------------------------- nonces
  function newNonce(rec) {
    if (nonces.size > 50000) for (const [k, v] of nonces) if (v.exp < now()) nonces.delete(k);
    if (nonces.size > 50000) throw new AllowError(503, 'Too many open requests. Try again in a minute.');
    const nonce = crypto.randomBytes(16).toString('hex');
    nonces.set(nonce, rec);
    return nonce;
  }
  function takeNonce(nonce, check) {   // single use: removed before anything is verified
    const rec = typeof nonce === 'string' ? nonces.get(nonce) : null;
    if (rec) nonces.delete(nonce);
    if (!rec || rec.exp < now() || !check(rec)) throw new AllowError(401, 'That signature request expired or was already used. Start again.');
    return rec;
  }

  // ---------------------------------------------------------------- Ethereum link
  function ethChallenge(sol, eth) {
    if (!ethEnabled) throw new AllowError(503, 'Ethereum holder checks are not available right now.');
    const exp = now() + NONCE_TTL, rec = { kind: 'eth', sol, eth, exp };
    const nonce = newNonce(rec);
    rec.message = ethLinkMessage({ domain, sol, eth, nonce, expires: exp });
    return { nonce, message: rec.message, expires: exp };
  }
  async function ethLink({ sol, eth, signature, nonce }) {
    if (!ethEnabled) throw new AllowError(503, 'Ethereum holder checks are not available right now.');
    const rec = takeNonce(nonce, r => r.kind === 'eth' && r.sol === sol && r.eth.toLowerCase() === eth.toLowerCase());
    if (!(await verifyEth(rec.message, signature, rec.eth))) throw new AllowError(401, 'The Ethereum signature did not check out. Nothing was linked.');
    const key = eth.toLowerCase(), before = A.links[key]?.sol || null;
    A.links[key] = { sol, at: now() };
    forget(key);
    save(); event({ allowlist: 'link', eth: key, sol, before });
    return offers(sol, { fresh: true, chain: 'ethereum' });
  }

  // ---------------------------------------------------------------- paid offers (grants)
  async function reserve({ wallet, list: listId, unit: ref }) {
    const list = activeList(listId);
    if (list.priceLamports === 0) throw new AllowError(400, 'That offer is free: claim it instead.');
    checkOpen();
    return withLocks([`w:${wallet}`, `u:${list.id}:${ref}`], async () => {
      // the same wallet asking again (it cancelled in the wallet): reuse a reservation whose transaction can still be
      // signed, and retire older ones whose blockhash has surely expired (a retired one that still lands keeps its
      // price if the unit has room, see grantFor)
      for (const g of Object.values(A.grants)) {
        if (g.wallet !== wallet || g.list !== list.id || g.unitRef !== ref || g.status !== 'reserved') continue;
        if (now() - g.at < 50000 && g.tx) return g;
        if (now() - g.at > 120000) { g.status = 'replaced'; g.replacedAt = now(); }
      }
      const u = await freshUnit(wallet, list, ref);
      checkOpen();
      if (u.cap - held(list.id, u.unit) <= 0) throw new AllowError(409, 'This offer is used up (or your last approval is still pending: try again in two minutes).');
      const ticket = crypto.randomBytes(8).toString('hex');
      const g = { ticket, wallet, list: list.id, listName: list.name, unit: u.unit, unitRef: ref, via: u.via || null, cap: u.cap, price: list.priceLamports, status: 'reserved', at: now(), exp: now() + GRANT_TTL };
      A.grants[ticket] = g;
      save(); event({ allowlist: 'reserved', ticket, wallet, list: list.id, unit: u.unit, price: g.price });
      return g;
    });
  }
  // The price a payment owes: its grant's, if the grant is for this payer and the payment's block time is before the
  // grant expired; otherwise null (the caller uses the public price). Synchronous: the caller decides and records in
  // one go, with no await in between.
  function grantFor({ ticket, wallet, blockTime }) {
    const g = typeof ticket === 'string' ? A.grants[ticket] : null;
    if (!g || g.wallet !== wallet) return null;
    if (g.status !== 'reserved' && g.status !== 'replaced') return null;
    if ((blockTime ? blockTime * 1000 : now()) > g.exp) return null;
    if (g.status === 'replaced' && held(g.list, g.unit, g.ticket) >= g.cap) return null;
    return g;
  }
  function settle(g, { verdict, signature, n }) {   // caller saves
    if (verdict === 'ok') {
      g.status = 'used'; g.signature = signature; g.n = n; g.usedAt = now();
      (A.usage[g.list] ||= {})[g.unit] = (A.usage[g.list][g.unit] || 0) + 1;
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

  // ---------------------------------------------------------------- free offers
  function claimChallenge(wallet, listId) {
    const list = activeList(listId);
    if (list.priceLamports !== 0 || list.chain !== 'solana') throw new AllowError(400, 'That offer has no signature step.');
    const exp = now() + NONCE_TTL, rec = { kind: 'sol', wallet, list: list.id, exp };
    const nonce = newNonce(rec);
    rec.message = solClaimMessage({ domain, wallet, listName: list.name, nonce, expires: exp });
    return { nonce, message: rec.message, expires: exp };
  }
  async function claimFree({ wallet, list: listId, unit: ref, nonce, signature }) {
    const list = activeList(listId);
    if (list.priceLamports !== 0) throw new AllowError(400, 'That offer is not free: buy it instead.');
    if (list.chain === 'solana') {
      const rec = takeNonce(nonce, r => r.kind === 'sol' && r.wallet === wallet && r.list === list.id);
      if (!verifySol(rec.message, signature, wallet)) throw new AllowError(401, 'The wallet signature did not check out. Nothing was claimed.');
    }
    checkOpen();
    return withLocks([`w:${wallet}`, `u:${list.id}:${ref}`], async () => {
      const u = await freshUnit(wallet, list, ref);   // Ethereum: only units reached through an ETH address linked to this wallet
      if (u.cap - held(list.id, u.unit) <= 0) throw new AllowError(409, 'This offer is used up.');
      const slot = await getSlot();
      checkOpen();
      if (u.cap - held(list.id, u.unit) <= 0) throw new AllowError(409, 'This offer is used up.');
      const claimId = 'claim-' + crypto.randomBytes(16).toString('hex');
      const unit = u.unit;
      (A.usage[list.id] ||= {})[unit] = (A.usage[list.id][unit] || 0) + 1;
      A.claims[claimId] = { claimId, wallet, list: list.id, unit, via: u.via || null, slot, at: now() };
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
        id: l.id, name: l.name, chain: l.chain, type: l.type, per: l.per, limit: l.limit, priceSol: l.priceSol, active: listActive(l, now()),
        disabled: l.disabled, start: l.start, end: l.end, wallets: l.wallets?.length ?? null, collection: l.collection || null, contract: l.contract || null, standard: l.standard || null,
        piecesUsed: Object.values(used).reduce((a, n) => a + n, 0), unitsUsed: Object.keys(used).length,
        freeClaims: Object.values(A.claims).filter(c => c.list === l.id).length, paid: grants.filter(g => g.status === 'used').length,
        reservedNow: grants.filter(activeReservation).length, unavailable: l.chain === 'ethereum' && !ethEnabled,
      };
    });
  }
  const hasHistory = (id) => Object.keys(A.usage[id] || {}).length > 0 || Object.values(A.grants).some(g => g.list === id && activeReservation(g));

  return { offers, preview, ethChallenge, ethLink, reserve, grantFor, settle, voidGrant, expireTick, claimChallenge, claimFree, usageReport, hasHistory, held, reservedCount, linkedEths, _nonces: nonces, _locks: locks };
}

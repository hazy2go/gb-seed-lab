// Admin web page: lists, usage, and running the mint, reachable from anywhere but locked behind every layer below.
// A request must pass ALL of them, in this order; any failure before the session layer answers a plain 404:
//   1. Host header = ADMIN_HOST (other hosts never see admin routes; the public API host keeps its 404s)
//   2. path under the secret ADMIN_PATH prefix
//   3. a valid Cloudflare Access JWT (RS256, team keys, aud, iss, exp) for an email in ADMIN_EMAILS
//   4. a passkey session (user verification required), bound to that Access email: 30 min idle, 8 h max,
//      HttpOnly + Secure + SameSite=Strict cookie, CSRF token and same Origin on every POST
//   5. every write: a fresh passkey assertion whose challenge embeds the hash of the exact action and payload
// Every write is appended to DATA_DIR/admin-audit.jsonl (who, what, before, after) and sent as a Discord alert.
// Logins, setup codes and step-ups share one failure counter per email: 5 failures in 15 min lock it for 15 min (alert).
// The page cannot touch .env things (treasury, public price, network, keys): there is no action for them.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { generateRegistrationOptions, verifyRegistrationResponse, generateAuthenticationOptions, verifyAuthenticationResponse } from '@simplewebauthn/server';
import { openPasskeys, checkSetupCode, consumeSetupCode } from './passkeys.mjs';
import { validateLists, toFile, MAX_LISTS } from '../lists.mjs';

export const IDLE_MS = 30 * 60000, MAX_SESSION_MS = 8 * 3600e3, CHALLENGE_MS = 5 * 60000, STEPUP_MS = 2 * 60000;
export const LOCK_FAILS = 5, LOCK_WINDOW_MS = 15 * 60000, LOCK_MS = 15 * 60000;
export const COOKIE = '__Host-sh_admin';
const CSP = "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; form-action 'none'; frame-ancestors 'none'; base-uri 'none'; manifest-src 'none'";
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };
const sha256 = (s) => crypto.createHash('sha256').update(s).digest();
const canon = (action, payload) => JSON.stringify({ action, payload: payload ?? null });

export function createAdmin({ host, pathPrefix, origin, rpId, access, dataDir, uiDir, fontsDir, ops, alert = () => {}, log = () => {}, now = Date.now }) {
  const passkeys = openPasskeys(dataDir);
  const auditFile = path.join(dataDir, 'admin-audit.jsonl');
  const sessions = new Map();     // sid -> { email, created, last, csrf, cred }
  const pending = new Map();      // challenge (base64url) -> { kind, email, sid?, action?, hash?, code?, name?, exp }
  const failures = new Map();     // email -> { times: [], lockedUntil }
  const buckets = new Map();

  // ------------------------------------------------------------ plumbing
  function headers(extra = {}) {
    return { 'content-security-policy': CSP, 'x-frame-options': 'DENY', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer',
      'x-robots-tag': 'noindex, nofollow, noarchive', 'cache-control': 'no-store', 'strict-transport-security': 'max-age=31536000',
      'cross-origin-opener-policy': 'same-origin', 'cross-origin-resource-policy': 'same-origin', 'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=()', ...extra };
  }
  const json = (res, code, obj, extra) => { res.writeHead(code, headers({ 'content-type': 'application/json', ...extra })); res.end(JSON.stringify(obj)); };
  const notFound = (res) => { res.writeHead(404, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end('{"error":"not found"}'); };
  function rate(ip, key, perMin) {
    const k = ip + ':' + key, t = now(), b = buckets.get(k) || { tokens: perMin, at: t };
    b.tokens = Math.min(perMin, b.tokens + (t - b.at) * perMin / 60000); b.at = t;
    if (buckets.size > 10000) for (const [kk, v] of buckets) if (t - v.at > 600000) buckets.delete(kk);
    if (b.tokens < 1) { buckets.set(k, b); return false; }
    b.tokens -= 1; buckets.set(k, b); return true;
  }
  const body = (req, limit) => new Promise((resolve, reject) => {
    let d = '', size = 0;
    req.on('data', c => { size += c.length; if (size > limit) { reject(Object.assign(new Error('too large'), { status: 413 })); req.destroy(); } else d += c; });
    req.on('end', () => { try { const o = d ? JSON.parse(d) : {}; if (!o || typeof o !== 'object' || Array.isArray(o)) throw new Error('not an object'); resolve(o); } catch { reject(Object.assign(new Error('bad json'), { status: 400 })); } });
    req.on('error', reject);
  });
  const cookieOf = (req) => { const m = String(req.headers.cookie || '').match(new RegExp('(?:^|;\\s*)' + COOKIE.replace(/[-_]/g, '\\$&') + '=([A-Za-z0-9_-]{43})')); return m ? m[1] : null; };
  const safeEq = (a, b) => { const x = Buffer.from(String(a || '')), y = Buffer.from(String(b || '')); return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y); };

  function audit(entry) {
    const fd = fs.openSync(auditFile, 'a', 0o600);
    fs.writeSync(fd, JSON.stringify({ at: new Date(now()).toISOString(), ...entry }) + '\n');
    fs.fsyncSync(fd); fs.closeSync(fd);
  }
  function locked(email) { const f = failures.get(email); return !!(f && f.lockedUntil > now()); }
  function fail(email, ip, what) {
    const f = failures.get(email) || { times: [], lockedUntil: 0 };
    f.times = f.times.filter(t => now() - t < LOCK_WINDOW_MS); f.times.push(now());
    if (f.times.length >= LOCK_FAILS && f.lockedUntil <= now()) {
      f.lockedUntil = now() + LOCK_MS; f.times = [];
      alert('admin-lock', `admin page locked for 15 min after ${LOCK_FAILS} failed ${what} attempts (${email}, last from ${ip})`, { force: true });
      audit({ email, ip, action: 'lockout', ok: false, reason: what });
    }
    failures.set(email, f);
  }
  const clearFails = (email) => failures.delete(email);
  function challengeOf(response) {
    try { return JSON.parse(Buffer.from(String(response?.response?.clientDataJSON || ''), 'base64url').toString('utf8')).challenge; } catch { return null; }
  }
  function takePending(response, check) {
    const ch = challengeOf(response), rec = typeof ch === 'string' ? pending.get(ch) : null;
    if (rec) pending.delete(ch);
    if (!rec || rec.exp < now() || !check(rec)) return null;
    return { ...rec, challenge: ch };
  }
  function prune() { for (const [k, v] of pending) if (v.exp < now()) pending.delete(k); for (const [k, s] of sessions) if (now() - s.last > IDLE_MS || now() - s.created > MAX_SESSION_MS) sessions.delete(k); }
  setInterval(prune, 60000).unref();

  function newSession(res, email, cred) {
    const sid = crypto.randomBytes(32).toString('base64url'), csrf = crypto.randomBytes(32).toString('base64url');
    sessions.set(sid, { email, created: now(), last: now(), csrf, cred });
    return { sid, csrf, cookie: `${COOKIE}=${sid}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${MAX_SESSION_MS / 1000}` };
  }
  function sessionOf(req, who) {
    const sid = cookieOf(req), s = sid ? sessions.get(sid) : null;
    if (!s) return null;
    if (s.email !== who.email || now() - s.last > IDLE_MS || now() - s.created > MAX_SESSION_MS) { sessions.delete(sid); return null; }
    s.last = now();
    return { sid, ...s, ref: s };
  }

  // ------------------------------------------------------------ passkey ceremonies
  async function registrationOptions(email, extra) {
    const opts = await generateRegistrationOptions({
      rpName: 'Slow Horizons admin', rpID: rpId, userName: email, userDisplayName: email, userID: passkeys.userId(), attestationType: 'none',
      excludeCredentials: passkeys.all().map(c => ({ id: c.id, transports: c.transports })),
      authenticatorSelection: { residentKey: 'required', requireResidentKey: true, userVerification: 'required' }, supportedAlgorithmIDs: [-7, -257], timeout: 120000,
    });
    pending.set(opts.challenge, { kind: 'register', email, exp: now() + CHALLENGE_MS, ...extra });
    return opts;
  }
  async function finishRegistration(rec, response, name) {
    const v = await verifyRegistrationResponse({ response, expectedChallenge: rec.challenge, expectedOrigin: origin, expectedRPID: rpId, requireUserVerification: true });
    if (!v.verified) throw new Error('registration not verified');
    const c = v.registrationInfo.credential;
    const cred = { id: c.id, publicKey: Buffer.from(c.publicKey).toString('base64url'), counter: c.counter, transports: c.transports || [], email: rec.email,
      name: String(name || rec.name || 'passkey').replace(/[^\w .,'()-]/g, '').slice(0, 40) || 'passkey', createdAt: new Date(now()).toISOString(), lastUsedAt: null, backedUp: v.registrationInfo.credentialBackedUp };
    passkeys.add(cred);
    return cred;
  }
  async function authOptions(email, challenge) {
    const opts = await generateAuthenticationOptions({ rpID: rpId, userVerification: 'required', timeout: 120000, challenge,
      allowCredentials: passkeys.all().filter(c => c.email === email).map(c => ({ id: c.id, transports: c.transports })) });
    return opts;
  }
  // verify an assertion against a stored passkey of this email; counters must go up (clone detection)
  async function checkAssertion(rec, response, email, ip) {
    const cred = typeof response?.id === 'string' ? passkeys.get(response.id) : null;
    if (!cred || cred.email !== email) return null;
    try {
      const v = await verifyAuthenticationResponse({ response, expectedChallenge: rec.challenge, expectedOrigin: origin, expectedRPID: rpId, requireUserVerification: true,
        credential: { id: cred.id, publicKey: Buffer.from(cred.publicKey, 'base64url'), counter: cred.counter, transports: cred.transports } });
      if (!v.verified || !v.authenticationInfo.userVerified) return null;
      passkeys.touch(cred.id, v.authenticationInfo.newCounter, new Date(now()).toISOString());
      return cred;
    } catch (e) {
      if (/counter/i.test(e.message)) { alert('admin-clone', `passkey "${cred.name}" sent a counter that did not go up: possible cloned key (${email}, ${ip})`, { force: true }); audit({ email, ip, action: 'passkey.counter', ok: false, cred: cred.id }); }
      return null;
    }
  }

  // ------------------------------------------------------------ write actions (each needs a step-up)
  const summarize = (l) => l ? { ...l, wallets: l.wallets ? { count: l.wallets.length, sha256: sha256(l.wallets.join(',')).toString('hex').slice(0, 16) } : undefined } : null;
  function nextListsWith(payload) {
    const raw = payload?.list;
    if (!raw || typeof raw !== 'object') throw new Error('list missing');
    const current = toFile(ops.lists.all()).lists, i = current.findIndex(l => l.id === raw.id);
    if (i < 0 && current.length >= MAX_LISTS) throw new Error(`at most ${MAX_LISTS} lists`);
    const next = i < 0 ? [...current, raw] : current.map((l, k) => k === i ? raw : l);
    return { doc: { version: 1, lists: next }, before: i < 0 ? null : ops.lists.get(raw.id) };
  }
  const ACTIONS = {
    'lists.save': {
      check(p) { const { doc } = nextListsWith(p); return validateLists(doc, { maxPriceLamports: ops.publicPriceLamports }).warnings; },
      run(p) { const { doc, before } = nextListsWith(p); const r = ops.lists.replace(doc); ops.allowlist.syncLists?.(); return { before: summarize(before), after: summarize(ops.lists.get(p.list.id)), warnings: r.warnings }; },
    },
    'lists.delete': {
      check(p) { if (!ops.lists.get(p?.id)) throw new Error('no list with that id'); if (ops.allowlist.hasHistory(p.id)) throw new Error('this list has been used: disable it instead (its usage stays on record)'); },
      run(p) { const before = ops.lists.get(p.id); ops.lists.replace({ version: 1, lists: toFile(ops.lists.all()).lists.filter(l => l.id !== p.id) }); ops.allowlist.syncLists?.(); return { before: summarize(before), after: null }; },
    },
    'lists.toggle': {
      check(p) { if (!ops.lists.get(p?.id)) throw new Error('no list with that id'); if (typeof p.disabled !== 'boolean') throw new Error('disabled must be true or false'); },
      run(p) { const before = ops.lists.get(p.id); ops.lists.replace({ version: 1, lists: toFile(ops.lists.all()).lists.map(l => l.id === p.id ? { ...l, disabled: p.disabled } : l) }); ops.allowlist.syncLists?.(); return { before: { disabled: before.disabled }, after: { disabled: p.disabled } }; },
    },
    'mint.open': { check() {}, run() { return ops.open(); } },
    'mint.close': { check() {}, run() { return ops.close(); } },
    'lane.resume': { check() {}, run() { return ops.resume(); } },
    'piece.requeue': { check(p) { if (!Number.isInteger(p?.n) || p.n < 1) throw new Error('n must be a piece number'); }, run(p) { return ops.requeue(p.n); } },
    'refund.mark': {
      check(p) { if (!Number.isInteger(p?.id) || p.id < 1) throw new Error('refund id required'); if (typeof p.signature !== 'string' || !/^[1-9A-HJ-NP-Za-km-z]{64,90}$/.test(p.signature)) throw new Error('the refund transaction signature (base58) is required'); },
      run(p) { return ops.refunded(p.id, p.signature); },
    },
    'passkey.add': { check(p) { if (p?.name != null && (typeof p.name !== 'string' || p.name.length > 40)) throw new Error('name: up to 40 characters'); }, run: null },
    'passkey.remove': {
      check(p) { const c = passkeys.get(p?.id); if (!c) throw new Error('no such passkey'); if (passkeys.count() < 2) throw new Error('this is the last passkey: add another one first'); },
      run(p) { const c = passkeys.get(p.id); passkeys.remove(p.id); return { before: { id: c.id, name: c.name, email: c.email }, after: null }; },
    },
  };

  // ------------------------------------------------------------ API
  async function api(req, res, route, who, url, ip) {
    const post = req.method === 'POST';
    if (post) {   // browsers send Origin on every fetch POST; refuse anything else (CSRF defence in depth)
      if (req.headers.origin !== origin) return json(res, 403, { error: 'bad origin' });
      if (req.headers['sec-fetch-site'] && req.headers['sec-fetch-site'] !== 'same-origin') return json(res, 403, { error: 'bad origin' });
    }
    const email = who.email;
    const s = sessionOf(req, who);

    if (route === 'me' && !post) return json(res, 200, { email, passkeys: passkeys.count(), loggedIn: !!s, csrf: s ? s.csrf : null, locked: locked(email), sessionIdleMin: IDLE_MS / 60000 });

    // ---- first passkey (or recovery): one-time setup code from the Mac mini
    if (route === 'setup/options' && post) {
      if (!rate(ip, 'login', 30)) return json(res, 429, { error: 'Too many tries. Wait a minute.' });
      if (locked(email)) return json(res, 423, { error: 'Locked for 15 minutes after repeated failures.' });
      const { code } = await body(req, 4096);
      if (!checkSetupCode(dataDir, code, now())) { fail(email, ip, 'setup code'); audit({ email, ip, action: 'setup.code', ok: false }); return json(res, 403, { error: 'That setup code is wrong, used or expired. Make a new one on the Mac mini.' }); }
      return json(res, 200, await registrationOptions(email, { via: 'setup', code: sha256(String(code).trim().toUpperCase()).toString('hex') }));
    }
    if (route === 'setup/verify' && post) {
      if (!rate(ip, 'login', 30)) return json(res, 429, { error: 'Too many tries. Wait a minute.' });
      if (locked(email)) return json(res, 423, { error: 'Locked for 15 minutes after repeated failures.' });
      const { code, response, name } = await body(req, 65536);
      const rec = takePending(response, r => r.kind === 'register' && r.via === 'setup' && r.email === email && r.code === sha256(String(code || '').trim().toUpperCase()).toString('hex'));
      if (!rec || !consumeSetupCode(dataDir, code, now())) { fail(email, ip, 'setup'); return json(res, 403, { error: 'Setup expired or the code was already used. Start again.' }); }
      let cred;
      try { cred = await finishRegistration(rec, response, name); } catch (e) { fail(email, ip, 'setup'); audit({ email, ip, action: 'passkey.register', ok: false, error: e.message }); return json(res, 400, { error: 'The passkey could not be verified.' }); }
      const ns = newSession(res, email, cred.id);
      audit({ email, ip, action: 'passkey.register', via: 'setup code', ok: true, after: { id: cred.id, name: cred.name } });
      alert('admin', `admin passkey "${cred.name}" registered with a setup code (${email})`, { force: true });
      clearFails(email);
      return json(res, 200, { ok: true, csrf: ns.csrf }, { 'set-cookie': ns.cookie });
    }

    // ---- login
    if (route === 'login/options' && post) {
      if (!rate(ip, 'login', 30)) return json(res, 429, { error: 'Too many tries. Wait a minute.' });
      if (locked(email)) return json(res, 423, { error: 'Locked for 15 minutes after repeated failures.' });
      if (!passkeys.all().some(c => c.email === email)) return json(res, 409, { error: 'No passkey for this email yet. Use a setup code.' });
      const opts = await authOptions(email);
      pending.set(opts.challenge, { kind: 'login', email, exp: now() + CHALLENGE_MS });
      return json(res, 200, opts);
    }
    if (route === 'login/verify' && post) {
      if (!rate(ip, 'login', 30)) return json(res, 429, { error: 'Too many tries. Wait a minute.' });
      if (locked(email)) return json(res, 423, { error: 'Locked for 15 minutes after repeated failures.' });
      const { response } = await body(req, 65536);
      const rec = takePending(response, r => r.kind === 'login' && r.email === email);
      const cred = rec && await checkAssertion(rec, response, email, ip);
      if (!cred) { fail(email, ip, 'login'); audit({ email, ip, action: 'login', ok: false }); return json(res, 401, { error: 'The passkey was not accepted.' }); }
      clearFails(email);
      const ns = newSession(res, email, cred.id);
      audit({ email, ip, action: 'login', ok: true, cred: cred.id });
      return json(res, 200, { ok: true, csrf: ns.csrf }, { 'set-cookie': ns.cookie });
    }

    // ---- everything below needs a session; POSTs also the CSRF token
    if (!s) return json(res, 401, { error: 'Not signed in.' });
    if (post && !safeEq(req.headers['x-csrf'], s.csrf)) return json(res, 403, { error: 'Missing or wrong CSRF token. Reload the page.' });

    if (route === 'logout' && post) { sessions.delete(s.sid); audit({ email, ip, action: 'logout', ok: true }); return json(res, 200, { ok: true }, { 'set-cookie': `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0` }); }
    if (route === 'status' && !post) return json(res, 200, ops.status());
    if (route === 'lists' && !post) return json(res, 200, { lists: toFile(ops.lists.all()).lists, usage: ops.allowlist.usageReport(), warnings: ops.lists.warnings(), eth: ops.ethEnabled, publicPriceSol: ops.publicPriceLamports / 1e9 });
    if (route === 'refunds' && !post) return json(res, 200, { refunds: ops.refunds() });
    if (route === 'passkeys' && !post) return json(res, 200, { passkeys: passkeys.all().map(c => ({ id: c.id, name: c.name, email: c.email, createdAt: c.createdAt, lastUsedAt: c.lastUsedAt, current: c.id === s.cred })) });
    if (route === 'audit' && !post) {
      let lines = [];
      try { lines = fs.readFileSync(auditFile, 'utf8').trim().split('\n').slice(-60).reverse().map(l => JSON.parse(l)); } catch { /* none yet */ }
      return json(res, 200, { entries: lines.map(e => ({ at: e.at, email: e.email, action: e.action, ok: e.ok, ip: e.ip })) });
    }
    if (route === 'check' && !post) {
      if (!rate(ip, 'check', 20)) return json(res, 429, { error: 'Too many checks. Wait a minute.' });
      const addr = url.searchParams.get('addr') || '';
      if (addr.length > 60) return json(res, 400, { error: 'Not an address.' });
      try { return json(res, 200, await ops.allowlist.preview(addr.trim())); } catch (e) { return json(res, e.status || 500, { error: e.status ? e.message : 'Check failed.' }); }
    }
    if (route === 'lists/validate' && post) {
      const p = await body(req, 2 << 20);
      try { return json(res, 200, { ok: true, warnings: ACTIONS['lists.save'].check(p) || [] }); } catch (e) { return json(res, 200, { ok: false, error: e.message }); }
    }

    // ---- step-up: a challenge that embeds the hash of this exact action + payload
    if (route === 'stepup' && post) {
      if (!rate(ip, 'stepup', 20)) return json(res, 429, { error: 'Too many tries. Wait a minute.' });
      if (locked(email)) return json(res, 423, { error: 'Locked for 15 minutes after repeated failures.' });
      const { action, payload } = await body(req, 2 << 20);
      const A = typeof action === 'string' && Object.hasOwn(ACTIONS, action) ? ACTIONS[action] : null;
      if (!A) return json(res, 400, { error: 'Unknown action.' });
      let warnings;
      try { warnings = A.check(payload) || []; } catch (e) { return json(res, 400, { error: e.message }); }
      const hash = sha256(canon(action, payload));
      const challenge = Buffer.concat([crypto.randomBytes(16), hash]);
      const opts = await authOptions(email, challenge);
      pending.set(opts.challenge, { kind: 'stepup', email, sid: s.sid, action, hash: hash.toString('hex'), exp: now() + STEPUP_MS });
      return json(res, 200, { options: opts, warnings });
    }
    if (route === 'action' && post) {
      if (!rate(ip, 'stepup', 20)) return json(res, 429, { error: 'Too many tries. Wait a minute.' });
      if (locked(email)) return json(res, 423, { error: 'Locked for 15 minutes after repeated failures.' });
      const { action, payload, response } = await body(req, 2 << 20);
      const hash = sha256(canon(action, payload)).toString('hex');
      const rec = takePending(response, r => r.kind === 'stepup' && r.email === email && r.sid === s.sid && r.action === action && r.hash === hash);
      const cred = rec && await checkAssertion(rec, response, email, ip);
      if (!cred) { fail(email, ip, 'confirmation'); audit({ email, ip, action, ok: false, reason: 'step-up failed' }); return json(res, 401, { error: 'The passkey confirmation was not accepted. Nothing was changed.' }); }
      clearFails(email);
      const A = ACTIONS[action];
      try { A.check(payload); } catch (e) { return json(res, 400, { error: e.message }); }   // state may have moved since the step-up
      if (action === 'passkey.add') {
        const opts = await registrationOptions(email, { via: 'add', sid: s.sid, name: payload?.name });
        audit({ email, ip, cred: cred.id, action: 'passkey.add.start', payload, ok: true });
        return json(res, 200, { register: opts });
      }
      let out;
      try { out = A.run(payload) || {}; }
      catch (e) { audit({ email, ip, cred: cred.id, action, payload: summarizePayload(action, payload), ok: false, error: e.message }); return json(res, 400, { error: e.message }); }
      audit({ email, ip, cred: cred.id, action, payload: summarizePayload(action, payload), before: out.before ?? null, after: out.after ?? null, ok: true });
      alert('admin', `admin ${action} by ${email}: ${describe(action, payload)}`, { force: true });
      return json(res, 200, { ok: true, ...out });
    }
    if (route === 'passkey/verify' && post) {
      const { response } = await body(req, 65536);
      const rec = takePending(response, r => r.kind === 'register' && r.via === 'add' && r.email === email && r.sid === s.sid);
      if (!rec) return json(res, 403, { error: 'That registration expired. Start again.' });
      let cred;
      try { cred = await finishRegistration(rec, response); } catch (e) { audit({ email, ip, action: 'passkey.register', ok: false, error: e.message }); return json(res, 400, { error: 'The passkey could not be verified.' }); }
      audit({ email, ip, cred: s.cred, action: 'passkey.register', via: 'session + step-up', ok: true, after: { id: cred.id, name: cred.name } });
      alert('admin', `admin passkey "${cred.name}" added (${email})`, { force: true });
      return json(res, 200, { ok: true });
    }
    return json(res, 404, { error: 'not found' });
  }
  function summarizePayload(action, p) { return action === 'lists.save' ? { list: summarize(p?.list) } : p ?? null; }
  function describe(action, p) {
    if (action === 'lists.save') return `list "${p.list.id}" (${p.list.name}, ${p.list.priceSol} SOL, limit ${p.list.limit} per ${p.list.per})`;
    if (action === 'lists.delete' || action === 'lists.toggle') return `list "${p.id}"${action === 'lists.toggle' ? (p.disabled ? ' disabled' : ' enabled') : ''}`;
    if (action === 'piece.requeue') return `No. ${p.n}`;
    if (action === 'refund.mark') return `refund ${p.id}`;
    return '';
  }

  // ------------------------------------------------------------ static files
  function serve(res, rel) {
    let root = uiDir;
    if (rel.startsWith('fonts/')) { root = fontsDir; rel = rel.slice(6); }
    let f;
    try { f = fs.realpathSync(path.join(root, path.normalize('/' + rel))); } catch { return notFound(res); }
    const r = fs.realpathSync(root);
    if (!f.startsWith(r + path.sep) || !fs.statSync(f).isFile() || !TYPES[path.extname(f)]) return notFound(res);
    res.writeHead(200, headers({ 'content-type': TYPES[path.extname(f)] }));
    fs.createReadStream(f).on('error', () => res.destroy()).pipe(res);
  }

  const matches = (req) => String(req.headers.host || '').toLowerCase().replace(/:\d+$/, '') === host;
  async function handle(req, res, url, ip) {
    const p = url.pathname;
    if (!(p === pathPrefix || p.startsWith(pathPrefix + '/'))) return notFound(res);
    if (!rate(ip, 'all', 300)) return notFound(res);
    const who = await access.verify(req.headers['cf-access-jwt-assertion']);
    if (!who) return notFound(res);
    const rest = p.slice(pathPrefix.length);
    if (rest === '') { res.writeHead(302, headers({ location: pathPrefix + '/' })); return res.end(); }
    if (rest === '/' && req.method === 'GET') return serve(res, 'index.html');
    if (rest.startsWith('/ui/') && req.method === 'GET') return serve(res, rest.slice(4));
    if (rest.startsWith('/api/')) {
      try { return await api(req, res, rest.slice(5), who, url, ip); }
      catch (e) { if (!res.headersSent) json(res, e.status || 500, { error: e.status ? e.message : 'Something went wrong.' }); if (!e.status) log('admin error', e.stack); return; }
    }
    return notFound(res);
  }
  return { matches, handle, passkeyCount: () => passkeys.count(), _sessions: sessions, _pending: pending, _failures: failures };
}

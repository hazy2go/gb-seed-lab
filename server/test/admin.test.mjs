// Admin page: Cloudflare Access JWT, passkeys (software authenticator), sessions, CSRF, step-up, lockout, audit.
//   node --test test/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { createAdmin, LOCK_FAILS } from '../src/admin/admin.mjs';
import { createAccessVerifier } from '../src/admin/access.mjs';
import { issueSetupCode } from '../src/admin/passkeys.mjs';
import { openLists } from '../src/lists.mjs';
import { request, accessKeys, signJwt } from './helpers/http.mjs';
import { createAuthenticator } from './helpers/authenticator.mjs';

const HOST = 'admin.test', PREFIX = '/k3J9xQ2mP7vR4tW8yZ1a', ORIGIN = 'https://admin.test', TEAM = 'gblabs', AUD = 'a'.repeat(64);
const SERVER_DIR = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

async function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sh-admin-'));
  const keys = accessKeys();
  let clock = Date.now();
  const now = () => clock;
  const alerts = [];
  const fetchImpl = async (url) => { assert.equal(url, `https://${TEAM}.cloudflareaccess.com/cdn-cgi/access/certs`); return { ok: true, json: async () => ({ keys: [keys.jwk] }) }; };
  const access = createAccessVerifier({ team: TEAM, aud: AUD, emails: ['hazy@example.com', 'other@example.com'], fetchImpl, now });
  const lists = openLists({ dataDir: dir, maxPriceLamports: 50_000_000 });
  let closed = true;
  const ops = {
    lists, ethEnabled: false, publicPriceLamports: 50_000_000,
    allowlist: { usageReport: () => [], hasHistory: () => false, preview: async () => ({ offers: [], unavailable: [] }) },
    status: () => ({ closed }), refunds: () => [],
    open() { const b = closed; closed = false; return { before: { closed: b }, after: { closed: false } }; },
    close() { const b = closed; closed = true; return { before: { closed: b }, after: { closed: true } }; },
    resume: () => ({}), requeue: () => ({}), refunded: () => ({}),
  };
  const admin = createAdmin({ host: HOST, pathPrefix: PREFIX, origin: ORIGIN, rpId: HOST, access, dataDir: dir, uiDir: path.join(SERVER_DIR, 'admin-ui'), fontsDir: path.join(SERVER_DIR, '..', 'web', 'fonts'), ops, alert: (kind, text, o) => alerts.push({ kind, text, o }), now });
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    if (admin.matches(req)) return admin.handle(req, res, url, '127.0.0.1');
    res.writeHead(404); res.end('{"error":"not found"}');
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const jwt = (over = {}) => signJwt(keys, { iss: `https://${TEAM}.cloudflareaccess.com`, aud: [AUD], email: 'hazy@example.com', exp: Math.floor(clock / 1000) + 600, iat: Math.floor(clock / 1000), sub: 'u1', ...over });
  const H = (extra = {}) => ({ host: HOST, 'cf-access-jwt-assertion': jwt(), ...extra });
  let cookie = null, csrf = null;
  const call = (method, route, body, extra = {}) => request(port, method, PREFIX + '/api/' + route, { body, headers: { ...H(), ...(method === 'POST' ? { origin: ORIGIN } : {}), ...(cookie ? { cookie } : {}), ...(csrf ? { 'x-csrf': csrf } : {}), ...extra } });
  const auth = createAuthenticator({ rpId: HOST, origin: ORIGIN });
  async function register(name = 'test key') {
    const { code } = issueSetupCode(dir, clock);
    const o = await call('POST', 'setup/options', { code });
    assert.equal(o.status, 200, o.body);
    const v = await call('POST', 'setup/verify', { code, response: auth.register(o.json), name });
    assert.equal(v.status, 200, v.body);
    cookie = v.headers['set-cookie'][0].split(';')[0]; csrf = v.json.csrf;
    return code;
  }
  async function login() {
    cookie = null; csrf = null;
    const o = await call('POST', 'login/options', {});
    const v = await call('POST', 'login/verify', { response: auth.assert(o.json) });
    if (v.status === 200) { cookie = v.headers['set-cookie'][0].split(';')[0]; csrf = v.json.csrf; }
    return v;
  }
  async function stepAction(action, payload, tamper) {
    const s = await call('POST', 'stepup', { action, payload });
    if (s.status !== 200) return s;
    return call('POST', 'action', { action, payload: tamper ?? payload, response: auth.assert(s.json.options) });
  }
  return { dir, port, server, admin, call, H, jwt, auth, register, login, stepAction, alerts, lists, setCookie: (c, x) => { cookie = c; csrf = x; }, get cookie() { return cookie; }, get csrf() { return csrf; }, advance: (ms) => { clock += ms; }, ops };
}

test('every layer before the session answers 404: host, path, Access JWT (signature, aud, iss, exp, email)', async (t) => {
  const s = await setup(); t.after(() => s.server.close());
  const me = (headers, p = PREFIX + '/api/me') => request(s.port, 'GET', p, { headers });
  assert.equal((await me(s.H())).status, 200, 'valid');
  assert.equal((await me(s.H({ host: 'api.gameboylabs.xyz' }))).status, 404, 'public API host');
  assert.equal((await me(s.H(), '/admin/status')).status, 404, 'old admin path on the admin host');
  assert.equal((await me(s.H(), '/wrongprefix0123456789/api/me')).status, 404, 'wrong secret path');
  assert.equal((await me({ host: HOST })).status, 404, 'no JWT');
  assert.equal((await me(s.H({ 'cf-access-jwt-assertion': s.jwt({ exp: Math.floor(Date.now() / 1000) - 5 }) }))).status, 404, 'expired');
  assert.equal((await me(s.H({ 'cf-access-jwt-assertion': s.jwt({ aud: ['b'.repeat(64)] }) }))).status, 404, 'wrong aud');
  assert.equal((await me(s.H({ 'cf-access-jwt-assertion': s.jwt({ iss: 'https://evil.cloudflareaccess.com' }) }))).status, 404, 'wrong iss');
  assert.equal((await me(s.H({ 'cf-access-jwt-assertion': s.jwt({ email: 'mallory@example.com' }) }))).status, 404, 'email not allowed');
  const good = s.jwt(), [h, b, sig] = good.split('.');
  const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(b, 'base64url')), email: 'hazy@example.com', aud: [AUD], exp: 9999999999 })).toString('base64url');
  assert.equal((await me(s.H({ 'cf-access-jwt-assertion': `${h}.${forged}.${sig}` }))).status, 404, 'tampered payload');
  const other = accessKeys('test-kid');
  assert.equal((await me(s.H({ 'cf-access-jwt-assertion': signJwt(other, JSON.parse(Buffer.from(b, 'base64url'))) }))).status, 404, 'signed by another key');
  const page = await request(s.port, 'GET', PREFIX + '/', { headers: s.H() });
  assert.equal(page.status, 200);
  assert.match(page.headers['content-security-policy'], /script-src 'self'/);
  assert.match(page.headers['content-security-policy'], /frame-ancestors 'none'/);
  assert.match(page.headers['x-robots-tag'], /noindex/);
  assert.ok(!/<script>/.test(page.body) && !/ on[a-z]+=/.test(page.body), 'no inline script or handlers');
});

test('setup code registers the first passkey once; login needs user verification; counters detect clones', async (t) => {
  const s = await setup(); t.after(() => s.server.close());
  const bad = await s.call('POST', 'setup/options', { code: 'AAAA-BBBB-CCCC-DDDD' });
  assert.equal(bad.status, 403);
  const code = await s.register('iPhone');
  const reuse = await s.call('POST', 'setup/options', { code });
  assert.equal(reuse.status, 403, 'a setup code works once');
  const me = await s.call('GET', 'me');
  assert.equal(me.json.loggedIn, true); assert.equal(me.json.passkeys, 1);
  assert.match((await s.call('GET', 'status')).body, /closed/);
  // sign in again
  assert.equal((await s.login()).status, 200);
  // an assertion without user verification is refused
  const o = await s.call('POST', 'login/options', {});
  const noUv = createAuthenticator({ rpId: HOST, origin: ORIGIN, uv: false });
  assert.equal((await s.call('POST', 'login/verify', { response: noUv.assert(o.json) })).status, 401);
  // a counter that does not go up: refused and alerted
  const o2 = await s.call('POST', 'login/options', {});
  const replay = await s.call('POST', 'login/verify', { response: s.auth.assert(o2.json, { counterOverride: 1 }) });
  assert.equal(replay.status, 401);
  assert.ok(s.alerts.some(a => a.kind === 'admin-clone'));
  // wrong origin (phishing page) refused
  const o3 = await s.call('POST', 'login/options', {});
  assert.equal((await s.call('POST', 'login/verify', { response: s.auth.assert(o3.json, { originOverride: 'https://admin.test.evil' }) })).status, 401);
  // a challenge is single use
  const o4 = await s.call('POST', 'login/options', {});
  const a4 = s.auth.assert(o4.json);
  assert.equal((await s.call('POST', 'login/verify', { response: a4 })).status, 200);
  assert.equal((await s.call('POST', 'login/verify', { response: s.auth.assert(o4.json) })).status, 401);
});

test('sessions: CSRF and Origin on every POST, bound to the Access email, 30 min idle', async (t) => {
  const s = await setup(); t.after(() => s.server.close());
  await s.register();
  const cookie = s.cookie, csrf = s.csrf;
  assert.match(fs.readFileSync(path.join(s.dir, 'admin.json'), 'utf8'), /publicKey/);
  assert.equal((fs.statSync(path.join(s.dir, 'admin.json')).mode & 0o777), 0o600);
  s.setCookie(cookie, null);
  assert.equal((await s.call('POST', 'stepup', { action: 'mint.open', payload: {} })).status, 403, 'no CSRF token');
  s.setCookie(cookie, 'x'.repeat(43));
  assert.equal((await s.call('POST', 'stepup', { action: 'mint.open', payload: {} })).status, 403, 'wrong CSRF token');
  s.setCookie(cookie, csrf);
  assert.equal((await s.call('POST', 'stepup', { action: 'mint.open', payload: {} }, { origin: 'https://evil.example' })).status, 403, 'foreign Origin');
  assert.equal((await s.call('POST', 'stepup', { action: 'mint.open', payload: {} }, { 'sec-fetch-site': 'cross-site' })).status, 403, 'cross-site fetch');
  assert.equal((await s.call('POST', 'stepup', { action: 'mint.open', payload: {} })).status, 200, 'all good');
  // the same cookie with another (allowed) Access identity: not this session
  const other = await s.call('GET', 'status', undefined, { 'cf-access-jwt-assertion': s.jwt({ email: 'other@example.com' }) });
  assert.equal(other.status, 401);
  // that also ended the session for good
  assert.equal((await s.call('GET', 'status')).status, 401);
  assert.equal((await s.login()).status, 200);
  s.advance(31 * 60000);
  assert.equal((await s.call('GET', 'status')).status, 401, 'idle 31 min');
});

test('step-up: a write needs a fresh passkey assertion bound to the exact payload; audit + alert', async (t) => {
  const s = await setup(); t.after(() => s.server.close());
  await s.register();
  const list = { id: 'og', name: 'OG allowlist', chain: 'solana', type: 'wallets', wallets: ['9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin'], priceSol: 0, limit: 2, per: 'wallet' };
  // no step-up at all
  assert.equal((await s.call('POST', 'action', { action: 'lists.save', payload: { list } })).status, 401);
  // step-up for one payload, then send another (price changed): refused, nothing saved
  const tampered = await s.stepAction('lists.save', { list }, { list: { ...list, limit: 100 } });
  assert.equal(tampered.status, 401);
  assert.equal(s.lists.all().length, 0);
  // invalid list refused before the passkey is asked
  assert.equal((await s.call('POST', 'stepup', { action: 'lists.save', payload: { list: { ...list, priceSol: 1 } } })).status, 400);
  // the real thing
  const ok = await s.stepAction('lists.save', { list });
  assert.equal(ok.status, 200, ok.body);
  assert.equal(s.lists.get('og').limit, 2);
  assert.ok(fs.existsSync(path.join(s.dir, 'lists.json')));
  const opened = await s.stepAction('mint.open', {});
  assert.equal(opened.status, 200);
  const audit = fs.readFileSync(path.join(s.dir, 'admin-audit.jsonl'), 'utf8').trim().split('\n').map(l => JSON.parse(l));
  const saved = audit.find(e => e.action === 'lists.save' && e.ok);
  assert.equal(saved.email, 'hazy@example.com');
  assert.equal(saved.before, null);
  assert.equal(saved.after.wallets.count, 1);
  assert.deepEqual(audit.find(e => e.action === 'mint.open').after, { closed: false });
  assert.ok(audit.some(e => e.action === 'lists.save' && e.ok === false), 'the failed attempt is on record');
  assert.ok(s.alerts.some(a => a.kind === 'admin' && a.text.includes('lists.save') && a.o?.force));
  // unknown actions (e.g. anything .env) do not exist
  assert.equal((await s.call('POST', 'stepup', { action: 'config.treasury', payload: { treasury: 'x' } })).status, 400);
  // a second passkey: session + step-up, then registration
  const s2 = await s.stepAction('passkey.add', { name: 'backup' });
  assert.equal(s2.status, 200);
  const backup = createAuthenticator({ rpId: HOST, origin: ORIGIN });
  const reg = await s.call('POST', 'passkey/verify', { response: backup.register(s2.json.register) });
  assert.equal(reg.status, 200, reg.body);
  assert.equal((await s.call('GET', 'passkeys')).json.passkeys.length, 2);
});

test('lockout: repeated failed logins lock the email for 15 min and alert', async (t) => {
  const s = await setup(); t.after(() => s.server.close());
  await s.register();
  const evil = createAuthenticator({ rpId: HOST, origin: ORIGIN });
  for (let i = 0; i < LOCK_FAILS; i++) {
    const o = await s.call('POST', 'login/options', {});
    const r = await s.call('POST', 'login/verify', { response: { ...evil.assert(o.json), id: s.auth.id, rawId: s.auth.id } });
    assert.equal(r.status, 401);
  }
  assert.equal((await s.call('POST', 'login/options', {})).status, 423);
  assert.ok(s.alerts.some(a => a.kind === 'admin-lock'));
  assert.ok(fs.readFileSync(path.join(s.dir, 'admin-audit.jsonl'), 'utf8').includes('"lockout"'));
  s.advance(16 * 60000);
  assert.equal((await s.login()).status, 200, 'unlocked after 15 min');
});

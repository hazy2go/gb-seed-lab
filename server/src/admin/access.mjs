// Cloudflare Access: every admin request carries Cf-Access-Jwt-Assertion, an RS256 JWT signed by the team's keys.
// We check signature, issuer, audience (the Access application's AUD tag), expiry and the email allow-list.
// Keys come from https://<team>.cloudflareaccess.com/cdn-cgi/access/certs (fixed host from .env, never from a request),
// cached for an hour and refetched for an unknown key id at most every 30 s. Anything wrong = null (the caller 404s).
import crypto from 'node:crypto';

const b64json = (s) => JSON.parse(Buffer.from(s, 'base64url').toString('utf8'));

export function createAccessVerifier({ team, aud, emails, fetchImpl = globalThis.fetch, now = Date.now, log = () => {} }) {
  if (!/^[a-z0-9-]{1,63}$/.test(team || '')) throw new Error('bad CF_ACCESS_TEAM');
  const iss = `https://${team}.cloudflareaccess.com`, certsUrl = `${iss}/cdn-cgi/access/certs`;
  const allowed = new Set((emails || []).map(e => e.toLowerCase()));
  let keys = new Map(), fetchedAt = 0, lastTry = 0, inflight = null;

  async function refresh() {
    if (inflight) return inflight;
    if (now() - lastTry < 30000) return;
    lastTry = now();
    inflight = (async () => {
      try {
        const r = await fetchImpl(certsUrl, { signal: AbortSignal.timeout(8000), redirect: 'error' });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const j = await r.json(), next = new Map();
        for (const k of j.keys || []) {
          if (k.kty !== 'RSA' || typeof k.kid !== 'string') continue;
          try { next.set(k.kid, crypto.createPublicKey({ key: { kty: 'RSA', n: k.n, e: k.e }, format: 'jwk' })); } catch { /* skip a bad key */ }
        }
        if (next.size) { keys = next; fetchedAt = now(); }
      } catch (e) { log('access certs:', e.message); }
      finally { inflight = null; }
    })();
    return inflight;
  }

  async function verify(token) {
    if (typeof token !== 'string' || token.length > 8192) return null;
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    let header, payload;
    try { header = b64json(parts[0]); payload = b64json(parts[1]); } catch { return null; }
    if (header.alg !== 'RS256' || typeof header.kid !== 'string') return null;
    if (!keys.has(header.kid) || now() - fetchedAt > 3600e3) await refresh();
    const key = keys.get(header.kid);
    if (!key) return null;
    let ok = false;
    try { ok = crypto.verify('RSA-SHA256', Buffer.from(parts[0] + '.' + parts[1]), key, Buffer.from(parts[2], 'base64url')); } catch { return null; }
    if (!ok) return null;
    const t = now() / 1000;
    if (payload.iss !== iss) return null;
    const auds = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (!auds.includes(aud)) return null;
    if (typeof payload.exp !== 'number' || payload.exp <= t) return null;
    if (typeof payload.nbf === 'number' && payload.nbf > t + 60) return null;
    if (typeof payload.iat === 'number' && payload.iat > t + 60) return null;
    const email = typeof payload.email === 'string' ? payload.email.toLowerCase() : '';
    if (!email || !allowed.has(email)) return null;
    return { email, sub: typeof payload.sub === 'string' ? payload.sub : null };
  }
  return { verify, certsUrl, iss };
}

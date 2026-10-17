// Tiny HTTP client for tests that need to set the Host header (fetch does not allow it).
import http from 'node:http';

export function request(port, method, path, { headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const data = body === undefined ? null : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
    const r = http.request({ host: '127.0.0.1', port, method, path, headers: { ...(data ? { 'content-type': 'application/json', 'content-length': data.length } : {}), ...headers } }, (res) => {
      let d = '';
      res.on('data', (c) => { d += c; });
      res.on('end', () => { let json = null; try { json = JSON.parse(d); } catch { /* not json */ } resolve({ status: res.statusCode, headers: res.headers, body: d, json }); });
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

// RS256 JWT like Cloudflare Access issues, signed with a local test key
import crypto from 'node:crypto';
export function accessKeys(kid = 'test-kid') {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  return { kid, privateKey, jwk: { ...publicKey.export({ format: 'jwk' }), kid, alg: 'RS256', use: 'sig' } };
}
export function signJwt(keys, payload, { alg = 'RS256' } = {}) {
  const enc = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const head = enc({ alg, kid: keys.kid, typ: 'JWT' }), body = enc(payload);
  const sig = crypto.sign('RSA-SHA256', Buffer.from(head + '.' + body), keys.privateKey).toString('base64url');
  return `${head}.${body}.${sig}`;
}

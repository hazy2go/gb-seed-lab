// A software passkey for tests: ES256 key, "none" attestation, user presence + verification flags, a counter.
// Produces the same JSON a browser's navigator.credentials gives @simplewebauthn/browser.
import crypto from 'node:crypto';

function cbor(v) {   // the small CBOR subset WebAuthn needs: unsigned/negative ints, byte strings, text, maps
  const head = (major, n) => n < 24 ? Buffer.from([major << 5 | n]) : n < 256 ? Buffer.from([major << 5 | 24, n]) : n < 65536 ? Buffer.from([major << 5 | 25, n >> 8, n & 255]) : Buffer.concat([Buffer.from([major << 5 | 26]), Buffer.from([n >>> 24, (n >> 16) & 255, (n >> 8) & 255, n & 255])]);
  if (typeof v === 'number') return v >= 0 ? head(0, v) : head(1, -1 - v);
  if (Buffer.isBuffer(v) || v instanceof Uint8Array) return Buffer.concat([head(2, v.length), Buffer.from(v)]);
  if (typeof v === 'string') { const b = Buffer.from(v, 'utf8'); return Buffer.concat([head(3, b.length), b]); }
  if (v instanceof Map) return Buffer.concat([head(5, v.size), ...[...v].flatMap(([k, x]) => [cbor(k), cbor(x)])]);
  if (typeof v === 'object') return cbor(new Map(Object.entries(v)));
  throw new Error('cbor: unsupported');
}
const b64u = (b) => Buffer.from(b).toString('base64url');

export function createAuthenticator({ rpId, origin, uv = true }) {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const jwk = publicKey.export({ format: 'jwk' });
  const credId = crypto.randomBytes(16);
  let counter = 0;
  const rpHash = crypto.createHash('sha256').update(rpId).digest();
  const flags = (extra) => Buffer.from([0x01 | (uv ? 0x04 : 0) | extra]);
  const cnt = (n) => { const b = Buffer.alloc(4); b.writeUInt32BE(n); return b; };
  const self = {
    id: b64u(credId), userHandle: null,
    register(options, { originOverride } = {}) {
      self.userHandle = options.user.id;
      const clientDataJSON = Buffer.from(JSON.stringify({ type: 'webauthn.create', challenge: options.challenge, origin: originOverride || origin, crossOrigin: false }));
      const cose = new Map([[1, 2], [3, -7], [-1, 1], [-2, Buffer.from(jwk.x, 'base64url')], [-3, Buffer.from(jwk.y, 'base64url')]]);
      const authData = Buffer.concat([rpHash, flags(0x40), cnt(counter), Buffer.alloc(16), Buffer.from([0, credId.length]), credId, cbor(cose)]);
      const attestationObject = cbor(new Map([['fmt', 'none'], ['attStmt', new Map()], ['authData', authData]]));
      return { id: self.id, rawId: self.id, type: 'public-key', authenticatorAttachment: 'platform', clientExtensionResults: {},
        response: { clientDataJSON: b64u(clientDataJSON), attestationObject: b64u(attestationObject), transports: ['internal'] } };
    },
    // assertion for options; `counterOverride` lets a test replay an old counter (clone detection)
    assert(options, { originOverride, counterOverride, challengeOverride } = {}) {
      counter = counterOverride ?? counter + 1;
      const clientDataJSON = Buffer.from(JSON.stringify({ type: 'webauthn.get', challenge: challengeOverride || options.challenge, origin: originOverride || origin, crossOrigin: false }));
      const authData = Buffer.concat([rpHash, flags(0), cnt(counter)]);
      const sig = crypto.sign('sha256', Buffer.concat([authData, crypto.createHash('sha256').update(clientDataJSON).digest()]), privateKey);
      return { id: self.id, rawId: self.id, type: 'public-key', authenticatorAttachment: 'platform', clientExtensionResults: {},
        response: { clientDataJSON: b64u(clientDataJSON), authenticatorData: b64u(authData), signature: b64u(sig), userHandle: self.userHandle } };
    },
    get counter() { return counter; },
  };
  return self;
}

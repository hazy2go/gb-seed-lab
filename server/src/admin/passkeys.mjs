// Admin passkeys and one-time setup codes, stored in DATA_DIR (files 0600, atomic writes).
//   admin.json        { userId, credentials: [{ id, publicKey, counter, transports, email, name, createdAt, lastUsedAt }] }
//   admin-setup.json  { codes: [{ hash, exp, used }] }   sha256 of each code only; a code lives 15 minutes, used once
// The first passkey can only be registered with a setup code (printed to the server log at start when no passkey
// exists, or made by `node scripts/admin-passkey.mjs` on the Mac mini). Later passkeys need a session + step-up.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const SETUP_TTL = 15 * 60000;
const sha = (s) => crypto.createHash('sha256').update(s).digest();

function readJson(file, dflt) {
  if (!fs.existsSync(file)) return dflt;
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (e) { throw new Error(`${file} is unreadable (${e.message}); restore it or remove it to start over`); }
}
function writeJson(file, obj) {
  const tmp = file + '.tmp', fd = fs.openSync(tmp, 'w', 0o600);
  fs.writeSync(fd, JSON.stringify(obj, null, 1)); fs.fsyncSync(fd); fs.closeSync(fd);
  fs.renameSync(tmp, file);
  try { fs.chmodSync(file, 0o600); } catch { /* best effort */ }
}

// XXXX-XXXX-XXXX-XXXX from a 32-letter alphabet without look-alikes: 80 bits
const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function issueSetupCode(dataDir, now = Date.now()) {
  const file = path.join(dataDir, 'admin-setup.json');
  const doc = readJson(file, { codes: [] });
  const bytes = crypto.randomBytes(16);
  let code = '';
  for (let i = 0; i < 16; i++) code += ALPHA[bytes[i] & 31] + (i % 4 === 3 && i < 15 ? '-' : '');
  doc.codes = (doc.codes || []).filter(c => !c.used && c.exp > now).slice(-4);
  doc.codes.push({ hash: sha(code).toString('hex'), exp: now + SETUP_TTL, used: false });
  fs.mkdirSync(dataDir, { recursive: true });
  writeJson(file, doc);
  return { code, expires: now + SETUP_TTL };
}
function findCode(doc, code, now) {
  if (typeof code !== 'string' || code.length > 40) return null;
  const h = sha(code.trim().toUpperCase());
  return (doc.codes || []).find(c => !c.used && c.exp > now && crypto.timingSafeEqual(Buffer.from(c.hash, 'hex'), h)) || null;
}
export function checkSetupCode(dataDir, code, now = Date.now()) {
  return !!findCode(readJson(path.join(dataDir, 'admin-setup.json'), { codes: [] }), code, now);
}
export function consumeSetupCode(dataDir, code, now = Date.now()) {
  const file = path.join(dataDir, 'admin-setup.json'), doc = readJson(file, { codes: [] });
  const c = findCode(doc, code, now);
  if (!c) return false;
  c.used = true; c.usedAt = now;
  writeJson(file, doc);
  return true;
}

export function openPasskeys(dataDir) {
  const file = path.join(dataDir, 'admin.json');
  const doc = readJson(file, null) || { version: 1, userId: crypto.randomBytes(16).toString('base64url'), credentials: [] };
  doc.credentials ||= [];
  const save = () => writeJson(file, doc);
  if (!fs.existsSync(file)) { fs.mkdirSync(dataDir, { recursive: true }); save(); }
  return {
    file,
    userId: () => Buffer.from(doc.userId, 'base64url'),
    all: () => doc.credentials,
    count: () => doc.credentials.length,
    get: (id) => doc.credentials.find(c => c.id === id) || null,
    add(c) { if (doc.credentials.some(x => x.id === c.id)) throw new Error('passkey already registered'); doc.credentials.push(c); save(); },
    remove(id) { const before = doc.credentials.length; doc.credentials = doc.credentials.filter(c => c.id !== id); if (doc.credentials.length !== before) save(); return before !== doc.credentials.length; },
    touch(id, counter, at) { const c = doc.credentials.find(x => x.id === id); if (c) { c.counter = counter; c.lastUsedAt = at; save(); } },
  };
}

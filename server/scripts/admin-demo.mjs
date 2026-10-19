// Local preview of the admin page with SIMULATED data (for screenshots and trying the passkey flow on this Mac).
// Cloudflare Access is stubbed (every request counts as demo@localhost), the passkey part is real WebAuthn with
// rpID "localhost". Data lives in a temp folder; nothing touches the mint, the chain or DATA_DIR.
//   node scripts/admin-demo.mjs [port]      then open the printed URL; the setup code is printed too
// Never deploy this.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { createAdmin } from '../src/admin/admin.mjs';
import { issueSetupCode } from '../src/admin/passkeys.mjs';
import { openLists, toFile, listActive } from '../src/lists.mjs';
import { SERVER_DIR, REPO_DIR } from '../src/config.mjs';
import { createPool } from '../src/oneofone.mjs';
import { isSolAddress } from '../src/lists.mjs';
import { openActivity } from '../src/activity.mjs';

const PORT = +(process.argv[2] || 8797), PREFIX = '/demo-admin-0123456789';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sh-admin-demo-'));
fs.writeFileSync(path.join(dir, 'seed.json'), JSON.stringify(JSON.parse(fs.readFileSync(path.join(SERVER_DIR, 'lists.example.json'), 'utf8'))));
const lists = openLists({ dataDir: dir, seedFile: path.join(dir, 'seed.json'), maxPriceLamports: 50_000_000 });
let closed = false, paused = true;
const oneState = { pieces: [], oneOfOne: { assigned: { 2: 41, 6: 188, 9: 377 }, log: [], seq: 412 } }, pool = createPool({ state: oneState, maxSupply: 2000 });   // simulated: three 1/1s handed out
const refunds = [
  { id: 1, wallet: 'Fj4AqG7mVuoaKZ5n3cX1ZbN8wq9tH2dRkLpYsE6njP1', lamports: 10_000_000, reason: 'underpaid', status: 'due' },
  { id: 2, wallet: '9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin', lamports: 50_000_000, reason: 'sold-out', status: 'refunded', refundSignature: '5'.repeat(88) },
];
// simulated activity: visits, connects, a holder link and claim, payments, an error
const activity = openActivity(dir);
{
  const S = ['7Np41oeYqPefeNQEHSv1UDhYrehxin3NStELsSKCT4K2', 'Fj4AqG7mVuoaKZ5n3cX1ZbN8wq9tH2dRkLpYsE6njP1', '9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin'];
  const E = '0x5aeda56215b167893e80b4fe645ba6d5bab767de';
  for (let i = 0; i < 9; i++) activity.record('view', { vid: (i % 6).toString(16).repeat(32), device: i % 3 ? 'mobile' : 'desktop', ref: i % 4 ? 'x.com' : null }, 'page');
  activity.record('connect', { chain: 'sol', address: S[0], app: 'Phantom', device: 'mobile' }, 'page');
  activity.record('connect', { chain: 'sol', address: S[1], app: 'Solflare', device: 'desktop' }, 'page');
  activity.record('connect', { chain: 'eth', address: E, app: 'MetaMask', device: 'mobile' }, 'page');
  activity.record('eligibility', { wallet: S[0], lists: ['yumemono'] });
  activity.record('eth_link', { sol: S[0], eth: E, linked: true, lists: [{ list: 'yumemono', remaining: 1 }] });
  activity.record('claim', { wallet: S[0], list: 'yumemono', unit: E, n: 41 });
  activity.record('ticket', { wallet: S[1], qty: 3, lamports: 150_000_000 });
  activity.record('sent', { wallet: S[1], qty: 3, signature: '4'.repeat(88) });
  activity.record('error', { step: 'commission cancelled', chain: 'sol', address: S[2], msg: 'User rejected the request.' }, 'page');
}
const ops = {
  lists, ethEnabled: false, publicPriceLamports: 50_000_000, activity,
  collectors: () => [
    { wallet: 'Fj4AqG7mVuoaKZ5n3cX1ZbN8wq9tH2dRkLpYsE6njP1', pieces: 3, minted: 3, lamports: 150_000_000, lists: {}, claims: 0, oneOfOnes: [6], last: Date.now() - 600000 },
    { wallet: '7Np41oeYqPefeNQEHSv1UDhYrehxin3NStELsSKCT4K2', pieces: 1, minted: 0, lamports: 0, lists: { 'Yumemono holders': 1 }, claims: 1, oneOfOnes: [], last: Date.now() - 300000 },
  ],
  allowlist: {
    holders: () => ({ uses: [{ kind: 'claim', list: 'yumemono', wallet: '7Np41oeYqPefeNQEHSv1UDhYrehxin3NStELsSKCT4K2', eth: '0x5aeda56215b167893e80b4fe645ba6d5bab767de', nft: '0xcontract:1234', at: Date.now() - 300000 }], links: [{ eth: '0x5aeda56215b167893e80b4fe645ba6d5bab767de', sol: '7Np41oeYqPefeNQEHSv1UDhYrehxin3NStELsSKCT4K2', at: Date.now() - 320000 }] }),
    usageReport: () => lists.all().map((l, i) => ({ id: l.id, active: listActive(l), unavailable: l.chain === 'ethereum', piecesUsed: [14, 6, 0, 0, 0][i] || 0, freeClaims: [14, 0, 0, 0, 0][i] || 0, paid: [0, 6, 0, 0, 0][i] || 0, reservedNow: [0, 1, 0, 0, 0][i] || 0 })),
    hasHistory: (id) => id === 'og' || id === 'madlads',
    preview: async (addr) => addr.startsWith('0x') ? { offers: [], unavailable: [{ list: 'punks', name: 'a CryptoPunks holder', reason: 'ALCHEMY_API_KEY not set' }] } : { offers: [{ list: 'og', name: 'OG allowlist', price: 0, remaining: 1, units: [{}] }], unavailable: [] },
  },
  status: () => ({
    network: 'mainnet-beta', priceSol: 0.05, sold: 412, maxSupply: 2000, closed, mintOpen: !closed, mintClosedReason: closed ? 'closed' : null,
    lane: { ready: true, busy: true, current: 273, paused }, heartbeat: { ppm: -56.81, at: Date.now() - 4000 }, faultsInARow: 0, pollAgeSec: 3,
    hotWallet: '971nVbWx5tLkQpJcR7yF2mHsD8aZeG4uK3oPiN6cT1qB', hotBalanceSol: 0.4213, queueLength: 141,
    queueHead: [{ n: 273, short: 'Fj4A…njP1', status: 'drawing', list: null }, { n: 274, short: '9xQe…VFin', status: 'queued', list: 'OG allowlist', claim: true }, { n: 275, short: 'B7rT…k2Lm', status: 'queued', list: 'Mad Lads holder' }, { n: 276, short: 'C3pX…uY8w', status: 'seeding', list: null }],
    failed: [{ n: 211, short: 'D4kM…a9Qe', status: 'failed', lastFault: 'tiles differ from the reference' }], refundsDue: 1, reservedGrants: 1,
    alerts: [{ at: Date.now() - 60000, kind: 'fault', text: 'No. 268: no screen update for 150 s (attempt 1); back in the queue' }, { at: Date.now() - 3600e3, kind: 'refund', text: 'refund due: 0.0100 SOL to Fj4A… (underpaid)' }], ethEnabled: false, oneOfOne: pool.status(),
  }),
  refunds: () => refunds,
  open() { closed = false; return { before: { closed: true }, after: { closed: false } }; },
  close() { closed = true; return { before: { closed: false }, after: { closed: true } }; },
  resume() { paused = false; return { before: { paused: true }, after: { paused: false } }; },
  requeue: (n) => ({ before: { n, status: 'failed' }, after: { n, status: 'queued' } }),
  cancel: (n) => ({ before: { n, status: 'failed' }, after: { n, status: 'cancelled' } }),
  leftoverCheck: (p) => pool.checkLeftover(p, { closed, isAddress: isSolAddress }),
  leftover(p) { pool.checkLeftover(p, { closed, isAddress: isSolAddress }); pool.takeLeftover(p.id, 2001); return { after: { n: 2001, id: p.id } }; },   // simulated: nothing is drawn or minted
  refunded(id, sig) { const r = refunds.find(x => x.id === id); r.status = 'refunded'; r.refundSignature = sig; return { before: { id, status: 'due' }, after: { id, status: 'refunded' } }; },
};
const admin = createAdmin({ host: 'localhost', pathPrefix: PREFIX, origin: `http://localhost:${PORT}`, rpId: 'localhost', access: { verify: async () => ({ email: 'demo@localhost' }) },
  dataDir: dir, uiDir: path.join(SERVER_DIR, 'admin-ui'), fontsDir: path.join(REPO_DIR, 'web', 'fonts'), ops, alert: (k, t) => console.log('ALERT', k, t), log: console.log });
http.createServer((req, res) => { const url = new URL(req.url, 'http://x'); if (admin.matches(req)) return admin.handle(req, res, url, '127.0.0.1'); res.writeHead(404); res.end(); })
  .listen(PORT, '127.0.0.1', () => {
    const { code } = issueSetupCode(dir);
    console.log(`admin demo (simulated data, Access stubbed) on http://localhost:${PORT}${PREFIX}/\nsetup code: ${code}\ndata: ${dir}\nlists: ${toFile(lists.all()).lists.length}`);
  });

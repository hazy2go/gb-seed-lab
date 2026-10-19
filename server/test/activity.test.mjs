import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openActivity } from '../src/activity.mjs';

test('activity: records, sums up unique wallets, filters, and survives a restart', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'act-'));
  let t = Date.parse('2026-10-20T10:00:00Z');
  const a = openActivity(dir, { now: () => (t += 1000) });
  const S = '7Np41oeYqPefeNQEHSv1UDhYrehxin3NStELsSKCT4K2', E = '0x' + 'ab'.repeat(20);
  a.record('view', { vid: 'a'.repeat(32), ref: 'x.com' }, 'page');
  a.record('view', { vid: 'a'.repeat(32) }, 'page');
  a.record('connect', { chain: 'sol', address: S, app: 'Phantom', device: 'mobile' }, 'page');
  a.record('connect', { chain: 'sol', address: S, app: 'Phantom', device: 'mobile' }, 'page');
  a.record('connect', { chain: 'eth', address: E, app: 'MetaMask', device: 'mobile' }, 'page');
  a.record('eth_link', { sol: S, eth: E, linked: true, lists: [{ list: 'yume', remaining: 1 }] });
  a.record('claim', { wallet: S, list: 'yume', unit: E, n: 7 });
  a.record('error', { path: '/api/claim', msg: 'used up', status: 409 });
  const s = a.summary();
  assert.equal(s.visitors, 1); assert.equal(s.views, 2);
  assert.equal(s.solWallets, 1); assert.equal(s.ethWallets, 1);
  assert.deepEqual(s.apps, { 'SOL Phantom': 1, 'ETH MetaMask': 1 });
  assert.equal(s.devices.mobile, 3);
  assert.equal(s.linkedEth, 1); assert.equal(s.claimWallets, 1);
  assert.deepEqual(s.errors, [{ msg: 'used up', n: 1 }]);
  assert.deepEqual(s.refs, [{ ref: 'x.com', n: 1 }]);
  assert.equal(a.recent({ kind: 'connect' }).length, 3);
  assert.equal(a.recent({ q: 'yume' }).length, 2);
  assert.equal(a.recent()[0].kind, 'error');   // newest first
  fs.appendFileSync(a.file, '{"torn');          // a half-written last line must not break the restart
  const b = openActivity(dir);
  assert.equal(b.summary().solWallets, 1);
  assert.equal(b.recent().length, 8);
  assert.equal(b.raw().split('\n').filter(Boolean).length, 9);
});

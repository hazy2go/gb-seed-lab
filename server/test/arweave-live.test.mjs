// storage.checkLive: minting waits until arweave.net serves a piece's metadata and image (Hazy 2026-10-20). Edge cases
// with a fake fetch; no network.
import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.STORAGE = 'arweave';
const { checkLive, urls } = await import('../src/storage.mjs');

const p = { n: 7, ar: { image: 'IMG7', hires: 'H7', x1: 'X7', replay: 'R7', json: 'JSON7' } };
const u = urls(p);
const goodMeta = JSON.stringify({ name: 'Slow Horizons #7', image: u.image, attributes: [] });
const res = (status, body = '', type = 'application/json') => ({
  ok: status >= 200 && status < 300, status, headers: { get: (h) => (h.toLowerCase() === 'content-type' ? type : null) },
  text: async () => body, arrayBuffer: async () => new ArrayBuffer(body.length || 4),
});
const fake = (routes) => async (url) => { const r = routes[url]; if (r instanceof Error) throw r; return r || res(404, 'not found', 'text/plain'); };

test('both files served: live', async () => {
  assert.equal(await checkLive(p, { fetch: fake({ [u.json]: res(200, goodMeta), [u.image]: res(200, 'PNG', 'image/png') }) }), true);
});
test('metadata 404 (gateway not caught up): not yet', async () => {
  assert.equal(await checkLive(p, { fetch: fake({ [u.image]: res(200, 'PNG', 'image/png') }) }), false);
});
test('metadata 200 but image 404: not yet', async () => {
  assert.equal(await checkLive(p, { fetch: fake({ [u.json]: res(200, goodMeta) }) }), false);
});
test('200 with an HTML error page instead of JSON: not yet', async () => {
  assert.equal(await checkLive(p, { fetch: fake({ [u.json]: res(200, '<html>gateway</html>', 'text/html'), [u.image]: res(200, 'PNG', 'image/png') }) }), false);
});
test('JSON of another piece: not yet', async () => {
  const other = JSON.stringify({ name: 'Slow Horizons #8', image: u.image });
  assert.equal(await checkLive(p, { fetch: fake({ [u.json]: res(200, other), [u.image]: res(200, 'PNG', 'image/png') }) }), false);
});
test('JSON pointing at a different image: not yet', async () => {
  const other = JSON.stringify({ name: 'Slow Horizons #7', image: 'https://arweave.net/OTHER' });
  assert.equal(await checkLive(p, { fetch: fake({ [u.json]: res(200, other), [u.image]: res(200, 'PNG', 'image/png') }) }), false);
});
test('image answered as HTML (not an image): not yet', async () => {
  assert.equal(await checkLive(p, { fetch: fake({ [u.json]: res(200, goodMeta), [u.image]: res(200, '<html/>', 'text/html') }) }), false);
});
test('network error / timeout: not yet, never throws', async () => {
  assert.equal(await checkLive(p, { fetch: fake({ [u.json]: new Error('ECONNRESET') }) }), false);
  const hang = () => new Promise((_, rej) => setTimeout(() => rej(new Error('aborted')), 50));
  assert.equal(await checkLive(p, { fetch: hang, timeoutMs: 10 }), false);
});
test('headers arrive but the body stalls: times out, not yet (audit 2026-10-20)', async () => {
  const stall = { ...res(200, goodMeta), text: () => new Promise(() => {}) };
  const t0 = Date.now();
  assert.equal(await checkLive(p, { fetch: fake({ [u.json]: stall, [u.image]: res(200, 'PNG', 'image/png') }), timeoutMs: 50 }), false);
  assert.ok(Date.now() - t0 < 1000, 'returned at the deadline');
  const stallImg = { ...res(200, 'PNG', 'image/png'), arrayBuffer: () => new Promise(() => {}) };
  assert.equal(await checkLive(p, { fetch: fake({ [u.json]: res(200, goodMeta), [u.image]: stallImg }), timeoutMs: 50 }), false);
});
test('"Slow Horizons #70" does not count as #7', async () => {
  const other = JSON.stringify({ name: 'Slow Horizons #70', image: u.image });
  assert.equal(await checkLive(p, { fetch: fake({ [u.json]: res(200, other), [u.image]: res(200, 'PNG', 'image/png') }) }), false);
});
test('1/1 name ("Slow Horizons #7: Title") is accepted', async () => {
  const one = JSON.stringify({ name: 'Slow Horizons #7: Moonlit Whale', image: u.image });
  assert.equal(await checkLive(p, { fetch: fake({ [u.json]: res(200, one), [u.image]: res(200, 'PNG', 'image/png') }) }), true);
});
test('not uploaded yet: not live, no request made', async () => {
  let called = false;
  assert.equal(await checkLive({ n: 9, ar: {} }, { fetch: async () => { called = true; return res(200); } }), false);
  assert.equal(called, false);
});

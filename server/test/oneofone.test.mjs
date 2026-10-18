// One-of-ones: the fair rule (src/oneofone.mjs) on its own, the replay check reconcile.mjs uses, and the link start frame
// with the special byte (hardware + simulated lane). No network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createPool, decide, verify, fixedSeed, COUNT, TITLES } from '../src/oneofone.mjs';
import { startFrame, crc16 } from '../src/lanes/frame.mjs';
import { HardwareLane } from '../src/lanes/hardware.mjs';
import { HardwareLane as SimLane } from './helpers/sim-lane.mjs';
import { lab, drawPiece, traitsOf, toTiles } from '../src/reference.mjs';
import { isSolAddress } from '../src/lists.mjs';

// deterministic "random" seeds: sha256(tag || i)
const seedsFor = (tag, n) => Array.from({ length: n }, (_, i) => crypto.createHash('sha256').update(`${tag}:${i}`).digest().readUInt32LE(0));
// the spec, written out again independently of src/oneofone.mjs
const h4 = (tag, seed) => { const b = Buffer.alloc(4); b.writeUInt32LE(seed >>> 0); return crypto.createHash('sha256').update(Buffer.concat([Buffer.from(tag, 'utf8'), b])).digest().readUInt32LE(0); };

// a mint of these seeds through the pool, one piece after the other (n = 1, 2, ...)
function mint(seeds, maxSupply = 2000, state = { pieces: [] }) {
  const pool = createPool({ state, maxSupply });
  for (const seed of seeds) {
    const p = { n: state.pieces.length + 1, status: 'seeding', wallet: 'w' };
    state.pieces.push(p);
    Object.assign(p, pool.assign(p, seed), { seed, status: 'queued' });
  }
  return { state, pool, hits: state.pieces.filter(p => p.special).map(p => [p.n, p.special]) };
}

test('rule: 2000 random seeds give exactly ten 1/1s, all different; a re-run gives the same numbers', () => {
  const seeds = seedsFor('sellout', 2000);
  const a = mint(seeds), b = mint(seeds);
  assert.equal(a.hits.length, 10);
  assert.deepEqual(a.hits.map(h => h[1]).sort((x, y) => x - y), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.deepEqual(a.hits, b.hits, 'deterministic');
  assert.deepEqual(verify(a.state, 2000).problems, []);
  // the stored proof matches the formula written out from the spec
  for (const p of a.state.pieces.slice(0, 50)) { assert.equal(p.specialRoll.roll, h4('one-of-one', p.seed)); assert.equal(p.specialRoll.roll2, h4('which', p.seed)); }
  for (const p of a.state.pieces.filter(p => p.special)) assert.ok(p.specialRoll.roll % p.specialRoll.left_mints < p.specialRoll.left_1of1);
  // other seed sets: always ten
  for (let k = 0; k < 5; k++) assert.equal(mint(seedsFor('sellout' + k, 2000)).hits.length, 10);
});

test('rule: an early stop at 1000 gives about half; the rest are listed as leftovers', () => {
  let total = 0;
  const trials = 40;
  for (let k = 0; k < trials; k++) {
    const { pool, hits } = mint(seedsFor('half' + k, 1000));
    const st = pool.status();
    assert.equal(st.assigned, hits.length);
    assert.equal(st.remaining.length, 10 - hits.length);
    assert.deepEqual(st.remaining.map(x => x.id).concat(hits.map(h => h[1])).sort((x, y) => x - y), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    assert.equal(st.remaining[0]?.title ?? TITLES[0], TITLES[(st.remaining[0]?.id ?? 1) - 1]);
    total += hits.length;
  }
  const mean = total / trials;
  assert.ok(mean > 4 && mean < 6, `mean ${mean} 1/1s in the first half`);
});

test('rule: the last pieces must take what is left (sell-out of a tiny supply)', () => {
  const { hits } = mint(seedsFor('tiny', 12), 12);
  assert.equal(hits.length, 10);
  const { hits: h10 } = mint(seedsFor('tiny', 10), 10);
  assert.deepEqual(h10.map(h => h[0]), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 'supply 10: every piece is a 1/1');
});

test('decide() = the formula: which is the (roll2 % left)-th free id, ascending', () => {
  for (const seed of seedsFor('which', 200)) {
    const d = decide(seed, [2, 5, 9], 7), free = [1, 3, 4, 6, 7, 8, 10];
    assert.equal(d.left_1of1, 7); assert.equal(d.left_mints, 7);
    assert.equal(d.special, free[h4('which', seed) % 7], 'left_mints = left_1of1: always a hit');
    const e = decide(seed, [], 2000);
    assert.equal(e.special !== 0, h4('one-of-one', seed) % 2000 < 10);
  }
  assert.equal(decide(1, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 1).special, 0, 'none left');
  assert.equal(decide(1, [], -5).left_mints, 1, 'clamped (only after a cancelled piece\'s number was re-sold)');
});

test('serialization: a piece is decided only after every earlier piece; redraws keep their decision', () => {
  const state = { pieces: [{ n: 1, status: 'seeding' }, { n: 2, status: 'seeding' }] };
  const pool = createPool({ state, maxSupply: 2 });
  assert.throws(() => pool.assign(state.pieces[1], 7), /out of order: No\. 2 before No\. 1/);
  Object.assign(state.pieces[0], pool.assign(state.pieces[0], 7), { seed: 7, status: 'queued' });
  const d2 = pool.assign(state.pieces[1], 8);
  Object.assign(state.pieces[1], d2, { seed: 8, status: 'queued' });
  assert.equal(state.pieces[0].specialRoll.seq, 0); assert.equal(state.pieces[1].specialRoll.seq, 1);
  assert.deepEqual(pool.assign(state.pieces[1], 8), { special: d2.special, specialRoll: d2.specialRoll }, 'a redraw keeps it');
  assert.equal(pool.status().assigned, 2, 'supply 2: both are 1/1s, nothing assigned twice');
  // a cancelled seeding piece does not block later ones
  const s2 = { pieces: [{ n: 1, status: 'cancelled' }, { n: 2, status: 'seeding' }] };
  assert.doesNotThrow(() => createPool({ state: s2, maxSupply: 10 }).assign(s2.pieces[1], 3));
});

test('restart: assigned ids come back from state.json and are never handed out twice', () => {
  const seeds = seedsFor('restart', 2000);
  const first = mint(seeds.slice(0, 1200));
  const saved = JSON.parse(JSON.stringify(first.state));   // what store.save() writes
  const second = mint(seeds.slice(1200), 2000, saved);
  const all = mint(seeds);
  assert.deepEqual(second.hits, all.hits, 'same result as without the restart');
  assert.equal(second.pool.status().assigned, 10);
  assert.deepEqual(verify(second.state, 2000).problems, []);
});

test('dev/test seeds never take a 1/1 and do not count as mints', () => {
  const seeds = seedsFor('dev', 300);
  const plain = mint(seeds, 300);
  const state = { pieces: [] }, pool = createPool({ state, maxSupply: 300 });
  for (const [i, seed] of seeds.entries()) {
    for (let k = 0; k < 3; k++) {   // three dev pieces between real ones, all with "lucky" seeds
      const d = { n: state.pieces.length + 1, dev: true, status: 'queued', seed };
      state.pieces.push(d);
      assert.deepEqual(pool.assign(d, seed), { special: 0 });
    }
    const p = { n: state.pieces.length + 1, status: 'seeding' };
    state.pieces.push(p);
    Object.assign(p, pool.assign(p, seed), { seed, status: 'queued' });
    assert.equal(p.specialRoll.left_mints, 300 - i, 'dev pieces are not counted');
  }
  assert.deepEqual(state.pieces.filter(p => p.special).map(p => p.special), plain.hits.map(h => h[1]));
  assert.equal(state.pieces.filter(p => p.dev && p.special).length, 0);
  assert.deepEqual(verify(state, 300).problems, []);
});

test('refund/cancel before drawing gives the 1/1 back (logged); a drawn piece keeps it; replay still checks out', () => {
  const seeds = seedsFor('release', 40);
  const { state, pool } = mint(seeds.slice(0, 20), 40);
  const hit = state.pieces.find(p => p.special);
  assert.ok(hit, 'a hit in the first 20 of 40');
  const drawn = state.pieces.filter(p => p.special)[1];
  if (drawn) { drawn.drawEnd = Date.now(); assert.equal(pool.release(drawn, 'late'), false, 'drawn: not released'); delete drawn.drawEnd; }
  const id = hit.special, before = pool.status().assigned;
  assert.equal(pool.release(hit, 'refunded'), true);
  hit.status = 'cancelled';
  assert.equal(pool.status().assigned, before - 1);
  assert.ok(pool.status().remaining.some(x => x.id === id));
  assert.equal(pool.release(hit, 'again'), false, 'only once');
  assert.deepEqual(state.oneOfOne.log.at(-1), { ...state.oneOfOne.log.at(-1), event: 'release', id, n: hit.n, reason: 'refunded' });
  assert.deepEqual(pool.publicLog().at(-1), { seq: 20, event: 'release', id, title: TITLES[id - 1], n: hit.n, after: 20, reason: 'refunded' }, 'public: applied right after deciding No. 20');
  mint(seeds.slice(20), 40, state);   // the rest of the mint
  assert.equal(createPool({ state, maxSupply: 40 }).status().assigned, 10, 'still all ten by the sell-out');
  assert.equal(state.pieces.filter(p => p.special && p.status !== 'cancelled').length, 10);
  assert.deepEqual(verify(state, 40).problems, []);
});

test('verify catches tampering: a changed roll, a 1/1 assigned twice, a dev piece with a 1/1', () => {
  const { state } = mint(seedsFor('tamper', 30), 30);
  const ok = JSON.parse(JSON.stringify(state));
  const a = JSON.parse(JSON.stringify(ok)); a.pieces[3].specialRoll.roll ^= 1;
  assert.ok(verify(a, 30).problems.some(m => /No\. 4: stored rolls/.test(m)));
  const b = JSON.parse(JSON.stringify(ok)); const [x, y] = b.pieces.filter(p => p.special); y.special = x.special;
  assert.ok(verify(b, 30).problems.some(m => /assigned twice|on two pieces|the rule gives/.test(m)));
  const c = JSON.parse(JSON.stringify(ok)); c.pieces.push({ n: 31, dev: true, special: 3, seed: 1 });
  assert.ok(verify(c, 30).problems.some(m => /dev piece No\. 31/.test(m)));
  assert.ok(verify(ok, 31).problems.some(m => /left_mints/.test(m)), 'a different MAX_SUPPLY does not re-derive');
});

test('leftover after the mint: only closed, only a free id, only a Solana wallet', () => {
  const { state, pool } = mint(seedsFor('left', 500), 2000);
  const free = pool.status().remaining.map(x => x.id), taken = pool.status().hits[0];
  const wallet = '9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin', o = { closed: true, isAddress: isSolAddress };
  assert.throws(() => pool.checkLeftover({ id: free[0], wallet }, { ...o, closed: false }), /mint is open/);
  assert.throws(() => pool.checkLeftover({ id: 11, wallet }, o), /1\.\.10/);
  if (taken) assert.throws(() => pool.checkLeftover({ id: taken.id, wallet }, o), /already belongs/);
  assert.throws(() => pool.checkLeftover({ id: free[0], wallet: 'nope' }, o), /Solana wallet/);
  pool.checkLeftover({ id: free[0], wallet }, o);
  const n = state.pieces.length + 1;
  pool.takeLeftover(free[0], n);
  state.pieces.push({ n, wallet, leftover: true, special: free[0], seed: fixedSeed(free[0]), status: 'queued' });
  assert.throws(() => pool.checkLeftover({ id: free[0], wallet }, o), /already belongs/);
  assert.deepEqual(verify(state, 2000).problems, []);
});

test('start frame: $7E S seed piece special crc, CRC-16-CCITT over everything after $7E', () => {
  const f = startFrame(0xdeadbeef, 1234, 7);
  assert.equal(f.length, 11);
  assert.deepEqual([...f.subarray(0, 9)], [0x7e, 0x53, 0xef, 0xbe, 0xad, 0xde, 0xd2, 0x04, 7]);
  assert.equal(f.readUInt16LE(9), crc16(f.subarray(1, 9)));
  assert.equal(crc16(Buffer.from('123456789')), 0x29b1, 'CCITT-FALSE check value');
  assert.equal(startFrame(1, 2, 0)[8], 0, 'normal piece');
  // the hardware lane writes exactly that frame
  const lane = Object.create(HardwareLane.prototype), sent = [];
  lane.sp = { write: (b) => sent.push(Buffer.from(b)) };
  lane.draw(0xdeadbeef, 1234, 7);
  assert.deepEqual(sent[0], f);
  assert.deepEqual(lane.want, { seed: 0xdeadbeef, piece: 1234, special: 7 });
  lane.draw(5, 70000);
  assert.deepEqual(sent[1], startFrame(5, 70000 & 0xffff, 0));
});

test('simulated lane draws the 1/1 scene for special, the seed\'s picture otherwise; special is always reset', async () => {
  process.env.SIM_PHASE_MS = '20';
  const normal = toTiles(lab.draw(4242).px);
  const lane = new SimLane();
  const run = (special) => new Promise((resolve) => {
    let last = null;
    const onPhase = (ph) => { last = ph.tiles; };
    lane.on('phase', onPhase);
    lane.once('done', () => { lane.off('phase', onPhase); resolve(last); });
    lane.draw(4242, 9, special);
  });
  const t3 = await run(3);
  assert.deepEqual(lane.lastFrame, startFrame(4242, 9, 3));
  assert.ok(t3.equals(toTiles(drawPiece(1, 3).px)), 'scene 3, whatever the seed');
  assert.ok(!t3.equals(normal));
  await new Promise(r => setTimeout(r, 300));
  const t0 = await run(0);
  assert.ok(t0.equals(normal));
  assert.ok(toTiles(lab.draw(4242).px).equals(normal), 'lab.special was reset');
  assert.equal(traitsOf(99, 8).palette, 'Abyss');
  assert.notEqual(lab.traits(99).palette, 'Abyss');
  assert.equal(COUNT, 10);
});

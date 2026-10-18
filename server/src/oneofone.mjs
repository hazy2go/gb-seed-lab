// One-of-ones: ten fixed 1/1 scenes handed out during the mint by a public rule on each piece's seed (docs/ONE-OF-ONES.md,
// published in docs/MINT.md). No secret list: anyone can redo every decision from the seeds.
//
// State (state.json, key oneOfOne): assigned {id: piece n}, a log of assign / release / leftover events, and seq, a
// counter shared by every decision and every log event so the exact order can be replayed (reconcile.mjs, verify()).
import crypto from 'node:crypto';

export const TITLES = ['Fuji at First Light', 'The Floating Gate', 'Shirakawa-go', 'Under the Milky Way', 'Golden Pavilion in Snow',
  'Sky Lanterns', 'Bamboo and Fireflies', 'Moonlit Whale', 'Ramen in the Rain', 'Lighthouse in the Storm'];   // ids 1..10, fixed order
export const COUNT = TITLES.length;
export const title = (id) => TITLES[id - 1] || null;
export const isId = (id) => Number.isInteger(id) && id >= 1 && id <= COUNT;
export const fixedSeed = (id) => (0x1f1f0000 + id) >>> 0;   // what gen_draw uses for a 1/1 (gen_special.c); leftover draws send it as their seed
export const RULE = 'In piece number order, when a piece\'s seed is fixed: left_1of1 = 10 - (1/1s already assigned); '
  + 'left_mints = max(1, MAX_SUPPLY - (pieces numbered before this one)); '
  + 'roll = first 4 bytes LE of sha256(utf8("one-of-one") || seed as 4 bytes LE); '
  + 'roll2 = first 4 bytes LE of sha256(utf8("which") || seed as 4 bytes LE); '
  + 'the piece is a 1/1 if left_1of1 > 0 and roll % left_mints < left_1of1; '
  + 'which = the (roll2 % left_1of1)-th id, ascending, among the ids not yet assigned.';

const roll4 = (tag, seed) => { const b = Buffer.alloc(4); b.writeUInt32LE(seed >>> 0); return crypto.createHash('sha256').update(tag, 'utf8').update(b).digest().readUInt32LE(0); };
export const rolls = (seed) => ({ roll: roll4('one-of-one', seed), roll2: roll4('which', seed) });

// The rule itself, pure: assigned = ids already taken, leftMints = MAX_SUPPLY - pieces numbered before (clamped to 1).
export function decide(seed, assigned, leftMints) {
  const taken = new Set(assigned), free = [];
  for (let id = 1; id <= COUNT; id++) if (!taken.has(id)) free.push(id);
  const { roll, roll2 } = rolls(seed), left_1of1 = free.length, left_mints = Math.max(1, leftMints);
  const hit = left_1of1 > 0 && roll % left_mints < left_1of1;
  return { special: hit ? free[roll2 % left_1of1] : 0, roll, roll2, left_1of1, left_mints };
}

// Real pieces only: dev/test pieces never take part and never count.
const counts = (p) => !p.dev;

export function createPool({ state, maxSupply, log = () => {}, event = () => {} }) {
  const st = state.oneOfOne ||= { assigned: {}, log: [], seq: 0 };
  st.assigned ||= {}; st.log ||= []; st.seq ||= 0;
  const assignedIds = () => Object.keys(st.assigned).map(Number);
  const numberedBefore = (n) => { let k = 0; for (const p of state.pieces) if (counts(p) && p.n < n) k++; return k; };

  return {
    // The decision for piece p, whose seed has just been fixed. Returns the fields to store on the piece ({special,
    // specialRoll}) and records an assignment. Refuses to run out of number order: every earlier real piece must
    // have its seed (and so its decision) already. A piece that already has a decision keeps it (redraws).
    assign(p, seed) {
      if (p.dev) return { special: 0 };
      if (p.specialRoll || p.leftover) return { special: p.special || 0, specialRoll: p.specialRoll };
      const early = state.pieces.find(x => counts(x) && x.n < p.n && x.status === 'seeding');
      if (early) throw new Error(`1/1 rule out of order: No. ${p.n} before No. ${early.n}`);
      const d = decide(seed, assignedIds(), maxSupply - numberedBefore(p.n));
      const specialRoll = { roll: d.roll, roll2: d.roll2, left_1of1: d.left_1of1, left_mints: d.left_mints, seq: st.seq++ };
      st.lastDecided = p.n;   // public logs say after which decision a release or leftover happened
      if (d.special) {
        st.assigned[d.special] = p.n;
        st.log.push({ seq: specialRoll.seq, event: 'assign', id: d.special, n: p.n, at: Date.now() });
        event({ n: p.n, oneOfOne: 'assign', id: d.special, title: title(d.special), ...specialRoll });
        log(`1/1 HIT: No. ${p.n} is #${d.special} ${title(d.special)} (roll ${d.roll} % ${d.left_mints} < ${d.left_1of1})`);
      }
      return { special: d.special, specialRoll };
    },
    // A piece refunded or cancelled before it was drawn gives its 1/1 back to the pool (logged).
    release(p, reason) {
      const id = p.special;
      if (!id || st.assigned[id] !== p.n || p.drawEnd) return false;
      delete st.assigned[id];
      st.log.push({ seq: st.seq++, event: 'release', id, n: p.n, after: st.lastDecided || 0, reason: String(reason || ''), at: Date.now() });
      event({ n: p.n, oneOfOne: 'release', id, title: title(id), reason });
      log(`1/1 released: #${id} ${title(id)} from No. ${p.n} (${reason})`);
      return true;
    },
    // After the mint: draw a 1/1 nobody got. Only with the mint closed, an id still free, a Solana wallet.
    checkLeftover({ id, wallet } = {}, { closed, isAddress }) {
      if (!closed) throw new Error('the mint is open: leftover 1/1s are drawn only after it is closed');
      if (!isId(id)) throw new Error(`id must be 1..${COUNT}`);
      if (st.assigned[id]) throw new Error(`1/1 #${id} already belongs to No. ${st.assigned[id]}`);
      if (typeof wallet !== 'string' || !isAddress(wallet)) throw new Error('a Solana wallet address is required');
    },
    takeLeftover(id, n) {
      if (st.assigned[id]) throw new Error(`1/1 #${id} already belongs to No. ${st.assigned[id]}`);
      st.assigned[id] = n;
      st.log.push({ seq: st.seq++, event: 'leftover', id, n, after: st.lastDecided || 0, at: Date.now() });
      event({ n, oneOfOne: 'leftover', id, title: title(id) });
      log(`1/1 leftover: #${id} ${title(id)} as No. ${n}`);
    },
    status() {
      const hits = Object.entries(st.assigned).map(([id, n]) => ({ id: +id, title: title(+id), n })).sort((a, b) => a.id - b.id);
      const remaining = TITLES.map((t, i) => ({ id: i + 1, title: t })).filter(x => !st.assigned[x.id]);
      return { total: COUNT, assigned: hits.length, hits, remaining };
    },
    // after = the last piece number decided before this event (a release is applied right after deciding that piece)
    publicLog: () => st.log.map(({ seq, event: e, id, n, after, reason }) => ({ seq, event: e, id, title: title(id), n, ...(e !== 'assign' ? { after: after ?? null } : {}), ...(reason ? { reason } : {}) })),
  };
}

// Replays every decision and log event in order and checks them against the rule. Returns a list of problems (empty =
// all good) and a short summary. Used by reconcile.mjs and the tests.
export function verify(state, maxSupply) {
  const problems = [], st = state.oneOfOne || { assigned: {}, log: [] };
  const real = state.pieces.filter(counts).sort((a, b) => a.n - b.n);
  const decided = real.filter(p => p.specialRoll && !p.leftover);
  const before = new Map(); { let k = 0; for (const p of real) before.set(p.n, k++); }
  const steps = [...decided.map(p => ({ seq: p.specialRoll.seq, p })), ...(st.log || []).filter(e => e.event !== 'assign').map(e => ({ seq: e.seq, e }))].sort((a, b) => a.seq - b.seq);
  const taken = new Map();   // id -> n
  let lastN = 0;
  for (const s of steps) {
    if (s.e) {
      if (s.e.event === 'release') { if (taken.get(s.e.id) !== s.e.n) problems.push(`release of #${s.e.id} from No. ${s.e.n}, which did not hold it`); taken.delete(s.e.id); }
      else if (s.e.event === 'leftover') {
        if (taken.has(s.e.id)) problems.push(`leftover #${s.e.id} for No. ${s.e.n}, but No. ${taken.get(s.e.id)} holds it`);
        const p = real.find(x => x.n === s.e.n);
        if (!p || !p.leftover || p.special !== s.e.id || p.seed !== fixedSeed(s.e.id)) problems.push(`leftover #${s.e.id}: piece No. ${s.e.n} does not match`);
        taken.set(s.e.id, s.e.n);
      }
      continue;
    }
    const p = s.p, r = p.specialRoll;
    if (p.n < lastN) problems.push(`No. ${p.n} was decided after No. ${lastN} (out of number order)`);
    lastN = Math.max(lastN, p.n);
    const d = decide(p.seed, [...taken.keys()], maxSupply - before.get(p.n));
    if (d.roll !== r.roll || d.roll2 !== r.roll2) problems.push(`No. ${p.n}: stored rolls do not come from its seed`);
    if (d.left_mints !== r.left_mints) problems.push(`No. ${p.n}: left_mints ${r.left_mints}, the rule gives ${d.left_mints} (MAX_SUPPLY ${maxSupply})`);
    if (d.left_1of1 !== r.left_1of1) problems.push(`No. ${p.n}: left_1of1 ${r.left_1of1}, the replay gives ${d.left_1of1}`);
    if (d.special !== (p.special || 0)) problems.push(`No. ${p.n}: holds ${p.special ? '#' + p.special : 'no 1/1'}, the rule gives ${d.special ? '#' + d.special : 'no 1/1'}`);
    if (p.special) { if (taken.has(p.special)) problems.push(`#${p.special} assigned twice (No. ${taken.get(p.special)} and No. ${p.n})`); taken.set(p.special, p.n); }
  }
  const want = Object.fromEntries([...taken].map(([id, n]) => [String(id), n]));
  for (const id of new Set([...Object.keys(want), ...Object.keys(st.assigned || {})])) if (want[id] !== st.assigned?.[id]) problems.push(`#${id}: state says No. ${st.assigned?.[id] ?? 'none'}, the replay says No. ${want[id] ?? 'none'}`);
  const holders = new Map();
  for (const p of real.filter(p => p.special && p.status !== 'cancelled')) { if (holders.has(p.special)) problems.push(`#${p.special} is on two pieces (No. ${holders.get(p.special)} and No. ${p.n})`); holders.set(p.special, p.n); }
  for (const p of state.pieces.filter(p => p.dev && p.special)) problems.push(`dev piece No. ${p.n} has a 1/1`);
  const legacy = real.filter(p => !p.specialRoll && !p.leftover && p.seed != null).length;
  return { problems, assigned: taken.size, decided: decided.length, legacy };
}

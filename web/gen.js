// Landscape generator v2. traitsFor(seed) picks the traits; landscape(seed, H) draws them.
// Drawing works in a tone field (0 light .. 3 dark) that is dithered to 4 shades at the end;
// crisp pixels (stars, sun, buildings) go to a separate hard layer.
const W = 160;

function rng(seed) {
  let s = (seed * 2654435761) >>> 0 || 1;
  const next = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s; };
  for (let i = 0; i < 8; i++) next();
  const r = () => next() / 4294967296;
  r.int = (a, b) => a + Math.floor(r() * (b - a + 1));
  r.chance = (p) => r() < p;
  return r;
}
const pickW = (r, list) => { let t = 0; for (const [, w] of list) t += w; let x = r() * t; for (const [v, w] of list) { if ((x -= w) < 0) return v; } return list[list.length - 1][0]; };

// 8x8 Bayer matrix, thresholds in (0,1)
const B8 = (() => { let m = [[0]]; while (m.length < 8) { const n = m.length, o = []; for (let y = 0; y < 2 * n; y++) { o.push([]); for (let x = 0; x < 2 * n; x++) { const b = m[y % n][x % n] * 4; o[y].push(b + [[0, 2], [3, 1]][(y / n) | 0][(x / n) | 0]); } } m = o; } return m.map(row => row.map(v => (v + 0.5) / 64)); })();
const dither = (v, x, y) => { v = Math.max(0, Math.min(3, v)); const b = Math.floor(v); return Math.min(3, b + (v - b > B8[y & 7][x & 7] ? 1 : 0)); };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smoothstep = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

const PALETTES = [
  ['Original', 14, ['#9bbc0f', '#8bac0f', '#306230', '#0f380f']],
  ['Pocket', 10, ['#c4cfa1', '#8b956d', '#4d533c', '#1f1f1f']],
  ['Thermal', 8, ['#f6f5ef', '#a9a9a2', '#585852', '#161614']],
  ['Glacier', 7, ['#e6f6f4', '#8cc2cf', '#3e6a90', '#121f38']],
  ['Ember', 6, ['#ffd98a', '#e2793c', '#8e2d2b', '#2a0e15']],
  ['Lavender', 6, ['#f3dcec', '#b38fcb', '#5b4a8e', '#1b1738']],
  ['Sea Glass', 6, ['#dcf1d4', '#79c1a8', '#2e7381', '#0f2737']],
  ['Dune', 6, ['#f7e2b4', '#d9a263', '#8b5232', '#2f1810']],
  ['Moss', 6, ['#e7efc2', '#93b263', '#3d6b3b', '#142518']],
  ['Sepia', 5, ['#efe0c9', '#b89272', '#6a4b39', '#21160f']],
  ['Cobalt', 5, ['#d4e2ff', '#7393d4', '#2f3f84', '#0c1031']],
  ['Rosewood', 4, ['#ffe5df', '#ef8b9b', '#893b6b', '#2a1030']],
  ['Arctic Dawn', 4, ['#fff3df', '#efb7a1', '#6979a8', '#1a2240']],
  ['Teal Night', 4, ['#c9f7da', '#4fb092', '#1f4f6b', '#0a1a28']],
  ['Gold Leaf', 2, ['#fff1b3', '#e1b343', '#7f6022', '#1f1708']],
  ['Blood Moon', 2, ['#f1d3c3', '#c2413f', '#511a31', '#100810']],
  ['Neon', 1.5, ['#f6f7a3', '#ef52c0', '#4231a2', '#110821']],
  ['Red Visor', 1, ['#ff5a4a', '#b3120c', '#520303', '#000000']],
  ['Toxic', 1, ['#e3ff47', '#5fc221', '#1f4f30', '#081810']],
  ['Negative', 0.5, ['#0f380f', '#306230', '#8bac0f', '#9bbc0f']],
];
const PALETTE = Object.fromEntries(PALETTES.map(([n, , c]) => [n, c]));

function traitsFor(seed) {
  const r = rng((seed ^ 0x5bd1e995) >>> 0);
  const t = {};
  t.time = pickW(r, [['dawn', 12], ['day', 20], ['golden hour', 14], ['dusk', 18], ['night', 28], ['aurora', 5], ['eclipse', 3]]);
  t.terrain = pickW(r, [['peaks', 28], ['hills', 20], ['mesas', 11], ['dunes', 10], ['volcano', 6], ['islands', 12], ['fjord', 13]]);
  if (t.terrain === 'islands') t.ground = 'sea';
  else if (t.terrain === 'fjord') t.ground = 'lake';
  else if (t.terrain === 'dunes' || t.terrain === 'mesas') t.ground = pickW(r, [['desert', 72], ['oasis', 28]]);
  else t.ground = pickW(r, [['lake', 32], ['forest', 28], ['meadow', 22], ['snowfield', 18]]);
  t.weather = pickW(r, [['clear', 40], ['clouds', 24], ['fog', 14], ['rain', 8], ['snowfall', 8], ['storm', 6]]);
  if ((t.ground === 'desert' || t.ground === 'oasis') && t.weather === 'snowfall') t.weather = 'clear';
  if (t.time === 'eclipse' && t.weather !== 'clear' && t.weather !== 'fog') t.weather = 'clear';
  const night = t.time === 'night' || t.time === 'aurora';
  if (night) t.sky = pickW(r, [['full moon', 14], ['gibbous moon', 18], ['half moon', 18], ['crescent moon', 30], ['new moon', 8], ['twin moons', 4], ['ringed planet', 3]]);
  else if (t.time === 'eclipse') t.sky = 'eclipse';
  else if (t.time === 'day') t.sky = pickW(r, [['sun', 75], ['haloed sun', 20], ['day moon', 5]]);
  else t.sky = pickW(r, [['low sun', 63], ['striped sun', 32], ['double sun', 5]]);
  if (t.weather === 'rain' || t.weather === 'storm' || t.weather === 'snowfall') t.sky = 'overcast';
  t.layers = r.int(3, 6);
  t.snowcaps = ['peaks', 'fjord', 'volcano'].includes(t.terrain) && (t.weather === 'snowfall' || t.ground === 'snowfield' || r.chance(0.45));
  const x = [];
  const wet = t.ground === 'lake' || t.ground === 'sea' || t.ground === 'oasis';
  if (night && r.chance(0.45)) x.push('milky way');
  if (night && t.weather === 'clear' && r.chance(0.14)) x.push('shooting star');
  if ((night || t.time === 'dusk') && r.chance(0.05)) x.push('comet');
  if (!night && t.time !== 'eclipse' && t.weather !== 'storm' && t.weather !== 'rain' && r.chance(0.2)) x.push('birds');
  if (wet && t.ground !== 'oasis' && r.chance(0.11)) x.push('lighthouse');
  if (wet && r.chance(0.11)) x.push('sailboat');
  if (['forest', 'meadow', 'snowfield'].includes(t.ground) && r.chance(0.12)) x.push('cabin');
  if (r.chance(0.03)) x.push('glitch');
  t.extras = x;
  t.palette = pickW(r, PALETTES.map(([n, w]) => [n, w]));
  return t;
}

// midpoint displacement, normalised to -1..1, 160 samples
function md(r, rough) {
  const n = 256, a = new Float32Array(n + 1);
  a[0] = r() * 2 - 1; a[n] = r() * 2 - 1;
  let step = n, d = 1;
  while (step > 1) { const h = step >> 1; for (let i = h; i < n; i += step) a[i] = (a[i - h] + a[i + h]) / 2 + (r() * 2 - 1) * d; step = h; d *= rough; }
  const off = r.int(0, n - W), out = new Float32Array(W);
  let lo = 1e9, hi = -1e9;
  for (let x = 0; x < W; x++) { out[x] = a[x + off]; lo = Math.min(lo, out[x]); hi = Math.max(hi, out[x]); }
  for (let x = 0; x < W; x++) out[x] = (out[x] - lo) / (hi - lo || 1);  // 0..1
  return out;
}
const smooth = (a, k) => { const o = new Float32Array(a.length); for (let i = 0; i < a.length; i++) { let s = 0, c = 0; for (let j = -k; j <= k; j++) { const v = a[i + j]; if (v !== undefined) { s += v; c++; } } o[i] = s / c; } return o; };

function landscape(seed, H = 144) {
  const t = traitsFor(seed), r = rng((seed * 31 + 7) >>> 0);
  const N = W * H, tone = new Float32Array(N), hard = new Int8Array(N).fill(-1), star = new Uint8Array(N);
  const inb = (x, y) => x >= 0 && x < W && y >= 0 && y < H;
  const setH = (x, y, v) => { x |= 0; y |= 0; if (inb(x, y)) hard[y * W + x] = v; };
  const addT = (x, y, v) => { x |= 0; y |= 0; if (inb(x, y)) tone[y * W + x] += v; };
  const tall = H > 144, night = t.time === 'night' || t.time === 'aurora';
  const wet = t.ground === 'lake' || t.ground === 'sea' || t.ground === 'oasis';
  const horizon = wet ? Math.round(H * (tall ? 0.7 : t.ground === 'oasis' ? 0.8 : 0.64 + r() * 0.08)) : H;
  const skyBottom = wet ? horizon : Math.round(H * 0.8);

  // 1. sky gradient
  const SKY = { dawn: [2.4, 0.7], day: [1.5, 0.1], 'golden hour': [1.9, 0.6], dusk: [2.9, 0.9], night: [3.15, 1.9], aurora: [3.2, 2.1], eclipse: [3.0, 1.9] }[t.time];
  for (let y = 0; y < H; y++) { const v = SKY[0] + (SKY[1] - SKY[0]) * Math.pow(Math.min(1, y / skyBottom), 0.8); tone.fill(v, y * W, y * W + W); }
  const skyAt = (y) => SKY[0] + (SKY[1] - SKY[0]) * Math.pow(clamp(y / skyBottom, 0, 1), 0.8);

  // 2. light source
  const lx = r.int(26, 134);
  let ly, lrad;
  if (t.sky === 'sun' || t.sky === 'haloed sun' || t.sky === 'day moon') { ly = skyBottom * (0.16 + r() * 0.18); lrad = r.int(8, 11); }
  else if (t.sky.includes('sun')) { ly = skyBottom * (0.5 + r() * 0.14); lrad = r.int(13, 21); }
  else if (t.sky === 'eclipse') { ly = skyBottom * (0.25 + r() * 0.15); lrad = r.int(13, 16); }
  else { ly = skyBottom * (0.14 + r() * 0.26); lrad = r.int(7, 13); }
  if (tall) ly = Math.min(ly, H * 0.3);
  const ridgeTop = tall ? H * 0.2 : skyBottom * 0.28;
  if (t.sky === 'low sun' || t.sky === 'striped sun' || t.sky === 'double sun') ly = ridgeTop + r.int(2, 14);
  if (!t.sky.includes('sun') || t.sky === 'sun' || t.sky === 'haloed sun') ly = Math.max(lrad + 3, Math.min(ly, ridgeTop - lrad * 0.3));
  ly = Math.round(ly);
  const glowR = lrad * (night ? 3.2 : t.sky === 'eclipse' ? 3.5 : 4.2);
  const glowA = t.sky === 'new moon' || t.sky === 'overcast' ? 0 : night ? 0.95 : t.time === 'day' ? 0.7 : t.sky === 'eclipse' ? 1.3 : 0.8;
  for (let y = 0; y < skyBottom; y++) for (let x = 0; x < W; x++) {
    const d = Math.hypot(x - lx, y - ly); if (d < glowR) tone[y * W + x] -= glowA * (1 - d / glowR) ** 2;
  }

  // 3. milky way and aurora
  if (t.extras.includes('milky way')) {
    const ang = (r() - 0.5) * 1.6, ca = Math.cos(ang), sa = Math.sin(ang), ox = r.int(30, 130), oy = skyBottom * 0.3;
    for (let y = 0; y < skyBottom; y++) for (let x = 0; x < W; x++) {
      const d = Math.abs((x - ox) * sa - (y - oy) * ca), wob = 14 + 6 * Math.sin((x * ca + y * sa) * 0.08);
      if (d < wob) { tone[y * W + x] -= 0.45 * (1 - d / wob); if (r.chance(0.05 * (1 - d / wob))) { setH(x, y, r.chance(0.3) ? 0 : 1); star[y * W + x] = 1; } }
    }
  }
  if (t.time === 'aurora') {
    const p = [r() * 6, r() * 6, r() * 6, r() * 6];
    for (let x = 0; x < W; x++) {
      const yb = skyBottom * 0.12 + Math.sin(x * 0.045 + p[0]) * 9 + Math.sin(x * 0.13 + p[1]) * 4;
      const len = 26 + 14 * Math.sin(x * 0.06 + p[2]), I = 0.5 + 0.9 * Math.sin(x * 0.19 + p[3]) ** 2;
      for (let y = Math.max(0, yb | 0); y < yb + len && y < skyBottom; y++) {
        const f = (y - yb) / len; tone[y * W + x] -= I * (f < 0.15 ? f / 0.15 : 1 - (f - 0.15) / 0.85) * 1.5;
      }
    }
  }

  // 4. stars
  if (night || t.sky === 'eclipse') {
    const n = t.sky === 'eclipse' ? 25 : r.int(50, 110);
    for (let i = 0; i < n; i++) {
      const x = r.int(0, W - 1), y = r.int(0, skyBottom - 8);
      if (tone[y * W + x] < 1.5) continue;
      setH(x, y, r.chance(0.3) ? 1 : 0); star[y * W + x] = 1;
      if (r.chance(0.06)) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { setH(x + dx, y + dy, 1); if (inb(x + dx, y + dy)) star[(y + dy) * W + x + dx] = 1; }
    }
  }

  // 5. the sun, moon, planet or eclipse
  const disc = (cx, cy, rad, fn) => { for (let y = -rad; y <= rad; y++) for (let x = -rad; x <= rad; x++) if (x * x + y * y <= rad * rad + rad * 0.6) fn(cx + x, cy + y, x, y); };
  const moon = (cx, cy, rad, phase, side) => {
    const craters = [[0.3, -0.2, 0.25], [-0.35, 0.3, 0.18], [0.1, 0.45, 0.14], [-0.2, -0.4, 0.12]];
    disc(cx, cy, rad, (X, Y, x, y) => {
      let lit = true;
      if (phase === 'half') lit = x * side >= 0;
      else if (phase !== 'full') { const off = { gibbous: 1.45, crescent: 0.55, new: 0 }[phase] * rad; lit = (x + off * side) ** 2 + y * y > rad * rad; if (phase === 'new') lit = false; }
      if (!lit) { addT(X, Y, 0.35); return; }
      let v = 0; for (const [a, b, c] of craters) if ((x - a * rad) ** 2 + (y - b * rad) ** 2 < (c * rad) ** 2) v = 1;
      setH(X, Y, v);
    });
    if (phase === 'new') disc(cx, cy, rad, (X, Y, x, y) => { if (x * x + y * y > (rad - 1) ** 2 && x * side > 0) setH(X, Y, 2); });
  };
  const side = r.chance(0.5) ? 1 : -1;
  switch (t.sky) {
    case 'sun': case 'low sun': disc(lx, ly, lrad, (X, Y) => setH(X, Y, 0)); break;
    case 'haloed sun':
      disc(lx, ly, lrad, (X, Y) => setH(X, Y, 0));
      for (let a = 0; a < 6.283; a += 0.02) { const X = lx + Math.cos(a) * lrad * 2.3, Y = ly + Math.sin(a) * lrad * 2.3; if (inb(X | 0, Y | 0) && (a * 50 | 0) % 3) setH(X, Y, tone[(Y | 0) * W + (X | 0)] > 0.7 ? 0 : 1); }
      break;
    case 'striped sun':
      disc(lx, ly, lrad, (X, Y, x, y) => { const o = y + lrad * 0.75; if (o > 0) { const k = Math.floor(o / 3.5); if (o % 3.5 < Math.min(2.5, 0.6 + k * 0.45)) return; } setH(X, Y, 0); });
      break;
    case 'double sun':
      disc(lx, ly, lrad, (X, Y) => setH(X, Y, 0));
      disc(lx + side * (lrad + 9), ly - lrad * 0.9, Math.max(4, lrad >> 2), (X, Y) => setH(X, Y, 0));
      break;
    case 'day moon': disc(lx, ly, lrad, (X, Y, x) => setH(X, Y, x * side > lrad * 0.3 ? 1 : 0)); break;
    case 'full moon': moon(lx, ly, lrad, 'full', side); break;
    case 'gibbous moon': moon(lx, ly, lrad, 'gibbous', side); break;
    case 'half moon': moon(lx, ly, lrad, 'half', side); break;
    case 'crescent moon': moon(lx, ly, lrad, 'crescent', side); break;
    case 'new moon': moon(lx, ly, lrad, 'new', side); break;
    case 'twin moons':
      moon(lx, ly, lrad, 'crescent', side);
      moon(lx - side * (lrad + 14), ly + lrad, Math.max(4, lrad >> 1), 'full', side);
      break;
    case 'ringed planet': {
      const tilt = (r() - 0.5) * 0.8, ct = Math.cos(tilt), st = Math.sin(tilt), A = lrad * 2.1, Bv = lrad * 0.5;
      const ring = (front) => { for (let y = -A; y <= A; y++) for (let x = -A; x <= A; x++) {
        const u = x * ct + y * st, v = -x * st + y * ct, e = (u / A) ** 2 + (v / Bv) ** 2;
        if (e > 0.72 && e < 1.0 && ((v > 0) === front || x * x + y * y > lrad * lrad)) setH(lx + x, ly + y, e > 0.86 ? 0 : 1);
      } };
      ring(false);
      disc(lx, ly, lrad, (X, Y, x, y) => setH(X, Y, (x * side > lrad * 0.35 ? 2 : 1) - ((((y + lrad) / 3) | 0) % 3 === 0 ? 1 : 0) + (x * side > lrad * 0.35 ? 0 : 0)));
      ring(true);
      break;
    }
    case 'eclipse':
      disc(lx, ly, lrad, (X, Y, x, y) => setH(X, Y, x * x + y * y > (lrad - 1) ** 2 ? 0 : 3));
      disc(lx + side * Math.round(lrad * 0.7), ly - Math.round(lrad * 0.7), 1, (X, Y) => setH(X, Y, 0));
      break;
  }

  if (t.sky.includes('sun')) for (let y = -lrad - 2; y <= lrad + 2; y++) for (let x = -lrad - 2; x <= lrad + 2; x++) {
    const d = Math.hypot(x, y), X = lx + x, Y = ly + y;
    if (d > lrad + 0.3 && d < lrad + 1.6 && inb(X, Y) && hard[Y * W + X] < 0) tone[Y * W + X] = Math.max(tone[Y * W + X], 1.2);
  }

  // 6. comet, shooting star
  if (t.extras.includes('comet')) {
    const cx = r.int(20, 140), cy = r.int(10, skyBottom * 0.35 | 0), ang = r() * Math.PI, len = r.int(30, 55);
    for (let k = 0; k < len; k++) { const f = k / len, w = 1 + f * 7; for (let j = -w; j <= w; j++) { const X = cx + Math.cos(ang) * k - Math.sin(ang) * j, Y = cy - Math.sin(ang) * k * 0.6 + Math.cos(ang) * j * 0.6; addT(X, Y, -1.4 * (1 - f) * (1 - Math.abs(j) / (w + 1))); } }
    disc(cx, cy, 1, (X, Y) => setH(X, Y, 0));
  }
  if (t.extras.includes('shooting star')) {
    let x = r.int(30, 130), y = r.int(5, skyBottom * 0.35 | 0); const dx = r.chance(0.5) ? 1 : -1, len = r.int(14, 26);
    for (let k = 0; k < len; k++, x += dx, y += (k % 2)) if (k < len * 0.85 || k % 2) setH(x, y, k < len * 0.45 ? 0 : 1);
  }

  // 7. clouds
  const cloudBase = { dawn: 0.7, day: 0.1, 'golden hour': 0.5, dusk: 1.4, night: 2.45, aurora: 2.5, eclipse: 2.4 }[t.time];
  const cloud = (cx, cy, w) => {
    const blobs = []; for (let k = 0; k < w / 5; k++) blobs.push([cx + (r() - 0.5) * w, cy + (r() - 0.6) * 4, r.int(3, 7)]);
    for (const [bx, by, br] of blobs) for (let y = -br; y <= br; y++) for (let x = -br * 1.6; x <= br * 1.6; x++) {
      if ((x / 1.6) ** 2 + y * y > br * br || by + y > cy + 3) continue;
      const fy = (y + br) / (2 * br), litBelow = ly > cy && !night;
      const X = bx + x | 0, Y = by + y | 0; if (!inb(X, Y) || hard[Y * W + X] >= 0 && !star[Y * W + X]) continue;
      tone[Y * W + X] = cloudBase + (litBelow ? (0.5 - fy) * 0.9 : (fy - 0.3) * 0.9);
      if (star[Y * W + X]) { hard[Y * W + X] = -1; star[Y * W + X] = 0; }
    }
  };
  const nc = { clear: r.int(0, 1), clouds: r.int(3, 6), fog: r.int(0, 2), rain: 3, snowfall: 2, storm: 3 }[t.weather];
  for (let i = 0; i < nc; i++) cloud(r.int(0, W), r.int(6, skyBottom * 0.55 | 0), r.int(16, 46));
  if (t.weather === 'rain' || t.weather === 'storm' || t.weather === 'snowfall') {
    const deck = skyBottom * (t.weather === 'storm' ? 0.34 : 0.26), ph = r() * 9;
    for (let x = 0; x < W; x++) {
      const yb = deck + Math.sin(x * 0.11 + ph) * 4 + Math.sin(x * 0.29 + ph * 2) * 2;
      for (let y = 0; y < yb && y < H; y++) { const i = y * W + x; tone[i] = (night ? 2.7 : t.weather === 'storm' ? 2.3 : 1.5) + (y / yb) * 0.5; hard[i] = -1; star[i] = 0; }
    }
  }

  // 8. ridges, far to near
  const L = tall ? t.layers + 1 : t.layers;
  const top = ridgeTop, bottom = wet ? horizon - 3 : H * 0.78;
  const far = clamp(skyAt(skyBottom) + (night ? 0.4 : 0.75), 0, 2.6);
  const rimA = { day: 0.8, dawn: 1.1, 'golden hour': 1.3, dusk: 1.1, eclipse: 0.25 }[t.time] ?? ({ 'full moon': 0.7, 'gibbous moon': 0.6, 'half moon': 0.45, 'crescent moon': 0.3, 'new moon': 0, 'twin moons': 0.5, 'ringed planet': 0.4, overcast: 0.15 }[t.sky]);
  const ground = new Float32Array(W).fill(H);  // top of the nearest layer, for placing things
  const volcanoLayer = Math.max(0, L - 3);
  let volcanoTop = null;
  for (let l = 0; l < L; l++) {
    const f = L === 1 ? 1 : l / (L - 1), near = l === L - 1;
    const base = top + (bottom - top) * Math.pow((l + 1) / L, 1.1);
    const amp = (tall ? 120 : 64) * (1 - f * 0.55);
    let terr = t.terrain === 'fjord' ? 'peaks' : t.terrain;
    if (terr === 'islands' && l === 0) terr = 'peaks';
    if (terr === 'volcano' && l !== volcanoLayer) terr = 'peaks';
    let h;
    if (terr === 'peaks') { const n = smooth(md(r, 0.6), 1); h = Array.from(n, v => base - amp * Math.pow(v, 1.4) * (t.terrain === 'fjord' ? 1.25 : 1)); }
    else if (terr === 'hills') { const n = smooth(md(r, 0.5), 7); h = Array.from(n, v => base - amp * 0.55 * v); }
    else if (terr === 'mesas') {
      const n = smooth(md(r, 0.55), 2), lv = 0.4 + r() * 0.2;
      // plateau mask, closed so canyons and pillars narrower than ~8 px disappear
      const q = Array.from(n, v => smoothstep(lv - 0.08, lv + 0.02, v));
      const win = (a, k, fn) => a.map((_, i) => fn(...a.slice(Math.max(0, i - k), i + k + 1)));
      const qc = win(win(q, 4, Math.max), 4, Math.min);
      h = Array.from(n, (v, x) => base - amp * 0.75 * (qc[x] * 0.85 + v * 0.15));
    }
    else if (terr === 'dunes') { const lam = r.int(28, 60), off = r() * lam, n = md(r, 0.5); h = Array.from(n, (v, x) => { const s = ((x + off) / lam) % 1, wv = s < 0.72 ? s / 0.72 : (1 - s) / 0.28; return base - amp * 0.38 * (wv * 0.7 + v * 0.3); }); h = Array.from(smooth(Float32Array.from(h), 1)); }
    else if (terr === 'volcano') {
      const cx = r.int(45, 115), w = r.int(38, 60), n = md(r, 0.6);
      h = Array.from(n, (v, x) => { const c = Math.max(0, 1 - Math.abs(x - cx) / w) ** 1.25; let y = base - amp * (1.25 * c + 0.12 * v); if (Math.abs(x - cx) < 4) y += 3 - Math.abs(x - cx) * 0.5; return y; });
      volcanoTop = [cx, Math.min(...h)];
    } else { // islands: separate bumps sitting on the horizon
      h = new Array(W).fill(Infinity); const k = f < 0.5 ? r.int(1, 2) : r.int(1, 3);
      for (let i = 0; i < k; i++) { const cx = r.int(0, W), w = r.int(14, 46) * (0.6 + f), a = amp * (0.35 + 0.5 * r()) * (0.5 + f * 0.6); const n = smooth(md(r, 0.5), 2); for (let x = 0; x < W; x++) { const d = Math.abs(x - cx) / w; if (d < 1) h[x] = Math.min(h[x], horizon - 1 - a * (1 - d * d) ** 1.5 * (0.75 + 0.25 * n[x])); } }
    }
    { // keep every ridge below the top edge
      // and below the sun or moon: a high one stays fully visible, a low sun at least half
      const lowSun = t.sky === 'low sun' || t.sky === 'striped sun' || t.sky === 'double sun';
      const clear = lowSun ? ly : ly + lrad + 4;
      let k = 1; const edge = tall ? 14 : 8;
      for (let x = 0; x < W; x++) { if (!isFinite(h[x])) continue; const need = Math.abs(x - lx) < lrad + 8 ? Math.max(edge, clear) : edge; if (h[x] < need && base > need) k = Math.min(k, (base - need) / (base - h[x])); }
      if (k < 1) h = h.map(v => isFinite(v) ? base - (base - v) * k : v);
    }
    const hs = smooth(Float32Array.from(h, v => isFinite(v) ? v : horizon), 3);
    const tl = near ? 3 : far + (3 - far) * Math.pow(f, 0.85);
    const mist = near ? 0 : (1 - f) * 0.85 + 0.15 + (t.weather === 'fog' ? 0.5 : 0);
    const fogD = 12 + 14 * (1 - f);
    const fin = h.filter(isFinite), minH = Math.min(...fin), maxH = Math.max(...fin);
    const snowY = minH + (maxH - minH) * 0.38, mist0 = minH + (base - minH) * 0.25;
    const snowy = t.snowcaps && !near && (terr === 'peaks' || terr === 'volcano');
    const floor = wet ? horizon : H;
    for (let x = 0; x < W; x++) {
      if (!isFinite(h[x])) continue;
      const y0 = Math.max(0, Math.round(h[x]));
      const slope = (hs[Math.min(W - 1, x + 2)] - hs[Math.max(0, x - 2)]) / 2;
      const lit = Math.sign(lx - x) * slope > 0.12;
      const rimD = 3 + Math.min(6, Math.abs(slope) * 2);
      const jit = Math.sin(x * 0.23 + l) * 3 + Math.sin(x * 0.071 + l * 2) * 4 + ((x * 13 + l) % 5 === 0 ? -2 : 0);
      for (let y = y0; y < floor; y++) {
        const i = y * W + x, dy = y - y0;
        let v = tl - mist * smoothstep(mist0, base + 4, y);
        if (lit && dy < rimD) v -= rimA * (1 - dy / rimD) * (near ? 0.6 : 1);
        if (snowy && y < snowY + jit) v = Math.max(0, tl - 2.5) + (lit ? 0 : 0.55) + clamp((y - (snowY + jit - 4)) / 4, 0, 1) * 0.6;
        tone[i] = v; hard[i] = -1; star[i] = 0;
      }
      if (near) ground[x] = y0;
    }
    // trees on the two nearest layers
    if ((t.ground === 'forest' || t.ground === 'snowfield' && r.chance(0.5)) && l >= L - 2) {
      const sparse = t.ground === 'snowfield' ? 3 : 1;
      for (let x = r.int(0, 3); x < W; x += r.int(2, 5) * sparse) {
        if (!isFinite(h[x])) continue;
        const th = near ? r.int(5, 13) : r.int(3, 7), y0 = Math.round(h[x]) + 1;
        for (let dy = 0; dy <= th; dy++) { const hw = Math.floor(dy * 0.42) + (dy % 3 === 2 ? 1 : 0); for (let dx = -hw; dx <= hw; dx++) { const X = x + dx, Y = y0 - th + dy; if (inb(X, Y)) { tone[Y * W + X] = tl; hard[Y * W + X] = near ? 3 : -1; star[Y * W + X] = 0; } } }
        if (near) for (let x2 = x - 3; x2 <= x + 3; x2++) if (x2 >= 0 && x2 < W) ground[x2] = Math.min(ground[x2], y0);
      }
    }
  }

  // 9. near ground surface
  for (let x = 0; x < W; x++) {
    const g = Math.round(ground[x]); if (g >= (wet ? horizon : H)) continue;
    for (let y = g; y < (wet ? horizon : H); y++) {
      const i = y * W + x, d = (y - g) / Math.max(8, (wet ? horizon : H) - g);
      if (hard[i] === 3) continue;
      if (t.ground === 'meadow') tone[i] = 2.0 + d * 0.8;
      else if (t.ground === 'desert' || t.ground === 'oasis') tone[i] = 1.0 + d * 0.9 + (Math.sin(x * 0.25 + y * 1.1 + Math.sin(x * 0.05) * 3) > 0.92 ? 0.8 : 0);
      else if (t.ground === 'snowfield') tone[i] = 0.3 + d * 0.9;
    }
    if (t.ground === 'meadow') for (let k = 0; k < 2; k++) { const y = r.int(g + 2, (wet ? horizon : H) - 1); if (r.chance(0.5)) { setH(x, y, 3); setH(x, y - 1, 3); } else if (r.chance(0.08)) setH(x, y, 0); }
  }

  // 10. things on the ground or the water line (drawn before the mirror so they reflect)
  if (volcanoTop) {
    const [vx, vy] = volcanoTop, glow = night || t.time === 'dusk';
    let px = vx, py = vy - 2;
    for (let k = 0; k < 9; k++) { const rr = 3 + k * 1.3; disc(px | 0, py | 0, rr | 0, (X, Y) => { if (inb(X, Y) && hard[Y * W + X] < 0) tone[Y * W + X] = (glow ? 2.2 : 1.4) + k * 0.06; }); px += 2 + r() * 3; py -= 4 + r() * 2; }
    if (glow) { for (let y = vy - 2; y < vy + 3; y++) for (let x = vx - 3; x <= vx + 3; x++) setH(x, y, 0); for (let y = vy - 14; y < vy + 10; y++) for (let x = vx - 16; x < vx + 16; x++) { const d = Math.hypot(x - vx, y - vy); if (d < 16 && inb(x, y)) tone[y * W + x] -= 0.9 * (1 - d / 16); } }
  }
  if (t.extras.includes('lighthouse')) {
    const x0 = r.chance(0.5) ? r.int(12, 40) : r.int(120, 148), yb = horizon - 1, ht = r.int(18, 26);
    for (let x = x0 - 8; x <= x0 + 8; x++) for (let y = yb - 3 + Math.abs(x - x0) / 3; y <= yb; y++) setH(x, y, 3);
    for (let y = 0; y < ht; y++) { const hw = 2 + ((ht - y) / ht) * 1.5 | 0; for (let dx = -hw; dx <= hw; dx++) setH(x0 + dx, yb - 3 - y, ((y / 3) | 0) % 2 ? 0 : 3); }
    const lyy = yb - 3 - ht - 2;
    for (let dx = -2; dx <= 2; dx++) { setH(x0 + dx, lyy, night || t.time === 'dusk' ? 0 : 2); setH(x0 + dx, lyy + 1, night || t.time === 'dusk' ? 0 : 2); setH(x0 + dx, lyy - 1, 3); }
    setH(x0, lyy - 2, 3);
    if (night || t.time === 'dusk') { const dir = x0 < 80 ? 1 : -1; for (let k = 3; k < 70; k++) for (let j = -k * 0.18; j <= k * 0.18; j++) addT(x0 + dir * k, lyy + j, -1.1 * (1 - k / 70)); }
  }
  if (t.extras.includes('sailboat')) {
    const x0 = r.int(30, 130), yb = horizon - 1, s = r.int(0, 1);
    for (let dx = -6 - s; dx <= 6 + s; dx++) { setH(x0 + dx, yb, 3); if (Math.abs(dx) < 5 + s) setH(x0 + dx, yb - 1, 3); }
    for (let y = 2; y < 14 + s * 2; y++) setH(x0, yb - y, 3);
    for (let y = 3; y < 13 + s * 2; y++) for (let dx = 1; dx <= (y - 2) * 0.55; dx++) setH(x0 + dx, yb - 15 - s * 2 + y, night ? 2 : 0);
    for (let y = 5; y < 12; y++) for (let dx = 1; dx <= (y - 4) * 0.4; dx++) setH(x0 - dx, yb - 13 + y, night ? 2 : 1);
  }
  if (t.extras.includes('cabin')) {
    let best = 20, bs = 1e9; for (let x = 20; x < 140; x++) { const s = Math.abs(ground[x + 5] - ground[x - 5]); if (s < bs && ground[x] < H - 12) { bs = s; best = x; } }
    const gy = Math.round(Math.max(ground[best - 5], ground[best + 5])), lit = night || t.time === 'dusk' || t.time === 'eclipse';
    for (let y = 0; y < 6; y++) for (let dx = -5; dx <= 5; dx++) setH(best + dx, gy - y, 3);
    for (let y = 0; y < 6; y++) for (let dx = -7 + y; dx <= 7 - y; dx++) setH(best + dx, gy - 6 - y, 3);
    for (let y = 9; y < 14; y++) setH(best + 4, gy - y, 3);
    setH(best - 2, gy - 3, lit ? 0 : 2); setH(best - 1, gy - 3, lit ? 0 : 2); setH(best - 2, gy - 2, lit ? 0 : 2); setH(best - 1, gy - 2, lit ? 0 : 2);
    let sx = best + 4, sy = gy - 15; for (let k = 0; k < 6; k++) { disc(sx | 0, sy | 0, 1 + (k >> 1), (X, Y) => { if (inb(X, Y) && hard[Y * W + X] < 0) tone[Y * W + X] = night ? 2.0 : 0.8; }); sx += 2; sy -= 3; }
  }
  if (t.ground === 'oasis') {
    const n = r.int(2, 4), left = r.chance(0.5);
    for (let k = 0; k < n; k++) {
      const x0 = (left ? 14 : 120) + k * r.int(7, 12), yb = horizon - 1, ht = r.int(14, 24), lean = (r() - 0.5) * 0.6;
      let tx = x0, ty = yb;
      for (let y = 0; y < ht; y++) { tx = x0 + lean * y + Math.sin(y / ht * 2.5) * 2; ty = yb - y; setH(tx, ty, 3); setH(tx + 1, ty, 3); }
      for (const a of [-2.9, -2.4, -1.85, -1.3, -0.75, -0.25]) {
        const len = r.int(9, 13);
        for (let j = 0; j <= len; j++) { const fx = tx + 0.5 + Math.cos(a) * j, fy = ty + Math.sin(a) * j * 0.6 + j * j * 0.11; setH(fx, fy, 3); if (j > 2 && j < len - 3) setH(fx, fy + 1, 3); }
      }
      setH(tx - 1, ty + 1, 3); setH(tx + 2, ty + 1, 3);
    }
  }

  // 11. water: mirror, ripples, glitter path
  if (wet) {
    const ph = r() * 6;
    for (let y = horizon; y < H; y++) {
      const d = y - horizon, sy = horizon - 1 - d;
      const wob = Math.round(Math.sin(d * 0.85 + ph) * (0.4 + d * 0.07));
      const band = ((d + (ph * 3 | 0)) % 5 === 0) ? 0.35 : 0;
      for (let x = 0; x < W; x++) {
        const sx = clamp(x + wob, 0, W - 1), i = y * W + x;
        if (sy < 0) { tone[i] = 3; continue; }
        const j = sy * W + sx;
        tone[i] = tone[j] + 0.35 + band;
        hard[i] = star[j] ? -1 : hard[j] >= 0 ? Math.min(3, hard[j] + (d % 3 === 1 ? 1 : 0)) : -1;
      }
      if (rimA > 0 && t.sky !== 'eclipse' && t.sky !== 'overcast') {
        const spread = 3 + d * 0.32;
        for (let k = 0; k < 2; k++) { const gx = Math.round(lx + (r() - 0.5) * 2 * spread), len = r.int(2, 6); if (r.chance(0.75)) for (let x = gx; x < gx + len; x++) setH(x, y, r.chance(0.7) ? 0 : 1); }
      }
    }
    for (let x = 0; x < W; x++) if (hard[horizon * W + x] < 0) tone[horizon * W + x] = Math.max(tone[horizon * W + x], 2.6);
  }

  // 12. weather overlays
  if (t.weather === 'fog') {
    const yf = wet ? horizon - 4 : bottom - 8, fh = tall ? 30 : 16, fogT = night ? 1.9 : 0.5, ph = r() * 6;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const a = 0.8 * Math.exp(-(((y - yf) / fh) ** 2)) * (0.7 + 0.3 * Math.sin(x * 0.05 + y * 0.12 + ph)), i = y * W + x;
      tone[i] += (fogT - tone[i]) * a; if (a > 0.45 && hard[i] >= 0 && hard[i] !== 3) hard[i] = -1;
    }
  }
  if (t.weather === 'rain' || t.weather === 'storm') {
    for (let k = 0; k < (t.weather === 'storm' ? 230 : 160); k++) { let x = r.int(-20, W), y = r.int(0, H); const len = r.int(3, 7); for (let j = 0; j < len; j++, y++) { if (j % 3 === 2) x++; if (inb(x, y)) { const i = y * W + x; if (hard[i] < 0) tone[i] += tone[i] > 1.5 ? -1.1 : 1.1; } } }
  }
  if (t.weather === 'storm') {
    let x = r.int(30, 130), y = skyBottom * 0.3; const end = wet ? horizon : bottom;
    const path = [];
    while (y < end - 10) { path.push([x, y]); y += 1; x += r.int(-1, 1) + (r.chance(0.08) ? r.int(-3, 3) : 0); if (r.chance(0.04)) { let bx = x, by = y; const d = r.chance(0.5) ? 1 : -1; for (let k = 0; k < r.int(6, 14); k++) { bx += d * r.int(0, 1); by++; path.push([bx, by]); } } }
    for (const [px, py] of path) for (let dy = -8; dy <= 8; dy += 2) for (let dx = -8; dx <= 8; dx += 2) { const d = Math.hypot(dx, dy); if (d < 8) addT(px + dx, py + dy, -0.04 * (1 - d / 8)); }
    for (const [px, py] of path) setH(px, py, 0);
  }
  if (t.weather === 'snowfall') {
    for (let k = 0; k < 220; k++) { const x = r.int(0, W - 1), y = r.int(0, H - 1); setH(x, y, 0); if (r.chance(0.12)) { setH(x + 1, y, 0); setH(x, y + 1, 0); setH(x + 1, y + 1, 0); } }
  }
  if (t.extras.includes('birds')) {
    const fx = r.int(20, 130), fy = r.int(10, skyBottom * 0.45 | 0), n = r.int(3, 7);
    for (let k = 0; k < n; k++) { const bx = fx + r.int(-22, 22), by = fy + r.int(-10, 10), s = r.chance(0.3) ? 1 : 0; for (const [dx, dy] of [[-2 - s, -1 - s], [-1, 0], [0, 1], [1, 0], [2 + s, -1 - s]]) setH(bx + dx, by + dy - 1, 3); }
  }

  // 13. dither
  const px = new Uint8Array(N);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x; px[i] = hard[i] >= 0 ? hard[i] : dither(tone[i], x, y); }

  if (t.extras.includes('glitch')) {
    for (let k = 0; k < r.int(3, 6); k++) { const y0 = r.int(0, H - 12), hh = r.int(2, 9), sh = r.int(6, 50); for (let y = y0; y < y0 + hh; y++) { const row = px.slice(y * W, y * W + W); for (let x = 0; x < W; x++) px[y * W + x] = row[(x + sh) % W]; } }
    const bx = r.int(0, 140), by = r.int(0, H - 24); for (let y = by; y < by + r.int(8, 24); y++) for (let x = bx; x < bx + r.int(10, 40) && x < W; x++) px[y * W + x] = 3 - px[y * W + x];
  }
  return { w: W, h: H, px, traits: t, colors: PALETTE[t.palette] };
}

function traitRows(t) {
  return [['Palette', t.palette], ['Time', t.time], ['Sky', t.sky], ['Terrain', t.terrain], ['Ground', t.ground], ['Weather', t.weather], ['Ridges', String(t.layers)], ['Snowcaps', t.snowcaps ? 'yes' : 'no'], ...t.extras.map(e => ['Extra', e])];
}

if (typeof module !== 'undefined') module.exports = { landscape, traitsFor, traitRows, PALETTES };

// Seed Lab page. The pictures come from gen.wasm: the same C source the Game Boy ROM is built from.
let landscape, traitsFor, PALETTES;
const traitRows = (t) => [['Palette', t.palette], ['Time', t.time], ['Sky', t.sky], ['Terrain', t.terrain], ['Ground', t.ground], ['Weather', t.weather], ['Ridges', String(t.ridges)], ['Snowcaps', t.snowcaps ? 'yes' : 'no'], ...t.extras.map(e => ['Extra', e])];

SeedLab.load('../gen.wasm').then((lab) => {
  landscape = (seed) => lab.draw(seed);
  traitsFor = (seed) => lab.traits(seed);
  PALETTES = lab.palettes.map(p => [p.name, 0, p.colors]);
  start();
});

function start() {
  const RARE_PCT = 5;
  const $ = (id) => document.getElementById(id);
  const cache = new Map();
  const get = (seed, H) => { const k = seed + ':' + H; if (!cache.has(k)) cache.set(k, landscape(seed, H)); return cache.get(k); };
  let view = 'palette', base = 1, selected = null;
  try { const v = localStorage.getItem('view'); if (v) view = v; } catch (e) {}
  $('view').value = view;

  // trait odds over 10,000 seeds (traits only, no drawing)
  const ODDS = {};
  for (let s = 1; s <= 10000; s++) for (const [k, v] of traitRows(traitsFor(s))) { (ODDS[k] ??= {})[v] = (ODDS[k][v] || 0) + 1; }
  const pct = (k, v) => (ODDS[k]?.[v] || 0) / 100;
  const fmt = (p) => p < 1 ? p.toFixed(1) + '%' : Math.round(p) + '%';

  const hex = (h) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const PAL = Object.fromEntries(PALETTES.map(([n, , c]) => [n, c.map(hex)]));
  function draw(canvas, art, forceView) {
    const v = forceView || view, pal = v === 'palette' ? PAL[art.traits.palette] : PAL[v];
    canvas.width = art.w; canvas.height = art.h;
    const ctx = canvas.getContext('2d'), img = ctx.createImageData(art.w, art.h);
    for (let i = 0; i < art.px.length; i++) { const c = pal[art.px[i]]; img.data[i * 4] = c[0]; img.data[i * 4 + 1] = c[1]; img.data[i * 4 + 2] = c[2]; img.data[i * 4 + 3] = 255; }
    ctx.putImageData(img, 0, 0);
  }
  const pad = (n) => '#' + String(n).padStart(5, '0');
  const swatch = (name) => { const s = document.createElement('span'); s.className = 'swatch'; for (const c of PALETTES.find(p => p[0] === name)[2]) { const i = document.createElement('i'); i.style.background = c; s.append(i); } return s; };

  function feature(seed, btn) {
    const art = get(seed, 144);
    draw($('big'), art);
    $('bigId').textContent = pad(seed);
    $('bigTraits').replaceChildren(...traitRows(art.traits).map(([k, v]) => {
      const tr = document.createElement('tr'), p = pct(k, v);
      if (p < RARE_PCT) tr.className = 'rare';
      const a = document.createElement('td'), b = document.createElement('td'), c = document.createElement('td');
      a.textContent = k; if (k === 'Palette') b.append(swatch(v)); b.append(v); c.textContent = fmt(p);
      tr.append(a, b, c); return tr;
    }));
    if (selected) selected.setAttribute('aria-pressed', 'false');
    selected = btn || null;
    if (selected) selected.setAttribute('aria-pressed', 'true');
  }

  function card(seed) {
    const btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'card'; btn.setAttribute('aria-pressed', 'false'); btn.setAttribute('aria-label', 'Landscape ' + pad(seed));
    const cv = document.createElement('canvas'); cv.className = 'screen';
    const cap = document.createElement('div'); cap.className = 'cap';
    const a = document.createElement('b'); a.textContent = pad(seed);
    const b = document.createElement('span');
    cap.append(a, b); btn.append(cv, cap);
    btn._render = () => { const art = get(seed, 144), t = art.traits; draw(cv, art); b.textContent = `${t.time} · ${t.terrain} · ${t.palette}`; };
    btn.addEventListener('click', () => { feature(seed, btn); $('big').scrollIntoView({ block: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); });
    return btn;
  }
  let job = 0;
  function build() {
    const my = ++job;
    $('seed').value = base;
    const cards = Array.from({ length: 12 }, (_, i) => card(base + i));
    $('grid').replaceChildren(...cards);
    feature(base, cards[0]);
    const all = [...cards]; let i = 0;
    const step = () => { if (my !== job) return; const t = performance.now(); while (i < all.length && performance.now() - t < 30) all[i++]._render(); if (i < all.length) setTimeout(step, 0); };
    step();
  }

  // palettes and odds
  $('pals').replaceChildren(...PALETTES.map(([n]) => { const d = document.createElement('div'); d.className = 'pal'; const a = document.createElement('span'); a.textContent = n; const b = document.createElement('span'); b.textContent = fmt(pct('Palette', n)); d.append(swatch(n), a, b); return d; }));
  const ORDER = ['Time', 'Sky', 'Terrain', 'Ground', 'Weather', 'Ridges', 'Snowcaps', 'Extra'];
  $('odds').replaceChildren(...ORDER.map(k => {
    const d = document.createElement('div'), h = document.createElement('h3'); h.textContent = k === 'Extra' ? 'Extras (any piece can have several)' : k; d.append(h);
    const rows = Object.entries(ODDS[k] || {}).sort((a, b) => b[1] - a[1]);
    for (const [v, n] of rows) { const p = n / 100, r = document.createElement('div'); r.className = 'row'; r.innerHTML = `<span></span><span class="b"><i style="width:${Math.min(100, p * 2.5)}%"></i></span><span>${fmt(p)}</span>`; r.firstChild.textContent = v; d.append(r); }
    return d;
  }));

  $('prev').onclick = () => { base = Math.max(1, base - 12); build(); };
  $('next').onclick = () => { base += 12; build(); };
  $('rand').onclick = () => { base = 1 + Math.floor(Math.random() * 99000); build(); };
  $('seed').onchange = () => { const v = parseInt($('seed').value, 10); if (v > 0) { base = v; build(); } };
  $('view').onchange = () => { view = $('view').value; try { localStorage.setItem('view', view); } catch (e) {} build(); };
  build();

}

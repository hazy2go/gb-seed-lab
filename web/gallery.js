// Slow Horizons gallery (after the mint). Everything comes from frozen static files (data/pieces.json, data/atlas.png,
// data/replays/N.json) and the same generator the Game Boy ROM is built from (gen.wasm), so it runs without the mint
// server. Routes: #piece-N (the NFT metadata links here), #collector, #collector-ADDRESS. Images for download come
// from Arweave, where every piece is stored.
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const LCD = ['#d5d8cb', '#9aa08e', '#5a5f51', '#1f221c'];
  const TW = 160, TH = 144;
  const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const short = (s) => s ? s.slice(0, 4) + '…' + s.slice(-4) : '';
  const isAddr = (s) => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s || '');

  let DATA = null, P = [], BYN = new Map(), ATLAS = null, LAB = null, PALS = {};
  const toast = (msg) => { const t = $('toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => { t.hidden = true; }, 3600); };

  // ------------------------------------------------------------ data
  async function load() {
    DATA = await fetch('data/pieces.json').then((r) => r.json());
    P = DATA.pieces;
    for (const p of P) BYN.set(p.n, p);
    ATLAS = await new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = 'data/atlas.webp?v=' + DATA.meta.frozenAt; });
  }
  function lab() {
    if (!LAB) LAB = SeedLab.load('gen.wasm').then((l) => { for (const p of l.palettes) PALS[p.name] = p.colors; return l; });
    return LAB;
  }
  // a piece's original 160x144, straight from the atlas
  function tile(ctx, p, x, y, w, h) {
    const i = p.i, c = DATA.meta.atlasCols;
    ctx.drawImage(ATLAS, (i % c) * TW, Math.floor(i / c) * TH, TW, TH, x, y, w, h);
  }
  function pieceCanvas(p, scale = 1) {
    const c = document.createElement('canvas'); c.width = TW * scale; c.height = TH * scale; c.className = 'px';
    const g = c.getContext('2d'); g.imageSmoothingEnabled = false; tile(g, p, 0, 0, c.width, c.height);
    return c;
  }
  const name = (p) => p.title ? p.title : `No. ${p.n}`;
  const scene = (p) => { const t = p.traits || {}; return [t.time, t.terrain].filter(Boolean).join(' ') + (t.palette ? ', ' + t.palette : ''); };
  const dur = (p) => { const s = Math.round((p.drawEnd - p.drawStart) / 1000); return `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')} s`; };
  const fmtDate = (ms) => new Date(ms).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo' }) + ' JST';
  const day = (ms) => new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'Asia/Tokyo' });

  // ------------------------------------------------------------ the wall
  let wallLayout = null, wallHover = -1, wallStart = 0, WP = [];   // WP: the wall's order, the 1/1s hung together at the end
  // a salon hang: every piece in mint order, the 1/1s hung at double size; packed row by row into a grid of cells
  function pack(cols, bigOk) {
    const occ = [], at = [], take = (r, c) => { (occ[r] = occ[r] || [])[c] = 1; }, free = (r, c) => !(occ[r] && occ[r][c]);
    let r = 0, c = 0, hr = 0, hc = 0;     // r,c: where the hang continues; hr,hc: the first hole, back-filled by 1x pieces
    for (const p of WP) {
      const big = bigOk && p.special;
      if (!big) {
        for (;;) { if (hc >= cols) { hr++; hc = 0; } if (free(hr, hc)) break; hc++; }
        at.push({ r: hr, c: hc, s: 1 }); take(hr, hc);
        if (hr > r || (hr === r && hc >= c)) { r = hr; c = hc + 1; }
        continue;
      }
      for (;;) {
        if (c >= cols) { r++; c = 0; }
        if (!free(r, c)) { c++; continue; }
        if (c + 1 >= cols || !free(r, c + 1)) { c++; continue; }
        break;
      }
      at.push({ r, c, s: big ? 2 : 1 }); take(r, c);
      if (big) { take(r, c + 1); take(r + 1, c); take(r + 1, c + 1); }
      c += big ? 2 : 1;
    }
    let rows = 0, used = 0, last = 0;
    for (const q of at) { rows = Math.max(rows, q.r + q.s); used += q.s * q.s; if (q.s === 1) last = Math.max(last, q.r * cols + q.c); }
    let holes = 0;    // an empty cell before the last single piece is a hole in the wall (the closing run of big 1/1s may leave a tail)
    for (let i = 0; i < last; i++) if (free(Math.floor(i / cols), i % cols)) holes++;
    return { at, rows, used, holes };
  }
  function layoutWall() {
    const cv = $('wallCanvas');
    const box = cv.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1);
    const W = box.width, H = box.height, phone = W < 700, gap = phone ? 1 : 3, N = WP.length;
    // every piece the same size; the row length divides the count, so the last row is full
    const geo = (cols) => { const w = (W - gap * (cols + 1)) / cols, h = w * TH / TW, rows = Math.ceil(N / cols); return { cols, w, h, rows, tot: rows * (h + gap) + gap }; };
    const divs = [];
    for (let c = 4; c <= 90; c++) if (N % c === 0) divs.push(geo(c));
    let best = phone ? divs.filter((g) => g.cols >= 30).sort((x, y) => x.cols - y.cols)[0] : divs.filter((g) => g.tot <= H).sort((x, y) => y.w - x.w)[0];
    if (!best) {                                // no divisor fits: the fullest ragged grid that fits
      const all = []; for (let c = 6; c <= 90; c++) { const g = geo(c); if (g.tot <= H) all.push(g); }
      best = all.sort((x, y) => (y.w * y.w * N / (y.rows * y.cols)) - (x.w * x.w * N / (x.rows * x.cols)))[0] || geo(40);
    }
    const pk = pack(best.cols, false);
    const oy = Math.max(0, (H - best.tot) / 2);
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    wallLayout = { ...best, at: pk.at, gap, oy, dpr, W, H, ox: (W - (best.cols * (best.w + gap) + gap)) / 2 };
  }
  function wallRect(i) {
    const L = wallLayout, q = L.at[i];
    return { x: L.ox + L.gap + q.c * (L.w + L.gap), y: L.oy + L.gap + q.r * (L.h + L.gap), w: q.s * L.w + (q.s - 1) * L.gap, h: q.s * L.h + (q.s - 1) * L.gap };
  }
  function drawWall(now) {
    const cv = $('wallCanvas'), g = cv.getContext('2d'), L = wallLayout;
    g.setTransform(L.dpr, 0, 0, L.dpr, 0, 0); g.imageSmoothingEnabled = false;
    g.fillStyle = '#ede5d2'; g.fillRect(0, 0, L.W, L.H);
    const T = reduced ? 1e9 : now - wallStart, per = 2200 / WP.length, draw = 260;   // drawn in, in mint order, each scanline by scanline
    let busy = false;
    for (let i = 0; i < WP.length; i++) {
      const r = wallRect(i), k = Math.max(0, Math.min(1, (T - i * per) / draw));
      g.fillStyle = '#e4dbc5'; g.fillRect(r.x, r.y, r.w, r.h);
      if (k <= 0) { busy = true; continue; }
      if (k < 1) busy = true;
      const rows = Math.max(1, Math.round(TH * k));
      const c = DATA.meta.atlasCols, p = WP[i];
      g.drawImage(ATLAS, (p.i % c) * TW, Math.floor(p.i / c) * TH, TW, rows, r.x, r.y, r.w, r.h * rows / TH);
    }
    if (wallHover >= 0) {
      const r = wallRect(wallHover), s = 1.9, w = r.w * s, h = r.h * s;
      let x = r.x + r.w / 2 - w / 2, y = r.y + r.h / 2 - h / 2;
      x = Math.max(4, Math.min(L.W - w - 4, x)); y = Math.max(4, Math.min(L.H - h - 4, y));
      g.fillStyle = '#17181b'; g.fillRect(x - 3, y - 3, w + 6, h + 6);
      tile(g, WP[wallHover], x, y, w, h);
    }
    if (busy) requestAnimationFrame(drawWall);
  }
  function wallAt(ev) {
    const box = $('wallCanvas').getBoundingClientRect(), x = ev.clientX - box.left, y = ev.clientY - box.top;
    for (let i = 0; i < WP.length; i++) { const q = wallRect(i); if (x >= q.x && x <= q.x + q.w && y >= q.y && y <= q.y + q.h) return i; }
    return -1;
  }
  function initWall() {
    const cv = $('wallCanvas'), tip = $('tip');
    WP = P.filter((p) => !p.special).concat(P.filter((p) => p.special));
    layoutWall(); wallStart = performance.now(); requestAnimationFrame(drawWall);
    let lastW = innerWidth;
    addEventListener('resize', () => { if (innerWidth === lastW) return; lastW = innerWidth; layoutWall(); requestAnimationFrame(drawWall); });
    cv.addEventListener('pointermove', (ev) => {
      if (ev.pointerType === 'touch') return;
      const i = wallAt(ev);
      if (i !== wallHover) { wallHover = i; requestAnimationFrame(drawWall); }
      if (i < 0) { tip.hidden = true; return; }
      const box = cv.getBoundingClientRect(), p = WP[i], r = wallRect(i);
      tip.innerHTML = `<b>${esc(name(p))}</b>${esc(scene(p))}`;
      tip.style.left = Math.max(90, Math.min(box.width - 90, r.x + r.w / 2)) + 'px';
      tip.style.top = Math.max(40, r.y - r.h * .45) + 'px';
      tip.hidden = false;
    });
    cv.addEventListener('pointerleave', () => { wallHover = -1; tip.hidden = true; requestAnimationFrame(drawWall); });
    let lastPointer = 'mouse';
    cv.addEventListener('pointerdown', (ev) => { lastPointer = ev.pointerType; });
    cv.addEventListener('click', (ev) => { if (lastPointer !== 'mouse' || matchMedia('(hover: none)').matches) return; const i = wallAt(ev); if (i >= 0) location.hash = 'piece-' + WP[i].n; });
  }

  // ------------------------------------------------------------ the collection
  const KINDS = [['palette', 'Palette'], ['time', 'Time'], ['sky', 'Sky'], ['terrain', 'Terrain'], ['ground', 'Ground'], ['weather', 'Weather'], ['extras', 'Extra']];
  const F = { palette: '', time: '', sky: '', terrain: '', ground: '', weather: '', extras: '', q: '', sort: 'n' };
  const PAGE = 21;      // the collection opens on its first 21 (three rows of 7), then grows in steps of six rows
  let shown = PAGE;
  function values(k) {
    const m = new Map();
    for (const p of P) { const v = p.traits?.[k]; for (const x of (Array.isArray(v) ? v : [v])) if (x !== undefined && x !== null && x !== '') m.set(String(x), (m.get(String(x)) || 0) + 1); }
    return [...m].sort((a, b) => b[1] - a[1]);
  }
  function buildTools() {
    for (const [k] of KINDS) {     // the selects are in the page already (so nothing moves); fill their options
      const sel = $('selects').querySelector(`select[data-k="${k}"]`);
      sel.insertAdjacentHTML('beforeend', values(k).map(([v, n]) => `<option value="${esc(v)}">${esc(v)} (${n})</option>`).join(''));
    }
    $('selects').addEventListener('change', (e) => { const s = e.target; if (s.dataset.k) F[s.dataset.k] = s.value; if (s.id === 'sort') F.sort = s.value; shown = PAGE; renderGrid(); });
    $('find').addEventListener('input', (e) => { F.q = e.target.value.trim(); shown = PAGE; renderGrid(); });
    $('clearF').addEventListener('click', () => {
      Object.assign(F, { palette: '', time: '', sky: '', terrain: '', ground: '', weather: '', extras: '', q: '' });
      for (const s of $('selects').querySelectorAll('select[data-k]')) s.value = '';
      $('find').value = ''; renderGrid();
    });
    $('moreBtn').addEventListener('click', () => { shown += 42; renderGrid(); });
  }
  function filtered() {
    let list = P.filter((p) => {
      const t = p.traits || {};
      for (const [k] of KINDS) { if (!F[k]) continue; const v = t[k]; if (Array.isArray(v) ? !v.map(String).includes(F[k]) : String(v) !== F[k]) return false; }
      if (F.q) { const q = F.q.replace(/^no\.?\s*/i, '').replace(/^#/, ''); if (!(String(p.n) === q || p.wallet === F.q || (q.length > 3 && p.wallet?.toLowerCase().startsWith(q.toLowerCase())) || (p.title || '').toLowerCase().includes(q.toLowerCase()))) return false; }
      return true;
    });
    if (F.sort === 'new') list = list.slice().reverse();
    if (F.sort === 'slow') list = list.slice().sort((a, b) => (b.drawEnd - b.drawStart) - (a.drawEnd - a.drawStart));
    if (F.sort === 'fast') list = list.slice().sort((a, b) => (a.drawEnd - a.drawStart) - (b.drawEnd - b.drawStart));
    return list;
  }
  const io = 'IntersectionObserver' in window ? new IntersectionObserver((es) => {
    for (const e of es) if (e.isIntersecting) { const f = e.target, p = BYN.get(+f.dataset.n); if (p && !f.firstChild) f.append(pieceCanvas(p)); io.unobserve(f); }
  }, { rootMargin: '400px' }) : null;
  function cellHTML(p, pick) {
    return `<a class="cell" href="#piece-${p.n}" data-n="${p.n}"${pick ? ` role="button" aria-pressed="false" aria-label="${esc(name(p))}, ${esc(p.traits?.palette || '')}"` : ''}>${pick ? '<span class="tick" aria-hidden="true"></span>' : ''}<div class="frame" data-n="${p.n}"></div><div class="cap">${esc(name(p))}<span>${esc(p.traits?.palette || '')}</span></div></a>`;
  }
  function hydrate(root) { for (const f of root.querySelectorAll('.frame[data-n]')) { if (io) io.observe(f); else f.append(pieceCanvas(BYN.get(+f.dataset.n))); } }
  function renderGrid() {
    const list = filtered(), g = $('grid');
    g.innerHTML = list.slice(0, shown).map((p) => cellHTML(p)).join('');
    hydrate(g);
    $('count').textContent = list.length === P.length ? `${P.length} pieces` : `${list.length} of ${P.length} pieces`;
    $('clearF').hidden = list.length === P.length && !F.q;
    $('empty').hidden = list.length > 0;
    $('moreBtn').hidden = list.length <= shown;
    $('moreBtn').textContent = `Show ${Math.min(42, list.length - shown)} more`;
  }

  // ------------------------------------------------------------ the 1/1s
  function renderOnes() {
    const ones = P.filter((p) => p.special), found = ones.filter((p) => !p.leftover), after = ones.filter((p) => p.leftover);
    const words = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
    const cells = ones.map((p) => `<div class="one found"><a href="#piece-${p.n}"><div class="frame" data-n="${p.n}"></div><p>${esc(p.title || 'No. ' + p.n)}<span>No. ${p.n} · ${p.leftover ? 'drawn after the mint' : 'found during the mint'}</span></p></a></div>`);
    for (let k = ones.length; k < 10; k++) cells.push(`<div class="one"><div class="frame" aria-label="Never drawn"><span class="q" aria-hidden="true">?</span></div><p>Never drawn<span>sealed</span></p></div>`);
    $('ones-grid').innerHTML = cells.join('');
    hydrate($('ones-grid'));
    const cap = (s) => s[0].toUpperCase() + s.slice(1);
    let note = `${cap(words[found.length] || String(found.length))} ${found.length === 1 ? 'was' : 'were'} found during the mint.`;
    if (after.length) note += ` ${cap(words[after.length] || String(after.length))} more ${after.length === 1 ? 'was' : 'were'} drawn after it closed.`;
    if (ones.length < 10) note += ` The other ${words[10 - ones.length] || 10 - ones.length} ${10 - ones.length === 1 ? 'was' : 'were'} never drawn.`;
    $('onesNote').textContent = note;
  }

  // ------------------------------------------------------------ how it was made: real numbers, the heartbeat of every piece
  function renderStory() {
    const ms = P.reduce((s, p) => s + (p.drawEnd - p.drawStart), 0), frames = P.reduce((s, p) => s + (p.frames || 0), 0);
    const matched = P.filter((p) => p.match).length, hrs = ms / 3.6e6;
    const first = Math.min(...P.map((p) => p.drawStart)), last = Math.max(...P.map((p) => p.drawEnd));
    const avg = ms / P.length / 1000;
    $('rig').innerHTML = [
      ['Pieces drawn', P.length.toLocaleString('en-US')], ['Days', `${new Date(first).toLocaleDateString('en-GB', { day: 'numeric', timeZone: 'Asia/Tokyo' })} to ${new Date(last).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Asia/Tokyo' })}`],
      ['Time per piece', `about ${Math.floor(avg / 60)} min ${String(Math.round(avg % 60)).padStart(2, '0')} s`], ['Hours of drawing', hrs.toFixed(1)],
      ['Frames sent', frames.toLocaleString('en-US')], ['Matched the reference', `${matched} of ${P.length}`],
    ].map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join('');
    // an example piece for the seed step: the one in the footage when it exists
    const ex = BYN.get(115) || P[0];
    $('seedEx').innerHTML = `<i>piece</i>       No. ${ex.n}\n<i>seed block</i>  ${esc(ex.seedBlock)}\n<i>blockhash</i>   ${esc(ex.seedBlockhash)}\n<i>formula</i>     sha256(payment || blockhash)[0..4]\n<i>seed</i>        <em>${esc(ex.seedHex)}</em>`;
    const ar = P.find((p) => p.ar?.meta);
    $('keptEx').innerHTML = `<i>frozen</i>    ${esc(new Date(DATA.meta.frozenAt).toISOString().slice(0, 10))}\n<i>pieces</i>    ${P.length}, from ${DATA.meta.wallets} wallets\n<i>replays</i>   ${P.filter((p) => p.replay).length}\n<i>storage</i>   Arweave, Solana\n<i>example</i>   ${ar ? `<a href="${esc(ar.ar.meta)}" target="_blank" rel="noopener" style="color:inherit">No. ${ar.n} metadata</a>` : ''}`;
    // heartbeat strip: x = piece number, y = ppm
    const cv = $('hb'), g = cv.getContext('2d'), box = cv.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1);
    cv.width = box.width * dpr; cv.height = box.height * dpr; g.scale(dpr, dpr);
    const pts = P.filter((p) => p.heartbeat && typeof p.heartbeat.ppm === 'number');
    if (!pts.length) return;
    const vs = pts.map((p) => p.heartbeat.ppm), lo = Math.min(...vs), hi = Math.max(...vs), mid = (lo + hi) / 2, span = Math.max(4, (hi - lo) * 1.12);
    const W = box.width, H = box.height, pl = 46, pr = 10, pt = 12, pb = 22;
    const X = (i) => pl + (W - pl - pr) * i / Math.max(1, pts.length - 1), Y = (v) => pt + (H - pt - pb) * (1 - (v - (mid - span / 2)) / span);
    g.strokeStyle = '#26272b'; g.fillStyle = '#9a9ba0'; g.font = '11px "JetBrains Mono", monospace'; g.lineWidth = 1;
    for (const v of [Math.round(lo), Math.round(mid), Math.round(hi)]) { const y = Math.round(Y(v)) + .5; g.beginPath(); g.moveTo(pl, y); g.lineTo(W - pr, y); g.stroke(); g.fillText(v + ' ppm', 0, y + 4); }
    const ly = Math.round(Y(Math.round(lo))) + 18;     // the axis labels sit right under the lowest gridline
    g.fillText('No. ' + pts[0].n, pl, ly); const lt = 'No. ' + pts[pts.length - 1].n; g.fillText(lt, W - pr - g.measureText(lt).width, ly);
    g.fillStyle = '#e3c27a';
    pts.forEach((p, i) => g.fillRect(Math.round(X(i)) - 1, Math.round(Y(p.heartbeat.ppm)) - 1, 2.5, 2.5));
    const med = vs.slice().sort((a, b) => a - b)[vs.length >> 1];
    $('hbCap').textContent = `Each dot is one piece's heartbeat, in parts per million off nominal: all ${pts.length} within ${(hi - lo).toFixed(1)} ppm of each other, around ${med.toFixed(1)}. One crystal, the same console every time.`;
  }
  function initFilm() {
    const film = $('film');
    if (reduced) document.querySelector('[data-vid=film]').textContent = 'Play';
    else if ('IntersectionObserver' in window) {
      const ob = new IntersectionObserver((es) => { for (const e of es) { if (e.isIntersecting) { film.preload = 'auto'; film.play().catch(() => {}); } else if (!film.paused) film.pause(); } }, { threshold: .25 });
      ob.observe(film);
    }
    document.addEventListener('click', (e) => {
      const b = e.target.closest('[data-vid]'); if (!b) return;
      const v = $(b.dataset.vid); if (v.paused) { v.play(); b.textContent = 'Pause'; } else { v.pause(); b.textContent = 'Play'; }
    });
  }

  // ------------------------------------------------------------ piece view (#piece-N)
  let replayToken = 0;
  async function showPiece(n) {
    const p = BYN.get(n);
    if (!p) { toast(`No. ${n} is not in the gallery.`); location.hash = ''; return; }
    const idx = P.indexOf(p), prev = P[idx - 1], next = P[idx + 1];
    const t = p.traits || {};
    const ex = Array.isArray(t.extras) && t.extras.length ? t.extras.join(', ') : 'none';
    $('room').innerHTML = `
      <div class="room-bar"><a href="#gallery"><svg class="chev" viewBox="0 0 10 16" aria-hidden="true"><path d="M8 2 2 8l6 6"/></svg>Collection</a><div class="room-nav">${prev ? `<a href="#piece-${prev.n}" aria-label="Previous piece, No. ${prev.n}"><svg class="chev" viewBox="0 0 10 16" aria-hidden="true"><path d="M8 2 2 8l6 6"/></svg>No. ${prev.n}</a>` : ''}${next ? `<a href="#piece-${next.n}" aria-label="Next piece, No. ${next.n}">No. ${next.n}<svg class="chev" viewBox="0 0 10 16" aria-hidden="true"><path d="m2 2 6 6-6 6"/></svg></a>` : ''}</div></div>
      <div class="room-grid">
        <div class="stage studio"><canvas id="stageCv" class="px" width="160" height="144" aria-label="${esc(name(p))}: ${esc(p.description || scene(p))}"></canvas>
          <div class="stage-bar"><span id="stageNote">NO. ${p.n} · ${esc((t.palette || '').toUpperCase())}</span>${p.replay ? '<button class="btn btn-line" type="button" id="replayBtn">Replay the drawing</button>' : ''}</div></div>
        <div class="label">
          <h1>${esc(name(p))}</h1>
          <p class="sub">${esc(p.description || scene(p))}</p>
          <dl class="facts">
            ${p.title ? `<dt>Edition</dt><dd class="t">1/1, No. ${p.n}</dd>` : ''}
            <dt>Palette</dt><dd class="t"><span class="pal" id="palSw"></span>${esc(t.palette)}</dd>
            <dt>Scene</dt><dd class="t">${esc([t.time, t.sky, t.terrain, t.ground, t.weather].filter(Boolean).join(', '))}</dd>
            <dt>Ridges</dt><dd class="t">${esc(t.ridges ?? '')}${t.snowcaps ? ', snowcaps' : ''}</dd>
            <dt>Extras</dt><dd class="t">${esc(ex)}</dd>
            <dt>Drawn</dt><dd class="t">${esc(fmtDate(p.drawStart))}, in ${esc(dur(p))}</dd>
            <dt>Frames</dt><dd>${esc((p.frames || 0).toLocaleString('en-US'))}</dd>
            <dt>Heartbeat</dt><dd>${p.heartbeat?.ppm != null ? esc(p.heartbeat.ppm.toFixed(2)) + ' ppm' : '–'}${p.heartbeat?.intervals ? ` <span style="color:var(--muted)">over ${esc(p.heartbeat.intervals.toLocaleString('en-US'))} clock edges</span>` : ''}</dd>
            <dt>Reference</dt><dd class="t">${p.match ? 'matched pixel for pixel' : 'not matched'}</dd>
            <dt>Seed</dt><dd>${esc(p.seedHex)}${p.special && !p.seedBlock ? ' <span style="color:var(--muted);font-family:var(--sans)">fixed, hand-made scene</span>' : ''}</dd>
            ${p.seedBlock ? `<dt>Seed block</dt><dd><a href="https://explorer.solana.com/block/${esc(p.seedBlock)}" target="_blank" rel="noopener">${esc(p.seedBlock)}</a></dd>` : ''}
            <dt>Collector</dt><dd><a href="#collector-${esc(p.wallet)}">${esc(short(p.wallet))}</a> <span style="color:var(--muted)">at mint</span></dd>
            ${p.mint ? `<dt>Market</dt><dd class="t"><a href="https://www.tensor.trade/item/${esc(p.mint)}" target="_blank" rel="noopener">View on Tensor</a></dd>` : ''}
            ${p.mint ? `<dt>On chain</dt><dd><a href="https://explorer.solana.com/address/${esc(p.mint)}" target="_blank" rel="noopener">${esc(short(p.mint))}</a></dd>` : ''}
            ${p.ar?.meta ? `<dt>Arweave</dt><dd><a href="${esc(p.ar.meta)}" target="_blank" rel="noopener">metadata</a></dd>` : ''}
          </dl>
          <div class="dl">
            <button class="btn" type="button" data-file="${esc(p.ar?.hires || '')}" data-name="slow-horizons-${p.n}.png"${p.ar?.hires ? '' : ' hidden'}>Full size <small>1920×1728</small></button>
            <button class="btn btn-line" type="button" data-banner="${p.n}">Banner <small>1728×576</small></button>
            <button class="btn btn-line" type="button" data-file="${esc(p.ar?.x1 || '')}" data-name="slow-horizons-${p.n}-original.png"${p.ar?.x1 ? '' : ' hidden'}>Original <small>160×144</small></button>
            ${p.replay ? `<button class="btn btn-line" type="button" data-gif="${p.n}">Replay as GIF <small>480×432</small></button>` : ''}
          </div>
          <p class="note">The banner continues the scene to both sides, drawn by the same code in your browser.</p>
          <div class="sendbox" id="sendBox" hidden>
            <p class="sendhead">You hold this piece.</p>
            <form id="sendForm" class="sendform"><label class="vh" for="sendTo">Recipient Solana address</label><input id="sendTo" type="text" placeholder="Recipient Solana address" autocomplete="off" autocapitalize="off" spellcheck="false"><button class="btn" type="submit">Send</button></form>
            <p class="note" id="sendMsg" role="status">A transfer cannot be undone. Check the address.</p>
          </div>
        </div>
      </div>`;
    const cv = $('stageCv'), g = cv.getContext('2d'); g.imageSmoothingEnabled = false; tile(g, p, 0, 0, 160, 144);
    initSend(p);
    lab().then(() => { const s = $('palSw'); if (s) s.innerHTML = (PALS[t.palette] || LCD).map((c) => `<i style="background:${c}"></i>`).join(''); });
    $('replayBtn')?.addEventListener('click', () => replayInto(p, cv));
    document.title = `${name(p)} · Slow Horizons`;
  }
  function decode(b64) {
    const bin = atob(b64), px = new Uint8Array(TW * TH);
    for (let n = 0; n < 360; n++) {
      const tx = n % 20, ty = (n / 20) | 0;
      for (let r = 0; r < 8; r++) {
        const lo = bin.charCodeAt(n * 16 + r * 2), hi = bin.charCodeAt(n * 16 + r * 2 + 1);
        for (let c = 0; c < 8; c++) px[(ty * 8 + r) * TW + tx * 8 + c] = ((lo >> (7 - c)) & 1) | (((hi >> (7 - c)) & 1) << 1);
      }
    }
    return px;
  }
  function paint(cv, px, colors, rows = TH) {
    const g = cv.getContext('2d'), img = g.getImageData(0, 0, TW, TH), pal = colors.map(rgb);
    for (let i = 0; i < TW * rows; i++) { const c = pal[px[i]]; img.data[i * 4] = c[0]; img.data[i * 4 + 1] = c[1]; img.data[i * 4 + 2] = c[2]; img.data[i * 4 + 3] = 255; }
    g.putImageData(img, 0, 0);
  }
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  async function replayInto(p, cv) {
    const tok = ++replayToken, note = $('stageNote'), btn = $('replayBtn');
    if (btn) btn.disabled = true;
    const r = await fetch(`data/replays/${p.n}.json`).then((x) => x.json()).catch(() => null);
    if (!r?.phases?.length) { toast('No replay stored for this piece.'); if (btn) btn.disabled = false; return; }
    await lab();
    const colors = PALS[p.traits.palette] || LCD;
    paint(cv, new Uint8Array(TW * TH), LCD);
    const total = r.phases[r.phases.length - 1].t || 1, span = 9000;
    let prevT = 0;
    for (const [k, ph] of r.phases.entries()) {
      if (tok !== replayToken) return;
      note.textContent = `REPLAY · SCREEN UPDATE ${k + 1} OF ${r.phases.length}`;
      await sleep(Math.max(260, (ph.t - prevT) / total * span)); prevT = ph.t;
      const px = decode(ph.tiles);
      if (reduced) paint(cv, px, LCD);
      else for (let row = 8; row <= TH; row += 8) { if (tok !== replayToken) return; paint(cv, px, LCD, row); await sleep(16); }
    }
    await sleep(600);
    const px = decode(r.phases[r.phases.length - 1].tiles), from = LCD.map(rgb), to = colors.map(rgb), t0 = performance.now();
    note.textContent = `THE PALETTE IS APPLIED · ${(p.traits.palette || '').toUpperCase()}`;
    while (true) {
      if (tok !== replayToken) return;
      const k = reduced ? 1 : Math.min(1, (performance.now() - t0) / 1400), e = k * k * (3 - 2 * k);
      paint(cv, px, from.map((f, i) => '#' + f.map((v, j) => Math.round(v + (to[i][j] - v) * e).toString(16).padStart(2, '0')).join('')));
      if (k >= 1) break; await sleep(16);
    }
    note.textContent = `NO. ${p.n} · ${(p.traits.palette || '').toUpperCase()}`;
    if (btn) btn.disabled = false;
  }

  // ------------------------------------------------------------ downloads: banner, GIF, everything at once
  async function bannerBlob(p, scale = 4) {
    const l = await lab();
    if (p.special) l.special(p.special);
    let art; try { art = l.banner(p.seed); } finally { if (p.special) l.special(0); }
    const c = document.createElement('canvas'); c.width = art.w * scale; c.height = art.h * scale;
    const s = document.createElement('canvas'); s.width = art.w; s.height = art.h;
    const g = s.getContext('2d'), img = g.createImageData(art.w, art.h), pal = art.colors.map(rgb);
    for (let i = 0; i < art.px.length; i++) { const q = pal[art.px[i]]; img.data[i * 4] = q[0]; img.data[i * 4 + 1] = q[1]; img.data[i * 4 + 2] = q[2]; img.data[i * 4 + 3] = 255; }
    g.putImageData(img, 0, 0);
    const cg = c.getContext('2d'); cg.imageSmoothingEnabled = false; cg.drawImage(s, 0, 0, c.width, c.height);
    return new Promise((res) => c.toBlob(res, 'image/png'));
  }
  // phones and in-wallet browsers (Jupiter, Phantom...) refuse downloads: show images full screen to long-press and
  // save, as the mint page did (2026-10-21); a ZIP goes through the share sheet when there is one. Desktops get the file.
  const touch = matchMedia('(hover: none) and (pointer: coarse)').matches || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  function showSave(blob, filename) {
    const url = URL.createObjectURL(blob), d = document.createElement('div');
    d.className = 'save-view'; d.setAttribute('role', 'dialog'); d.setAttribute('aria-label', 'Save ' + filename);
    d.innerHTML = `<div class="save-box"><img src="${url}" alt="${esc(filename)}"><p>Press and hold the image, then choose <b>Save</b> or <b>Add to Photos</b>.</p><button type="button" class="btn">Close</button></div>`;
    const close = () => { d.remove(); URL.revokeObjectURL(url); };
    d.addEventListener('click', (e) => { if (e.target === d || e.target.closest('button')) close(); });
    document.body.append(d);
  }
  async function save(blob, filename) {
    if (touch && /^image\//.test(blob.type)) return showSave(blob, filename);
    if (touch) {
      const file = new File([blob], filename, { type: blob.type });
      try { if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: filename }); return; } } catch (e) { if (e?.name === 'AbortError') return; }
    }
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 8000);
  }
  document.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-banner]');
    if (b) { const p = BYN.get(+b.dataset.banner); save(await bannerBlob(p), `slow-horizons-${p.n}-banner.png`); return; }
    const fl = e.target.closest('[data-file]');
    if (fl) {     // Arweave is another origin, so fetch it and save it rather than navigating to it
      fl.disabled = true;
      try { save(new Blob([await fetchBytes([fl.dataset.file])], { type: 'image/png' }), fl.dataset.name); }
      catch { window.open(fl.dataset.file, '_blank', 'noopener'); } finally { fl.disabled = false; }
      return;
    }
    const gf = e.target.closest('[data-gif]');
    if (gf) {
      const p = BYN.get(+gf.dataset.gif); gf.disabled = true;
      try {
        const r = await fetch(`data/replays/${p.n}.json`).then((x) => x.json()); await lab();
        save(new Blob([ReplayGif.build(r, LCD, PALS[p.traits.palette] || LCD)], { type: 'image/gif' }), `slow-horizons-${p.n}-replay.gif`);
      } catch { toast('Could not build the GIF.'); } finally { gf.disabled = false; }
    }
  });
  async function fetchBytes(urls) {
    for (const u of urls.filter(Boolean)) { try { const r = await fetch(u); if (r.ok) return new Uint8Array(await r.arrayBuffer()); } catch { /* try the next */ } }
    throw new Error('not reachable');
  }
  async function downloadAll(list, addr) {
    const btn = $('zipBtn'), bar = $('zipBar'), fill = bar.firstElementChild, files = [];
    btn.disabled = true; bar.hidden = false;
    let done = 0, failed = [];
    const one = async (p) => {
      try { files.push({ name: `slow-horizons-${p.n}.png`, data: await fetchBytes([p.ar?.hires]) }); } catch { failed.push(p.n); }
      try { files.push({ name: `banners/slow-horizons-${p.n}-banner.png`, data: new Uint8Array(await (await bannerBlob(p)).arrayBuffer()) }); } catch { /* banner is a bonus */ }
      done++; fill.style.transform = `scaleX(${done / list.length})`; btn.textContent = `Packing ${done} of ${list.length}…`;
    };
    const q = list.slice(); await Promise.all(Array.from({ length: 4 }, async () => { while (q.length) await one(q.shift()); }));
    files.sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true }));
    save(Zip.make(files), `slow-horizons-${short(addr).replace('…', '-')}.zip`);
    btn.disabled = false; btn.textContent = `Download all (${list.length})`; setTimeout(() => { bar.hidden = true; fill.style.transform = 'scaleX(0)'; }, 1500);
    if (failed.length) toast(`${failed.length} full-size image${failed.length > 1 ? 's' : ''} could not be fetched (${failed.slice(0, 5).map((n) => 'No. ' + n).join(', ')}). Try again in a minute.`);
  }

  // ------------------------------------------------------------ send (the connected holder, Wallet Standard signTransaction)
  const b64 = (u8) => { let s = ''; for (const c of u8) s += String.fromCharCode(c); return btoa(s); };
  const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  async function initSend(p) {
    const box = $('sendBox'); if (!box || !p.mint || !connected?.wallet?.features?.['solana:signTransaction']) return;
    const ids = await ownedNow(connected.address);
    if (!ids || !ids.includes(p.mint) || location.hash !== '#piece-' + p.n) return;
    box.hidden = false;
    $('sendForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const to = $('sendTo').value.trim(), msg = $('sendMsg'), btn = e.target.querySelector('button');
      if (!isAddr(to)) { msg.textContent = 'That is not a Solana address.'; return; }
      if (to === connected.address) { msg.textContent = 'That is the wallet that already holds it.'; return; }
      btn.disabled = true; msg.textContent = 'Preparing the transfer…';
      try {
        const body = { assetId: p.mint, owner: connected.address, to };
        const r1 = await fetch('api/transfer', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then((x) => x.json());
        if (!r1.tx) throw new Error(r1.error || 'The transfer could not be prepared.');
        msg.textContent = 'Approve the transfer in your wallet…';
        const [res] = await connected.wallet.features['solana:signTransaction'].signTransaction({ transaction: unb64(r1.tx), account: connected.account, chain: 'solana:mainnet' });
        msg.textContent = 'Sending…';
        const r2 = await fetch('api/send', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...body, tx: b64(res.signedTransaction) }) }).then((x) => x.json());
        if (!r2.signature) throw new Error(r2.error || 'The transfer was not sent.');
        ownedCache.delete(connected.address);
        msg.innerHTML = `Sent to ${esc(short(to))}. <a href="https://explorer.solana.com/tx/${esc(r2.signature)}" target="_blank" rel="noopener">See the transaction</a>`;
        e.target.hidden = true;
      } catch (err) {
        const m = String(err?.message || err);
        msg.textContent = /reject|cancel|denied|declined/i.test(m) ? 'You cancelled in the wallet. Nothing was sent.' : m;
        btn.disabled = false;
      }
    });
  }

  async function sendMany(list, to) {
    const msg = $('bulkMsg'), btn = $('bulkBtn');
    if (!list.length) return;
    if (!isAddr(to)) { msg.textContent = 'That is not a Solana address.'; return; }
    if (to === connected.address) { msg.textContent = 'That is the wallet that already holds them.'; return; }
    btn.disabled = true;
    try {
      const built = [];
      for (const [k, p] of list.entries()) {
        msg.textContent = `Preparing ${k + 1} of ${list.length}…`;
        const r = await fetch('api/transfer', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ assetId: p.mint, owner: connected.address, to }) }).then((x) => x.json());
        if (!r.tx) throw new Error(`No. ${p.n}: ${r.error || 'could not be prepared'}`);
        built.push({ p, tx: r.tx });
      }
      msg.textContent = list.length > 1 ? `Approve the ${list.length} transfers in your wallet…` : 'Approve the transfer in your wallet…';
      const signed = await connected.wallet.features['solana:signTransaction'].signTransaction(...built.map((b) => ({ transaction: unb64(b.tx), account: connected.account, chain: 'solana:mainnet' })));
      const ok = [], bad = [];
      for (const [k, b] of built.entries()) {
        msg.textContent = `Sending ${k + 1} of ${built.length}…`;
        const r = await fetch('api/send', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ assetId: b.p.mint, owner: connected.address, to, tx: b64(signed[k].signedTransaction) }) }).then((x) => x.json());
        if (r.signature) ok.push(b.p.n); else bad.push(`No. ${b.p.n} (${r.error || 'failed'})`);
      }
      ownedCache.delete(connected.address);
      msg.textContent = `Sent ${ok.length} of ${built.length} to ${short(to)}.` + (bad.length ? ' Not sent: ' + bad.join(', ') + '.' : '');
      if (ok.length) setTimeout(() => showCollector(owner), 2500);
    } catch (err) {
      const m = String(err?.message || err);
      msg.textContent = /reject|cancel|denied|declined/i.test(m) ? 'You cancelled in the wallet. Nothing was sent.' : m;
    } finally { btn.disabled = !picked.size; }
  }

  // ------------------------------------------------------------ collector (#collector, #collector-ADDRESS)
  let mine = [], picked = new Set(), owner = '';
  const BYASSET = new Map();
  const ownedCache = new Map();
  async function ownedNow(addr) {     // asset ids held right now (api/owned, Vercel); null when the lookup is not available
    if (ownedCache.has(addr)) return ownedCache.get(addr);
    try {
      const r = await fetch('api/owned?wallet=' + encodeURIComponent(addr)); if (!r.ok) return null;
      const ids = (await r.json()).ids; ownedCache.set(addr, ids); return ids;
    } catch { return null; }
  }
  let collectorJob = 0;
  async function showCollector(addr) {
    const job = ++collectorJob;
    $('connMsg').textContent = '';
    if (addr && !isAddr(addr)) { $('connMsg').textContent = 'That does not look like a Solana address.'; addr = ''; }
    owner = addr || ''; $('addrIn').value = owner;
    $('mineOut').hidden = !owner;
    if (!owner) return;
    if (!BYASSET.size) for (const p of P) if (p.mint) BYASSET.set(p.mint, p);
    $('mineHead').textContent = 'Looking up this wallet…';
    const ids = await ownedNow(owner);
    if (job !== collectorJob) return;
    const now = ids !== null;
    mine = now ? ids.map((id) => BYASSET.get(id)).filter(Boolean).sort((a, b) => a.n - b.n) : P.filter((p) => p.wallet === owner);
    picked = new Set();
    $('mineHead').innerHTML = mine.length
      ? `<b>${short(owner)}</b> ${now ? 'holds' : 'collected'} <b>${mine.length}</b> piece${mine.length > 1 ? 's' : ''}${now ? '' : ' at the mint'}.`
      : `<b>${short(owner)}</b> ${now ? 'holds no Slow Horizons right now.' : 'had no pieces minted to it.'} <a href="https://www.tensor.trade/trade/slow_horizons" target="_blank" rel="noopener">Find one on Tensor</a>.`;
    $('mineActs').hidden = !mine.length; $('maker').hidden = !mine.length;
    $('zipBtn').textContent = `Download all (${mine.length})`;
    const g = $('mineGrid'); g.innerHTML = mine.map((p) => cellHTML(p, true)).join(''); hydrate(g);
    $('selBar').hidden = !mine.length;
    $('bulkSend').hidden = !(now && connected?.address === owner && connected.wallet?.features?.['solana:signTransaction']);
    $('bulkMsg').hidden = $('bulkSend').hidden;
    updateSel(); drawCollage();
  }
  function updateSel() {
    const n = picked.size;
    $('selCount').innerHTML = n ? `<b>${n}</b> selected` : (mine.length ? 'Tap pieces to select them.' : '');
    $('pickAll').textContent = n === mine.length && n ? 'Select none' : 'Select all';
    $('bulkBtn').disabled = !n; $('bulkBtn').textContent = n ? `Send ${n}` : 'Send';
  }
  // wallets: the Wallet Standard (Jupiter, Phantom, Solflare, Backpack...) plus the older injected providers
  const standard = [];
  function onRegister(...ws) { for (const w of ws) if (w?.features?.['standard:connect'] && (w.chains || []).some((c) => String(c).startsWith('solana:')) && !standard.includes(w)) standard.push(w); }
  addEventListener('wallet-standard:register-wallet', (e) => { try { e.detail({ register: onRegister }); } catch { /* a broken wallet */ } });
  try { dispatchEvent(new CustomEvent('wallet-standard:app-ready', { detail: { register: onRegister } })); } catch { /* old browser */ }
  function wallets() {
    const list = standard.map((w) => ({ name: w.name, icon: w.icon, connect: async () => {
      const r = await w.features['standard:connect'].connect(); const acc = (r?.accounts || w.accounts || [])[0];
      if (acc) connected = { address: acc.address, account: acc, wallet: w };
      return acc?.address; } }));
    const seen = new Set(list.map((w) => w.name.toLowerCase().split(' ')[0]));
    for (const [name, p] of [['Phantom', window.phantom?.solana], ['Solflare', window.solflare], ['Backpack', window.backpack?.solana || window.backpack], ['Jupiter', window.jupiter?.solana || window.jupiter], ['Solana wallet', window.solana]]) {
      if (!p?.connect || seen.has(name.toLowerCase().split(' ')[0])) continue;
      seen.add(name.toLowerCase().split(' ')[0]);
      list.push({ name, icon: null, connect: async () => { const r = await p.connect(); return (r?.publicKey || p.publicKey)?.toString(); } });
    }
    return list;
  }
  let connected = null;      // { address, account, wallet } once a Wallet Standard wallet connects
  async function useWallet(w) {
    $('connMsg').textContent = `Connecting to ${w.name}…`;
    try { const pk = await w.connect(); if (pk) { location.hash = 'collector-' + pk; return; } throw new Error('no account'); }
    catch { $('connMsg').textContent = `${w.name} did not connect. You can paste your address instead.`; }
  }
  async function connectWallet() {
    let list = wallets();
    if (!list.length) { await new Promise((r) => setTimeout(r, 400)); list = wallets(); }   // some wallets register a moment late
    if (!list.length) { $('connMsg').textContent = 'No Solana wallet found in this browser. Paste your address instead.'; return; }
    if (list.length === 1) return useWallet(list[0]);
    const m = $('connMsg'); m.textContent = ''; m.className = 'msg picks';
    for (const w of list) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'btn btn-line';
      if (w.icon && /^data:image\//.test(w.icon)) { const i = document.createElement('img'); i.src = w.icon; i.alt = ''; i.width = i.height = 18; b.append(i); }
      b.append(w.name); b.addEventListener('click', () => { m.className = 'msg'; useWallet(w); }); m.append(b);
    }
  }
  function initCollector() {
    $('connectBtn').addEventListener('click', connectWallet);
    $('addrForm').addEventListener('submit', (e) => { e.preventDefault(); const a = $('addrIn').value.trim(); location.hash = 'collector-' + a; });
    $('mineGrid').addEventListener('click', (e) => {
      const c = e.target.closest('.cell'); if (!c) return; e.preventDefault();
      const n = +c.dataset.n; if (picked.has(n)) picked.delete(n); else picked.add(n);
      c.setAttribute('aria-pressed', String(picked.has(n))); updateSel(); drawCollage();
    });
    $('pickAll').addEventListener('click', () => { const all = picked.size !== mine.length; picked = new Set(all ? mine.map((p) => p.n) : []); for (const c of $('mineGrid').children) c.setAttribute('aria-pressed', String(all)); updateSel(); drawCollage(); });
    $('bulkSend').addEventListener('submit', (e) => { e.preventDefault(); sendMany(mine.filter((p) => picked.has(p.n)), $('bulkTo').value.trim()); });
    $('zipBtn').addEventListener('click', () => downloadAll(mine, owner));
    $('maker').addEventListener('change', drawCollage);
    $('collageBtn').addEventListener('click', () => $('collageCv').toBlob((b) => save(b, `slow-horizons-${$('maker').querySelector('[name=fmt]:checked').value}.png`), 'image/png'));
  }

  // ------------------------------------------------------------ the collage maker
  const FORMATS = { grid: null, x: [1500, 500], phone: [1170, 2532], square: [2048, 2048], banners: null };
  const BGS = { paper: '#f5eede', ink: '#17181b', black: '#000000', white: '#ffffff' };
  let collageJob = 0;
  async function drawCollage() {
    const job = ++collageJob, cv = $('collageCv'), list = mine.filter((p) => picked.has(p.n));
    const f = (k) => $('maker').querySelector(`[name=${k}]:checked`)?.value;
    const fmt = f('fmt'), gapK = f('gap'), bg = BGS[f('bg')] || BGS.paper;
    $('collageBtn').disabled = !list.length;
    if (!list.length) { cv.width = 600; cv.height = 300; const g = cv.getContext('2d'); g.fillStyle = bg; g.fillRect(0, 0, 600, 300); $('collageInfo').textContent = 'Pick at least one piece.'; return; }
    const N = list.length;
    if (fmt === 'banners') {         // each piece's banner, stacked
      const l = await lab(); if (job !== collageJob) return;
      const s = N > 12 ? 2 : 3, gap = { none: 0, thin: 4 * s, wide: 16 * s }[gapK];
      const w = 432 * s, h = 144 * s; cv.width = w + 2 * gap; cv.height = N * h + (N + 1) * gap;
      const g = cv.getContext('2d'); g.imageSmoothingEnabled = false; g.fillStyle = bg; g.fillRect(0, 0, cv.width, cv.height);
      const tmp = document.createElement('canvas'); tmp.width = 432; tmp.height = 144; const tg = tmp.getContext('2d');
      list.forEach((p, k) => {
        if (p.special) l.special(p.special); let art; try { art = l.banner(p.seed); } finally { if (p.special) l.special(0); }
        const img = tg.createImageData(432, 144), pal = art.colors.map(rgb);
        for (let i = 0; i < art.px.length; i++) { const q = pal[art.px[i]]; img.data[i * 4] = q[0]; img.data[i * 4 + 1] = q[1]; img.data[i * 4 + 2] = q[2]; img.data[i * 4 + 3] = 255; }
        tg.putImageData(img, 0, 0); g.drawImage(tmp, gap, gap + k * (h + gap), w, h);
      });
      $('collageInfo').textContent = `${cv.width} × ${cv.height} px · ${N} banner${N > 1 ? 's' : ''}`; return;
    }
    // grids: choose columns that make the biggest tiles inside the frame; integer pixel scale when there is room
    let W, H, cols, rows, size;
    const gapOf = (t) => ({ none: 0, thin: Math.max(2, Math.round(t * .04)), wide: Math.max(6, Math.round(t * .12)) }[gapK]);
    if (!FORMATS[fmt]) {           // poster grid: square-ish, integer scale, big
      cols = Math.ceil(Math.sqrt(N * 1.1)); rows = Math.ceil(N / cols);
      const s = N <= 4 ? 8 : N <= 16 ? 5 : N <= 49 ? 3 : 2; size = TW * s;
      const gp = gapOf(size); W = cols * size + (cols + 1) * gp; H = rows * size * .9 + (rows + 1) * gp;
    } else {
      [W, H] = FORMATS[fmt]; let best = null;
      for (let c = 1; c <= N; c++) {
        const r = Math.ceil(N / c); let t = Math.min(W / (c + (c + 1) * .04 * (gapK !== 'none')), H / (r * .9 + (r + 1) * .04 * (gapK !== 'none')) / 1);
        if (gapK === 'wide') t = Math.min(W / (c + (c + 1) * .12), H / (r * .9 + (r + 1) * .12));
        if (!best || t > best.t) best = { c, r, t };
      }
      cols = best.c; rows = best.r; size = best.t;
      const s = Math.floor(size / TW); if (s >= 1) size = s * TW;     // crisp pixels when every piece gets at least 1:1
      size *= .92;
      if (s >= 1) size = Math.max(TW, Math.floor(size / TW) * TW);
    }
    const th = size * TH / TW, gp = gapOf(size);
    cv.width = Math.round(W); cv.height = Math.round(H);
    const g = cv.getContext('2d'); g.imageSmoothingEnabled = false; g.fillStyle = bg; g.fillRect(0, 0, cv.width, cv.height);
    const gw = cols * size + (cols - 1) * gp, gh = rows * th + (rows - 1) * gp, ox = (cv.width - gw) / 2, oy = (cv.height - gh) / 2;
    list.forEach((p, k) => {
      const r = Math.floor(k / cols), inRow = r === rows - 1 ? N - r * cols : cols, rx = (cv.width - (inRow * size + (inRow - 1) * gp)) / 2;
      tile(g, p, Math.round(rx + (k % cols) * (size + gp)), Math.round(oy + r * (th + gp)), Math.round(size), Math.round(th));
    });
    $('collageInfo').textContent = `${cv.width} × ${cv.height} px · ${N} piece${N > 1 ? 's' : ''}`;
  }

  // ------------------------------------------------------------ routing
  function route() {
    const h = decodeURIComponent(location.hash.slice(1));
    const m = h.match(/^piece-(\d+)$/), c = h.match(/^collector(?:-(.+))?$/);
    const views = { home: $('home'), room: $('room'), coll: $('collector') };
    const show = (k) => { for (const [n, el] of Object.entries(views)) el.hidden = n !== k; };
    replayToken++;
    for (const a of document.querySelectorAll('.nav a')) a.removeAttribute('aria-current');
    if (m) { show('room'); showPiece(+m[1]); scrollTo(0, 0); return; }
    if (c) { show('coll'); showCollector(c[1] || ''); document.title = 'Your pieces · Slow Horizons'; scrollTo(0, 0); return; }
    document.title = 'Slow Horizons';
    const wasHidden = views.home.hidden; show('home');
    if (wasHidden) { layoutWall(); requestAnimationFrame(drawWall); renderStory(); }
    if (h) { const el = document.getElementById(h); if (el) requestAnimationFrame(() => el.scrollIntoView({ block: 'start' })); }
  }
  addEventListener('hashchange', route);
  addEventListener('keydown', (e) => {
    const m = location.hash.match(/^#piece-(\d+)$/); if (!m || e.target.closest('input,select,textarea')) return;
    const i = P.indexOf(BYN.get(+m[1]));
    if (e.key === 'ArrowLeft' && P[i - 1]) location.hash = 'piece-' + P[i - 1].n;
    if (e.key === 'ArrowRight' && P[i + 1]) location.hash = 'piece-' + P[i + 1].n;
    if (e.key === 'Escape') location.hash = 'gallery';
  });

  load().then(() => {
    $('bandCount').textContent = P.length;
    $('wallCanvas').setAttribute('aria-label', `All ${P.length} pieces of Slow Horizons, in mint order`);
    const first = Math.min(...P.map((p) => p.drawStart)), last = Math.max(...P.map((p) => p.drawEnd));
    $('bandSub').innerHTML = `Slow Horizons, ${esc(day(first).split(' ')[0])} to ${esc(day(last))} 2026. Open any piece in <a href="#gallery">the collection</a>, or <a href="#collector">find yours</a>.`;
    $('frozen').textContent = `Gallery data frozen ${new Date(DATA.meta.frozenAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}.`;
    initWall(); buildTools(); renderGrid(); renderOnes(); renderStory(); initFilm(); initCollector(); route();
    lab();
  }).catch((e) => { console.error(e); toast('The gallery could not load. Reload the page.'); });
})();

// Seed Lab mint page: live studio feed (WebSocket), queue, finished wall, wallet commission, replays.
(() => {
  const $ = (id) => document.getElementById(id);
  const metaApi = document.querySelector('meta[name="seedlab-api"]')?.content || '';
  const sameOrigin = location.protocol.startsWith('http') && !location.hostname.endsWith('github.io');
  const API = sameOrigin && !location.port.match(/^(5500|5173)$/) ? location.origin : metaApi;
  const WS = API.replace(/^http/, 'ws') + '/live';
  const FPS = 4194304 / 70224;
  const LCD = ['#d5d8cb', '#9aa08e', '#5a5f51', '#1f221c'];
  const PHASE = { 1: 'Sky', 2: 'Light', 3: 'Clouds', 4: 'Ridge', 5: 'Ground', 6: 'Water', 7: 'Weather', 8: 'Done' };
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  let snap = null, palettes = {}, wallet = null, provider = null, busy = false, replaying = null;
  let live = { n: null, piece: null, phases: [], startedAt: 0, tiles: null };

  // ------------------------------------------------------------ helpers
  const pad = (n) => String(n);
  const sol = (lamports) => (lamports / 1e9).toLocaleString('en-US', { maximumFractionDigits: 4 }) + ' SOL';
  const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  const clock = (ms) => new Date(ms).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function toast(msg, ms = 4200) { const t = $('toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast.h); toast.h = setTimeout(() => { t.hidden = true; }, ms); }
  async function api(path, body) {
    const r = await fetch(API + path, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {});
    const j = await r.json().catch(() => ({}));
    if (!r.ok && r.status !== 202) throw new Error(j.error || `The server answered ${r.status}.`);
    return j;
  }

  // ------------------------------------------------------------ screen
  const cv = $('screen'), ctx = cv.getContext('2d');
  function decode(b64) {
    const bin = atob(b64), px = new Uint8Array(160 * 144);
    for (let n = 0; n < 360; n++) {
      const tx = n % 20, ty = (n / 20) | 0;
      for (let r = 0; r < 8; r++) {
        const lo = bin.charCodeAt(n * 16 + r * 2), hi = bin.charCodeAt(n * 16 + r * 2 + 1);
        for (let c = 0; c < 8; c++) px[(ty * 8 + r) * 160 + tx * 8 + c] = ((lo >> (7 - c)) & 1) | (((hi >> (7 - c)) & 1) << 1);
      }
    }
    return px;
  }
  const rgb = (h) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  function paint(px, colors, rows = 144) {
    const img = ctx.getImageData(0, 0, 160, 144), pal = colors.map(rgb);
    for (let i = 0; i < 160 * rows; i++) { const c = pal[px[i]]; img.data[i * 4] = c[0]; img.data[i * 4 + 1] = c[1]; img.data[i * 4 + 2] = c[2]; img.data[i * 4 + 3] = 255; }
    ctx.putImageData(img, 0, 0);
  }
  let wipe = null;
  // a phase lands: the Game Boy uploads its screen one tile row at a time, so we show it the same way
  function showTiles(b64, colors = LCD) {
    const px = decode(b64);
    cancelAnimationFrame(wipe);
    if (reduced) return paint(px, colors);
    let row = 0;
    const step = () => { row = Math.min(144, row + 8); paint(px, colors, row); if (row < 144) wipe = requestAnimationFrame(step); };
    step();
  }
  // the piece is finished: its palette is applied, the second and last motion on the page
  function applyPalette(b64, colors) {
    const px = decode(b64), from = LCD.map(rgb), to = colors.map(rgb);
    if (reduced) return paint(px, colors);
    const t0 = performance.now(), dur = 1400;
    const step = (now) => {
      const k = Math.min(1, (now - t0) / dur), e = k * k * (3 - 2 * k);
      const mix = from.map((f, i) => '#' + f.map((v, j) => Math.round(v + (to[i][j] - v) * e).toString(16).padStart(2, '0')).join(''));
      paint(px, mix);
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
  function blank() { ctx.fillStyle = LCD[0]; ctx.fillRect(0, 0, 160, 144); }
  blank();

  // ------------------------------------------------------------ studio state
  function phaseList(piece) {
    if (!piece) return [];
    const t = piece.traits, wet = ['lake', 'sea', 'oasis'].includes(t.ground);
    const list = [[1, 'Sky'], [2, 'Light'], [3, 'Clouds'], [4, `Ridges ${t.ridges}`], [5, 'Ground']];
    if (wet) list.push([6, 'Water']);
    list.push([7, 'Weather'], [8, 'Done']);
    return list;
  }
  function renderPhases() {
    const list = phaseList(live.piece), ul = $('phases');
    if (!list.length) { ul.innerHTML = ''; return; }
    const got = live.phases.map(p => p.phase), last = got.length ? got[got.length - 1] : 0;
    const ridges = live.piece.traits.ridges, ridgesDone = got.filter(x => x === 4).length;
    const isDone = (id) => id < last || (id === last && (id !== 4 || ridgesDone >= ridges));
    let nowSet = false;
    ul.innerHTML = list.map(([id, name]) => {
      const done = isDone(id), now = !done && !nowSet && live.n; if (now) nowSet = true;
      const text = id === 4 ? `Ridges ${ridgesDone}/${ridges}` : name;
      return `<li ${done ? 'data-done' : ''} ${now ? 'data-now' : ''}><span>${esc(text)}</span></li>`;
    }).join('');
  }
  function renderLabel(p) {
    $('lNo').textContent = p ? `No. ${p.n}` : 'Seed Lab';
    if (!p) { $('lList').innerHTML = '<dt>Now</dt><dd>Nothing on the easel. The next commission starts as soon as it is paid.</dd>'; return; }
    const t = p.traits, pal = palettes[t.palette];
    const sw = pal ? `<span class="swatch">${pal.map(c => `<i style="background:${c}"></i>`).join('')}</span>` : '';
    const drawnBy = p.drawStart ? 'Game Boy (DMG), over the link cable' : 'Waiting for its turn';
    const rows = [
      ['Seed', `<span class="mono">${p.seedHex}</span>`],
      ['Drawn by', esc(drawnBy)],
      ['Collector', `<span class="mono">${esc(p.short)}</span>`],
      ['Scene', esc(`${cap(t.time)}, ${t.sky}, ${t.terrain}, ${t.ground}`)],
      ['Weather', esc(cap(t.weather))],
      ['Palette', `${sw}${esc(t.palette)}${p.drawEnd ? '' : ' <span class="later">· applied when finished</span>'}`],
    ];
    if (t.extras.length) rows.push(['Also', esc(t.extras.join(', '))]);
    rows.push(['Medium', '4 shades, 160 × 144']);
    $('lList').innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
  }
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

  function renderStatus() {
    const lamp = document.querySelector('#status .lamp'), txt = $('statusText');
    if (!snap) { lamp.dataset.state = 'off'; txt.textContent = 'The studio is offline right now.'; return; }
    const lane = snap.lane;
    const where = 'the Game Boy';
    if (!lane.ready) { lamp.dataset.state = 'bad'; txt.textContent = 'Studio closed: the Game Boy is not connected'; }
    else if (live.n) { lamp.dataset.state = 'live'; const ph = live.phases.length ? live.phases[live.phases.length - 1].phase : 0; txt.textContent = `Drawing No. ${live.n} on ${where}${ph ? `, ${PHASE[ph].toLowerCase()} done` : ''}`; }
    else { lamp.dataset.state = 'idle'; txt.textContent = `Studio open, ${where} is waiting for a commission`; }
  }
  function renderStudioFoot() {
    if (replaying) return;
    const f = $('studioFoot');
    if (!snap) { f.textContent = 'No connection to the studio. Retrying.'; return; }
    if (!live.n) { f.textContent = snap.lane.ready ? 'Idle. The Game Boy is on and waiting.' : 'The Game Boy is not connected. Paid pieces wait in line until it is back.'; $('screenStamp').textContent = snap.lane.ready ? 'IDLE' : 'OFFLINE'; return; }
    const el = (Date.now() - live.startedAt) / 1000;
    const exp = live.piece?.frames ? live.piece.frames / FPS : snap.secondsPerPiece;
    f.textContent = `No. ${live.n} · ${mmss(el)} elapsed · about ${mmss(Math.max(0, exp - el))} to go · ${live.phases.length} screen updates received`;
    $('screenStamp').textContent = `LIVE · ${live.piece.seedHex}`;
  }
  setInterval(renderStudioFoot, 1000);

  function renderQueue() {
    const q = (snap?.queue || []);
    $('queueEmpty').hidden = q.length > 0;
    let at = 0;
    const per = snap?.secondsPerPiece || 420;
    $('queue').innerHTML = q.map((p) => {
      const drawing = p.status === 'drawing';
      const starts = drawing ? 'now' : `in ~${Math.max(1, Math.round(at / 60))} min`;
      at += drawing ? Math.max(0, per - (Date.now() - (p.drawStart || Date.now())) / 1000) : per;
      const me = wallet && p.wallet === wallet;
      return `<tr class="${me ? 'me' : ''}"><td class="no">${p.n}</td><td class="who">${esc(p.short)}${me ? ' (you)' : ''}</td>
        <td><span class="st"><span class="lamp" data-state="${drawing ? 'live' : 'idle'}"></span>${drawing ? 'Drawing' : 'Waiting'}</span></td><td class="r">${starts}</td></tr>`;
    }).join('');
  }
  function pieceCard(p) {
    const t = p.traits, secs = p.frames ? p.frames / FPS : 0;
    return `<figure class="piece">
      <img src="${esc(API + '/pieces/' + p.n + '.png')}" alt="No. ${p.n}: ${esc(t.time)} ${esc(t.terrain)}, ${esc(t.palette)} palette" loading="lazy" width="960" height="864">
      <figcaption class="cap"><b>No. ${p.n}</b><span class="d">${mmss(secs)}</span>
        <span class="t">${esc(cap(t.time))}, ${esc(t.terrain)}. ${esc(t.palette)}.</span>
</figcaption>
      <div class="acts"><button type="button" data-replay="${p.n}">Replay the draw</button>${p.mint?.assetId ? `<a href="https://explorer.solana.com/address/${p.mint.assetId}?cluster=${snap.network}" target="_blank" rel="noopener">On chain</a>` : ''}</div>
    </figure>`;
  }
  let wallKey = '';
  function renderWall() {
    const list = snap?.recent || [];
    const key = list.map(p => `${p.n}:${p.status}:${p.mint?.assetId || ''}`).join(',');
    if (key === wallKey) return;   // rebuilding the wall reloads every image; only do it when the list changed
    wallKey = key;
    $('wallEmpty').hidden = list.length > 0;
    $('wall').innerHTML = list.map(pieceCard).join('');
  }
  function renderPrice() {
    if (!snap) { $('price').textContent = ''; $('wait').textContent = ''; return; }
    $('price').textContent = sol(snap.priceLamports);
    const ahead = snap.queue.length, mins = Math.round((ahead * snap.secondsPerPiece) / 60);
    $('wait').textContent = ahead ? `${ahead} ahead · ${mins < 1 ? 'under a minute' : `about ${mins} min`}` : 'No wait';
    $('testnet').hidden = snap.network !== 'devnet';
    $('romHash').textContent = snap.romSha256;
  }
  function renderBuy() {
    const b = $('buyBtn');
    if (busy) return;
    if (!snap) { b.disabled = true; b.textContent = 'Studio offline'; return; }
    if (!snap.lane.ready) { b.disabled = true; b.textContent = 'Closed while the Game Boy is offline'; return; }
    if (!wallet) { b.disabled = false; b.textContent = 'Connect wallet to commission'; return; }
    b.disabled = false; b.textContent = `Commission a piece for ${sol(snap.priceLamports)}`;
  }
  function renderAll() { renderStatus(); renderLabel(live.piece || snap?.queue?.[0] || null); renderPhases(); renderQueue(); renderWall(); renderPrice(); renderBuy(); renderStudioFoot(); }

  // ------------------------------------------------------------ live feed
  let ws, retry = 1000;
  function connect() {
    try { ws = new WebSocket(WS); } catch { return setTimeout(connect, retry); }
    ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.type === 'snapshot') {
        snap = m;
        if (m.live) { live = { n: m.live.n, piece: m.live.piece, phases: (m.live.phases || []).map(ph => ({ phase: ph })), startedAt: m.live.piece.drawStart, tiles: m.live.tiles }; if (m.live.tiles && !replaying) showTiles(m.live.tiles); }
        else live = { n: null, piece: null, phases: [], startedAt: 0, tiles: null };
        renderAll(); refreshMine();
      } else if (m.type === 'drawing') {
        live = { n: m.piece.n, piece: m.piece, phases: [], startedAt: m.piece.drawStart, tiles: null };
        if (!replaying) blank();
        bump(m.piece); renderAll();
      } else if (m.type === 'phase') {
        if (live.n !== m.n) return;
        live.phases.push({ phase: m.phase, t: m.t }); live.tiles = m.tiles;
        if (!replaying) showTiles(m.tiles);
        renderStatus(); renderPhases(); renderStudioFoot();
      } else if (m.type === 'drawn') {
        if (live.n === m.piece.n && live.tiles && !replaying) applyPalette(live.tiles, palettes[m.piece.traits.palette] || LCD);
        bump(m.piece);
        if (wallet && m.piece.wallet === wallet) toast(`Your No. ${m.piece.n} is finished. Minting it to your wallet now.`);
        setTimeout(() => { if (live.n === m.piece.n) { live = { n: null, piece: null, phases: [], startedAt: 0, tiles: null }; renderAll(); } }, 9000);
        renderAll(); refreshMine();
      } else if (m.type === 'queued' || m.type === 'status') { bump(m.piece); renderAll(); if (wallet && m.piece.wallet === wallet) refreshMine(); }
      else if (m.type === 'lane') { snap.lane = m.lane; renderAll(); }
    };
    ws.onopen = () => { retry = 1000; };
    ws.onclose = () => { snap = null; renderAll(); setTimeout(connect, retry); retry = Math.min(15000, retry * 2); };
  }
  // keep the snapshot's lists current from single-piece events
  function bump(p) {
    if (!snap) return;
    const inQ = p.status === 'queued' || p.status === 'drawing';
    snap.queue = snap.queue.filter(x => x.n !== p.n); if (inQ) { snap.queue.push(p); snap.queue.sort((a, b) => a.n - b.n); }
    if (p.drawEnd) { snap.recent = [p, ...snap.recent.filter(x => x.n !== p.n)].slice(0, 24); }
  }

  // ------------------------------------------------------------ replay (the tiles the drawing machine sent, re-timed)
  async function replay(n) {
    const r = await fetch(`${API}/pieces/${n}.replay.json`).then(r => r.json()).catch(() => null);
    if (!r?.phases?.length) return toast('No replay stored for this piece.');
    const p = (snap.recent.find(x => x.n === n)) || null;
    replaying = n;
    document.getElementById('studio').scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
    $('screenStamp').textContent = `REPLAY · NO. ${n}`;
    $('studioFoot').textContent = `Replay of No. ${n}: the ${r.phases.length} screen updates the Game Boy sent, sped up.`;
    blank();
    const total = r.phases[r.phases.length - 1].t || 1;
    for (const ph of r.phases) {
      if (replaying !== n) return;
      await new Promise(res => setTimeout(res, Math.max(250, (ph.t / total) * 9000 - (r.phases[r.phases.indexOf(ph) - 1]?.t / total * 9000 || 0))));
      showTiles(ph.tiles);
    }
    await new Promise(res => setTimeout(res, 700));
    if (replaying === n && p) applyPalette(r.phases[r.phases.length - 1].tiles, palettes[p.traits.palette] || LCD);
    setTimeout(() => { if (replaying === n) { replaying = null; if (live.tiles) showTiles(live.tiles); else blank(); renderAll(); } }, 6000);
  }
  document.addEventListener('click', (e) => { const b = e.target.closest('[data-replay]'); if (b) replay(+b.dataset.replay); });

  // ------------------------------------------------------------ wallet + commission
  function findProvider() {
    return window.phantom?.solana || window.solflare || window.backpack?.solana || window.backpack || (window.solana?.isPhantom ? window.solana : window.solana) || null;
  }
  async function connectWallet() {
    provider = findProvider();
    if (!provider) { toast('No Solana wallet found in this browser. Phantom, Solflare and Backpack work.', 6000); return false; }
    $('walletBtn').textContent = 'Connecting…';
    try {
      const r = await provider.connect();
      wallet = (r?.publicKey || provider.publicKey).toString();
      $('walletBtn').textContent = wallet.slice(0, 4) + '…' + wallet.slice(-4);
      renderAll(); refreshMine();
      return true;
    } catch { $('walletBtn').textContent = 'Connect wallet'; toast('The wallet did not connect.'); return false; }
  }
  $('walletBtn').onclick = () => { if (!wallet) connectWallet(); else document.getElementById('mineBlock').scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' }); };

  async function commission() {
    if (!wallet && !(await connectWallet())) return;
    const b = $('buyBtn');
    busy = true; b.disabled = true;
    try {
      b.textContent = 'Preparing the payment…';
      const t = await api('/api/ticket', { wallet });
      const tx = solanaWeb3.Transaction.from(Uint8Array.from(atob(t.tx), c => c.charCodeAt(0)));
      b.textContent = 'Approve it in your wallet…';
      const signed = await provider.signTransaction(tx);
      b.textContent = 'Sending…';
      const raw = btoa(String.fromCharCode(...signed.serialize()));
      const r = await api('/api/submit', { ticket: t.ticket, tx: raw });
      if (r.n || r.already) {
        const n = r.n || r.already;
        b.textContent = `Paid. You are No. ${n}.`;
        $('buyNote').textContent = `Your piece is No. ${n}. You can close this page now; it will be drawn in order and sent to your wallet. Come back with the same wallet to see when it was drawn and replay it.`;
        toast(`Paid. No. ${n} is in line.`, 6000);
      } else {
        b.textContent = 'Sent, waiting for the network…';
        $('buyNote').textContent = 'Your payment was sent. It joins the line automatically once the network confirms it, even if you close this page.';
      }
      refreshMine();
    } catch (e) {
      const msg = /reject|cancel|declin/i.test(e.message || '') ? 'You cancelled in the wallet. Nothing was paid.' : (e.message || 'Something went wrong. Nothing was paid.');
      toast(msg, 6000);
    } finally {
      setTimeout(() => { busy = false; renderBuy(); }, 4000);
    }
  }
  $('buyBtn').onclick = commission;

  async function refreshMine() {
    if (!wallet || !API) return;
    let list = [];
    try { list = (await api('/api/pieces?owner=' + encodeURIComponent(wallet))).pieces || []; } catch { return; }
    $('mineBlock').hidden = list.length === 0;
    $('mine').innerHTML = list.slice().reverse().map(p => {
      const when = p.drawStart ? `Drawn ${clock(p.drawStart)}${p.frames ? `, took ${mmss(p.frames / FPS)}` : ''}` : `Paid ${clock(p.paidAt)}, waiting to be drawn`;
      const status = { queued: 'In line', drawing: 'Being drawn now', drawn: 'Drawn, minting', minting: 'Minting', minted: 'In your wallet', failed: 'Problem: we will refund it', 'mint-failed': 'Drawn; mint will be retried' }[p.status] || p.status;
      return `<div class="mine-row">${p.image ? `<img src="${esc(p.image)}" alt="No. ${p.n}">` : '<span class="ph"></span>'}
        <div><p><b>No. ${p.n}</b> · ${esc(status)}</p><p class="when">${esc(when)} · seed ${p.seedHex}</p></div>
        <div class="acts">${p.drawEnd ? `<button type="button" data-replay="${p.n}">Replay</button>` : ''}${p.stream ? `<a href="${esc(p.stream)}" target="_blank" rel="noopener">Watch the recording</a>` : ''}</div></div>`;
    }).join('');
  }

  // channels
  function setChannel(cam) {
    $('chDigital').setAttribute('aria-selected', String(!cam)); $('chCamera').setAttribute('aria-selected', String(cam));
    $('camera').hidden = !cam;
  }
  $('chDigital').onclick = () => setChannel(false);
  $('chCamera').onclick = () => setChannel(true);

  // palettes come from the same WASM build the page uses to redraw seeds
  SeedLab.load('gen.wasm').then((lab) => { for (const p of lab.palettes) palettes[p.name] = p.colors; renderAll(); }).catch(() => {});
  renderAll();
  if (API) connect(); else { renderAll(); }
})();

// Slow Horizons mint page: live studio feed (WebSocket), queue, finished wall, wallet commission, replays.
(() => {
  const $ = (id) => document.getElementById(id);
  const metaApi = document.querySelector('meta[name="seedlab-api"]')?.content || '';
  const TREASURY = document.querySelector('meta[name="seedlab-treasury"]')?.content || '';
  const PRICE = +(document.querySelector('meta[name="seedlab-price-lamports"]')?.content || 0);
  // the seedlab-api meta names the server (https://api.gameboylabs.xyz in production); only a page opened from the
  // server itself on this machine (local development, SERVE_SITE=1) talks to its own origin
  const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) && !location.port.match(/^(5500|5173)$/);
  const API = local || !metaApi ? location.origin : metaApi.replace(/\/$/, '');
  const WS = API.replace(/^http/, 'ws') + '/live';
  const FPS = 4194304 / 70224;
  const LCD = ['#d5d8cb', '#9aa08e', '#5a5f51', '#1f221c'];
  const PHASE = { 1: 'Sky', 2: 'Light', 3: 'Clouds', 4: 'Ridge', 5: 'Ground', 6: 'Water', 7: 'Weather', 8: 'Done' };
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  let shownIdle = null;
  let snap = null, palettes = {}, wallet = (/^(localhost|127\.0\.0\.1)$/.test(location.hostname) && new URLSearchParams(location.search).get('as')) || null, provider = null, busy = false, replaying = null, payLock = null;
  let live = { n: null, piece: null, phases: [], startedAt: 0, tiles: null, hb: [] };
  let lastHb = null;
  const ppm = (v) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(2)} ppm`;

  // ------------------------------------------------------------ helpers
  const pad = (n) => String(n);
  const sol = (lamports) => (lamports / 1e9).toLocaleString('en-US', { maximumFractionDigits: 4 }) + ' SOL';
  const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  const clock = (ms) => new Date(ms).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // Everything the server sends is checked on arrival (security audit M1): numbers are numbers, keys and signatures
  // are base58, hex is hex, the network is one of two names. A field that fails becomes null, so nothing unexpected
  // can reach the HTML even if the server or the tunnel were compromised.
  const B58 = /^[1-9A-HJ-NP-Za-km-z]{32,90}$/;
  const SAN = {
    n: (v) => Number.isInteger(+v) && +v >= 0 ? +v : null, seq: (v) => Number.isInteger(+v) ? +v : null, sold: (v) => +v || 0, maxSupply: (v) => +v || 0,
    seedHex: (v) => /^[0-9a-f]{8}$/.test(v) ? v : null, seed: (v) => Number.isFinite(+v) ? +v : null, romSha256: (v) => /^[0-9a-f]{64}$/.test(v) ? v : null,
    wallet: (v) => B58.test(v) ? v : null, signature: (v) => B58.test(v) ? v : null, assetId: (v) => B58.test(v) ? v : null, treasury: (v) => B58.test(v) ? v : null, collection: (v) => v == null || B58.test(v) ? v : null,
    network: (v) => v === 'devnet' ? 'devnet' : 'mainnet-beta',
    image: (v) => typeof v === 'string' && /^(https:\/\/|\/)[^"'<>\s]*$/.test(v) ? v : null, hires: (v) => typeof v === 'string' && /^(https:\/\/|\/)[^"'<>\s]*$/.test(v) ? v : null,
    // allowlist offers: ids, opaque unit refs, prices; names are display text (escaped or textContent anyway)
    list: (v) => typeof v === 'string' && /^[a-z0-9][a-z0-9-]{0,31}$/.test(v) ? v : null, unit: (v) => typeof v === 'string' && /^[0-9a-f]{24}$/.test(v) ? v : null,
    price: (v) => Number.isSafeInteger(+v) && +v >= 0 ? +v : null, priceLamports: (v) => Number.isSafeInteger(+v) && +v > 0 ? +v : null,
    special: (v) => Number.isInteger(+v) && +v >= 0 && +v <= 10 ? +v : 0, title: (v) => typeof v === 'string' ? v.replace(/[<>&"'`\u0000-\u001f]/g, '').slice(0, 60) : null,
    roll: (v) => Number.isSafeInteger(+v) && +v >= 0 ? +v : 0, roll2: (v) => Number.isSafeInteger(+v) && +v >= 0 ? +v : 0,
    left_1of1: (v) => Number.isInteger(+v) && +v >= 0 ? +v : 0, left_mints: (v) => Number.isInteger(+v) && +v >= 0 ? +v : 0,
    remaining: (v) => Number.isInteger(+v) && +v >= 0 ? +v : 0, ethLists: (v) => Number.isInteger(+v) && +v >= 0 ? +v : 0, linked: (v) => v === true, open: (v) => v === true, limit: (v) => Number.isInteger(+v) && +v > 0 ? +v : null, ethLinked: (v) => Number.isInteger(+v) ? +v : 0,
    name: (v) => typeof v === 'string' ? v.replace(/[<>&"'`\u0000-\u001f]/g, '').slice(0, 60) : null, nonce: (v) => typeof v === 'string' && /^[0-9a-f]{32}$/.test(v) ? v : null,
    message: (v) => typeof v === 'string' && v.length < 1200 ? v : null, per: (v) => v === 'nft' ? 'nft' : 'wallet', claim: (v) => v === true,
    arweave: (v) => typeof v === 'string' && /^https:\/\/arweave\.net\/[A-Za-z0-9_-]+$/.test(v) ? v : null, stream: (v) => typeof v === 'string' && /^https:\/\/[^"'<>\s]*$/.test(v) ? v : null,
    seedBlock: (v) => Number.isSafeInteger(+v) && +v >= 0 ? +v : null, frames: (v) => Number.isSafeInteger(+v) && +v >= 0 ? +v : null,
    intervals: (v) => Number.isSafeInteger(+v) && +v >= 0 ? +v : 0, reports: (v) => Number.isSafeInteger(+v) && +v >= 0 ? +v : 0,
  };
  function clean(o, depth = 0) {
    if (Array.isArray(o)) return o.map((x) => clean(x, depth + 1));
    if (!o || typeof o !== 'object' || depth > 6) return o;
    for (const k of Object.keys(o)) o[k] = SAN[k] && o[k] != null ? SAN[k](o[k]) : clean(o[k], depth + 1);
    return o;
  }
  function toast(msg, ms = 4200) { const t = $('toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast.h); toast.h = setTimeout(() => { t.hidden = true; }, ms); }
  async function api(path, body) {
    const r = await fetch(API + path, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {});
    const j = clean(await r.json().catch(() => ({})));
    if (!r.ok && r.status !== 202) throw new Error(j.error || `The server answered ${r.status}.`);
    return j;
  }

  // what this visit did, for the admin page: visits and wallet connects (an anonymous id in localStorage, no IP kept)
  const VID = (() => { try { let v = localStorage.getItem('sh-vid'); if (!/^[0-9a-f]{32}$/.test(v || '')) { v = Array.from(crypto.getRandomValues(new Uint8Array(16)), x => x.toString(16).padStart(2, '0')).join(''); localStorage.setItem('sh-vid', v); } return v; } catch { return null; } })();
  const DEVICE = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) ? 'mobile' : 'desktop';
  function track(kind, data = {}) {
    try { fetch(API + '/api/track', { method: 'POST', keepalive: true, headers: { 'content-type': 'text/plain' }, body: JSON.stringify({ kind, vid: VID, device: DEVICE, ...data }) }).catch(() => {}); } catch { /* never in the way */ }
  }
  { let ref = null; try { const r = document.referrer && new URL(document.referrer); if (r && r.host !== location.host) ref = r.host; } catch { /* none */ } track('view', { ref }); }

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
    $('lNo').textContent = p ? (p.special ? `No. ${p.n} · 1/1` : `No. ${p.n}`) : 'Slow Horizons';
    if (!p) { $('lList').innerHTML = '<dt>Now</dt><dd>Nothing on the easel. The next commission starts as soon as it is paid.</dd>'; return; }
    if (!p.traits) { $('lList').innerHTML = `<dt>Now</dt><dd>No. ${esc(p.n)} is paid and waiting for its seed.</dd>`; return; }
    const t = p.traits, pal = palettes[t.palette];
    const sw = pal ? `<span class="swatch">${pal.map(c => `<i style="background:${c}"></i>`).join('')}</span>` : '';
    const drawnBy = p.drawStart ? 'Game Boy (DMG), over the link cable' : 'Waiting for its turn';
    const rows = [
      ...(p.special ? [['1/1', `<b>${esc(p.title)}</b>, one of ten`]] : []),
      ['Seed', `<span class="mono">${p.seedHex}</span>`],
      ['Drawn by', esc(drawnBy)],
      ['Collector', `<span class="mono">${esc(p.short)}</span>`],
      ['Scene', esc(`${cap(t.time)}, ${t.sky}, ${t.terrain}, ${t.ground}`)],
      ['Weather', esc(cap(t.weather))],
      ['Palette', `${sw}${esc(t.palette)}${p.drawEnd ? '' : ' <span class="later">· applied when finished</span>'}`],
    ];
    if (t.extras.length) rows.push(['Also', esc(t.extras.join(', '))]);
    const hb = p.heartbeat || (p.n === live.n ? liveHb() : null);
    if (hb) rows.push(['Heartbeat', `<span class="mono">${ppm(hb.ppm)}</span>${p.heartbeat ? '' : ' <span class="later">· measuring</span>'}`]);
    rows.push(['Medium', '4 shades, 160 × 144']);
    $('lList').innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
  }
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

  // weighted average of the reports during the current draw, like the server's per-piece number
  function liveHb() {
    const n = live.hb.reduce((a, h) => a + h.samples, 0);
    return n ? { ppm: live.hb.reduce((a, h) => a + h.ppm * h.samples, 0) / n, reports: live.hb.length } : null;
  }
  const ago = (s) => s < 60 ? `${Math.round(s)} s` : s < 3600 ? `${Math.floor(s / 60)} min` : s < 86400 ? `${Math.floor(s / 3600)} h` : `${Math.floor(s / 86400)} d`;
  function renderHeartbeat() {
    const v = $('hbVal'), note = $('hbNote');
    if (!lastHb) { v.textContent = snap?.lane?.ready ? 'waiting for link traffic' : 'no Game Boy connected'; note.textContent = ''; return; }
    const age = (Date.now() - lastHb.at) / 1000, cur = liveHb();
    v.textContent = ppm(lastHb.ppm);
    note.textContent = cur && live.n ? `No. ${live.n} so far: ${ppm(cur.ppm)} over ${cur.reports} readings` : age < 15 ? 'from the Game Boy\'s crystal, measured live' : `last reading ${ago(age)} ago`;
  }
  function beat() {
    const l = $('hbLamp'); l.dataset.state = 'beat';
    setTimeout(() => { l.dataset.state = 'off'; }, reduced ? 0 : 180);
  }
  setInterval(renderHeartbeat, 1000);
  function renderStatus() {
    const lamp = document.querySelector('#status .lamp'), txt = $('statusText');
    if (!snap) { lamp.dataset.state = 'off'; txt.textContent = 'The studio is offline right now.'; return; }
    const lane = snap.lane;
    const where = 'the Game Boy';
    if (!lane.ready) { lamp.dataset.state = 'bad'; txt.textContent = 'Studio closed: the Game Boy is not connected'; }
    else if (live.n) { lamp.dataset.state = 'live'; const ph = live.phases.length ? live.phases[live.phases.length - 1].phase : 0; txt.textContent = `Drawing No. ${live.n} on ${where}${ph ? `, ${PHASE[ph].toLowerCase()} done` : ''}`; }
    else if (snap.mintClosedReason === 'closed' || snap.mintClosedReason === 'sold out') { lamp.dataset.state = 'idle'; txt.textContent = `The Game Boy is on; commissions are closed right now`; }
    else { lamp.dataset.state = 'idle'; txt.textContent = `Studio open, ${where} is waiting for a commission`; }
  }
  function renderStudioFoot() {
    if (replaying) return;
    const f = $('studioFoot');
    if (!snap) { f.textContent = 'No connection to the studio. Retrying.'; return; }
    if (!live.n && !replaying && snap.recent?.length && labRef && shownIdle !== snap.recent[0].n) { shownIdle = snap.recent[0].n; const art = labArt(snap.recent[0]); paint(art.px, art.colors); }
    if (!live.n) { f.textContent = snap.lane.ready ? 'Idle. The Game Boy is on and waiting.' : 'The Game Boy is not connected. Paid pieces wait in line until it is back.'; $('screenStamp').textContent = snap.recent?.length ? `LAST · NO. ${snap.recent[0].n}` : (snap.lane.ready ? 'IDLE' : 'OFFLINE'); return; }
    const el = (Date.now() - live.startedAt) / 1000;
    const exp = live.piece?.frames ? live.piece.frames / FPS : snap.secondsPerPiece;
    f.textContent = `No. ${live.n} · ${mmss(el)} elapsed · about ${mmss(Math.max(0, exp - el))} to go · ${live.phases.length} screen updates received`;
    $('screenStamp').textContent = `LIVE · ${live.piece.seedHex}`;
  }
  setInterval(renderStudioFoot, 1000);

  // the line: pages of 10, a search box for a wallet (or part of one) or a number, the collector's own row marked
  const PER = 10;
  let qPage = 0, qQuery = '';
  const eta = new Map();   // piece number -> start estimate, shared by the table and the collector's card
  function renderQueue() {
    const q = (snap?.queue || []);
    $('queueEmpty').hidden = q.length > 0;
    const per = snap?.secondsPerPiece || 420;
    const fmt = (min) => min < 90 ? `in ~${min} min` : `in ~${(min / 60).toFixed(min < 600 ? 1 : 0)} h`;
    // start estimates in drawing order: the piece on the easel, then everything with a seed, by number
    let at = 0; eta.clear();
    for (const p of [...q].sort((a, b) => (b.status === 'drawing') - (a.status === 'drawing') || a.n - b.n)) {
      if (p.status === 'seeding') continue;
      eta.set(p.n, p.status === 'drawing' ? 'now' : fmt(Math.max(1, Math.round(at / 60))));
      at += p.status === 'drawing' ? Math.max(0, per - (Date.now() - (p.drawStart || Date.now())) / 1000) : per;
    }
    const term = qQuery.trim().toLowerCase().replace(/^no\.?\s*/, '');
    const list = term ? q.filter(p => String(p.n) === term || p.wallet.toLowerCase().includes(term)) : q;
    const pages = Math.max(1, Math.ceil(list.length / PER));
    qPage = Math.min(qPage, pages - 1);
    const mine = wallet ? q.find(p => p.wallet === wallet) : null;
    $('qCount').textContent = q.length ? (term ? `${list.length} match${list.length === 1 ? '' : 'es'}` : `${q.length} in line`) + (mine ? ` · you are No. ${mine.n}, ${q.filter(p => p.n < mine.n).length} ahead` : '') : '';
    $('queue').innerHTML = list.slice(qPage * PER, qPage * PER + PER).map((p) => {
      const drawing = p.status === 'drawing', seeding = p.status === 'seeding';
      const me = wallet && p.wallet === wallet;
      const st = drawing ? 'Drawing' : seeding ? 'Getting its seed' : 'Waiting';
      return `<tr class="${me ? 'me' : ''}"><td class="no">${p.n}</td><td class="who">${esc(p.short)}${me ? ' (you)' : ''}</td>
        <td><span class="st"><span class="lamp" data-state="${drawing ? 'live' : 'idle'}"></span>${st}</span></td><td class="r">${eta.get(p.n) || 'soon'}</td></tr>`;
    }).join('') + (term && !list.length ? `<tr class="more"><td colspan="4">Nothing in line matches “${esc(qQuery.trim())}”.</td></tr>` : '');
    $('qPages').hidden = pages < 2;
    $('qPage').textContent = `${qPage + 1} / ${pages}`;
    $('qPrev').disabled = qPage === 0; $('qNext').disabled = qPage >= pages - 1;
    renderMyPlace();
  }
  // the collector's own place, as soon as their piece is in line: number, how many ahead, when it starts
  function renderMyPlace() {
    const q = snap?.queue || [];
    const mine = wallet ? q.filter(p => p.wallet === wallet).sort((a, b) => a.n - b.n) : [];
    $('myPlace').hidden = !mine.length;
    if (!mine.length) return;
    const p = mine[0];
    const ahead = q.filter(x => x.n < p.n && x.status !== 'drawing').length + (q.some(x => x.status === 'drawing' && x.n !== p.n) ? 1 : 0);
    $('mpNo').textContent = `No. ${p.n}`;
    $('mpLine').textContent = p.status === 'drawing' ? 'Drawing now. Watch it on the screen above.'
      : p.status === 'seeding' ? 'Paid. Your seed arrives with the next Solana blocks (about 13 s).'
      : `${ahead} ahead of you · starts ${(eta.get(p.n) || 'soon').replace(/^in ~/, 'in about ')}` + (mine.length > 1 ? ` · ${mine.length} pieces in line` : '');
  }
  $('mpShow').addEventListener('click', () => {
    const q = snap?.queue || [], p = q.filter(x => x.wallet === wallet).sort((a, b) => a.n - b.n)[0];
    if (!p) return;
    qQuery = ''; $('qFind').value = ''; qPage = Math.floor(q.indexOf(p) / PER); renderQueue();
    document.querySelector('#queue tr.me')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
  $('qFind').addEventListener('input', (e) => { qQuery = e.target.value; qPage = 0; renderQueue(); });
  $('qPrev').addEventListener('click', () => { qPage--; renderQueue(); });
  $('qNext').addEventListener('click', () => { qPage++; renderQueue(); });
  function pieceCard(p) {
    const t = p.traits, secs = p.frames ? p.frames / FPS : 0;
    return `<figure class="piece">
      <img data-open="${p.n}" src="${esc(API + '/pieces/' + p.n + '.png?s=' + (p.seedHex || ''))}" alt="No. ${p.n}: ${esc(t.time)} ${esc(t.terrain)}, ${esc(t.palette)} palette" loading="lazy" width="960" height="864">
      <figcaption class="cap"><b>No. ${p.n}</b><span class="d">${mmss(secs)}</span>
        <span class="t">${esc(cap(t.time))}, ${esc(t.terrain)}. ${esc(t.palette)}.${p.heartbeat ? ` Heartbeat ${ppm(p.heartbeat.ppm)}.` : ''}</span>
</figcaption>
      <div class="acts"><button type="button" data-replay="${p.n}">Replay the draw</button>${p.mint?.assetId ? `<a href="https://explorer.solana.com/address/${esc(p.mint.assetId)}?cluster=${esc(snap.network)}" target="_blank" rel="noopener">On chain</a>` : ''}</div>
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
    $('meter').hidden = !snap.maxSupply; $('meter').setAttribute('aria-valuemax', snap.maxSupply); $('meter').setAttribute('aria-valuenow', snap.sold); $('meterFill').style.width = (100 * snap.sold / (snap.maxSupply || 1)).toFixed(2) + '%';
    $('wait').textContent = `${snap.sold} of ${snap.maxSupply} taken · ` + (ahead ? `${ahead} ahead, ${mins < 1 ? 'under a minute' : `about ${mins} min`}` : 'no wait');
    $('testnet').hidden = snap.network !== 'devnet';
    $('romHash').textContent = snap.romSha256;
  }
  function renderBuy() {
    const b = $('buyBtn');
    if (busy) return;
    // after paying: locked with a spinner until the piece has its number (or 2 min pass), so nobody pays twice
    if (payLock && Date.now() < payLock.until) { b.disabled = true; b.classList.toggle('loading', !payLock.done); return; }
    payLock = null; b.classList.remove('loading');
    if (!snap) { b.disabled = true; b.textContent = 'Studio offline'; return; }
    if (!snap.mintOpen) {
      $('qtyRow').hidden = true;
      b.disabled = true;
      b.textContent = { 'sold out': 'Sold out', closed: 'Commissions are closed right now', 'Game Boy offline': 'Closed while the Game Boy is offline', 'payment watcher behind': 'Paused for a moment' }[snap.mintClosedReason] || 'Closed right now';
      return;
    }
    const o = wallet ? chosenOffer() : null, n = renderQty(!o);
    if (!wallet) { b.disabled = false; b.textContent = 'Connect wallet to commission'; return; }
    b.disabled = false;
    b.textContent = !o ? (n > 1 ? `Commission ${n} pieces for ${sol(snap.priceLamports * n)}` : `Commission a piece for ${sol(snap.priceLamports)}`) : o.price === 0 ? `Claim a free piece (${o.name})` : `Commission a piece for ${sol(o.price)} (${o.name})`;
  }
  // How many pieces in one payment: public price only (an allowlist offer is one piece), 1 up to what is left.
  // The server re-checks the number against what is left; a payment that arrives after others took the rest gets
  // the pieces still there and the rest back.
  const qtyLeft = () => Math.max(1, (snap?.maxSupply || 1) - (snap?.sold || 0));
  function qtyValue() { const v = Math.floor(+$('qty').value); return Number.isFinite(v) ? Math.min(Math.max(1, v), qtyLeft()) : 1; }
  function renderQty(show) {
    $('qtyRow').hidden = !show;
    const n = show ? qtyValue() : 1, left = qtyLeft();
    $('qty').max = left;
    if (document.activeElement !== $('qty')) $('qty').value = n;
    $('qtyMinus').disabled = n <= 1; $('qtyPlus').disabled = n >= left;
    return n;
  }
  $('qtyMinus').onclick = () => { $('qty').value = qtyValue() - 1; renderBuy(); };
  $('qtyPlus').onclick = () => { $('qty').value = qtyValue() + 1; renderBuy(); };
  $('qty').addEventListener('input', () => renderBuy());
  $('qty').addEventListener('change', () => { $('qty').value = qtyValue(); renderBuy(); });
  // ------------------------------------------------------------ allowlist and holder offers
  // After the Solana wallet connects: which lists it is on (and, after an Ethereum check, which Ethereum NFTs it
  // holds). The collector picks one; the buy button uses it. The server re-checks everything at claim/payment time.
  let offers = [], unavailable = [], chosen = null, ethOn = false;
  const chosenOffer = () => offers.find(o => o.list === chosen && o.remaining > 0) || null;
  async function refreshOffers() {
    if (!wallet || !snap) { offers = []; renderOffers(); return; }
    try { const r = await api('/api/eligibility?wallet=' + encodeURIComponent(wallet)); offers = (r.offers || []).filter(o => o.list && o.price != null); unavailable = r.unavailable || []; ethOn = r.eth === true; }
    catch { offers = []; unavailable = []; }
    if (chosen && !chosenOffer()) chosen = null;
    if (!chosen) { const best = offers.filter(o => o.remaining > 0).sort((a, b) => a.price - b.price)[0]; if (best && best.price < snap.priceLamports) chosen = best.list; }
    renderOffers(); renderBuy();
  }
  function offerLine(o) {
    if (o.remaining <= 0) return `${o.name}: used up`;
    const n = o.remaining;
    return o.price === 0 ? `You can mint ${n} free as ${o.name}` : `${n} at ${sol(o.price)} as ${o.name}`;
  }
  function renderOffers() {
    const box = $('offers');
    const show = !!wallet && !!snap && (offers.length > 0 || unavailable.length > 0 || (snap.offers?.eth && ethOn));
    box.hidden = !show;
    $('ethBtn').hidden = !(snap?.offers?.ethLists > 0);   // shown without a Solana wallet too: phone users link from the ETH wallet's browser
    if (!show) return;
    const opts = [{ list: '', label: `Public price · ${sol(snap.priceLamports)}`, ok: true }, ...offers.map(o => ({ list: o.list, label: offerLine(o), ok: o.remaining > 0 }))];
    const list = $('offerList');
    list.replaceChildren(...opts.map((o) => {
      const id = 'offer-' + (o.list || 'public');
      const l = document.createElement('label'); l.className = 'offer'; if (!o.ok) l.dataset.used = '';
      const r = document.createElement('input'); r.type = 'radio'; r.name = 'offer'; r.value = o.list; r.id = id; r.disabled = !o.ok; r.checked = (chosen || '') === o.list;
      r.addEventListener('change', () => { chosen = r.value || null; renderBuy(); });
      const t = document.createElement('span'); t.textContent = o.label;
      l.append(r, t); return l;
    }));
    $('offerNote').textContent = unavailable.length ? `Could not check ${unavailable.map(u => u.name).join(', ')} right now. Try again in a minute.` : '';
  }
  // Ethereum holders: EIP-6963 discovery (Rabby, MetaMask, Coinbase and others announce themselves), else window.ethereum.
  // personal_sign of a message naming the Solana wallet; no transaction, no fees. The pieces go to the Solana wallet.
  const ethProviders = [];
  window.addEventListener('eip6963:announceProvider', (e) => { const d = e.detail; if (d?.provider?.request && d.info?.uuid && !ethProviders.some(x => x.info.uuid === d.info.uuid)) ethProviders.push(d); });
  try { window.dispatchEvent(new Event('eip6963:requestProvider')); } catch { /* old browser */ }
  // Ethereum providers: EIP-6963 announcements, else the multichain wallets' own objects (Phantom, Backpack hold
  // Ethereum too, so inside their browser one app covers both chains), else window.ethereum.
  function ethWallets() {
    try { window.dispatchEvent(new Event('eip6963:requestProvider')); } catch { /* old browser */ }
    let list = ethProviders.map(d => ({ name: String(d.info.name || 'Ethereum wallet').slice(0, 40), icon: /^data:image\/(svg\+xml|png|webp);/.test(d.info.icon || '') ? d.info.icon : null, p: d.provider }));
    if (!list.length) {
      const seen = new Set();
      for (const [name, p] of [['Phantom (Ethereum)', window.phantom?.ethereum], ['Backpack (Ethereum)', window.backpack?.ethereum], ['Ethereum wallet', window.ethereum]]) if (p?.request && !seen.has(p)) { seen.add(p); list.push({ name, icon: null, p }); }
    }
    // the app the Solana wallet came from first (Phantom user in Phantom: its Ethereum account is the obvious pick)
    const sname = (provider?.name || '').toLowerCase().split(' ')[0];
    if (sname) list.sort((x, y) => (y.name.toLowerCase().startsWith(sname) ? 1 : 0) - (x.name.toLowerCase().startsWith(sname) ? 1 : 0));
    return list;
  }
  // a Solana address someone types or pastes: base58, 32 bytes, on the ed25519 curve (a typo is usually caught; a
  // typo that still passes only links to an address that can never sign a claim, so nothing is lost)
  function solAddressOk(v) {
    if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(v)) return false;
    try { const k = new solanaWeb3.PublicKey(v); return k.toBase58() === v && solanaWeb3.PublicKey.isOnCurve(k.toBytes()); } catch { return false; }
  }
  const shortAddr = (a) => a.slice(0, 4) + '…' + a.slice(-4);
  // The Ethereum account is connected first (Hazy: holders should not have to connect Solana before their ETH
  // wallet); the Solana side (connected wallet or pasted address) is only needed for the signature.
  let ethSel = null;   // { w: provider entry, eth: address }
  const ethSay = (m, pasted) => pasted ? setEthMsg(m) : toast(m, 8000);
  async function connectEth(pasted) {
    if (ethSel) {   // already connected: follow an account switch in the wallet without a new prompt
      try { const a = await ethSel.w.p.request({ method: 'eth_accounts' }); if (Array.isArray(a) && /^0x[0-9a-fA-F]{40}$/.test(String(a[0] || ''))) ethSel.eth = String(a[0]); else ethSel = null; } catch { ethSel = null; }
      if (ethSel) return ethSel;
    }
    const list = ethWallets();
    if (!list.length) { ethSay(pasted ? 'No Ethereum wallet in this browser. Open this page in the browser inside MetaMask or Coinbase Wallet, or use a desktop browser with the Rabby, MetaMask or Coinbase extension.' : 'No Ethereum wallet found in this browser. Rabby, MetaMask and Coinbase Wallet work as extensions; on a phone, open this page in the browser inside MetaMask or Coinbase Wallet.', pasted); return null; }
    const w = list.length === 1 ? list[0] : await pickWallet(list);
    if (!w) return null;
    const b = pasted ? $('ethGo') : $('ethBtn'); b.disabled = true; const label = b.textContent;
    try {
      b.textContent = 'Connect your Ethereum wallet…';
      const accounts = await w.p.request({ method: 'eth_requestAccounts' });
      const eth = Array.isArray(accounts) ? String(accounts[0] || '') : '';
      if (!/^0x[0-9a-fA-F]{40}$/.test(eth)) throw new Error('The Ethereum wallet gave no address.');
      ethSel = { w, eth };
      track('connect', { chain: 'eth', address: eth, app: w.name });
      return ethSel;
    } catch (e) {
      ethSay(e?.code === 4001 || /reject|denied|cancel/i.test(e?.message || '') ? 'Cancelled in the Ethereum wallet. Nothing was linked.' : (e?.message || 'The Ethereum wallet did not connect.'), pasted);
      return null;
    } finally { b.disabled = false; b.textContent = label; }
  }
  async function ethLinkTo(sol, pasted) {
    const sel = await connectEth(pasted);
    if (!sel) return;
    const { w, eth } = sel;
    const b = pasted ? $('ethGo') : $('ethBtn'); b.disabled = true; const label = b.textContent;
    try {
      const c = await api(`/api/eth/challenge?sol=${encodeURIComponent(sol)}&eth=${encodeURIComponent(eth)}`);
      if (!c.nonce || !c.message || !c.message.includes(sol) || !c.message.toLowerCase().includes(eth.toLowerCase())) throw new Error('The server sent an unexpected message, so nothing was signed.');
      b.textContent = 'Sign the message in your Ethereum wallet…';
      const hex = '0x' + Array.from(new TextEncoder().encode(c.message), x => x.toString(16).padStart(2, '0')).join('');
      const signature = await w.p.request({ method: 'personal_sign', params: [hex, eth] });
      b.textContent = 'Checking your NFTs…';
      const r = await api('/api/eth/link', { sol, eth, signature: String(signature), nonce: c.nonce });
      const found = (r.offers || []).filter(o => o.list);
      const what = found.map(o => o.open === false ? `${o.name}: opens later` : o.remaining > 0 ? offerLine(o) : `${o.name}: used up`).join('; ');
      if (!r.linked) { ethSay(found.length ? `${shortAddr(eth)}: ${what}. Nothing left to claim with it, so nothing was linked.` : `No eligible NFTs found in ${shortAddr(eth)}, so nothing was linked. Try the wallet that holds them.`, pasted); return; }
      if (pasted) {
        setEthMsg(`Linked ${shortAddr(eth)} to ${shortAddr(sol)}. ${what}. Now open this page in your Solana wallet (Phantom, Solflare, Backpack) with ${shortAddr(sol)} connected to mint.`, true);
        $('ethCopy').hidden = false;
        try { localStorage.setItem('sh-ethsol', sol); } catch { /* private mode */ }
      } else {
        await refreshOffers();
        toast(`Found: ${what}. The pieces go to your Solana wallet.`, 8000);
      }
    } catch (e) {
      const cancelled = e?.code === 4001 || /reject|denied|cancel/i.test(e?.message || '');
      track(cancelled ? 'step' : 'error', { step: cancelled ? 'eth link cancelled' : 'eth link', chain: 'eth', address: eth, msg: e?.message || String(e?.code || '') });
      ethSay(e?.code === 4001 || /reject|denied|cancel/i.test(e?.message || '') ? 'Cancelled in the Ethereum wallet. Nothing was linked.' : (e?.message || 'The Ethereum check did not work.'), pasted);
    } finally { b.disabled = false; b.textContent = label; }
  }
  function setEthMsg(m, ok = false) { const el = $('ethMsg'); el.textContent = m; if (ok) el.dataset.ok = ''; else delete el.dataset.ok; }
  async function ethCheck() {
    if (!(await connectEth(false))) return;   // Ethereum first
    if (wallet) return ethLinkTo(wallet, false);
    // a Solana wallet in this browser (desktop extension, Phantom/Backpack app): connect it now, no typing
    if (wallets().length) {
      toast(`Ethereum wallet ${shortAddr(ethSel.eth)} connected. Now pick the Solana wallet that receives the pieces.`, 6000);
      if (await connectWallet()) return ethLinkTo(wallet, false);
    }
    // no Solana wallet here (typical: the page opened inside MetaMask or Coinbase Wallet on a phone), or the connect
    // was cancelled: paste the address
    const box = $('ethLink'); box.hidden = false;
    setEthMsg(`Ethereum wallet ${shortAddr(ethSel.eth)} connected. Paste the Solana address that receives the pieces.`);
    try { $('ethSol').value ||= localStorage.getItem('sh-ethsol') || ''; } catch { /* private mode */ }
    $('ethSol').focus();
  }
  $('ethGo').addEventListener('click', () => {
    const v = $('ethSol').value.trim();
    $('ethCopy').hidden = true;
    if (!solAddressOk(v)) { setEthMsg('That is not a Solana wallet address. Copy it from your Solana wallet (Phantom, Solflare, Backpack) and paste it here.'); return; }
    setEthMsg('');
    ethLinkTo(v, true);
  });
  $('ethCopy').addEventListener('click', () => { const link = location.origin + location.pathname; navigator.clipboard?.writeText(link).then(() => toast('Link copied. Open it in your Solana wallet.'), () => toast(link, 8000)); });
  $('ethBtn').addEventListener('click', ethCheck);
  // Every allowlist use (free claim or reservation at a list price) needs a signMessage from the Solana wallet, so
  // nobody can claim or hold another wallet's allowance. A reservation's signature is kept 45 s: the server hands back
  // the same reservation for 50 s, so a buyer who cancelled in the wallet and tries again signs only once.
  let proofCache = null;
  async function listProof(o, unit, reuse) {
    const b = $('buyBtn'), key = wallet + '|' + o.list + '|' + unit;
    if (reuse && proofCache && proofCache.key === key && Date.now() - proofCache.at < 45000) return proofCache;
    proofCache = null;
    if (!provider?.signMessage) throw new Error('This wallet cannot sign a message, which an allowlist offer needs. Phantom, Solflare, Backpack and Jupiter can.');
    b.textContent = o.price === 0 ? 'Preparing your claim…' : 'Preparing your price…';
    const c = await api(`/api/claim/challenge?wallet=${encodeURIComponent(wallet)}&list=${encodeURIComponent(o.list)}`);
    if (!c.nonce || !c.message || !c.message.includes(wallet)) throw new Error('The server sent an unexpected message, so nothing was signed.');
    b.textContent = o.price === 0 ? 'Sign the claim in your wallet (free)…' : 'Sign to reserve your price (free, sends nothing)…';
    const at = Date.now(), sig = await provider.signMessage(new TextEncoder().encode(c.message));
    const p = { key, nonce: c.nonce, signature: btoa(String.fromCharCode(...sig)), at };
    if (reuse) proofCache = p;
    return p;
  }
  async function claimFree(o) {
    const b = $('buyBtn');
    const unit = o.units?.[0]?.unit;
    if (!unit) throw new Error('This offer is used up.');
    const { nonce, signature } = await listProof(o, unit, false);
    b.textContent = 'Claiming…';
    const r = await api('/api/claim', { wallet, list: o.list, unit, nonce, signature });
    toast(`Claimed. You are No. ${r.n}. You can close this page: your piece arrives in your wallet when it is drawn.`, 9000);
    refreshMine(); refreshOffers();
  }
  function renderAll() { if (typeof renderOffers === 'function') { try { renderOffers(); } catch { /* offers are optional */ } } renderPending(); renderHeartbeat(); renderStatus(); renderLabel(live.piece || snap?.queue?.find(q => q.traits) || null); renderPhases(); renderQueue(); renderWall(); renderPrice(); renderBuy(); renderStudioFoot(); }

  // ------------------------------------------------------------ live feed
  let ws, retry = 1000, lastOffersKey = null;
  function connect() {
    try { ws = new WebSocket(WS); } catch { return setTimeout(connect, retry); }
    ws.onmessage = (ev) => {
      const m = clean(JSON.parse(ev.data));
      if (m.type === 'snapshot') {
        snap = m;
        if (m.heartbeat) lastHb = m.heartbeat;
        if (m.live) { live = { n: m.live.n, piece: m.live.piece, phases: (m.live.phases || []).map(ph => ({ phase: ph })), startedAt: m.live.piece.drawStart, tiles: m.live.tiles, hb: [] }; if (m.live.tiles && !replaying) showTiles(m.live.tiles); }
        else live = { n: null, piece: null, phases: [], startedAt: 0, tiles: null, hb: [] };
        const ok = JSON.stringify(m.offers || null);   // re-check offers only when the lists changed, not on every snapshot
        renderAll(); refreshMine(); if (wallet && !offers.length && ok !== lastOffersKey) refreshOffers();
        lastOffersKey = ok;
      } else if (m.type === 'drawing') {
        live = { n: m.piece.n, piece: m.piece, phases: [], startedAt: m.piece.drawStart, tiles: null, hb: [] };
        prevBusTiles = null; shownIdle = null;
        if (!replaying) blank();
        bump(m.piece); renderAll();
      } else if (m.type === 'phase') {
        if (live.n !== m.n) return;
        live.phases.push({ phase: m.phase, t: m.t }); feedBus(m.tiles); live.tiles = m.tiles;
        if (!replaying) showTiles(m.tiles);
        renderStatus(); renderPhases(); renderStudioFoot();
      } else if (m.type === 'drawn') {
        if (live.n === m.piece.n && live.tiles && !replaying) applyPalette(live.tiles, palettes[m.piece.traits.palette] || LCD);
        bump(m.piece);
        if (wallet && m.piece.wallet === wallet) toast(`Your No. ${m.piece.n} is finished. Minting it to your wallet now.`);
        setTimeout(() => { if (live.n === m.piece.n) { live = { n: null, piece: null, phases: [], startedAt: 0, tiles: null, hb: [] }; renderAll(); } }, 9000);
        renderAll(); refreshMine();
      } else if (m.type === 'queued' || m.type === 'status') {
        if (live.n === m.piece.n && m.piece.status !== 'drawing' && !m.piece.drawEnd) {   // the drawing was stopped (Game Boy reset, watchdog, mismatch)
          live = { n: null, piece: null, phases: [], startedAt: 0, tiles: null, hb: [] };
          if (!replaying) blank();
          toast(`The drawing of No. ${m.piece.n} was interrupted. It is back at the front of the line and starts again from the same seed.`, 8000);
        }
        bump(m.piece); renderAll();
        if (wallet && m.piece.wallet === wallet) refreshMine();
        if (waitingFor && m.piece.signature === waitingFor && !m.piece.batch?.i) {   // a multi-piece payment: its first piece speaks for all
          const n = m.piece.n, st = m.piece.status, k = m.piece.batch?.of || 1, nos = k > 1 ? `Nos. ${n}–${n + k - 1}` : `No. ${n}`;
          $('buyBtn').textContent = st === 'seeding' ? `Paid. You are ${nos}.` : `No. ${n} has its seed: ${m.piece.seedHex}`;
          if (payLock && !payLock.done) { payLock = { until: Date.now() + 6000, done: true }; $('buyBtn').classList.remove('loading'); setTimeout(renderBuy, 6100); }   // show the number a moment, then unlock
          if (st === 'seeding') toast(`Paid. You are ${nos}. You can close this page: ${k > 1 ? 'your pieces arrive' : 'your piece arrives'} in your wallet when ${k > 1 ? 'they are' : 'it is'} drawn.`, 9000);
          if (st !== 'seeding') waitingFor = null;
        }
      }
      else if (m.type === 'refund' && wallet && m.wallet === wallet) {   // e.g. sold out while a multi-piece payment was on its way
        refreshMine();
        if (m.reason === 'sold-out' && m.pieces > 0) toast(`Only ${m.pieces} of your ${m.wanted} pieces were still left. The other ${(m.lamports / 1e9).toFixed(4)} SOL is recorded as a refund to this wallet.`, 9000);
      }
      else if (m.type === 'oneofone' && Number.isInteger(m.id) && Number.isInteger(m.n)) toast(`A 1/1! No. ${m.n} will be "${m.title || 'one of the ten'}", drawn live like every piece.`, 9000);   // the fair rule just picked it
      else if (m.type === 'lane') { snap.lane = m.lane; renderAll(); }
      else if (m.type === 'heartbeat') {
        lastHb = { ppm: m.ppm, samples: m.samples, at: m.at };
        if (m.piece && m.piece === live.n) live.hb.push(lastHb);
        beat(); renderHeartbeat(); if (live.piece) renderLabel(live.piece);
      }
    };
    ws.onopen = () => { retry = 1000; };
    ws.onclose = () => { snap = null; renderAll(); setTimeout(connect, retry); retry = Math.min(15000, retry * 2); };
  }
  // keep the snapshot's lists current from single-piece events
  function bump(p) {
    if (!snap) return;
    const inQ = p.status === 'seeding' || p.status === 'queued' || p.status === 'drawing';
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
  // Wallets: Wallet Standard first (Jupiter, Phantom, Solflare, Backpack and most new wallets register this way),
  // then the older injected providers. Several wallets installed: the collector picks one.
  const CHAIN = snapChain();
  function snapChain() { return 'solana:mainnet'; }
  const standard = [];
  function onRegister(...ws) { for (const w of ws) if (w.features?.['standard:connect'] && w.features?.['solana:signTransaction'] && !standard.includes(w)) standard.push(w); }
  window.addEventListener('wallet-standard:register-wallet', (e) => { try { e.detail({ register: onRegister }); } catch { /* a broken wallet */ } });
  try { window.dispatchEvent(new CustomEvent('wallet-standard:app-ready', { detail: { register: onRegister } })); } catch { /* old browser */ }
  function fromStandard(w) {
    let account = null;
    return {
      name: w.name, icon: w.icon,
      async connect() {
        const r = await w.features['standard:connect'].connect();
        account = (r?.accounts || w.accounts).find(a => a.chains?.some(c => c.startsWith('solana:'))) || (r?.accounts || w.accounts)[0];
        if (!account) throw new Error('no account');
        return { publicKey: new solanaWeb3.PublicKey(account.address) };
      },
      async signTransaction(tx) {
        const chain = (snap?.network === 'devnet') ? 'solana:devnet' : CHAIN;
        const [out] = await w.features['solana:signTransaction'].signTransaction({ account, transaction: tx.serialize({ requireAllSignatures: false, verifySignatures: false }), chain });
        return solanaWeb3.Transaction.from(out.signedTransaction);
      },
      signMessage: w.features['solana:signMessage'] ? async (bytes) => {
        const [out] = await w.features['solana:signMessage'].signMessage({ account, message: bytes });
        return out.signature;
      } : null,
    };
  }
  function injected() {
    const list = [];
    const add = (p, name) => { if (p && !list.some(x => x.p === p)) list.push({ p, name }); };
    add(window.phantom?.solana, 'Phantom'); add(window.solflare, 'Solflare'); add(window.backpack?.solana || window.backpack, 'Backpack'); add(window.jupiter?.solana || window.jupiter, 'Jupiter'); add(window.solana, 'Solana wallet');
    return list.map(({ p, name }) => ({ name, icon: null, connect: () => p.connect(), signTransaction: (tx) => p.signTransaction(tx), signMessage: p.signMessage ? async (bytes) => { const r = await p.signMessage(bytes, 'utf8'); return r?.signature || r; } : null, legacy: p }));
  }
  function wallets() {
    const std = standard.map(fromStandard);
    // a wallet that registered through Wallet Standard is not offered a second time as an injected provider
    return [...std, ...injected().filter(i => !std.some(s => s.name.toLowerCase().startsWith(i.name.toLowerCase().split(' ')[0])))];
  }
  function pickWallet(list) {
    return new Promise((done) => {
      const d = document.createElement('dialog'); d.className = 'wpick';
      d.innerHTML = `<p class="wp-head">Choose a wallet</p>` + list.map((w, i) => `<button type="button" data-i="${i}">${w.icon ? `<img src="${esc(w.icon)}" alt="" width="24" height="24">` : '<span class="wp-dot"></span>'}${esc(w.name)}</button>`).join('') + `<button type="button" class="wp-cancel" data-i="-1">Cancel</button>`;
      document.body.append(d); d.showModal();
      d.addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b && e.target !== d) return; const i = b ? +b.dataset.i : -1; d.close(); d.remove(); done(i >= 0 ? list[i] : null); });
      d.addEventListener('cancel', () => { d.remove(); done(null); });
    });
  }
  async function connectWallet() {
    const list = wallets();
    if (!list.length) { toast('No Solana wallet found in this browser. Jupiter, Phantom, Solflare and Backpack work; on a phone, open this page inside your wallet app.', 7000); return false; }
    const w = list.length === 1 ? list[0] : await pickWallet(list);
    if (!w) return false;
    provider = w;
    $('walletBtn').textContent = 'Connecting…';
    try {
      const r = await provider.connect();
      wallet = (r?.publicKey || provider.legacy?.publicKey).toString();
      $('walletBtn').textContent = wallet.slice(0, 4) + '…' + wallet.slice(-4);
      track('connect', { chain: 'sol', address: wallet, app: w.name });
      $('ethLink').hidden = true;   // connected: the paste panel is not needed any more
      renderAll(); refreshMine(); refreshOffers();
      return true;
    } catch (e) { $('walletBtn').textContent = 'Connect wallet'; toast('The wallet did not connect.'); track('error', { step: 'connect sol', app: w.name, msg: e?.message || '' }); return false; }
  }
  $('walletBtn').onclick = () => { if (!wallet) connectWallet(); else document.getElementById('mineBlock').scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' }); };

  // a paid commission that has no number yet: kept in localStorage so a reload or a second tab still knows
  const PKEY = 'sh-pending';
  function getPending() { try { const p = JSON.parse(localStorage.getItem(PKEY) || 'null'); return p && Date.now() - p.at < 10 * 60000 ? p : null; } catch { return null; } }
  function setPending(p) { try { p ? localStorage.setItem(PKEY, JSON.stringify(p)) : localStorage.removeItem(PKEY); } catch { /* private mode */ } renderPending(); }
  function renderPending() {
    const p = getPending(), mine = p && snap?.queue?.find(q => q.signature === p.signature);
    if (p && mine) { setPending(null); return; }   // it has its number now: the "your place" card takes over
    $('pendingNote').hidden = !p;
    if (p) $('pendingNote').textContent = 'Your payment is on its way. It gets its number once the network finalizes it, usually within 30 seconds. No need to pay again, and you can close this page: the piece arrives in your wallet when it is drawn.';
  }
  async function commission() {
    if (!wallet) {   // connected just now: show its allowlist/holder offers first, never charge the public price by surprise
      if (!(await connectWallet())) return;
      await refreshOffers();
      if (offers.some(o => o.remaining > 0)) { renderBuy(); toast('Your wallet has an allowlist or holder offer. Check your choice, then press the button again.', 7000); return; }
    }
    const offer = chosenOffer(), qty = offer ? 1 : qtyValue();   // fixed now: a snapshot arriving mid-payment must not change it
    const pend = getPending();
    if (pend && pend.wallet === wallet && !confirm('Your last payment is still being confirmed. Commission another piece anyway?')) return;
    const b = $('buyBtn');
    busy = true; b.disabled = true;
    track('step', { chain: 'sol', address: wallet, step: offer ? `commission: ${offer.list}${offer.price === 0 ? ' (free)' : ''}` : `commission: ${qty} public` });
    try {
      if (offer && offer.price === 0) { await claimFree(offer); return; }
      b.textContent = 'Preparing the payment…';
      let t;
      if (offer) {
        const unit = offer.units?.[0]?.unit;
        if (!unit) throw new Error('This offer is used up.');
        const pf = await listProof(offer, unit, true);
        b.textContent = 'Preparing the payment…';
        try { t = await api('/api/ticket', { wallet, list: offer.list, unit, nonce: pf.nonce, signature: pf.signature }); }
        catch (e) { proofCache = null; throw e; }   // its nonce may be spent: sign again next time
      } else t = await api('/api/ticket', { wallet, qty });
      const tx = solanaWeb3.Transaction.from(Uint8Array.from(atob(t.tx), c => c.charCodeAt(0)));
      const bad = checkPayment(tx, t.ticket, offer, t, offer ? 1 : qty);
      if (bad) throw new Error(`The payment from the server looks wrong (${bad}), so it was not signed. Nothing was charged.`);
      b.textContent = 'Approve it in your wallet…';
      const signed = await provider.signTransaction(tx);
      b.textContent = 'Sending…';
      const raw = btoa(String.fromCharCode(...signed.serialize()));
      const r = await api('/api/submit', { ticket: t.ticket, tx: raw });
      waitingFor = r.signature;
      setPending({ signature: r.signature, wallet, at: Date.now() });
      payLock = { until: Date.now() + 120000, done: false };
      setTimeout(renderBuy, 120500);
      b.classList.add('loading');
      b.textContent = 'Paid. Confirming on Solana…';
      $('buyNote').textContent = qty > 1 ? `Your payment for ${qty} pieces is on its way. Once the network finalizes it (about 15 seconds) they get their numbers, in a row, and about 15 seconds later their seeds. You can close this page now; they will be drawn in order and sent to your wallet.` : 'Your payment is on its way. Once the network finalizes it (about 15 seconds) it gets its number, and about 15 seconds later its seed. You can close this page now; it will be drawn in order and sent to your wallet.';
      refreshMine(); if (offer) refreshOffers();
    } catch (e) {
      const em = e?.message || '', code = e?.code;
      const userCancel = code === 4001 || /user (rejected|denied|cancel)|rejected the request|request rejected|cancelled by user|user declined/i.test(em);
      const msg = userCancel ? 'You cancelled in the wallet. Nothing was paid.'
        : /blockhash|expired/i.test(em) ? 'The payment took too long and expired before it was sent. Nothing was paid. Please try again.'
        : /insufficient|not enough|0x1\b/i.test(em) ? 'Your wallet does not have enough SOL for the price plus the network fee. Nothing was paid.'
        : (em || 'Something went wrong. If your wallet shows the payment as sent, it is picked up automatically; check "Your pieces" before paying again.');
      toast(msg, 6000);
      track(userCancel ? 'step' : 'error', { step: userCancel ? 'commission cancelled' : 'commission', chain: 'sol', address: wallet, msg: em || String(code || '') });
    } finally {
      busy = false; renderBuy();
    }
  }
  $('buyBtn').onclick = commission;

  // The page only signs exactly our payment: one transfer to the published treasury, and our memo. The amount is the
  // published price, or an allowlist offer's price when the server's ticket names that offer (same list, same price),
  // that price is what the page shows, and it is not above the published price. Never another recipient.
  function checkPayment(tx, ticket, offer = null, tk = null, qty = 1) {
    if (!TREASURY || !PRICE) return 'page not configured';
    if (!offer && (tk?.qty ?? 1) !== qty) return 'number of pieces differs from the one chosen';
    let want = PRICE * qty;   // public price: the chosen number of pieces at the published price each
    if (offer) {
      if (!(offer.price > 0 && offer.price <= PRICE)) return 'offer price above the public price';
      if (!tk || tk.priceLamports !== offer.price || tk.grant?.list !== offer.list || tk.grant?.price !== offer.price) return 'price differs from the offer shown';
      want = offer.price;
    }
    const ix = tx.instructions;
    if (ix.length !== 2) return 'unexpected instructions';
    const [t, m] = ix;
    if (t.programId.toBase58() !== solanaWeb3.SystemProgram.programId.toBase58()) return 'not a transfer';
    const d = t.data;
    if (d[0] !== 2 || d[1] || d[2] || d[3]) return 'not a transfer';
    let lamports = 0; for (let i = 11; i >= 4; i--) lamports = lamports * 256 + d[i];
    if (lamports !== want) return 'wrong amount';
    if (t.keys[1].pubkey.toBase58() !== TREASURY) return 'wrong recipient';
    if (t.keys[0].pubkey.toBase58() !== wallet || tx.feePayer?.toBase58() !== wallet) return 'wrong sender';
    if (m.programId.toBase58() !== 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr' || new TextDecoder().decode(m.data) !== 'slowhorizons:' + ticket) return 'wrong memo';
    return null;
  }
  let waitingFor = null;

  async function refreshMine() {
    if (!wallet || !API) return;
    let list = [];
    let refunds = [];
    try { const r = await api('/api/pieces?owner=' + encodeURIComponent(wallet)); list = r.pieces || []; refunds = r.refunds || []; } catch { return; }
    $('mineBlock').hidden = list.length === 0 && refunds.length === 0;
    $('mine').innerHTML = list.slice().reverse().map(p => {
      const when = p.drawStart ? `Drawn ${clock(p.drawStart)}${p.frames ? `, took ${mmss(p.frames / FPS)}` : ''}` : `Paid ${clock(p.paidAt)}, waiting to be drawn`;
      const status = { seeding: 'Paid, seed coming', queued: 'In line', drawing: 'Being drawn now', drawn: 'Drawn, minting', minting: 'Minting', minted: 'In your wallet', failed: 'Needs a look; it will be redrawn or refunded', cancelled: 'Cancelled; the payment goes back to this wallet' }[p.status] || p.status;
      return `<div class="mine-row">${p.image ? `<img data-open="${p.n}" src="${esc(p.image)}" alt="No. ${p.n}" style="cursor:zoom-in">` : '<span class="ph"></span>'}
        <div><p><b>${esc(pieceName(p))}</b>${p.special ? ' · 1/1' : ''} · ${esc(status)}</p><p class="when">${esc(when)} · seed ${p.seedHex}${p.heartbeat ? ` · heartbeat ${ppm(p.heartbeat.ppm)}` : ''}</p></div>
        <div class="acts">${p.drawEnd ? `<button type="button" data-replay="${p.n}">Replay</button><a href="${esc(p.hires)}" download="slow-horizons-${p.n}.png">Download (1920×1728)</a><button type="button" data-banner="${p.n}" data-seed="${p.seed}" data-special="${p.special || 0}">Banner (1728×576)</button>` : ''}${p.stream ? `<a href="${esc(p.stream)}" target="_blank" rel="noopener">Watch the recording</a>` : ''}</div></div>`;
    }).join('');
    $('mine').innerHTML += refunds.map(r => `<div class="mine-row"><span class="ph"></span><div><p><b>Refund</b> · ${esc((r.lamports / 1e9).toFixed(4))} SOL · ${esc({ underpaid: 'payment below the price', 'sold-out': 'sold out before your payment arrived (all or part of it)', closed: 'arrived after minting ended', overpaid: 'paid more than the price', cancelled: 'the piece was cancelled' }[r.reason] || r.reason)}</p><p class="when">${r.status === 'refunded' ? 'Refunded' : 'Recorded; it will be sent back to this wallet'}</p></div><div class="acts"></div></div>`).join('');
  }

  // palettes and banners come from the same WASM build the page uses to redraw seeds
  let labRef = null;
  // a piece's picture from its seed; a 1/1 (special 1..10) is its fixed scene, set around the render and always reset
  function labArt(p, kind = 'draw') {
    if (p.special) labRef.special(p.special);
    try { return kind === 'banner' ? labRef.banner(p.seed) : labRef.draw(p.seed); }
    finally { if (p.special) labRef.special(0); }
  }
  const pieceName = (p) => p.title ? `No. ${p.n}: ${p.title}` : `No. ${p.n}`;
  SeedLab.load('gen.wasm').then((lab) => { labRef = lab; for (const p of lab.palettes) palettes[p.name] = p.colors; renderAll(); }).catch(() => {});

  // banner: the piece in the middle, the same scene continued sideways by the same code, 4x pixels (3:1)
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-banner]');
    if (!b || !labRef) return;
    const art = labArt({ seed: +b.dataset.seed, special: +(b.dataset.special || 0) }, 'banner'), S = 4, c = document.createElement('canvas');
    c.width = art.w * S; c.height = art.h * S;
    const g = c.getContext('2d'), img = g.createImageData(c.width, c.height), pal = art.colors.map(rgb);
    for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
      const col = pal[art.px[((y / S) | 0) * art.w + ((x / S) | 0)]], o = (y * c.width + x) * 4;
      img.data[o] = col[0]; img.data[o + 1] = col[1]; img.data[o + 2] = col[2]; img.data[o + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    c.toBlob((blob) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `slow-horizons-${b.dataset.banner}-banner.png`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000); });
  });

  // ------------------------------------------------------------ the machine at work
  // Link cable: the tile rows that really crossed the cable, replayed at the cable's pace (the source-code panel was removed).
  // Cable: the bytes of each screen update that really crossed the link, replayed at the cable's 1 KB/s once the
  // update has arrived; when the Game Boy is idle, its real $00 polls.
  const EX = window.SH_EXCERPTS || {};
  let codeKey = null, prevBusTiles = null, busQueue = [], busLine = [], busLines = [], busLast = performance.now(), busMode = 'off';
  function nowCodeKey() {
    if (!live.n || !live.piece) return null;
    const got = live.phases.map(p => p.phase), last = got.length ? got[got.length - 1] : 0;
    const ridges = live.piece.traits?.ridges || 0, done = got.filter(x => x === 4).length, wet = ['lake', 'sea', 'oasis'].includes(live.piece.traits?.ground);
    if (last === 0) return '1';
    if (last >= 8) return null;
    if (last === 3 || (last === 4 && done < ridges)) return '4';
    let next = last + 1;
    if (next === 6 && !wet) next = 7;
    return String(next);
  }
  function renderCode() {}   // the source-code panel was removed (Hazy, 2026-10-17): no ROM source on the page before the mint ends
  function feedBus(b64) {
    const bin = atob(b64), cur = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) cur[i] = bin.charCodeAt(i);
    for (let r = 0; r < 18; r++) {   // only the tile rows that changed went over the cable
      let changed = !prevBusTiles;
      for (let i = r * 320; !changed && i < r * 320 + 320; i++) changed = cur[i] !== prevBusTiles[i];
      if (changed) { busQueue.push(r); for (let i = r * 320; i < r * 320 + 320; i++) busQueue.push(cur[i]); }
    }
    if (busQueue.length > 8000) busQueue = busQueue.slice(-8000);
    prevBusTiles = cur;
  }
  const hx = (v) => v.toString(16).padStart(2, '0');
  function busTick() {
    const now = performance.now(), dt = Math.min(0.25, (now - busLast) / 1000); busLast = now;
    let n = Math.round(1024 * dt), mode;
    const idle = snap?.lane?.ready && !live.n;
    if (busQueue.length) mode = 'data'; else if (idle) mode = 'idle'; else mode = live.n ? 'drawing' : 'off';
    if (mode === 'data') { const take = busQueue.splice(0, n); for (const b of take) push(b); }
    else if (mode === 'idle') for (let i = 0; i < n; i++) push(0);
    else n = 0;
    if (mode !== busMode || n) {
      busMode = mode;
      $('busRate').textContent = { data: '1 KB/s · screen update', idle: '1 KB/s · idle polls', drawing: 'quiet · computing', off: 'no signal' }[mode];
      $('bus').textContent = [...busLines, busLine.map(hx).join(' ')].slice(-8).join('\n');
    }
    renderCode();
  }
  function push(b) { busLine.push(b); if (busLine.length === 12) { busLines.push(busLine.map(hx).join(' ')); busLine = []; if (busLines.length > 8) busLines.shift(); } }
  setInterval(busTick, reduced ? 250 : 66);

  // ------------------------------------------------------------ gallery sheet
  const sheet = $('sheet');
  function paintTo(canvas, art, colors) {
    canvas.width = art.w; canvas.height = art.h;
    const g = canvas.getContext('2d'), img = g.createImageData(art.w, art.h), pal = colors.map(rgb);
    for (let i = 0; i < art.px.length; i++) { const c = pal[art.px[i]]; img.data[i * 4] = c[0]; img.data[i * 4 + 1] = c[1]; img.data[i * 4 + 2] = c[2]; img.data[i * 4 + 3] = 255; }
    g.putImageData(img, 0, 0);
  }
  function short(sig) { return sig ? sig.slice(0, 6) + '…' + sig.slice(-6) : ''; }
  async function openPiece(n) {
    let r;
    try { r = await api('/api/piece?n=' + n); } catch (e) { toast(e.message); return; }
    const p = r.piece, t = p.traits;
    if (!t || !labRef) return toast('This piece is not drawn yet.');
    $('shTitle').textContent = pieceName(p);
    const one = $('shOne'), rr = p.specialRoll;
    one.hidden = !p.special;
    if (p.special) one.innerHTML = `<p><span class="one-badge">1/1</span> <b>${esc(p.title)}</b>, #${p.special} of the ten hand-made scenes. There is only one.</p>`
      + (p.leftover ? '<p class="proof">Not handed out by the fair rule before the mint closed; drawn on the Game Boy afterwards.</p>'
        : rr ? `<p class="proof">Picked by the fair rule when its seed was fixed: <code>${rr.roll} mod ${rr.left_mints} = ${rr.roll % rr.left_mints}</code>, below <code>${rr.left_1of1}</code> (the 1/1s still left), so it became one (a ${rr.left_1of1} in ${rr.left_mints} chance). <a href="${esc(API)}/api/one-of-ones" target="_blank" rel="noopener">Check every 1/1</a></p>` : '');
    $('shDesc').textContent = p.description || '';
    const art = labArt(p); paintTo($('shScreen'), art, art.colors);
    const ban = labArt(p, 'banner'); paintTo($('shBanner'), ban, ban.colors);
    const pal = palettes[t.palette];
    const sw = pal ? `<span class="swatch">${pal.map(c => `<i style="background:${c}"></i>`).join('')}</span>` : '';
    $('shTraits').innerHTML = [
      ['Edition', p.special ? '<b>1/1</b>' : 'Open'], ...(p.special ? [['Title', `<b>${esc(p.title)}</b>`]] : []),
      ['Palette', sw + esc(t.palette)], ['Time', esc(cap(t.time))], ['Sky', esc(cap(t.sky))], ['Terrain', esc(cap(t.terrain))],
      ['Ground', esc(cap(t.ground))], ['Weather', esc(cap(t.weather))], ['Ridges', String(t.ridges)], ['Snowcaps', t.snowcaps ? 'Yes' : 'No'],
      ['Extras', esc(t.extras.length ? t.extras.join(', ') : 'None')],
    ].map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
    const ex = (kind, id) => `https://explorer.solana.com/${kind}/${id}?cluster=${r.network}`;
    const secs = p.frames ? p.frames / FPS : 0, hb = p.heartbeat;
    $('shNumbers').innerHTML = [
      ['Seed', `<span class="mono">${p.seedHex}</span>`],
      ['From', p.seedBlock ? (p.signature ? `payment <a class="mono" href="${ex('tx', p.signature)}" target="_blank" rel="noopener">${short(p.signature)}</a>${p.batch?.i ? ` <span class="mono">:${+p.batch.i | 0}</span> (piece ${(+p.batch.i | 0) + 1} of ${+p.batch.of | 0} in it)` : p.batch ? ` (piece 1 of ${+p.batch.of | 0} in it)` : ''} + block <span class="mono">${p.seedBlock}</span>` : `free claim + block <span class="mono">${p.seedBlock}</span>`) : (p.dev ? 'test piece' : '')],
      ['Drawn', p.drawStart ? esc(clock(p.drawStart)) : 'not yet'],
      ['Draw time', secs ? `${mmss(secs)} · ${p.frames} frames` : ''],
      ['Heartbeat', hb ? `<span class="mono">${ppm(hb.ppm)}</span> · ${hb.intervals.toLocaleString()} clock ticks, ${hb.reports} readings` : 'not measured'],
      ['Check', p.match ? 'Every tile matched the reference build' : ''],
      ['Collector', `<span class="mono">${esc(p.short)}</span>`],
      ['On chain', p.mint?.assetId ? `<a class="mono" href="${ex('address', p.mint.assetId)}" target="_blank" rel="noopener">${short(p.mint.assetId)}</a>` : esc(p.status)],
      ['ROM', `<span class="mono">${(r.romSha256 || '').slice(0, 16)}…</span>`],
    ].filter(([, v]) => v).map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
    $('shActs').innerHTML = `<button type="button" data-sreplay="${p.n}">Replay the draw</button>${p.hires ? `<a href="${esc(p.hires)}" download="slow-horizons-${p.n}.png">Download (1920×1728)</a>` : ''}<button type="button" data-banner="${p.n}" data-seed="${p.seed}" data-special="${p.special || 0}">Download banner (1728×576)</button><button type="button" data-copy="${p.n}">Copy link</button>`;
    if (!sheet.open) sheet.showModal();
    if (location.hash !== '#piece-' + p.n && $('galleryView').hidden) history.replaceState(null, '', '#piece-' + p.n);
  }
  async function sheetReplay(n) {
    const r = await fetch(`${API}/pieces/${n}.replay.json`).then(r => r.json()).catch(() => null);
    if (!r?.phases?.length) return toast('No replay stored for this piece.');
    const c = $('shScreen'), g = c.getContext('2d');
    const draw = (b64, colors) => { const px = decode(b64), img = g.createImageData(160, 144), pal = colors.map(rgb); for (let i = 0; i < px.length; i++) { const k = pal[px[i]]; img.data.set([k[0], k[1], k[2], 255], i * 4); } g.putImageData(img, 0, 0); };
    g.fillStyle = LCD[0]; g.fillRect(0, 0, 160, 144);
    const total = r.phases[r.phases.length - 1].t || 1;
    let prev = 0;
    for (const ph of r.phases) { await new Promise(res => setTimeout(res, Math.max(250, (ph.t - prev) / total * 8000))); prev = ph.t; if (!sheet.open) return; draw(ph.tiles, LCD); }
    const art = labArt({ seed: r.seed, special: r.special || 0 }); await new Promise(res => setTimeout(res, 600)); if (sheet.open) paintTo(c, art, art.colors);
  }
  document.addEventListener('click', (e) => {
    const o = e.target.closest('[data-open]'); if (o) { openPiece(+o.dataset.open); return; }
    const sr = e.target.closest('[data-sreplay]'); if (sr) { sheetReplay(+sr.dataset.sreplay); return; }
    const cp = e.target.closest('[data-copy]');
    if (cp) { const link = location.origin + location.pathname + '#piece-' + cp.dataset.copy; navigator.clipboard?.writeText(link).then(() => toast('Link copied.'), () => toast(link)); }
  });
  $('shClose').onclick = () => sheet.close();
  sheet.addEventListener('click', (e) => { if (e.target === sheet) sheet.close(); });
  sheet.addEventListener('close', () => { if (location.hash.startsWith('#piece-')) history.replaceState(null, '', $('galleryView').hidden ? location.pathname : '#gallery'); });
  // ------------------------------------------------------------ the full gallery (#gallery)
  const G = { offset: 0, filters: {}, q: '', sort: 'new', loading: false, total: 0 };
  const LABEL = { edition: 'Edition', palette: 'Palette', time: 'Time', sky: 'Sky', terrain: 'Terrain', ground: 'Ground', weather: 'Weather', extras: 'Extra' };
  async function loadGallery(reset) {
    if (G.loading) return; G.loading = true;
    if (reset) { G.offset = 0; $('gGrid').innerHTML = ''; }
    const qs = new URLSearchParams({ offset: G.offset, limit: 24, sort: G.sort, ...G.filters, ...(G.q ? { q: G.q } : {}) });
    try {
      const r = clean(await fetch(`${API}/api/gallery?${qs}`).then(x => x.json()));
      $('gGrid').insertAdjacentHTML('beforeend', r.pieces.map(galleryCard).join(''));
      G.offset += r.pieces.length; G.total = r.total;
      $('gCount').textContent = r.total === r.all ? `${r.all} piece${r.all === 1 ? '' : 's'}` : `${r.total} of ${r.all} pieces`;
      $('gSub').textContent = `${r.all} of ${snap?.maxSupply || 2000} drawn so far, every one by the same Game Boy.`;
      $('gEmpty').hidden = r.total > 0;
      $('gMore').hidden = G.offset >= r.total;
      renderFilters(r.facets);
    } catch { toast('The gallery could not load. Retrying in a moment.'); }
    G.loading = false;
  }
  function galleryCard(p) {
    const t = p.traits;
    return `<figure class="g-piece${p.special ? ' g-one-piece' : ''}">${p.special ? '<span class="one-badge">1/1</span>' : ''}<button type="button" data-open="${p.n}" aria-label="Open No. ${p.n}${p.special ? ', a 1/1' : ''}">
      <img src="${esc(API + '/pieces/' + p.n + '.png?s=' + p.seedHex)}" alt="No. ${p.n}: ${esc(p.description || '')}" loading="lazy" width="960" height="864"></button>
      <figcaption><b>${p.title ? `No. ${p.n}: ${esc(p.title)}` : `No. ${p.n}`}</b><span>${p.special ? `1/1 · #${p.special} of 10` : `${esc(t.palette)} · ${esc(t.time)} · ${esc(t.terrain)}`}</span></figcaption></figure>`;
  }
  function renderFilters(facets) {
    $('gFilters').innerHTML = Object.keys(LABEL).map((f) => {
      const opts = Object.entries(facets[f] || {}).sort((a, b) => b[1] - a[1]);
      const cur = G.filters[f] || '';
      return `<label class="g-filter${cur ? ' on' : ''}"><span>${LABEL[f]}</span><select data-f="${f}"><option value="">All</option>${opts.map(([v, c]) => `<option value="${esc(v)}"${v === cur ? ' selected' : ''}>${esc(v)} (${+c | 0})</option>`).join('')}${cur && !facets[f]?.[cur] ? `<option value="${esc(cur)}" selected>${esc(cur)} (0)</option>` : ''}</select></label>`;
    }).join('') + (Object.keys(G.filters).length ? '<button type="button" class="g-clear" id="gClear">Clear filters</button>' : '');
    $('gFToggle').textContent = Object.keys(G.filters).length ? `Filters (${Object.keys(G.filters).length})` : 'Filters';
    const ones = facets.edition?.['1/1'] || 0, on = G.filters.edition === '1/1';
    $('gOne').textContent = `The 1/1s · ${ones} of 10 drawn`; $('gOne').setAttribute('aria-pressed', on);
  }
  $('gFilters').addEventListener('change', (e) => { const f = e.target.dataset.f; if (!f) return; if (e.target.value) G.filters[f] = e.target.value; else delete G.filters[f]; loadGallery(true); });
  $('gFilters').addEventListener('click', (e) => { if (e.target.id === 'gClear') { G.filters = {}; loadGallery(true); } });
  $('gOne').addEventListener('click', () => { if (G.filters.edition === '1/1') delete G.filters.edition; else G.filters.edition = '1/1'; loadGallery(true); });
  let gTimer = 0;
  $('gFind').addEventListener('input', (e) => { clearTimeout(gTimer); gTimer = setTimeout(() => { G.q = e.target.value.trim(); loadGallery(true); }, 250); });
  $('gSort').addEventListener('change', (e) => { G.sort = e.target.value; loadGallery(true); });
  $('gMore').addEventListener('click', () => loadGallery(false));
  $('gFToggle').addEventListener('click', () => { const t = document.querySelector('.g-tools'); const on = t.classList.toggle('open'); $('gFToggle').setAttribute('aria-expanded', on); });
  // more pieces as the end of the grid comes into view
  new IntersectionObserver(([e]) => { if (e.isIntersecting && !$('galleryView').hidden && !$('gMore').hidden) loadGallery(false); }, { rootMargin: '600px' }).observe($('gMore'));
  function showView() {
    const gal = location.hash === '#gallery';
    document.querySelector('main:not(.gview)').hidden = gal;
    $('galleryView').hidden = !gal;
    $('galleryLink').hidden = gal; $('studioLink').hidden = !gal;
    if (gal && !$('gGrid').children.length) loadGallery(true);
    if (gal) scrollTo(0, 0);
  }
  window.addEventListener('hashchange', showView);
  showView();
  $('studioLink').addEventListener('click', (e) => { e.preventDefault(); history.pushState(null, '', location.pathname); showView(); });

  const fromHash = () => { const m = location.hash.match(/^#piece-(\d+)$/); if (m) { const go = () => labRef ? openPiece(+m[1]) : setTimeout(go, 200); go(); } };
  window.addEventListener('hashchange', fromHash);
  fromHash();

  renderAll();
  if (API) connect(); else { renderAll(); }
})();

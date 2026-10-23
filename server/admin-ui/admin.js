// Slow Horizons admin page. No innerHTML with data: every value goes in through textContent (CSP: scripts from
// this origin only). Every change asks for the passkey again (step-up bound to the exact change on the server).
(() => {
  const $ = (id) => document.getElementById(id);
  const WA = window.SimpleWebAuthnBrowser;
  let csrf = null, me = null, listsDoc = null, editing = null;

  function h(tag, attrs = {}, ...kids) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') e.className = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v === true ? '' : String(v));
    }
    for (const c of kids.flat()) if (c != null && c !== false) e.append(c instanceof Node ? c : document.createTextNode(String(c)));
    return e;
  }
  const clear = (el) => { while (el.firstChild) el.firstChild.remove(); return el; };
  function toast(msg, bad = false, ms = 5000) { const t = $('toast'); t.textContent = msg; t.hidden = false; if (bad) t.dataset.bad = ''; else delete t.dataset.bad; clearTimeout(toast.t); toast.t = setTimeout(() => { t.hidden = true; }, ms); }
  const when = (ms) => new Date(ms).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  const whenUtc = (ms) => new Date(ms).toLocaleString('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) + ' UTC';
  const sol = (n) => n === 0 ? 'free' : `${n} SOL`;

  async function api(path, body) {
    const init = { credentials: 'same-origin', headers: {} };
    if (body !== undefined) { init.method = 'POST'; init.headers['content-type'] = 'application/json'; if (csrf) init.headers['x-csrf'] = csrf; init.body = JSON.stringify(body); }
    const r = await fetch('api/' + path, init);
    const j = await r.json().catch(() => ({}));
    if (r.status === 401 && path !== 'login/verify' && path !== 'action') { csrf = null; await boot(); throw new Error('Signed out. Sign in again.'); }
    if (!r.ok) throw new Error(j.error || `The server answered ${r.status}.`);
    return j;
  }
  // a change: the server returns a challenge bound to this exact action + payload, the passkey signs it
  async function change(action, payload, label) {
    const s = await api('stepup', { action, payload });
    for (const w of s.warnings || []) toast(w, false, 7000);
    let response;
    try { response = await WA.startAuthentication({ optionsJSON: s.options }); }
    catch { throw new Error('Passkey confirmation cancelled. Nothing was changed.'); }
    const out = await api('action', { action, payload, response });
    if (label) toast(label);
    return out;
  }

  // ------------------------------------------------------------ sign in
  async function boot() {
    me = await fetch('api/me', { credentials: 'same-origin' }).then(r => r.json()).catch(() => null);
    if (!me) { $('gate').hidden = false; $('gateMsg').textContent = 'The admin server did not answer.'; return; }
    $('who').textContent = me.email;
    if (me.loggedIn) { csrf = me.csrf; return showApp(); }
    $('app').hidden = true; $('logoutBtn').hidden = true; $('gate').hidden = false;
    $('setupCard').hidden = me.passkeys > 0; $('loginCard').hidden = me.passkeys === 0;
    $('showLogin').hidden = true;
    if (me.locked) gateMsg('Locked for 15 minutes after repeated failures.', true);
  }
  const gateMsg = (t, bad) => { $('gateMsg').textContent = t; if (bad) $('gateMsg').dataset.bad = ''; else delete $('gateMsg').dataset.bad; };
  $('loginBtn').onclick = async () => {
    try {
      gateMsg('Waiting for your passkey…');
      const opts = await api('login/options', {});
      const response = await WA.startAuthentication({ optionsJSON: opts });
      const r = await api('login/verify', { response });
      csrf = r.csrf; gateMsg(''); showApp();
    } catch (e) { gateMsg(e.message.includes('not allowed') || e.name === 'NotAllowedError' ? 'Cancelled.' : e.message, true); }
  };
  $('setupBtn').onclick = async () => {
    const code = $('setupCode').value.trim().toUpperCase();
    try {
      gateMsg('Checking the code…');
      const opts = await api('setup/options', { code });
      gateMsg('Create the passkey on this device…');
      const response = await WA.startRegistration({ optionsJSON: opts });
      const r = await api('setup/verify', { code, response, name: $('setupName').value.trim() });
      csrf = r.csrf; gateMsg(''); toast('Passkey created. You are signed in.'); showApp();
    } catch (e) { gateMsg(e.name === 'NotAllowedError' ? 'Cancelled.' : e.message, true); }
  };
  $('logoutBtn').onclick = async () => { try { await api('logout', {}); } catch { /* gone anyway */ } csrf = null; boot(); };

  // ------------------------------------------------------------ app
  function showApp() {
    $('gate').hidden = true; $('app').hidden = false; $('logoutBtn').hidden = false;
    refreshAll();
  }
  async function refreshAll() { await Promise.allSettled([loadStatus(), loadActivity(), loadLists(), loadRefunds(), loadSecurity()]); }
  setInterval(() => { if (csrf && !document.hidden) { loadStatus().catch(() => {}); loadActivity().catch(() => {}); } }, 15000);

  function stat(label, value, sub, lamp) {
    return h('dl', { class: 'stat' }, h('dt', {}, lamp ? h('span', { class: 'lamp', 'data-state': lamp }) : null, label), h('dd', {}, value, sub ? h('small', {}, sub) : null));
  }
  async function loadStatus() {
    const s = await api('status');
    const lane = s.lane || {};
    clear($('stats')).append(
      stat('Mint', s.mintOpen ? 'Open' : 'Closed', s.mintOpen ? `${sol(s.priceSol)} public` : (s.mintClosedReason || ''), s.mintOpen ? 'ok' : 'bad'),
      stat('Sold', `${s.sold} / ${s.maxSupply}`, `${s.reservedGrants} reserved by list buyers`),
      stat('Game Boy', lane.ready ? (lane.busy ? `Drawing No. ${lane.current}` : 'Idle, ready') : 'Offline', lane.paused ? 'Drawing paused' : `${s.faultsInARow} faults in a row`, lane.ready ? (lane.paused ? 'live' : 'ok') : 'bad'),
      stat('Line', String(s.queueLength), s.failed.length ? `${s.failed.length} failed` : 'none failed'),
      stat('Heartbeat', s.heartbeat ? `${s.heartbeat.ppm >= 0 ? '+' : ''}${s.heartbeat.ppm.toFixed(2)} ppm` : 'none', s.heartbeat ? `at ${when(s.heartbeat.at)}` : ''),
      stat('Minting wallet', s.hotBalanceSol == null ? 'unknown' : `${s.hotBalanceSol.toFixed(4)} SOL`, s.hotWallet.slice(0, 4) + '…' + s.hotWallet.slice(-4), s.hotBalanceSol != null && s.hotBalanceSol < 0.05 ? 'bad' : 'ok'),
      stat('Payment watcher', `${s.pollAgeSec} s ago`, s.network),
      stat('Refunds due', String(s.refundsDue), s.ethEnabled ? 'Ethereum checks on' : 'Ethereum checks off'),
      ...(s.oneOfOne ? [stat('1/1s assigned', `${s.oneOfOne.assigned} / ${s.oneOfOne.total}`, s.oneOfOne.remaining.length ? `left: #${s.oneOfOne.remaining.map(x => x.id).join(', #')}` : 'all ten handed out')] : []),
    );
    showOneOfOnes(s);
    clear($('mintActs')).append(
      s.closed ? h('button', { class: 'btn btn-main', type: 'button', onclick: () => run('mint.open', {}, 'Mint opened.') }, 'Open the mint')
        : h('button', { class: 'btn btn-quiet btn-danger', type: 'button', onclick: () => run('mint.close', {}, 'Mint closed.') }, 'Close the mint'),
      ...(lane.paused ? [h('button', { class: 'btn btn-quiet', type: 'button', onclick: () => run('lane.resume', {}, 'Drawing resumed.') }, 'Resume drawing')] : []),   // DOM append(null) prints "null"
    );
    clear($('queue')).append(...s.queueHead.map(p => h('tr', {}, h('td', { class: 'mono' }, p.n), h('td', { class: 'mono' }, p.short), h('td', {}, p.status, p.lastFault ? h('span', { class: 'sub' }, p.lastFault) : null), h('td', {}, p.claim ? `free · ${p.list}` : p.list || 'public'))));
    $('queueEmpty').hidden = s.queueHead.length > 0;
    clear($('alerts')).append(...(s.alerts.length ? s.alerts : [{ at: Date.now(), kind: '', text: 'No alerts since the server started.' }]).map(a => h('li', {}, h('time', {}, when(a.at)), h('span', {}, a.kind ? `${a.kind}: ` : '', a.text))));
    clear($('failed')).append(...(s.failed.length ? s.failed.map(p => h('li', {}, h('span', {}, `No. ${p.n} · ${p.short} · ${p.lastFault || 'failed'}`), h('button', { class: 'btn btn-quiet', type: 'button', onclick: () => run('piece.requeue', { n: p.n }, `No. ${p.n} is back in the line.`) }, 'Requeue'),
      h('button', { class: 'btn btn-quiet btn-danger', type: 'button', onclick: () => { if (confirm(`Cancel No. ${p.n}? It will not be drawn, a refund record is made (send the SOL by hand) and its 1/1, if any, goes back to the pool.`)) run('piece.cancel', { n: p.n }, `No. ${p.n} cancelled.`); } }, 'Cancel + refund'))) : [h('li', {}, 'None.')]));
  }
  // 1/1s: who holds what; after the mint (closed) a leftover can be drawn on the Game Boy and minted to a wallet
  let mintClosed = false;
  function showOneOfOnes(s) {
    const o = s.oneOfOne;
    if (!o) return;
    mintClosed = !!s.closed;
    $('oneNote').textContent = `1/1s assigned: ${o.assigned}/${o.total}. ` + (o.remaining.length ? `Not handed out yet: ${o.remaining.map(x => `#${x.id} ${x.title}`).join(', ')}.` : 'All ten are handed out.');
    clear($('oneHits')).append(...o.hits.map(x => h('li', {}, h('span', {}, `#${x.id} ${x.title} · No. ${x.n}`))));
    $('leftoverForm').hidden = !(s.closed && o.remaining.length);
    const sel = $('leftoverId'), keep = sel.value;
    clear(sel).append(...o.remaining.map(x => h('option', { value: String(x.id) }, `#${x.id} ${x.title}`)));
    if (o.remaining.some(x => String(x.id) === keep)) sel.value = keep;
  }
  $('leftoverForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const id = Number($('leftoverId').value), wallet = $('leftoverWallet').value.trim();
    if (!mintClosed) return toast('Close the mint first.', true);
    if (!confirm(`Draw leftover 1/1 #${id} on the Game Boy and mint it to ${wallet}? The minting wallet pays the mint fee (real SOL on mainnet). Your passkey confirms it.`)) return;
    run('oneofone.leftover', { id, wallet }, `Leftover 1/1 #${id} is in the line.`).then(() => { $('leftoverWallet').value = ''; });
  });

  async function run(action, payload, label) {
    try { await change(action, payload, label); await refreshAll(); }
    catch (e) { toast(e.message, true, 7000); }
  }

  // ------------------------------------------------------------ lists
  async function loadLists() {
    listsDoc = await api('lists');
    const usage = Object.fromEntries(listsDoc.usage.map(u => [u.id, u]));
    $('listsNote').textContent = `Public price ${listsDoc.publicPriceSol} SOL; a list can only be cheaper. ` + (listsDoc.eth ? 'Ethereum checks are on.' : 'Ethereum lists give no offers until ALCHEMY_API_KEY is set on the server.');
    $('listsEmpty').hidden = listsDoc.lists.length > 0;
    clear($('listRows')).append(...listsDoc.lists.map(l => {
      const u = usage[l.id] || {};
      const who = l.type === 'code' ? `code ${l.code}` : l.type === 'wallets' ? `${l.wallets.length} ${l.chain === 'solana' ? 'Solana' : 'Ethereum'} wallet${l.wallets.length === 1 ? '' : 's'}` : l.chain === 'solana' ? `holders of ${short(l.collection)}` : `holders of ${short(l.contract)} (${l.standard})`;
      const win = [l.start ? 'from ' + whenUtc(Date.parse(l.start)) : '', l.end ? 'until ' + whenUtc(Date.parse(l.end)) : ''].filter(Boolean).join(' ');
      return h('tr', {},
        h('td', {}, h('b', {}, l.name), h('span', { class: 'sub mono' }, l.id), h('span', { class: 'sub' }, who), h('span', { class: 'sub phone-only' }, u.unavailable ? 'needs Alchemy' : l.disabled ? 'disabled' : u.active ? 'live' : 'outside window')),
        h('td', {}, sol(l.priceSol)),
        h('td', {}, `${l.limit} per ${l.per}`, l.maxPerWallet ? h('span', { class: 'sub' }, `max ${l.maxPerWallet} per wallet`) : null, l.maxTotal ? h('span', { class: 'sub' }, `max ${l.maxTotal} total`) : null),
        h('td', {}, `${u.piecesUsed || 0}${l.maxTotal ? ' / ' + l.maxTotal : ''} pieces`, h('span', { class: 'sub' }, `${u.freeClaims || 0} free · ${u.paid || 0} paid · ${u.reservedNow || 0} reserved`)),
        h('td', {}, h('span', { class: 'pill ' + (u.unavailable ? 'bad' : u.active ? 'on' : 'off') }, u.unavailable ? 'needs Alchemy' : l.disabled ? 'disabled' : u.active ? 'live' : 'outside window'), win ? h('span', { class: 'sub' }, win) : null),
        h('td', { class: 'r' },
          h('button', { class: 'btn btn-quiet', type: 'button', onclick: () => openEditor(l) }, 'Edit'),
          h('button', { class: 'btn btn-quiet', type: 'button', onclick: () => run('lists.toggle', { id: l.id, disabled: !l.disabled }, l.disabled ? 'List enabled.' : 'List disabled.') }, l.disabled ? 'Enable' : 'Disable'),
          h('button', { class: 'btn btn-quiet btn-danger', type: 'button', onclick: () => { if (confirm(`Delete "${l.name}"? Only possible while nobody has used it.`)) run('lists.delete', { id: l.id }, 'List deleted.'); } }, 'Delete')));
    }));
    clear($('listWarnings')).append(...listsDoc.warnings.map(w => h('li', {}, w)));
  }
  const short = (a) => a ? (a.length > 16 ? a.slice(0, 8) + '…' + a.slice(-6) : a) : '';
  const F = () => $('editor').elements;
  const toLocal = (iso) => iso ? new Date(iso).toISOString().slice(0, 16) : '';
  function openEditor(l) {
    editing = l ? l.id : null;
    const f = F();
    $('edTitle').textContent = l ? `Edit ${l.name}` : 'New list';
    f.id.value = l?.id || ''; f.id.readOnly = !!l;
    f.name.value = l?.name || ''; f.chain.value = l?.chain || 'solana'; f.type.value = l?.type || 'wallets';
    f.code.value = l?.code || '';
    f.wallets.value = (l?.wallets || []).join('\n'); f.collection.value = l?.collection || ''; f.contract.value = l?.contract || ''; f.standard.value = l?.standard || 'erc721';
    f.priceSol.value = l ? String(l.priceSol) : '0'; f.limit.value = l ? String(l.limit) : '1'; f.maxTotal.value = l?.maxTotal ? String(l.maxTotal) : ''; f.maxPerWallet.value = l?.maxPerWallet ? String(l.maxPerWallet) : ''; f.per.value = l?.per || 'wallet';
    f.start.value = toLocal(l?.start); f.end.value = toLocal(l?.end); f.disabled.checked = !!l?.disabled; f.note.value = l?.note || '';
    $('edMsg').textContent = '';
    $('editor').hidden = false; shape(); f.name.focus();
    $('editor').scrollIntoView({ block: 'start' });
  }
  function shape() {
    const f = F(), type = f.type.value, chain = f.chain.value;
    for (const el of $('editor').querySelectorAll('[data-for]')) {
      const k = el.dataset.for;
      el.hidden = !(k === 'code' ? type === 'code' : k === 'wallets' ? type === 'wallets' : k === 'collection' ? type === 'collection' && chain === 'solana' : type === 'collection' && chain === 'ethereum');
    }
    // a code: Solana only, counted per wallet, and the total is required (how many pieces the code gives in all)
    const isCode = type === 'code';
    if (isCode) f.chain.value = 'solana';
    f.chain.disabled = isCode;
    for (const el of $('editor').querySelectorAll('[data-hide-code]')) el.hidden = isCode;
    $('editor').querySelector('[data-limit]').textContent = isCode ? 'Pieces per wallet' : 'Limit';
    $('editor').querySelector('[data-total]').textContent = isCode ? 'How many pieces the code gives in all' : 'Max pieces for the whole list (optional)';
    f.maxTotal.placeholder = isCode ? 'required' : 'no cap';
    if (type === 'wallets' || isCode) f.per.value = 'wallet';
    f.per.disabled = type === 'wallets' || isCode;
  }
  function listFromForm() {
    const f = F(), type = f.type.value, chain = f.chain.value;
    const l = { id: f.id.value.trim(), name: f.name.value.trim(), chain: type === 'code' ? 'solana' : chain, type, priceSol: Number(f.priceSol.value.replace(',', '.')), limit: Number(f.limit.value), per: type === 'collection' ? f.per.value : 'wallet' };
    if (type === 'code') l.code = f.code.value.trim().toUpperCase();
    else if (type === 'wallets') l.wallets = f.wallets.value.split(/[\s,;]+/).map(s => s.trim()).filter(Boolean);
    else if (chain === 'solana') l.collection = f.collection.value.trim();
    else { l.contract = f.contract.value.trim(); l.standard = f.standard.value; }
    if (f.start.value) l.start = new Date(f.start.value + ':00Z').toISOString();
    if (f.end.value) l.end = new Date(f.end.value + ':00Z').toISOString();
    if (f.maxTotal.value.trim()) l.maxTotal = Number(f.maxTotal.value.trim());
    if (type !== 'code' && f.maxPerWallet.value.trim()) l.maxPerWallet = Number(f.maxPerWallet.value.trim());
    if (f.disabled.checked) l.disabled = true;
    if (f.note.value.trim()) l.note = f.note.value.trim();
    return l;
  }
  const edMsg = (t, bad) => { $('edMsg').textContent = t; if (bad) $('edMsg').dataset.bad = ''; else delete $('edMsg').dataset.bad; };
  $('editor').addEventListener('change', (e) => { if (e.target.name === 'type' || e.target.name === 'chain') shape(); });
  $('newList').onclick = () => openEditor(null);
  $('edCancel').onclick = () => { $('editor').hidden = true; editing = null; };
  $('edCheck').onclick = async () => {
    try { const r = await api('lists/validate', { list: listFromForm() }); edMsg(r.ok ? (r.warnings.length ? 'OK, with warnings: ' + r.warnings.join(' · ') : 'Looks right.') : r.error, !r.ok); }
    catch (e) { edMsg(e.message, true); }
  };
  $('editor').addEventListener('submit', async (e) => {
    e.preventDefault();
    const list = listFromForm();
    try {
      const v = await api('lists/validate', { list });
      if (!v.ok) return edMsg(v.error, true);
      edMsg('Confirm with your passkey…');
      await change('lists.save', { list }, `Saved "${list.name}".`);
      $('editor').hidden = true; editing = null; await refreshAll();
    } catch (err) { edMsg(err.message, true); }
  });

  // ------------------------------------------------------------ check a wallet
  $('checkForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const out = clear($('checkOut'));
    out.append(h('p', { class: 'fine' }, 'Checking…'));
    try {
      const r = await api('check?addr=' + encodeURIComponent($('checkAddr').value.trim()));
      clear(out);
      if (r.linkedTo) out.append(h('p', { class: 'fine' }, `Linked to Solana wallet ${r.linkedTo}.`));
      if (!r.offers.length) out.append(h('div', { class: 'result' }, 'Not on any list.'));
      for (const o of r.offers) out.append(h('div', { class: 'result' }, h('b', {}, o.name), ` · ${o.price ? (o.price / 1e9) + ' SOL' : 'free'} · ${o.remaining} left`, o.units?.length ? h('span', { class: 'sub mono' }, `${o.units.length} unit(s)`) : null));
      for (const u of r.unavailable) out.append(h('div', { class: 'result' }, h('b', {}, u.name), ` · could not check${u.reason ? ': ' + u.reason : ' right now'}`));
    } catch (err) { clear(out).append(h('p', { class: 'msg', 'data-bad': '' }, err.message)); }
  });

  // ------------------------------------------------------------ activity
  const KIND = { view: 'Visit', connect: 'Wallet connected', disconnect: 'Wallet disconnected', eligibility: 'Eligibility check', eth_link: 'Ethereum link', ticket: 'Payment prepared', sent: 'Payment sent', claim: 'Free claim', step: 'Page step', error: 'Server error', page_error: 'Page error' };
  const lam = (n) => (n / 1e9).toFixed(4).replace(/\.?0+$/, '') || '0';
  function who(e) { return e.wallet || e.address || e.sol || (e.vid ? 'visitor ' + e.vid.slice(0, 6) : ''); }
  function details(e) {
    const d = [];
    if (e.kind === 'connect' || e.kind === 'disconnect') d.push(`${e.chain === 'eth' ? 'Ethereum' : 'Solana'} · ${e.app || 'unknown app'}${e.device ? ' · ' + e.device : ''}`);
    if (e.kind === 'view') d.push([e.device, e.ref ? 'from ' + e.ref : 'direct'].filter(Boolean).join(' · '));
    if (e.kind === 'eligibility') d.push(e.lists?.length ? 'eligible: ' + e.lists.join(', ') : 'no list');
    if (e.kind === 'eth_link') d.push(`${e.eth} · ${e.linked ? 'linked' : 'not linked'}${e.lists?.length ? ' · ' + e.lists.map(l => `${l.list} (${l.remaining ?? '?'} left)`).join(', ') : ' · no eligible NFTs'}`);
    if (e.kind === 'ticket' || e.kind === 'sent') d.push(`${e.qty || 1} piece${(e.qty || 1) > 1 ? 's' : ''}${e.list ? ' · list ' + e.list : ' · public'}${e.lamports != null ? ' · ' + lam(e.lamports) + ' SOL' : ''}${e.signature ? ' · ' + e.signature.slice(0, 12) + '…' : ''}`);
    if (e.kind === 'claim') d.push(`list ${e.list} · No. ${e.n}`);
    if (e.kind === 'step') d.push(e.step || '');
    if (e.kind === 'error' || e.kind === 'page_error') d.push(`${e.path || e.step || ''} ${e.status ? '(' + e.status + ')' : ''} ${e.msg || ''}`.trim());
    return d.join(' ');
  }
  async function loadActivity() {
    const qs = new URLSearchParams({ kind: $('actKind').value, q: $('actQ').value.trim() });
    const a = await api('activity?' + qs);
    const s = a.summary;
    const paidPieces = a.collectors.reduce((x, c) => x + c.pieces, 0), solIn = a.collectors.reduce((x, c) => x + c.lamports, 0);
    clear($('actStats')).append(
      stat('Visitors', String(s.visitors), `${s.views} visits`),
      stat('Solana wallets connected', String(s.solWallets), Object.entries(s.devices || {}).map(([k, v]) => `${v} ${k}`).join(' · ') || ''),
      stat('Ethereum wallets connected', String(s.ethWallets), `${s.linkedEth} linked to ${s.linkedSol} Solana wallets`),
      stat('Eligibility checks', String(s.checked), `${s.eligible} wallets eligible for a list`),
      stat('Prepared a payment', String(s.ticketWallets), `${s.sentWallets} wallets sent one`),
      stat('Collectors', String(a.collectors.length), `${paidPieces} pieces · ${lam(solIn)} SOL`),
      stat('Holder list uses', String(a.holders.length), `${a.holders.filter(h => h.kind === 'claim').length} free claims · ${new Set(a.holders.map(h => h.wallet)).size} wallets`),
      stat('Errors', `${s.counts.error || 0} server · ${s.counts.page_error || 0} page`, s.since ? `since ${when(Date.parse(s.since))}` : 'nothing recorded yet'),
    );
    const apps = Object.entries(s.apps || {});
    $('actApps').textContent = apps.length ? apps.map(([k, v]) => `${k}: ${v}`).join(' · ') : 'No wallet connects yet.';
    $('actCollectorsEmpty').hidden = a.collectors.length > 0;
    clear($('actCollectors')).append(...a.collectors.map(c => h('tr', {}, h('td', { class: 'mono' }, c.wallet), h('td', {}, c.pieces), h('td', {}, c.minted), h('td', {}, lam(c.lamports)),
      h('td', {}, Object.entries(c.lists).map(([l, n]) => `${l} ×${n}`).join(', ') || 'public'), h('td', {}, c.oneOfOnes.length ? c.oneOfOnes.map(x => '#' + x).join(' ') : ''), h('td', {}, c.last ? when(c.last) : ''))));
    $('actHoldersEmpty').hidden = a.holders.length > 0;
    clear($('actHolders')).append(...a.holders.map(u => h('tr', {}, h('td', {}, u.at ? when(u.at) : ''), h('td', {}, u.listName), h('td', {}, u.kind === 'claim' ? 'free claim' : `paid ${lam(u.lamports || 0)} SOL`),
      h('td', { class: 'mono' }, u.wallet), h('td', { class: 'mono' }, u.eth || ''), h('td', { class: 'mono' }, u.nft ? u.nft.split(':').pop() : ''))));
    $('actLinksEmpty').hidden = a.links.length > 0;
    clear($('actLinks')).append(...a.links.map(l => h('tr', {}, h('td', {}, when(l.at)), h('td', { class: 'mono' }, l.eth), h('td', { class: 'mono' }, l.sol))));
    clear($('actErrors')).append(...(s.errors.length ? s.errors.map(x => h('li', {}, h('span', {}, `${x.n}× ${x.msg}`))) : [h('li', {}, 'None.')]));
    $('actFeedEmpty').hidden = a.recent.length > 0;
    clear($('actFeed')).append(...a.recent.map(e => h('tr', {}, h('td', {}, when(Date.parse(e.at))), h('td', {}, KIND[e.kind] || e.kind, e.src === 'page' ? h('span', { class: 'sub' }, 'page') : null), h('td', { class: 'mono' }, who(e)), h('td', {}, details(e)))));
  }
  $('actFilter').addEventListener('submit', (e) => { e.preventDefault(); loadActivity().catch(err => toast(err.message, true)); });
  $('actKind').addEventListener('change', () => loadActivity().catch(err => toast(err.message, true)));
  $('actDownload').addEventListener('click', async () => {
    try {
      const r = await fetch('api/activity/raw', { credentials: 'same-origin' });
      if (!r.ok) throw new Error(`The server answered ${r.status}.`);
      const url = URL.createObjectURL(await r.blob()), link = h('a', { href: url, download: `slow-horizons-activity-${new Date().toISOString().slice(0, 10)}.jsonl` });
      document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (err) { toast(err.message, true); }
  });

  // ------------------------------------------------------------ refunds
  async function loadRefunds() {
    const { refunds } = await api('refunds');
    $('refundsEmpty').hidden = refunds.length > 0;
    clear($('refunds')).append(...refunds.map(r => {
      const sig = h('input', { 'aria-label': `Refund ${r.id} transaction signature`, placeholder: 'refund tx signature', spellcheck: 'false', maxlength: '90' });
      return h('tr', {}, h('td', { class: 'mono' }, r.id), h('td', { class: 'mono' }, short(r.wallet)), h('td', {}, (r.lamports / 1e9).toFixed(4)), h('td', {}, r.reason),
        h('td', {}, r.status === 'refunded' ? h('span', { class: 'pill on' }, 'refunded') : h('span', { class: 'row' }, sig, h('button', { class: 'btn btn-quiet', type: 'button', onclick: () => run('refund.mark', { id: r.id, signature: sig.value.trim() }, `Refund ${r.id} marked.`) }, 'Mark refunded'))));
    }));
  }

  // ------------------------------------------------------------ security
  async function loadSecurity() {
    const [{ passkeys }, { entries }] = await Promise.all([api('passkeys'), api('audit')]);
    clear($('passkeys')).append(...passkeys.map(k => h('li', {}, h('span', {}, h('b', {}, k.name), ` · ${k.email} · added ${when(Date.parse(k.createdAt))}${k.lastUsedAt ? ' · used ' + when(Date.parse(k.lastUsedAt)) : ''}${k.current ? ' · this session' : ''}`),
      passkeys.length > 1 ? h('button', { class: 'btn btn-quiet btn-danger', type: 'button', onclick: () => { if (confirm(`Remove passkey "${k.name}"?`)) run('passkey.remove', { id: k.id }, 'Passkey removed.'); } }, 'Remove') : null)));
    clear($('audit')).append(...(entries.length ? entries : [{ at: new Date().toISOString(), action: 'nothing yet', ok: true }]).map(e => h('li', {}, h('time', {}, when(Date.parse(e.at))), h('span', {}, `${e.ok ? '' : 'FAILED '}${e.action}${e.email ? ' · ' + e.email : ''}${e.ip ? ' · ' + e.ip : ''}`))));
  }
  $('addKey').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const name = $('keyName').value.trim() || 'passkey';
      const r = await change('passkey.add', { name });
      const response = await WA.startRegistration({ optionsJSON: r.register });
      await api('passkey/verify', { response });
      toast('Passkey added.'); $('keyName').value = ''; loadSecurity();
    } catch (err) { toast(err.name === 'NotAllowedError' ? 'Cancelled.' : err.message, true); }
  });

  boot();
})();

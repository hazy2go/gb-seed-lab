// The full gallery: every drawn piece, filtered by traits, searched by number or wallet, sorted, paged, with trait
// counts for the filter menus. Shared by the server (/api/gallery) and the local demo.
export const FACETS = ['edition', 'palette', 'time', 'sky', 'terrain', 'ground', 'weather', 'extras'];
const edition = (p) => p.special ? '1/1' : 'Open';   // the ten one-of-ones vs the open edition
export function gallery(pieces, params, pub) {
  const done = pieces.filter((p) => p.drawEnd && !p.dev && p.traits);
  const want = {};
  for (const f of FACETS) { const v = params.get(f); if (v) want[f] = String(v).slice(0, 40); }
  const q = (params.get('q') || '').trim().toLowerCase().replace(/^no\.?\s*/, '').slice(0, 60);
  const has = (p, f, v) => f === 'edition' ? edition(p) === v : f === 'extras' ? (p.traits.extras || []).includes(v) : String(p.traits[f]) === v;
  const match = (p, skip) => Object.entries(want).every(([f, v]) => f === skip || has(p, f, v)) && (!q || String(p.n) === q || p.wallet.toLowerCase().includes(q));
  const list = done.filter((p) => match(p)).sort((a, b) => params.get('sort') === 'old' ? a.n - b.n : b.n - a.n);
  // counts per value, each facet counted with the other facets' filters applied (so every option shows what it would give)
  const facets = {};
  for (const f of FACETS) {
    const c = {};
    for (const p of done) if (match(p, f)) for (const v of f === 'edition' ? [edition(p)] : f === 'extras' ? (p.traits.extras || []) : [String(p.traits[f])]) c[v] = (c[v] || 0) + 1;
    facets[f] = c;
  }
  const limit = Math.min(60, Math.max(1, +params.get('limit') || 24)), offset = Math.max(0, +params.get('offset') || 0);
  return { total: list.length, all: done.length, offset, limit, pieces: list.slice(offset, offset + limit).map(pub), facets };
}

// GET /api/ping -> whether the shared module loads (diagnostic; no secrets returned)
export default async function handler(req, res) {
  res.setHeader('content-type', 'application/json');
  try { const m = await import('../api-lib/sol.js'); res.end(JSON.stringify({ ok: true, configured: m.configured(), node: process.version })); }
  catch (e) { res.statusCode = 500; res.end(JSON.stringify({ ok: false, error: String(e && e.message || e).slice(0, 400), node: process.version })); }
}

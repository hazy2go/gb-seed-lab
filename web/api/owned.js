// GET /api/owned?wallet=ADDRESS -> { ids: [asset ids of Slow Horizons this wallet holds now] }
import { configured, isAddr, owned, reply } from '../api-lib/sol.js';
export default async function handler(req, res) {
  if (!configured()) return reply(res, 503, { error: 'not configured' });
  const w = new URL(req.url, 'http://x').searchParams.get('wallet');
  if (!isAddr(w)) return reply(res, 400, { error: 'That is not a Solana address.' });
  try { res.setHeader('cache-control', 'public, max-age=15'); return reply(res, 200, { ids: await owned(w) }); }
  catch (e) { return reply(res, 502, { error: 'Could not look up the wallet right now.' }); }
}

// POST /api/transfer { assetId, owner, to } -> { tx } (unsigned, the holder's wallet signs it)
import { configured, isAddr, buildTransfer, readJson, reply } from '../api-lib/sol.js';
export default async function handler(req, res) {
  if (req.method !== 'POST') return reply(res, 405, { error: 'POST only' });
  if (!configured()) return reply(res, 503, { error: 'Sending is not set up yet.' });
  let b; try { b = await readJson(req); } catch { return reply(res, 400, { error: 'Bad request.' }); }
  const { assetId, owner, to } = b;
  if (![assetId, owner, to].every(isAddr)) return reply(res, 400, { error: 'That is not a Solana address.' });
  if (owner === to) return reply(res, 400, { error: 'That is the wallet that already holds it.' });
  try { return reply(res, 200, { tx: await buildTransfer(assetId, owner, to) }); }
  catch (e) { return reply(res, 400, { error: 'The transfer could not be prepared: ' + String(e.message || e).slice(0, 160) }); }
}

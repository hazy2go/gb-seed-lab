// POST /api/send { assetId, owner, to, tx } -> { signature }. Rebuilds the expected transfer and only sends a signed
// transaction that carries exactly it, signed by the holder.
import { configured, isAddr, buildTransferIx, checkSigned, send, readJson, reply } from '../api-lib/sol.js';
export default async function handler(req, res) {
  if (req.method !== 'POST') return reply(res, 405, { error: 'POST only' });
  if (!configured()) return reply(res, 503, { error: 'Sending is not set up yet.' });
  let b; try { b = await readJson(req); } catch { return reply(res, 400, { error: 'Bad request.' }); }
  const { assetId, owner, to, tx } = b;
  if (![assetId, owner, to].every(isAddr) || typeof tx !== 'string' || tx.length > 4000) return reply(res, 400, { error: 'Bad request.' });
  const raw = Buffer.from(tx, 'base64');
  try {
    const ix = await buildTransferIx(assetId, owner, to);
    let bad; try { bad = checkSigned(raw, ix, owner); } catch { bad = 'unreadable transaction'; }
    if (bad) return reply(res, 400, { error: `That transaction is not the transfer we prepared (${bad}). Nothing was sent.` });
    return reply(res, 202, { signature: await send(raw) });
  } catch (e) { return reply(res, 400, { error: 'The network rejected the transfer: ' + String(e.message || e).split('\n')[0].slice(0, 200) }); }
}

// A local stand-in for a Solana JSON-RPC (+ Helius DAS searchAssets), devnet genesis, for the end-to-end test.
// Payments are added by the test (addPayment) or arrive through sendTransaction (decoded and booked as finalized).
import http from 'node:http';
import { Transaction } from '@solana/web3.js';

const DEVNET = 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG';
const MEMO = 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr', SYSTEM = '11111111111111111111111111111111';
const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const b58 = (buf) => { let n = BigInt('0x' + (Buffer.from(buf).toString('hex') || '0')), s = ''; while (n > 0n) { s = B58[Number(n % 58n)] + s; n /= 58n; } for (const x of buf) { if (x) break; s = '1' + s; } return s; };
const fakeSig = () => b58(Buffer.from(Array.from({ length: 64 }, () => Math.floor(Math.random() * 256))));

export async function startFakeRpc({ treasury }) {
  const t0 = Date.now();
  const slot = () => 400_000_000 + Math.floor((Date.now() - t0) / 40);   // 25 slots per second
  const txs = new Map(), order = [];   // signature -> parsed tx; order newest last
  const assets = {};                   // owner -> [{ id, collection }]
  const calls = [];
  function addPayment({ from, lamports, memo, signature = fakeSig(), err = null }) {
    const s = slot();
    txs.set(signature, { from, lamports, memo, slot: s, blockTime: Math.floor(Date.now() / 1000), err });
    order.push(signature);
    return signature;
  }
  function parsed(sig) {
    const t = txs.get(sig);
    if (!t) return null;
    return {
      slot: t.slot, blockTime: t.blockTime, version: 'legacy',
      meta: { err: t.err, fee: 5000, innerInstructions: [], logMessages: [`Program log: Memo (len ${t.memo.length}): "${t.memo}"`], preBalances: [1e10, 0, 1, 1], postBalances: [1e10 - t.lamports - 5000, t.lamports, 1, 1], preTokenBalances: [], postTokenBalances: [], status: t.err ? { Err: t.err } : { Ok: null } },
      transaction: {
        signatures: [sig],
        message: {
          accountKeys: [{ pubkey: t.from, signer: true, writable: true, source: 'transaction' }, { pubkey: treasury, signer: false, writable: true, source: 'transaction' }, { pubkey: SYSTEM, signer: false, writable: false, source: 'transaction' }, { pubkey: MEMO, signer: false, writable: false, source: 'transaction' }],
          instructions: [
            { program: 'system', programId: SYSTEM, parsed: { type: 'transfer', info: { source: t.from, destination: treasury, lamports: t.lamports } }, stackHeight: null },
            { program: 'spl-memo', programId: MEMO, parsed: t.memo, stackHeight: null },
          ],
          recentBlockhash: 'GHtXQBsoZHVnNFa9YevAzFr17DJjgHXk3ycTKD5xD3Zi',
        },
      },
    };
  }
  const blockhashOf = (n) => b58(Buffer.from(require32(n)));
  function require32(n) { const b = Buffer.alloc(32); b.writeUInt32BE(n >>> 0, 0); b.write('slowhorizons-test', 4); return b; }

  function answer(method, params) {
    calls.push(method);
    switch (method) {
      case 'getGenesisHash': return DEVNET;
      case 'getSlot': return slot();
      case 'getBlockHeight': return slot() - 1000;
      case 'getBalance': return { context: { slot: slot() }, value: 2e9 };
      case 'getLatestBlockhash': return { context: { slot: slot() }, value: { blockhash: blockhashOf(slot()), lastValidBlockHeight: slot() + 150 } };
      case 'getSignaturesForAddress': {
        const [, opts = {}] = params;
        let list = order.slice().reverse();
        if (opts.until) { const i = list.indexOf(opts.until); if (i >= 0) list = list.slice(0, i); }
        if (opts.before) { const i = list.indexOf(opts.before); list = i >= 0 ? list.slice(i + 1) : list; }
        return list.slice(0, opts.limit || 1000).map(s => { const t = txs.get(s); return { signature: s, slot: t.slot, err: t.err, memo: `[${t.memo.length}] ${t.memo}`, blockTime: t.blockTime, confirmationStatus: 'finalized' }; });
      }
      case 'getTransaction': return parsed(params[0]);
      case 'getBlocks': { const [a] = params; return [a, a + 1]; }
      case 'getBlock': { const [n] = params; return { blockhash: blockhashOf(n), previousBlockhash: blockhashOf(n - 1), parentSlot: n - 1, blockTime: Math.floor(Date.now() / 1000), blockHeight: n - 1000 }; }
      case 'sendTransaction': {
        const tx = Transaction.from(Buffer.from(params[0], 'base64'));
        const sig = b58(tx.signature);
        const [t, m] = tx.instructions.filter(i => i.programId.toBase58() !== 'ComputeBudget111111111111111111111111111111');
        addPayment({ from: t.keys[0].pubkey.toBase58(), lamports: Number(t.data.readBigUInt64LE(4)), memo: m.data.toString('utf8'), signature: sig });
        return sig;
      }
      case 'searchAssets': {
        const p = params, owner = p.ownerAddress;
        const items = (assets[owner] || []).filter(a => p.grouping ? a.collection === p.grouping[1] : false)
          .map(a => ({ id: a.id, burnt: false, ownership: { owner }, grouping: [{ group_key: 'collection', group_value: a.collection }] }));
        return { total: items.length, limit: p.limit, page: p.page, items };
      }
      default: throw Object.assign(new Error('method not faked: ' + method), { code: -32601 });
    }
  }
  const server = http.createServer((req, res) => {
    let d = '';
    req.on('data', c => { d += c; });
    req.on('end', () => {
      const one = (r) => { try { return { jsonrpc: '2.0', id: r.id, result: answer(r.method, r.params || []) }; } catch (e) { return { jsonrpc: '2.0', id: r.id, error: { code: e.code || -32000, message: e.message } }; } };
      const body = JSON.parse(d);
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(Array.isArray(body) ? body.map(one) : one(body)));
    });
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  return { url: `http://127.0.0.1:${server.address().port}`, addPayment, assets, calls, blockhashOf, close: () => server.close(), txs };
}

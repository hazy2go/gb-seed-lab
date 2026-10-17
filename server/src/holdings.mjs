// Who holds what: Solana through Helius DAS (searchAssets on the server's RPC_URL), Ethereum through the Alchemy NFT
// API. Ported from nftroles (apps/bot/src/nft-providers.ts, apps/web/src/lib/eth-nft.ts) to plain ESM.
// Fails closed: any HTTP error, RPC error, timeout or odd answer throws, and the caller gives no offer for that list.
// Only fixed hosts are called (RPC_URL from .env, eth-mainnet.g.alchemy.com); user input goes into JSON bodies and
// URLSearchParams after strict address validation, never into a hostname or path.
import { B58_RE, isSolAddress, isEthAddress } from './lists.mjs';

const PAGE_DAS = 1000, MAX_PAGES_DAS = 5, PAGE_ALCHEMY = 100, MAX_PAGES_ALCHEMY = 20;
export const MAX_1155_BALANCE = 100;

export function createHoldings({ dasUrl, alchemyKey, fetchImpl = globalThis.fetch, timeoutMs = 8000 }) {
  async function getJson(url, init) {
    const r = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(timeoutMs), redirect: 'error' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  }

  // Solana: asset ids the owner holds in a collection (grouping) or from a verified creator. Burnt assets excluded.
  async function solana(owner, list) {
    if (!isSolAddress(owner)) throw new Error('bad owner');
    if (!dasUrl) throw new Error('no DAS RPC');
    const creator = list.collection.startsWith('creator:') ? list.collection.slice(8) : null;
    const ids = [];
    for (let page = 1; page <= MAX_PAGES_DAS; page++) {
      const params = { ownerAddress: owner, burnt: false, page, limit: PAGE_DAS };
      if (creator) { params.creatorAddress = creator; params.creatorVerified = true; }
      else params.grouping = ['collection', list.collection];
      const j = await getJson(dasUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 'sh', method: 'searchAssets', params }) });
      if (j.error) throw new Error('DAS error ' + (j.error.code ?? ''));
      const items = j.result?.items;
      if (!Array.isArray(items)) throw new Error('DAS: no items');
      for (const it of items) {
        if (typeof it?.id !== 'string' || !B58_RE.test(it.id)) continue;
        if (it.burnt === true) continue;
        if (it.ownership?.owner !== owner) continue;   // the answer must be about this owner
        if (creator) { if (!(it.creators || []).some(c => c?.address === creator && c?.verified === true)) continue; }
        else if (!(it.grouping || []).some(g => g?.group_key === 'collection' && g?.group_value === list.collection)) continue;
        ids.push(it.id);
      }
      if (items.length < PAGE_DAS) break;
      if (page === MAX_PAGES_DAS) throw new Error('DAS: too many assets');   // fail closed rather than count part of them
    }
    return [...new Set(ids)];
  }

  // Ethereum: token ids (decimal strings) and balances the owner holds in one contract.
  async function ethereum(owner, list) {
    if (!isEthAddress(owner)) throw new Error('bad owner');
    if (!alchemyKey) throw new Error('no Alchemy key');
    const out = new Map();
    let pageKey;
    for (let page = 0; page < MAX_PAGES_ALCHEMY; page++) {
      const qs = new URLSearchParams({ owner, 'contractAddresses[]': list.contract, withMetadata: 'false', pageSize: String(PAGE_ALCHEMY) });
      if (pageKey) qs.set('pageKey', pageKey);
      const j = await getJson(`https://eth-mainnet.g.alchemy.com/nft/v3/${encodeURIComponent(alchemyKey)}/getNFTsForOwner?${qs}`, { headers: { accept: 'application/json' } });
      if (!Array.isArray(j.ownedNfts)) throw new Error('Alchemy: no ownedNfts');
      for (const n of j.ownedNfts) {
        const contract = String(n.contractAddress || n.contract?.address || '').toLowerCase();
        if (contract !== list.contract) continue;
        let id, bal;
        try { id = BigInt(String(n.tokenId)); bal = BigInt(String(n.balance ?? '1')); } catch { continue; }
        if (id < 0n || bal <= 0n) continue;
        const k = id.toString();
        out.set(k, Math.min(MAX_1155_BALANCE, Number((out.get(k) ? BigInt(out.get(k)) : 0n) + bal)));
      }
      pageKey = typeof j.pageKey === 'string' && j.pageKey ? j.pageKey : null;
      if (!pageKey) break;
      if (page === MAX_PAGES_ALCHEMY - 1) throw new Error('Alchemy: too many tokens');
    }
    return [...out].map(([tokenId, balance]) => ({ tokenId, balance: list.standard === 'erc721' ? 1 : balance }));
  }

  return { solana, ethereum };
}

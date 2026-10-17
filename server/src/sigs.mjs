// Signature checks for the allowlist: Ethereum personal_sign (EOA and smart wallets) and Solana signMessage.
// Ethereum ported from nftroles apps/web/src/lib/ethereum.ts: viem verifyMessage on a mainnet client covers ERC-1271
// (deployed smart accounts) and ERC-6492 (counterfactual ones). EOAs are checked offline first, so the common case
// needs no RPC call. Only Ethereum mainnet is accepted (the link message names it).
import crypto from 'node:crypto';
import { createPublicClient, http, recoverMessageAddress } from 'viem';
import { mainnet } from 'viem/chains';
import { b58decode, isSolAddress, isEthAddress } from './lists.mjs';

export function createEthVerifier({ rpcUrl, transport } = {}) {
  const client = createPublicClient({ chain: mainnet, transport: transport || http(rpcUrl, { timeout: 10000, retryCount: 1 }) });
  return async function verifyEth(message, signature, address) {
    if (!isEthAddress(address) || typeof signature !== 'string' || !/^0x[0-9a-fA-F]{130,4000}$/.test(signature)) return false;
    try { if ((await recoverMessageAddress({ message, signature })).toLowerCase() === address.toLowerCase()) return true; } catch { /* not a plain EOA signature */ }
    try { return await client.verifyMessage({ address, message, signature }); }
    catch { return false; }   // RPC down or malformed: fail closed
  };
}

// Solana: ed25519 over the exact UTF-8 message, signature as base64 (64 bytes) from wallet signMessage.
const ED25519_SPKI = Buffer.from('302a300506032b6570032100', 'hex');
export function verifySol(message, signatureB64, wallet) {
  if (!isSolAddress(wallet) || typeof signatureB64 !== 'string' || signatureB64.length > 100) return false;
  const sig = Buffer.from(signatureB64, 'base64');
  if (sig.length !== 64) return false;
  try {
    const key = crypto.createPublicKey({ key: Buffer.concat([ED25519_SPKI, Buffer.from(b58decode(wallet))]), format: 'der', type: 'spki' });
    return crypto.verify(null, Buffer.from(message, 'utf8'), key, sig);
  } catch { return false; }
}

export function ethLinkMessage({ domain, sol, eth, nonce, expires }) {
  return [
    'Slow Horizons: link this Ethereum wallet to a Solana wallet for the holder mint.',
    '',
    `Site: ${domain}`,
    `Ethereum wallet: ${eth}`,
    `Solana wallet (receives the pieces): ${sol}`,
    `Chain: Ethereum mainnet`,
    `Nonce: ${nonce}`,
    `Expires: ${new Date(expires).toISOString()}`,
    '',
    'This is a signature only: no transaction, no fees, no approval.',
  ].join('\n');
}

export function solClaimMessage({ domain, wallet, listName, nonce, expires }) {
  return [
    'Slow Horizons: claim a free piece.',
    '',
    `Site: ${domain}`,
    `Wallet: ${wallet}`,
    `List: ${listName}`,
    `Nonce: ${nonce}`,
    `Expires: ${new Date(expires).toISOString()}`,
    '',
    'Signing is free and sends nothing.',
  ].join('\n');
}

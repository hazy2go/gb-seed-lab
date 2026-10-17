// Settings from the environment (or server/.env). Defaults are for local development on devnet.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SERVER_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const REPO_DIR = path.resolve(SERVER_DIR, '..');

const envFile = path.join(SERVER_DIR, '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
  }
}
const env = (k, d) => process.env[k] ?? d;

export const GENESIS = {
  'mainnet-beta': '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d',
  devnet: 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG',
};

// Merkle tree for the cNFTs (Hazy 2026-10-17: smallest tree that holds the 2000 supply).
// depth 11 = 2048 leaves; canopy 5 keeps proofs at 6 nodes (same as the earlier depth 14 / canopy 8 tree), rent ~0.077 SOL.
export const TREE = { maxDepth: 11, maxBufferSize: 32, canopyDepth: 5 };

export const config = {
  port: +env('PORT', 8791),
  host: env('HOST', '127.0.0.1'),                                // localhost only: the tunnel connects locally; nothing on the LAN can reach it
  publicUrl: env('PUBLIC_URL', 'http://localhost:8791'),       // where pieces and metadata are served
  siteUrl: env('SITE_URL', ''),                                  // the mint page (Vercel); defaults to PUBLIC_URL
  network: env('NETWORK', 'devnet'),                             // 'devnet' or 'mainnet-beta'; checked against the RPC's genesis hash
  rpc: env('RPC_URL', 'https://api.devnet.solana.com'),
  priceLamports: Math.round(+env('PRICE_SOL', '0.05') * 1e9),    // Hazy: 0.05 SOL
  maxSupply: +env('MAX_SUPPLY', '2000'),                          // Hazy: at most 2000, can close earlier
  treasury: env('TREASURY', ''),
  royaltyBps: +env('ROYALTY_BPS', '500'),                         // Hazy 2026-10-18: 5% creator royalty on secondary sales
  royaltyAddress: env('ROYALTY_ADDRESS', ''),                    // who receives it; empty = the treasury                                 // payments go here; the server never holds this key
  keyFile: env('KEY_FILE', path.join(SERVER_DIR, '.keys', 'authority.json')),   // hot key: pays mint fees, signs mints
  tree: env('MERKLE_TREE', ''),
  collection: env('COLLECTION', ''),
  serial: env('SERIAL_PORT', ''),                                // Pico port (auto-detected if empty)
  dev: env('DEV', '0') === '1',                                  // POST /api/dev/pay (draw without paying); never on mainnet
  mint: env('MINT', '1') === '1',                                // 0 = draw only, skip the on-chain mint
  seedDelaySlots: +env('SEED_DELAY_SLOTS', '32'),                // seed mixes in the blockhash of a block this many slots after the payment
  streamUrl: env('STREAM_URL', ''),                              // VOD link template, {t} = unix seconds of draw start
  dataDir: env('DATA_DIR', path.join(SERVER_DIR, 'data')),
  storage: env('STORAGE', 'local'),                              // 'arweave' (permanent, mainnet) or 'local' (served from /pieces/)
  cors: env('CORS_ORIGIN', '*'),                                 // set to the site's origin in production
  adminToken: env('ADMIN_TOKEN', ''),                            // /admin/* (localhost only); empty = admin API off
  alertWebhook: env('ALERT_WEBHOOK', ''),                        // Discord webhook for alerts (optional)
  serveSite: env('SERVE_SITE', '1') === '1',                     // serve web/ too (local development)
  // allowlists and holder mints (docs/MINT.md)
  listsSeed: env('LISTS_FILE', path.join(SERVER_DIR, 'lists.json')),   // copied to DATA_DIR/lists.json on the first start only
  alchemyKey: env('ALCHEMY_API_KEY', ''),                        // Ethereum holder checks; empty = Ethereum lists off (Solana lists still work)
  alchemyRpc: env('ALCHEMY_RPC', ''),                            // smart-wallet signature checks; default eth-mainnet.g.alchemy.com/v2/<key>
  // admin web page (docs/SERVER-SETUP.md "Admin page"); all empty = off. Every request must pass host, path, Access JWT, passkey session.
  adminHost: env('ADMIN_HOST', ''),                              // e.g. admin.gameboylabs.xyz (behind Cloudflare Access)
  adminPath: env('ADMIN_PATH', ''),                              // secret prefix, e.g. /k3J9...; 16-64 url-safe characters after the slash
  cfAccessTeam: env('CF_ACCESS_TEAM', ''),                       // <team>.cloudflareaccess.com
  cfAccessAud: env('CF_ACCESS_AUD', ''),                         // the Access application's AUD tag
  adminEmails: env('ADMIN_EMAILS', '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean),
};

// Refuse to start with a dangerous setup.
export function checkConfig({ setup = false } = {}) {   // setup: mainnet-setup.mjs, before the tree and collection exist
  config.siteUrl ||= config.publicUrl;
  const errs = [];
  if (!GENESIS[config.network]) errs.push(`NETWORK must be devnet or mainnet-beta, not ${config.network}`);
  if (config.network === 'mainnet-beta') {
    if (config.dev) errs.push('DEV=1 is not allowed on mainnet');
    if (!config.treasury) errs.push('TREASURY must be set on mainnet');
    if (!fs.existsSync(config.keyFile)) errs.push(`authority key ${config.keyFile} missing (it is never generated on mainnet)`);
    if (!setup && (!config.tree || !config.collection)) errs.push('MERKLE_TREE and COLLECTION must be set on mainnet');
    if (config.cors === '*') errs.push('CORS_ORIGIN must be the site origin on mainnet');
    if (!config.publicUrl.startsWith('https://')) errs.push('PUBLIC_URL must be https on mainnet');
    if (!config.siteUrl.startsWith('https://')) errs.push('SITE_URL must be https on mainnet');
    if (config.storage !== 'arweave') errs.push('STORAGE must be arweave on mainnet (the NFTs must not depend on this Mac)');
  }
  if (config.adminHost) {
    if (!/^[a-z0-9.-]{3,253}$/.test(config.adminHost)) errs.push('ADMIN_HOST must be a host name like admin.gameboylabs.xyz');
    if (!/^\/[A-Za-z0-9_-]{16,64}$/.test(config.adminPath)) errs.push('ADMIN_PATH must be / plus 16-64 random url-safe characters (openssl rand -hex 16)');
    if (!/^[a-z0-9-]{1,63}$/.test(config.cfAccessTeam)) errs.push('CF_ACCESS_TEAM must be the Zero Trust team name');
    if (!/^[a-f0-9]{64}$/.test(config.cfAccessAud)) errs.push('CF_ACCESS_AUD must be the Access application AUD tag (64 hex)');
    if (!config.adminEmails.length || config.adminEmails.some(e => !/^[^@\s]+@[^@\s]+$/.test(e))) errs.push('ADMIN_EMAILS must list the allowed emails');
    try { if (new URL(config.publicUrl).host === config.adminHost) errs.push('ADMIN_HOST must differ from the public API host'); } catch { /* PUBLIC_URL checked elsewhere */ }
  }
  if (config.alchemyRpc && !/^https:\/\/eth-mainnet\.g\.alchemy\.com\/v2\/[A-Za-z0-9_-]+$/.test(config.alchemyRpc)) errs.push('ALCHEMY_RPC must be an https://eth-mainnet.g.alchemy.com/v2/<key> URL (the link message says Ethereum mainnet)');
  if (!(config.priceLamports > 0)) errs.push('PRICE_SOL must be > 0');
  if (!(Number.isInteger(config.royaltyBps) && config.royaltyBps >= 0 && config.royaltyBps <= 1000)) errs.push('ROYALTY_BPS must be 0..1000 (0-10%)');
  if (!(config.maxSupply > 0 && config.maxSupply <= 2 ** TREE.maxDepth)) errs.push(`MAX_SUPPLY must be 1..${2 ** TREE.maxDepth} (tree size)`);
  if (errs.length) throw new Error('refusing to start:\n  ' + errs.join('\n  '));
}

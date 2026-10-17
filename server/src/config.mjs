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

export const config = {
  port: +env('PORT', 8791),
  publicUrl: env('PUBLIC_URL', 'http://localhost:8791'),       // where pieces and metadata are served
  network: env('NETWORK', 'devnet'),                             // 'devnet' or 'mainnet-beta'; checked against the RPC's genesis hash
  rpc: env('RPC_URL', 'https://api.devnet.solana.com'),
  priceLamports: Math.round(+env('PRICE_SOL', '0.05') * 1e9),    // Hazy: 0.05 SOL
  maxSupply: +env('MAX_SUPPLY', '2000'),                          // Hazy: at most 2000, can close earlier
  treasury: env('TREASURY', ''),                                 // payments go here; the server never holds this key
  keyFile: env('KEY_FILE', path.join(SERVER_DIR, '.keys', 'authority.json')),   // hot key: pays mint fees, signs mints
  tree: env('MERKLE_TREE', ''),
  collection: env('COLLECTION', ''),
  serial: env('SERIAL_PORT', ''),                                // Pico port (auto-detected if empty)
  dev: env('DEV', '0') === '1',                                  // POST /api/dev/pay (draw without paying); never on mainnet
  mint: env('MINT', '1') === '1',                                // 0 = draw only, skip the on-chain mint
  seedDelaySlots: +env('SEED_DELAY_SLOTS', '32'),                // seed mixes in the blockhash of a block this many slots after the payment
  streamUrl: env('STREAM_URL', ''),                              // VOD link template, {t} = unix seconds of draw start
  dataDir: env('DATA_DIR', path.join(SERVER_DIR, 'data')),
  cors: env('CORS_ORIGIN', '*'),                                 // set to the site's origin in production
  adminToken: env('ADMIN_TOKEN', ''),                            // /admin/* (localhost only); empty = admin API off
  alertWebhook: env('ALERT_WEBHOOK', ''),                        // Discord webhook for alerts (optional)
  serveSite: env('SERVE_SITE', '1') === '1',                     // serve web/ too (local development)
};

// Refuse to start with a dangerous setup.
export function checkConfig() {
  const errs = [];
  if (!GENESIS[config.network]) errs.push(`NETWORK must be devnet or mainnet-beta, not ${config.network}`);
  if (config.network === 'mainnet-beta') {
    if (config.dev) errs.push('DEV=1 is not allowed on mainnet');
    if (!config.treasury) errs.push('TREASURY must be set on mainnet');
    if (!fs.existsSync(config.keyFile)) errs.push(`authority key ${config.keyFile} missing (it is never generated on mainnet)`);
    if (!config.tree || !config.collection) errs.push('MERKLE_TREE and COLLECTION must be set on mainnet');
    if (config.cors === '*') errs.push('CORS_ORIGIN must be the site origin on mainnet');
    if (!config.publicUrl.startsWith('https://')) errs.push('PUBLIC_URL must be https on mainnet');
  }
  if (!(config.priceLamports > 0)) errs.push('PRICE_SOL must be > 0');
  if (!(config.maxSupply > 0 && config.maxSupply <= 16384)) errs.push('MAX_SUPPLY must be 1..16384 (tree size)');
  if (errs.length) throw new Error('refusing to start:\n  ' + errs.join('\n  '));
}

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

export const config = {
  port: +env('PORT', 8787),
  publicUrl: env('PUBLIC_URL', 'http://localhost:8787'),       // where pieces and metadata are served
  network: env('NETWORK', 'devnet'),                             // devnet only until Hazy says otherwise
  rpc: env('RPC_URL', 'https://api.devnet.solana.com'),
  priceLamports: Math.round(+env('PRICE_SOL', '0.03') * 1e9),    // placeholder; Hazy sets the real price
  treasury: env('TREASURY', ''),                                 // defaults to the authority key's address
  keyFile: env('KEY_FILE', path.join(SERVER_DIR, '.keys', 'authority.json')),
  tree: env('MERKLE_TREE', ''),
  collection: env('COLLECTION', ''),
  lane: env('LANE', 'emulator'),                                 // emulator | hardware
  speed: +env('EMU_SPEED', '1'),                                 // emulator lane: 1 = real Game Boy time
  serial: env('SERIAL_PORT', ''),                                // hardware lane: Pico port (auto-detected if empty)
  dev: env('DEV', '1') === '1',                                  // enables POST /api/dev/pay (no payment)
  mint: env('MINT', '1') === '1',                                // 0 = draw only, skip the on-chain mint
  streamUrl: env('STREAM_URL', ''),                              // VOD link template, {t} = unix seconds of draw start
  dataDir: env('DATA_DIR', path.join(SERVER_DIR, 'data')),
  cors: env('CORS_ORIGIN', '*'),
};
if (config.network === 'mainnet-beta' && config.dev) throw new Error('DEV=1 is not allowed on mainnet');

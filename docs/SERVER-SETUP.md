# Server setup: the Mac mini (instructions for an agent)

You are setting up and running the **Slow Horizons** mint server on Hazy's Mac mini: a real Game Boy draws one
landscape per payment, the server checks every pixel, stores the files on Arweave and mints a compressed NFT on
Solana to the buyer. Read this whole file before doing anything, then `CLAUDE.md`, `docs/MINT.md` and the newest
entries of `docs/LOGBOOK.md`.

## Rules (from Hazy, the owner)

- **Never spend money, buy anything or run anything that spends mainnet SOL without Hazy's explicit go in chat.**
  That includes `scripts/mainnet-setup.mjs CONFIRM=yes`, funding wallets and paid RPC plans.
- **Never put the treasury key or the cold wallet key on this machine.** The only key here is the hot minting key
  (`server/.keys/authority.json`) and the Arweave upload key (`server/.keys/arweave.json`, holds nothing).
- Never cut or modify the MGB-004 adapter or the spare DMG-04 link cable.
- No emulator stand-in. If the Game Boy is down, the mint is down (the page says so and refuses payments).
- The repo is private and all rights reserved until the mint ends: don't publish code, the ROM or art.
- Log every decision, check and result in `docs/LOGBOOK.md` (dated heading, short why). Mark guesses "(verify)".
- Hazy reads on Discord: short, plain replies, no long dashes.
- Commits end with the attribution lines your harness gives you.

## How it fits together

```
buyer's wallet --pays--> treasury 5Uav… (Hazy's key, never here)
                              |
            (server watches the treasury, finalized only)
                              v
 site (Vercel, https://www.gameboylabs.xyz/slow-horizons) <--HTTPS/WebSocket--> api.gameboylabs.xyz (Cloudflare Tunnel) --> Mac mini :8791
                                                                         |
                                       server/src/index.mjs  --USB serial-->  Pico 2 W (gb-link-usb firmware, bridge mode 2)
                                                                                    |  link cable (DMG-04, cut)
                                                                               Game Boy (DMG) + EverDrive running slowhorizons.gb
```

Per piece: payment seen -> seed (sha256 of the payment signature and the blockhash of a block 32 slots later) ->
queued -> the Game Boy draws (~60 s, every screen update streamed live) -> tiles compared with the reference
build (`web/gen.wasm`) -> PNGs, replay and metadata written -> uploaded to Arweave -> minted (Bubblegum V2 cNFT into
the Core collection) -> buyer's wallet. All state survives a crash or restart (see "Crash and restart").

## 1. Software

```sh
xcode-select --install                      # git, compilers
brew install node gh                         # Node 20 or newer (tested on 25.9)
gh auth login                                # Hazy's GitHub account; the repo is private
mkdir -p ~/Projects/gameboy && cd ~/Projects/gameboy
gh repo clone hazy2go/gb-seed-lab
gh repo clone hazy2go/gb-link-usb            # Pico firmware
cd gb-seed-lab/server && npm ci
```

Prebuilt files the server needs are in the repo: `web/gen.wasm` (reference build) and `gb/seedlab.gb` (the ROM;
its sha256 goes into every piece's metadata). Don't rebuild them unless Hazy asks; if you do, the golden hashes,
WASM parity and ROM parity tests must pass (CLAUDE.md).

Keep the Mac awake: System Settings > Energy: "Prevent automatic sleeping when the display is off" on, "Start up
automatically after a power failure" on. Ask Hazy before changing system settings. The launchd job also runs the
server under `caffeinate`.

## 2. The Game Boy connection (what the server needs to detect it)

### Hardware

- **Game Boy (DMG)** with the **EverDrive** cart. The EverDrive's SD card holds `slowhorizons.gb`, a copy of
  `gb/seedlab.gb` from this repo. **It must be the same file**: compare `shasum -a 256 gb/seedlab.gb` with the copy
  on the SD card. A different ROM draws different pixels and every piece fails the check.
- **Raspberry Pi Pico 2 W** running the gb-link-usb firmware (below), on a **data** USB cable to the Mac (some
  cables only charge: then no serial port appears).
- **Link cable:** a cut DMG-04. Wires to the Pico (breadboard, direct, no level shifter):
  - green = SCK (link pin 5) -> **GP0**
  - red = SOUT (link pin 2, Game Boy out) -> **GP1**
  - orange = SIN (link pin 3, Game Boy in) -> **GP2**
  - blue = GND (link pin 6) -> **GND**
  - GP3 is the calibration output (leave free).
- **Power order matters:** plug the Pico into USB **before** switching the Game Boy on. RP2350 pins only tolerate
  the Game Boy's 5 V while the Pico is powered. Switch the Game Boy off before unplugging the Pico.
- When Hazy's PCB (rev A) replaces the breadboard, build the firmware with `-DGBLINK_BOARD=revA` (pins GP12/13/14,
  direction GP11, LED GP21).

### Pico firmware

Needs gb-link-usb `main` at commit 2ec4e56 or newer (bridge mode 2 with the heartbeat and the re-align fixes).

```sh
# toolchain (once): Arm GNU toolchain + Pico SDK 2.x, see gb-link-usb/CLAUDE.md for the exact versions and env vars
cd ~/Projects/gameboy/gb-link-usb
cmake -S firmware -B firmware/build -G Ninja -DPICO_BOARD=pico2_w && ninja -C firmware/build
# flash: hold BOOTSEL while plugging the Pico in, a drive RP2350 appears, copy the .uf2 onto it
cp firmware/build/gb_link_usb.uf2 /Volumes/RP2350/
```

### How the server finds it

- It lists serial ports and takes the first one with **USB vendor id 2e8a** (Raspberry Pi). On macOS that is
  `/dev/cu.usbmodemXXXX`. To pin one, set `SERIAL_PORT=/dev/cu.usbmodemXXXX` in `server/.env`.
- On open it sends `ESC GBBRIDG2`, which switches the firmware into bridge mode 2 (raw link bytes, `$FD` escaped,
  heartbeat reports inserted).
- **Ready** = the ROM's idle polls are arriving (a byte at least every second) and no frame for 2.5 s. While a
  piece draws, the Game Boy computes for seconds without link traffic; that is normal. Only 120 s of silence with
  nothing to draw counts as offline.
- Only one program can hold the port: stop the server before using the check scripts, and close any browser tab
  using Web Serial on the Pico.

### Check it (server stopped)

```sh
cd ~/Projects/gameboy/gb-seed-lab/server
node scripts/check-link.mjs                 # ports, "READY", heartbeat (a DMG reads about -56 ppm)
DRAW=1 node scripts/check-link.mjs          # also sends a test seed and waits for the Game Boy's begin frame
node scripts/calibrate.mjs 15               # measures the Pico's own exact 8192 Hz on GP3 (jumper GP3 -> GP0): ~0.00 ppm
```

Output and what to do:

| Says | Means | Do |
|---|---|---|
| `NO PICO` | no USB vendor 2e8a | data cable, firmware flashed (BOOTSEL drive appears = not flashed), try another port |
| port found, `Game Boy polling: NO` | no bytes from the Game Boy | Game Boy on? ROM running (Slow Horizons screen)? Cable seated both ends? Green wire (SCK) loose happened before. Power order |
| polling yes, `heartbeat: none` | old firmware | flash gb-link-usb 2ec4e56+ |
| test draw began: NO | seed frame not taken | ROM is mid-drawing (it ignores seeds while drawing) or an old ROM on the cart: compare sha256 |
| heartbeat far from -56 (> ±200 ppm) | odd clock or bad timing | run calibrate.mjs; if that isn't ~0, the measurement is broken; tell Hazy |

With the server running: `curl -s localhost:8791/api/health` shows `lane` (Game Boy online), `idle`, `paused`,
`pollAgeSec` (payment watcher), `current` (piece drawing).

## 3. Keys and wallets

| Key | Where | Holds | Does |
|---|---|---|---|
| Treasury `5Uav4kePCC5iMev3X7zXkPciTXKPiTnVzcPF6m8FNSVT` | Hazy only | the sales | receives payments; refunds are sent from here by Hazy |
| Cold wallet (separate, Hazy's) | Hazy only, offline | little SOL | collection update authority: removes the hot key after the mint, fixes metadata |
| Hot minting key | `server/.keys/authority.json` (chmod 600) | ~0.5 SOL at a time | tree creator and the collection's UpdateDelegate: signs mints, pays their fees |
| Arweave upload key | `server/.keys/arweave.json` (auto-created) | nothing | signs Arweave uploads (free under ~100 KB per file) |

- On mainnet the hot key is **never generated automatically**. Create it once and give Hazy the address to fund:
  `node -e "const {Keypair}=require('@solana/web3.js');const k=Keypair.generate();require('fs').writeFileSync('.keys/authority.json',JSON.stringify([...k.secretKey]),{mode:0o600});console.log(k.publicKey.toBase58())"`
  (run in `server/` after `mkdir -m 700 .keys`).
- Back up `server/.keys/` and `server/data/` to an encrypted disk image or Hazy's password manager. Losing the hot
  key is recoverable (the cold wallet can delegate a new one: `node scripts/cold-tx.mjs add-delegate` after editing
  the key); losing `data/` loses the payment records (the reconcile script can rebuild the list from the chain).
- A stolen hot key can mint fakes into the collection or edit metadata until the cold wallet removes it; it can
  never touch the treasury. If you suspect it: stop the server, tell Hazy, run `node scripts/cold-tx.mjs remove-delegate`.

## 4. Configuration (`server/.env`)

Devnet (testing) needs almost nothing; defaults are in `server/src/config.mjs`. Mainnet:

```sh
NETWORK=mainnet-beta
RPC_URL=https://mainnet.helius-rpc.com/?api-key=...   # a free Helius (or similar) key, Hazy makes the account; the public RPC is rate-limited and has no DAS
TREASURY=5Uav4kePCC5iMev3X7zXkPciTXKPiTnVzcPF6m8FNSVT
PRICE_SOL=0.05
MAX_SUPPLY=2000
PUBLIC_URL=https://api.gameboylabs.xyz                        # this server, through the tunnel
SITE_URL=https://www.gameboylabs.xyz/slow-horizons                # the mint page (external_url in metadata)
CORS_ORIGIN=https://www.gameboylabs.xyz
STORAGE=arweave
SERVE_SITE=0                                         # the site is on Vercel
ADMIN_TOKEN=<long random string: openssl rand -hex 32>
ALERT_WEBHOOK=<Discord webhook URL from Hazy>
STREAM_URL=                                          # optional: VOD link template, {t} = unix seconds of draw start
MERKLE_TREE=                                         # from mainnet-setup.mjs
COLLECTION=                                          # from mainnet-setup.mjs
```

The server refuses to start on mainnet with a dangerous setup (DEV on, no treasury, http URLs, CORS `*`, storage not
Arweave, missing keys). Its data directory is fingerprinted (network, genesis, treasury, collection): it won't
reuse devnet data on mainnet.

## 5. Collection (once, needs Hazy's go: costs ~0.25 SOL tree rent + fees)

```sh
cd server
COLD_AUTHORITY=<Hazy's cold wallet address> COVER_SEED=<hex seed Hazy picks> node scripts/mainnet-setup.mjs     # dry run: prints costs and balance
COLD_AUTHORITY=... COVER_SEED=... CONFIRM=yes node scripts/mainnet-setup.mjs                                    # only after Hazy says go
```

It uploads the cover and `collection.json` to Arweave, creates the Merkle tree (16384 leaves) and the Core
collection with the cold wallet as update authority and the hot key as UpdateDelegate (tested on devnet, LOGBOOK
2026-10-17). Put the printed `MERKLE_TREE` and `COLLECTION` into `.env`.

## 6. Public access: domain, Cloudflare Tunnel, Vercel

The domain is **gameboylabs.xyz**; Hazy moved its nameservers to **Vercel DNS** on 2026-10-17. `www.gameboylabs.xyz`
is the main address (the bare domain redirects to it). You can't buy or transfer anything.

- **Main page:** Vercel project `gameboy-labs`, repo `hazy2go/gameboy-labs-site` (private), deploys on every push.
- **Mint page:** Vercel project `slow-horizons` (team hazy2go-4555s-projects), connected to this repo with
  root directory `web/`: a push that changes `web/` deploys it (manual: `vercel deploy --prod` from the repo root,
  not from web/). The main page proxies `/slow-horizons/` to it, so buyers see `https://www.gameboylabs.xyz/slow-horizons/`.
- **API DNS (open, Hazy decides):** a Cloudflare named tunnel needs the domain's DNS on Cloudflare. With Vercel DNS,
  either (a) move the nameservers to Cloudflare instead and re-create the Vercel records there (DNS only, grey
  cloud), then follow the tunnel steps below, or (b) keep Vercel DNS and expose the API with Tailscale Funnel
  (`tailscale funnel 8791`, a fixed https://<machine>.<tailnet>.ts.net address, free (verify)) and use that as
  `PUBLIC_URL`. Until decided, the steps below assume (a).
- **Before deploying for mainnet,** set the meta tags in the mint page: `seedlab-api` = `https://api.gameboylabs.xyz`,
  `seedlab-treasury` = `5Uav4kePCC5iMev3X7zXkPciTXKPiTnVzcPF6m8FNSVT`, `seedlab-price-lamports` = `50000000`. The page checks
  every payment transaction against these before the wallet signs.
- **API:** Cloudflare Tunnel, no open ports on the router:

```sh
brew install cloudflared
cloudflared tunnel login                     # Hazy approves in the browser (picks the domain)
cloudflared tunnel create slowhorizons
cloudflared tunnel route dns slowhorizons api.gameboylabs.xyz
cat > ~/.cloudflared/config.yml <<EOF
tunnel: slowhorizons
credentials-file: /Users/$USER/.cloudflared/<tunnel-id>.json
ingress:
  - hostname: api.gameboylabs.xyz
    service: http://localhost:8791
  - service: http_status:404
EOF
sudo cloudflared service install             # runs at boot (ask Hazy: needs the admin password)
curl -s https://api.gameboylabs.xyz/api/health
```

WebSockets (`/live`) pass through the tunnel without extra settings. `/admin/*` is never reachable through the
tunnel: `adminOk` refuses any request carrying `cf-connecting-ip` or `x-forwarded-for` (Cloudflare adds them), so
admin works only from this Mac, with the token.

## 7. Run it under launchd

```sh
mkdir -p ~/Library/Logs/slowhorizons
sed "s/USER/$USER/g" server/deploy/com.slowhorizons.server.plist > ~/Library/LaunchAgents/com.slowhorizons.server.plist
# check the node path in the plist: `which node` (Apple silicon Homebrew = /opt/homebrew/bin/node)
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.slowhorizons.server.plist
tail -f ~/Library/Logs/slowhorizons/server.log
# restart after a change:
launchctl kickstart -k gui/$(id -u)/com.slowhorizons.server
# stop (e.g. to run the check scripts):
launchctl bootout gui/$(id -u)/com.slowhorizons.server
```

A LaunchAgent runs while Hazy's user is logged in: turn on automatic login for that user (System Settings >
Users & Groups) so a power cut doesn't leave it stopped (ask Hazy).

## 8. Operating the mint

Admin API (localhost, header `x-admin-token: $ADMIN_TOKEN`):

```sh
T=$(grep ADMIN_TOKEN server/.env | cut -d= -f2); A="curl -s -H x-admin-token:$T localhost:8791"
$A/admin/status | head -c 2000                       # everything incl. refunds and the payment cursor
$A/admin/close -X POST                                # stop taking payments (early close); later ones become refunds
$A/admin/open -X POST
$A/admin/resume -X POST                               # after 3 faults or a pixel mismatch paused drawing
$A/admin/requeue -X POST -d '{"n":12}'                # retry a failed piece
$A/admin/refunds.csv                                  # refunds due (Hazy pays them from the treasury)
$A/admin/refunded -X POST -d '{"id":3,"signature":"<refund tx>"}'
node server/scripts/reconcile.mjs                     # read-only: every memo payment is a piece or a refund; stuck pieces
```

Run `reconcile.mjs` daily and after any incident; exit code 3 means something needs a look. Report to Hazy.

Alerts (Discord webhook, at most one per kind per 5 min): `fault` (a drawing aborted, back in the queue), `lane`
(paused after 3 faults), `mismatch` (Game Boy and reference disagree: drawing paused; look at the cart's ROM hash
first), `refund`, `mint` (not landed after 5 tries), `storage` (Arweave upload failing; minting waits), `balance`
(hot key below 0.05 SOL: ask Hazy to top up), `crash`.

### Crash and restart

- State is `server/data/state.json` (atomic writes, rotating backups in `data/backups/`), plus append-only
  `payments.jsonl` and `events.jsonl`. Nothing is ever deleted.
- A piece that was drawing when the server or the Game Boy died goes back into the queue and is redrawn from the
  same seed (same pixels).
- The payment watcher resumes from its saved cursor; payments made while the server was down are picked up.
- Mints are idempotent: the signed transaction is recorded before it is sent; after a restart its status is checked
  before anything is rebuilt. Arweave uploads are recorded per file.
- If the Game Boy is off for over 2 minutes the page shows the mint as offline and stops offering payment.

### When something is wrong

| Symptom | Look at | Fix |
|---|---|---|
| page says Game Boy offline | `check-link.mjs` (server stopped) | section 2 table; power order; reseat cable |
| `mismatch` alert | ROM sha256 on the cart vs `gb/seedlab.gb` | copy the right ROM, power-cycle the Game Boy, `/admin/resume` |
| pieces stuck at `drawn` | log `store` / `storage` lines | Arweave down or charging: wait; if charging, tell Hazy (Turbo credits) |
| pieces stuck at `minting` | log `mint` lines, hot key balance | top-up (Hazy), RPC issues: check `RPC_URL` |
| payment not showing | `reconcile.mjs`, `pollAgeSec` in health | RPC down: watcher retries; finalized takes ~15 s |

## 9. After the mint

1. `/admin/close`, let the queue finish, `reconcile.mjs` clean, all refunds paid.
2. Remove the hot key's power: `node scripts/cold-tx.mjs remove-delegate`, then Hazy opens
   `https://www.gameboylabs.xyz/slow-horizons/sign` with the cold wallet, pastes the transaction and signs (valid ~60 s).
3. Later fixes go the same way: `collection-uri`, `piece-uri <n> <uri>` (upload the corrected JSON first; needs a
   DAS RPC) (verify on devnet before first real use), `lock-piece <n>` (permanent).
4. Then the repo can go public (Hazy decides).

## Fixing metadata later

Traits live in each piece's JSON on Arweave (immutable). To fix: change `metadata()` in `server/src/index.mjs`,
regenerate (`REWRITE_METADATA=1` rewrites local files for pieces not yet on Arweave), upload the new JSON
(`storage.storeJson`), then point the piece at it with `cold-tx.mjs piece-uri`. Marketplaces cache metadata: use
their "refresh metadata" button afterwards.

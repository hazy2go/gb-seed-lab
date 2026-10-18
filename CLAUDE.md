# CLAUDE.md: handoff for agents working on this repo

Project name: **Slow Horizons** (renamed from Seed Lab on 2026-10-17: "seed" reads like a wallet seed phrase). Repo still `gb-seed-lab`.

Read `README.md`, `docs/PLAN.md` and `docs/LOGBOOK.md` first.

## Rules (from the owner, Hazy)
- Repo: `hazy2go/gb-seed-lab`. With `gh`, always pass `--repo hazy2go/gb-seed-lab`.
- Log every decision, check and result in `docs/LOGBOOK.md` (dated heading, short why). Corrections are written as corrections.
- Don't claim anything without evidence. Mark unverified facts "(verify)".
- Hazy reads replies on Discord: short and plain, no long dashes as punctuation.
- Never spend money, mint or place orders; that is Hazy's job.
- The repo is private and all rights reserved (LICENSE, Hazy 2026-10-17); it goes open source only after the mint ends, Hazy's call. Do not publish code, ROM or art anywhere meanwhile. No Nintendo logos or branding in the art or the collection name.
- Same seed must give the same piece. If you change the art on purpose, run `node test/determinism.js --update` and log why.

## Layout
- `gen/`: the generator, one C source for all builds (gen.h has the portability rules: fixed-width types, i32 casts for products that can pass 32767, one rnd() per expression, no >> on negatives). `gen_core.c` stays in the fixed ROM bank; `gen_sky.c`, `gen_ridges.c`, `gen_volcano.c`, `gen_ground.c` are banked on the Game Boy.
- `gb/`: ROM (GBDK-2020, MBC5 + 32 KB RAM). Hot loops in `conv.s` (tile conversion, final dither, screen compare). Link protocol in the header of `gb/main.c`. `seedlab.gb` is committed; its SHA-256 goes into every piece's metadata.
- `web/`: mint page (`index.html`, `mint.js`, `mint.css`, self-hosted fonts), explorer (`lab/`), `seedlab.js` + `gen.wasm`.
- `server/`: mint server (see docs/MINT.md). Devnet authority key in `server/.keys/` and tree/collection in `server/.env`, both gitignored. Port 8791 (8787 is taken on Hazy's Mac).
- `tools/`: `emu.py` (ROM vs native in PyBoy, tests only), `profile.py` + `hooks.py` (where the Game Boy spends its time), `sheet.js`, `csheet.py`. `test/`: golden hashes, WASM parity.
- Sister repo: `~/Projects/gameboy/gb-link-usb` (link cable to USB, bridge mode firmware).

## To do
0. **One-of-ones (Hazy 2026-10-18, next big task):** ten 1/1 scenes are drawn and approved in `gen/gen_special.c`; they must appear randomly during the main mint on the same ROM. Full build spec: `docs/ONE-OF-ONES.md` (fair rule, link protocol byte, ROM, WASM, server, metadata, admin leftover draw, tests).
1. **Hazy:** copy the latest ROM (~/Desktop/slowhorizons.gb) to the EverDrive so the cart matches the server's rom_sha256.
2. **Storage:** Arweave (~$2.65) or free (GitHub art repo, Pinata); then wire the upload step.
3. **Public server:** Cloudflare Tunnel on the Mac mini, Pages for web/, launchd supervisor, admin CLI, payment reconcile script; set `PUBLIC_URL` and the page's `seedlab-api` meta.
4. **Cold wallet page:** a separate wallet (not the treasury, decided 2026-10-17) owns the collection; a small page where it signs "remove the hot key's UpdateDelegate" and later metadata fixes.
5. **21st.dev MCP:** the server fails to connect (API key missing or reset); Hazy gets a fresh key at 21st.dev/mcp and re-adds it.
6. **Mainnet (Hazy's go, real SOL):** mainnet .env (treasury 5Uav…, price 0.05, MAX_SUPPLY 2000, CORS, PUBLIC_URL, ADMIN_TOKEN), tree + collection with `coldAuthority`, fund the hot key minimally, page meta treasury and price.
7. **Docs:** MINT.md (seed formula, refunds, key split), README.
8. **Optional:** banner mesa seam, camera/stream, fewer frame waits.

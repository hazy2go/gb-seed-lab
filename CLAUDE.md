# CLAUDE.md: handoff for agents working on this repo

Project name: **Slow Horizons** (renamed from Seed Lab on 2026-10-17: "seed" reads like a wallet seed phrase). Repo still `gb-seed-lab`.

Read `README.md`, `docs/PLAN.md` and `docs/LOGBOOK.md` first.

## Rules (from the owner, Hazy)
- Repo: `hazy2go/gb-seed-lab`. With `gh`, always pass `--repo hazy2go/gb-seed-lab`.
- Log every decision, check and result in `docs/LOGBOOK.md` (dated heading, short why). Corrections are written as corrections.
- Don't claim anything without evidence. Mark unverified facts "(verify)".
- Hazy reads replies on Discord: short and plain, no long dashes as punctuation.
- Never spend money, mint or place orders; that is Hazy's job.
- The repo is public (Hazy 2026-10-26, after the mint). Code MIT; the collection's art, the 1/1 scenes, the name and the media are all rights reserved (LICENSE). Never commit secrets, server data (`server/data/`), keys or the `.env`. No Nintendo logos or branding in the art or the collection name.
- `server/.keys/` (authority.json = minting wallet, arweave.json = upload wallet) is locked with `chflags uchg` (Hazy 2026-10-22). Never delete, overwrite, move, print or unlock it, and never stop the mint server or tunnel unless Hazy names that exact action (retiring them is Hazy's job, see docs/SERVER-SETUP.md).
- Same seed must give the same piece. If you change the art on purpose, run `node test/determinism.js --update` and log why.

## Layout
- `gen/`: the generator, one C source for all builds (gen.h has the portability rules: fixed-width types, i32 casts for products that can pass 32767, one rnd() per expression, no >> on negatives). `gen_core.c` stays in the fixed ROM bank; `gen_sky.c`, `gen_ridges.c`, `gen_volcano.c`, `gen_ground.c` are banked on the Game Boy.
- `gb/`: ROM (GBDK-2020, MBC5 + 32 KB RAM). Hot loops in `conv.s` (tile conversion, final dither, screen compare). Link protocol in the header of `gb/main.c`. `seedlab.gb` is committed; its SHA-256 goes into every piece's metadata.
- `web/`: the post-mint gallery (`index.html`, `gallery.js`, `gallery.css`, `zip.js`), frozen data in `web/data/` (made by `web/tools/freeze.py`), real footage in `web/media/`, explorer (`lab/`), `seedlab.js` + `gen.wasm`. The old mint page (`mint.js`, `mint.css`, `vendor/`, `sign.html`) is kept for the record and not deployed (`.vercelignore`). Design: PRODUCT.md, DESIGN.md.
- `server/`: the mint server (see docs/MINT.md, docs/SERVER-SETUP.md). Keys in `server/.keys/` and settings in `server/.env`, both gitignored. Port 8791.
- `tools/`: `emu.py` (ROM vs native in PyBoy, tests only), `profile.py` + `hooks.py` (where the Game Boy spends its time), `sheet.js`, `csheet.py`. `test/`: golden hashes, WASM parity.
- Sister repo: `~/Projects/gameboy/gb-link-usb` (link cable to USB, bridge mode firmware).

## State (2026-10-26)
The mint is over: 555 pieces, 185 wallets, all matched, the collection locked on chain (the hot key's UpdateDelegate removed). The gallery at www.gameboylabs.xyz/slow-horizons/ runs from frozen files and needs no server. Open items: Hazy retires the mint server, tunnel and admin host when ready (docs/SERVER-SETUP.md, "Retiring"); the holder airdrop (LOGBOOK, holder snapshot).

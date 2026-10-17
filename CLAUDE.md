# CLAUDE.md: handoff for agents working on this repo

Read `README.md`, `docs/PLAN.md` and `docs/LOGBOOK.md` first.

## Rules (from the owner, Hazy)
- Repo: `hazy2go/gb-seed-lab`. With `gh`, always pass `--repo hazy2go/gb-seed-lab`.
- Log every decision, check and result in `docs/LOGBOOK.md` (dated heading, short why). Corrections are written as corrections.
- Don't claim anything without evidence. Mark unverified facts "(verify)".
- Hazy reads replies on Discord: short and plain, no long dashes as punctuation.
- Never spend money, mint or place orders; that is Hazy's job.
- Artwork is all rights reserved (LICENSE); code is MIT. No Nintendo logos or branding in the art or the collection name.
- Same seed must give the same piece. If you change the art on purpose, run `node test/determinism.js --update` and log why.

## Layout
- `gen/`: the generator, one C source for all builds (gen.h has the portability rules: fixed-width types, i32 casts for products that can pass 32767, one rnd() per expression, no >> on negatives). `gen_core.c` stays in the fixed ROM bank; `gen_sky.c`, `gen_ridges.c`, `gen_ground.c` are banked on the Game Boy.
- `gb/`: ROM (GBDK-2020, MBC5 + 32 KB RAM). Link protocol in the header of `gb/main.c`. `seedlab.gb` is committed; its SHA-256 goes into every piece's metadata.
- `web/`: mint page (`index.html`, `mint.js`, `mint.css`, self-hosted fonts), explorer (`lab/`), `seedlab.js` + `gen.wasm`.
- `server/`: mint server (see docs/MINT.md). Devnet authority key in `server/.keys/` and tree/collection in `server/.env`, both gitignored. Port 8791 (8787 is taken on Hazy's Mac).
- `tools/`: `emu.py` (ROM vs native in PyBoy, tests only), `sheet.js`, `csheet.py`. `test/`: golden hashes, WASM parity.
- Sister repo: `~/Projects/gameboy/gb-link-usb` (link cable to USB, bridge mode firmware).

## To do
1. **Pico (needs hardware):** run seedlab.gb on the DMG via EverDrive, start the server; check the link frames, the per-phase transfer time and the real draw time. Then the heartbeat measurement in the Pico firmware (docs/MINT.md).
2. **Speed:** ~7 min per piece in the emulator. Hot spots: signed 32-bit division and multiplication per pixel (glow, milky way, mist). A faster spec changes pixels, so update golden hashes and log it.
3. **Public server:** host + tunnel, `PUBLIC_URL`, then put the mint page on Pages and set its `seedlab-api` meta.
4. **Before mainnet (Hazy):** price, collection size, treasury, storage (Arweave or similar), camera and stream setup.

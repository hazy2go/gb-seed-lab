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
- `gen/`: the generator, one C source for all builds (gen.h has the portability rules: fixed-width types, i32 casts for products that can pass 32767, one rnd() per expression, no >> on negatives). `gen_core.c` stays in the fixed ROM bank; `gen_sky.c`, `gen_ridges.c`, `gen_ground.c` are banked on the Game Boy.
- `gb/`: ROM (GBDK-2020, MBC5 + 32 KB RAM). Hot loops in `conv.s` (tile conversion, final dither, screen compare). Link protocol in the header of `gb/main.c`. `seedlab.gb` is committed; its SHA-256 goes into every piece's metadata.
- `web/`: mint page (`index.html`, `mint.js`, `mint.css`, self-hosted fonts), explorer (`lab/`), `seedlab.js` + `gen.wasm`.
- `server/`: mint server (see docs/MINT.md). Devnet authority key in `server/.keys/` and tree/collection in `server/.env`, both gitignored. Port 8791 (8787 is taken on Hazy's Mac).
- `tools/`: `emu.py` (ROM vs native in PyBoy, tests only), `profile.py` + `hooks.py` (where the Game Boy spends its time), `sheet.js`, `csheet.py`. `test/`: golden hashes, WASM parity.
- Sister repo: `~/Projects/gameboy/gb-link-usb` (link cable to USB, bridge mode firmware).

## To do
1. **Pico (needs hardware):** run seedlab.gb on the DMG via EverDrive, start the server; check the link frames, the per-phase transfer time and the real draw time. Then the heartbeat measurement in the Pico firmware (docs/MINT.md).
2. **Speed:** ~60 s per piece in the emulator after the speed pass (pixels unchanged). Next: send over the link from the serial interrupt while drawing (needs hardware to test). Profile with `tools/profile.py` and `tools/hooks.py`; any change must keep golden hashes, WASM parity and ROM parity, or be logged as an art change.
3. **Public server:** host + tunnel, `PUBLIC_URL`, then put the mint page on Pages and set its `seedlab-api` meta.
4. **Before mainnet (Hazy):** price, collection size, treasury, storage (Arweave or similar), camera and stream setup.

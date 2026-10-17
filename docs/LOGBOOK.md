# Logbook

## 2026-10-17: repo created, art draft 2

- Idea (Hazy): a generative collection computed on a Game Boy, using the gb-link-usb link to the PC.
- Draft 1 compared landscapes, 1D rule pairs, Game of Life, sandpiles and a cyclic automaton. Cyclic with 4 states stayed noise, dropped. Hazy picked landscapes.
- Draft 2 (landscapes only): traits picked before drawing; tone field + 8×8 Bayer dither; mist per ridge by height (per-column mist made dark "drips" in narrow mesa canyons; fixed by mist by height and closing canyons under ~8 px); rim light from a smoothed slope (per-pixel slope gave vertical streaks); sun/moon kept at least half visible by compressing ridges under it; rain/snow/storm force sky = overcast so the listed sky is always visible; palms redrawn (first version read as mushrooms).
- 20 palettes of 4 colours, weighted. Palette is a display trait; the Game Boy computes shades only.
- Repo: public, name gb-seed-lab, code MIT, artwork all rights reserved (Hazy's choice). Determinism test: 204 golden hashes (200 seeds + 4 tall) in test/golden.json, Node only.
- Not yet: integer port, ROM, hardware timing.

## 2026-10-17: one C source for Game Boy, web and tests

- Mint design written (`docs/MINT.md`). Hazy changed the flow: pay and leave is fine; the piece is drawn and sent anyway, and the page later shows the draw time and a link into the stream recording.
- Generator rewritten in integer-only C (`gen/`), replacing the JS draft 2 (still in git history). Built three ways from the same files: native (`gen/gen_host`, tests), WebAssembly (`web/gen.wasm`, page and server check), GBDK-2020 (`gb/seedlab.gb`). Pictures differ from draft 2 (new integer spec), same look and traits.
- Portability rules (gen.h): fixed-width types, casts to i32 for products that can pass 32767 (SDCC int is 16 bit), one rnd() per expression, no >> on negatives.
- Parity checks: WASM = native on 2000 screens + 20 scrolls (`test/parity.js`). ROM in PyBoy vs native: first run had 3 of 10 seeds wrong, all islands; cause: `iabs(x - cx) * 256` overflowing 16-bit int on SDCC. Audit found 3 more (scroll height, dune slope, island height); fixed. After the fix seeds 1-20 match pixel for pixel.
- ROM: MBC5 + 32 KB cartridge RAM (picture buffer 23 KB, 51 rows per 8 KB bank). Code is ~40 KB, so the phases live in switchable banks (core + 3 bank files); SDCC took >3 min on the single big function, 17 s after the split. Screen shows 360 unique tiles by switching the BG tile area at line 72 (LYC 71, wait for HBlank). Seed shown in a window strip at the bottom for the camera.
- Draw time in the emulator (DMG timing): 194 to 684 s per piece for seeds 1-20, typically 5-7 min, before link transfers (~5.6 s per phase frame of 5760 bytes at 8192 Hz). Speeding it up is a to-do; real-hardware timing still to measure.
- Golden hashes now from the C build: `test/golden.txt` (300 screens + 10 scrolls).

## 2026-10-17: mint server, devnet end to end

- `server/`: Node, HTTP API + WebSocket `/live`. Payment = system transfer to the treasury + memo `seedlab:<ticket>`; seed = first 4 bytes (LE) of sha256(signature string). FIFO queue, one lane, persistent state (`server/data/`), restart puts a mid-draw piece back at the front.
- Lanes: `emulator` (tools/lane_emu.py, PyBoy running the same ROM, labelled "not real hardware" everywhere) and `hardware` (Pico bridge mode, frame parser; not tested, needs the Pico).
- Every piece is checked: the lane's final tiles must equal the WASM reference tiles; mismatch = redraw once, then flagged for manual refund.
- Devnet: faucet was rate limited (429); Hazy funded the authority `FJTwMSgTj1AGJXq5k3ibrAh6q7uPXj8MLJcqeHK9gq3c` with 5 devnet SOL. Bubblegum V2 tree `Gc4aDFYn1a8At8PA9fNLEGnGqLJpRxTsRfbTYzrmomWG` (depth 14, 16,384 leaves), Core collection `FVLrZFRyCkC6iVkZxvHX7g4oNxFFJhhVKVy8fDaKnwCG` (BubblegumV2 plugin).
- Test buy (scripts/devnet-test-buy.mjs): throwaway buyer pays, server verifies, emulator draws, tiles match, cNFT minted (asset 8kPcC3uYKBJx4pPfsNfxARNeYZD4Cnop41SS1spypEp4). Pay-and-close variant (buyer never calls /api/paid): the treasury poller found the memo and minted too.
- Package versions had to be aligned (umi 1.6.0 + web3.js 1.99.0) after a nested adapter mismatch.

## 2026-10-17: mint page, more checks

- ROM vs native in PyBoy: seeds 21-400 all match (380/380), on top of 1-20. Emulated DMG draw time over those 380: mean 419 s, min 172 s, max 778 s.
- Profile (seed 1, 25,700 frames): sky 7,200, ridges+ground ~12,700, screen uploads ~410 each. Inline pixel access and a row-wise tile upload only saved ~2% (output unchanged); the real cost is signed 32-bit maths in software. Left as a to-do because a faster version changes pixels.
- Mint page `web/index.html` (+ mint.js, mint.css, self-hosted Archivo, JetBrains Mono, Silkscreen). Direction from Hazy's past design notes: one metaphor (a small gallery with the artist in the room), real output only (no Game Boy drawn in CSS), neutral walls so palettes carry colour, state colours only for state, two motions (a phase lands row by row like the VRAM upload; the palette is applied at the end), mobile re-staged with the commission right under the screen.
- Wallet flow: the page gets an unsigned transaction from the server, the wallet signs it, the server broadcasts it on its own network (a wallet set to mainnet cannot misroute a devnet payment). `/api/submit` tested on devnet with a script doing the same calls.
- Checked with headless Chrome at 1440 and in a 390 px frame (headless Chrome will not go below 500 px wide; a bare screenshot at 390 is cropped, not broken). The Chrome extension could not reach this Mac's localhost.
- GitHub Pages keeps publishing only the explorer (now at web/lab); the mint page goes public when its server is reachable.

## 2026-10-17: Game Boy Printer dropped (Hazy)

- Hazy: the printer part adds complexity and another thing that can fail. Removed: printer scrolls (the 160x432 mode in the generator, explorer section, README image), the print step and printer evidence in MINT.md and on the mint page, the printer stage in PLAN.md. The "Thermal" palette stays (it is just a palette).
- Check: removing the tall mode does not change screen pieces: 300 golden hashes unchanged, WASM = native on 500, rebuilt ROM = native on seeds 1-4 in PyBoy.

## 2026-10-17: no emulator stand-in (Hazy)

- Hazy: no emulator replacement; when something does not work, nothing works. Removed the emulator lane from the server (lanes/emulator.mjs, tools/lane_emu.py) and all "emulator lane" copy. The server only drives the real Game Boy; without it `/api/ticket` answers 503 ("minting is closed, nothing was charged"), the page shows the studio as closed and the button is disabled. Payments already made wait in line until the Game Boy is back. The hardware lane retries the Pico every 5 s.
- Checked: server started with no Pico: lane not ready, ticket refused with 503.
- PyBoy stays only as a test tool for the ROM (tools/emu.py).

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

## 2026-10-17: speed pass, same pixels

- Goal (Hazy): as fast as possible without lowering the art. Rule kept: every change gives bit-identical results (golden hashes, WASM = native, ROM = native in PyBoy all unchanged), so the art did not change at all.
- Tool: `tools/profile.py` samples the Game Boy's PC once per frame in PyBoy and maps it to GBDK symbols (dot labels included: `.modu16` is the 16-bit divide core). Entry hooks on the math helpers counted callers.
- Findings, in order: per-pixel 32-bit division and multiplication in software (SDCC cannot turn a signed `/ 256` into a shift), the screen update loop, 16-bit divisions per pixel.
- Changes (all identical results): ridge mist once per row instead of per pixel; smoothstep as a 256-entry ROM table; `frac256` (floor(n*256/d), 8-step shift-subtract in 16 bits) for glow, ground, clouds and terrain normalising; glow falloff and fog ripple as per-piece tables; milky way stepped along each row with floor quotient + remainder (no division per pixel); 16-bit maths where bounds allow (discs, clouds, moon craters, rim, snow); unsigned shifts where values are never negative; ridge fast path (plain rows from a per-row tone table); row-pointer API (`px_row`); tile conversion, final dither and screen-copy compare in assembly (`gb/conv.s`); only changed tile rows are uploaded and sent over the link (copy of the screen in cartridge RAM bank 3).
- Result in the emulator: seed 1 420 s -> 55 s, seed 5 585 s -> 58 s, seed 7 520 s -> 68 s (about 8x).
- Link protocol change: `P` frames carry only changed tile rows (phase, n, n x [row, 320 bytes]); the first phase of a draw sends all 18. Server parser rebuilds the full screen (unit-tested with split chunks). Estimated link time at 1 KB/s: 25 s per piece on average over seeds 1-200 (was ~60 s with full frames) (verify on hardware).
- Next speed step, after the first hardware run: send over the link from the serial interrupt while drawing continues (hides most of the link time); not done blind because PyBoy cannot exercise it.
- Full check after the speed pass: ROM = native in PyBoy on seeds 1-400 (400/400). Draw time over those 400: mean 60 s (was 419 s), min 31 s, max 152 s, plus ~25 s link on hardware (verify).

## 2026-10-17: mint page fix

- Hazy: the "How do you know" list was broken (text one word per line). Cause: each item was a 2-column grid, so the plain text after the bold part became its own grid item in the 28 px number column. Fix: block items with the number hung in the left padding. Checked in headless Chrome.

## 2026-10-17: private until the mint ends (Hazy)

- Hazy: make the repo private again and not open source; it can be opened after the mint. LICENSE now all rights reserved (with a note that copies taken while it was public under code-MIT keep that license). README, MINT.md, mint page, metadata and collection description no longer say "open source"; they say the ROM hash is in every record and the source and ROM are to be published after the mint.
- GitHub Pages workflow is manual only now, so pushes do not republish the explorer (it serves gen.wasm).
- Not done by me: the visibility change and taking the current Pages site down were blocked by the auto-mode safety check; Hazy runs them.
- Done on retry: repo is now PRIVATE (gh repo view). The Pages site already answers 404 (GitHub removed it with the visibility change; the delete call found nothing).

## 2026-10-17: heartbeat to item 4, refresh bug

- Hazy: heartbeat is the strongest hardware indicator; moved to item 4, then (Hazy) to item 1 of the evidence list, reworded.
- Hazy: page kept refreshing. Cause: with no Pico, the hardware lane retries every 5 s and each failure broadcast a lane message; every message re-rendered the finished wall (all images reload = flash). Fix: server broadcasts only when ready state changes and logs a repeated error once; page rebuilds the wall only when its list changes. Checked: 15 s with no Pico = 1 message (the snapshot).

## 2026-10-17: renamed to Slow Horizons (Hazy)

- "Seed Lab" could be misread: in crypto "seed" means a wallet seed phrase. Hazy picked Slow Horizons from: Plein Air, Four Shades, Quartz, 160x144, Slow Horizons. Renamed page, explorer, metadata ("Slow Horizons #n", symbol SLOWHZN), memo prefix (`slowhorizons:`), ROM title (SLOWHRZN), hello (HORIZON1). Internal file names (seedlab.gb, seedlab.js) and the repo name stay for now.
- New devnet tree Bhz9AVg8yUbCnw8ZV6uB8zg8QmSuBrK1yMFcuyvDN83r and Core collection GeUaQ6KFB4Pu7KTGoT9rJ17DbggREs7AKdepp29ALF7k named Slow Horizons (server/.env).
- ROM rebuilt (title change only); PyBoy parity seeds 1-3 still 0 pixels differ.

## 2026-10-17: live heartbeat, ROM screens, screensaver (Hazy)

- Heartbeat: gb-link-usb firmware ae91891 adds a PIO period timer on SCK and bridge mode 2 with an escaped side channel (see that repo's logbook). Server: hardware lane switches to `ESC GBBRIDG2`, unescapes, emits heartbeat reports; each piece stores the weighted mean of the reports during its draw (`heartbeat: { ppm, intervals, reports }`), metadata trait `Heartbeat` (e.g. "+3.12 ppm") and a plain-words meaning. Page: live readout under the studio screen with a lamp that blinks on every report, a Heartbeat row on the label ("measuring" while drawing), value on finished pieces and in "Your pieces". Unescape unit-tested (report split across reads). Untested on hardware.
- Link `S` frame now carries the piece number: `$7E 'S' seed(4) n(2) xor(6 bytes)`.
- ROM screens (img/rom-screens.png, PyBoy): full 5x7 font drawn straight into the picture tiles (tile map unchanged; the next drawing's first phase re-uploads every row); commission card (big "NO.142", seed, "DRAWING NOW") for 1.5 s; strip during the draw "#seed ... NO.n"; strip hidden when done so the whole piece shows; after 3 min a screensaver (dark, soft text jumping every 5 s, "LAST NO.n"). DMG LCD burn-in is not a known problem (verify); the moving screen also shows the stream the console is alive.
- Parity after the changes: seeds 1, 2, 8 still 0 pixels differ.

## 2026-10-17: first hardware run

- New gb-link-usb firmware flashed with `picotool load -f -x` (no BOOTSEL button needed). seedlab.gb on the EverDrive; the ROM runs (idle polls seen).
- **Heartbeat works on the real DMG:** -57.65 ppm, sd 0.08 ppm over 16 reports in 20 s (each report 8192 intervals). Includes the Pico crystal error; calibration still to do.
- First commission did not start. Raw link test (server/scripts/rawlink.mjs): before the seed the PC sees 0x00 polls; after sending the seed frame the PC receives exactly the bytes the Pico replied (7e 53 78 56 34 12 ...), and the Game Boy keeps idle polling. So the Pico data input sees the Pico data output, and that output does not reach the GB SIN: a wiring fault on the data lines (SCK is fine, the heartbeat proves it). Asked Hazy to check red (GP1, pin 2) and orange (GP2, pin 4).
- Cause found: the green wire (SCK) was not fully seated. With it fixed, the GB answered the seed frame ('B' then 'P' frames).
- **First piece drawn by the real Game Boy** (dev piece No. 1, seed cbca3dfb, Lavender, golden hour, overcast, peaks, forest, snowfall, 5 ridges, birds): 5378 frames = 90 s including link transfers (emulator estimate was ~57 s draw + ~25 s link). Phases: sky 18 rows at 10.9 s, light 0 rows (overcast), clouds 8 rows, ridges 14/13/13/12/9 rows, ground 0, weather 18, done 0. Final tiles **matched the reference pixel for pixel**. Heartbeat for the piece: -56.149 ppm over 237,568 intervals (29 reports); it was -57.6 ppm an hour earlier, likely the console warming up. img/first-hardware-piece.png.
- **Full devnet purchase on the real Game Boy** (scripts/devnet-test-buy.mjs, SUBMIT path = the page route): buyer paid, No. 2 drawn by the DMG, tiles match, heartbeat -56.054 ppm, minted as cNFT H8uJZXDhYYwsDLv8HT7vp7WpXjgRXq8Zr6GhjsH74MPQ (devnet).

## 2026-10-17: link frames sent in the background

- ROM: after each phase the changed rows are queued and sent from the serial interrupt (one byte per completed transfer, 8192 Hz internal clock) while the next phase draws. The next gen_phase waits only if the previous frame is still going out (it reads the rows from the bank-3 screen copy). The ISR switches to bank 3 for each byte and back to `gb_curbank`; safe because every bank switch sets `gb_curbank` before the register. 'B' and 'D' frames stay synchronous ('D' waits for the last phase frame). Test hook: `mail[8] = 1` forces link mode in the emulator.
- PyBoy emulates internal-clock serial and its interrupt: seed 1 with link mode on finished in 67.3 s (56.6 s without link; ~90 s on the DMG with synchronous sending, measured earlier), 0 pixels differ. Real-hardware check pending (new ROM on the EverDrive).
- **Real-hardware check of background sending:** dev piece No. 3 (seed 8dff64dd, Pocket, dawn, low sun, hills, snowfield, 3 ridges): 3801 frames = 64 s on the DMG, tiles match. Same seed without link in PyBoy: 50.9 s; link estimate 20.5 s, so the old synchronous way would be ~71 s. Saving here ~7 s: a phase still waits when the previous frame (e.g. the full 18-row first frame, 5.8 s) is longer than the next phase's drawing.

## 2026-10-17: heartbeat calibrated

- gb-link-usb calibration mode: the Pico measures its own exact 8192 Hz reference: 0.00 ppm on every full report. The -56 ppm of this DMG is a real crystal offset (relative to the Pico). scripts/calibrate.mjs.

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

## 2026-10-17: audits and hardening (Hazy: optional items, then performance, hardening, security, art audit)

Three read-only audits ran in parallel (server/on-chain security, art + RNG, ROM/firmware robustness). Findings and what was done:

- **Mainnet settings (Hazy):** price 0.05 SOL, max supply 2000 with an early-close switch, treasury 5Uav4kePCC5iMev3X7zXkPciTXKPiTnVzcPF6m8FNSVT. Not deployed; mainnet stays Hazy's go.
- **Server rewrite:** startup guards (genesis hash must match NETWORK; mainnet needs TREASURY != hot key, an existing key file, tree, collection, https PUBLIC_URL, a set CORS origin; DEV off); durable store (state.json with fsync + rotating backups, append-only payments.jsonl and events.jsonl, network/treasury fingerprint); treasury watcher with a cursor (pages back with until/before, finalized, one poll at a time); payments judged by the treasury's balance change (covers smart wallets and inner transfers) with verdicts ok/underpaid/sold-out/closed and refund records (overpayments too); supply cap and close switch enforced when a payment is accepted; seed = sha256(signature || blockhash of the first block >= payment slot + 32), so buyers cannot grind for rare traits (anyone can recompute it); idempotent minting (sign, record signature + expiry, then send; after a crash check the signature before rebuilding); Game Boy watchdog (seed must be acknowledged in 6 s with one resend, no update for 150 s or 12 min total = abort and requeue; 3 faults in a row pause drawing; any tile mismatch pauses drawing); rate limits per IP; tickets in memory only; /api/submit relays only the exact payment we prepared; WebSocket limits (1 KB payload, 6 per IP, ping, origin check, buffer cap); static files via realpath; admin API (localhost + token, refused through the tunnel): status, close/open, resume, requeue, mark refunded, refunds.csv; Discord alerts (optional); low minting-wallet balance alert; crash handlers.
- **Description trait:** one plain sentence per piece (server/src/describe.mjs), also first sentence of the metadata description. Metadata adds Description, "Extra: None" when there are none, Yes/No snowcaps, hires file.
- **Link protocol v2 (ROM + server):** CRC-16-CCITT over type, length and payload on every frame; strict lengths; 'P' carries a sequence number; 'B' and 'D' echo seed and piece; 'D' carries a CRC of the whole screen; seeds are ignored while drawing; the ROM pauses polling 0.3 s every ~2 s so the Pico can re-align; gb_curbank volatile. Server parser: drops dead partial frames, resets on open, lane ready only while the Game Boy talks.
- **Firmware:** re-align on every quiet gap (also when idle), never block on the tx queue, flush stale bytes when bridge 2 starts, reset heartbeat sums on pin change.
- **Page:** web3.js self-hosted (sha256 09cdbea951b2ed0e11bcbe3aeb1ee9f035f9fb51ed212aca645475ae82688cc3); before signing, the page checks the transaction is exactly one transfer of the published price to the published treasury (page meta, not the server) plus our memo; open/closed state with reason, "n of 2000 taken", status after paying (number, then seed), refunds and a 1920x1728 download under "Your pieces".
- **Art fixes (pixels changed, goldens updated):** high sun/moon kept clear of the farthest ridge (radius and height capped against its base); volcano smoke from the rescaled crater, darker by day; aurora never under a rain/snow deck, comet and milky way never with an overcast sky; night ridges get a wider tone range and half the valley mist; "Original" palette now distinct (e0f8d0 88c070 346856 081820), Negative its inverse; new moon as a faint earthlit disc with a light rim; night sails shade 1, hull and lighthouse rock lit at night; clouds may cross but not bury the sun or moon; snow only above an absolute height; right palm group stays in frame; seeds mixed with the murmur3 finalizer before the RNG.
- **Checks after:** 300 golden hashes rewritten; WASM = native on 1000; ROM = native in PyBoy on seeds 1-300 (300/300), mean draw 62.6 s without link.
- Not done yet: banner download (plan: exact piece in the middle, the scene continued sideways by the same code), hardware test of protocol v2 (new ROM on the EverDrive).

## 2026-10-17: protocol v2 on hardware, banner, islands

- Protocol v2 on the DMG (new ROM on the EverDrive, hardened firmware): first try aborted falsely because the lane counted the Game Boy as silent while it computed between phases (no link traffic for seconds). Fixed: ready = idle polls arriving and no frame in progress for 2.5 s; silence during a drawing is judged only by the phase watchdog; "offline" only after 2 min of silence with nothing to draw; mint gate uses online (connected and heard from), not idle. Also found: a seed sent while the GB still finished an orphan drawing (from before a server restart) is ignored by the ROM, as designed; the server now waits for idle. After the fix: dev No. 1 drawn in 66 s, every frame CRC and sequence OK, screen CRC OK, tiles match.
- **Devnet purchase with the hardened server:** treasury watcher picked it up at finalized, seed revealed from the block 32 slots later (9937f0bd), drawn by the DMG (heartbeat -56.239 ppm), minted idempotently (asset AUXGph75wHvXspiizHsvgLQQuWXiPDzy1hqT2gd9Ymz3).
- **Banner** (PC and web only): gen_banner.c draws the piece, records its ridges and sky parameters (KEEP slots), redraws at columns -136..295 with the ridges continued past both edges on a separate random stream, then pastes the exact piece back in the middle (432x144, shown 4x = 1728x576, 3:1). The drawing range became GX0..GX1 (constants 0..160 on the Game Boy). Checks: goldens unchanged by the refactor, ROM = native in PyBoy, banner centre identical to the piece on 50 of 50 seeds.
- **Islands** (Hazy spotted a "dead pixel" black blob on the DMG, seed 7843f3fd): the nearest island was solid shade 3 and, with its reflection, a smooth dark lens. Now islands keep some haze (tone 200/256 of the way to black), rougher profile, trees, and a light shoreline. Goldens updated; WASM = native on 1000; ROM = native (incl. 7843f3fd).
- **Art scan** (tools/art_scan.py, Hazy: make sure no other trait causes blob-like problems): 3000 random 32-bit seeds scored for the largest solid single-shade region (not touching the bottom), white regions, flat 8x8 tiles and shades used. Clusters: (1) dark lakes at night (near ridge + reflection), (2) day islands with pale sky and sea (looked fine: calm, not broken), (3) dark nights, worst with a new moon: 236/3000 (7.9%) used fewer than 3 shades. Fix: night/aurora/eclipse skies get a lighter horizon (202->92, 205->104, 192->110). Re-scan: 8/1500 (0.5%) under 3 shades; nights stay nocturnal with separated ridges (checked visually). Goldens updated; WASM = native on 1000; ROM = native.
- **Gallery** (Hazy): clicking a finished piece (wall or "Your pieces") opens a sheet: the piece and its banner redrawn by the WASM build (identical to the minted piece), the description, all traits with the palette swatch, the drawing's numbers (seed and where it came from, draw time and frames, heartbeat with clock ticks and readings, the reference check, collector, on-chain asset, ROM hash), replay in the sheet, both downloads, copy link. Deep links `#piece-N` (the metadata's external_url) open it. New endpoint /api/piece?n=.
- **The machine at work** (Hazy): under the studio screen, "On the Game Boy" shows the real source of the phase being computed (web/excerpts.js, cut from gen/ and gb/ by tools/excerpts.mjs, with file and line), and the ROM's idle loop when idle; "On the link cable" replays the changed tile rows of each update (the bytes that really crossed the cable) at 1 KB/s, or the real $00 idle polls. ~15 text updates per second, nothing heavy; on a phone only the cable panel shows. The idle studio shows the last finished piece.

## 2026-10-17: Can the collection be fixed later, and who holds that power

- **Updates are possible** (Hazy asked): the pieces are minted mutable (mpl-bubblegum's MetadataArgsV2 serializer defaults `isMutable` to true; we don't override it). The collection's update authority can change a piece's name and uri with updateMetadataV2 (one transaction per piece, proof computed from the tree), and the Core collection's own metadata. Traits live in the JSON the uri points to. Marketplaces cache, so a refresh is needed after a change. Locking for good (isMutable false) stays possible later; Hazy's call after the mint.
- **Key split, tested on devnet** (scripts/authority-test.mjs, tree HFWbvuFuxUJxb4Kq9FgVtgFtep1bsyNV5PNDoag2iQSi). Collection update authority = a separate "cold" key; the hot key FJTw… set as UpdateDelegate (plugin authority):
  - hot mints: OK. hot updates metadata: OK (so the delegate can also edit while it holds the role). cold updates metadata: OK.
  - cold removes the UpdateDelegate plugin: OK; then hot mints: fails (InvalidCollectionAuthority 6028).
  - Control, cold authority and no delegate: hot can't mint or update (6028); cold can mint.
  - The first run's other failures were the public devnet RPC's 429 rate limit; re-run with 3 s pacing came out clean. The additionalDelegates variant failed in the rate-limited run and was not re-checked (not needed, plugin authority works) (verify if ever used).
- **Plan for mainnet:** Hazy's own wallet (key offline, never on the Mac mini) is the update authority; the hot key is the tree creator and the UpdateDelegate. The cold wallet doesn't sign at setup (createCollection takes it as a plain address, done above). After the mint ends, Hazy's wallet removes the delegate: from then on a stolen hot key can't mint into the collection or edit any piece. During the mint a stolen hot key could edit metadata or mint fakes, but the cold wallet can undo both and revoke it; it can never touch the treasury. `setupCollection({ coldAuthority })` does this. Still to build: a small signing step for Hazy's wallet (remove delegate, later updates).
- **Cold wallet** (Hazy): a separate wallet, not the treasury 5Uav…, will own the collection.

## 2026-10-17: Arweave, Vercel, the Mac mini guide

- **Arweave (Hazy: go)** via ArDrive Turbo, `@ardrive/turbo-sdk` pinned at 2.1.0 (released 2026-09-23; newer ones were days old). Checked with an **unfunded** fresh key: uploads of 44 B, 100000 B and 106000 B were all accepted with `winc 0` (free). Our files: 1x 2.8 KB, 6x 21 KB, 12x hires 62-66 KB, metadata 2.3 KB, replay 85 KB, so a piece costs nothing while Turbo keeps that free tier. The quote API (`getUploadCosts`) still shows a nonzero price; it doesn't apply the free tier. If it ever charges: the paid rate quoted was ~$83/GiB, ~177 KB/piece, about $28 for 2000 pieces worst case.
  - `server/src/storage.mjs`: per-file idempotent uploads (each id saved before the next), metadata built from the final Arweave URLs and uploaded last, minting waits for it (`stored(p)`), retries every minute, `storage` alert. Mainnet refuses to start unless `STORAGE=arweave`. Own unfunded upload key `.keys/arweave.json`.
  - `SITE_URL` (the mint page) is now separate from `PUBLIC_URL` (the API); `external_url` uses the site.
  - Correction: my storage test wrote fake metadata into devnet `data/pieces/2.json`. Restored with the new `REWRITE_METADATA=1` startup option (also the tool for future metadata fixes). Devnet only, nothing on chain changed.
- **Collection setup script** `scripts/mainnet-setup.mjs`: dry run by default, `CONFIRM=yes` to spend; refuses a cold authority equal to the hot key or the treasury, and a second collection. Mainnet tree (depth 14, buffer 64, canopy 8) rent 0.2451 SOL (from getMerkleTreeSize = 48120 bytes).
- **Cold wallet tools:** `scripts/cold-tx.mjs` builds unsigned transactions with the cold wallet as fee payer and signer; `web/sign.html` shows signer and programs and asks the wallet to sign and send. Devnet simulation of remove-delegate and collection-uri: success. piece-uri / lock-piece need a DAS RPC and are untested (verify on devnet first).
- **Reconcile** `scripts/reconcile.mjs` (read-only): every treasury tx with our memo must be a piece or a refund; stuck pieces; refunds due. First devnet run flagged one 0.03 SOL payment from before this data dir; the server now records `startCursor` on first start and reconcile only looks back that far.
- `scripts/check-link.mjs` replaces the outdated rawlink.mjs (hardcoded port, old checksum): lists ports, finds vendor 2e8a, reports polling, heartbeat, optional test draw. Tested only the no-Pico path (the Pico was unplugged) (verify with hardware).
- launchd plist `server/deploy/com.slowhorizons.server.plist` (KeepAlive, caffeinate).
- **Vercel (Hazy):** project slow-horizons, `web/` deployed: https://slow-horizons.vercel.app (lab/ excluded by .vercelignore, security headers in web/vercel.json). Note: the production URL is public (Vercel's protection covers previews only); the page still points at localhost for its API, so it shows offline until the tunnel is up.
- **docs/SERVER-SETUP.md:** full instructions for the agent on the Mac mini (rules, Game Boy detection and checks, keys, .env, collection, domain + tunnel + Vercel, launchd, operations, crash recovery, after the mint).
- Hazy bought a domain for "Game Boy Labs": the main page shows all projects, the mint becomes a sub page (/slow-horizons).
- **Game Boy Labs main page** (Hazy): new local repo `~/Projects/gameboy/gameboy-labs-site` (static, not on GitHub yet), Vercel project gameboy-labs, live at https://gameboy-labs.vercel.app. Slow Horizons as Experiment 01, hardware cards (kagiboy, gb-link-usb, WiFi cartridge) and ROM cards (ClaudeBoy, SODAX on Game Boy, GB Gallery), facts taken from each repo's README. `/slow-horizons/` is a Vercel rewrite to the slow-horizons project, so the mint page lives under the main domain while its code stays in this private repo. Images avoid console photos with Nintendo branding; footer says not affiliated with Nintendo. Checked at 1280 px and 390 px. The Slow Horizons card shows devnet piece 2.
- **Wallet warning** (Hazy, screenshot): Phantom's in-app browser showed Blockaid's "This site may be dangerous" on slow-horizons.vercel.app. Plan: serve the mint from Hazy's own domain, then file a false-positive review with Blockaid (and Phantom) for that domain before launch.

## 2026-10-17: Mac mini server setup, first pass (agent on the Mac mini)

- Repos at `~/Projects/gameboy/gb-seed-lab` (f280623) and `~/Projects/gameboy/gb-link-usb` (pulled to 2ec4e56). `server/`: `npm ci` ok (Node 22.23.3; npm skipped the optional bufferutil/utf-8-validate install scripts, serial ports still list fine).
- Mac already set up for a server: `pmset` sleep 0, autorestart 1 (power failure), automatic login for hazymacmini. Nothing changed.
- Pico connected here: `check-link.mjs` finds `/dev/tty.usbmodem114201` vendor 2e8a product 0009, but `Game Boy polling: NO`, heartbeat none. The Game Boy is not on or not cabled to this Mac yet, so firmware version and the link are unchecked (verify).
- ROM to put on the EverDrive: `gb/seedlab.gb` sha256 280befbdd59cf1ef00cc8664e53f1fa8167116ecbfec25876d94b3a904a920cd.
- Mainnet hot key created once: `server/.keys/authority.json` (chmod 600), address 971nCH2YFewsPjmeEPY7KohkdgWBpxYoaQE7cNoadp9R. Not funded (Hazy's call). Not backed up yet.
- `server/.env` written for mainnet with the known values (treasury, price, supply, Arweave, SERVE_SITE=0, a fresh ADMIN_TOKEN). Still TODO: RPC_URL (Helius key), the domain (PUBLIC_URL, SITE_URL, CORS_ORIGIN), ALERT_WEBHOOK, MERKLE_TREE and COLLECTION (from mainnet-setup.mjs, needs Hazy's go). The server refuses to start until then, so the launchd job is not loaded yet (KeepAlive would restart-loop).
- Blocked on Hazy: domain name + `cloudflared tunnel login` for it (the existing cert.pem and API token on this Mac don't cover a new zone), `vercel login` (this Mac is logged out), Helius key, Discord webhook, cold wallet address, cover seed.

## 2026-10-17: 21st, the domain, Vercel git deploys

- **21st (Hazy):** the 21st MCP connects now (the CLI isn't logged in: HTTP 401, so I used the MCP). Filled `.21st/design.json` for the main page with our real tokens and rules, then asked 21st for inspiration with that context. Taken: "Project Index" (ssychui): a numbered, ruled list of every project whose picture follows the cursor on hover; rebuilt in plain HTML/CSS/JS (no paid code pulled), touch and reduced motion get the plain list. For the mint page the 21st results didn't fit (crypto dashboards); only a thin sold meter (pieces taken of the edition) under the price was added.
- **Domain gameboylabs.xyz** (Hazy, nameservers moved to Vercel DNS, propagating). It had been attached to the slow-horizons project; moved to gameboy-labs (the main page), www is the main address and the bare domain redirects to it (308). The mint is at /slow-horizons/ through the rewrite.
- **Repos connected to Vercel** (Hazy): new private repo hazy2go/gameboy-labs-site -> project gameboy-labs; hazy2go/gb-seed-lab -> project slow-horizons with root directory `web/` and an ignored-build step (`git diff HEAD^ HEAD --quiet -- .`) so only pushes that touch web/ deploy. The CLI link moved from web/.vercel to the repo root.
- **Open:** with DNS on Vercel, a Cloudflare named tunnel for api.gameboylabs.xyz isn't possible as written; options in SERVER-SETUP.md section 6 (Cloudflare DNS, or Tailscale Funnel).
## 2026-10-17: Game Boy on the Mac mini, domain

- Game Boy connected (Hazy). `check-link.mjs`: READY, heartbeat -57.51 ppm (7 readings), so the Pico runs the heartbeat firmware. `DRAW=1`: test seed 12345678 taken, begin frame received (traits 10,4,8,1,2,0,4,0,0). The ROM on the cart accepted the seed (sha256 match not checked directly; a full drawing with the tile check would prove it).
- Domain (Hazy): mint at https://www.gameboylabs.xyz/slow-horizons. `.env`: PUBLIC_URL=https://api.gameboylabs.xyz, SITE_URL=https://www.gameboylabs.xyz/slow-horizons, CORS_ORIGIN=https://www.gameboylabs.xyz (one origin only, so the apex must redirect to www).
- gameboylabs.xyz was registered today at Porkbun with nameservers on **Vercel DNS**, not Cloudflare (whois). A Cloudflare Tunnel hostname needs the zone on Cloudflare, so either the nameservers move to Cloudflare (as SERVER-SETUP.md assumes) or the API lives on another domain. DNS not resolving yet at the time of writing.

## 2026-10-17: Game Boy Labs redesign, mint page in the same style (Hazy: "more polished, more lab like, more serious")

- **Learnings carried over:** kagiboy's site (one hero object, calm light palette, evidence on screen), the mint page (gallery-wall restraint, mono labels, measured numbers), every project's logbook (dated proof, corrections kept).
- **Main page = a lab notebook:** drafting-paper wall (#f5eede, the same paper as the drawings), black ink, 1px rules, square corners. Sections: Fig. 1 hero with a legend that maps callouts to projects, a register (the 21st Project Index), Experiment 01 spec sheet, "Measured" (four sourced numbers: -56 ppm, 0/1000 bytes wrong, 150 mA, 300/300), hardware spec sheets, ROM plates, a logbook of real dated entries from the repos, and the lab's method (the rules we already follow).
- **New assets from Codex CLI image generation** (Hazy asked): three technical plates in one consistent ink-on-paper style (Fig. 1 the console exploded with cartridge and link cable, Fig. 2 a cartridge exploded, Fig. 3 the link adapter exploded). Deliberately drawings, not photos: a page that says "everything runs on real hardware" must not show AI photos of hardware. The footer says Fig. 1-3 are illustrations; boards and screens are renders and real output. No branding in the drawings. Faded into the page with a mask; inverted for dark mode.
- **Mint page:** same paper, rules and type (headings at 84-86% width instead of 118-125%, square corners), breadcrumb "Game Boy Labs / Slow Horizons", mono kickers over each section, footer links back to the lab.
- **Correction:** the evidence list still said the seed is the SHA-256 of the payment signature alone. Since the anti-grinding change it also mixes in the hash of a block about 32 slots (~13 s) later; text fixed.
- Checked both pages at 1440 px and at iPhone 15 Pro width (393 px).
## 2026-10-17: DNS on Cloudflare, mint tunnel

- Hazy connected gameboylabs.xyz to Cloudflare (free) and set Porkbun's nameservers to ian/leah.ns.cloudflare.com (registry shows them). Zone pending activation at the time of writing.
- Records via API (token `~/.config/cloudflare/gblabs_token`, chmod 600): `@` CNAME 41a8d4b0f5baec01.vercel-dns-017.com and `www` CNAME cname.vercel-dns-017.com (both DNS only, the values Vercel showed for the project), `api` CNAME to the tunnel (proxied).
- Tunnel: deviation from SERVER-SETUP.md section 6. Instead of a locally managed tunnel plus `sudo cloudflared service install`, a **remote-managed** tunnel `slowhorizons` created with the API, ingress api.gameboylabs.xyz -> http://localhost:8791, else 404. Runs as LaunchAgent `com.slowhorizons.tunnel` (`cloudflared tunnel run --token-file ~/.cloudflared/slowhorizons.token`, KeepAlive, log ~/Library/Logs/slowhorizons/tunnel.log). Why: no admin password needed, and it leaves the Mac's existing tunnels and ~/.cloudflared/config.yml untouched. 4 connections registered (kix).

## 2026-10-17: collection cover (Hazy)

- Server `.env`: Helius mainnet RPC (genesis and DAS checked) and the Discord alert webhook set.
- Cover: scanned 20,000 seeds with the WASM reference, ranked by trait rarity with all 4 shades and no repeated palette or sky, 12 candidates on a contact sheet. Hazy picked **390ef621** (Sea Glass, aurora, twin moons, hills, snowfield, milky way, shooting star). Pass as `COVER_SEED=390ef621` to mainnet-setup.mjs.

## 2026-10-17: smaller Merkle tree (Hazy: lower the cost)

- Tree was depth 14 / buffer 64 / canopy 8 (16,384 leaves, 0.2451 SOL rent) for a 2000 supply. Priced on mainnet (getMerkleTreeSize + rent): depth 11 / buffer 32 / canopy 5 = 2048 leaves, 15,000 B, **0.0769 SOL**, proofs still 6 nodes (same transfer/listing size as before). Canopy 0 would be 0.0668 SOL but 11-node proofs (heavier transfers, some marketplaces struggle), not worth 0.01 SOL.
- Hazy: yes. `TREE` constant in config.mjs used by setupCollection and mainnet-setup.mjs; MAX_SUPPLY check now 1..2048. Mainnet dry run: tree rent 0.0769 SOL. Hard cap 2048 pieces in this tree.
- New `scripts/tree-test.mjs` (devnet): tree + collection with cold authority, mint, DAS proof (expect 6 nodes), transferV2. Not run yet: devnet faucet returned 429/500 for the fresh devnet key B4G7GRbs761Zgkpz81fP8MRnY9vPjc8w6GzA5YGcbJB2 (verify before the mainnet setup).
- **Devnet test passed** (Hazy funded the devnet key): tree 25X7unMvTixVd45U62yEAKqJGYLqtZUDdWXByC2xYv2t (depth 11 / buffer 32 / canopy 5), collection Ge6jV3FzHcvkVkTHav2aeNXFZstHKAkNHxArkHZsBewg with a cold authority and the hot key as UpdateDelegate; minted 3c3yj34ohC82KhVr8eSBp8R7yH7UmSFd1yjhmWyysNEi; Helius devnet DAS returned it with a 6-node proof after the canopy; transferV2 to a new owner OK and seen by DAS.

## 2026-10-17: mainnet collection created (Hazy: go)

- Bug before spending: mainnet-setup.mjs called checkConfig(), which requires MERKLE_TREE and COLLECTION, so the real run would always have stopped (nothing spent). Fix: `checkConfig({ setup: true })` skips only that check.
- Ran with COLD_AUTHORITY=CQbkmawaHxEMjdW89ozviQkHmVkN1iZzhBq16SyGf9zd, COVER_SEED=390ef621, hot key funded 0.11 SOL by Hazy. Spent 0.0798 SOL (balance now 0.0302).
  - Tree **9EWonkyBnsK2XYFLsyaMBgvKq8vr1w6Nvp7j681WmooM** (depth 11 / buffer 32 / canopy 5)
  - Core collection **FwhoBPWniQQSKeDG3rNPGTmLXvVoPhPNKwV5YcTDmzRu**; Helius getAsset: MplCoreCollection "Slow Horizons", authority CQbk… (full scope)
  - collection.json https://arweave.net/1wBL2Mm0B3K0c-AqWRjwxEkveUl5hGVzgHavs2IR8nM, cover https://arweave.net/TXgM6zhUwCAbtbqWLDlCjaODfCuF5xuHzYQgD9RvDRE (960x864 PNG). Both served by ardrive.net right away; arweave.net returned 404 in the first minutes (normal until the Turbo bundle settles) (verify later).
- `.env`: MERKLE_TREE, COLLECTION, COLLECTION_URI set. New `.keys/arweave.json` created by the upload: add it and the new .env to the encrypted backup.
- Hot key at 0.03 SOL is below the 0.05 alert line: top up before the mint opens.

## 2026-10-17: server running on mainnet, closed until launch

- Backup image updated with `.keys/arweave.json` and the new `.env` (checksums match), ejected.
- Cloudflare zone gameboylabs.xyz **active**. launchd `com.slowhorizons.server` loaded: "server on :8791, mainnet-beta, treasury 5Uav…, minting wallet 971n…, ROM 280befbdd59c, sold 0/2000". https://api.gameboylabs.xyz/api/health answers through the tunnel (checked against a Cloudflare edge IP; this Mac's resolver still had the old Vercel answer cached).
- `/admin/close` set so no payment is accepted before Hazy launches (later payments would become refunds). Launch = `/admin/open`. Admin through the tunnel refused, as designed.
- Pico not present when the server started (`lane: no Pico found`, no /dev/cu.usbmodem): unplugged since the link check. Mint stays offline until it's back (power order: Pico first, then the Game Boy).
- Pico kept dropping off USB (behind three chained hubs). Hazy moved it to a port on the Mac mini directly: server picked it up within 5 s by itself, lane online and idle for 60 s straight, heartbeat -58.0 ppm. Keep the Pico off the hub chain.
- Mint page still pointed at `http://localhost:8791` and the devnet treasury FJTw…, so the live site showed "no Game Boy". Set the meta tags per SERVER-SETUP.md: `seedlab-api` https://api.gameboylabs.xyz, `seedlab-treasury` 5Uav4kePCC5iMev3X7zXkPciTXKPiTnVzcPF6m8FNSVT, price 50000000 lamports (unchanged). Server stays closed, so the page shows the mint as closed until /admin/open.

## 2026-10-17: server-side security pass (Hazy: protect against attacks)

- Server listened on all interfaces (`*:8791`): anyone on the LAN could reach it and fake `cf-connecting-ip` to dodge the per-IP limits. Now `HOST` (default 127.0.0.1); checked: listens on 127.0.0.1 only, LAN address refused, tunnel still answers.
- Reviewed the public routes: per-IP limits (600/min overall, ticket and submit 6/min), body cap 16 KB, header/request timeouts, submit relays only the exact prepared payment, WebSocket origin check + 1 KB payload + 6 per IP, static files via realpath, admin only from localhost with the token and never via the tunnel (checked: 404 through the tunnel). Secrets chmod 600, .keys 700. macOS firewall on, stealth mode on.
- `npm audit --omit=dev`: 37 advisories, all in transitive deps of the Arweave and Metaplex SDKs. The one on the public path would be `ws`, but the server's ws is 8.21.0 (not affected); the flagged ws 7.4.6 sits under ethers' providers, unused by us. elliptic/secp256k1 issues are in the Arweave bundle signer (its key holds nothing). The fixes need major SDK bumps: not done before launch.
- Cloudflare edge hardening (rate limit rule on api., min TLS 1.2, Always HTTPS) refused: the token lacks Zone Settings and Zone WAF permissions. Waiting on Hazy.
- Cloudflare rate limit rule on api.gameboylabs.xyz added (free plan's one rule: per IP and colo, 100 requests / 10 s, then blocked 10 s). Tested: 130 fast requests from this Mac = 100 x 200 + 30 x 429; health answers again after the timeout. Min TLS 1.2 / Always HTTPS / SSL full still refused (Zone Settings permission not effective yet).
- **Correction, live mint page showed "no Game Boy"** (Hazy, on mobile data): not DNS. `mint.js` used the page's own origin as the API on any http(s) host (a leftover from when the server served the page), so on www.gameboylabs.xyz it called Vercel (404) and ignored the `seedlab-api` meta. Checked first: through Cloudflare the API answered `lane.ready: true`, CORS allowed www, WebSocket upgraded (101). Fix: the meta wins; only localhost/127.0.0.1 (local development) uses its own origin.
- **Code panel removed** (Hazy: "yeah lets remove that screen"): the "On the Game Boy" panel showed real ROM source excerpts (web/excerpts.js), which conflicts with keeping the source private until the mint ends. Panel, excerpts.js and its script tag removed; the link-cable panel now spans the studio. tools/excerpts.mjs stays for after the mint. Note: excerpts.js was public on earlier deployments for a few hours (short cuts of gen/ and gb/main.c, no keys or secrets).
- **Main page redesign shipped** (gameboy-labs-site 7cc5f61): Impeccable comp-led build, direction "Hardware Catalog" (Hazy picked it and the split-hero composition). Real Blender (Cycles) renders of kagiboy's procedural model (gb-wallet/assets/3d/kagiboy.blend, opened read-only by gameboy-labs-site/render/lab_render.py): unbranded floating consoles with the real ROM screens and the real Slow Horizons piece, kagiboy's cartridge, the branded kagiboy console for its tile; overhead key so shadows sit right under the objects. Real KiCad board renders. Font TikTok Sans (matched to the comp by impeccable font-match). Light only. Hazy-approved deviations from the comp: kagiboy's real cartridge and plain words instead of the comp's random numbers. Finish review: two rounds; open partials: leader angle (now angled), strip column 4 position, hero comp-diff 77% after the render swap (medium changed at Hazy's request).
- **Local demo of a busy mint** (Hazy, for a screenshot): `server/scripts/demo.mjs` (port 8795) fakes the page's API and live feed with simulated data only: 140 in line, 413+ taken, a gallery of 24 real reference pieces, a piece drawing phase by phase (tone field dithered the way the ROM does), new commissions every 7 s, a heartbeat. No chain, no Game Boy. Never deployed.
- The demo found two real bugs, fixed in web/mint.js: (1) opening the page while a piece was being drawn crashed the live feed (the snapshot's `live` had no `hb` list), so the page showed "offline"; (2) a long line rendered every queue row (11,000 px page with 140 waiting): now the next 12 plus the collector's own row and "and N more in line", long waits in hours.
- **Queue for hundreds** (Hazy): pages of 10 with Previous/Next, a "Find your place" box (wallet, part of one, or No.), "N in line". Pieces still waiting for their seed block show "Getting its seed" and are left out of the start estimates (the demo showed them as "Waiting, in ~1 min" ahead of the piece being drawn). **Your place in line** card under the price once the connected wallet has a piece in line: number, how many ahead, start estimate (same as its row), "Show me in the line" jumps to the right page. Local demo: `?as=<wallet>` pretends a wallet is connected, on localhost only.
- **Jupiter wallet not detected** (Hazy): the page only looked for injected providers (window.phantom/solflare/backpack/solana). Jupiter and most new wallets register through Wallet Standard. Added Wallet Standard discovery (app-ready + register-wallet events, `standard:connect`, `solana:signTransaction` on solana:mainnet, devnet when the server says so), injected providers kept as fallback, a picker when several wallets are installed. Tested with a fake Wallet Standard wallet named Jupiter in a mobile viewport: found and connected. Real Jupiter extension not tested here (verify).
- **Mobile page jumping on zoom/scroll** (Hazy): the studio screen was sized from `100dvh`, which changes as the mobile address bar shows and hides. Now `svh` on desktop and a plain full-column width on phones. No horizontal overflow at 390 px.
- **Full gallery** (Hazy): "Gallery" next to Connect wallet opens `#gallery`: every drawn piece, 24 at a time with infinite scroll, filters per trait (palette, time, sky, terrain, ground, weather, extra) with live counts, search by No. or wallet, newest/oldest; a piece opens the existing sheet. Filters fold behind a button on phones. New endpoint `GET /api/gallery` (server/src/gallery.mjs, shared with the demo). **Mac mini: pull and restart the server** (launchctl kickstart -k gui/$(id -u)/com.slowhorizons.server) or the live gallery stays empty.

## 2026-10-18: end-to-end server audit (Hazy)

Three read-only audits in parallel (money/chain, public attack surface, reliability/recovery), then fixes verified here.

Fixed:
- **One payment could become two pieces** (verified in code): the poller and the /api/submit fast path both called handlePayment; the signature was marked used only after an RPC await, so both could create a piece. Now one shared in-flight evaluation per signature. reconcile.mjs also flags two pieces sharing a payment.
- **Anyone could crash the server with one WebSocket message**: no `error` listener on sockets, so an oversized/malformed frame threw and the process exited (launchd restarts, mint flaps). Added `ws.on('error', terminate)`. Checked live: a 5000-byte frame now gets close code 1009, same server pid, health fine.
- **Possible double mint**: mintStatus read status then height; a mint landing in between read as expired and was rebuilt. Now finalized height first, then status, expired only 30 blocks past lastValidBlockHeight.
- Dust spam (memo + under 0.001 SOL) no longer creates refund records or alerts (logged as 'dust').
- Drawing pause after faults/mismatch is saved in state.json (a restart used to resume silently).
- Mint closes itself when the minting wallet is under 0.02 SOL (payments would queue with nothing to pay mint fees).
- Pico reconnect self-heal (PLAUSIBLE causes of today's "not picked back up"): stream 'end' now closes the port so it reconnects; idle with bytes but no heartbeat for 10 s re-sends the bridge switch (firmware drops out of bridge 2 on a USB blip); port open but silent 20 s while idle is closed and reopened. Not yet tested on hardware (Pico unplugged at the time).
- Small: perIp map entries removed at 0, static file stream error handled.

Open (not fixed, ranked):
- Smart-wallet payments (transfer inside another program): payer falls back to the fee payer, NFT could go to the relayer; inner-instruction memo may be missed by the watcher and reconcile.
- Watcher stops paging at 50k signatures and would skip older ones (only after a huge backlog or spam).
- IPv6 rotation sidesteps per-IP limits; /api/state and WS connect rebuild the full queue uncached (cache ~1 s, cap queue size).
- Corrupt state.json at startup crash-loops with no alert; backups up to 5 min old could lose a recorded mintTx (rebuild from events.jsonl).
- One piece failing Arweave upload blocks all later ones (break); uploads have no timeout; Turbo charges only logged, not alerted.
- Piece files not fsynced before 'drawn' (power cut could upload an empty file); server.log has no rotation.
- Follow-up fix: checkSignedPayment now accepts up to two ComputeBudget instructions (SetComputeUnitLimit / SetComputeUnitPrice, paid by the buyer) besides the exact transfer + memo; anything else still refused. Unit-checked: plain OK, with CB OK, 3 CB / heap frame / extra transfer / wrong amount refused. Still: **test one real purchase with Phantom, Solflare and Backpack before launch** (other wallet-added instructions, e.g. Lighthouse guards, would be refused).
## 2026-10-18: audits (Hazy: deep end-to-end audits from all angles)

- Five independent audits run in parallel, report only, reports in docs/audits/2026-10-18-*.md: mint page/process/UX, on-chain, security, art (every trait and layer), banner art.
- **Security audit C1 (critical), fixed:** `new URL(req.url)` ran outside the try in the HTTP handler, so one malformed path (e.g. `//x:99999`) crashed the server; launchd restarts it after 10 s, so one request every 10 s would keep the mint down. Now answers 400. **Mac mini: pull and restart.**
- **Security audit H1 (high):** same fix as the Mac mini's audit pass above (b808ba8); `handlePayment` checked `usedSignatures` and only wrote it after an `await`, and both the treasury watcher and `/api/submit` call it, so one payment could become two pieces (same seed, mint fee twice). Now one in-flight promise per signature.
- **Audit reports for the Mac mini agent** (server/on-chain fixes stay with the agent that runs the server; this session does page, art, banner): docs/audits/2026-10-18-security.md and docs/audits/2026-10-18-onchain.md. Already covered by b808ba8/de3c82d: double processing, dust, mintStatus order, ComputeBudget, WS crash; C1 (malformed URL crash) fixed in 83982f5. **Still open from these reports, for the Mac mini:** (1) cold-wallet signing: build cold-tx transactions on a clean machine, sign.html must decode and allow-list instructions, and take sign.html off the public site (security M2, on-chain #3); (2) tree delegate: the hot key is the tree creator, so losing it cannot be recovered by a new UpdateDelegate: setTreeDelegate to an offline backup key before launch and correct SERVER-SETUP.md (on-chain #6); (3) ticket/submit reservations near sold-out and re-check mintOpen before relaying (on-chain #7); (4) refund/manual records for failed pieces, wrong-format memos, memo-less payments (on-chain #8); (5) mainnet guards: SEED_DELAY_SLOTS>=32, MINT=1, HOST loopback, price, tree capacity/delegate (on-chain #9); (6) derive missing assetId with findLeafAssetIdPda; wait for arweave.net 200 before minting (on-chain #10); (7) Helius quota: cache blockhash for tickets, verifySignatures before relaying, separate key for the watcher (security M4); (8) cap/compress the queue in /api/state and WS snapshots, rate-limit WS connects (security M5); (9) dedicated macOS user + FileVault, .env 0600, admin token not on the command line (security M3, Low); (10) live meta check: alert when the page's treasury/api/price meta differs from .env (security M6). Page-side items (CSP, escaping, esc() quotes, docs/build files served publicly, the old slow-horizons.vercel.app copy) are done in this session.
- Description fix: snowcapped fjord/volcano read 'snowy a fjord'; now 'a snowy fjord' / 'a snowy smoking volcano'. Metadata text only, no pixels. Checked on the three snowcap terrains.
- Metadata description shortened (Hazy): '<sentence> Drawn live by a real Game Boy in M min S s from seed XXXXXXXX.' (dropped the seed-source and pixel-check sentence; those facts stay in properties).
- **Page-side security fixes** (security audit M1, M2, Low): every server response and live-feed message is validated on arrival in mint.js (numbers, base58 keys/signatures, hex, network allow-list, https/arweave URLs; anything else becomes null); esc() also escapes `'`. CSP + HSTS + Permissions-Policy on the mint page (web/vercel.json: scripts self + wasm, connect only api.gameboylabs.xyz and arweave.net) and on the main site (its headers skip /slow-horizons so the two CSPs never stack). Tested with the policies injected: orbit, all six 3D spinners, mint page and gallery load with zero CSP violations. sign.html is no longer deployed (.vercelignore); use it locally. The main site no longer serves DESIGN.md, build.sh, render/, src/.

## 2026-10-18: art audit (report only, no generator change)

- 4000 random seeds, each extra checked by redrawing with that element suppressed (same random stream), 76 per-trait contact sheets plus defect sheets. Report: `docs/audits/2026-10-18-art.md`, sheets in `docs/audits/img/art/` (lossless WebP).
- Worst findings: claimed low/striped/double sun fully hidden behind the farthest ridge (65/4000); white 7x5 lava block on dusk/night volcanoes; daytime volcano smoke as a dark solid plume; oasis palms as scribbles; mesas as stacked boxes; cabins invisible in forests; gibbous moon drawn as a bitten disc; lighthouse stripes vanish on dark shores. Trait frequencies match the weights. Nothing fixed yet; fixes proposed in the report.
- **Banner fixes** (banner audit, docs/audits/2026-10-18-banner.md), PC/web build only: (1) side ridges get the piece's own sun-clearance squash and never rise above the piece's highest point on that layer (folded back, not cut flat), so no more "bowl" banners; (2) snow on the sides is a cap at most 5 px deep with no lit/unlit flicker on gentle slopes (the striped slabs are gone); (3) the main random stream is re-synchronised to the piece before every drawing step (SYNC slots), clouds and trees: the piece's own first, side ones on separate streams and kept clear of the seams, so nothing is cut at x=136/295 and sky objects stay as in the piece; (4) rougher peaks calmed (roughness 140, smoothing). Checked: golden hashes 300/300, WASM = native 500/500, banner centre = piece 400/400, before/after sheets of the audit's worst seeds. **The ROM is byte-identical** (sha256 280befbd…): all Game Boy-side code is kept exactly as before behind `#ifdef __SDCC`, so the cart on the Mac mini and the server's ROM hash stay valid.
- Not done yet from the banner audit: islands tapering to open water, mesa/dune side shaping (open, medium).
- **Art audit** (docs/audits/2026-10-18-art.md, 4000 seeds, 88 sheets): findings change the pieces themselves (and the ROM, so the cart must be re-flashed and the golden hashes renewed): waiting for Hazy's decision before mainnet.
- Low-balance alert (Hazy: stop repeating): sent once when the minting wallet drops under 0.05 SOL, flag saved in state.json; re-armed only after it is back above 0.05. Checked: second restart sent nothing.

## 2026-10-18: art fixes from the art audit (Hazy: "fix em all")

All ten audit findings (C1-C3, H1-H7) plus M1 and M2, in the one generator source (native, WASM and ROM). Traits unchanged: `gen_host traits` for seeds 1..5000 is byte-identical before and after (gen_traits not touched). Only the drawing changed, so **the ROM changed**: new sha256 `0b40456db73c93ec4bd8daf4d7dbfc0e1828ca9e45e424bf84660b4554fe5a28` (was 280befbd…). The cart and the server's rom_sha256 must be updated before the mint (Hazy). Before/after sheets (4x, lossless WebP) in `docs/audits/img/art-fixes/`: audit seeds + 12 random seeds of each trait, and `random-48.webp` (2x) as a regression check.

Per finding (rates on the audit's 4000 seeds, `random.Random(20261018)`, measured with an instrumented scratch copy that skips one element's writes without touching the random stream):
- **C1 hidden low sun:** the low sun's centre is capped 6 px above the farthest ridge's base (like the high sun), so the existing clearance always applies; and a low sun now squashes a layer only around itself (smooth falloff over 40 px), so it sets into a saddle and ridges away from it keep their height (a uniform squash flattened the whole far ridge). High suns and moons keep the old uniform squash. Low/striped/double sun under 2% visible: 58 -> 0; under 25%: 144 -> 0 (the remaining 34 under 35% are all striped suns, whose stripes are gaps).
- **C2 lava block:** the 7x5 white box is gone; a thin lava line follows the crater (3 px shade 0 in the middle, shade 1 to the sides, 1 px below), the soft glow does the rest. Drawn with the volcano's own layer, so nearer ridges cover it.
- **C3 smoke:** the plume is now drawn right after the volcano layer (nearer ridges cover it), blends toward a grey that fades with height (alpha 224 -> 64, radius <= 7), leans away from the sun or moon, never paints inside the sun/moon disc + 3 px, and flattens sideways under the top edge instead of running off it (a volcano at the very top still smokes, so "a smoking volcano" stays honest). No randomness in it, so the banner draws the same plume.
- **H1 palms:** 2-4 palms 14-18 px apart on a low sand bank (tones, 3 px above the waterline), trunk 2 px in its lower half and curving more toward the top, 6 fronds per palm at fixed angles with a gentle droop (4/100 instead of 11/100), 2 px thick near the crown, connected. The reflection is a separate clean mirror (no cages). Note: a hard shade-2 bank gave a black line on every third reflected row (the water darkens hard pixels), hence tones.
- **H2 mesas:** mesas only on the two nearest layers (far layers are soft hills); higher cut (lv 140-185, narrower buttes), no plateau wider than ~40 px, a closing that removes slots under ~12 px, a saddle in gaps under ~20 px, a low bench, and a talus slope at the foot of each wall (top 40% stays a cliff).
- **H3 cabins:** the cabin site is chosen on the near layer before its trees, and those trees leave a 21 px glade; light roof outline (lit slope shade 1, the other 2 by day / 1 at night when the woods behind are dark too), light walls, chimney edge; smoke is soft and 2-3 px wide, fades toward the sky, leans with the wind.
- **H4 gibbous moon:** lit half plus half an ellipse (semi-axis r/2): convex terminator, no more bite. Crescent unchanged (the audit called it good).
- **H5 lighthouse:** the tower samples what stands behind it; on a dark shore the bands are shade 0/2 with a light edge on the lit side (rock shade 2), on a light sky shade 0/3 with a dark outline. Lighthouses still allowed on lakes; no trait change.
- **H6 far ridge:** every non-near layer stays at least 20 tone steps off the sky behind it, on the side it already is, only where its ridge line meets the sky (down to its lowest notch, eased out over 12 rows so the valley mist stays); the rim light scales with that contrast (`min(rimA, 2*(c-12))`). Far ridge within 16 tones of the sky: 113 -> 6.
- **H7 sky extras:** comet and shooting star are drawn after the ridges and clouds (end of draw_features), placed in open sky above every ridge (new per-column `skyl`) and clear of the sun/moon, tail pixels only above the skyline; the shooting star uses star pixels (no reflection, like stars). Birds: flock kept above the skyline and away from the sun (lrad + 26), no bird within lrad + 5 of the disc, each bird dark on a light sky or light (shade 1) on a dark one. Shooting star under 8 px: 15 -> 0 (0 px: 7 -> 0); comet under 25 px: 11 -> 2; birds under 12 px: 17 -> 12 (all >= 9 px now; a 3-bird flock has 15 px); birds on the disc: 144 -> 0.
- **M1 eclipse:** a light horizon ring (sky up to 60 tones lighter from 45% of the sky down), and the far ridge tone starts from it (far = horizon - 12). Eclipse pieces under 3 shades: 30/122 -> 0/122.
- **M2 overcast:** by day a flatter, darker grey sky (rain/snow 128 -> 64, storm 150 -> 84) with the deck darker still (146/166) and grey clouds (104); night unchanged.
- Banner: centre = piece 400/400; the side snow cap now eases in over 24 px from the seam (a deep snowfield in the piece met a 5 px cap at the seam: a cut). Side ridges use the piece's squash at their own edge (rec_kk per edge, needed for the local squash).

Checks: golden.txt regenerated (300); `node test/determinism.js` ok; `node test/parity.js 500` ok (WASM = native); ROM = native in PyBoy for seeds 1..300: 300/300, 0 pixels differ. ROM fits: ROM_0 96% (622 B free), ROM_1 96%, ROM_2 93%, ROM_3 70%. Speed: mean 3802 -> 3892 frames on seeds 1..30 (63.7 -> 65.2 s), 3720 -> 3832 on 1..300 (+3%).

Not done: M3 (eclipse fog), M4 (dunes sawtooth), M5 (oasis as a pool; sailboats still allowed on oasis), M6 (second moon/sun off frame), M7 (glitch block), M8 (milky way), M9 and L1-L7. Two comets of 75 still show under 25 px (head in front of a cloud deck). The low sun is by design still half behind a ridge in many pieces ("at least half" visible).
- **Review of the art fixes** (this session): before/after sheets checked by eye (volcano, oasis, mesas, gibbous moon, cabin, random 48): clear improvement, no regressions seen. Small leftovers for later: an odd stub block on some far mesa layers (e.g. a415c4c8), palms still a bit spidery at 1x (10752095), audit M3-M9 and L1-L7 open.
- **ROM changed: new sha256 0b40456db73c93ec4bd8daf4d7dbfc0e1828ca9e45e424bf84660b4554fe5a28** (was 280befbd…). **Order for the Mac mini (mint must be closed, nothing drawing):** (1) Hazy copies the new gb/seedlab.gb onto the EverDrive as slowhorizons.gb and power-cycles the Game Boy; (2) the Mac mini agent pulls and restarts the server (it reads ROM_SHA256 from gb/seedlab.gb and the reference from web/gen.wasm); (3) one devnet-style test drawing (DRAW=1 check-link or an admin test piece) must end with "tiles match the reference". Pulling before the cart swap would make every drawing a mismatch (drawing pauses itself).
- **Mint UX audit, server-side items for the Mac mini** (docs/audits/2026-10-18-mint-ux.md): broadcast mintOpen/closed reason/sold/maxSupply on every change (the page never learns about open/close/offline/sold count after load); mintOpen() must be false while drawing is paused after faults/mismatch; keep relayed tickets so a retried submit returns the same signature instead of "nothing was charged"; check for a pending payment of the wallet before issuing a new ticket; look at 6 WS/IP + Cloudflare 100 req/10 s for carrier NAT (cache piece images with long max-age, they are immutable per seed).

## 2026-10-18: pulled art fixes + server items from the mint UX audit (Mac mini)

- Pulled 3382bca (art fixes, **new ROM 0b40456d…**) and 9af4f81. Server restarted: reports ROM 0b40456db73c. The mint is closed and the Pico unplugged, so nothing can draw with the old cart. **Before any drawing, Hazy copies the new gb/seedlab.gb to the EverDrive as slowhorizons.gb**; then one test drawing must end with tiles matching.
- Server items from docs/audits/2026-10-18-mint-ux.md:
  - H2: a fresh snapshot is broadcast whenever open/closed, the closed reason, the sold count, closed or pause change (checked every 2 s; no spam: 1 message in 7 s idle).
  - mintOpen() is false while drawing is paused ("drawing paused").
  - Retried /api/submit for an already relayed ticket returns the same signature (202) instead of "nothing was charged".
  - /api/ticket refuses (409, with the signature) while the wallet's last relayed payment (< 3 min) is not recorded yet: guards against paying twice.
  - Refunds are broadcast as {type:'refund', wallet, signature, reason, lamports} (page can show it; it ignores unknown types today).
  - Piece PNGs under /pieces/ served with max-age 1 day (immutable once drawn); WebSockets per IP 6 -> 20 for carrier NAT.
- **New ROM on the cart, checked on hardware** (Hazy copied it, Pico on a direct port): new `scripts/test-draw.mjs` (server stopped; seeds -> 'done' -> final tiles vs web/gen.wasm, same check as the server). 5/5 match, screen CRC ok: volcano e8f7b1b8 100.7 s, oasis 92af19b6 89.4 s, mesas f657c59d 80.2 s, gibbous moon c2ec8fe7 82.5 s, cabin 74fabe5c 92.8 s (link time included). Server restarted, lane online.

## 2026-10-18: volcano plume no longer floats (Hazy: "smoke si missalinged", 62c5bbb9)

- Cause, from a tone dump around the crater per phase: (1) the volcano's snow cap (tone 0-35) sat in front of a white cloud deck (3-56), so the cone top vanished and the dark plume hung in the sky; (2) in 6513270e the crater is right in front of the sun, and smoke() skipped every pixel inside the sun's ring, so the lower plume was erased and only the far end showed.
- Fixes (gen only, no RNG change, traits identical for 1..300):
  - Under a light sky (sky tone at the crater < 96) the volcano gets no snow cap and is held at least 36 tone steps darker than its sky. Under a dark sky (storms, night) it keeps its cap, which reads there.
  - Plume starts 2 px above the crater (was 4), first puff radius 2, darkest at the crater and thinning as it rises; the first puffs stay darker than the cone (no pale patch on the crater).
  - The volcano's plume may pass in front of the sun or moon (smoke_sun); other smoke still keeps clear of it.
  - Nearer ridges dip around the crater (7 px plus a slope) so a peak always shows under the plume.
  - draw_volcano moved to its own file gen/gen_volcano.c: gen_ridges.c was 80 bytes over its 16 KB ROM bank.
- Checked: 18 volcano seeds against the committed build by eye (sheets sent to Hazy); 11 of 300 golden pieces change, all volcanoes; golden.txt regenerated; `node test/parity.js` ok (WASM = native 500); banner centre = piece 308/308; ROM = native in PyBoy for 1..300 + 9 volcano seeds: 309/309, 0 pixels differ; mean 3830 frames on 1..300 (was 3832).
- Banner before/after sheet sent to Hazy (6 worst audit seeds + one volcano).
- **ROM changed again: new sha256 0918b443f265b193a268fb83a9c0f78c45a1ba027a83561950196bbb8fc75d24** (was 0b40456d…). Same order as before, mint closed: (1) Hazy copies gb/seedlab.gb (also on the Desktop as slowhorizons.gb) to the EverDrive and power-cycles; (2) the Mac mini pulls and restarts; (3) scripts/test-draw.mjs on a volcano seed (62c5bbb9) must match.

## 2026-10-18: correction to the volcano fix (Hazy: snow caps lost, smoke off the left of the top, a cliff left of the mountain)

- **Correction:** dropping the volcano's snow cap broke the snowcaps trait on volcano pieces (6513270e, 7aa546f7). The cap is back on every snowy volcano.
- Instead, under a light background the volcano gets a 2 px dark outline (no rim light on it), a bare dark crater (±4 px, 4 rows) and slightly greyer snow, so the cap keeps an edge against white cloud.
- "Light background" is now read from the real pixels 3 rows above the crater (sky or cloud, sun skipped). The sky gradient alone said "dark" for 62c5bbb9, whose crater sits in front of white cloud.
- Crater x is now midway between the highest rim point on each side (the rim noise could make the right rim higher, so the smoke left from the left side of the top). The first puff has no sideways wobble.
- The dip in nearer ridges fades out between 12 and 28 px (it ended at 16 px, which cut a vertical cliff into a nearer snowy peak in 1c710a20). It only applies under a light background; under a dark sky the plume never floated.
- Checked: 18 volcano seeds by eye against the committed build (sheet sent); traits identical 1..300; 11 of 300 golden pieces change; parity.js ok; banner centre 308/308; ROM bank 1 now 15978 of 16384 bytes.
- ROM = native in PyBoy for 1..300 + 10 volcano seeds: 310/310, 0 pixels differ; mean 3838 frames on 1..300 (was 3832).
- **ROM changed again: new sha256 27adf8d3e21cc2a2b70e834a2eb71e6158350ae02bc11c1205c6b14795380b8a** (replaces 0918b443…, which was never on the cart). Same swap order: Hazy copies gb/seedlab.gb (Desktop: slowhorizons.gb) to the EverDrive and power-cycles, the Mac mini pulls and restarts, then scripts/test-draw.mjs on 62c5bbb9 must match.

## 2026-10-18: volcano, third pass (Hazy: 32bade25 "is here supposed to be a volcano?", 62c5bbb9 smoke still off the left of the top)

- 62c5bbb9 has no crater notch: noise made its summit a flat top at x 113-116 while cx sat on the left slope (x 106; the rim midpoint gave 108). **Correction** to the rim-midpoint rule: the crater is now the middle of the columns within 1 px of the highest point in cx ± 12.
- 32bade25 (storm, overcast) and other dark-background volcanoes: a dark plume on a dark sky vanished, and the low broad cone did too. Under a dark background (the same real-pixel test as the outline) the volcano now glows like at night (lava line + soft glow), and its plume is lighter than the sky (sky - 40).
- Checked: 18 volcano seeds by eye vs the committed build (sheet sent); traits identical 1..300; 11 of 300 golden pieces change; parity.js ok; banner centre 308/308. ROM bank 1 at 16105 of 16384 bytes (279 free: the next generator change in gen_ridges.c may need another split).
- ROM = native in PyBoy for 1..300 + 12 volcano seeds: 312/312, 0 pixels differ; mean 3838 frames on 1..300.
- **ROM changed again: new sha256 73f54501ee6a4cf2d1398e9f2d642579720de3639d96fc5d4422419faa1443f4** (replaces 27adf8d3…, never on the cart). Same swap order; test drawing on 62c5bbb9 and 32bade25.


## 2026-10-18: allowlists, holder mints and the admin page (branch `allowlist`, not merged)

- **Hazy's decisions:** whitelist single wallets and whole collections, on Solana and Ethereum, alongside the public
  mint (stays 0.05 SOL); each list sets its price (0 = free), its limit, and whether the limit counts per wallet or
  per NFT. Ethereum holders sign with Rabby/MetaMask/Coinbase and receive in their Solana wallet. Admin page from
  anywhere: hidden host behind Cloudflare Access, login with a passkey.
- **Built** (design in docs/MINT.md "Allowlists and holder mints", ops in SERVER-SETUP.md 4 and 8b): lists in
  `data/lists.json` (seeded once from the committed, empty `server/lists.json`; strict validation, bad file = no
  start; a list can never cost more than the public price). Eligibility API (wallet lists, Helius DAS holdings,
  30 s cache), Ethereum link (nonce, personal_sign, viem verifyMessage incl. ERC-1271/6492; Alchemy NFT API),
  persistent grants for discounted payments (the watcher prices a payment by its grant only for the same payer and a
  block time before expiry; consumed only by an accepted payment), free claims (Solana signMessage or the ETH link,
  fresh holdings re-check, seed from a random claim id + a blockhash 32 slots later), usage per (list, unit) with
  locks and re-checks after every await, reconcile.mjs checks claims, grants and usage. Ported from nftroles
  (ethereum.ts, eth-nft.ts, nft-providers.ts, verify routes) to plain ESM.
- Why opaque unit refs on the page: an eligibility answer for a Solana wallet would otherwise show which Ethereum
  address is linked to it and which tokens it holds.
- Why grants keep their unit 3 min past expiry: a payment signed just before expiry can finalize after it; without
  the grace another wallet could reserve the same unit and both would be accepted.
- Why a cancelled-then-retried reservation is reused for 50 s and retired after 2 min: otherwise a limit-1 buyer who
  cancels in the wallet is locked out for 13 min. A retired grant that still lands keeps its price only if the unit
  has room.
- **Admin page** (`server/src/admin/`, `server/admin-ui/`): Host + secret path + Cloudflare Access JWT (RS256, aud,
  iss, exp, email) + passkey session (UV required, 30 min idle / 8 h, HttpOnly Secure SameSite=Strict, bound to the
  Access email, CSRF + Origin) + a step-up passkey assertion per change whose challenge embeds the hash of the exact
  action and payload. Append-only `data/admin-audit.jsonl`, Discord alert per change, lockout after 5 failures in
  15 min. First passkey only with a one-time setup code (server log or `scripts/admin-passkey.mjs`). Strict CSP, no
  inline script, noindex, frame-ancestors none, no third-party requests. No action exists for .env things.
  Cloudflare not touched: setup steps for Hazy in SERVER-SETUP.md 8b.
- **Dependencies** (exact pins, all at least two weeks old): viem 2.56.9 (2026-09-24; was already in the tree via
  turbo-sdk at 2.57.7, now deduped), @simplewebauthn/server 14.0.3 (2026-09-25), browser lib 14.0.0 vendored in
  admin-ui/vendor (sha256 29bb0699…221d). simplewebauthn pulled @peculiar/* 2.11.0 and asn1js 3.1.0 (released
  2026-10-12..16, too fresh): pinned back with `overrides` to @peculiar/asn1-* 2.9.5, @peculiar/x509 2.1.0, asn1js 3.0.10.
- **Tests** (`cd server && npm test`, no network): 17 pass. Unit: list validation, EOA + mocked ERC-1271 (viem custom
  transport), Solana ed25519, nonce reuse/expiry/wrong wallet, per-wallet vs per-NFT (NFT moved to another wallet),
  ERC-1155 balance, concurrent claims (one wins), grants (price, foreign payer, underpaid voids, expiry + grace,
  restart), fail-closed holdings and parsers. Admin: every Access failure = 404, setup code single use, UV required,
  clone counter, wrong origin, CSRF/Origin, session bound to email, idle expiry, step-up bound to payload, audit,
  lockout. End to end: the real `src/index.mjs` against a fake Solana RPC + DAS and a fake online lane (module hook,
  tests only): eligibility, free claims + seed formula, discounted payment through ticket/submit/watcher, underpaid
  vs grant price, foreign payer, public payment, restart keeps grants and usage, reconcile exit 0, admin unreachable
  from the public host and through the tunnel.
- Clicked through with puppeteer: mint page offers, ETH check, free claim, discounted payment (demo.mjs now has fake
  Solana + EIP-6963 wallets); admin page with Chrome's virtual authenticator (real WebAuthn): setup code, passkey,
  close mint, edit a list with step-up, audit. 1440 and 390 px, no horizontal overflow.
- Not tested: real Helius DAS / Alchemy answers (no keys on this Mac; shapes from nftroles and docs (verify) before
  launch), a real Rabby/MetaMask signature (verify), a smart wallet on mainnet (verify), Cloudflare Access in front of
  the real host (verify after Hazy's setup). The root `npm test` needs `gen/gen_host` built; art untouched.

## 2026-10-18: allowlist review fixes (branch `allowlist`, not merged)

Independent security review of the allowlist branch; all 11 findings fixed. Code in `server/src/allowlist.mjs`,
`lists.mjs`, `holdings.mjs`, `sigs.mjs`, `solana.mjs`, `index.mjs`, `config.mjs`, `admin/`, `web/mint.js`.
- Farmable setups are now refused at validation (were warnings): free + per wallet on a holder list, and ERC-1155 +
  per nft. Paid per-wallet holder lists also count each NFT used (asset id or `contract:tokenId`, saved as
  `nftUsage`): one NFT gives at most `limit` pieces on that list whoever holds it. reconcile.mjs checks these counts.
- Reservations need proof: `/api/ticket` with a list needs a Solana signMessage (same nonce scheme as claims; message
  names site, wallet, list, nonce, expiry). The page signs once; the same signature gets the same reservation back
  within 50 s.
- Every free claim needs that signature, Ethereum lists too (before: the ETH link alone).
- A reservation we relayed a payment for is never retired. A retired one paid on time cancels the same wallet's newer
  unpaid reservation instead of being refused.
- A payment with block time before expiry keeps the list price when the watcher reads it late (after expireTick), if
  the unit has room.
- `/api/submit` relays a grant payment only from the grant's wallet (sender and fee payer).
- Free claims: sha256(claim id) is broadcast with the queued piece before the seed block, the claim id only after.
  How to check: docs/MINT.md.
- DoS: 5 ETH links per Solana wallet (oldest dropped, indexed by wallet), nonces 5 min and 20 per IP, at most 20
  holdings lookups per eligibility request, holdings cache keyed per collection, 5000 entries, oldest out in O(1).
- Helius: a collection grouping marked `verified: false` does not count.
- Admin: setup/verify respects the lockout; cached Cloudflare Access keys are trusted at most 24 h if refreshing keeps
  failing.
- Disabling, deleting or repricing a list voids its open reservations (at once from the admin page, at start for
  hand edits, and checked again when a payment lands). ALCHEMY_RPC must be eth-mainnet.
- Left as is (deliberate): a paid per-wallet ERC-1155 list counts per ETH address only, since copies have no identity;
  a moved copy gets the discount again, never a free piece (MINT.md abuse notes).
- Tests (`cd server && npm test`, no network): 25 pass (was 17). New: farmable setups refused, NFT passed between
  wallets on a per-wallet list, reservation proof (none, wrong signer, other list, reuse within 50 s), relayed and
  retired grants, late payment after expireTick, list changes void reservations, DoS bounds, unverified grouping,
  setup/verify lockout, Access key max age, ALCHEMY_RPC; end to end: ticket without proof 401, grant payment from
  another wallet 400, claim commitment broadcast before the claim id.

## 2026-10-18: allowlist + admin page merged to main

- Branch `allowlist` (build, merge with main, independent security review, fixes for all 11 review findings) merged. Review: no path to a free or discounted mint without eligibility, and no reuse of a Solana NFT or ERC-721 token beyond its limit. Fixed after review: farmable list setups refused, wallet signature for every reservation and free claim, safer grant timing, seed commitment for free claims, DoS bounds, verified collections only, admin lockout on setup, Cloudflare key max age, list changes void open reservations.
- Tests: `cd server && npm test` 25/25 after the merge. Not yet tried against real Helius, Alchemy, a real Ethereum wallet or Cloudflare Access.
- **Mac mini, before using any list:** pull, `npm ci` in server/ (new deps: viem, @simplewebauthn), restart. Lists start empty (server/lists.json), so nothing changes for buyers until a list is added. Hazy: ALCHEMY_API_KEY into the Mac mini .env, and Cloudflare Zero Trust Access for the admin host (docs/SERVER-SETUP.md 8b).

## 2026-10-18: Mac mini on the allowlist merge + ROM 73f54501

- Pulled to e2e842c. `npm ci` in server/ (viem, @simplewebauthn), `npm test` 25/25. Server restarted: ROM 73f54501, mint closed, lane online; log: "Ethereum lists disabled: ALCHEMY_API_KEY is not set; Solana lists work". data/lists.json seeded empty. Admin page off (ADMIN_* not set).
- Cart: Hazy power-cycled with the new ROM (hello HORIZON2). `test-draw.mjs`: volcano 62c5bbb9 76.6 s and 32bade25 75.8 s, screen CRC ok, tiles match (2/2).
- Note for 8b step 5: the slowhorizons tunnel here is remote-managed (Cloudflare API), not ~/.cloudflared/config.yml: the admin host gets added to its ingress via the API plus a proxied CNAME, by the agent with Hazy's go.
- **Admin page live (Hazy: "can I give you perms")**: Cloudflare Zero Trust Access in front of the admin host, policy: Hazy's email only (account details are in the Mac mini's `.env` and the Cloudflare dashboard, not in the repo). Tunnel ingress for the admin host to localhost:8791, proxied CNAME to the tunnel. `.env`: ADMIN_HOST, ADMIN_PATH (random 32 hex), CF_ACCESS_TEAM, CF_ACCESS_AUD, ADMIN_EMAILS. Checked: admin host from outside = 302 to the Access login; the admin path on the api host = 404; locally without an Access JWT = 404. Setup code logged at start (one-time, 15 min).
- Admin page showed "null" next to "Open the mint" (Hazy, phone screenshot): DOM append(null) when drawing is not paused. Fixed by spreading an empty array.

## 2026-10-18: whole-list cap `maxTotal` (Hazy: "max limit per collection")

- New optional list field `maxTotal` (1-16384): pieces through the list as a whole, every unit together = used pieces + open reservations. `room()` takes min(unit room, list room); offers show the smaller remaining; `fits()` (late payments, retired grants) and the late-settle bump also respect it. No new lock needed: the list-room check and the grant/usage write happen with no await in between (claims re-check after getSlot), so two buyers can't both take the last slot.
- Admin page: "Max pieces for the whole list (optional)" in the editor; the table shows "max N total" and "used / N pieces"; audit text includes it. reconcile.mjs flags OVER LIST CAP. docs/MINT.md table updated.
- Test (allowlist.test.mjs): free list 3 wallets x 1, maxTotal 2: third claim refused, offer remaining 0; paid: two reservations fill it, third refused until one expires; a late payment for an expired grant loses its price when the list is full again. `npm test` 26/26.

## 2026-10-18: speed audit, same pixels (Hazy: "audit the drawing code further, we need to gain speed without breaking stuff")

- Report: docs/audits/2026-10-18-speed.md. Profile: 28% of the time was the library's 32-bit multiply/divide (C code), 22% the screen update per phase.
- **gb/fastmath.s:** 32-bit multiply, divide and modulo in assembly, linked in place of the library's. Checked with the new test ROM (gb/test/mathtest.c, tools/mathtest.py): 256,000 operand pairs, 0 wrong; a deliberately wrong reference is caught.
- **Only written rows are converted per phase** (px_set/px_row mark the row). The first and the last phase always convert everything.
- **New tools/phasecheck.py** compares every screen of a drawing (not only the last) with the reference build (tools/phases.mjs); it hooks gen_phase so no phase is missed.
- Checks: ROM = native in PyBoy for 1..300 + 12 volcano seeds: 312/312, 0 pixels differ. Every phase screen equal for seeds 1..100. Golden + parity unchanged (no generator change).
- **Speed (PyBoy, seeds 1..300):** mean 64.3 -> 51.5 s (-20%); slowest 166.2 -> 102.2 s.
- **Link (real console):** 15-23 s per piece more than compute (cart test vs PyBoy). "Same as the tile on the left" encoding would halve the link data (24.5 -> about 11 s per piece). Not done: it needs the server parser and a hardware test (report lists the options).
- **Space:** the fixed bank has about 96 bytes left, bank 1 about 230.
- **ROM changed: new sha256 3439998c4260d74d6aec0d30cf03f93ebeec4003e4389d1187b514ffdea110f6** (replaces 73f54501…, never on the cart). Swap order as before, then scripts/test-draw.mjs on a few seeds (62c5bbb9, 32bade25, e8f7b1b8) must match.
## 2026-10-18: Ethereum link on phones (Hazy: "on a phone you can't connect Solana and ETH at once")

- A phone browser runs inside one wallet app, so the old flow (connect Solana, then ETH in the same page) only worked on desktop. Two fixes (Hazy picked 1 + 2 of three options; WalletConnect left out: third-party SDK and requests).
  1. **Link by pasting the Solana address** in the ETH wallet's in-app browser (MetaMask, Coinbase Wallet): page panel with the address field (base58 + 32 bytes + on-curve, also checked by the server), ETH wallet signs the same link message as before, then "open this page in your Solana wallet to mint" with a copy-link button. Server already accepted an unsigned Solana side; claims still need the Solana signMessage, so a pasted address only ever helps that address.
  2. **Multichain wallets**: Phantom/Backpack offered as the Ethereum wallet too (EIP-6963, else window.phantom.ethereum / window.backpack.ethereum / window.ethereum), the app the Solana wallet came from listed first. If a Solana wallet exists in the browser the ETH button connects it instead of asking to paste.
- Server hardening because the Solana side does not sign (from two independent audits of this change):
  - a link is stored only if the ETH address gives something now (holds an NFT with room on an enabled Ethereum list, open now or later); otherwise `{ linked: false }` with what it holds (used up shown as such);
  - **links are never pushed out by newer ones** (before: newest 5 kept, so a stranger could evict a real link): at 5, existing links are re-checked and only those that give nothing any more are dropped, else 409;
  - one failing list no longer blocks the link; one lookup budget (20) per request including re-checks; a failed lookup keeps a link;
  - the link answer covers only this ETH address (before: all of the Solana wallet's Ethereum offers, with unit refs);
  - snapshot `offers.ethLists` (Ethereum lists open now or later) shows the ETH button without a Solana wallet; "opens later" shown for lists not open yet.
- Audit 1 (medium: eviction griefing; low: one failed list blocks, future lists shown as mintable, paste panel where a Solana wallet could connect, ETH button hidden for future-only lists, Rabby mobile wording) and audit 2 (low: used-up NFTs could still hold slots, re-check lookup multiplication; cosmetic: panel toggle after a cancelled connect): all fixed.
- Tests: `npm test` 29/29 (new: paste flow with empty addresses not linked and answer scoped to the ETH address, future list linkable, holdings outage refuses, full wallet frees only dead links, one failing list does not block, used-up allowances neither link nor hold a slot). Page clicked through with puppeteer at 390x844 on the demo: paste flow with an EIP-6963 wallet, paste flow with only window.phantom.ethereum, connected flow; no errors, no horizontal overflow (downloads/ethlink-*.png). Not tested: real MetaMask/Coinbase/Phantom apps on a phone (verify before launch).

## 2026-10-18: audit of the Mac mini's pushes (Hazy: "mac mini pushed some features, pls audit")

- Reviewed b838701 (admin "null" fix), 95813de (whole-list cap maxTotal), 669f104 (Ethereum link on phones), plus the two log commits. `npm test` on main (with the speed commit): 29/29. No secrets in tracked files.
- maxTotal: counts used pieces of every unit plus open reservations; free claims and paid grants both add to usage; the room check and the write have no await in between; late payments and the late-settle bump respect it; validation 1-16384; reconcile flags OVER LIST CAP. Sound.
- Phone ETH link (Solana side unsigned): a link needs the ETH signature, so nobody can link someone else's ETH address; claims and reservations still need the Solana signMessage, so a pasted address only ever helps that address. Links are no longer pushed out by newer ones (fixes eviction griefing); filling a stranger's 5 slots needs 5 addresses that each still hold an eligible NFT with room, and dead links are dropped on the next attempt. The answer is scoped to the ETH address. Off-curve addresses refused (they could never sign a claim). Page: new fields go through clean(); the signed text must contain both addresses. Sound.
- Open (not blockers): real MetaMask / Coinbase / Phantom apps on a phone still untested (Mac mini noted it); the LOGBOOK held Hazy's email and the Access app details (scrubbed the same day, see below); the DMG ran ROM 73f54501, and the speed ROM 3439998c still needs the cart swap and test drawings.
- **ROM 3439998c on the cart (Hazy), checked on the DMG:** test-draw 62c5bbb9 69.2 s (was 76.6), 32bade25 68.3 s (was 75.8), e8f7b1b8 90.2 s (was 100.7), screen CRC ok, tiles match 3/3. Real-console gain about 10% here (the link transfer, 15-23 s per piece, did not get faster). Server restarted on ROM 3439998c, mint closed.

## 2026-10-18: Ethereum wallet can connect before the Solana wallet (Hazy: "u cant connect evm wallets before connecting sol wallet")

- The ETH button connected the Solana wallet first whenever one was in the browser. Now either order works: the ETH button connects the Ethereum wallet first, then (if no Solana wallet is connected yet) asks for the Solana wallet, or shows the paste field when there is none. Normal minters are unchanged: they connect Solana and mint, and never see an Ethereum step (Hazy: "what if someone doesn't need eth").
- The connected Ethereum account is kept for the page; an account switch in the wallet is followed (eth_accounts) without a new prompt.
- Checked on the demo (puppeteer, 390 px, fake wallets): ETH first -> Solana connect -> "Punks holder" offer; Solana first -> ETH -> same offer; Solana only -> normal buy button, paste panel hidden; no page errors.

## 2026-10-18: Cloudflare Access details scrubbed (Hazy: "scrub the cloudflare access details from the repo")

- Removed from the tracked files: the Zero Trust team name, Hazy's email, the Access application's AUD fragment, the login method and app settings (LOGBOOK admin entry), the tunnel id (LOGBOOK tunnel entry), and the Vercel team slug that contains Hazy's email name (SERVER-SETUP.md). The steps stay; the values live only in the Mac mini's `.env` and the Cloudflare/Vercel dashboards.
- Git history still has the old text (private repo). Removing it needs a history rewrite and a force push, coordinated with the Mac mini's clone; not done without Hazy's go.

## 2026-10-18: per-wallet cap `maxPerWallet` (Hazy: "limit it further so someone owning 500 NFTs can't mint 500")

- New optional list field `maxPerWallet` (1-16384): at most this many pieces per collector through the list, however many NFTs it holds. Counts used claims, paid grants and open reservations of the receiving Solana wallet and, on Ethereum lists, of the ETH address they came through (an address re-linked to a fresh Solana wallet does not start over). Enforced in offers (remaining), reservations, free claims, late payments (`fits`) and the late-settle bump, next to `limit` and `maxTotal`.
- Admin page: "Max pieces per wallet, however many NFTs it holds (optional)"; the table shows "max N per wallet"; audit text includes it. reconcile.mjs flags OVER PER-WALLET CAP (per wallet and per ETH address). docs/MINT.md table updated.
- Test (allowlist.test.mjs): Solana 1 per NFT with max 3 per wallet: a 10-NFT wallet gets 3, another holder unaffected; paid: open reservations count, an expired one frees its place, a late payment loses its price while the wallet is full again; Ethereum: 5 NFTs, max 2: two claims, the third refused, re-linking the address to a new Solana wallet gives nothing. `npm test` 30/30.
- Mac mini: pull + restart to use it (no new dependencies).

## 2026-10-18: 5% creator royalty (Hazy)

- Was 0% (leaf sellerFeeBasisPoints 0, no creators; collection without a Royalties plugin, checked with Helius getAsset).
- Pieces: `ROYALTY_BPS` (default 500) and `ROYALTY_ADDRESS` (default the treasury) in config.mjs; each mint carries sellerFeeBasisPoints 500 and one unverified creator (the receiver, 100%). Validation 0..1000 bps.
- Collection: `scripts/set-royalties.mjs` adds (or updates) the Core Royalties plugin, signed by the hot key as UpdateDelegate (no cold wallet needed); dry run by default.
- Devnet (`scripts/royalty-test.mjs`): cold-authority collection, the hot delegate added Royalties 500 bps, a minted cNFT reads in DAS as basis_points 500, creator = receiver 100% unverified. `npm test` 30/30.
- Mainnet dry run: "no Royalties plugin -> 500 bps to the treasury". Sending waits for Hazy's go (spends a little rent from the hot key). Server restarted, so new mints carry 500 bps.
- Note: Solana marketplaces treat royalties as optional on many sales; the setting is what honest marketplaces read.
- **Mainnet Royalties plugin added (Hazy: go):** tx 3bHnuGLqn4sPmjNisUPWK1paUAUMR6s7LtFktMJL8zdEmExPV1EHkBPz6W3WkxjTDYoDezp1wCVQKkJHxbZFmkhg, read back from chain: 500 bps to the treasury 100%.

## 2026-10-18: devnet queue test (Hazy: "will someone who queues receive the NFT when it's his turn")

- New `scripts/devnet-queue-test.mjs`: a separate devnet server (port 8796, temp data dir, its own fresh tree + collection with a cold authority, hot key as UpdateDelegate, 5% Royalties plugin) runs the real `src/index.mjs` with a **simulated Game Boy lane** (`test/helpers/sim-lane.mjs` via `sim-loader.mjs`, devnet tests only: draws the reference picture of each seed in phases), so the payment watcher, seed, queue, storage and mint run for real on devnet. N throwaway buyers pay within ~1.5 s through the website path (/api/ticket -> sign -> /api/submit).
- Run with 4 buyers (tree BPi7h7BQ…, collection EuB7LQVv…): 4 payments -> 4 pieces, no duplicates; numbers in payment order; drawn one at a time in number order (#1 44:26-44:36, #2 44:37-44:47, #3 44:47-44:58, #4 44:58-45:08); each minted while the next was drawing; DAS owner of every asset = the wallet that paid it; name "Slow Horizons #n", 5% royalty, grouped in the collection. **ALL PASSED.** From payment to the 4th NFT in the buyer's wallet: about 65 s (simulated draws of 10 s each).
- Not covered by this run: the real Game Boy's drawing (verified separately with test-draw.mjs on the DMG, 3/3 on ROM 3439998c); a hardware run of this test needs the mainnet server stopped for a few minutes (one port owner) and the Pico plugged in.
- Fix found on the way: the setup child process did not exit after printing (open web3 subscriptions); now exits explicitly.
- Piece metadata JSON now also states the royalty (seller_fee_basis_points 500, properties.creators = the receiver 100%), matching the leaf and the collection plugin. Collection.json on Arweave still has no royalty fields (on-chain plugin is what marketplaces read; updating it needs a new upload + the cold wallet's collection-uri signature).

## 2026-10-18: one-of-ones approved, build spec written (Hazy)

- Ten 1/1 scenes final, in `gen/gen_special.c` (ids 1..10): Fuji at First Light, The Floating Gate, Shirakawa-go, Under the Milky Way, Golden Pavilion in Snow, Sky Lanterns, Bamboo and Fireflies, Moonlit Whale, Ramen in the Rain, Lighthouse in the Storm. Earlier drafts (Sahara, Earthrise, Balloons, Aurora Cabin, Lone Tree) dropped by Hazy. Each has its own palette (PAL_SP + id - 1), a fixed seed (0x1F1F0000 + id) and a hand-continued banner. Golden test 300/300: normal pieces unchanged.
- Hazy: one ROM, the 1/1s appear randomly during the main mint (no second ROM); undrawn ones after an early close are drawn on the Game Boy afterwards and auctioned or given away.
- Rule chosen: seed-derived, sampling without replacement (chance = 1/1s left / mints left up to MAX_SUPPLY), so a sell-out gives exactly ten at unpredictable numbers and anyone can re-check it. Spec: `docs/ONE-OF-ONES.md`.
- Not done yet: ROM (gen_special.o not in gb/Makefile), web/gen.wasm rebuild, server, metadata, tests on the DMG.

## 2026-10-18: one-of-ones, ROM and WASM side (Hazy: "pull, read what you have to do", docs/ONE-OF-ONES.md)

- **ROM builds again with the ten scenes.** gen_special.c compiled to 48 KB, three times a ROM bank. On the Game Boy it is now compiled five times (gb/gen_special0-4.c, -DSP_PART), one bank each: 0 traits/profile/sky/dispatchers, 1 Fuji/Gate/Milky props/Whale, 2 Shirakawa-go/Pavilion, 3 Ramen/Bamboo, 4 Lighthouse/Lanterns. The sp_features/sp_after case bodies became one banked function per scene (code moved unchanged); sp_y is a banked call. PC/WASM still compile the file once. ROM is 256 KB (-Wm-yoA); the EverDrive takes it (verify on the cart).
- Fixed bank was 25 bytes over with the 1/1 hooks: gen_traits (+ pickw, weight tables) moved to gen/gen_traits.c (switchable bank), about 1 KB free now.
- **Link:** start frame `$7E 'S' seed(4) piece(2) special(1) crc(2)` (CRC over the 7 bytes after 'S'); draw() sets gen_special, sends the 1/1's fixed traits in the 'B' frame, clears it when done. The commission card shows the title (two lines when longer than 20) and "1/1  SLOW HORIZONS". gb-link-usb bridge firmware only forwards bytes (server agent read it; no change).
- **Speed, same pixels** (the slow scenes were far over the spec's ~3 min): vnoise in 16-bit maths with its cell/fraction stepped instead of divided and its corner hashes cached; bump in 16 bits; isq bit by bit (equal to the old loop for every input); galaxy steps its rotated coordinates per row and keeps the along-only terms while along repeats; d127 replaces /127 (checked for every value). Milky Way 634 -> 249 s, Lighthouse 417 -> 204 s, Bamboo 316 -> 138 s; others 19-67 s. Milky Way now shows its band in 4 steps (gen_phase every 26 rows; the reference does the same), so no 4-minute still screen.
- **Checks:** every change verified against the ten scenes' piece and banner output saved before the work (byte-identical); golden 300/300; parity.js WASM = native for 500 + the ten (new); ROM = native in PyBoy for 1..300 + the ten (tools/emu.py sp:<id>, new): 310/310, 0 pixels differ; every phase screen equal for seeds 1..100 + the ten (tools/phasecheck.py sp:<id>): 110/110. Normal pieces' speed unchanged (51.5 s mean).
- **ROM changed: new sha256 6cdc438726af3409dcd83c670d5f11281f97cf849020b5e10fa053b73495ec70.** Not for the cart until the server side is merged and Hazy says go.
## 2026-10-18: one-of-ones, server side

- **Rule** (docs/ONE-OF-ONES.md, now published in docs/MINT.md "One-of-ones"): `server/src/oneofone.mjs` (pure `decide`, a pool on state.json, `verify` replay). Runs in `seedTick` when a piece's seed is fixed, strictly in number order (a piece whose seed block is not final yet now stops the loop, so later pieces wait; the pool also refuses out of order). Stored on the piece: `special`, `specialRoll` {roll, roll2, left_1of1, left_mints, seq}; assigned ids + an ordered log (assign / release / leftover) in `state.oneOfOne`, so a restart never hands one out twice. Dev/test pieces never take one and are not counted. Redraws keep it.
- `left_mints` is clamped to at least 1 (only reachable if a cancelled piece's place was sold again past MAX_SUPPLY); written into the published rule.
- **Cancel** (new, needed for "refunded before drawing releases the id"): `ops.cancel(n)` for seeding/queued/failed pieces: status `cancelled`, a refund record for what it paid, its 1/1 back to the pool (logged with `after` = last piece decided). Token API `/admin/cancel`, admin page "Cancel + refund" on failed pieces (passkey). Cancelled pieces no longer count in `minted()`.
- **Link**: start frame `$7E 'S' seed(4) piece(2) special(1) crc(2)` (`src/lanes/frame.mjs`, shared by the hardware and simulated lanes); `draw(seed, piece, special)`. gb-link-usb firmware: bridge mode only forwards bytes (firmware/src/main.c, no frame parsing), so no firmware change (read, not tested).
- **Renders**: `withSpecial` / `drawPiece` / `traitsOf` in reference.mjs set `lab.special(id)` around every 1/1 render and always reset it; tile check, PNGs, traits, sim lane. reference.mjs refuses to start if gen.wasm has no `special` export. Watchdog gap 300 s instead of 150 s for 1/1s (verify the real gap on the DMG).
- **Metadata**: 1/1 name "Slow Horizons #n: Title" (JSON only; on-chain name unchanged, 32-byte limit), attributes Edition 1/1 + Title, `properties.one_of_one` {id, title, roll, roll2, left_1of1, left_mints, rule}. Normal pieces unchanged. describe.mjs: ten DRAFT sentences, waiting for Hazy.
- **Public**: `GET /api/one-of-ones` (rule, holders, log), `special`/`title` on public pieces, snapshot `oneOfOnes`. Mint page renders 1/1s with `lab.special` (gallery sheet, banner, idle screen, replay), shows the title.
- **Discord**: a 1/1 sends its own message when drawn (forced past the 5 min limit) with a Discord embed: title, number, image.
- **Admin**: "1/1s assigned x/10" with the remaining ids; "Draw leftover 1/1 (costs SOL)" only with the mint closed: id + wallet, passkey bound to both, audit + alert. It queues a piece with the scene's fixed seed `0x1F1F0000 + id`, drawn on the Game Boy and minted by the normal mint worker.
- **reconcile.mjs**: replays every decision and release; flags an id assigned twice or anything that does not re-derive from its seed.
- **Scripts** (not run): `test-draw.mjs special [ids]` draws the ten on the DMG; `devnet-queue-test.mjs` with `ONE_OF_ONES=1` (MAX_SUPPLY = buyers) checks 1/1 metadata and webhook messages.
- **Tests**: `npm test` 44/44 (was 30): rule (2000 seeds -> exactly 10, distinct, same on re-run; stop at 1000 -> mean about 5 over 40 runs, leftovers listed), tiny supply, serialization, restart, dev excluded, release, tamper detection, leftover checks, start frame + CRC (hardware and sim lane), sim lane draws the scene; end to end on the real server with the simulated lane (MAX_SUPPLY 12: dev pieces, restart halfway, all ten once, PNG = scene, metadata, webhook, /api/one-of-ones, reconcile ok and catches a swap); admin leftover action guarded (closed only, passkey bound to id + wallet, audit, alert).
- **Correction to the handoff**: the committed `web/gen.wasm` (42 KB) has no `special` export (`TypeError: e.special is not a function`). The tests above ran against a local build of the same sources (85 KB, not committed). Until a rebuilt gen.wasm lands, the server refuses to start and `npm test` fails on this branch.

## 2026-10-18: 1/1s clearly shown (Hazy: "1/1s have special metadata and attributes clearly shown, and specially shown in the gallery")

- Metadata: 1/1s lead with Edition 1/1 and Title (already), and now every normal piece has Edition Open, so marketplaces can filter "1/1" vs "Open" (nothing is minted yet, so no live metadata changes). Pieces from the API carry `specialRoll` for the page.
- Gallery: new Edition filter (facet in gallery.mjs), and a one-tap chip "The 1/1s · x of 10 drawn". 1/1 cards get a pixel "1/1" badge and an ink frame, caption "No. n: Title" and "1/1 · #id of 10".
- Piece sheet: a 1/1 box (badge, title, "#id of the ten hand-made scenes. There is only one."), the fair rule's numbers in plain words (roll mod left_mints, below the 1/1s left, the chance) with a link to /api/one-of-ones; Edition and Title first in the traits. Leftovers say they were drawn after the mint.
- Live: a toast when the rule assigns a 1/1 ("A 1/1! No. n will be ..."); the studio label shows "No. n · 1/1" and the title while it waits and draws.
- Demo server shows three simulated 1/1s. Checked with puppeteer at 1440 and 390 px: filter gives 3, sheet shows the proof, no page errors, no horizontal overflow. `npm test` 44/44 (the e2e test now expects Edition Open on normal pieces).

## 2026-10-18: mint page "How it works" (Hazy: "update the FAQ part, make it cleaner, explain the mint without being AI sloppy, like explain the queue")

- The "Evidence" block is replaced by "How it works": five short steps (pay once, get your number, your seed is set about 13 s later from your payment and a new block, the Game Boy draws it phase by phase in about a minute, checked pixel for pixel then minted to the paying wallet), then plain answers that open on tap: wait time, finding your place, the 1/1s and their rule, allowlists and the Ethereum link, what you get, what happens when something goes wrong (closed = nothing charged; late or failed twice = refunded), not a smart contract, and the four pieces of evidence (shorter than before). No price in the copy (the page shows the live price).
- Checked on the demo at 1440 and 390 px: no horizontal overflow, no page errors.

## 2026-10-18: 1/1 descriptions final (Hazy: "audit the descriptions, adjust if needed")

- Checked each sentence against the rendered scene. Changes: Fuji adds the birds; the Gate no longer says "vermilion" (the torii is a dark silhouette on a red sky) and mentions the sun's light on the water; Milky Way says ridges (not peaks), the reflection in the lake and the person pointing up; Pavilion: pines on the hill behind; Bamboo: the fenced path; Ramen: steam and the red lantern; Lighthouse: the lightning. Others were accurate. DRAFT note removed. `npm test` passes.

## 2026-10-18: "you can close the page" everywhere

- (Hazy: "make sure they know they can just close after commissioning, it will arrive in their wallet") The close-the-page message is now on the "Your place in line" card (bold line), in the toasts after paying and after a free claim, in the "payment on its way" note, under the buy button, and in steps 1 and 5 of How it works. Checked on the demo as a collector at 390 px.

## 2026-10-18: several pieces in one payment (Hazy: "allow people to pay for multiple pieces at once", no per-wallet limit)

- Quantity picker on the page (public price only, 1..what is left); one transaction for qty x price; the server makes floor(received/price) pieces numbered in a row, as many as are left minus open allowlist reservations; leftover lamports are a refund (overpaid / sold-out). Seeds: 1st piece sha256(sig||blockhash) as before, the others sig + ":i". Metadata: payment_piece, seed_input, seed_formula. Allowlist prices stay one per payment.
- Audit (subagent) fixes: public batches respect allowlist reservations; reconcile ignores leftover 1/1s (no payment) and checks that pieces sharing a signature are one complete batch; page shows "Nos. a-b" once (not one toast per piece) and a toast for a partial sold-out refund; piece sheet shows ":i"; one seed-block lookup per payment slot and one save + one snapshot per big tick; snapshot line sends full pieces only for the first 30.
- Found by the devnet test: the /api/submit fast path evaluated each signature alone, so a payment one slot later could get a lower number. It now nudges the watcher (oldest first) instead.
- devnet-queue-test MULTI=8 with 3 buyers: ALL PASSED (8 in a row, 8 seeds, all in line together, numbers in payment order, every piece minted to the payer per DAS). npm test 44/44.
- Also: wrap-up alert once the mint has ended and the queue is empty.

## 2026-10-18: audit of the multi-piece pushes (Hazy: "we pushed some changes and fixes pls check and audit")

- Reviewed cef8e9b, 83bbac0, e9f09b3, 1db914e, b2f8877 (independent review, report only, then fixes here). No way found to get more pieces than paid for, or to pay without a piece or a refund record. Pieces = min(floor(received / price), room), change refunded, a grant always buys one piece, seed input sig / sig:i plus the seed block (N cannot steer a seed), 1/1 rule still decided in number order, fast path only nudges the watcher (numbers follow payment order, no double processing), page signs exactly qty x price.
- Fixed: reconcile now checks amounts per payment (on-chain received = pieces' shares + its refunds, cancelled refunds not counted twice) and that every `refund:id` record exists; a late grant payment no longer ignores other holders' open reservations (`reservedCount(exceptTicket)`); the "only X of your Y pieces were left" toast only shows for a sell-out, not for overpaid change. `npm test` 44/44.
- Open (low, noted): a public payment confirmed before a reservation can still be refunded sold-out at the boundary (room uses reservations at evaluation time); change refunds below the dust limit are recorded but cost more to send; the submit fast path polls up to every 5 s for 60 s per submit (RPC load in a rush); a second "wrap" alert can fire after a cancel post sell-out; order within one slot follows getSignaturesForAddress (verify).

## 2026-10-18: clouds never vanish behind the mountains (Hazy: "I'd rather clouds don't disappear behind other traits, well not fully"; then "Go")

- Cause (docs/CLOUDS-AND-LAYERS.md): clouds are painted before the ridges and know nothing of them, so a low cloud got sliced or swallowed by the ridge line; a "clouds" piece could show almost none.
- Fix (gen/gen_sky.c, placement and random stream unchanged): after the last ridge, cloud_front() measures each cloud against the skyline; a cloud covered for more than half goes on in front where it is covered, as see-through mist over a ridge, whole over far haze that looks like sky; partly covered clouds stay behind as before; a cloud that would barely show (the colour of the haze in front of it) is left alone, so no dotted slivers. A piece's cloud is judged inside the piece only (banner centre stays the piece); the ten 1/1s are untouched. Shown to Hazy as before/after sheets.
- Cost kept down: each puff row's half-width computed once instead of an ellipse test per pixel (also speeds the original cloud drawing). vnoise's caches are now one shared copy for the five 1/1 parts (WRAM back to 6632 bytes, about 1.4 KB stack).
- Checks: traits identical 1..300; 119 of 300 golden pieces change (regenerated); parity.js WASM = native 500 + the ten; banner centre 308/308; ten 1/1s byte-identical; ROM = native in PyBoy 1..300 + the ten: 310/310; phase screens 100 + 3: 103/103. Mean draw time 51.5 -> 52.4 s.
- **ROM changed: new sha256 2758c2935339ab2ca0628ed84c45d75aebca836a52be22399190427772618bdd** (replaces 6cdc4387…, which never went on the cart). Swap order as before; test drawings incl. a 1/1 (test-draw.mjs special) and a few clouded seeds (2, 11, 18).

## 2026-10-18: the glitch extra becomes "LCD ghost" (Hazy: "I like the idea of a glitch but make it look intentional"; picked LCD ghost)

- The old glitch (random row bands shifted by random amounts plus a random inverted rectangle) read as a broken image. Tried and shown: tile tear, signal wave, negative band, LCD ghost, scroll split; Hazy picked the LCD ghost.
- Now (gen_ground.c, draw_finish): a faint echo of the whole scene 4-7 px right and 1-3 px down, blended into the tones before dithering (about 45%), so it dithers softly like an old screen that has not caught up; crisp shapes (sun, moon, trees, boats) stay crisp and leave their echo on the sky and land around them. Same trait bit (X_GLITCH), shown as "LCD ghost"; describe.mjs: "a ghost image on the screen". About 3% of pieces (62 in seeds 1-2000), 9 of the 300 golden pieces change; the banner keeps the piece in its centre (the sides stay clean).
- Checks: traits identical except the name; golden regenerated; parity.js ok; ten 1/1s unchanged; banner centre 308/308; ROM = native in PyBoy 1..300 + 20 ghost seeds + 3 1/1s: 323/323; phase screens of the 20 ghost seeds 20/20; npm test 44/44.
- **ROM changed: new sha256 4ac53f08f78f6ac4d50a9bf7f392d1ea9699770ad58900d850af9da78d437552** (replaces 2758c293…, never on the cart).

## 2026-10-18: new ROM on the cart, collection.json updated (Hazy)

- Hazy put ROM 4ac53f08 (clouds in front as mist, LCD ghost) on the EverDrive. Real Game Boy test drawings (test-draw.mjs): seeds 2, b, 12 (clouds), e (LCD ghost) 4/4 match, 1/1 #6 Sky Lanterns match. Server restarted on it, closed, 0/2000.
- Collection description now "one piece at a time" (multi-piece payments) and collection.json carries the royalty (seller_fee_basis_points 500, creator = treasury 100%): https://arweave.net/Od2nTgJjQ03iJXIDt99G0rVru-km3EimNGFyTiB1TJ8. Cold wallet signed collection-uri (Jupiter); verified on chain: uri updated, update authority CQbk... unchanged, hot key still UpdateDelegate, Royalties 500.
- sign.html is not deployed (on purpose) and only knows injected wallets: for this signing a temporary copy ran behind a Cloudflare quick tunnel, built the transaction itself on load (pasting from Discord truncated it) and added Wallet Standard (Jupiter). Taken down right after. If cold signing comes up again (remove-delegate after the mint), sign.html needs Wallet Standard support for Jupiter.
- New collection cover (Hazy picked from 6 new renders): seed 972a8469 "moonlit peaks" at 960x864, https://arweave.net/fN0jmREgmzQmzy7iuhk79vCMDpzHpNIlYlQlnivlRtY; collection.json https://arweave.net/aKWtb_v8snonxBzODD5fOEsYeRTEC_xc6l_09TiO5T4 (same text + royalty as above). Cold wallet signed collection-uri (Jupiter, temporary page again, taken down); on chain: uri updated, authority/delegate/royalty unchanged.

## 2026-10-18: no live camera (Hazy: "no live camera")

- Removed the hidden "Camera" tab, its placeholder text and the channel switch from the mint page; the studio bar now just says "Link cable" (what the window shows). The per-piece "Watch the recording" link only ever appears when STREAM_URL is set, so leave it unset.
- Arweave (Hazy: "isn't it free?"): yes while Turbo's free tier holds (0 winc up to 106,000 bytes per file, LOGBOOK 10-17). Measured: image 22 KB avg / 31 KB max, hires 65 / 89 KB, 1x 3 / 4 KB over seeds 1-300; replay.json at most ~100.3 KB over seeds 1-2000 and the ten 1/1s (100.3 KB for the Milky Way 1/1). All under the limit, but the replay has only ~5% margin: if Turbo lowers the free size, replays get charged and an unfunded key fails the upload (and one failed upload blocks later ones, open audit item). A small Turbo credit or gzip/trim of the replay would remove that risk (not done).

## 2026-10-19: Mint page heartbeat age in minutes, hours, days
- The heartbeat note said "last reading 78729 s ago" after a day offline. It now reads seconds under a minute, then min, h or d (floored), e.g. "last reading 21 h ago".

## 2026-10-19: Tracking everything for the admin page (Hazy: "track anything, we need data")
- New append-only `DATA_DIR/activity.jsonl` (server/src/activity.mjs). Server-seen facts: eligibility checks (which lists), Ethereum links (eth, sol, lists, remaining), payments prepared (ticket) and sent (signature), free claims (list, unit, number), every API error. Page-reported (marked `page`, unverified, never used for money): visits (random visitor id in localStorage, referrer host, mobile/desktop), Solana and Ethereum wallet connects (address, wallet app), commission steps, wallet errors and cancels. New public endpoint `POST /api/track` (validated, 2 KB, rate limited).
- No IP addresses are stored in it (e2e test checks). Wallet addresses are public on chain anyway.
- Admin page: new Activity tab. Totals (visitors, Solana/Ethereum wallets connected, devices, eligibility, payments, collectors with pieces and SOL, holder list uses, errors), wallet apps, a collectors table (from the pieces, the money truth), holder-list uses with the Ethereum wallet and NFT behind each claim, linked Ethereum wallets, top errors, a filterable feed, and a download of the full log. Refreshes every 15 s.
- Tests: unit test for the log (restart, torn line), e2e for the endpoint; server 45/45. The Activity tab itself was not looked at in a browser: the admin login needs a real passkey (verify on the Mac mini).

## 2026-10-19: Main site console: Select/Start rims fixed (gameboy-labs-site c39c2b5)
- Hazy saw a broken ring around Select/Start on the 3D console. Cause: the site's kagiboy.glb is a reduced copy (body cut to 36k triangles) and the reduction tore the small steep recesses into jagged fans. The full mesh in kagiboy.blend is clean.
- Fix: render/site_glb.py rebuilds the site copy from the full mesh, keeps the Select/Start recesses at full detail (rest of the body 40k triangles) and copies the full mesh's normals. 1.46 MB, mesh names unchanged. Checked in close renders and in Chrome on the branded console; needs `vercel deploy --prod` to go live.

## 2026-10-19: Pre-mint audit (mint tomorrow): mint page fixes
- Three reviews in parallel (money path on the server, mint page and admin UI, launch readiness). Own checks: golden 1..300 ok, wasm = native (500 + ten 1/1s), ROM 4ac53f08 = cart, server 45/45.
- Fixed (page): the first click on "Connect wallet to commission" could ask a free-claim or allowlist wallet for a public-price payment, because the offers were still loading (reproduced in the demo). Now a wallet that connects through that button with an offer sees its options first and presses again.
- Fixed (page): seedBlock, frames, heartbeat intervals/reports, batch numbers and gallery facet counts are checked as numbers before they reach HTML (audit M1 rule).
- Fixed (page): offers are re-checked only when the lists change, not on every snapshot (was one eligibility call per snapshot per connected wallet in a rush). Wallet cancels are tracked as steps, not errors. Inputs 16px on phones (iOS zoom).
- Server review (money path): no blocker. Double-mint, piece count per payment, supply, numbering, 1/1 order, restart recovery and the Yumemono caps (1 per NFT, 1 per Solana wallet and per ETH address, 555 total) all checked.
- Fixed (server): the watcher now counts progress as alive, so a long pass in a rush no longer closes the mint as "payment watcher behind" after 120 s. One failed Arweave upload no longer holds up every later piece (it retries, the rest go on; alerts stay throttled). /api/track has an overall rate limit besides the per-IP one, control characters are stripped, page events stop being written past 200 MB, in-memory counters are bounded, page errors are their own kind (page_error) so they cannot drown server errors. reconcile.mjs now flags a piece that goes to another wallet than the payer (WRONG WALLET).
- Not changed (noted): a dust flood with our memo still costs a full state save per transaction (slows the watcher, costs the attacker ~0.05 SOL per 10k); a memo without a valid ticket or plain SOL with no memo leaves no refund record (reconcile shows UNRECORDED). Yumemono max 1 per wallet is per wallet, so N NFTs over N wallets give N pieces; 555 is a cap, not a reservation (if the public sells out first, unclaimed holders get nothing).
- Server 45/45. The Mac mini must pull and restart for the server fixes and the activity tracking.

## 2026-10-19: Turbo credits checked (Hazy: "what is a turbo credit, can u check")
- ar.io docs (docs.ar.io/build/upload/): mainnet uploads under 105 KiB are free; the page names no lifetime or per-wallet cap. The 100 MiB lifetime-per-wallet/per-IP cap on docs.ar.io/build/testnet/uploading-and-credits/ is for the testnet sandbox only (it calls mainnet's free size 105 KiB) (verify on mainnet: watch for HTTP 402 FREE_TIER_EXHAUSTED in the storage alerts).
- Live price (payment.ardrive.io/v1/rates, 2026-10-19): about $81 per GiB of credit, plus a flat per-item fee (~$0.00002). The top-up infrastructure fee is taken out of the payment (35% in the live quote), so ~$125 paid per GiB.
- For us: only files over 105 KiB would be charged; one 110 KB replay is about 1-2 cents. $5 covers hundreds of them. Worst case (every file charged, ~380 MB for 2000 pieces) is about $45-50.
- How: console.ar.io/topup (card via Stripe, or SOL/USDC/ETH/AR), credits go to the upload wallet's Arweave address (the Mac mini prints it from .keys/arweave.json; not read here). Hazy's call, optional.
- Correction to the entry above: the upload key (.keys/arweave.json) is a Solana keypair (storage.mjs, token 'solana'), so the credits go to that Solana address, not an Arweave address. No setting is needed: Turbo takes non-free uploads from that key's credit balance on its own; storage.mjs already logs any upload that was charged.

## 2026-10-20 — Phantom payments refused ("unexpected instructions")

- After reopening, every Phantom payment (mobile and desktop) was refused by `/api/submit`: Phantom appends Lighthouse assertion instructions (program `L2TExMFKdjpN9kozasaurPirfHy9P8sbXoAN1qA3S95`, verified executable on mainnet) while signing. Nothing was broadcast or charged (treasury had no payment in that window).
- Fix: `checkSignedPayment` also ignores up to 8 Lighthouse instructions; transfer, recipient, amount, memo, fee payer and grant wallet are checked exactly as before, any other program is still refused. Refused submits now log their program ids (`submit refused` in the server log, `submit_refused` in activity). Tests: `test/payment-check.test.mjs` (8), full suite 65/65.
- Verified live: No. 9 paid via Phantom, tx `3wMVNxLu…kCisN` = ComputeBudget ×2, Lighthouse, transfer, memo, Lighthouse.

## 2026-10-20 — First paid Arweave upload (1/1 No. 43)

- No. 43 (1/1 #10 Lighthouse in the Storm) drew in 210 s; its hires PNG is 109,248 bytes, over Turbo's free limit (~105 KiB), and the upload key had 0 credits, so Turbo answered 402 and the piece waited (alerts every retry). Regular pieces so far: hires 37-89 KB.
- Fix: 0.01 SOL from the minting wallet to the upload key (tx rGD4YReP…Yqy), 0.009 SOL topped up as Turbo credits (163.49B winc, tx 5wPVYGvS…NCWNF). The next retry uploaded it; charged 1.45B winc (~110 such files per top-up). Script: `server/scripts/fund-turbo.mjs` (quote/send/topup/balance, max 0.02 SOL per run).

## 2026-10-21 — Download replay as GIF
- Button "Download replay (GIF)" on Finished cards, Your pieces and the piece sheet. web/replay-gif.js builds it in the browser from pieces/N.replay.json: blank LCD, each screen update landing in 24-row bands, real pacing (~9 s), then the palette fade and a 4 s hold; 480x432, loops; ~0.65-0.8 MB, ~1 s to build. Verified: LZW decodes pixel-exact in Pillow (incl. a 7-colour noise image with dictionary resets), last drawing frame equals the decoded tiles; live page click produces slow-horizons-N-replay.gif.

## 2026-10-21 — Holders could not send pieces
- Phantom ("fees cannot be calculated") and Tensor failed to transfer Slow Horizons pieces; a correct Bubblegum V2 transferV2 simulates fine (720 bytes, canopy-truncated proof 6). So the wallets do not build V2 transfers.
- Added "Send to another wallet" under Your pieces: POST /api/transfer builds transferV2 from DAS (checks collection + current owner, simulates), the page checks it is one Bubblegum instruction paid by the holder naming the typed address, the holder signs, POST /api/transfer/submit relays only if the non-ComputeBudget/Lighthouse instruction equals the built one. Checks unit-tested on mainnet data (plain, Phantom-style guards OK; other recipient, doubled, non-owner refused). 65/65 tests.

## 2026-10-22 — Day one: Hazy's plans for the rest of the mint (announced, not yet in code)
- At 291 sold (gallery API, 118 paying/claiming wallets, 1/1 No. 43 found, 9 left), Hazy announced:
  - Any money the mint makes will be donated to a local pet shelter.
  - The mint will be closed after some days. What is minted by then is the final supply; 2000 stays only as the ceiling.
  - After the mint closes, holders get a free airdrop: an NFT character in the Game Boy design. Who exactly qualifies (holders at a snapshot?) is still to be decided (verify).
- Closing early needs no code change: the admin page can already stop sales. Before closing, decide what happens to the unfound 1/1s (they stay undrawn) and say it publicly.
- Day-one video: everything shown is real minted art (pieces/N.png from /api/gallery, downsampled to 160x144). Script kept with the other launch videos (scratchpad, thanks.py).

## 2026-10-22 — Close date set: Monday 2026-10-26, 8am ET
- Hazy: the mint officially closes Monday 8am ET, announced in the day-three post and video. That is 08:00 EDT (US summer time runs to 1 Nov) = 12:00 UTC = 21:00 JST. At the time of the announcement: 370 pieces, 144 paying/claiming wallets, 1/1s No. 43 and No. 301 found, 8 left.
- The server has no timed close (mintOpen() checks state.closed, set only by the admin page). Someone must press close at that time, or a CLOSE_AT setting gets added first. Payments that arrive after close still need a decided path (refund).
- Launch video scripts now live outside the session scratchpad (it was cleared): ~/Projects/gameboy/launch-videos (closing.py, refresh.sh, minted/ from the gallery API). Not in this repo.

## 2026-10-22: key files locked
- Hazy asked that nothing can touch the Slow Horizons keys. `chflags uchg` set on `server/.keys/`, `authority.json` and `arweave.json`: rm, overwrite and rename now fail with "Operation not permitted" (tested on a dummy file first). Server only reads them, so nothing else changes. Checksums before and after match; /api/health ok. Undo (Hazy only): `chflags nouchg server/.keys server/.keys/*.json`.

## 2026-10-23 — No. 404 stall: loose orange wire (Pico GP2 -> Game Boy SIN)
- Symptom: after No. 403 every piece failed with "the Game Boy did not start the drawing"; three faults paused the lane. The Game Boy kept polling and showing its idle screen.
- Checks: the six stuck seeds (404-409) draw pixel-exact in PyBoy (tools/emu.py, 0 pixels differ), so the seeds are fine. On the laptop the raw link showed the Game Boy's hello and polls arriving, but after a start frame it kept polling and never sent 'B': bytes from the Pico never reached it. A Game Boy reboot made it work once, then it failed again, so the fault came and went.
- Cause: the orange wire (Pico pin 4, GP2, to the cable's SIN) was loose. A fresh jumper fixed it: the next start frame got 'B' at once. Back on the Mac mini, resumed, No. 404 drew.
- Note: GB -> PC polls and the heartbeat prove only the red/green wires; a dead orange wire looks exactly like "Game Boy ignores seeds". Secure the wires.

## 2026-10-23 — Community codes as a list type
- Hazy: besides wallet lists and collections, a list can be a code that Hazy sets for a community, with how many pieces it gives in all and how many per wallet.
- Built as `type: "code"` in lists.json (admin page: Who = "Anyone with a code"). Solana only, counted per wallet (`limit` = pieces per wallet), `maxTotal` required, because a code can be passed around and only the total really bounds it. Codes are not case sensitive, stored in capitals, unique across lists.
- The page: "Have a community code?" while a code list is open, or a `?code=` link. The code goes with the eligibility check, the reservation and the claim; without the right code a code list gives nothing. Typed codes: 10 tries per minute per IP, every try logged (activity `eligibility` with `code`, `codeOk`). Changing a code voids open reservations made with the old one.
- Checks: 3 new tests (validation; right/wrong/missing code, per-wallet limit, total cap across wallets; paid code price and code change), full server suite 68/68 pass. Not yet tried in a browser or on the live server (needs a server restart on the Mac mini).
- Correction (same day): live, the code button never showed. The page already had an empty `renderCode()` (left from the removed source panel) that overrode the new one. Renamed to `renderCodeBox()`. Checked on the live page in headless Chrome: the button shows, and `?code=TESTCODE` opens the box with "Connect your wallet to use it".
- Hazy: added a code, "the price didn't change". The big price at the top always showed the public price (also for allowlist and holder offers; only the button and the "Your price" box changed). It now shows the chosen offer's price, or "Free". Whether Hazy's code itself gave an offer is not checked yet (verify).

## 2026-10-23 — Day-four video (today's mints)
- Hazy asked for a playful video about today's mints and art, pointing to the open 1/1s, without repeating earlier videos. Script: ~/Projects/gameboy/launch-videos/today.py (55 s, 120 bpm), out: ~/Desktop/slow-horizons-today.mp4, post text on the Desktop.
- All real data from /api/gallery at 21:00 JST: 60 pieces drawn today JST (No. 371-430) as a time-lapse with their draw times; today's rare ones No. 413 eclipse, 375 ringed planet, 394 twin moons, 378 aurora, 401 two suns; 430/430 `match`; 1,704,659 frames; heartbeat recorded on all 430.
- 1/1s: only the two found (No. 43, No. 301, public) shown; the eight others are "?" boxes, no titles. "1 in 196" = 8 / (2000 - 430), the published rule (chance = 1/1s left / mints left).
- The heartbeat is shown without a ppm number: the -56 ppm is relative to the Pico's crystal, whose own error is unknown.

## 2026-10-24 — Shinigami Realms collab video and tweet draft
- Hazy: small collab with the Shinigami Realms NFT collection, giving away a secret 1/1. Video asked for: a 3D Game Boy falls, angles, lands, boots with Slow Horizons, dive into the screen; then everything on the screen: a ninja game whose hero looks like their PFP (a skeleton samurai), their PFP, a "?" secret 1/1, an epic fight, thanks for the pet shelter, end card with the link and Monday close.
- Built in ~/Projects/gameboy/launch-videos/shinigami/ (not in this repo): sprite.py (samurai drawn by hand from the PFP), screen.py (all 160x144 screen scenes), shini3d.py (Blender, EEVEE; opens gb-wallet's kagiboy.blend read-only, never saves; face and bezel prints hidden, cartridge label made plain, so no branding), compose.py (picture + a 160 bpm in-scale chiptune written in code). Out: ~/Desktop/slow-horizons-x-shinigami.mp4.
- Their PFP (Downloads/DEMON_3_1_1.gif, 8 frames) is shown animated at 128x128, drawn line by line. The secret 1/1 is only a "?" over noise; no 1/1 art shown.
- Tweet draft (from Shinigami Realms' side) on the Desktop: shinigami-collab-tweet.txt, long and short versions, handles left as placeholders. 48 h from Saturday evening JST ends about when the mint closes (Monday 21:00 JST).

## 2026-10-25: last-day video (old Japanese TV ad style, ElevenLabs voice)
- Hazy asked for a special last-day video with a cute anime girl voiceover, styled like an over-the-top old Japanese TV commercial, as a final reminder without repeating earlier videos.
- Angle that is new: the 8 unfound 1/1s are never drawn once the mint closes (LOGBOOK 10-22: unfound 1/1s stay undrawn). Counts from the live gallery at render time: 494 minted, 181 wallets, 1/1s No. 43 and No. 301 found, 8 left.
- Hazy gave an ElevenLabs key (Creator plan). Stored in ~/.config/elevenlabs/key (mode 600), outside every repo. Pasted in chat, so Hazy may want to rotate it.
- Voice: library voice "Kano - Cute & Anime" (Japanese), eleven_v3, English lines with Japanese bits. Takes picked by checking each with speech-to-text. Music: ElevenLabs music (80s Japanese CM jingle, instrumental, 32 s). 12 sound effects from ElevenLabs. Cost about 1,000 credits of the 131,000 a month.
- Picture: 3D Game Boy turntable (Blender, kagiboy.blend read-only, prints hidden, plain label) with real minted pieces on its screen, sunbursts, slam-in Japanese and English text, pixel cat and dog, VHS look. 32.5 s, 1080x1080, 30 fps.
- Script: ~/Projects/gameboy/launch-videos/lastday/cm.py, out: ~/Desktop/slow-horizons-last-day.mp4, post text: ~/Desktop/slow-horizons-last-day-post.txt.

## 2026-10-26: collab giveaway winner video
- Hazy: winner of the Shinigami Realms collab giveaway (secret 1/1) is @huntyhepcat, 44 entrants (list from Hazy). The 1/1 is sent to the winner's wallet after the mint. Hazy picked concept 2 (samurai boss fight) and asked for studio quality, no shortcuts.
- Film: ~/Projects/gameboy/launch-videos/winner/ (compose.py, wscreen.py, art.py, font5.py, win3d.py), out ~/Desktop/shinigami-giveaway-winner.mp4, 61.5 s, 1080x1080, 60 fps.
- All 44 handles appear exactly as given (entrants.txt, checked: 44 lines, no duplicates). A 5x7 pixel font with lowercase was drawn for this so handles keep their case. 43 entrants are enemies with name tags, defeated on the beat of the battle music; the counter runs 44 to 1; the last one is an egg; the giraffe from @huntyhepcat's PFP hatches (pixel art drawn from the PFP); then the secret 1/1 "?" card ("sent after the mint"), the real PFP drawn line by line, credits with all 44 names, end card.
- 3D: kagiboy.blend read-only, prints hidden, plain label (as before). New shots: macro slide over the buttons, low side, front, power on, dive; pull back at the end.
- Sound from ElevenLabs: music made as four pieces cut on the scene changes (one composition-plan take put the sections in the wrong places, so it was dropped except its 11 s intro), announcer voice "Don - Movie Trailer Narrator", a samurai shout and "omedetou" from "Ryu - Characters", 13 cinematic effects. In-game hits stay chiptune, made in code. Each voice line checked with speech to text inside the final mix; "Hunty" was masked in the first take, a clearer take was used.
- Correction (same day, Hazy's review): the voiceover was "crazy bad", the name tags too big, the samurai looked bad with stiff animation (legs froze during slashes), and the 3D intro repeated the collab film. Changes: no voice at all; tags in a new tiny font (font3.py, about 2/3 the size); samurai rebuilt as a rig (ninja.py: the collab head kept, new torso, limbs and katana drawn from joints; 8-frame run cycle with bob and arm swing; slash winds up behind the head, arcs over the top with a smear, follows through; attacks are upper body only so the legs never stop); new intro: a classic handheld boot screen (pale green, wordmark scrolls down, own two-tone ding, a held beat), the ninja dashes through, two cuts appear in an X and the screen splits apart like cut bamboo onto the title. The scrolling Nintendo logo is not used (no Nintendo branding rule); our SLOW HORIZONS wordmark scrolls instead. 3D now only at the end (pull back). 57.5 s.

## 2026-10-26: post-mint gallery (branch post-mint-gallery, not deployed)
- Hazy: turn the mint page (same URL) into a polished gallery and record of the experiment. Art first, then the tech with real footage. Collectors download all their pieces at once and make collages (grids, X header, wallpaper, banners). Freeze the data after the mint. No donation mention. Footage of the real console stays as filmed (Hazy: "we used a real gameboy so its fine").
- Layout picked by Hazy from three: "The wall, then the room". Every piece on one wall (salon hang, 1/1s at 2x on desktop), title band under it; collection with trait filters and search; the ten 1/1s (found, drawn after the mint, never drawn: from the data, not hardcoded); How it was made (film of No. 115 drawing, seed, link cable with the setup photo, the drawing as screen recording, proof with every piece's heartbeat, kept for good); close links Game Boy Labs.
- Piece view (#piece-N, matches the NFT metadata external_url): replay of the drawing from its replay file, traits, seed block, heartbeat, downloads (full size and original from Arweave, banner drawn by gen.wasm in the browser, replay GIF).
- Collector view (#collector-ADDRESS): connect wallet or paste address (no signing), pieces minted to that wallet, Download all as one ZIP (full size + banners; small store-only ZIP writer web/zip.js, verified with unzip), collage maker drawn on canvas with whole-step scaling.
- Ownership shown is the wallet at mint (pieces.json). Pieces bought later show under the minting wallet; an on-chain owner lookup would need a DAS RPC (not done).
- Data: web/tools/freeze.py writes web/data/pieces.json, atlas.png (all 160x144 originals), replays/N.json, og.png. First freeze at 17:38 JST: 513 pieces, 185 wallets, 513 replays, all matched. It hit the live mint server's rate limit (429) at first; now 2 connections for the server, images from Arweave, cached on disk. Re-run after the mint closes.
- Found: Arweave redirects every file to a subdomain, so the CSP (web/vercel.json) now allows https://*.arweave.net for img and connect, or downloads would fail in production. Checked a real fetch of a full-size and an original image from inside the page.
- Note for the record: Nos. 509 to 514 are six leftover 1/1s drawn today to one wallet (Afn1uM…). The last-day video said unfound 1/1s would never be drawn; the gallery text follows the data.
- Design process: impeccable (PRODUCT.md, surface brief with direction contract, finish review). Review round 1 asked for recaptures (phone width needed DevTools emulation; headless Chrome cannot go below 500 px), round 2 listed 8 fixes (step kickers, gap above the art, hover scaling, collage shadow, Silkscreen on a control, last row of the wall, empty column, show-more label), all fixed; one regression (holes in the phone wall) fixed; verdict ship (scoped to those fixes).
- Open: Hazy's X handle for the close (not known, not invented); re-freeze after close; deploy only on Hazy's go.
## 2026-10-26 — Wrap-up: mint closed at 507, leftover 1/1s and 40 grants to Hazy's wallet (555 total)
- Hazy: close now (ahead of the announced 21:00 JST), mint all eight unfound 1/1s and enough extra pieces to reach 555, all to `Afn1uMqSCtjLLHfcGVjhTKrhQ8LfvQ67z86wAaM924Lp`.
- Closed via POST /admin/close at 507 minted. Added two localhost-token admin routes: POST /admin/leftover {id, wallet} (same ops.leftover as the admin page) and POST /admin/grant {wallet, count} (closed mint only, count 1..100; pieces made like claims: random `grant-` claim id, seeded from a later blockhash, price 0, no allowlist trait). Tests 68/68. Server restarted with Hazy's OK.
- Queued 1/1s #1-7 and #9 as No. 508-515, grants as No. 516-555. All ten 1/1s now assigned. Minting wallet 0.39 SOL, ample.
- No. 508 faulted once right after the restart ("screen update 2 arrived, expected 1"), deferred and retried behind the queue; No. 509 drew fine.
## 2026-10-26 — Mint ended for good: 555 is the final supply
- All 48 wrap-up pieces minted (No. 508-555, 1/1 No. 508 drew on its third attempt). 555/555 minted, queue empty, refunds due 0.
- reconcile.mjs taught about admin grants (a `grant-` piece must appear in an events.jsonl grant record and took no money). Result: exit 0, all payments accounted for, 7.47 SOL received, 10/10 1/1s replayed.
- Hazy: "no new mints". Added `state.final` via POST /admin/finalize: the page reason becomes `ended` ("The mint has ended: 555 pieces, the final supply"), and open, leftover and grant refuse. Tests 68/68, server restarted, finalized at supply 555; /admin/open and /admin/grant checked to refuse.
- Still to do: the on-chain lock. `node scripts/cold-tx.mjs remove-delegate`, Hazy signs with the cold wallet on the sign page; after that the hot key can no longer mint into the collection.

## 2026-10-26: gallery deployed (Hazy: "go ahead refreeze and deploy. mint is closed")
- Final freeze after the close: 555 pieces (507 minted in the mint, 508-555 the wrap-up to Hazy's wallet, see above), 555 replays, all matched, all ten 1/1s. Nos. 39 and 40 have no files on Arweave (their metadata URL returns 404), so the gallery keeps their image, hires and 1x in web/data/files/ (from the mint server). Their NFTs may show no image on marketplaces (verify); re-uploading them is an open item.
- post-mint-gallery fast-forwarded into main and pushed; Vercel deployed in about 15 s. Checked live at www.gameboylabs.xyz/slow-horizons/: page, pieces.json, atlas, a replay, the film load; tools/ is not served (404); CSP allows *.arweave.net.
- After deploy, Hazy: hang all ten 1/1s together at the end of the wall (large on every screen), palette filter as a dropdown like the others. Pushed (rebased on the other session's wrap-up commits), live.
- Local preview server stopped.
## 2026-10-26 — Nos. 39 and 40: five files missing on arweave.net, re-uploaded
- Full check of all 2775 Arweave files of the 555 pieces (HEAD on arweave.net): 5 fail, all on Nos. 39 (image, replay) and 40 (image, x1, json). Turbo: FINALIZED, permanent, bundle f4nJ… has 4036 confirmations; ardrive.net and permagate.io serve them (No. 39 image byte-identical to the local file). arweave.net never indexed those items, and the Helius CDN (what wallets show) 404s too, so holders see a broken image; No. 40's metadata does not load at all.
- Fix (Hazy ok): scripts/reupload-2026-10-26.mjs re-uploaded the broken files (same bytes, new ids) and a new metadata JSON per piece; ids in data/reupload-2026-10-26.json. 39 -> vxTozMSL…, 40 -> Cw1G9Wy1…. state.json untouched.
- cold-tx.mjs piece-uri was untested and broke on its first real use (DAS gives V1-shaped metadata; the V2 instruction wants collection as a plain key plus asset data hash and flags). Fixed. Instead of devnet, scripts/simulate-tx.mjs simulates the unsigned tx on mainnet against the real accounts (no signatures, nothing sent): piece-uri 39 OK, piece-uri 40 OK, remove-delegate OK.
- Next: once the new files are live on arweave.net and the Helius CDN, Hazy signs piece-uri 39, piece-uri 40, then remove-delegate.
## 2026-10-26 — Collection locked on chain, hot key emptied
- New files live on arweave.net and the Helius CDN. sign.html is off the public site on purpose, so a temporary page (~/Projects/gameboy/cold-sign-temp, outside the repo) ran behind a Cloudflare quick tunnel: it built each cold-tx fresh on click, simulated it, and signed via Wallet Standard or an injected wallet. Taken down right after. (Quick tunnels on this Mac need `--config` pointing at an empty file, or ~/.cloudflared/config.yml ingress answers 404.)
- Hazy signed with the cold wallet: piece-uri 39, piece-uri 40, remove-delegate. Verified by DAS + fetchCollection: No. 39 json vxTozMSL…/image daAnhIG0…, No. 40 json Cw1G9Wy1…/image L4L-FfuA…, owners unchanged; collection update authority CQbk…f9zd, UpdateDelegate NONE, size 555, minted 555. The hot key can no longer mint into or edit the collection.
- Hazy: rest of the mint funds to the treasury. scripts/sweep-hot.mjs sent 0.386963883 SOL from the hot key 971n… to the treasury 5Uav… (https://solscan.io/tx/53k8qTLfaG2JefQhNdj7QHrtJJMAxQgtire6aWe2t4W8NeKz7m39ExpSUbZRRxZfJ9e5quAccENZAzAMi7rbNJxd); hot key balance 0.
- Correction: "555 is final on-chain" overstated it. remove-delegate takes power from the hot key only; the cold wallet stays update authority and can still edit metadata, re-add a delegate, or mint into the collection itself. 555 is final by Hazy's decision, enforced on the server (state.final), not by the chain.

## 2026-10-26: gallery copy audit and mobile pass (Hazy: "dont want unnecessary sentences, repeating stuff", "mobile page looks very messy", "all needs to be flawless")
- Copy: every fact now said once. Removed the closing tally (its numbers live in the How it was made list), the repeated "one Game Boy from 1989" and "about a minute", the triple "screens go down the cable to the mint page", the seed explained twice, the 1/1 note restating its intro, the footer repeating the Kept step, the third "frozen".
- Mobile (independent review, 8 fixes + my own): section links back in the phone header (second row); the headline sits above the wall on phones; filters as an even 2-column grid with search on top and 16 px inputs (no iOS zoom); collection 3 columns (21 = 7 full rows); collector picker 4 columns (a 59-piece wallet went from ~5,900 to ~1,400 css px); collage heading first, preview before the controls, even action buttons; touch targets 40 to 44 px; seed block aligned; both films use the same Play/Pause control; SVG chevrons instead of Unicode arrows; one Seed row for 1/1s; no mid-word breaks.
- Verdict rounds: all eight fixes resolved; regressions from the batch (stranded Play button, a shortened seed formula that was no longer true, a mono note, a lost caption gap) fixed; the last one checked by measurement in the page (12 px gap at 1440 and 390), not re-scored by the reviewer. Live.
## 2026-10-26 — Holder snapshot for the airdrop
- scripts/snapshot.py (DAS getAssetsByGroup): finalized slot 461633290, 10:39 UTC. 555 assets, 187 holder wallets, 0 listed/delegated. Files: server/data/snapshots/holders-2026-10-26T1039Z.{csv,json} (data/ is not in git). Hazy's Afn1… holds 55 (incl. 8 1/1s), treasury 5Uav… holds 1. Who qualifies is Hazy's call (not decided).

## 2026-10-26: wrap-up video and main site after the mint
- Hazy asked for a final wrap-up video, best quality, nothing repeated from earlier videos, no pet shelter mention; picked "555 at once", the handheld shape for the mosaic.
- ~/Projects/gameboy/launch-videos/finale/finale.py -> ~/Desktop/slow-horizons-wrap-up.mp4, 58 s, 1080x1080, 60 fps, no voice. Real footage (Hazy's No. 115 clip), No. 115 redrawn from its replay, all 555 drawing at once from their own replays (frozen gallery data), palettes bloom on the drop, the pieces fly into a handheld shape (18 x 31 cells minus one corner = 555, each piece tinted toward its part), heartbeat chart of every piece, 10.7 h / 2.2M frames / 555 of 555 matched, back to the desk, thanks to 185 collectors. Music ElevenLabs (instrumental, drop at 32 s).
- Main site (gameboy-labs-site, pushed, live): hero button "See the hardware" (no Slow Horizons in the hero), header link GitHub, Slow Horizons section in the past tense with "See the gallery", logbook entries 20 and 26 October.

## 2026-10-26: repo audit, history rewrite, public release (Hazy: "remove anything which shouldn't be made public, deep audit")
- Audit, current tree and all 178 commits, both remote branches: no keys, tokens, webhooks, RPC keys or .env/.keys/server data ever committed (the only "64-byte array" hits are the Bayer dither table; the one api-key value is the deliberately fake one in the security audit). Wallet addresses in web/data are public on chain.
- Personal data found in history: Hazy's gmail address and a name-based Vercel team slug (4 commits, already gone from the tree), and a second personal email as author/committer on 144 commits. Hazy chose a history rewrite: git-filter-repo 2.47.0 on a mirror clone, --replace-text for the address and slug, --mailmap to the GitHub no-reply address; verified 0 matches after; force-pushed main and ten-horizons. No pull requests existed. Backup bundle of the old history: ~/Projects/gameboy/gb-seed-lab-backup-20261026-2015.bundle (local only, contains the old emails).
- Hazy's choices: LICENSE now MIT for the code, all rights reserved for the 555 pieces, the 1/1 scenes, the name and the media. README rewritten for the finished collection (verify commands checked: No. 115's seed redraws as its traits; npm test passes). CLAUDE.md updated (public, state). SERVER-SETUP has a "Retiring" section; Hazy stops the server, tunnel and admin host himself.
- Repo made public on Hazy's go.
- Note for other clones (the Mac mini, other sessions): history changed; re-clone or `git fetch && git reset --hard origin/main` before working, never push an old clone (it would bring the old emails back).

## 2026-10-26: gallery on phones: jumping, shorter hero, no tap-to-open (Hazy: "on mobile the website randomly jumps around")
- Measured with Chrome emulating a phone on a slow connection (200 KB/s, scroll anchoring off like iPhone Safari): the page sat at its empty height for ~22 s, then grew by ~3,400 px when the data arrived ("How it was made" moved from 1,570 to 4,434 px). Causes: nothing was drawn until the 2.3 MB atlas loaded, the filters, grid, 1/1s, numbers and captions were all inserted by script, and the 7.6 MB film autoplayed from the start and took the bandwidth.
- Fixes: every section's final size is in the HTML (placeholder cells for the collection and the 1/1s, the filter selects, the count, Show more, the numbers list, the seed and kept blocks, captions); the atlas is served as lossless WebP (1.07 MB, pixel-identical to the PNG; freeze.py writes both); the film loads and plays only when scrolled into view; the wall relayouts only when the width changes (phones fire resize when the address bar moves); the phone header rows have fixed heights. Result on the same slow load: "How it was made" stays at the same position for the whole load; layout shift 0.054 (was 0.4+), the rest is the header when the brand font arrives.
- Phone hero: the wall is now a 37 x 15 strip (all 555, full last row) with its height fixed by CSS, instead of a 15-column wall taller than the screen. Taps on the wall no longer open a piece on touch screens (tested: hash unchanged after a tap); the line under the headline now points to the collection instead of "click any piece".

## 2026-10-26: gallery: Jupiter wallet not found (Hazy)
- Cause: the gallery's Connect wallet only looked for window.phantom / solflare / backpack / solana; Jupiter (and other modern wallets) announce themselves through the Wallet Standard. Fix: the same Wallet Standard discovery the mint page had (app-ready / register-wallet events, standard:connect), plus the injected providers as a fallback, a second look after 400 ms for late wallets, and a picker when more than one wallet is installed. Checked with a simulated Wallet Standard wallet named Jupiter: connects and opens that wallet's pieces. Not yet checked with the real Jupiter extension (verify).

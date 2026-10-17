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
- Tunnel: deviation from SERVER-SETUP.md section 6. Instead of a locally managed tunnel plus `sudo cloudflared service install`, a **remote-managed** tunnel `slowhorizons` (id c4c8f083-7aa4-450f-b549-4f9a4a108ca7) created with the API, ingress api.gameboylabs.xyz -> http://localhost:8791, else 404. Runs as LaunchAgent `com.slowhorizons.tunnel` (`cloudflared tunnel run --token-file ~/.cloudflared/slowhorizons.token`, KeepAlive, log ~/Library/Logs/slowhorizons/tunnel.log). Why: no admin password needed, and it leaves the Mac's existing tunnels and ~/.cloudflared/config.yml untouched. 4 connections registered (kix).

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

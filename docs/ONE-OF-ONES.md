# One-of-ones ("Ten Horizons"): build spec

Status 2026-10-18: the ten scenes are **drawn and approved by Hazy** in the generator (PC/WASM build only). Not yet in the ROM,
the server or the website. This file is everything needed to finish it. Log each step in `docs/LOGBOOK.md`.

## What Hazy decided (2026-10-18)

- **Ten 1/1s, final list** (ids are `gen_special` values, order is fixed, do not renumber):

  | id | Title | Palette name |
  |----|-------|--------------|
  | 1 | Fuji at First Light | Sakura |
  | 2 | The Floating Gate | Vermilion |
  | 3 | Shirakawa-go | Gassho |
  | 4 | Under the Milky Way | Deep Space |
  | 5 | Golden Pavilion in Snow | Kinkaku |
  | 6 | Sky Lanterns | Lantern |
  | 7 | Bamboo and Fireflies | Bamboo |
  | 8 | Moonlit Whale | Abyss |
  | 9 | Ramen in the Rain | Yatai |
  | 10 | Lighthouse in the Storm | Tempest |

- **One ROM.** No separate 1/1 ROM: the 1/1s must appear **randomly during the main mint**, drawn live on the Game Boy like
  every other piece. The normal mint ROM gains the 1/1 code and a flag in its start frame.
- **Random, provably fair, no secret list.** Rule below. Anyone can re-check it from public data.
- **If the mint closes before 2000, the undrawn 1/1s are drawn on the Game Boy afterwards** and auctioned or given away as
  their own event (Hazy: option 1). So the admin needs a path to draw a chosen 1/1 by hand after the mint.
- Keep the art as it is now (commit 034fb19 on branch `ten-horizons`, merged to main). If you must touch a scene to make it fit
  or compile on SDCC, the picture must stay visually identical; show Hazy before/after if anything changes.

## How it works in the generator (already done)

- `gen/gen_special.c`: all ten scenes. `gen_special` (u8, 0 = normal piece, 1..SP_N = that scene) is set **before**
  `gen_draw`. When set, `gen_draw` ignores the piece's seed and uses the fixed seed `0x1F1F0000 + id`, so every 1/1 always
  draws the exact same picture, whatever the mint seed was.
- Hooks (all guarded by `if (gen_special)`, so normal pieces are untouched): `sp_traits` (fixed traits + palette
  `PAL_SP + id - 1`), `sp_horizon`, `sp_light` (inside draw_sky), `sp_clouds`, `sp_profile` (ridge layers), `sp_features`
  (before the water mirror, so it reflects), `sp_after` (after weather, before dither; foreground, no reflection).
- Palettes: `PAL_N 20` public, `PAL_SP 20`, `PAL_ALL 30` (gen_names.c). Public seeds can never get a 1/1 palette
  (W_PAL weights cover only the first 20).
- Golden test `node test/determinism.js` = 300/300: normal pieces are pixel-identical to before. Keep it that way.
- Everything in gen_special.c is a function of x and y (hsh, vnoise, bayer, bump, rough), so the banner pass continues each
  scene sideways. Banner code is `#ifndef __SDCC` (PC/WASM only).
- Preview on PC: `cd gen && make gen_host && ./gen_host special <id> ppm > p.ppm` (or `banner`, `traits`).
  Contact sheets of the approved versions: Hazy's Mac mini `~/.openclaw/workspace/downloads/oneofone/` (not in repo:
  the repo stays private and art is not published before the mint).

## The fair rule (implement exactly; publish it in MINT.md)

For each piece, at the moment its seed is fixed (`seedTick` in `server/src/index.mjs`, status seeding -> queued), in piece
number order (strictly serialized, one piece at a time):

```
left_1of1  = 10 - (1/1s already assigned)
left_mints = MAX_SUPPLY - (pieces numbered before this one)      // includes this piece
roll       = first 4 bytes LE of sha256(utf8("one-of-one") || seed as 4 bytes LE)
is_1of1    = left_1of1 > 0 && (roll % left_mints) < left_1of1
which      = the (roll2 % left_1of1)-th id, ascending, among the ids not yet assigned,
             roll2 = first 4 bytes LE of sha256(utf8("which") || seed as 4 bytes LE)
```

- Sell-out => all ten appear, each once, at unpredictable numbers (the seed comes from a future blockhash; see MINT.md).
- `MAX_SUPPLY` must be the configured cap at decision time (2000). If Hazy closes early, the rule is unchanged; leftovers
  are drawn afterwards (admin path below).
- Store on the piece: `special` (0 or id), `specialRoll` (roll, roll2, left_1of1, left_mints) so the metadata can show
  the proof. Persist `assigned` ids in the state file so a restart never assigns one twice. Dev/test seeds (`/api/dev`)
  must never take a 1/1 from the real pool.
- Edge: pieces that fail and get redrawn keep their `special`; refunded/cancelled pieces before drawing release their id
  back to the pool (log it).

## Link protocol change (gb/main.c + server/src/lanes/hardware.mjs + gb-link-usb firmware if it parses frames)

- Start frame today: `$7E 'S' seed(4) piece(2) crc(2)`. New: `$7E 'S' seed(4) piece(2) special(1) crc(2)`
  (CRC-16-CCITT over everything after `$7E`, as now). special 0 = normal. Bump `rxstate` length 10 -> 11.
- The ROM sets `gen_special = special` before `gen_traits` / `gen_draw`, and clears it after.
- 'B' frame (traits) and 'D' frame (screen_crc) unchanged; for a 1/1 the server's expected tiles come from the WASM with
  `lab.special(id)` set (see reference). Show the 1/1 title on the commission card (`card()`), e.g. "1/1 FUJI AT FIRST LIGHT".
- Check whether `~/Projects/gameboy/gb-link-usb` firmware only forwards bytes (bridge mode) or validates frame length;
  update it if needed.

## ROM

- Add `gen_special.o` to `gb/Makefile` OBJ (it is `#pragma bank 255`, autobank). ROM is 64 KB now; it will need more:
  add `-Wm-yo8` (128 KB) or what the linker asks for. MBC5 handles it; the EverDrive does too.
- SDCC pitfalls to check in gen_special.c: products that can pass 32767 without an i32 cast (several `dx * dx + dy * dy`
  are small, but audit all), `static const` tables inside functions (fine, but they cost ROM), recursion none, stack size of
  big locals (none large). Expect it to be slow-ish: some scenes loop over every pixel several times (Bamboo `grove()`,
  Kinkaku pond mirror, Lighthouse `storm()`). Measure on PyBoy with `tools/profile.py`; a 1/1 may take longer than a normal
  piece, that is fine (drawing live is the show), but keep it under ~3 minutes on the DMG (verify) and tell Hazy the time.
- Parity: `tools/emu.py` must give identical pixels ROM vs native for normal seeds (existing test) **and for all ten 1/1s**
  (new). Add the ten to the parity test.
- After the ROM changes: new `gb/seedlab.gb` and its SHA-256 (goes into every piece's metadata; the server reads it).
  Hazy must copy the new ROM to the EverDrive (he does that; tell him the path and hash). Do not change the ROM on a live
  mint without Hazy's go: mint is CLOSED as of 2026-10-18 (verify before deploying).

## WASM / website

- Rebuild `web/gen.wasm` with gen_special.c (gen/Makefile already lists it for the host build; check the wasm target).
- `web/seedlab.js`: expose `special(id)` (call before draw/banner/traits; reset to 0 after). Gallery and piece pages must
  render a 1/1 from its `special` field, not from the seed alone.
- `test/parity.js`: WASM == native for the ten.

## Server

- `seedTick`: the rule above, then `traits: lab.traits(seed)` with `lab.special(id)` set for a 1/1 (and reset after).
- Hardware lane `draw(seed, piece, special)`; simulated lane (`test/helpers/sim-lane.mjs`) too.
- Reference check / PNG / banner (`reference.mjs`, storage): set `lab.special(id)` around every render of that piece.
- Metadata (index.mjs ~line 330): name `"Slow Horizons #<n>: <Title>"`; attributes add `{"trait_type":"Edition","value":"1/1"}`
  and `{"trait_type":"Title","value":"<Title>"}`; `describe.mjs` gets a hand-written sentence per scene (ask Hazy or draft and
  show him); `properties` add `one_of_one: { id, title, roll, roll2, left_1of1, left_mints, rule: "<the formula text>" }`.
  Normal pieces get `"Edition": "Open"` only if Hazy wants it (ask; default: no new trait on normal pieces).
- Discord webhook: a 1/1 hit gets its own loud message (title + number + image).
- Admin page: show "1/1s assigned: x/10" and which ids remain; **admin action "Draw leftover 1/1 #id"** for after the mint
  (draws on the real Game Boy, mints to a wallet Hazy enters; costs SOL: Hazy's explicit go each time).
- `scripts/reconcile.mjs`: check no id assigned twice and that every assignment re-derives from its seed with the rule.

## Tests before showing Hazy

1. `node test/determinism.js` 300/300 (normal pieces unchanged).
2. Native vs WASM vs ROM (PyBoy) identical for the ten 1/1s and a few hundred normal seeds.
3. Unit test of the rule: replay 2000 random seeds -> exactly 10 assigned, all distinct; deterministic re-run gives the same
   numbers; early stop at 1000 -> about half assigned, rest listed as leftovers.
4. Devnet run (`scripts/devnet-queue-test.mjs`) with `MAX_SUPPLY` set tiny (e.g. 12) so 1/1s actually hit: metadata, title,
   images, webhook.
5. Real DMG: draw all ten once with `scripts/test-draw.mjs` (stop the mainnet server first; one serial port owner; Pico first,
   then the Game Boy). Send Hazy photos/timings.

## Do not

- Do not publish the art, ROM or code anywhere (repo private until the mint ends).
- Do not mint on mainnet, spend SOL or change the live ROM without Hazy's go.
- Do not let public seeds reach a 1/1 palette or scene any other way than the rule.
- No em dashes in anything Hazy reads.

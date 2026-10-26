# Slow Horizons

Landscapes drawn live by a real 1989 Game Boy. The mint ran from 20 to 26 October 2026: every payment fixed a seed from a Solana blockhash nobody could predict, the Game Boy drew that landscape line by line, the screens came back down the link cable, each finished picture was checked pixel for pixel against the same C code compiled for the web, stored on Arweave and minted to the buyer.

**555 pieces, 185 collectors, 10.7 hours of drawing, 555 of 555 matched.**
Gallery, every drawing replay and how it was made: **https://www.gameboylabs.xyz/slow-horizons/**

![12 landscapes, seeds 1 to 12](img/sheet.png)

## How it works

- **One C source** (`gen/`) is built three ways: the Game Boy ROM (GBDK-2020, `gb/seedlab.gb`), WebAssembly for the browser and the server check (`web/gen.wasm`), and native for tests. Same seed, same picture, every build.
- `gen_traits(seed)` picks the traits (palette, time of day, sky, terrain, ground, weather, ridges, snowcaps, extras), `gen_draw(seed)` draws them with integer maths only in 4 shades. The palette is applied afterwards, the way a Game Boy Color tints an original Game Boy game.
- **Ten hand-made 1/1 scenes** live in the same ROM. A published rule decided at seed time which mint landed on one ([`docs/ONE-OF-ONES.md`](docs/ONE-OF-ONES.md)).
- **The link cable:** a Raspberry Pi Pico 2 on the link port (firmware: [hazy2go/gb-link-usb](https://github.com/hazy2go/gb-link-usb)) sends the seed in and brings each screen out. It also timed the console's link clock while it drew: every piece's heartbeat is within 6.8 ppm of the others, one physical crystal.
- **Mint design and the honest limits of "proof of hardware":** [`docs/MINT.md`](docs/MINT.md). Every decision, check and correction, dated: [`docs/LOGBOOK.md`](docs/LOGBOOK.md).

## Verify a piece

Every piece's seed, seed block and blockhash are in its metadata and in `web/data/pieces.json`. Redraw it:

```sh
make -C gen                       # native tool + web/gen.wasm
npm test                          # golden hashes, WASM = native
node tools/sheet.js --out me.png 0xba83255d   # No. 115's seed
```

The drawing replays (the screens the Game Boy actually sent) are in `web/data/replays/`.

## Layout

| Path | What |
|---|---|
| `gen/` | the generator, one portable C source |
| `gb/` | the Game Boy ROM, link protocol in `gb/main.c` |
| `web/` | the gallery (`index.html`, `gallery.js`, frozen data in `web/data/`), the explorer (`lab/`); the mint page is kept as `mint.js` / `mint.css` |
| `server/` | the mint server: payment watcher, queue, the Game Boy lane, check, Arweave upload, mint, admin ([`docs/SERVER-SETUP.md`](docs/SERVER-SETUP.md)) |
| `tools/`, `test/` | emulator comparison (tests only), profiling, contact sheets, determinism tests |
| `docs/` | mint design, 1/1 rule, server setup, audits, logbook |

## License

Code under MIT; the collection's art, the 1/1 scenes and the Slow Horizons name are all rights reserved. See [`LICENSE`](LICENSE).

Game Boy is a trademark of Nintendo. This project is not affiliated with or endorsed by Nintendo.

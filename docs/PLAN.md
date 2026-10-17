# Plan

Goal: a generative landscape collection where each piece is computed on a real Game Boy from a seed, and anyone can re-run the seed to check it.

## Stages

1. **Art direction (JS, done as draft 2).** `web/gen.js`, preview page `web/index.html`. Traits, palettes, odds.
2. **Integer port.** Rewrite the generator with integer maths only: fixed-point tones, table-based sine, integer square root for distances, an 8-bit/16-bit friendly PRNG. Same algorithm in JS and in C/asm for the ROM. Float `Math.sin`/`Math.pow` can differ between JS engines, so draft 2 is not a reference for verification; the integer version will be.
3. **ROM.** GBDK-2020 (verify) or asm. Receives the seed over the link cable, draws into a buffer, shows it on screen, then streams the 2bpp tiles back. 160×144 = 360 unique tiles, more than the 256 one background map can address at once, so showing a full unique screen needs the tile bank switch mid-frame (verify). Sending the tiles back does not need that.
4. **Capture.** gb-link-usb firmware (bridge mode) passes bytes to the PC; a tool writes the PNG (palette applied) and a metadata JSON (seed, traits, ROM hash).
5. **Verification.** Publish the ROM and its hash. Anyone runs seed N in an emulator and compares the hash of the tile data.

## Open questions

- Generation time on hardware (to measure after the integer port).
- Collection size and how seeds are assigned (token ID, block hash).
- Whether palette, a hardware trait, should stay "applied at display" or be baked into the metadata image only.

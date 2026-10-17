# Logbook

## 2026-10-17: repo created, art draft 2

- Idea (Hazy): a generative collection computed on a Game Boy, using the gb-link-usb link to the PC.
- Draft 1 compared landscapes, 1D rule pairs, Game of Life, sandpiles and a cyclic automaton. Cyclic with 4 states stayed noise, dropped. Hazy picked landscapes.
- Draft 2 (landscapes only): traits picked before drawing; tone field + 8×8 Bayer dither; mist per ridge by height (per-column mist made dark "drips" in narrow mesa canyons; fixed by mist by height and closing canyons under ~8 px); rim light from a smoothed slope (per-pixel slope gave vertical streaks); sun/moon kept at least half visible by compressing ridges under it; rain/snow/storm force sky = overcast so the listed sky is always visible; palms redrawn (first version read as mushrooms).
- 20 palettes of 4 colours, weighted. Palette is a display trait; the Game Boy computes shades only.
- Repo: public, name gb-seed-lab, code MIT, artwork all rights reserved (Hazy's choice). Determinism test: 204 golden hashes (200 seeds + 4 tall) in test/golden.json, Node only.
- Not yet: integer port, ROM, hardware timing.

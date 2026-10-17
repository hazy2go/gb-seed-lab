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
- `web/gen.js`: generator (traitsFor, landscape, traitRows, PALETTES). Works in the browser and in Node.
- `web/index.html`, `web/app.js`: preview page, deployed to GitHub Pages.
- `tools/sheet.js`: contact sheet PNG. `test/determinism.js`: golden hashes.
- Sister repo: `~/Projects/gameboy/gb-link-usb` (link cable to USB, bridge mode firmware).

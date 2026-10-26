# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
- **Everyone who arrives (first audience, equal weight):** people discovering Slow Horizons after the mint: collectors' followers, press, the Game Boy and generative art crowd. They come to look at the art and understand what happened.
- **Collectors (clear second entry, never buried):** about 180 wallets that own pieces. They come back to see their pieces, download them all at once, and make collages, grids and banners for socials.

## Product Purpose
Slow Horizons was a mint (closes 2026-10-26, 21:00 JST) where every NFT is a landscape drawn live by a real 1989 Game Boy: the payment's Solana blockhash sets the seed, the console draws line by line, the frames come down a link cable, and the image is checked against a reference before it is stored on Arweave. After the mint the page at the same URL (www.gameboylabs.xyz/slow-horizons/) becomes the permanent gallery and the record of the experiment: art first, then how it was made.

Success: the art is the first and strongest impression; a collector can get every one of their pieces, and a shareable collage, in a minute; a newcomer leaves understanding that a real Game Boy drew every piece and that nobody had done this before.

## Positioning
Each piece was drawn on real hardware, live, with proof (heartbeat clock measurement of the console's link timing, pixel match against the reference generator, per-piece drawing replay). No emulator. The footage is of the real console.

## Operating Context
- Static site on Vercel (`web/`), plain HTML/CSS/JS, no framework. Same URL as the mint page.
- After the mint, gallery data is frozen to static files so the site does not depend on the Mac mini server. Images are already on Arweave (plus api.gameboylabs.xyz while it runs).
- Per piece: number, seed (hex), traits (palette, time, sky, terrain, ...), description, title (1/1s), draw start/end, frames, heartbeat (ppm, intervals), match flag, Solana mint signature, seed block and blockhash, 1920x1728 image, wide banner, original 160x144, drawing replay (replay.json on Arweave), owner wallet.
- Ten 1/1s exist in the generator; two were found (No. 43 Lighthouse in the Storm, No. 301 Moonlit Whale). Unfound 1/1s were never drawn and never will be.

## Capabilities and Constraints
- Must: gallery of all pieces; piece pages with drawing replay; collector view by wallet (connect or paste, no signing) with download all (ZIP) and a collage maker (grids, X banner, wallpaper, square); a how-it-was-made story with real footage.
- Downloads and collages run in the browser (no server load).
- Do not deploy over the live mint page before the mint closes; deploy after, with Hazy's go.
- No mention of the donation or charity.
- Next step after the story: Game Boy Labs (gameboylabs.xyz) and Hazy's X.

## Brand Commitments
- Part of Game Boy Labs. Existing mint page identity: drafting-paper wall, Archivo / JetBrains Mono / Silkscreen, "a small gallery with the artist in the room", neutral walls so each piece's palette carries the colour.
- No Nintendo logos or branding in our own design. Real footage of the real console is shown as filmed (Hazy, 2026-10-26).
- Voice: plain, short, factual; no hype words.

## Evidence on Hand
- The minted pieces and their data (gallery API; snapshot in ~/Projects/gameboy/launch-videos/minted/all.json).
- Footage: ~/Downloads/CDD3A2EA-E9F5-45D5-AA9B-EBBD2C9838A1.MP4 (4K 60 fps, 57 s, the console drawing No. 115 live, Pico on a breadboard, mint page on the monitor); ~/Downloads/B66343F4-E15C-42C0-9499-8DCEE0A5128F.JPG (setup photo); ~/Desktop/Mint Process.mov (2 min screen recording of the mint page drawing live).
- Mint films: ~/Desktop/slow-horizons-*.mp4, ~/Projects/gameboy/launch-videos/slow-horizons-closing.mp4.
- No testimonials, press quotes or sales figures to use; do not invent any.

## Product Principles
1. The art leads; the interface recedes.
2. Everything shown is real: real pieces, real data, real footage. No mockups, no emulator stand-ins.
3. Collectors get their pieces out in one step.
4. Explain the machine plainly, with proof, not adjectives.
5. Permanent: works from frozen static data long after the mint.

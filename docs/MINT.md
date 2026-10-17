# Mint design

The collection is minted live. Each piece is drawn by a real Game Boy at the moment it is bought, on camera, while the buyer watches. Price covers costs (Hazy sets it, around 5 USD); the point is the experiment, not profit.

## What we can and cannot prove

Nothing digital proves real hardware on its own. A piece that depends only on its seed can be redrawn by an emulator, and that is a feature: anyone can check it. So we stack evidence that is hard to fake together, and say plainly what each part shows.

| Evidence | Shows | Fakeable by |
|---|---|---|
| Seed = hash of the buyer's payment transaction | the piece could not be drawn before the payment existed | nobody (on-chain) |
| Same C source compiled for the ROM and for the web page | the page and the Game Boy run identical rules; once the source is published (after the mint) anyone can redraw a seed | nobody (ROM hash fixed in every record now; source published later) |
| Server checks the Game Boy's tiles against the reference before minting | what was minted is exactly what the rules say | nobody |
| Live camera on the real Game Boy screen, seed shown on screen | a physical device drew it, at that time | an elaborate staged setup |
| Heartbeat: the Game Boy's crystal offset measured by the Pico per mint | a real oscillator was in the loop (emulators run exactly nominal) | someone injecting a made-up number |
| Bridge signature: the Pico 2 signs seed + heartbeat + image hash with a key kept in its OTP (verify) | our bridge device produced the record | whoever holds the device |

Site copy should say this table in plain words. Honesty is the selling point.

## Hardware-only traits (to measure, needs the Pico)

- **Heartbeat** (verify): the DMG link clock in internal-clock mode is the 4.194304 MHz crystal divided by 512 (8192 Hz). The Pico timestamps SCK edges over a fixed window and reports the offset in ppm (relative to the Pico's own crystal, which is constant per bridge). Shown as a trait like `+3.1 ppm` and, if it varies enough, it can seed a small visual detail (star twinkle, ripple phase) recorded in the metadata so the piece stays reproducible.
- **Board fingerprint** (verify): power-on work RAM contents of the DMG, hashed once per session, identify the console.

## Mint flow

Nobody has to wait. Paying puts you in the queue; the piece is drawn and sent to your wallet whether you stay or not (Hazy, 2026-10-17).

1. **Pay**: connect a Solana wallet and approve one transaction: the price to the treasury plus a memo with a fresh ticket id. That is the whole commitment.
2. **Queue**: the confirmed payment gets a queue slot. Stay on the page to watch your turn come up live, or close it.
3. **Seed**: from the payment transaction signature: `seed = first 4 bytes of sha256(signature)` (collection index also recorded). Fixed the moment you pay, so it cannot be picked afterwards.
4. **Draw**: the Pico sends the seed to the Game Boy. The Game Boy draws it in phases (sky, sun or moon, clouds, each ridge, ground, water, weather). Each phase shows on its screen and its tiles come back over the link, so the website's digital screen shows the Game Boy's real output, not a simulation.
5. **Check**: the server compares the final tiles with the reference build of the same C source. Mismatch: redraw once, then flag for a manual refund (Hazy) and log.
6. **Mint**: PNG (palette applied) and metadata (seed, traits, heartbeat, signature, ROM hash, draw start/end time, stream link) are stored, then a compressed NFT is minted to the paying wallet.
7. **Come back later**: connect the wallet and see your pieces with the exact draw time and a link that jumps to that moment in the stream recording, plus the digital replay of the tiles the Game Boy sent (recorded per phase, so it replays the real transfer, not a re-render).

Who processes the queue: our server holds the mint authority and works through confirmed payments in order. It is not a trustless on-chain contract; the site says so. Payments are public on-chain, so anyone can check that every payment got its piece. A Solana program with escrow and automatic refund after a timeout is a possible later step (verify cost and effort).

One Game Boy draws one piece at a time. More consoles later means more lanes, each with its own heartbeat. The page shows the queue length and an honest wait estimate from measured draw times.

## Chain

- Solana, compressed NFTs (Metaplex Bubblegum) in one collection. Per-mint cost is a fraction of a cent plus one-time tree rent (verify current numbers before mainnet).
- Development on **devnet** with airdropped test SOL only. Mainnet, treasury and price are Hazy's call; no agent spends money or mints on mainnet.
- Storage on devnet: our server. Mainnet: Arweave or similar (Hazy decides, costs money).

## System

```
browser --wss--> queue server (Node, on the Mac) --USB--> Pico (bridge) --link--> Game Boy
                   |   \--> Solana RPC (payments, mint)
                   |   \--> camera stream (later)
                   \--> GitHub Pages hosts the site; server reachable through a tunnel
```

- Queue server: payment watcher (memo tickets), FIFO queue, lane driver, mint, per-piece record (times, phase tiles), event broadcast (WebSocket).
- One lane: the real Game Boy through the Pico. No emulator stand-in (Hazy, 2026-10-17): if the Game Boy is not connected, minting is closed and paid pieces wait. PyBoy is used only in tests of the ROM (`tools/emu.py`).
- Reference: `gen/` C source, built native (tests), WASM (web page and server check) and GBDK (ROM).

## Not decided (Hazy)

- Collection size, price, mainnet date, treasury wallet, storage provider, camera hardware and streaming service.

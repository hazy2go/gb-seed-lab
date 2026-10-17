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

## Allowlists and holder mints

Runs alongside the public mint (public price unchanged). A wallet on a list, or holding an NFT of a listed
collection, gets that list's price (0 = free), up to the list's limit. Code: `server/src/allowlist.mjs` (engine),
`lists.mjs` (file + validation), `holdings.mjs` (Helius DAS, Alchemy), `sigs.mjs` (signatures).

**Lists** live in `DATA_DIR/lists.json` (atomic writes, backups in `data/backups/lists-*.json`), edited on the admin
page or by hand + restart. `server/lists.json` (committed, empty) seeds it on the first start only;
`server/lists.example.json` shows every kind. A bad file refuses to start the server. Fields:

| field | values |
|---|---|
| `id` | 1-32 of a-z 0-9 `-`; usage is counted under it, so keep it once used |
| `name` | shown to collectors after "as": "You can mint 2 free as **OG allowlist**", "1 at 0.02 SOL as **a Mad Lads holder**" |
| `chain`, `type` | `solana` or `ethereum`; `wallets` (a list of addresses) or `collection` |
| `wallets` | Solana addresses, or 0x addresses for Ethereum (up to 20000) |
| `collection` | Solana: collection address, or `creator:<verified creator address>` |
| `contract`, `standard` | Ethereum: contract address and `erc721` or `erc1155` |
| `priceSol` | 0 = free; otherwise at least 0.001 and never above the public price |
| `limit`, `per` | pieces per unit; `wallet` (unit = the wallet) or `nft` (unit = the token: each NFT used once, also after it changes hands). On a per-wallet holder list each NFT also gives at most `limit` pieces, whoever holds it. Refused: free + `per: wallet` on a collection list, and ERC-1155 + `per: nft` (both farmable) |
| `maxTotal` | optional cap on the whole list: at most this many pieces through it, all wallets/NFTs together (used pieces + open reservations). Leave out for no cap. Example: a collection list with `limit 1 per nft` and `maxTotal 100` lets 100 holders in, first come first served |
| `start`, `end`, `disabled`, `note` | optional window (ISO, UTC), switch, admin note |

**Flow.** After the Solana wallet connects, the page asks `GET /api/eligibility` (wallet lists; holdings through
Helius DAS `searchAssets` on `RPC_URL`, cached 30 s) and shows the offers next to the public price. "Holding an
Ethereum NFT?" finds the injected Ethereum wallet (EIP-6963: Rabby, MetaMask, Coinbase; else `window.ethereum`),
asks `eth_requestAccounts`, then `personal_sign` of a message from `GET /api/eth/challenge` that names the site,
both wallets, a single-use nonce (5 min) and says "no transaction, no fees". `POST /api/eth/link` verifies it
(viem `verifyMessage` on Ethereum mainnet: EOAs offline, smart wallets via ERC-1271/6492 on the Alchemy RPC), stores
eth -> sol in state, and returns the Ethereum offers (Alchemy NFT API, contract filter, token ids and balances).
A link only lets that ETH address's NFTs be used for pieces sent to that Solana wallet.

- **Wallet proof:** every reservation and every free claim (Solana and Ethereum lists) needs a `signMessage` from the
  Solana wallet over a message from `GET /api/claim/challenge?wallet&list` naming the site, the wallet, the list, a
  single-use nonce (5 min) and the expiry. Without it nobody can hold or use another wallet's allowance.
- **Paid offer:** `/api/ticket {wallet, list, unit, nonce, signature}` re-checks holdings, reserves the unit and stores a *grant*
  (in state.json, survives restarts) with the list price; the payment transaction is built at that price. The
  watcher prices a payment by its grant only if the payer is the grant's wallet and the payment's block time is
  before the grant expired (10 min); otherwise the public price applies (so an underpaid or foreign payment
  becomes a refund like today). Only an accepted payment consumes the unit; the unit stays held 3 min past expiry
  so a late-finalizing payment can't double-use it. The page signs only if the ticket names the offer it shows,
  at that price, not above the published price, to the published treasury. `/api/submit` relays a grant's payment
  only if the sender and fee payer are the grant's wallet. The same signature within 50 s gets the same reservation
  back (buyer cancelled in the wallet and tries again); an older one is retired after 2 min unless we relayed a
  payment for it. A payment whose block time is before its grant expired keeps the list price if the unit has room,
  even when the watcher reads it late or the grant was retired; a retired grant paid on time then cancels the same
  wallet's newer unpaid reservation instead of being refused. Disabling, deleting or repricing a list voids its open
  reservations (their payments pay the public price; `/api/submit` refuses them).
- **Free offer:** `POST /api/claim`. The wallet proof above (ed25519), plus for Ethereum lists the ETH link and a
  fresh holdings check. It creates a piece
  without a payment: seed = first 4 bytes LE of `sha256(utf8(claim_id) || utf8(blockhash))`, claim id random from the
  server, blockhash of the first finalized block at or after the claim slot + 32 (same anti-grinding idea as
  payments; the metadata has `claim_id` and `seed_formula`). Recorded as `claim` in payments.jsonl and events.jsonl.
  **Check a free claim:** the `queued` event on `/live` (and `/api/piece` while seeding) shows `claimCommit` =
  sha256(claim id) and `claimSlot` before the seed block exists; the claim id itself (`claimId`) is shown only once
  the seed is fixed. Anyone can check sha256(claimId) = claimCommit, seedBlock >= claimSlot + 32, and the seed formula,
  so the server could not pick a claim id after seeing the blockhash. The metadata also has `claim_commitment`.
- Free and discounted pieces count toward MAX_SUPPLY and need the mint to be open (closed, sold out, paused,
  offline: refused, nothing charged). Reserved grants also count when checking supply.
- **Counting:** usage per (list, unit), one process, a lock on the wallet and on the unit for the whole request, and
  supply/room re-checked after every await. The page only sees an opaque reference per unit, so an eligibility
  answer never reveals which ETH address is linked or which token it holds.
- **Fail closed:** any Helius/Alchemy/RPC error or odd answer = no offer for that list and no claim. Without
  `ALCHEMY_API_KEY` the Ethereum lists are off (startup log line), Solana lists still work.
- **Abuse notes:** free + `per: wallet` on a collection would let one NFT be passed between wallets: refused by the
  validator. Paid per-wallet holder lists also count each NFT used (asset id or `contract:tokenId`), so a passed NFT
  gets nothing more there either. One ETH NFT from many Solana wallets: per-nft units are the token, per-wallet units
  are the ETH address, so linking it to more Solana wallets gives nothing more. ERC-1155 copies have no identity:
  `per: nft` is refused; a paid per-wallet ERC-1155 list counts per ETH address only, so a copy moved to a new
  address gets the discount again (the price, not a free piece). Bounds: 5 ETH links per Solana wallet (oldest
  dropped), 20 open nonces per IP, 20 holdings lookups per eligibility request (the rest shows as unavailable), cache
  of 5000 answers (oldest out). Admin: cached Cloudflare Access keys are trusted at most 24 h without a good refresh.
  Ethereum holdings are read at the latest block (a reorg undoing a transfer-in is not handled (verify risk)).
  A list wallet that also buys publicly: public purchases never touch list allowances.
- **reconcile.mjs** also checks claims against their records and payments.jsonl, every discounted piece against a
  used grant, and per-unit usage = claims + used grants (and within the limit).

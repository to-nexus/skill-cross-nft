---
name: cross-nft
description: This skill should be used when the user asks to browse, list, buy, offer on, cancel, or accept offers on NFTs at https://www.crossnft.io. Drives the same `api.crossnft.io` GraphQL indexer and the same on-chain `MarketplaceV1` contract (0x0df40a50f2c09885c18245dc90e8e9dcd0e4c3bc on CROSS Chain 612055) as the live frontend. Read-path (`collections`, `token`, `tokens`, `listing`, `offers`, `offer-onchain`, `activities`, `stats`, `search`) hits GraphQL with `apollo-require-preflight` enabled; write-path (`list`, `cancel-listing`, `buy`, `offer`, `cancel-offer`, `accept-offer`) signs MarketplaceV1 calls via viem, auto-running `setApprovalForAll` for the NFT contract and `approve()` for the ERC-20 payment token. Triggers on phrases like "CROSS NFT 마켓", "crossnft.io 구매", "NFT 리스팅", "make offer", "buy listing 321699", "list NFT for sale", "0xa3bd…/30164746843126 사기".
version: 0.1.0
license: MIT
---

# CROSS NFT Marketplace

A distributable skill that lets Claude drive the **CROSS NFT** marketplace at `https://www.crossnft.io` — list, browse, buy, make/cancel/accept offers — using the **exact same backends** the live site does:

- **Read indexer:** Apollo GraphQL at `https://api.crossnft.io/graphql` (introspection disabled, `apollo-require-preflight: true` required)
- **On-chain contract:** `MarketplaceV1` at `0x0df40a50f2c09885c18245dc90e8e9dcd0e4c3bc` on **CROSS Chain (chain id 612055)**
- **Default payment token:** MGold (`MGT`, decimals 18) at `0x5b1579a758916560f00212b78a7af728eaa0ffa9`

> **Stack:** EOA + viem + raw HTTPS. No browser automation, no ERC-4337, no relayer.
>
> Deeper protocol details (ABI provenance, GraphQL filter shapes, fee model) live in `references/cross-nft.md`. Read it only when needed — it stays out of context otherwise.

---

## 1. Activation

Activate when the user wants to:

- **Browse** trending collections (with floor / volume / sales over a window)
- **Inspect** a single token (metadata, ownership, active listing, listing page URL)
- **List** active listings or offers for a collection / token / wallet
- **Read** an on-chain `listingId` / `offerId` (current price, isActive, Dutch-auction status)
- **Stream** marketplace activities (sales, listings, offers, transfers, burns)
- **Search** collections + games by free text
- **Trade**: list NFT for sale, cancel a listing, buy a listed NFT (incl. Dutch auctions), make/cancel/accept offers

If the user pastes a `https://www.crossnft.io/collections/<addr>/tokens/<id>` URL, extract `<addr>` and `<id>` and route them verbatim to `token.mjs` (or to `list.mjs` / `offer.mjs` if they want to act on it).

Trigger phrases (Korean + English):

- KR:
  - `"CROSS NFT 마켓"` / `"크로스NFT 마켓플레이스"` / `"crossnft.io 보여줘"`
  - `"NFT 리스팅 해줘"` / `"NFT 판매 등록"` / `"이 NFT 30 MGT에 팔기"`
  - `"NFT 사기 listing 321699"` / `"이 NFT 구매"` / `"buy listing"`
  - `"오퍼 넣기"` / `"NFT 오퍼 25 MGT"` / `"make offer 25"`
  - `"오퍼 수락"` / `"내 NFT 오퍼 받기"` / `"accept offer 30"`
  - `"내 listing 취소"` / `"오퍼 취소 30"`
  - `"materials 컬렉션 floor"` / `"crossnft 활동내역"` / `"거래내역 보여줘"`
- EN:
  - `"crossnft list NFT"` / `"list NFT for sale on crossnft"`
  - `"buy crossnft listing 321699"` / `"buy this NFT"`
  - `"make offer 25 MGT for 0x… token 30164746843126"`
  - `"cancel my offer 30"` / `"accept offer 30"`
  - `"top crossnft collections by volume 7d"` / `"crossnft activity sale,listing"`

---

## 2. Prerequisites — verify before doing anything else

Run these checks in order. Stop and report to the user at the first failure.

```bash
node --version          # require >= 20
```

Then ensure deps are installed (one-time):

```bash
SKILL_DIR="$HOME/.claude/skills/cross-nft"
[ -d "$SKILL_DIR/node_modules" ] || (cd "$SKILL_DIR" && npm install --silent)
```

Read-path commands (`collections`, `token`, `tokens`, `listing`, `offers`, `offer-onchain`, `activities`, `stats`, `search`) work **without** any private key. Only the write commands need one.

---

## 3. Credential resolution — strict priority

Resolve the EOA in this order. **Never echo wallet secrets back to the user, never write them into the conversation transcript, never log them, and never ask the user to paste them into chat.**

1. **`process.env.PRIVATE_KEY`** — inherited by the spawned process, not typed into the chat transcript or shell argv.
2. **`./.env` in the user's current working directory** — read `PRIVATE_KEY` and (optionally) `WALLET_ADDRESS`, `CROSS_RPC_URL`, `MAX_TRADE_NOTIONAL`, `CONFIRM_THRESHOLD`, `MIN_GAS_NATIVE`.
3. **`$HOME/.claude/skills/cross-nft/.env`** — same vars, used as the personal default.
4. **Missing local signer config** — if all three sources lack `PRIVATE_KEY`, stop and point the user to `~/.claude/skills/cross-nft/.env`:

   ```bash
   PRIVATE_KEY=<0x-prefixed-64-hex-secret>
   MAX_TRADE_NOTIONAL=100
   CONFIRM_THRESHOLD=1
   MIN_GAS_NATIVE=0.001
   ```

   Then ask them to re-run the request. Do not collect the secret in chat, and do not pass it on the command line.

For personal testing, the default `env` backend reads the key from local
environment variables or a gitignored `.env` file. For team, hosted-agent, or
production funds, prefer Vault Transit, KMS, or HSM-backed signing so the raw
key is not exported to the agent runtime.

Validation: the value must match `^0x[0-9a-fA-F]{64}$`. Reject otherwise without retrying silently. Read-path subcommands NEVER prompt for a PK.

---

## 4. Safety rails — apply every time (write path)

Read-path scripts cannot lose funds. The rails below are enforced verbatim by `_guard.mjs` for every write op:

1. **Source-chain id check** — every signed tx aborts unless `eth_chainId == 612055`.
2. **`MAX_TRADE_NOTIONAL` cap** — env var; if set, abort if the per-trade payable exceeds it.
3. **`CONFIRM_THRESHOLD` + `--confirm` gate** — any trade above this notional aborts with `{ok:false, error:"awaiting_confirm", ...}` exit 2 unless `--confirm` is passed. Default `1` payment-token unit.
4. **`MIN_GAS_NATIVE` pre-flight** — abort before signing if CROSS native balance is below the floor (default `0.001`). Set `MIN_GAS_NATIVE=0` to skip.
5. **Payment-token whitelist guard** — before any `list`/`offer`, calls `whitelistedPaymentTokens(addr)`; aborts with `unsupported_payment_token` if not allowed.
6. **Listing/offer activeness guard** — `cancel-listing` / `cancel-offer` / `buy` / `accept-offer` pre-fetch the on-chain object and abort cleanly if `isActive == false`.
7. **Seller / offeror identity guard** — `cancel-listing` aborts if signer != listing seller; `cancel-offer` aborts if signer != offeror.
8. **NFT approval auto-run** — `list` and `accept-offer` check `isApprovedForAll(operator=marketplace)`; only if false do they run `setApprovalForAll(true)` and wait for receipt before the marketplace call.
9. **ERC-20 allowance auto-run** — `buy` and `offer` check `allowance(spender=marketplace)` and approve exactly the needed amount (or unlimited with `--max-approve`) before the marketplace call. Native paymentToken (sentinel `0x0…0`) skips approval and uses `msg.value`.
10. **`WALLET_ADDRESS` mismatch warning** — non-null `signerWarn` field when env-declared address ≠ PK-derived address. Surface to user before continuing.
11. **Never echo PK** — same as siblings.

---

## 5. Execution

All subcommands run via Bash and emit a **single JSON object on stdout** (no decorative prose). Parse the envelope and report key fields back. Stderr stays empty unless `DEBUG=1`.

```bash
cd "$HOME/.claude/skills/cross-nft"
node scripts/<subcommand>.mjs [args]
```

### NL → subcommand map

| User says (KR / EN) | Subcommand |
|---|---|
| "trending collections" / "TOP 컬렉션" | `node scripts/collections.mjs --days 7d --top 20` |
| "search materials" / "materials 검색" | `node scripts/search.mjs "materials"` |
| "이 토큰 보여줘 (URL 붙여넣기)" / "show this token URL" | `node scripts/token.mjs --url <URL>` |
| "0xa3bd… 30164… token" / "token at 0x... id 30164" | `node scripts/token.mjs 0xa3bd… 30164746843126` |
| "내 보유 NFT" / "tokens owned by 0x..." | `node scripts/tokens.mjs --owner 0x...` |
| "컬렉션 4 토큰들" / "list tokens in collection-id 4" | `node scripts/tokens.mjs --collection-id 4 --top 20` |
| "이 NFT의 오퍼들" / "offers on token X" | `node scripts/offers.mjs --collection 0x... --token 30164746843126` |
| "내가 한 오퍼 목록" / "offers I made" | `node scripts/offers.mjs --offeror 0x...` |
| "최근 거래내역" / "activities (sales/listings/offers)" | `node scripts/activities.mjs --collection 0x... --types SALE,LISTING,OFFER` |
| "listing 321699 상세" / "on-chain listing 321699" | `node scripts/listing.mjs 321699` |
| "offer 30 onchain" / "offer 30 detail" | `node scripts/offer-onchain.mjs 30` |
| "컬렉션 4 통계" / "stats for collection-id 4" | `node scripts/stats.mjs --collection-id 4` |
| "30 MGT 에 NFT 판매 (URL 붙여넣기)" / "list NFT for sale 30 MGT" | `node scripts/list.mjs 0xa3bd… 30164746843126 30 --confirm` |
| "Dutch 옥션 50→10 over 24h" / "dutch auction 50 to 10 in 24h" | `node scripts/list.mjs 0x... <id> 50 --end-price 10 --duration 86400 --confirm` |
| "내 listing 321699 취소" / "cancel my listing 321699" | `node scripts/cancel-listing.mjs 321699` |
| "listing 321699 사기" / "buy listing 321699" | `node scripts/buy.mjs 321699 --confirm` |
| "이 NFT에 25 MGT 오퍼" / "make offer 25 MGT for token X" | `node scripts/offer.mjs 0x... 30164746843126 25 --duration 604800 --confirm` |
| "내 오퍼 30 취소" / "cancel offer 30" | `node scripts/cancel-offer.mjs 30` |
| "오퍼 30 수락" / "accept offer 30" | `node scripts/accept-offer.mjs 30 --confirm` |

If the user asks to execute any write command (list / buy / offer / accept-offer / cancel-*), follow this protocol:

1. Run the **matching read script first** (`token.mjs` for list, `listing.mjs` for buy/cancel-listing, `offer-onchain.mjs` for cancel-offer/accept-offer, etc.) to confirm price + status.
2. Surface `parsedIntent`, `totalPayableHuman` (if applicable), `paymentSymbol`, `pageUrl` to the user and ask for explicit confirmation ("yes / 진행").
3. Only after confirmation, re-invoke with `--confirm` (and `--max-approve` if the user explicitly opted in).

For `awaiting_confirm` errors (exit code 2), summarize the parsed intent and ask the user explicitly for "yes / 진행" before re-running with `--confirm`.

### Subcommand cheat-sheet

- `collections [--days 24h|7d|30d|all] [--top N] [--skip N]` — paginated `ListCollectionStatistics`. Returns floor / volume / sales / supply / owners per collection.
- `token <address> <tokenId>` (or `--url <crossnft.io URL>`) — `GetToken` GraphQL. Shows metadata, owner, and the active listing if any (with `listingId`, `startPrice`, `endPrice`, `paymentSymbol`, `isDutchAuction`).
- `tokens --collection-id <id> | --owner <0x…>` — paginated `ListTokens`. (The indexer keys collections by **internal numeric id**, not contract address; resolve it via `collections.mjs` first.)
- `offers --collection <0x…> [--token <id>] [--offeror <0x…>]` — paginated `ListOffers`. Returns `offerId`, `offerPriceHuman`, `paymentSymbol`, `expirationTime`.
- `activities --collection <0x…> [--types SALE,LISTING,OFFER,TRANSFER,BURN]` — paginated `ListActivities`. Includes `txHash` for cross-checking on the explorer.
- `listing <listingId>` — pure on-chain `getListingDetails` + `getCurrentPrice` + `calculateFees` for a listing. Use this BEFORE `buy` to confirm the price (Dutch auctions decay).
- `offer-onchain <offerId>` — pure on-chain `getOfferDetails`. Use BEFORE `cancel-offer` / `accept-offer`.
- `stats --collection-id <id> [--depth]` — `GetStatistics` + `ListTradeHistories` (24h/7d/30d) + optional `GetMarketDepth`.
- `search "<keyword>"` — `ListSearchResults` (collections + games).
- `list <nftContract> <tokenId> <price> [--quantity N] [--end-price P] [--duration sec] [--payment MGT|native|0x…] [--confirm] [--max-approve]` — signs `createListing`. Auto-runs `setApprovalForAll`.
- `cancel-listing <listingId>` — signs `cancelListing`. Aborts if signer ≠ seller.
- `buy <listingId> [--quantity N] [--confirm] [--max-approve]` — fetches `currentPrice`, approves ERC-20 if needed (or attaches `msg.value` for native), signs `buy`.
- `offer <nftContract> <tokenId> <pricePerUnit> [--quantity N] [--duration sec] [--payment MGT|native|0x…] [--confirm] [--max-approve]` — approves ERC-20 if needed (or `msg.value` for native), signs `createOffer`. Default duration 7 days.
- `cancel-offer <offerId>` — signs `cancelOffer`. Aborts if signer ≠ offeror.
- `accept-offer <offerId> [--confirm]` — auto-runs `setApprovalForAll`, signs `acceptOffer`.

---

## 6. Reporting back

After every action, surface to the user:

- The **parsed intent** (so they can audit it) — echo the `parsedIntent` field if present.
- For `collections`: count + per-row `{name, contractAddress, floorPrice, volume}`.
- For `token`: `name`, `protocol`, `owner`, and the listing block if non-null (with `startPriceHuman` + `paymentSymbol` + `listingId`).
- For `tokens` / `offers` / `activities`: `total` (server count) + a digest of the first 5 rows.
- For `listing`: `seller`, `tokenId`, `startPriceHuman` + `currentPriceHuman` + `paymentSymbol`, `isActive`, `isDutchAuction`, `pageUrl`.
- For `offer-onchain`: `offeror`, `offerPriceHuman`, `paymentSymbol`, `expirationTime` (as a date), `isActive`.
- For `list`: `mode`, `listingId`, `txHash`, `explorerUrl`, `pageUrl` (and `approveTxHash` if a one-time `setApprovalForAll` ran).
- For `buy` / `accept-offer`: `mode`, `parsedIntent.totalPayableHuman`, `txHash`, `explorerUrl`. Mention `approveTxHash` if any.
- For `offer`: `offerId`, `txHash`, `explorerUrl`, `parsedIntent.totalPayableHuman`.
- For `cancel-*`: `txHash`, `explorerUrl`.

Never include the PK or full env contents in the report. If the envelope contains a non-null `signerWarn`, surface the mismatch to the user before declaring success.

---

## 7. Distribution

This skill folder is the unit of distribution. Recipients:

1. Copy the whole `cross-nft/` folder into `~/.claude/skills/`
2. Run `cd ~/.claude/skills/cross-nft && npm install` once (or let the skill do it on first use)
3. (Optional, only for write-path) create `~/.claude/skills/cross-nft/.env` from `.env.example`, or let the skill prompt them on first run

Cross-link: deeper details (contract address provenance, full GraphQL filter shapes, fee model) live in `references/cross-nft.md`. Lazy-load it only when an endpoint returns an unfamiliar shape.

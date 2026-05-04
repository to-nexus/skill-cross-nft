# cross-nft — protocol reference

This file documents the live-frontend findings the skill encodes. It exists
so future maintainers (and Claude on a fresh context) can re-derive every
hard-coded address, ABI fragment, and GraphQL filter shape if anything
upstream changes. **It is not loaded by SKILL.md.** Read it only when the
runtime returns an unfamiliar response.

---

## 1. Chain + contract addresses

| Item | Value | Source |
|---|---|---|
| Chain | CROSS Chain mainnet | RSC payload at `https://www.crossnft.io/...` carries `"chainId":612055,"explorerUrl":"https://explorer.crosstoken.io/612055"` |
| Marketplace | `0x0df40a50f2c09885c18245dc90e8e9dcd0e4c3bc` | Same payload, embedded `{"address":"0x0df40a…","name":"Marketplace","type":"MARKETPLACE"}` row |
| Default payment token | MGold (MGT) at `0x5b1579a758916560f00212b78a7af728eaa0ffa9` (decimals 18) | Same payload, `paymentTokens` array |
| Native sentinel | `0x0000000000000000000000000000000000000000` | MarketplaceV1 treats `address(0)` paymentToken as "use msg.value" |
| Public RPC | `https://mainnet.crosstoken.io:22001/` | Public endpoint surfaced by the wallet-server chain registry; rate-limited — use a private RPC for heavy use |
| Explorer | `https://explorer.crosstoken.io/612055` | RSC `network.explorerUrl` |

The marketplace address is also overridable via `MARKETPLACE_ADDRESS` env (debug only).

---

## 2. ABI provenance

The full `MarketplaceV1` ABI is **embedded in the live RSC payload** of every token-detail page (e.g. `https://www.crossnft.io/collections/<addr>/tokens/<id>`). To re-extract:

```bash
curl -sL https://www.crossnft.io/collections/<addr>/tokens/<id> > page.html
# the page contains 50+ self.__next_f.push([...]) blobs. Decode the strings,
# concatenate, and grep for `"name":"createListing"`. The ABI fragment for
# every function/event/error follows in JSON form.
```

The skill ships only the functions it actually calls — adding more is
safe but unnecessary. Functions used:

- **Write:** `createListing(nftContract,tokenId,quantity,startPrice,endPrice,paymentToken,duration) returns listingId`, `cancelListing(listingId)`, `buy(listingId,quantity) payable`, `createOffer(nftContract,tokenId,quantity,offerPrice,paymentToken,duration) returns offerId, payable`, `cancelOffer(offerId)`, `acceptOffer(offerId)`
- **View:** `getListingDetails`, `getOfferDetails`, `getCurrentPrice`, `getOffersForNFT`, `calculateFees`, `whitelistedPaymentTokens`, `whitelistedNftContracts`

Events the skill decodes from receipts: `ListingCreated(listingId, seller, …)`, `OfferCreated(offerId, offeror, …)`. Other emitted events (`ItemSold`, `ListingCancelled`, `OfferAccepted`, `RoyaltyInfoUpdated`, …) exist but the skill currently doesn't decode them.

---

## 3. Listing semantics

`createListing` accepts `startPrice` and `endPrice`. The marketplace decides between fixed-price vs Dutch auction by inspecting these:

- `startPrice == endPrice` → fixed price. `getCurrentPrice` always returns `startPrice`.
- `startPrice != endPrice` and `duration > 0` → Dutch auction. `getCurrentPrice` interpolates between the two over `[startTime, startTime+duration]`. `isDutchAuction` view returns true.

`duration == 0` is interpreted as "no end time" by the live frontend (the listing stays open until cancelled or sold). The skill defaults to `0`; pass `--duration <sec>` to set a hard deadline.

For ERC-721 the `quantity` MUST be 1; the skill enforces this in `list.mjs`. For ERC-1155 you can list multiple copies under a single `listingId` (each `buy` decrements `quantity`).

---

## 4. Approval flow

| Action | What we approve | When |
|---|---|---|
| `list` | `setApprovalForAll(marketplace, true)` on the NFT contract | First listing of each collection from this wallet (idempotent across tokens) |
| `accept-offer` | Same — `setApprovalForAll` on the NFT contract | First time accepting an offer for that collection |
| `buy` (ERC-20 paymentToken) | `approve(marketplace, totalWei)` on the payment token | If `allowance < totalWei`. `--max-approve` switches to unlimited |
| `offer` (ERC-20 paymentToken) | Same — `approve(marketplace, totalWei)` on the payment token | If `allowance < totalWei` |
| `buy` (native paymentToken) | none | The marketplace pulls value via `msg.value` |
| `offer` (native paymentToken) | none | Same — `msg.value` is the escrow |

`setApprovalForAll` is binary (true/false) — there is no per-token approval. Once granted, every listing or offer-acceptance for that collection from this wallet skips the approval step.

The native sentinel (`address(0)`) is detected via case-insensitive comparison.

---

## 5. Fee model

`calculateFees(amount)` returns `(foundationAmount, developerAmount, platformAmount)`. The marketplace ABI also exposes:

- `marketplaceFee()` — total bps charged
- `foundationPercentage`, `developerPercentage`, `platformPercentage` — split bps
- `foundationRecipient`, `developerRecipients`, `platformRecipient` — payout addresses
- `setRoyaltyPercentages` / `setRoyaltyRecipients` — admin-only (the skill never calls these)

The skill surfaces `feesOnStart` in `listing.mjs` (precomputed for the start price). It does NOT precompute fees in `buy.mjs` — the contract handles the split atomically; the buyer pays the full `currentPrice * quantity`.

---

## 6. GraphQL endpoint + filter shapes

Endpoint: `POST https://api.crossnft.io/graphql` with headers:

```
content-type: application/json
apollo-require-preflight: true
```

Apollo Server has CSRF prevention enabled — the header above is required. Introspection is disabled in production, so all operations the skill uses are hard-coded in `_api.mjs` (re-extracted from the live frontend bundle).

### Pagination

```
input PaginationInput { skip: Int!, take: Int! }
```

Both fields required. `--top` maps to `take`, `--skip` maps to `skip`.

### Filter shapes (camelCase, address fields lowercased)

| Operation | Filter type | Useful fields |
|---|---|---|
| `ListCollectionStatistics` | `CollectionStatsFilterInput` | `days: "24h"\|"7d"\|"30d"\|"all"` (required) |
| `GetToken` | `GetTokenFilter` | `address: String!`, `tokenId: String!` |
| `ListTokens` | `ListTokensFilter` | `collectionId: String` (numeric internal id), `owner: String` |
| `ListOffers` | `ListOffersFilter` | `collectionId: String`, `nftContract: String`, `tokenId: String`, `offeror: String` |
| `ListActivities` | `ListActivitiesFilter` | `contractAddresses: [String]`, `tokenId: String`, `fromAddress: String`, `toAddress: String`, `types: [String]` (SALE, LISTING, OFFER, TRANSFER, BURN, …) |
| `GetMarketDepth` | `DepthDataListFilterInput` | `collectionId: String` |
| `GetStatistics` | `StatisticsFilterInput` | `collectionId: String` |
| `ListTradeHistories` | `CollectionIdFilterInput` | `collectionId: String` |

### Why `ListTokens` keys on internal `collectionId`, not contract address

The indexer numbers collections sequentially (`id: "1"`, `"2"`, …) and exposes that id on every `Collection` node. `contractAddress` is also there, but the `ListTokens` filter only accepts `collectionId` — confirmed via error message
`Field "contractAddress" is not defined by type "ListTokensFilter"`. Resolve `contractAddress → collectionId` via `collections.mjs` (or `search.mjs`) first; we keep the response's `contractAddress` so subsequent on-chain calls can use the address directly.

---

## 7. Order types observed in the wild

`ListActivities` returns these `type` values (incomplete list, derived from sample fetches):

- `SALE` — buyer paid `price` of `paymentToken`. `fromAddress` = seller, `toAddress` = buyer.
- `LISTING` — `createListing` event indexed. `fromAddress` = seller.
- `OFFER` — `createOffer` event indexed.
- `OFFER_ACCEPTED` — seller called `acceptOffer`.
- `LISTING_CANCELLED` / `OFFER_CANCELLED`
- `TRANSFER` — generic ERC-721/1155 Transfer (not necessarily a marketplace event).
- `BURN` — Transfer to `0x0`.
- `MINT` — Transfer from `0x0`.

Pass these uppercase strings to `--types` on `activities.mjs`.

---

## 8. Future write-paths the skill does NOT (yet) cover

- **Bulk listing / sweep buy** — would batch multiple listings into one call. The current ABI doesn't expose a bulk path, so this would need multicall.
- **Royalty admin** — `setRoyaltyPercentages` / `setRoyaltyRecipients` are admin-only and out of scope.
- **Subscriptions** — the bundle defines `OfferUpdated` / `AuctionUpdated` / `ActivityUpdated` GraphQL subscriptions over WebSocket. The skill polls instead.

If these become necessary, follow the same pattern: add the operation/ABI fragment to `_api.mjs` / `_abi.mjs`, write a script next to its sibling, and document the new filter shape here.

---

## 9. Smoke test — read-path one-liners

```bash
cd ~/.claude/skills/cross-nft

# Trending collections (last 7d)
node scripts/collections.mjs --days 7d --top 10

# A specific token (the page that inspired this skill)
node scripts/token.mjs 0xa3bd4e86cd0ec20b03c9710359599c9f82f8fe9e 30164746843126

# That token's on-chain listing
node scripts/listing.mjs 321699

# Recent SALE activity in the Materials collection
node scripts/activities.mjs --collection 0xa3bd4e86cd0ec20b03c9710359599c9f82f8fe9e --types SALE --top 5

# Active offers across the same collection
node scripts/offers.mjs --collection 0xa3bd4e86cd0ec20b03c9710359599c9f82f8fe9e --top 5

# Search
node scripts/search.mjs "primal heroz"
```

If any of these return an `errors` payload from the API, re-fetch the live bundle and re-derive the relevant filter type — the upstream schema is the source of truth.

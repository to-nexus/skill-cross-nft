# cross-nft

A Claude Code skill that drives the **CROSS NFT marketplace** at `https://www.crossnft.io` — list, browse, buy, make/cancel/accept offers — using the same backends the live site does.

- **Stack:** EOA + viem + raw HTTPS (no browser automation, no ERC-4337)
- **Backends:**
  - `api.crossnft.io/graphql` — Apollo GraphQL indexer (collections, tokens, listings, offers, activities, stats, search)
  - `MarketplaceV1` at `0x0df40a50f2c09885c18245dc90e8e9dcd0e4c3bc` on **CROSS Chain (chain id 612055)**
- **Default payment token:** MGold (`MGT`, decimals 18) at `0x5b1579a758916560f00212b78a7af728eaa0ffa9`
- **Subcommands:**
  - read: `collections`, `token`, `tokens`, `listing`, `offer-onchain`, `offers`, `activities`, `stats`, `search`
  - write: `list`, `cancel-listing`, `buy`, `offer`, `cancel-offer`, `accept-offer`
- **Distribution:** standalone Claude skill **and** wrapped as a Claude Code plugin

> **v0.1 ships read + write.** Each write script auto-detects the right approval flow:
> - `list` / `accept-offer` — runs `setApprovalForAll(marketplace, true)` on the NFT contract if not already approved.
> - `buy` / `offer` — for ERC-20 paymentToken, runs `approve(marketplace, total)` (exact amount, or unlimited with `--max-approve`); for native paymentToken (sentinel `0x0…0`), attaches `msg.value` instead.

> 🔒 **Private repository.** Owner (`to-nexus`) installs via `gh auth login`. Others need collaborator access or `GITHUB_TOKEN`. See the umbrella [`cross-skills-suite` README](https://github.com/to-nexus/cross-skills-suite#authenticating-to-private-repos) for details.

---

## Install — Standalone

### Option 1 — Plain skill (one user, fastest)

```bash
git clone <this-repo> /tmp/skill-cross-nft
bash /tmp/skill-cross-nft/install.sh        # symlinks into ~/.claude/skills/
```

Or manually:
```bash
cp -r skills/cross-nft ~/.claude/skills/
cd ~/.claude/skills/cross-nft && npm install
```

### Option 2 — Claude Code plugin (marketplace-installable)

```json
{
  "name": "cross-nft",
  "source": { "source": "github", "repo": "to-nexus/skill-cross-nft" },
  "category": "blockchain"
}
```

---

## Configuration

Read-path commands (`collections`, `token`, `tokens`, `listing`, `offer-onchain`, `offers`, `activities`, `stats`, `search`) **do not** require a private key. Only the write commands need one.

```bash
cp skills/cross-nft/.env.example skills/cross-nft/.env
chmod 600 skills/cross-nft/.env
```

| Variable | Required | Default | Notes |
|---|---|---|---|
| `PRIVATE_KEY` | only for write commands | — | EOA signer, `0x` + 64 hex chars |
| `WALLET_ADDRESS` | optional | derived from PK | Mismatch warns via `signerWarn` |
| `CROSS_RPC_URL` | optional | `https://mainnet.crosstoken.io:22001/` | Override only if you have a private RPC |
| `MAX_TRADE_NOTIONAL` | recommended | unset | Per-trade cap (payment-token units); aborts above this |
| `CONFIRM_THRESHOLD` | recommended | `1` | Trades above this notional require `--confirm` |
| `MIN_GAS_NATIVE` | optional | `0.001` | Source-chain native (CROSS) floor |
| `MARKETPLACE_ADDRESS` | optional | `0x0df40a50f2c09885c18245dc90e8e9dcd0e4c3bc` | Debug override only |
| `CROSSNFT_API_BASE` | optional | `https://api.crossnft.io` | Debug override only |

---

## Quick start

Inside Claude Code, just describe the action in plain language. The skill activates on phrases like:

- "trending crossnft collections this week"
- "show this NFT https://www.crossnft.io/collections/0xa3bd…/tokens/30164…"
- "buy crossnft listing 321699"
- "list this NFT 30 MGT"
- "make offer 25 MGT for 0xa3bd… token 30164…"
- "내 listing 321699 취소"
- "오퍼 30 수락"

Direct CLI:
```bash
cd ~/.claude/skills/cross-nft

# read
node scripts/collections.mjs --days 7d --top 10
node scripts/token.mjs 0xa3bd4e86cd0ec20b03c9710359599c9f82f8fe9e 30164746843126
node scripts/listing.mjs 321699
node scripts/offers.mjs --collection 0xa3bd4e86cd0ec20b03c9710359599c9f82f8fe9e --top 5
node scripts/activities.mjs --collection 0xa3bd4e86cd0ec20b03c9710359599c9f82f8fe9e --types SALE --top 5
node scripts/search.mjs "primal heroz"

# write (PRIVATE_KEY required)
PRIVATE_KEY=0x... node scripts/list.mjs 0xa3bd…fe9e 30164746843126 30 --confirm
PRIVATE_KEY=0x... node scripts/buy.mjs 321699 --confirm
PRIVATE_KEY=0x... node scripts/offer.mjs 0xa3bd…fe9e 30164746843126 25 --duration 604800 --confirm
PRIVATE_KEY=0x... node scripts/cancel-listing.mjs 321699
PRIVATE_KEY=0x... node scripts/accept-offer.mjs 30 --confirm
```

All commands emit a single JSON object on stdout.

---

## Layout

```
skill-cross-nft/                       # repo root = plugin
├── .claude-plugin/plugin.json         # plugin manifest
├── install.sh                         # symlink installer
├── README.md
├── LICENSE
└── skills/
    └── cross-nft/                     # the skill itself
        ├── SKILL.md
        ├── package.json
        ├── .env.example
        ├── scripts/
        │   ├── _addresses.mjs         # marketplace + payment-token + sentinel
        │   ├── _chain.mjs             # CROSS Chain definition + public client
        │   ├── _signer.mjs            # PK -> wallet client; mismatch warn
        │   ├── _abi.mjs               # MarketplaceV1 + ERC20/721/1155 minimal
        │   ├── _api.mjs               # GraphQL fetch wrapper + 8 hard-coded ops
        │   ├── _guard.mjs             # chain, gas, cap, confirm, allowance
        │   ├── _nft.mjs               # ERC-165 detect, isApprovedForAll
        │   ├── _format.mjs            # bigint -> human price helpers
        │   ├── _io.mjs                # tiny argv parser + JSON envelope
        │   ├── collections.mjs        # ListCollectionStatistics
        │   ├── token.mjs              # GetToken
        │   ├── tokens.mjs             # ListTokens
        │   ├── offers.mjs             # ListOffers (indexer)
        │   ├── activities.mjs         # ListActivities
        │   ├── stats.mjs              # GetStatistics + ListTradeHistories + GetMarketDepth
        │   ├── search.mjs             # ListSearchResults
        │   ├── listing.mjs            # on-chain getListingDetails + getCurrentPrice
        │   ├── offer-onchain.mjs      # on-chain getOfferDetails
        │   ├── list.mjs               # createListing (auto setApprovalForAll)
        │   ├── cancel-listing.mjs     # cancelListing
        │   ├── buy.mjs                # buy (auto ERC-20 approve / msg.value)
        │   ├── offer.mjs              # createOffer (auto ERC-20 approve / msg.value)
        │   ├── cancel-offer.mjs       # cancelOffer
        │   └── accept-offer.mjs       # acceptOffer (auto setApprovalForAll)
        └── references/cross-nft.md    # ABI provenance, GraphQL filter shapes, fee model
```

---

## Safety model

The skill enforces these rails on every write op via `_guard.mjs`:

1. **Source-chain id check** — every signed tx aborts unless `eth_chainId == 612055`.
2. **`MAX_TRADE_NOTIONAL`** — env cap; aborts when the per-trade payable exceeds it.
3. **`CONFIRM_THRESHOLD` + `--confirm` gate** — any trade above this aborts with `awaiting_confirm`.
4. **`MIN_GAS_NATIVE` pre-flight** — aborts if CROSS native balance < this (default 0.001).
5. **Payment-token whitelist guard** — `whitelistedPaymentTokens(addr)` must return true.
6. **Listing/offer activeness guard** — `cancel-listing` / `cancel-offer` / `buy` / `accept-offer` pre-fetch the on-chain object and abort cleanly if `isActive == false`.
7. **Seller / offeror identity guard** — cancel scripts abort if the signer is not the original maker.
8. **NFT approval auto-run** — `list` / `accept-offer` only call `setApprovalForAll` if not already approved.
9. **ERC-20 allowance auto-run** — `buy` / `offer` approve exactly the needed amount (or unlimited with `--max-approve`).
10. **`WALLET_ADDRESS` mismatch warning** — non-null `signerWarn` field when env disagrees with PK-derived address.

The private key never appears in the Claude transcript unless the user pastes it in directly. Even then it's passed via `process.env` to the spawned `node`, never echoed back.

---

## License

[MIT](LICENSE) — but read the disclaimer at the bottom of the LICENSE file before using.

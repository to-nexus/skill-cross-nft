#!/usr/bin/env node
// Browse tokens in a collection or owned by an address.
// Usage:
//   node tokens.mjs --collection-id <internal-id> [--top N] [--skip N]
//   node tokens.mjs --owner 0x... [--top N] [--skip N]
//
// `collection-id` is the numeric internal ID printed by collections.mjs
// (the index does NOT support filtering tokens by raw contract address —
//  resolve via collections.mjs first).
import { gql, Q_LIST_TOKENS } from './_api.mjs';
import { main, parseArgs } from './_io.mjs';
import { priceFromAuction } from './_format.mjs';

await main(async () => {
  const { flags } = parseArgs(process.argv.slice(2));
  const filter = {};
  if (flags['collection-id']) filter.collectionId = String(flags['collection-id']);
  if (flags.owner) filter.owner = String(flags.owner).toLowerCase();
  if (Object.keys(filter).length === 0) {
    return { ok: false, error: 'usage', detail: 'pass --collection-id <id> or --owner <0x…>' };
  }
  const take = Number(flags.top || 20);
  const skip = Number(flags.skip || 0);

  const data = await gql(
    Q_LIST_TOKENS,
    { filter, pagination: { skip, take } },
    'ListTokens',
  );

  const rows = (data.tokens || []).map((t) => ({
    contractAddress: t.collection?.contractAddress,
    tokenId: t.tokenId,
    name: t.definition?.metadata?.name || null,
    protocol: t.protocol,
    owner: t.owner,
    listing: priceFromAuction(t.auction),
    pageUrl: t.collection?.contractAddress
      ? `https://www.crossnft.io/collections/${t.collection.contractAddress}/tokens/${t.tokenId}`
      : null,
  }));

  return { ok: true, filter, skip, take, total: data.tokensCount, rows };
});

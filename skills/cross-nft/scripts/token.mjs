#!/usr/bin/env node
// Fetch a single token (metadata + active listing if any).
// Usage: node token.mjs <contractAddress> <tokenId>
//   or:  node token.mjs --url https://www.crossnft.io/collections/0x.../tokens/...
import { gql, Q_GET_TOKEN } from './_api.mjs';
import { main, parseArgs } from './_io.mjs';
import { priceFromAuction } from './_format.mjs';

function parseUrl(url) {
  // /collections/<addr>/tokens/<id>
  const m = String(url).match(/\/collections\/(0x[a-fA-F0-9]{40})\/tokens\/([0-9]+)/);
  if (!m) return null;
  return { contractAddress: m[1].toLowerCase(), tokenId: m[2] };
}

await main(async () => {
  const { positional, flags } = parseArgs(process.argv.slice(2));
  let address, tokenId;
  if (flags.url) {
    const u = parseUrl(flags.url);
    if (!u) return { ok: false, error: 'bad_arg', detail: '--url not a crossnft.io token URL' };
    ({ contractAddress: address, tokenId } = u);
  } else {
    [address, tokenId] = positional;
  }
  if (!address || !tokenId) {
    return { ok: false, error: 'usage', detail: 'token.mjs <contractAddress> <tokenId> | --url <crossnft.io url>' };
  }

  const data = await gql(
    Q_GET_TOKEN,
    { filter: { address: address.toLowerCase(), tokenId: String(tokenId) } },
    'GetToken',
  );
  const t = data.token;
  if (!t) return { ok: false, error: 'not_found', detail: `token ${address}:${tokenId} not in crossnft index` };

  return {
    ok: true,
    contractAddress: address.toLowerCase(),
    tokenId: t.tokenId,
    protocol: t.protocol,
    owner: t.owner,
    locked: t.locked,
    burned: t.burned,
    collection: {
      name: t.collection?.name,
      slug: t.collection?.slug,
      collectionId: t.collection?.id,
      chainId: t.collection?.network?.chainId,
    },
    metadata: t.definition?.metadata
      ? {
          name: t.definition.metadata.name,
          description: t.definition.metadata.description?.slice(0, 240),
          attributes: t.definition.metadata.attributes,
        }
      : null,
    listing: t.auction ? priceFromAuction(t.auction) : null,
    pageUrl: `https://www.crossnft.io/collections/${address.toLowerCase()}/tokens/${t.tokenId}`,
  };
});

#!/usr/bin/env node
// List collection statistics from api.crossnft.io.
// Usage: node collections.mjs [--days 24h|7d|30d|all] [--top N] [--skip N]
import { gql, Q_LIST_COLLECTIONS } from './_api.mjs';
import { main, parseArgs } from './_io.mjs';

await main(async () => {
  const { flags } = parseArgs(process.argv.slice(2));
  const days = String(flags.days || '7d');
  if (!['24h', '7d', '30d', 'all'].includes(days)) {
    return { ok: false, error: 'bad_arg', detail: `--days must be 24h|7d|30d|all (got ${days})` };
  }
  const take = Number(flags.top || 20);
  const skip = Number(flags.skip || 0);

  const data = await gql(
    Q_LIST_COLLECTIONS,
    { filter: { days }, days, pagination: { skip, take } },
    'ListCollectionStatistics',
  );

  const rows = (data.collectionStatistics || []).map((s) => ({
    name: s.collection?.name,
    slug: s.collection?.slug,
    contractAddress: s.contractAddress,
    collectionId: s.collection?.id,
    chainId: s.collection?.network?.chainId,
    supply: s.supply,
    owners: s.owners,
    activeListings: s.listings,
    floorPrice: s.floorPrice?.value ?? null,
    floorChangePct: s.floorPrice?.changeRate ?? null,
    volume: s.volume?.value ?? null,
    volumeChangePct: s.volume?.changeRate ?? null,
    sales: s.sales?.value ?? null,
  }));

  return {
    ok: true,
    days,
    skip,
    take,
    totalCollections: data.collectionsCount,
    rows,
  };
});

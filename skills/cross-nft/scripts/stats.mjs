#!/usr/bin/env node
// Collection statistics + trade histories + market depth.
// Usage:
//   node stats.mjs --collection-id <id>          # statistics + trade history
//   node stats.mjs --collection-id <id> --depth  # also fetch listing/offer depth
import { gql, Q_GET_STATISTICS, Q_LIST_TRADE_HISTORIES, Q_GET_MARKET_DEPTH } from './_api.mjs';
import { main, parseArgs } from './_io.mjs';

await main(async () => {
  const { flags } = parseArgs(process.argv.slice(2));
  const collectionId = flags['collection-id'];
  if (!collectionId) {
    return { ok: false, error: 'usage', detail: 'stats.mjs --collection-id <id> [--days 24h|7d|30d|all]' };
  }
  const days = String(flags.days || '7d');
  if (!['24h', '7d', '30d', 'all'].includes(days)) {
    return { ok: false, error: 'bad_arg', detail: `--days must be 24h|7d|30d|all (got ${days})` };
  }
  const filter = { collectionId: String(collectionId) };
  const filterWithDays = { ...filter, days };

  const [stats, hist] = await Promise.all([
    gql(Q_GET_STATISTICS, { filter: filterWithDays }, 'GetStatistics').catch((e) => ({ _err: e.message })),
    gql(Q_LIST_TRADE_HISTORIES, { filter }, 'ListTradeHistories').catch((e) => ({ _err: e.message })),
  ]);

  let depth = null;
  if (flags.depth) {
    depth = await gql(Q_GET_MARKET_DEPTH, { filter }, 'GetMarketDepth').catch((e) => ({ _err: e.message }));
  }

  return {
    ok: true,
    collectionId: filter.collectionId,
    statistics: stats?.statistics || stats,
    tradeHistories: hist?.tradeHistories || hist,
    marketDepth: depth?.marketDepth || depth,
  };
});

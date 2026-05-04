#!/usr/bin/env node
// Free-text search across collections + games (the same backend that
// powers the marketplace's nav-bar search box).
// Usage: node search.mjs "<keyword>"
import { gql, Q_LIST_SEARCH } from './_api.mjs';
import { main, parseArgs } from './_io.mjs';

await main(async () => {
  const { positional } = parseArgs(process.argv.slice(2));
  const keyword = positional.join(' ').trim();
  if (!keyword) return { ok: false, error: 'usage', detail: 'search.mjs "<keyword>"' };

  const data = await gql(Q_LIST_SEARCH, { keyword }, 'ListSearchResults');
  const rows = (data.search || []).map((r) => ({
    score: r.score,
    type: r.item?.searchType,
    name: r.item?.name,
    slug: r.item?.slug,
    contractAddress: r.item?.contractAddress || null,
    networkId: r.item?.networkId || null,
    id: r.item?.id,
  }));
  return { ok: true, keyword, count: rows.length, rows };
});

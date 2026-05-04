#!/usr/bin/env node
// Stream marketplace activity (sales, listings, offers, transfers, burns).
// Usage:
//   node activities.mjs --collection 0x... [--types sale,listing,offer,...]
//   node activities.mjs --from 0x... | --to 0x...      # by counterparty
import { gql, Q_LIST_ACTIVITIES } from './_api.mjs';
import { main, parseArgs } from './_io.mjs';

await main(async () => {
  const { flags } = parseArgs(process.argv.slice(2));
  const filter = {};
  if (flags.collection) filter.contractAddresses = [String(flags.collection).toLowerCase()];
  if (flags['collection-id']) filter.collectionId = String(flags['collection-id']);
  if (flags.token) filter.tokenId = String(flags.token);
  if (flags.from) filter.fromAddress = String(flags.from).toLowerCase();
  if (flags.to) filter.toAddress = String(flags.to).toLowerCase();
  if (flags.types) {
    filter.types = String(flags.types)
      .split(',')
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);
  }

  const take = Number(flags.top || 20);
  const skip = Number(flags.skip || 0);

  const data = await gql(
    Q_LIST_ACTIVITIES,
    { filter, pagination: { skip, take } },
    'ListActivities',
  );

  const rows = (data.activities || []).map((a) => ({
    type: a.type,
    tokenId: a.tokenId,
    tokenName: a.token?.definition?.metadata?.name || null,
    collectionName: a.collection?.name || null,
    contractAddress: a.collection?.contractAddress || null,
    quantity: a.quantity,
    priceWei: a.price,
    paymentToken: a.paymentToken,
    paymentSymbol: a.payment?.symbol || null,
    paymentDecimals: a.payment?.decimals ?? null,
    fromAddress: a.fromAddress,
    toAddress: a.toAddress,
    txHash: a.txHash,
    insertedAt: a.insertedAt,
  }));

  return { ok: true, filter, skip, take, total: data.activitiesCount, rows };
});

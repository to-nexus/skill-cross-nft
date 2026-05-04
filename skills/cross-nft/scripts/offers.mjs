#!/usr/bin/env node
// List offers (buy-side bids) on a collection or specific token.
// Usage:
//   node offers.mjs --collection 0x...                 # all offers on collection
//   node offers.mjs --collection 0x... --token <id>    # offers on one token
//   node offers.mjs --collection-id <id>               # by internal collection id
//   node offers.mjs --offeror 0x...                    # offers I made
import { gql, Q_LIST_OFFERS } from './_api.mjs';
import { main, parseArgs } from './_io.mjs';
import { priceFromOffer } from './_format.mjs';

await main(async () => {
  const { flags } = parseArgs(process.argv.slice(2));
  const filter = {};
  if (flags.collection) filter.nftContract = String(flags.collection).toLowerCase();
  if (flags['collection-id']) filter.collectionId = String(flags['collection-id']);
  if (flags.token) filter.tokenId = String(flags.token);
  if (flags.offeror) filter.offeror = String(flags.offeror).toLowerCase();
  if (flags.status) filter.status = String(flags.status); // ACTIVE / ACCEPTED / CANCELED / EXPIRED — guess

  const take = Number(flags.top || 20);
  const skip = Number(flags.skip || 0);

  const data = await gql(
    Q_LIST_OFFERS,
    { filter, pagination: { skip, take } },
    'ListOffers',
  );

  const rows = (data.offers || []).map((o) => ({
    ...priceFromOffer(o),
    tokenId: o.tokenId,
    contractAddress: o.contract?.address,
    tokenName: o.token?.definition?.metadata?.name || null,
  }));

  return { ok: true, filter, skip, take, total: data.offersCount, rows };
});

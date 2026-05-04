#!/usr/bin/env node
// On-chain read of a specific offer. Useful to confirm what the chain says
// before calling cancel-offer or accept-offer.
//
// Usage: node offer-onchain.mjs <offerId>
import { getPublicClient } from './_chain.mjs';
import { MARKETPLACE_ADDRESS } from './_addresses.mjs';
import { MARKETPLACE_ABI } from './_abi.mjs';
import { main, parseArgs } from './_io.mjs';

await main(async () => {
  const { positional } = parseArgs(process.argv.slice(2));
  const offerId = positional[0];
  if (!offerId) return { ok: false, error: 'usage', detail: 'offer-onchain.mjs <offerId>' };

  const pub = getPublicClient();
  const id = BigInt(offerId);
  const details = await pub.readContract({
    address: MARKETPLACE_ADDRESS, abi: MARKETPLACE_ABI,
    functionName: 'getOfferDetails', args: [id],
  });
  const d = Array.isArray(details)
    ? {
        offeror: details[0], nftContract: details[1], tokenId: details[2],
        quantity: details[3], offerPrice: details[4], paymentToken: details[5],
        expirationTime: details[6], isActive: details[7],
      }
    : details;

  return {
    ok: true,
    offerId: String(id),
    offeror: d.offeror,
    nftContract: d.nftContract,
    tokenId: String(d.tokenId),
    quantity: String(d.quantity),
    offerPriceWei: String(d.offerPrice),
    paymentToken: d.paymentToken,
    expirationTime: Number(d.expirationTime),
    isActive: d.isActive,
    pageUrl: `https://www.crossnft.io/collections/${d.nftContract.toLowerCase()}/tokens/${d.tokenId}`,
  };
});

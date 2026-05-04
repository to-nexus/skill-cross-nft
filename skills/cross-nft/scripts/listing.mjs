#!/usr/bin/env node
// On-chain read of a specific listing (the indexer's `auction.listingId`).
// Returns getListingDetails + getCurrentPrice + calculateFees on the listed
// price. Useful to confirm what the chain says before calling buy/cancel.
//
// Usage: node listing.mjs <listingId>
import { getPublicClient, explorerAddressUrl } from './_chain.mjs';
import { MARKETPLACE_ADDRESS } from './_addresses.mjs';
import { MARKETPLACE_ABI } from './_abi.mjs';
import { main, parseArgs } from './_io.mjs';
import { formatUnits } from 'viem';

await main(async () => {
  const { positional } = parseArgs(process.argv.slice(2));
  const listingId = positional[0];
  if (!listingId) return { ok: false, error: 'usage', detail: 'listing.mjs <listingId>' };

  const pub = getPublicClient();
  const id = BigInt(listingId);

  const [details, currentPrice] = await Promise.all([
    pub.readContract({
      address: MARKETPLACE_ADDRESS, abi: MARKETPLACE_ABI,
      functionName: 'getListingDetails', args: [id],
    }),
    pub.readContract({
      address: MARKETPLACE_ADDRESS, abi: MARKETPLACE_ABI,
      functionName: 'getCurrentPrice', args: [id],
    }).catch(() => null),
  ]);

  // tuple comes back as object with named keys per ABI
  const d = Array.isArray(details)
    ? {
        seller: details[0], nftContract: details[1], tokenId: details[2],
        quantity: details[3], startPrice: details[4], endPrice: details[5],
        paymentToken: details[6], startTime: details[7], endTime: details[8],
        isActive: details[9], isDutchAuction: details[10],
      }
    : details;

  const fees = await pub.readContract({
    address: MARKETPLACE_ADDRESS, abi: MARKETPLACE_ABI,
    functionName: 'calculateFees', args: [d.startPrice],
  }).catch(() => null);

  return {
    ok: true,
    listingId: String(id),
    seller: d.seller,
    nftContract: d.nftContract,
    tokenId: String(d.tokenId),
    quantity: String(d.quantity),
    startPriceWei: String(d.startPrice),
    endPriceWei: String(d.endPrice),
    paymentToken: d.paymentToken,
    startTime: Number(d.startTime),
    endTime: Number(d.endTime),
    isActive: d.isActive,
    isDutchAuction: d.isDutchAuction,
    currentPriceWei: currentPrice !== null ? String(currentPrice) : null,
    feesOnStart: fees ? {
      foundationWei: String(fees[0]),
      developerWei: String(fees[1]),
      platformWei: String(fees[2]),
    } : null,
    pageUrl: `https://www.crossnft.io/collections/${d.nftContract.toLowerCase()}/tokens/${d.tokenId}`,
    marketplaceExplorer: explorerAddressUrl(MARKETPLACE_ADDRESS),
  };
});

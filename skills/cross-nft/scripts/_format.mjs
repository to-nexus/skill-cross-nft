// Shared formatters for human-friendly output. Bigints are stringified
// up the chain (in _io.mjs), but we also expose human numbers so the
// model doesn't have to reach for parseUnits.

import { formatUnits } from 'viem';

export function priceFromAuction(auction) {
  if (!auction) return null;
  const dec = auction.payment?.decimals ?? 18;
  return {
    startPriceWei: auction.startPrice,
    endPriceWei: auction.endPrice,
    startPriceHuman: Number(formatUnits(BigInt(auction.startPrice || '0'), dec)),
    endPriceHuman: Number(formatUnits(BigInt(auction.endPrice || '0'), dec)),
    paymentToken: auction.paymentToken,
    paymentSymbol: auction.payment?.symbol || null,
    paymentDecimals: dec,
    listingId: auction.listingId,
    seller: auction.seller,
    quantity: auction.quantity,
    startTime: auction.startTime,
    endTime: auction.endTime,
    isDutchAuction: auction.startPrice !== auction.endPrice,
  };
}

export function priceFromOffer(offer) {
  if (!offer) return null;
  const dec = offer.payment?.decimals ?? 18;
  return {
    offerId: offer.offerId,
    offeror: offer.offeror,
    offerPriceWei: offer.offerPrice,
    offerPriceHuman: Number(formatUnits(BigInt(offer.offerPrice || '0'), dec)),
    paymentToken: offer.paymentToken,
    paymentSymbol: offer.payment?.symbol || null,
    paymentDecimals: dec,
    quantity: offer.quantity,
    expirationTime: offer.expirationTime,
  };
}

export function shortenAddr(addr) {
  if (!addr) return null;
  return addr.slice(0, 6) + '…' + addr.slice(-4);
}

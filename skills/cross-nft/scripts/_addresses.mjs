// Authoritative addresses for the CROSS NFT marketplace.
// Pulled from the live RSC payload of https://www.crossnft.io
// (see references/cross-nft.md for derivation). Override-able via env.

export const CROSS_CHAIN_ID = 612055;

export const MARKETPLACE_ADDRESS =
  (process.env.MARKETPLACE_ADDRESS || '0x0df40a50f2c09885c18245dc90e8e9dcd0e4c3bc').toLowerCase();

// Native sentinel — the marketplace treats address(0) as "use msg.value
// as paymentToken". Any payment-token field equal to this means no ERC-20
// approval is needed and buy / createOffer must attach msg.value.
export const NATIVE_SENTINEL = '0x0000000000000000000000000000000000000000';

// Default payment token surfaced by the marketplace UI. MGold (MGT), 18 dp.
export const DEFAULT_PAYMENT_TOKEN = {
  address: '0x5b1579a758916560f00212b78a7af728eaa0ffa9',
  symbol: 'MGT',
  decimals: 18,
};

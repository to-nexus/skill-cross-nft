// ABIs derived from the live RSC payload of crossnft.io (see
// references/cross-nft.md). Only the functions the skill actually
// calls are kept — adding more is safe but unnecessary.

export const MARKETPLACE_ABI = [
  // ---- write ----
  {
    name: 'createListing',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'nftContract', type: 'address' },
      { name: 'tokenId', type: 'uint256' },
      { name: 'quantity', type: 'uint256' },
      { name: 'startPrice', type: 'uint256' },
      { name: 'endPrice', type: 'uint256' },
      { name: 'paymentToken', type: 'address' },
      { name: 'duration', type: 'uint256' },
    ],
    outputs: [{ name: 'listingId', type: 'uint256' }],
  },
  {
    name: 'cancelListing',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'listingId', type: 'uint256' }],
    outputs: [],
  },
  {
    name: 'buy',
    type: 'function',
    stateMutability: 'payable',
    inputs: [
      { name: 'listingId', type: 'uint256' },
      { name: 'quantity', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    name: 'createOffer',
    type: 'function',
    stateMutability: 'payable',
    inputs: [
      { name: 'nftContract', type: 'address' },
      { name: 'tokenId', type: 'uint256' },
      { name: 'quantity', type: 'uint256' },
      { name: 'offerPrice', type: 'uint256' },
      { name: 'paymentToken', type: 'address' },
      { name: 'duration', type: 'uint256' },
    ],
    outputs: [{ name: 'offerId', type: 'uint256' }],
  },
  {
    name: 'cancelOffer',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'offerId', type: 'uint256' }],
    outputs: [],
  },
  {
    name: 'acceptOffer',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'offerId', type: 'uint256' }],
    outputs: [],
  },

  // ---- view ----
  {
    name: 'getListingDetails',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'listingId', type: 'uint256' }],
    outputs: [
      { name: 'seller', type: 'address' },
      { name: 'nftContract', type: 'address' },
      { name: 'tokenId', type: 'uint256' },
      { name: 'quantity', type: 'uint256' },
      { name: 'startPrice', type: 'uint256' },
      { name: 'endPrice', type: 'uint256' },
      { name: 'paymentToken', type: 'address' },
      { name: 'startTime', type: 'uint256' },
      { name: 'endTime', type: 'uint256' },
      { name: 'isActive', type: 'bool' },
      { name: 'isDutchAuction', type: 'bool' },
    ],
  },
  {
    name: 'getOfferDetails',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'offerId', type: 'uint256' }],
    outputs: [
      { name: 'offeror', type: 'address' },
      { name: 'nftContract', type: 'address' },
      { name: 'tokenId', type: 'uint256' },
      { name: 'quantity', type: 'uint256' },
      { name: 'offerPrice', type: 'uint256' },
      { name: 'paymentToken', type: 'address' },
      { name: 'expirationTime', type: 'uint256' },
      { name: 'isActive', type: 'bool' },
    ],
  },
  {
    name: 'getCurrentPrice',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'listingId', type: 'uint256' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'getOffersForNFT',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'nftContract', type: 'address' },
      { name: 'tokenId', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'uint256[]' }],
  },
  {
    name: 'calculateFees',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'amount', type: 'uint256' }],
    outputs: [
      { name: 'foundationAmount', type: 'uint256' },
      { name: 'developerAmount', type: 'uint256' },
      { name: 'platformAmount', type: 'uint256' },
    ],
  },
  {
    name: 'whitelistedPaymentTokens',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'token', type: 'address' }],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    name: 'whitelistedNftContracts',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'nftContract', type: 'address' }],
    outputs: [{ name: '', type: 'bool' }],
  },
];

export const ERC20_ABI = [
  { name: 'allowance', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }] },
  { name: 'approve', type: 'function', stateMutability: 'nonpayable',
    inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }],
    outputs: [{ name: '', type: 'bool' }] },
  { name: 'balanceOf', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }] },
  { name: 'decimals', type: 'function', stateMutability: 'view',
    inputs: [], outputs: [{ name: '', type: 'uint8' }] },
  { name: 'symbol', type: 'function', stateMutability: 'view',
    inputs: [], outputs: [{ name: '', type: 'string' }] },
];

export const ERC721_ABI = [
  { name: 'ownerOf', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [{ name: '', type: 'address' }] },
  { name: 'isApprovedForAll', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }, { name: 'operator', type: 'address' }],
    outputs: [{ name: '', type: 'bool' }] },
  { name: 'setApprovalForAll', type: 'function', stateMutability: 'nonpayable',
    inputs: [{ name: 'operator', type: 'address' }, { name: 'approved', type: 'bool' }],
    outputs: [] },
  { name: 'supportsInterface', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'interfaceId', type: 'bytes4' }],
    outputs: [{ name: '', type: 'bool' }] },
];

export const ERC1155_ABI = [
  { name: 'balanceOf', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }, { name: 'id', type: 'uint256' }],
    outputs: [{ name: '', type: 'uint256' }] },
  { name: 'isApprovedForAll', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }, { name: 'operator', type: 'address' }],
    outputs: [{ name: '', type: 'bool' }] },
  { name: 'setApprovalForAll', type: 'function', stateMutability: 'nonpayable',
    inputs: [{ name: 'operator', type: 'address' }, { name: 'approved', type: 'bool' }],
    outputs: [] },
  { name: 'supportsInterface', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'interfaceId', type: 'bytes4' }],
    outputs: [{ name: '', type: 'bool' }] },
];

// ERC-165 interface IDs
export const IFACE_ERC721 = '0x80ac58cd';
export const IFACE_ERC1155 = '0xd9b67a26';

// Minimal NFT-type detection + approval helpers shared between list,
// buy (no approval), and accept-offer paths.

import { getPublicClient } from './_chain.mjs';
import {
  ERC721_ABI, ERC1155_ABI, IFACE_ERC721, IFACE_ERC1155,
} from './_abi.mjs';
import { MARKETPLACE_ADDRESS } from './_addresses.mjs';

// Returns 'ERC721' | 'ERC1155' | 'UNKNOWN'.
// Uses ERC-165 supportsInterface when available; otherwise probes ownerOf.
export async function detectProtocol(nftContract) {
  const pub = getPublicClient();
  const probes = [
    [IFACE_ERC721, 'ERC721'],
    [IFACE_ERC1155, 'ERC1155'],
  ];
  for (const [iface, name] of probes) {
    try {
      const ok = await pub.readContract({
        address: nftContract,
        abi: ERC721_ABI,
        functionName: 'supportsInterface',
        args: [iface],
      });
      if (ok) return name;
    } catch { /* contract may not implement ERC-165 */ }
  }
  // fallback: ERC721 has ownerOf
  try {
    await pub.readContract({
      address: nftContract,
      abi: ERC721_ABI,
      functionName: 'ownerOf',
      args: [0n],
    });
    return 'ERC721';
  } catch { /* nope */ }
  return 'UNKNOWN';
}

export async function isApprovedForMarketplace({ nftContract, owner, protocol }) {
  const pub = getPublicClient();
  const abi = protocol === 'ERC1155' ? ERC1155_ABI : ERC721_ABI;
  return pub.readContract({
    address: nftContract, abi,
    functionName: 'isApprovedForAll',
    args: [owner, MARKETPLACE_ADDRESS],
  });
}

export async function setApprovalForMarketplace({ nftContract, walletClient, publicClient, protocol }) {
  const abi = protocol === 'ERC1155' ? ERC1155_ABI : ERC721_ABI;
  const hash = await walletClient.writeContract({
    address: nftContract, abi,
    functionName: 'setApprovalForAll',
    args: [MARKETPLACE_ADDRESS, true],
  });
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

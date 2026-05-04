import { createPublicClient, http } from 'viem';
import { CROSS_CHAIN_ID } from './_addresses.mjs';

// Mainnet RPC for CROSS Chain. Override with CROSS_RPC_URL.
// (Public endpoint is rate-limited; private RPCs are recommended for heavy use.)
export const CROSS_RPC_URL =
  process.env.CROSS_RPC_URL || 'https://mainnet.crosstoken.io:22001/';

export const crossChain = {
  id: CROSS_CHAIN_ID,
  name: 'CROSS Chain',
  network: 'cross',
  nativeCurrency: { name: 'CROSS', symbol: 'CROSS', decimals: 18 },
  rpcUrls: {
    default: { http: [CROSS_RPC_URL] },
    public: { http: [CROSS_RPC_URL] },
  },
  blockExplorers: {
    default: { name: 'CROSS Explorer', url: 'https://explorer.crosstoken.io/612055' },
  },
};

let _publicClient = null;
export function getPublicClient() {
  if (_publicClient) return _publicClient;
  _publicClient = createPublicClient({
    chain: crossChain,
    transport: http(CROSS_RPC_URL),
  });
  return _publicClient;
}

export function explorerTxUrl(hash) {
  return `https://explorer.crosstoken.io/612055/tx/${hash}`;
}

export function explorerAddressUrl(addr) {
  return `https://explorer.crosstoken.io/612055/address/${addr}`;
}

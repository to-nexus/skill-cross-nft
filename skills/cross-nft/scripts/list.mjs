#!/usr/bin/env node
// List an NFT for sale via MarketplaceV1.createListing.
//
// Usage:
//   node list.mjs <nftContract> <tokenId> <price> [--quantity 1]
//                 [--end-price <p>] [--duration <sec>]
//                 [--payment 0x... | --payment MGT | --payment native]
//                 [--confirm] [--max-approve]
//
// Behaviour:
//   - For ERC721: quantity defaults to 1.
//   - If --end-price is set != price (and --duration > 0), creates a Dutch
//     auction. Otherwise fixed price (start == end).
//   - Auto-runs setApprovalForAll(marketplace, true) on the NFT contract
//     unless already approved.
//   - --duration default 0 (open-ended). Marketplace interprets 0 as "no
//     end time" per the live frontend; pass an explicit value if you want
//     a hard deadline.
//
// Output: { ok, mode:"list", listingId?, tx, approveTx?, ... }
import { parseUnits, formatUnits, decodeEventLog, getAddress } from 'viem';
import { getPublicClient, explorerTxUrl } from './_chain.mjs';
import { MARKETPLACE_ADDRESS, NATIVE_SENTINEL, DEFAULT_PAYMENT_TOKEN } from './_addresses.mjs';
import { MARKETPLACE_ABI, ERC20_ABI } from './_abi.mjs';
import { getWalletClient, getAccount, requirePrivateKey } from './_signer.mjs';
import { applyTradeRails, fail } from './_guard.mjs';
import { detectProtocol, isApprovedForMarketplace, setApprovalForMarketplace } from './_nft.mjs';
import { main, parseArgs } from './_io.mjs';

async function resolvePayment(flagVal, publicClient) {
  if (!flagVal || flagVal === 'MGT' || flagVal === 'mgt') return DEFAULT_PAYMENT_TOKEN;
  if (flagVal === 'native' || flagVal === 'CROSS') {
    return { address: NATIVE_SENTINEL, symbol: 'CROSS', decimals: 18 };
  }
  const addr = getAddress(flagVal).toLowerCase();
  if (addr === NATIVE_SENTINEL) return { address: NATIVE_SENTINEL, symbol: 'CROSS', decimals: 18 };
  const [decimals, symbol] = await Promise.all([
    publicClient.readContract({ address: addr, abi: ERC20_ABI, functionName: 'decimals' }),
    publicClient.readContract({ address: addr, abi: ERC20_ABI, functionName: 'symbol' }).catch(() => '?'),
  ]);
  return { address: addr, symbol, decimals: Number(decimals) };
}

await main(async () => {
  requirePrivateKey('list');
  const { positional, flags } = parseArgs(process.argv.slice(2));
  const [nftContractRaw, tokenIdRaw, priceRaw] = positional;
  if (!nftContractRaw || !tokenIdRaw || !priceRaw) {
    return fail('usage', 'list.mjs <nftContract> <tokenId> <price> [--quantity N] [--end-price P] [--duration sec] [--payment MGT|native|0x...] [--confirm]');
  }
  const nftContract = getAddress(nftContractRaw);
  const tokenId = BigInt(tokenIdRaw);
  const startHuman = Number(priceRaw);
  if (!Number.isFinite(startHuman) || startHuman <= 0) return fail('bad_arg', `price ${priceRaw} not a positive number`);
  const endHuman = flags['end-price'] !== undefined ? Number(flags['end-price']) : startHuman;
  const duration = BigInt(flags.duration || 0);
  const quantity = BigInt(flags.quantity || 1);

  const publicClient = getPublicClient();
  const payment = await resolvePayment(flags.payment, publicClient);
  const startWei = parseUnits(String(startHuman), payment.decimals);
  const endWei = parseUnits(String(endHuman), payment.decimals);

  const guard = await applyTradeRails({
    totalPayableHuman: startHuman, // for cap purposes, the listing price (per unit)
    paymentTokenAddress: payment.address,
    paymentDecimals: payment.decimals,
    confirmFlag: !!flags.confirm,
    action: 'list',
  });
  if (!guard.ok) return guard;

  const account = guard.account;
  const walletClient = getWalletClient();

  // detect protocol & verify ownership
  const protocol = await detectProtocol(nftContract);
  if (protocol === 'UNKNOWN') {
    return fail('unsupported_nft', `${nftContract} does not advertise ERC-721 or ERC-1155 via ERC-165`);
  }
  if (protocol === 'ERC721' && quantity !== 1n) {
    return fail('bad_arg', 'ERC-721 listings require --quantity 1');
  }

  // ensure marketplace is approved
  let approveTxHash = null;
  const approved = await isApprovedForMarketplace({ nftContract, owner: account.address, protocol });
  if (!approved) {
    approveTxHash = await setApprovalForMarketplace({
      nftContract, walletClient, publicClient, protocol,
    });
  }

  // simulate first to surface revert reasons cleanly
  const sim = await publicClient.simulateContract({
    address: MARKETPLACE_ADDRESS,
    abi: MARKETPLACE_ABI,
    functionName: 'createListing',
    args: [nftContract, tokenId, quantity, startWei, endWei, payment.address, duration],
    account,
  }).catch((e) => ({ _err: e }));

  if (sim._err) {
    return fail('simulate_failed', sim._err.shortMessage || sim._err.message);
  }

  const txHash = await walletClient.writeContract(sim.request);
  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

  // pull listingId from ListingCreated event topic
  let listingId = null;
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== MARKETPLACE_ADDRESS) continue;
    try {
      const ev = decodeEventLog({ abi: MARKETPLACE_ABI, data: log.data, topics: log.topics });
      if (ev.eventName === 'ListingCreated') {
        listingId = String(ev.args.listingId);
        break;
      }
    } catch { /* not a marketplace event */ }
  }
  // fallback: simulate result
  if (!listingId && sim.result !== undefined) listingId = String(sim.result);

  return {
    ok: true,
    mode: 'list',
    parsedIntent: {
      nftContract: nftContract.toLowerCase(),
      tokenId: String(tokenId),
      quantity: String(quantity),
      startPriceHuman: startHuman,
      endPriceHuman: endHuman,
      isDutchAuction: startHuman !== endHuman,
      durationSec: Number(duration),
      payment,
    },
    approveTxHash,
    txHash,
    listingId,
    explorerUrl: explorerTxUrl(txHash),
    pageUrl: `https://www.crossnft.io/collections/${nftContract.toLowerCase()}/tokens/${tokenId}`,
    signerWarn: guard.warnings?.[0] || null,
  };
});

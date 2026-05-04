#!/usr/bin/env node
// Place a buy-side offer (bid) via MarketplaceV1.createOffer.
//
// Usage:
//   node offer.mjs <nftContract> <tokenId> <pricePerUnit> [--quantity 1]
//                  [--duration <sec>]
//                  [--payment MGT|native|0x...]
//                  [--confirm] [--max-approve]
//
// For native payment the contract takes msg.value; for ERC-20 we approve
// (offerPrice * quantity) first.
import { parseUnits, formatUnits, decodeEventLog, getAddress } from 'viem';
import { getPublicClient, explorerTxUrl } from './_chain.mjs';
import { MARKETPLACE_ADDRESS, NATIVE_SENTINEL, DEFAULT_PAYMENT_TOKEN } from './_addresses.mjs';
import { MARKETPLACE_ABI, ERC20_ABI } from './_abi.mjs';
import { getWalletClient, requirePrivateKey } from './_signer.mjs';
import { applyTradeRails, ensureErc20Allowance, fail } from './_guard.mjs';
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
  requirePrivateKey('offer');
  const { positional, flags } = parseArgs(process.argv.slice(2));
  const [nftContractRaw, tokenIdRaw, priceRaw] = positional;
  if (!nftContractRaw || !tokenIdRaw || !priceRaw) {
    return fail('usage', 'offer.mjs <nftContract> <tokenId> <pricePerUnit> [--quantity N] [--duration sec] [--payment MGT|native|0x...] [--confirm]');
  }
  const nftContract = getAddress(nftContractRaw);
  const tokenId = BigInt(tokenIdRaw);
  const pricePerUnit = Number(priceRaw);
  const quantity = BigInt(flags.quantity || 1);
  const duration = BigInt(flags.duration || (60 * 60 * 24 * 7)); // default 7d

  const publicClient = getPublicClient();
  const payment = await resolvePayment(flags.payment, publicClient);
  const offerPriceWei = parseUnits(String(pricePerUnit), payment.decimals);
  const totalWei = offerPriceWei * quantity;
  const totalHuman = pricePerUnit * Number(quantity);

  const guard = await applyTradeRails({
    totalPayableHuman: totalHuman,
    paymentTokenAddress: payment.address,
    paymentDecimals: payment.decimals,
    confirmFlag: !!flags.confirm,
    action: 'offer',
  });
  if (!guard.ok) return guard;

  const walletClient = getWalletClient();
  const account = guard.account;

  let approveTxHash = null;
  if (payment.address !== NATIVE_SENTINEL) {
    const ar = await ensureErc20Allowance({
      token: payment.address,
      owner: account.address,
      spender: MARKETPLACE_ADDRESS,
      amountWei: totalWei,
      walletClient, publicClient,
      maxApprove: !!flags['max-approve'],
    });
    approveTxHash = ar.approveTxHash;
  }

  const isNative = payment.address === NATIVE_SENTINEL;
  const sim = await publicClient.simulateContract({
    address: MARKETPLACE_ADDRESS, abi: MARKETPLACE_ABI,
    functionName: 'createOffer',
    args: [nftContract, tokenId, quantity, offerPriceWei, payment.address, duration],
    value: isNative ? totalWei : 0n,
    account,
  }).catch((e) => ({ _err: e }));
  if (sim._err) return fail('simulate_failed', sim._err.shortMessage || sim._err.message);

  const txHash = await walletClient.writeContract(sim.request);
  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

  let offerId = null;
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== MARKETPLACE_ADDRESS) continue;
    try {
      const ev = decodeEventLog({ abi: MARKETPLACE_ABI, data: log.data, topics: log.topics });
      if (ev.eventName === 'OfferCreated') {
        offerId = String(ev.args.offerId);
        break;
      }
    } catch { /* skip */ }
  }
  if (!offerId && sim.result !== undefined) offerId = String(sim.result);

  return {
    ok: true,
    mode: 'offer',
    parsedIntent: {
      nftContract: nftContract.toLowerCase(),
      tokenId: String(tokenId),
      quantity: String(quantity),
      pricePerUnitHuman: pricePerUnit,
      totalPayableHuman: totalHuman,
      durationSec: Number(duration),
      payment,
    },
    approveTxHash,
    offerId,
    txHash,
    explorerUrl: explorerTxUrl(txHash),
    pageUrl: `https://www.crossnft.io/collections/${nftContract.toLowerCase()}/tokens/${tokenId}`,
    signerWarn: guard.warnings?.[0] || null,
  };
});

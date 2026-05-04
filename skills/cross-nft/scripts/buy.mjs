#!/usr/bin/env node
// Buy a listed NFT via MarketplaceV1.buy.
//
// Usage: node buy.mjs <listingId> [--quantity N] [--confirm] [--max-approve]
//
// Behaviour:
//   - Fetches listing on-chain, computes currentPrice (handles Dutch auctions).
//   - If paymentToken is native (sentinel 0x0...0), attaches msg.value.
//   - If paymentToken is ERC-20, ensures allowance covers (currentPrice * qty).
//     `--max-approve` switches to unlimited allowance.
//   - Aborts cleanly if listing inactive, wrong chain, etc.
import { formatUnits, parseUnits } from 'viem';
import { getPublicClient, explorerTxUrl } from './_chain.mjs';
import { MARKETPLACE_ADDRESS, NATIVE_SENTINEL } from './_addresses.mjs';
import { MARKETPLACE_ABI, ERC20_ABI } from './_abi.mjs';
import { getWalletClient, getAccount, requirePrivateKey } from './_signer.mjs';
import { applyTradeRails, ensureErc20Allowance, fail } from './_guard.mjs';
import { main, parseArgs } from './_io.mjs';

await main(async () => {
  requirePrivateKey('buy');
  const { positional, flags } = parseArgs(process.argv.slice(2));
  const listingId = positional[0];
  if (!listingId) return fail('usage', 'buy.mjs <listingId> [--quantity N] [--confirm]');
  const id = BigInt(listingId);
  const qty = BigInt(flags.quantity || 1);

  const publicClient = getPublicClient();
  const [details, currentPrice] = await Promise.all([
    publicClient.readContract({
      address: MARKETPLACE_ADDRESS, abi: MARKETPLACE_ABI,
      functionName: 'getListingDetails', args: [id],
    }),
    publicClient.readContract({
      address: MARKETPLACE_ADDRESS, abi: MARKETPLACE_ABI,
      functionName: 'getCurrentPrice', args: [id],
    }),
  ]);
  const d = Array.isArray(details)
    ? {
        seller: details[0], nftContract: details[1], tokenId: details[2],
        quantity: details[3], startPrice: details[4], endPrice: details[5],
        paymentToken: details[6], startTime: details[7], endTime: details[8],
        isActive: details[9], isDutchAuction: details[10],
      }
    : details;
  if (!d.isActive) return fail('listing_inactive', `listing ${listingId} is not active`);
  if (d.quantity < qty) return fail('insufficient_quantity', `listing has ${d.quantity}, you asked for ${qty}`);

  // resolve payment-token decimals
  let paymentDecimals = 18, paymentSymbol = 'CROSS';
  if (d.paymentToken.toLowerCase() !== NATIVE_SENTINEL) {
    const [dec, sym] = await Promise.all([
      publicClient.readContract({ address: d.paymentToken, abi: ERC20_ABI, functionName: 'decimals' }),
      publicClient.readContract({ address: d.paymentToken, abi: ERC20_ABI, functionName: 'symbol' }).catch(() => '?'),
    ]);
    paymentDecimals = Number(dec);
    paymentSymbol = sym;
  }
  const totalWei = currentPrice * qty;
  const totalHuman = Number(formatUnits(totalWei, paymentDecimals));

  const guard = await applyTradeRails({
    totalPayableHuman: totalHuman,
    paymentTokenAddress: d.paymentToken,
    paymentDecimals,
    confirmFlag: !!flags.confirm,
    action: 'buy',
  });
  if (!guard.ok) return guard;

  const walletClient = getWalletClient();
  const account = guard.account;

  // ERC-20 approval if needed
  let approveTxHash = null;
  if (d.paymentToken.toLowerCase() !== NATIVE_SENTINEL) {
    const ar = await ensureErc20Allowance({
      token: d.paymentToken,
      owner: account.address,
      spender: MARKETPLACE_ADDRESS,
      amountWei: totalWei,
      walletClient, publicClient,
      maxApprove: !!flags['max-approve'],
    });
    approveTxHash = ar.approveTxHash;
  }

  const isNative = d.paymentToken.toLowerCase() === NATIVE_SENTINEL;
  const sim = await publicClient.simulateContract({
    address: MARKETPLACE_ADDRESS, abi: MARKETPLACE_ABI,
    functionName: 'buy', args: [id, qty],
    value: isNative ? totalWei : 0n,
    account,
  }).catch((e) => ({ _err: e }));
  if (sim._err) return fail('simulate_failed', sim._err.shortMessage || sim._err.message);

  const hash = await walletClient.writeContract(sim.request);
  await publicClient.waitForTransactionReceipt({ hash });

  return {
    ok: true,
    mode: 'buy',
    parsedIntent: {
      listingId,
      quantity: String(qty),
      currentPriceWei: String(currentPrice),
      currentPriceHuman: Number(formatUnits(currentPrice, paymentDecimals)),
      totalPayableWei: String(totalWei),
      totalPayableHuman: totalHuman,
      paymentSymbol,
      paymentDecimals,
      paymentToken: d.paymentToken,
      isDutchAuction: d.isDutchAuction,
      seller: d.seller,
      nftContract: d.nftContract,
      tokenId: String(d.tokenId),
    },
    approveTxHash,
    txHash: hash,
    explorerUrl: explorerTxUrl(hash),
    pageUrl: `https://www.crossnft.io/collections/${d.nftContract.toLowerCase()}/tokens/${d.tokenId}`,
    signerWarn: guard.warnings?.[0] || null,
  };
});

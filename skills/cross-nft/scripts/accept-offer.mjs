#!/usr/bin/env node
// Accept a buy-side offer via MarketplaceV1.acceptOffer.
//
// Usage: node accept-offer.mjs <offerId> [--confirm] [--max-approve]
//
// Caller MUST own the NFT. We auto-run setApprovalForAll(marketplace, true)
// on the NFT contract if not already approved, so the marketplace can
// transfer the token to the offeror. The settlement is the offerPrice
// the offeror has already escrowed/approved when calling createOffer.
import { formatUnits } from 'viem';
import { getPublicClient, explorerTxUrl } from './_chain.mjs';
import { MARKETPLACE_ADDRESS, NATIVE_SENTINEL } from './_addresses.mjs';
import { MARKETPLACE_ABI, ERC20_ABI } from './_abi.mjs';
import { getWalletClient, requirePrivateKey } from './_signer.mjs';
import { applyTradeRails, fail } from './_guard.mjs';
import { detectProtocol, isApprovedForMarketplace, setApprovalForMarketplace } from './_nft.mjs';
import { main, parseArgs } from './_io.mjs';

await main(async () => {
  requirePrivateKey('accept-offer');
  const { positional, flags } = parseArgs(process.argv.slice(2));
  const offerId = positional[0];
  if (!offerId) return fail('usage', 'accept-offer.mjs <offerId>');
  const id = BigInt(offerId);

  const publicClient = getPublicClient();
  const details = await publicClient.readContract({
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
  if (!d.isActive) return fail('offer_inactive', `offer ${offerId} is not active`);

  // resolve payment decimals for nicer reporting
  let paymentDecimals = 18, paymentSymbol = 'CROSS';
  if (d.paymentToken.toLowerCase() !== NATIVE_SENTINEL) {
    const [dec, sym] = await Promise.all([
      publicClient.readContract({ address: d.paymentToken, abi: ERC20_ABI, functionName: 'decimals' }),
      publicClient.readContract({ address: d.paymentToken, abi: ERC20_ABI, functionName: 'symbol' }).catch(() => '?'),
    ]);
    paymentDecimals = Number(dec);
    paymentSymbol = sym;
  }
  const totalWei = d.offerPrice * d.quantity;
  const totalHuman = Number(formatUnits(totalWei, paymentDecimals));

  // accepting is "I receive" — but we still apply rails for chain/gas/signer + cap (treated as notional)
  const guard = await applyTradeRails({
    totalPayableHuman: totalHuman,
    paymentTokenAddress: d.paymentToken,
    paymentDecimals,
    confirmFlag: !!flags.confirm,
    action: 'accept-offer',
  });
  if (!guard.ok) return guard;

  const walletClient = getWalletClient();
  const account = guard.account;

  // approve marketplace to move the NFT
  const protocol = await detectProtocol(d.nftContract);
  let approveTxHash = null;
  const approved = await isApprovedForMarketplace({
    nftContract: d.nftContract, owner: account.address, protocol,
  });
  if (!approved) {
    approveTxHash = await setApprovalForMarketplace({
      nftContract: d.nftContract, walletClient, publicClient, protocol,
    });
  }

  const sim = await publicClient.simulateContract({
    address: MARKETPLACE_ADDRESS, abi: MARKETPLACE_ABI,
    functionName: 'acceptOffer', args: [id], account,
  }).catch((e) => ({ _err: e }));
  if (sim._err) return fail('simulate_failed', sim._err.shortMessage || sim._err.message);

  const hash = await walletClient.writeContract(sim.request);
  await publicClient.waitForTransactionReceipt({ hash });

  return {
    ok: true,
    mode: 'accept-offer',
    parsedIntent: {
      offerId,
      offeror: d.offeror,
      nftContract: d.nftContract,
      tokenId: String(d.tokenId),
      quantity: String(d.quantity),
      offerPriceWei: String(d.offerPrice),
      offerPriceHuman: Number(formatUnits(d.offerPrice, paymentDecimals)),
      totalReceivableWei: String(totalWei),
      totalReceivableHuman: totalHuman,
      paymentSymbol,
      paymentToken: d.paymentToken,
    },
    approveTxHash,
    txHash: hash,
    explorerUrl: explorerTxUrl(hash),
    pageUrl: `https://www.crossnft.io/collections/${d.nftContract.toLowerCase()}/tokens/${d.tokenId}`,
    signerWarn: guard.warnings?.[0] || null,
  };
});

#!/usr/bin/env node
// Cancel a buy-side offer via MarketplaceV1.cancelOffer.
// Usage: node cancel-offer.mjs <offerId>
import { getPublicClient, explorerTxUrl } from './_chain.mjs';
import { MARKETPLACE_ADDRESS } from './_addresses.mjs';
import { MARKETPLACE_ABI } from './_abi.mjs';
import { getWalletClient, requirePrivateKey } from './_signer.mjs';
import { applyTradeRails, fail } from './_guard.mjs';
import { main, parseArgs } from './_io.mjs';
import { getAddress } from 'viem';

await main(async () => {
  requirePrivateKey('cancel-offer');
  const { positional } = parseArgs(process.argv.slice(2));
  const offerId = positional[0];
  if (!offerId) return fail('usage', 'cancel-offer.mjs <offerId>');
  const id = BigInt(offerId);

  const publicClient = getPublicClient();
  const details = await publicClient.readContract({
    address: MARKETPLACE_ADDRESS, abi: MARKETPLACE_ABI,
    functionName: 'getOfferDetails', args: [id],
  });
  const offeror = (Array.isArray(details) ? details[0] : details.offeror).toLowerCase();
  const isActive = Array.isArray(details) ? details[7] : details.isActive;
  if (!isActive) return fail('offer_inactive', `offer ${offerId} is not active`);

  const guard = await applyTradeRails({
    totalPayableHuman: 0, paymentTokenAddress: null, paymentDecimals: 18,
    confirmFlag: true, action: 'cancel-offer',
  });
  if (!guard.ok) return guard;

  if (getAddress(offeror) !== getAddress(guard.account.address)) {
    return fail('not_offeror', `only offeror ${offeror} can cancel; signer is ${guard.account.address}`);
  }

  const walletClient = getWalletClient();
  const sim = await publicClient.simulateContract({
    address: MARKETPLACE_ADDRESS, abi: MARKETPLACE_ABI,
    functionName: 'cancelOffer', args: [id], account: guard.account,
  }).catch((e) => ({ _err: e }));
  if (sim._err) return fail('simulate_failed', sim._err.shortMessage || sim._err.message);

  const hash = await walletClient.writeContract(sim.request);
  await publicClient.waitForTransactionReceipt({ hash });

  return {
    ok: true,
    mode: 'cancel-offer',
    offerId,
    txHash: hash,
    explorerUrl: explorerTxUrl(hash),
    signerWarn: guard.warnings?.[0] || null,
  };
});

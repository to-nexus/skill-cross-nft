#!/usr/bin/env node
// Cancel an active listing via MarketplaceV1.cancelListing.
// Usage: node cancel-listing.mjs <listingId> [--confirm]
//
// Caller MUST be the seller. We pre-flight via getListingDetails so the
// scripted user gets a clean error, not a generic revert.
import { getPublicClient, explorerTxUrl } from './_chain.mjs';
import { MARKETPLACE_ADDRESS } from './_addresses.mjs';
import { MARKETPLACE_ABI } from './_abi.mjs';
import { getWalletClient, getAccount, requirePrivateKey } from './_signer.mjs';
import { applyTradeRails, fail } from './_guard.mjs';
import { main, parseArgs } from './_io.mjs';
import { getAddress } from 'viem';

await main(async () => {
  requirePrivateKey('cancel-listing');
  const { positional, flags } = parseArgs(process.argv.slice(2));
  const listingId = positional[0];
  if (!listingId) return fail('usage', 'cancel-listing.mjs <listingId>');
  const id = BigInt(listingId);

  const publicClient = getPublicClient();
  const details = await publicClient.readContract({
    address: MARKETPLACE_ADDRESS, abi: MARKETPLACE_ABI,
    functionName: 'getListingDetails', args: [id],
  });
  const seller = (Array.isArray(details) ? details[0] : details.seller).toLowerCase();
  const isActive = Array.isArray(details) ? details[9] : details.isActive;
  if (!isActive) return fail('listing_inactive', `listing ${listingId} is not active`);

  // cancel-listing has no notional, but still run rails for chain/gas/signer checks
  const guard = await applyTradeRails({
    totalPayableHuman: 0,
    paymentTokenAddress: null,
    paymentDecimals: 18,
    confirmFlag: true, // cancel doesn't need user confirmation
    action: 'cancel-listing',
  });
  if (!guard.ok) return guard;

  if (getAddress(seller) !== getAddress(guard.account.address)) {
    return fail('not_seller', `only seller ${seller} can cancel; signer is ${guard.account.address}`);
  }

  const walletClient = getWalletClient();
  const sim = await publicClient.simulateContract({
    address: MARKETPLACE_ADDRESS, abi: MARKETPLACE_ABI,
    functionName: 'cancelListing', args: [id], account: guard.account,
  }).catch((e) => ({ _err: e }));
  if (sim._err) return fail('simulate_failed', sim._err.shortMessage || sim._err.message);

  const hash = await walletClient.writeContract(sim.request);
  await publicClient.waitForTransactionReceipt({ hash });

  return {
    ok: true,
    mode: 'cancel-listing',
    listingId,
    txHash: hash,
    explorerUrl: explorerTxUrl(hash),
    signerWarn: guard.warnings?.[0] || null,
  };
});

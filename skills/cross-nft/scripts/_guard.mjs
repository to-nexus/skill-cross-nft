// Shared safety rails for every write op. Mirrors cross-crossd's _guard.mjs
// in spirit — the model parses an envelope `{ok, error?, ...}` and
// must surface `awaiting_confirm` / `unsupported_pair` style errors verbatim.

import { parseUnits, formatEther } from 'viem';
import { getPublicClient } from './_chain.mjs';
import { CROSS_CHAIN_ID, MARKETPLACE_ADDRESS, NATIVE_SENTINEL } from './_addresses.mjs';
import { MARKETPLACE_ABI, ERC20_ABI } from './_abi.mjs';
import { getAccount, signerWarning } from './_signer.mjs';

const num = (s, d) => (s === undefined || s === '' ? d : Number(s));

function envFloat(name, fallback) {
  const v = process.env[name];
  if (v === undefined || v === '') return fallback;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`env ${name} is not a number: ${v}`);
  return n;
}

// total = price (in payment-token units, NOT wei). Caller passes a human
// number. We don't double-count fees here — the user's posted price is
// what matters for the cap.
export async function applyTradeRails({ totalPayableHuman, paymentTokenAddress, paymentDecimals, confirmFlag, action }) {
  const warnings = [];

  // 1. chain id
  const pub = getPublicClient();
  const chainId = await pub.getChainId();
  if (Number(chainId) !== CROSS_CHAIN_ID) {
    return { ok: false, error: 'wrong_chain', detail: `RPC chainId=${chainId}, expected ${CROSS_CHAIN_ID}` };
  }

  // 2. wallet present
  const account = getAccount();
  if (!account) {
    return { ok: false, error: 'no_signer', detail: 'PRIVATE_KEY not set' };
  }

  // 3. notional cap
  const cap = envFloat('MAX_TRADE_NOTIONAL', null);
  if (cap !== null && totalPayableHuman > cap) {
    return {
      ok: false,
      error: 'cap_exceeded',
      detail: `${action} notional ${totalPayableHuman} exceeds MAX_TRADE_NOTIONAL=${cap}`,
    };
  }

  // 4. confirm threshold
  const threshold = envFloat('CONFIRM_THRESHOLD', 1);
  if (totalPayableHuman > threshold && !confirmFlag) {
    return {
      ok: false,
      error: 'awaiting_confirm',
      detail: `${action} notional ${totalPayableHuman} > CONFIRM_THRESHOLD=${threshold}; re-run with --confirm`,
      totalPayableHuman,
      threshold,
    };
  }

  // 5. native gas floor
  const minGas = envFloat('MIN_GAS_NATIVE', 0.001);
  if (minGas > 0) {
    const bal = await pub.getBalance({ address: account.address });
    const balHuman = Number(formatEther(bal));
    if (balHuman < minGas) {
      return {
        ok: false,
        error: 'insufficient_gas',
        detail: `wallet native CROSS=${balHuman} < MIN_GAS_NATIVE=${minGas}`,
        walletAddress: account.address,
      };
    }
  }

  // 6. signer warn
  const sw = signerWarning();
  if (sw) warnings.push(sw);

  // 7. payment-token whitelist (skip for native)
  if (paymentTokenAddress && paymentTokenAddress.toLowerCase() !== NATIVE_SENTINEL) {
    const ok = await pub.readContract({
      address: MARKETPLACE_ADDRESS,
      abi: MARKETPLACE_ABI,
      functionName: 'whitelistedPaymentTokens',
      args: [paymentTokenAddress],
    });
    if (!ok) {
      return {
        ok: false,
        error: 'unsupported_payment_token',
        detail: `paymentToken ${paymentTokenAddress} is not whitelisted on MarketplaceV1`,
      };
    }
  }

  return { ok: true, warnings, account };
}

// Ensure the user's ERC-20 allowance covers `amountWei` (or approve more).
// Returns { approveTxHash | null }.
export async function ensureErc20Allowance({ token, owner, spender, amountWei, walletClient, publicClient, maxApprove }) {
  if (token.toLowerCase() === NATIVE_SENTINEL) return { approveTxHash: null };
  const allowance = await publicClient.readContract({
    address: token, abi: ERC20_ABI, functionName: 'allowance', args: [owner, spender],
  });
  if (allowance >= amountWei) return { approveTxHash: null };
  const target = maxApprove ? (2n ** 256n - 1n) : amountWei;
  const hash = await walletClient.writeContract({
    address: token, abi: ERC20_ABI, functionName: 'approve', args: [spender, target],
  });
  await publicClient.waitForTransactionReceipt({ hash });
  return { approveTxHash: hash };
}

export function envelope(extra) {
  return { ok: true, ...extra };
}

export function fail(error, detail, extra = {}) {
  return { ok: false, error, detail, ...extra };
}

export { num };

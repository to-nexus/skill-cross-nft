import dotenv from 'dotenv';
import { createWalletClient, http, getAddress } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { crossChain, CROSS_RPC_URL } from './_chain.mjs';

// Resolution priority per SKILL.md:
//   1. process.env (set by the spawned Bash invocation)   — highest
//   2. ./.env in the user's CWD (per-project)
//   3. skill's own .env (personal default)                 — lowest
// Both dotenv calls use `override: false`, so an env var already populated
// (by Bash or by an earlier load) keeps its value.
const here = dirname(fileURLToPath(import.meta.url));
const skillEnv = resolve(here, '..', '.env');
dotenv.config({ override: false });                              // CWD
if (existsSync(skillEnv)) dotenv.config({ path: skillEnv, override: false });

const PK_RE = /^0x[0-9a-fA-F]{64}$/;

export function getPrivateKey() {
  const pk = process.env.PRIVATE_KEY;
  if (!pk) return null;
  if (!PK_RE.test(pk)) {
    throw new Error('PRIVATE_KEY must be 0x + 64 hex chars');
  }
  return pk;
}

export function requirePrivateKey(action) {
  const pk = getPrivateKey();
  if (!pk) {
    throw new Error(
      `PRIVATE_KEY required for "${action}". Set it in ~/.claude/skills/cross-nft/.env or pass via env on the command line.`,
    );
  }
  return pk;
}

export function getAccount() {
  const pk = getPrivateKey();
  if (!pk) return null;
  return privateKeyToAccount(pk);
}

export function getWalletClient() {
  const account = getAccount();
  if (!account) return null;
  return createWalletClient({
    account,
    chain: crossChain,
    transport: http(CROSS_RPC_URL),
  });
}

// Returns null if WALLET_ADDRESS is unset or matches; otherwise a warn string.
export function signerWarning() {
  const declared = process.env.WALLET_ADDRESS;
  const acc = getAccount();
  if (!declared || !acc) return null;
  let d, a;
  try {
    d = getAddress(declared);
    a = getAddress(acc.address);
  } catch {
    return `WALLET_ADDRESS env value "${declared}" is not a valid address`;
  }
  if (d !== a) {
    return `WALLET_ADDRESS env (${d}) does not match PK-derived address (${a})`;
  }
  return null;
}

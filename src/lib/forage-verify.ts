import 'server-only';

import {
  getAddress,
  parseAbiItem,
  parseEventLogs,
  type Address,
  type Hex,
  type Log,
} from 'viem';
import {
  MAX_TOKENS_PER_SWEEP,
  PLATFORM_FEE_WALLET,
  WLD_ADDRESS,
} from './constants';
import { publicClient } from './tokens';

const transferEvent = parseAbiItem(
  'event Transfer(address indexed from, address indexed to, uint256 value)',
);

const TX_HASH_RE = /^0x[0-9a-fA-F]{64}$/;

/** World Chain has ~2s blocks; poll the receipt briefly before giving up. */
const RECEIPT_POLL_ATTEMPTS = 10;
const RECEIPT_POLL_INTERVAL_MS = 2_000;

const USEROP_RESOLVE_ATTEMPTS = 5;
const USEROP_RESOLVE_INTERVAL_MS = 2_000;

export type WldTransfer = {
  from: Address;
  to: Address;
  value: bigint;
};

export type VerifiedForage = {
  txHash: Hex;
  /** WLD received by the user from the swaps (transfers TO the user, excluding self-transfers). */
  wldReceivedWei: bigint;
  /** WLD paid to the platform fee wallet FROM the user's wallet. */
  feePaidWei: bigint;
  /** Number of inbound WLD transfers = number of swaps that paid out. */
  tokensSwapped: number;
};

export type ForageVerification =
  | { ok: true; verified: VerifiedForage }
  | { ok: false; reason: string; retryable: boolean };

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Pure summary of the WLD Transfer logs of a forage transaction.
 *
 * - The platform fee is the WLD transferred FROM the user's wallet TO the fee
 *   wallet. When feeWallet == userWallet (self-forage by the platform owner)
 *   this is a self-transfer (from == to) — it counts as fee, never as swap
 *   proceeds, so nothing is double counted.
 * - The user's reclaimed WLD is the sum of transfers TO the user's wallet
 *   from third parties (the Uniswap pools). Self-transfers are excluded.
 * - Restricting the fee to `from == userWallet` also keeps attribution correct
 *   if a 4337 bundle ever contains other users' operations in the same tx.
 */
export function summarizeWldTransfers(
  transfers: WldTransfer[],
  userWallet: Address,
  feeWallet: Address,
): Omit<VerifiedForage, 'txHash'> {
  const user = userWallet.toLowerCase();
  const fee = feeWallet.toLowerCase();

  let wldReceivedWei = BigInt(0);
  let feePaidWei = BigInt(0);
  let swapPayouts = 0;

  for (const transfer of transfers) {
    const from = transfer.from.toLowerCase();
    const to = transfer.to.toLowerCase();

    if (to === fee && from === user) {
      feePaidWei += transfer.value;
      continue;
    }

    if (to === user && from !== user) {
      wldReceivedWei += transfer.value;
      swapPayouts += 1;
    }
  }

  return {
    wldReceivedWei,
    feePaidWei,
    tokensSwapped: Math.min(Math.max(swapPayouts, 1), MAX_TOKENS_PER_SWEEP),
  };
}

export function extractWldTransfers(logs: readonly Log[]): WldTransfer[] {
  const wldLogs = logs.filter(
    (log) => log.address.toLowerCase() === WLD_ADDRESS.toLowerCase(),
  );

  return parseEventLogs({
    abi: [transferEvent],
    eventName: 'Transfer',
    logs: wldLogs,
  }).map((log) => ({
    from: log.args.from,
    to: log.args.to,
    value: log.args.value,
  }));
}

/** Resolve a MiniKit userOpHash to the on-chain tx hash via the Worldcoin API. */
async function resolveTxHashFromUserOp(
  userOpHash: string,
): Promise<Hex | null> {
  for (let attempt = 0; attempt < USEROP_RESOLVE_ATTEMPTS; attempt++) {
    if (attempt > 0) {
      await sleep(USEROP_RESOLVE_INTERVAL_MS);
    }

    try {
      const response = await fetch(
        `https://developer.worldcoin.org/api/v2/minikit/userop/${encodeURIComponent(userOpHash)}`,
        { next: { revalidate: 0 }, signal: AbortSignal.timeout(6_000) },
      );

      if (!response.ok) {
        continue;
      }

      const payload = (await response.json()) as {
        status?: string;
        transaction_hash?: string | null;
      };

      if (
        typeof payload.transaction_hash === 'string' &&
        TX_HASH_RE.test(payload.transaction_hash)
      ) {
        return payload.transaction_hash as Hex;
      }

      const status = (payload.status ?? '').toLowerCase();
      if (status === 'failed' || status === 'reverted' || status === 'error') {
        return null;
      }
    } catch {
      // Transient — retry.
    }
  }

  return null;
}

async function fetchReceiptWithRetry(txHash: Hex) {
  for (let attempt = 0; attempt < RECEIPT_POLL_ATTEMPTS; attempt++) {
    if (attempt > 0) {
      await sleep(RECEIPT_POLL_INTERVAL_MS);
    }

    try {
      return await publicClient.getTransactionReceipt({ hash: txHash });
    } catch {
      // Receipt not indexed yet — keep polling.
    }
  }

  return null;
}

/**
 * Derive the real forage numbers from the chain instead of trusting the
 * client: resolve the tx hash, fetch the receipt from the server RPC, and
 * parse the WLD Transfer logs. Client-supplied amounts are never recorded.
 */
export async function verifyForageOnChain({
  userWallet,
  txHash,
  userOpHash,
}: {
  userWallet: string;
  txHash?: string | null;
  userOpHash?: string | null;
}): Promise<ForageVerification> {
  if (!PLATFORM_FEE_WALLET) {
    return {
      ok: false,
      reason: 'Platform fee wallet is not configured',
      retryable: false,
    };
  }

  const user = getAddress(userWallet);
  const feeWallet = getAddress(PLATFORM_FEE_WALLET);

  let resolvedTxHash: Hex | null = null;

  if (txHash && TX_HASH_RE.test(txHash)) {
    resolvedTxHash = txHash as Hex;
  } else if (userOpHash) {
    resolvedTxHash = await resolveTxHashFromUserOp(userOpHash);
  }

  if (!resolvedTxHash) {
    return {
      ok: false,
      reason: 'Could not resolve an on-chain transaction hash for this forage',
      retryable: true,
    };
  }

  const receipt = await fetchReceiptWithRetry(resolvedTxHash);

  if (!receipt) {
    return {
      ok: false,
      reason: 'Transaction receipt not found on World Chain',
      retryable: true,
    };
  }

  if (receipt.status !== 'success') {
    return {
      ok: false,
      reason: 'Transaction reverted on-chain',
      retryable: false,
    };
  }

  const transfers = extractWldTransfers(receipt.logs);
  const summary = summarizeWldTransfers(transfers, user, feeWallet);

  if (summary.feePaidWei <= BigInt(0)) {
    return {
      ok: false,
      reason: 'Transaction contains no WLD platform fee transfer',
      retryable: false,
    };
  }

  if (summary.wldReceivedWei <= BigInt(0)) {
    return {
      ok: false,
      reason: 'Transaction contains no WLD swap proceeds for this wallet',
      retryable: false,
    };
  }

  return {
    ok: true,
    verified: {
      txHash: resolvedTxHash.toLowerCase() as Hex,
      ...summary,
    },
  };
}

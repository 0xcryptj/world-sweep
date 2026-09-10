import { getAddress, type Address, type Hex } from 'viem';
import { withTimeout } from './fetch-with-timeout';
import { publicClient } from './tokens';
import type { SweepTransaction } from './types';

type SimulatedCall = {
  status?: string;
  error?: { message?: string; data?: string };
};

type SimulateV1Block = {
  calls?: SimulatedCall[];
};

/**
 * Sequentially simulate MiniKit-style calldata with state carryover
 * (approve then swap then fee transfer), matching World App's UserOp batch.
 * Returns a short reason when any call reverts, else null.
 */
export async function simulateSweepBatch(
  account: Address,
  transactions: SweepTransaction[],
): Promise<string | null> {
  if (transactions.length === 0) {
    return null;
  }

  const from = getAddress(account);
  const calls = transactions.map((tx) => ({
    from,
    to: getAddress(tx.to),
    data: tx.data as Hex,
    value: (tx.value ?? '0x0') as Hex,
  }));

  try {
    const simulated = (await withTimeout(
      publicClient.request({
        method: 'eth_simulateV1' as 'eth_call',
        params: [
          {
            blockStateCalls: [{ calls }],
            traceTransfers: false,
            validation: false,
          },
          'latest',
        ] as never,
      }),
      8_000,
      'Batch simulation timed out',
    )) as SimulateV1Block[];

    const block = Array.isArray(simulated) ? simulated[0] : undefined;

    const results = block?.calls ?? [];
    if (results.length !== calls.length) {
      // Unknown simulator shape — do not block the forage on a parse miss.
      return null;
    }

    for (let index = 0; index < results.length; index++) {
      const result = results[index];
      const status = result?.status?.toLowerCase();
      // Only drop a token on an explicit revert. Missing/unknown status must
      // not empty the forage plan — World App still simulates the UserOp.
      if (!status || status === '0x1' || status === '1') {
        continue;
      }
      const message =
        result?.error?.message ||
        result?.error?.data ||
        `Call ${index} reverted`;
      return message.slice(0, 160);
    }

    return null;
  } catch (error) {
    // Simulator flakes must never empty a quotable batch.
    console.warn(
      '[simulate-batch] skipped extra gate',
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}

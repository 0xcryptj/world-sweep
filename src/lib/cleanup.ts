import 'server-only';

import {
  decodeFunctionResult,
  encodeFunctionData,
  getAddress,
  isAddress,
  type Address,
} from 'viem';
import { erc20Abi } from './abis';
import { isPermit2Allowlisted } from './allowlist';
import { mapPool } from './async-pool';
import {
  MAX_TOKENS_PER_CLEANUP,
  MIN_WLD_OUT_WEI,
  PLATFORM_FEE_WALLET,
  SLIPPAGE_BPS,
} from './constants';
import { applySlippage, quoteRouteToWld } from './swap-quotes';
import {
  getTokenExclusionReason,
  isCleanupReason,
} from './token-filters';
import { fetchTokenBalancesWei, publicClient } from './tokens';
import type { BuildCleanupResponse, SweepTransaction, WalletToken } from './types';

export { isCleanupReason };

function asCalldataTx(to: Address, data: `0x${string}`): SweepTransaction {
  return { to: getAddress(to), data, value: '0x0' };
}

async function canTransferToFeeWallet(
  token: Address,
  amount: bigint,
  account: Address,
  feeWallet: Address,
): Promise<boolean> {
  const data = encodeFunctionData({
    abi: erc20Abi,
    functionName: 'transfer',
    args: [feeWallet, amount],
  });

  try {
    const simulation = await publicClient.call({
      account,
      to: token,
      data,
    });
    if (simulation.data && simulation.data !== '0x') {
      try {
        const ok = decodeFunctionResult({
          abi: erc20Abi,
          functionName: 'transfer',
          data: simulation.data,
        });
        if (ok === false) {
          return false;
        }
      } catch {
        // Some tokens return empty success data.
      }
    }
    return true;
  } catch {
    return false;
  }
}

export async function buildCleanupPlan({
  walletAddress,
  tokens,
}: {
  walletAddress: string;
  tokens: Array<
    Pick<WalletToken, 'address' | 'symbol'> & {
      balance?: string;
      name?: string;
      reason?: string;
    }
  >;
}): Promise<BuildCleanupResponse> {
  if (!PLATFORM_FEE_WALLET) {
    throw new Error(
      'NEXT_PUBLIC_PLATFORM_FEE_WALLET is not configured. Set your World wallet address.',
    );
  }

  const owner = getAddress(walletAddress);
  const feeWallet = getAddress(PLATFORM_FEE_WALLET);
  const candidates = tokens.filter((token) => {
    if (!isAddress(token.address) || !isCleanupReason(token.reason)) {
      return false;
    }
    const blocked = getTokenExclusionReason({
      address: token.address,
      symbol: token.symbol,
      name: token.name ?? token.symbol,
      balance: token.balance && token.balance !== '0' ? token.balance : '1',
    });
    return blocked !== 'protected' && blocked !== 'staked_re';
  });

  const skippedTokens: BuildCleanupResponse['skippedTokens'] = [];
  const included: BuildCleanupResponse['tokens'] = [];
  const transactions: SweepTransaction[] = [];

  if (candidates.length === 0) {
    return { tokens: included, skippedTokens, transactions };
  }

  const live = await fetchTokenBalancesWei(
    owner,
    candidates.map((token) => token.address),
  );

  const prepared = await mapPool(candidates, 6, async (token) => {
    const address = getAddress(token.address);
    const amount = live.get(address.toLowerCase()) ?? BigInt(0);
    if (amount <= BigInt(0)) {
      return {
        skip: {
          address: token.address,
          symbol: token.symbol,
          reason: 'Zero balance',
        },
      };
    }

    const staticReason = getTokenExclusionReason({
      address: token.address,
      symbol: token.symbol,
      name: token.name ?? token.symbol,
      balance: amount.toString(),
    });
    if (staticReason === 'protected' || staticReason === 'staked_re') {
      return {
        skip: {
          address: token.address,
          symbol: token.symbol,
          reason: 'Protected asset',
        },
      };
    }

    // Only steal bags back to forage when they were liquidity skips — never
    // re-route honeypots / transfer-blocked / malicious tokens into a swap.
    if (
      isPermit2Allowlisted(token.address) &&
      (token.reason === 'no_liquidity' ||
        token.reason === 'output_too_small' ||
        !token.reason)
    ) {
      try {
        const route = await quoteRouteToWld({
          address: token.address,
          symbol: token.symbol,
          name: token.name ?? token.symbol,
          decimals: 18,
          balance: amount.toString(),
          balanceFormatted: '0',
        }, {
          firstSuccess: true,
          skipRetry: true,
          callTimeoutMs: 800,
        });
        if (route) {
          const minWldOut = applySlippage(route.amountOut, SLIPPAGE_BPS);
          if (minWldOut >= MIN_WLD_OUT_WEI) {
            return {
              skip: {
                address: token.address,
                symbol: token.symbol,
                reason: 'Has a Uniswap route — forage this instead',
              },
            };
          }
        }
      } catch {
        // Quote flakes: still allow cleanup of confirmed junk.
      }
    }

    const transferable = await canTransferToFeeWallet(
      address,
      amount,
      owner,
      feeWallet,
    );
    if (!transferable) {
      return {
        skip: {
          address: token.address,
          symbol: token.symbol,
          reason: 'Token cannot transfer',
        },
      };
    }

    return { token, address, amount };
  });

  for (const item of prepared) {
    if (!item) {
      continue;
    }
    if ('skip' in item && item.skip) {
      skippedTokens.push(item.skip);
      continue;
    }
    if (transactions.length >= MAX_TOKENS_PER_CLEANUP) {
      skippedTokens.push({
        address: item.token.address,
        symbol: item.token.symbol,
        reason: 'Queued for the next cleanup',
      });
      continue;
    }

    included.push({
      address: item.address,
      symbol: item.token.symbol,
      amount: item.amount.toString(),
    });
    transactions.push(
      asCalldataTx(
        item.address,
        encodeFunctionData({
          abi: erc20Abi,
          functionName: 'transfer',
          args: [feeWallet, item.amount],
        }),
      ),
    );
  }

  return { tokens: included, skippedTokens, transactions };
}

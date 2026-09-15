import { mapPool } from './async-pool';
import { formatUnitsCapped } from './format-balance';
import {
  decodeFunctionData,
  decodeFunctionResult,
  encodeFunctionData,
  getAddress,
  isAddress,
  type Address,
  type Hex,
} from 'viem';
import { erc20Abi, swapRouterAbi } from './abis';
import {
  ALLOWLIST_PENDING_SKIP_REASON,
  isPermit2Allowlisted,
} from './allowlist';
import {
  MAX_TOKENS_PER_SWEEP,
  MIN_WLD_OUT_WEI,
  PLATFORM_FEE_BPS,
  PLATFORM_FEE_WALLET,
  SLIPPAGE_BPS,
  UNISWAP_V3_SWAP_ROUTER,
  WLD_ADDRESS,
} from './constants';
import { checkRouterTransferability } from './honeypot';
import { fetchTokenBalancesWei, publicClient } from './tokens';
import { isForageableToken } from './token-filters';
import { simulateSweepBatch } from './simulate-batch';
import {
  applySlippage,
  encodeV3Path,
  quoteRouteToWld,
  QuoteTransportError,
  type RouteQuote,
} from './swap-quotes';
import type { BuildSweepResponse, SweepQuote, WalletToken } from './types';

export { checkRouterTransferability };

/**
 * Clamp client-claimed balances to live Alchemy balances so stale session
 * cache amounts cannot revert the whole atomic batch (and fee transfer).
 */
async function clampTokensToLiveBalances(
  walletAddress: Address,
  tokens: WalletToken[],
): Promise<WalletToken[]> {
  if (tokens.length === 0) {
    return tokens;
  }

  let live: Map<string, bigint>;
  try {
    live = await fetchTokenBalancesWei(
      walletAddress,
      tokens.map((token) => token.address),
    );
  } catch (error) {
    console.warn(
      '[build-sweep] live balance clamp failed; using client balances',
      error instanceof Error ? error.message : error,
    );
    return tokens;
  }

  const clamped: WalletToken[] = [];
  for (const token of tokens) {
    const claimed = BigInt(token.balance);
    const onchain = live.get(token.address.toLowerCase());
    if (onchain === undefined) {
      clamped.push(token);
      continue;
    }
    const amountIn = claimed < onchain ? claimed : onchain;
    if (amountIn <= BigInt(0)) {
      continue;
    }
    if (amountIn === claimed) {
      clamped.push(token);
      continue;
    }
    clamped.push({
      ...token,
      balance: amountIn.toString(),
      balanceFormatted: formatUnitsCapped(amountIn, token.decimals || 18),
      cachedRoute: null,
    });
  }
  return clamped;
}

function asCalldataTx(to: Address, data: Hex) {
  return { to: getAddress(to), data, value: '0x0' as const };
}

function buildSwapTransaction({
  route,
  amountIn,
  minWldOut,
  recipient,
}: {
  route: RouteQuote;
  amountIn: bigint;
  minWldOut: bigint;
  recipient: Address;
}) {
  if (route.hops.length === 1) {
    const hop = route.hops[0];
    return asCalldataTx(
      UNISWAP_V3_SWAP_ROUTER,
      encodeFunctionData({
        abi: swapRouterAbi,
        functionName: 'exactInputSingle',
        args: [
          {
            tokenIn: hop.tokenIn,
            tokenOut: hop.tokenOut,
            fee: hop.fee,
            recipient,
            amountIn,
            amountOutMinimum: minWldOut,
            sqrtPriceLimitX96: BigInt(0),
          },
        ],
      }),
    );
  }

  return asCalldataTx(
    UNISWAP_V3_SWAP_ROUTER,
    encodeFunctionData({
      abi: swapRouterAbi,
      functionName: 'exactInput',
      args: [
        {
          path: encodeV3Path(route.hops),
          recipient,
          amountIn,
          amountOutMinimum: minWldOut,
        },
      ],
    }),
  );
}

function getApprovalErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  if (typeof error === 'string' && error.trim().length > 0) {
    return error;
  }

  return 'Token rejected approve() simulation';
}

/** World Chain Uniswap V3 SwapRouter pulls via ERC20 transferFrom, not Permit2. */
async function buildRouterTokenApproval(
  token: Address,
  amount: bigint,
  account: Address,
) {
  const data = encodeFunctionData({
    abi: erc20Abi,
    functionName: 'approve',
    args: [UNISWAP_V3_SWAP_ROUTER, amount],
  });

  try {
    const simulation = await publicClient.call({
      account,
      to: token,
      data,
    });

    if (simulation.data && simulation.data !== '0x') {
      try {
        const approved = decodeFunctionResult({
          abi: erc20Abi,
          functionName: 'approve',
          data: simulation.data,
        });

        if (approved === false) {
          throw new Error('Token approve() returned false');
        }
      } catch (decodeError) {
        // Non-standard ERC-20s may not return a bool; ignore decode failures.
        if (
          decodeError instanceof Error &&
          decodeError.message.includes('returned false')
        ) {
          throw decodeError;
        }
      }
    }
  } catch (error) {
    throw new Error(getApprovalErrorMessage(error));
  }

  return asCalldataTx(token, data);
}

async function resolveRoute(token: WalletToken): Promise<RouteQuote | null> {
  // SECURITY: never trust a client-supplied `cachedRoute` for path encoding or
  // output amounts. A crafted cachedRoute could set an arbitrary swap path
  // (routing through an attacker pool) or a tiny `amountOut` that collapses
  // `minWldOut` (removing slippage protection / enabling sandwiches) and rounds
  // the platform fee toward zero. Always re-derive the route from the on-chain
  // Uniswap V3 quoter server-side. The route cache (keyed by address:balance)
  // keeps this cheap across the preview→submit round trips.
  return quoteRouteToWld({ ...token, cachedRoute: null });
}

/**
 * REVENUE INVARIANT (belt-and-braces against future regressions): whenever a
 * sweep plan contains any swaps, the FINAL transaction of the batch MUST be a
 * WLD `transfer(feeWallet, amount)` with amount > 0. Decodes the calldata we
 * just built and throws if anything about it is off, so a bug upstream can
 * never ship a batch that swaps without paying the platform fee.
 */
function assertFeeTransferInvariant(
  transactions: BuildSweepResponse['transactions'],
  feeWallet: Address,
) {
  const last = transactions[transactions.length - 1];

  if (!last || getAddress(last.to) !== getAddress(WLD_ADDRESS)) {
    throw new Error(
      'Fee invariant violated: final transaction is not a WLD call',
    );
  }

  let decoded: { functionName: string; args: readonly unknown[] };
  try {
    decoded = decodeFunctionData({ abi: erc20Abi, data: last.data });
  } catch {
    throw new Error(
      'Fee invariant violated: final transaction is not decodable ERC-20 calldata',
    );
  }

  if (decoded.functionName !== 'transfer') {
    throw new Error(
      'Fee invariant violated: final transaction is not a WLD transfer',
    );
  }

  const [recipient, amount] = decoded.args as [Address, bigint];

  if (getAddress(recipient) !== getAddress(feeWallet)) {
    throw new Error(
      'Fee invariant violated: fee transfer recipient is not the platform fee wallet',
    );
  }

  if (amount <= BigInt(0)) {
    throw new Error('Fee invariant violated: fee transfer amount is zero');
  }
}

export async function buildSweepPlan({
  walletAddress,
  tokens,
}: {
  walletAddress: string;
  tokens: WalletToken[];
}): Promise<BuildSweepResponse> {
  if (!PLATFORM_FEE_WALLET) {
    throw new Error(
      'NEXT_PUBLIC_PLATFORM_FEE_WALLET is not configured. Set your World wallet address.',
    );
  }

  const candidates = await clampTokensToLiveBalances(
    getAddress(walletAddress),
    tokens.filter((token) => isForageableToken(token)),
  );
  const recipient = getAddress(walletAddress);
  const feeWallet = getAddress(PLATFORM_FEE_WALLET);

  const quotes: SweepQuote[] = [];
  const skippedTokens: BuildSweepResponse['skippedTokens'] = [];
  const transactions: BuildSweepResponse['transactions'] = [];
  /** Sum of per-token minWldOut (quote minus slippage) — the guaranteed floor. */
  let estimatedWldTotal = BigInt(0);
  /** Sum of per-token quoted amountOut — the fee base (PLATFORM_FEE_BPS of full quotes). */
  let quotedWldTotal = BigInt(0);

  type PreparedCandidate = {
    token: WalletToken;
    amountIn: bigint;
    route: RouteQuote;
    minWldOut: bigint;
  };

  const prepared = await mapPool(
    candidates.slice(0, MAX_TOKENS_PER_SWEEP + 4),
    8,
    async (token): Promise<PreparedCandidate | { skip: BuildSweepResponse['skippedTokens'][number] } | null> => {
      if (!isAddress(token.address) || !/^\d+$/.test(String(token.balance))) {
        return {
          skip: {
            address: String(token.address),
            symbol: String(token.symbol ?? 'UNKNOWN'),
            reason: 'Invalid token address or balance',
          },
        };
      }

      if (!isPermit2Allowlisted(token.address)) {
        return {
          skip: {
            address: token.address,
            symbol: token.symbol,
            reason: ALLOWLIST_PENDING_SKIP_REASON,
          },
        };
      }

      const amountIn = BigInt(token.balance);
      if (amountIn <= BigInt(0)) {
        return null;
      }

      let route: RouteQuote | null = null;
      try {
        route = await resolveRoute(token);
      } catch (error) {
        return {
          skip: {
            address: token.address,
            symbol: token.symbol,
            reason:
              error instanceof QuoteTransportError
                ? 'Quote RPC busy — retry in a moment'
                : 'Could not quote a WLD route right now',
          },
        };
      }

      if (!route) {
        return {
          skip: {
            address: token.address,
            symbol: token.symbol,
            reason: 'Unable to find route',
          },
        };
      }

      const minWldOut = applySlippage(route.amountOut, SLIPPAGE_BPS);
      if (minWldOut < MIN_WLD_OUT_WEI) {
        return {
          skip: {
            address: token.address,
            symbol: token.symbol,
            reason: 'Quoted output too small after slippage',
          },
        };
      }

      return { token, amountIn, route, minWldOut };
    },
  );

  for (const item of prepared) {
    if (!item) {
      continue;
    }
    if ('skip' in item) {
      skippedTokens.push(item.skip);
    }
  }

  for (const item of prepared) {
    if (!item || 'skip' in item) {
      continue;
    }
    if (quotes.length >= MAX_TOKENS_PER_SWEEP) {
      break;
    }

    const { token, amountIn, route, minWldOut } = item;

    estimatedWldTotal += minWldOut;
    quotedWldTotal += route.amountOut;

    quotes.push({
      tokenAddress: token.address,
      symbol: token.symbol,
      amountIn: token.balance,
      estimatedWldOut: route.amountOut.toString(),
      minWldOut: minWldOut.toString(),
      feeTier: route.hops[0].fee,
      routeLabel: route.label,
    });

    try {
      const approvalTx = await buildRouterTokenApproval(
        getAddress(token.address),
        amountIn,
        recipient,
      );
      const swapTx = buildSwapTransaction({
        route,
        amountIn,
        minWldOut,
        recipient,
      });

      let simulationError: string | null = null;
      try {
        simulationError = await simulateSweepBatch(recipient, [
          ...transactions,
          approvalTx,
          swapTx,
        ]);
      } catch (simulateError) {
        console.warn(
          '[build-sweep] batch simulation skipped',
          simulateError instanceof Error ? simulateError.message : simulateError,
        );
      }
      if (simulationError) {
        skippedTokens.push({
          address: token.address,
          symbol: token.symbol,
          reason: `Swap simulation failed: ${simulationError}`,
        });
        quotes.pop();
        estimatedWldTotal -= minWldOut;
        quotedWldTotal -= route.amountOut;
        continue;
      }

      transactions.push(approvalTx, swapTx);
    } catch (approvalError) {
      skippedTokens.push({
        address: token.address,
        symbol: token.symbol,
        reason: `Approval simulation failed: ${
          approvalError instanceof Error
            ? approvalError.message
            : 'Token rejected approve()'
        }`,
      });
      quotes.pop();
      estimatedWldTotal -= minWldOut;
      quotedWldTotal -= route.amountOut;
      continue;
    }
  }

  // Soft empty plan — callers degrade gracefully (deselect / empty preview)
  // instead of surfacing a hard error wall for unquotable selections.
  if (quotes.length === 0) {
    return {
      quotes: [],
      skippedTokens,
      transactions: [],
      estimatedWldTotal: '0',
      platformFeeWld: '0',
      userReceivesWld: '0',
    };
  }

  // REVENUE: the platform fee is PLATFORM_FEE_BPS of the *full quoted* output
  // (sum of route.amountOut), not of the post-slippage floor. This is still
  // guaranteed-safe: the swaps produce at least sum(minWldOut) ≈ 97% of the
  // quotes, and 2% of quotes < 97% of quotes, so the fee transfer can never
  // exceed what the batch just swapped into the wallet.
  const platformFeeWld =
    (quotedWldTotal * BigInt(PLATFORM_FEE_BPS)) / BigInt(10_000);
  // Guaranteed minimum for the user: slippage floor minus the fee.
  const userReceivesWld = estimatedWldTotal - platformFeeWld;

  // Every included token satisfies minWldOut >= MIN_WLD_OUT_WEI, so
  // quotedWldTotal is large enough that the 2% fee cannot round to zero.
  // The invariant below still guards this unconditionally.
  transactions.push(
    asCalldataTx(
      WLD_ADDRESS,
      encodeFunctionData({
        abi: erc20Abi,
        functionName: 'transfer',
        args: [feeWallet, platformFeeWld],
      }),
    ),
  );

  assertFeeTransferInvariant(transactions, feeWallet);

  return {
    quotes,
    skippedTokens,
    transactions,
    estimatedWldTotal: estimatedWldTotal.toString(),
    platformFeeWld: platformFeeWld.toString(),
    userReceivesWld: userReceivesWld.toString(),
  };
}

export function formatWld(amount: string): string {
  return `${formatUnitsCapped(BigInt(amount), 18)} WLD`;
}

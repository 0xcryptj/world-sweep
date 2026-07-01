import { formatUnitsCapped } from './format-balance';
import {
  decodeErrorResult,
  encodeFunctionData,
  encodePacked,
  getAddress,
  type Address,
  type Hex,
} from 'viem';
import { erc20Abi, permit2Abi, quoterV2Abi, swapRouterAbi } from './abis';
import {
  FEE_TIERS,
  MAX_TOKENS_PER_SWEEP,
  MIN_WLD_OUT_WEI,
  PERMIT2_ADDRESS,
  PLATFORM_FEE_BPS,
  PLATFORM_FEE_WALLET,
  SLIPPAGE_BPS,
  UNISWAP_V3_QUOTER_V2,
  UNISWAP_V3_SWAP_ROUTER,
  USDC_ADDRESS,
  WETH_ADDRESS,
  WLD_ADDRESS,
} from './constants';
import { isPermit2Allowlisted } from './allowlist';
import { publicClient } from './tokens';
import { isStakedYieldToken } from './token-filters';
import type { BuildSweepResponse, SweepQuote, WalletToken } from './types';

const MAX_UINT160 = (BigInt(1) << BigInt(160)) - BigInt(1);

function toUint160(amount: bigint): bigint {
  if (amount > MAX_UINT160) {
    throw new Error('Token amount exceeds Permit2 limit');
  }
  return amount;
}

function asCalldataTx(to: Address, data: Hex) {
  return {
    to,
    data,
    value: '0x0' as const,
  };
}

type RouteHop = {
  tokenIn: Address;
  tokenOut: Address;
  fee: number;
};

type RouteQuote = {
  hops: RouteHop[];
  amountOut: bigint;
  label: string;
};

const quoterSingleErrorAbi = [
  {
    type: 'error',
    name: 'QuoteExactInputSingle',
    inputs: [
      { name: 'amountOut', type: 'uint256' },
      { name: 'sqrtPriceX96After', type: 'uint160' },
      { name: 'initializedTicksCrossed', type: 'uint32' },
      { name: 'gasEstimate', type: 'uint256' },
    ],
  },
] as const;

function applySlippage(amount: bigint, slippageBps: number): bigint {
  return (amount * BigInt(10_000 - slippageBps)) / BigInt(10_000);
}

function encodeV3Path(hops: RouteHop[]): Hex {
  if (hops.length === 0) {
    throw new Error('Route must include at least one hop');
  }

  const parts: Array<'address' | 'uint24'> = ['address'];
  const values: Array<Address | number> = [hops[0].tokenIn];

  for (const hop of hops) {
    parts.push('uint24', 'address');
    values.push(hop.fee, hop.tokenOut);
  }

  return encodePacked(parts, values);
}

function extractRevertData(error: unknown): Hex | null {
  if (!error || typeof error !== 'object') {
    return null;
  }

  const candidate = error as {
    data?: Hex;
    cause?: { data?: Hex };
    walk?: () => Iterable<{ data?: Hex }>;
  };

  if (candidate.data) {
    return candidate.data;
  }

  if (candidate.cause?.data) {
    return candidate.cause.data;
  }

  if (typeof candidate.walk === 'function') {
    try {
      const walked = candidate.walk();
      if (walked && typeof walked[Symbol.iterator] === 'function') {
        for (const nested of walked) {
          if (nested?.data) {
            return nested.data;
          }
        }
      }
    } catch {
      return null;
    }
  }

  return null;
}

async function quoteExactInputSingle(
  tokenIn: Address,
  tokenOut: Address,
  amountIn: bigint,
  fee: number,
): Promise<bigint | null> {
  try {
    const result = await publicClient.simulateContract({
      address: UNISWAP_V3_QUOTER_V2,
      abi: quoterV2Abi,
      functionName: 'quoteExactInputSingle',
      args: [
        {
          tokenIn,
          tokenOut,
          amountIn,
          fee,
          sqrtPriceLimitX96: BigInt(0),
        },
      ],
    });

    return result.result[0];
  } catch (error) {
    const data = extractRevertData(error);
    if (!data) {
      return null;
    }

    try {
      const decoded = decodeErrorResult({
        abi: quoterSingleErrorAbi,
        data,
      });
      return decoded.args[0] > BigInt(0) ? decoded.args[0] : null;
    } catch {
      return null;
    }
  }
}

async function quoteHop(
  tokenIn: Address,
  tokenOut: Address,
  amountIn: bigint,
): Promise<{ fee: number; amountOut: bigint } | null> {
  for (const fee of FEE_TIERS) {
    const amountOut = await quoteExactInputSingle(tokenIn, tokenOut, amountIn, fee);
    if (amountOut) {
      return { fee, amountOut };
    }
  }

  return null;
}

async function quoteRouteToWld(
  token: WalletToken,
): Promise<RouteQuote | null> {
  const tokenIn = getAddress(token.address) as Address;
  const amountIn = BigInt(token.balance);

  if (amountIn <= BigInt(0)) {
    return null;
  }

  const acceptQuote = (route: RouteQuote): RouteQuote | null =>
    route.amountOut >= MIN_WLD_OUT_WEI ? route : null;

  for (const fee of FEE_TIERS) {
    const amountOut = await quoteExactInputSingle(
      tokenIn,
      WLD_ADDRESS,
      amountIn,
      fee,
    );

    if (amountOut) {
      return acceptQuote({
        hops: [{ tokenIn, tokenOut: WLD_ADDRESS, fee }],
        amountOut,
        label: `${token.symbol} → WLD`,
      });
    }
  }

  for (const [intermediate, label] of [
    [WETH_ADDRESS, 'WETH'] as const,
    [USDC_ADDRESS, 'USDC'] as const,
  ]) {
    const firstHop = await quoteHop(tokenIn, intermediate, amountIn);
    if (!firstHop) {
      continue;
    }

    for (const secondFee of FEE_TIERS) {
      const amountOut = await quoteExactInputSingle(
        intermediate,
        WLD_ADDRESS,
        firstHop.amountOut,
        secondFee,
      );

      if (amountOut) {
        return acceptQuote({
          hops: [
            { tokenIn, tokenOut: intermediate, fee: firstHop.fee },
            { tokenIn: intermediate, tokenOut: WLD_ADDRESS, fee: secondFee },
          ],
          amountOut,
          label: `${token.symbol} → ${label} → WLD`,
        });
      }
    }
  }

  return null;
}

function buildSwapTransaction({
  route,
  amountIn,
  minWldOut,
  recipient,
  deadline,
}: {
  route: RouteQuote;
  amountIn: bigint;
  minWldOut: bigint;
  recipient: Address;
  deadline: bigint;
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
            deadline,
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
          deadline,
          amountIn,
          amountOutMinimum: minWldOut,
        },
      ],
    }),
  );
}

function buildPermit2Approval(token: Address, amount: bigint) {
  return asCalldataTx(
    PERMIT2_ADDRESS,
    encodeFunctionData({
      abi: permit2Abi,
      functionName: 'approve',
      args: [token, UNISWAP_V3_SWAP_ROUTER, toUint160(amount), 0],
    }),
  );
}

function buildErc20ApprovePermit2(token: Address, amount: bigint) {
  return asCalldataTx(
    token,
    encodeFunctionData({
      abi: erc20Abi,
      functionName: 'approve',
      args: [PERMIT2_ADDRESS, amount],
    }),
  );
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

  const selected = tokens.slice(0, MAX_TOKENS_PER_SWEEP);
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 60 * 10);
  const recipient = getAddress(walletAddress);
  const feeWallet = getAddress(PLATFORM_FEE_WALLET);

  const quotes: SweepQuote[] = [];
  const skippedTokens: BuildSweepResponse['skippedTokens'] = [];
  const transactions: BuildSweepResponse['transactions'] = [];
  let estimatedWldTotal = BigInt(0);

  for (const token of selected) {
    if (isStakedYieldToken(token.symbol, token.name)) {
      skippedTokens.push({
        address: token.address,
        symbol: token.symbol,
        reason: 'Staked yield token (Re prefix)',
      });
      continue;
    }

    if (!isPermit2Allowlisted(token.address)) {
      skippedTokens.push({
        address: token.address,
        symbol: token.symbol,
        reason: 'Token not allowlisted in Developer Portal (Permit2)',
      });
      continue;
    }

    const route = await quoteRouteToWld(token);

    if (!route) {
      skippedTokens.push({
        address: token.address,
        symbol: token.symbol,
        reason: 'No Uniswap V3 liquidity route to WLD',
      });
      continue;
    }

    const amountIn = BigInt(token.balance);
    const minWldOut = applySlippage(route.amountOut, SLIPPAGE_BPS);

    if (minWldOut < MIN_WLD_OUT_WEI) {
      skippedTokens.push({
        address: token.address,
        symbol: token.symbol,
        reason: 'Quoted output too small after slippage',
      });
      continue;
    }

    estimatedWldTotal += minWldOut;

    quotes.push({
      tokenAddress: token.address,
      symbol: token.symbol,
      amountIn: token.balance,
      estimatedWldOut: route.amountOut.toString(),
      minWldOut: minWldOut.toString(),
      feeTier: route.hops[0].fee,
      routeLabel: route.label,
    });

    transactions.push(
      buildErc20ApprovePermit2(getAddress(token.address), amountIn),
      buildPermit2Approval(getAddress(token.address), amountIn),
      buildSwapTransaction({
        route,
        amountIn,
        minWldOut,
        recipient,
        deadline,
      }),
    );
  }

  if (quotes.length === 0) {
    throw new Error(
      'No selected tokens have a swappable route to WLD on Uniswap V3.',
    );
  }

  const platformFeeWld =
    (estimatedWldTotal * BigInt(PLATFORM_FEE_BPS)) / BigInt(10_000);
  const userReceivesWld = estimatedWldTotal - platformFeeWld;

  if (platformFeeWld > BigInt(0)) {
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
  }

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

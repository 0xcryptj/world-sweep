import {
  decodeErrorResult,
  encodePacked,
  getAddress,
  type Address,
  type Hex,
} from 'viem';
import { quoterV2Abi } from './abis';
import {
  FEE_TIERS,
  MIN_WLD_OUT_WEI,
  SLIPPAGE_BPS,
  UNISWAP_V3_QUOTER_V2,
  USDC_ADDRESS,
  WETH_ADDRESS,
  WLD_ADDRESS,
} from './constants';
import {
  getCachedRoute,
  routeCacheKey,
  setCachedRoute,
} from './quote-cache';
import { publicClient } from './tokens';
import type { CachedRouteQuote, WalletToken } from './types';

export type RouteHop = {
  tokenIn: Address;
  tokenOut: Address;
  fee: number;
};

export type RouteQuote = {
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

export function applySlippage(amount: bigint, slippageBps: number): bigint {
  return (amount * BigInt(10_000 - slippageBps)) / BigInt(10_000);
}

export function serializeRoute(route: RouteQuote): CachedRouteQuote {
  return {
    hops: route.hops.map((hop) => ({
      tokenIn: hop.tokenIn,
      tokenOut: hop.tokenOut,
      fee: hop.fee,
    })),
    amountOut: route.amountOut.toString(),
    label: route.label,
  };
}

export function deserializeRoute(cached: CachedRouteQuote): RouteQuote {
  return {
    hops: cached.hops.map((hop) => ({
      tokenIn: getAddress(hop.tokenIn),
      tokenOut: getAddress(hop.tokenOut),
      fee: hop.fee,
    })),
    amountOut: BigInt(cached.amountOut),
    label: cached.label,
  };
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

async function bestQuoteAcrossFees(
  tokenIn: Address,
  tokenOut: Address,
  amountIn: bigint,
): Promise<{ fee: number; amountOut: bigint } | null> {
  const quotes = await Promise.all(
    FEE_TIERS.map(async (fee) => {
      const amountOut = await quoteExactInputSingle(
        tokenIn,
        tokenOut,
        amountIn,
        fee,
      );
      return amountOut ? { fee, amountOut } : null;
    }),
  );

  const valid = quotes.filter(
    (quote): quote is { fee: number; amountOut: bigint } => quote !== null,
  );

  if (valid.length === 0) {
    return null;
  }

  return valid.reduce((best, current) =>
    current.amountOut > best.amountOut ? current : best,
  );
}

async function quoteHop(
  tokenIn: Address,
  tokenOut: Address,
  amountIn: bigint,
): Promise<{ fee: number; amountOut: bigint } | null> {
  return bestQuoteAcrossFees(tokenIn, tokenOut, amountIn);
}

async function quoteMultiHopRoute(
  tokenIn: Address,
  amountIn: bigint,
  intermediate: Address,
  intermediateLabel: string,
  symbol: string,
): Promise<RouteQuote | null> {
  const firstHop = await quoteHop(tokenIn, intermediate, amountIn);
  if (!firstHop) {
    return null;
  }

  const secondHop = await bestQuoteAcrossFees(
    intermediate,
    WLD_ADDRESS,
    firstHop.amountOut,
  );

  if (!secondHop) {
    return null;
  }

  return {
    hops: [
      { tokenIn, tokenOut: intermediate, fee: firstHop.fee },
      {
        tokenIn: intermediate,
        tokenOut: WLD_ADDRESS,
        fee: secondHop.fee,
      },
    ],
    amountOut: secondHop.amountOut,
    label: `${symbol} → ${intermediateLabel} → WLD`,
  };
}

export async function quoteRouteToWld(
  token: WalletToken,
): Promise<RouteQuote | null> {
  const cacheKey = routeCacheKey(token.address, token.balance);
  const cached = getCachedRoute(cacheKey);
  if (cached !== undefined) {
    return cached;
  }

  if (token.cachedRoute) {
    const route = deserializeRoute(token.cachedRoute);
    setCachedRoute(cacheKey, route);
    return route;
  }

  const tokenIn = getAddress(token.address) as Address;
  const amountIn = BigInt(token.balance);

  if (amountIn <= BigInt(0)) {
    setCachedRoute(cacheKey, null);
    return null;
  }

  const acceptQuote = (route: RouteQuote): RouteQuote | null =>
    route.amountOut >= MIN_WLD_OUT_WEI ? route : null;

  const directHop = await bestQuoteAcrossFees(tokenIn, WLD_ADDRESS, amountIn);
  if (directHop) {
    const route = acceptQuote({
      hops: [{ tokenIn, tokenOut: WLD_ADDRESS, fee: directHop.fee }],
      amountOut: directHop.amountOut,
      label: `${token.symbol} → WLD`,
    });
    setCachedRoute(cacheKey, route);
    return route;
  }

  const multiHopRoutes = await Promise.all([
    quoteMultiHopRoute(tokenIn, amountIn, WETH_ADDRESS, 'WETH', token.symbol),
    quoteMultiHopRoute(tokenIn, amountIn, USDC_ADDRESS, 'USDC', token.symbol),
  ]);

  const route =
    multiHopRoutes
      .map((candidate) => (candidate ? acceptQuote(candidate) : null))
      .filter((candidate): candidate is RouteQuote => candidate !== null)
      .sort((a, b) => (a.amountOut > b.amountOut ? -1 : 1))[0] ?? null;

  setCachedRoute(cacheKey, route);
  return route;
}

/** True when the token has a quotable Uniswap route with enough WLD output after slippage. */
export async function hasSwappableLiquidity(token: WalletToken): Promise<boolean> {
  const route = await quoteRouteToWld(token);
  if (!route) {
    return false;
  }

  const minWldOut = applySlippage(route.amountOut, SLIPPAGE_BPS);
  return minWldOut >= MIN_WLD_OUT_WEI;
}

export { encodeV3Path };

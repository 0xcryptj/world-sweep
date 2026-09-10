import {
  decodeErrorResult,
  decodeFunctionResult,
  encodeFunctionData,
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
import { withTimeout } from './fetch-with-timeout';
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

/** Thrown when the quoter RPC is flaky — callers must NOT treat this as no liquidity. */
export class QuoteTransportError extends Error {
  constructor(message = 'Token quote RPC failed') {
    super(message);
    this.name = 'QuoteTransportError';
  }
}

const QUOTER_GAS = BigInt(2_000_000);

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

const quoterPathErrorAbi = [
  {
    type: 'error',
    name: 'QuoteExactInput',
    inputs: [
      { name: 'amountOut', type: 'uint256' },
      { name: 'sqrtPriceX96AfterList', type: 'uint160[]' },
      { name: 'initializedTicksCrossedList', type: 'uint32[]' },
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

function isHexData(value: unknown): value is Hex {
  return typeof value === 'string' && /^0x[0-9a-fA-F]{8,}$/.test(value);
}

function extractRevertData(error: unknown): Hex | null {
  const seen = new Set<unknown>();
  const stack: unknown[] = [error];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || seen.has(current)) {
      continue;
    }
    seen.add(current);

    if (isHexData(current)) {
      return current;
    }

    if (typeof current !== 'object') {
      continue;
    }

    const candidate = current as {
      data?: unknown;
      raw?: unknown;
      hex?: unknown;
      details?: unknown;
      cause?: unknown;
      error?: unknown;
      value?: unknown;
      walk?: (fn?: (value: unknown) => unknown) => unknown;
    };

    for (const value of [
      candidate.data,
      candidate.raw,
      candidate.hex,
      candidate.details,
    ]) {
      if (isHexData(value)) {
        return value;
      }
      if (value && typeof value === 'object') {
        stack.push(value);
      }
    }

    if (candidate.cause) {
      stack.push(candidate.cause);
    }
    if (candidate.error) {
      stack.push(candidate.error);
    }
    if (candidate.value) {
      stack.push(candidate.value);
    }

    if (typeof candidate.walk === 'function') {
      try {
        const walked = candidate.walk((nested) =>
          isHexData((nested as { data?: unknown })?.data)
            ? (nested as { data: Hex }).data
            : null,
        );
        if (isHexData(walked)) {
          return walked;
        }
      } catch {
        // ignore walk failures
      }
    }
  }

  return null;
}

function isQuoterTransportError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }
  const candidate = error as {
    name?: string;
    status?: number;
    details?: string;
    shortMessage?: string;
    message?: string;
    code?: string | number;
  };
  if (candidate.status === 429 || (candidate.status != null && candidate.status >= 500)) {
    return true;
  }
  const text = [
    candidate.name,
    candidate.details,
    candidate.shortMessage,
    candidate.message,
    String(candidate.code ?? ''),
  ]
    .filter(Boolean)
    .join(' ');
  return /HttpRequestError|TimeoutError|RpcRequestError|InternalRpcError|\b429\b|too many requests|rate[- ]?limit|timeout|timed out|ECONNRESET|fetch failed|network|busy|socket|EAI_AGAIN/i.test(
    text,
  );
}

function decodeQuotedAmount(
  data: Hex,
  kind: 'single' | 'path',
): bigint | null {
  try {
    const decoded = decodeFunctionResult({
      abi: quoterV2Abi,
      functionName: kind === 'single' ? 'quoteExactInputSingle' : 'quoteExactInput',
      data,
    });
    const amountOut = decoded[0];
    return amountOut > BigInt(0) ? amountOut : null;
  } catch {
    try {
      const decoded = decodeErrorResult({
        abi: kind === 'single' ? quoterSingleErrorAbi : quoterPathErrorAbi,
        data,
      });
      const amountOut = decoded.args[0];
      return amountOut > BigInt(0) ? amountOut : null;
    } catch {
      return null;
    }
  }
}

async function quoteExactInputSingle(
  tokenIn: Address,
  tokenOut: Address,
  amountIn: bigint,
  fee: number,
): Promise<bigint | null> {
  const data = encodeFunctionData({
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

  try {
    const result = await withTimeout(
      publicClient.call({
        to: UNISWAP_V3_QUOTER_V2,
        data,
        gas: QUOTER_GAS,
      }),
      5_000,
      'Quoter call timed out',
    );

    if (!result.data || result.data === '0x') {
      return null;
    }

    return decodeQuotedAmount(result.data, 'single');
  } catch (error) {
    // Bubble RPC/rate-limit failures so quoteRouteToWld can retry once.
    // Definitive no-pool reverts fall through to null below.
    if (isQuoterTransportError(error)) {
      throw error;
    }

    const revertData = extractRevertData(error);
    if (!revertData) {
      return null;
    }

    return decodeQuotedAmount(revertData, 'single');
  }
}

async function quoteExactInputPath(
  hops: RouteHop[],
  amountIn: bigint,
): Promise<bigint | null> {
  const data = encodeFunctionData({
    abi: quoterV2Abi,
    functionName: 'quoteExactInput',
    args: [encodeV3Path(hops), amountIn],
  });

  try {
    const result = await withTimeout(
      publicClient.call({
        to: UNISWAP_V3_QUOTER_V2,
        data,
        gas: QUOTER_GAS,
      }),
      5_000,
      'Quoter call timed out',
    );

    if (!result.data || result.data === '0x') {
      return null;
    }

    return decodeQuotedAmount(result.data, 'path');
  } catch (error) {
    if (isQuoterTransportError(error)) {
      throw error;
    }

    const revertData = extractRevertData(error);
    if (!revertData) {
      return null;
    }

    return decodeQuotedAmount(revertData, 'path');
  }
}

/**
 * Sequential fee-tier quotes to cut Alchemy CU.
 * - firstSuccess: stop at the first positive tier (fast scan).
 * - otherwise: walk all tiers and keep the best amountOut (full scan).
 * Never fire all three eth_calls in parallel — that spikes rate limits.
 */
async function bestQuoteAcrossFees(
  tokenIn: Address,
  tokenOut: Address,
  amountIn: bigint,
  options?: { firstSuccess?: boolean },
): Promise<{ fee: number; amountOut: bigint } | null> {
  let best: { fee: number; amountOut: bigint } | null = null;

  for (const fee of FEE_TIERS) {
    const amountOut = await quoteExactInputSingle(
      tokenIn,
      tokenOut,
      amountIn,
      fee,
    );
    if (!amountOut || amountOut <= BigInt(0)) {
      continue;
    }

    if (options?.firstSuccess) {
      return { fee, amountOut };
    }

    if (!best || amountOut > best.amountOut) {
      best = { fee, amountOut };
    }
  }

  return best;
}

async function quoteHop(
  tokenIn: Address,
  tokenOut: Address,
  amountIn: bigint,
  options?: { firstSuccess?: boolean },
): Promise<{ fee: number; amountOut: bigint } | null> {
  return bestQuoteAcrossFees(tokenIn, tokenOut, amountIn, options);
}

const MULTI_HOP_FEE_PAIRS: ReadonlyArray<readonly [number, number]> = [
  [3_000, 3_000],
  [10_000, 10_000],
  [500, 3_000],
  [3_000, 500],
  [10_000, 3_000],
  [3_000, 10_000],
  [500, 500],
  [100, 3_000],
];

async function quoteMultiHopRoute(
  tokenIn: Address,
  amountIn: bigint,
  intermediate: Address,
  intermediateLabel: string,
  symbol: string,
  options?: { firstSuccess?: boolean },
): Promise<RouteQuote | null> {
  // One quoter call per fee pair is cheaper and more accurate than quoting
  // hop 1 then hop 2 independently (the second hop used a synthetic amount).
  let best: RouteQuote | null = null;

  for (const [feeIn, feeOut] of MULTI_HOP_FEE_PAIRS) {
    const hops: RouteHop[] = [
      { tokenIn, tokenOut: intermediate, fee: feeIn },
      { tokenIn: intermediate, tokenOut: WLD_ADDRESS, fee: feeOut },
    ];
    const amountOut = await quoteExactInputPath(hops, amountIn);
    if (!amountOut || amountOut <= BigInt(0)) {
      continue;
    }

    const route: RouteQuote = {
      hops,
      amountOut,
      label: `${symbol} → ${intermediateLabel} → WLD`,
    };

    if (options?.firstSuccess) {
      return route;
    }

    if (!best || amountOut > best.amountOut) {
      best = route;
    }
  }

  if (best) {
    return best;
  }

  // Fallback: independent hops if packed-path quoting reverts on this pool.
  const firstHop = await quoteHop(tokenIn, intermediate, amountIn, options);
  if (!firstHop) {
    return null;
  }

  const secondHop = await bestQuoteAcrossFees(
    intermediate,
    WLD_ADDRESS,
    firstHop.amountOut,
    options,
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

async function quoteRouteToWldOnce(
  token: WalletToken,
  tokenIn: Address,
  amountIn: bigint,
  options?: { directOnly?: boolean; firstSuccess?: boolean },
): Promise<RouteQuote | null> {
  // Prefer direct WLD, then WETH/USDC bridges — best amount wins.
  const directHop = await bestQuoteAcrossFees(tokenIn, WLD_ADDRESS, amountIn, {
    firstSuccess: options?.firstSuccess,
  });
  if (directHop && directHop.amountOut > BigInt(0)) {
    return {
      hops: [{ tokenIn, tokenOut: WLD_ADDRESS, fee: directHop.fee }],
      amountOut: directHop.amountOut,
      label: `${token.symbol} → WLD`,
    };
  }

  if (options?.directOnly) {
    return null;
  }

  const hopOpts = { firstSuccess: options?.firstSuccess };
  const bridges: Array<{ intermediate: Address; label: string }> = [
    { intermediate: WETH_ADDRESS, label: 'WETH' },
    { intermediate: USDC_ADDRESS, label: 'USDC' },
  ];

  // Fast scan: try bridges sequentially and stop at the first hit.
  if (options?.firstSuccess) {
    for (const bridge of bridges) {
      const route = await quoteMultiHopRoute(
        tokenIn,
        amountIn,
        bridge.intermediate,
        bridge.label,
        token.symbol,
        hopOpts,
      );
      if (route && route.amountOut > BigInt(0)) {
        return route;
      }
    }
    return null;
  }

  // Full scan: compare both bridges for best amountOut (still sequential).
  let best: RouteQuote | null = null;
  for (const bridge of bridges) {
    const route = await quoteMultiHopRoute(
      tokenIn,
      amountIn,
      bridge.intermediate,
      bridge.label,
      token.symbol,
      hopOpts,
    );
    if (
      route &&
      route.amountOut > BigInt(0) &&
      (!best || route.amountOut > best.amountOut)
    ) {
      best = route;
    }
  }
  return best;
}

export type QuoteRouteOptions = {
  /** Skip WETH/USDC bridges — used for the instant Home pass. */
  directOnly?: boolean;
  /** Skip the 180ms silent retry. */
  skipRetry?: boolean;
  /** Return first positive fee tier (fast scan). */
  firstSuccess?: boolean;
};

export async function quoteRouteToWld(
  token: WalletToken,
  options?: QuoteRouteOptions,
): Promise<RouteQuote | null> {
  // Namespace by strategy so fast-scan firstSuccess never poisons build-sweep.
  const strategy = options?.firstSuccess ? 'first' : 'best';
  const cacheKey = routeCacheKey(token.address, token.balance, strategy);
  // Direct-only misses must not poison the full-route cache.
  const useSharedCache = !options?.directOnly;
  if (useSharedCache) {
    const cached = getCachedRoute(cacheKey);
    if (cached !== undefined) {
      return cached;
    }
  }

  if (token.cachedRoute && !options?.directOnly) {
    const route = deserializeRoute(token.cachedRoute);
    setCachedRoute(cacheKey, route);
    return route;
  }

  const tokenIn = getAddress(token.address) as Address;
  const amountIn = BigInt(token.balance);

  if (amountIn <= BigInt(0)) {
    if (useSharedCache) {
      setCachedRoute(cacheKey, null);
    }
    return null;
  }

  // Return any positive quoter route. MIN_WLD_OUT is enforced by callers
  // (forage-scan / build-sweep) so under-min tokens are labeled output_too_small
  // instead of being misreported as no_liquidity.
  let route: RouteQuote | null = null;
  let transportFailed = false;
  try {
    route = await quoteRouteToWldOnce(token, tokenIn, amountIn, {
      directOnly: options?.directOnly,
      firstSuccess: options?.firstSuccess,
    });
  } catch (error) {
    if (!isQuoterTransportError(error)) {
      throw error;
    }
    route = null;
    transportFailed = true;
  }

  // Only retry on transport failures — not when all fee tiers / bridges
  // returned a definitive no-pool null (that just doubles Alchemy CU).
  if (!route && transportFailed && !options?.skipRetry) {
    try {
      await new Promise((resolve) => setTimeout(resolve, 280));
      route = await quoteRouteToWldOnce(token, tokenIn, amountIn, {
        directOnly: options?.directOnly,
        firstSuccess: options?.firstSuccess,
      });
      transportFailed = false;
    } catch (error) {
      if (!isQuoterTransportError(error)) {
        throw error;
      }
      route = null;
      transportFailed = true;
    }
  }

  if (transportFailed && !route) {
    throw new QuoteTransportError(
      `Quote RPC failed for ${token.symbol || token.address}`,
    );
  }

  if (useSharedCache) {
    setCachedRoute(cacheKey, route);
  }
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

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
import { publicClient } from './tokens';
import type { WalletToken } from './types';

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

export async function quoteRouteToWld(
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

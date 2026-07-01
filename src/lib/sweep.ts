import { formatUnitsCapped } from './format-balance';
import {
  encodeFunctionData,
  getAddress,
  type Address,
  type Hex,
} from 'viem';
import { erc20Abi, permit2Abi, swapRouterAbi } from './abis';
import { isPermit2Allowlisted } from './allowlist';
import {
  MAX_TOKENS_PER_SWEEP,
  MIN_WLD_OUT_WEI,
  PERMIT2_ADDRESS,
  PLATFORM_FEE_BPS,
  PLATFORM_FEE_WALLET,
  SLIPPAGE_BPS,
  UNISWAP_V3_SWAP_ROUTER,
  WLD_ADDRESS,
} from './constants';
import { isForageableToken } from './token-filters';
import {
  applySlippage,
  deserializeRoute,
  encodeV3Path,
  quoteRouteToWld,
  type RouteQuote,
} from './swap-quotes';
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

async function resolveRoute(token: WalletToken): Promise<RouteQuote | null> {
  if (token.cachedRoute) {
    return deserializeRoute(token.cachedRoute);
  }

  return quoteRouteToWld(token);
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

  const candidates = tokens.filter((token) => isForageableToken(token));
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 60 * 10);
  const recipient = getAddress(walletAddress);
  const feeWallet = getAddress(PLATFORM_FEE_WALLET);

  const quotes: SweepQuote[] = [];
  const skippedTokens: BuildSweepResponse['skippedTokens'] = [];
  const transactions: BuildSweepResponse['transactions'] = [];
  let estimatedWldTotal = BigInt(0);

  for (const token of candidates) {
    if (quotes.length >= MAX_TOKENS_PER_SWEEP) {
      break;
    }

    if (!isPermit2Allowlisted(token.address)) {
      skippedTokens.push({
        address: token.address,
        symbol: token.symbol,
        reason: 'Token not allowlisted in Developer Portal (Permit2)',
      });
      continue;
    }

    const amountIn = BigInt(token.balance);
    if (amountIn <= BigInt(0)) {
      continue;
    }

    const route = await resolveRoute(token);

    if (!route) {
      skippedTokens.push({
        address: token.address,
        symbol: token.symbol,
        reason: 'No Uniswap V3 liquidity route to WLD',
      });
      continue;
    }

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

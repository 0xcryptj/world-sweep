import {
  decodeErrorResult,
  encodeFunctionData,
  formatUnits,
  getAddress,
  type Address,
} from 'viem';
import { erc20Abi, quoterV2Abi, swapRouterAbi } from './abis';
import {
  FEE_TIERS,
  MAX_TOKENS_PER_SWEEP,
  PLATFORM_FEE_BPS,
  PLATFORM_FEE_WALLET,
  SLIPPAGE_BPS,
  UNISWAP_V3_QUOTER_V2,
  UNISWAP_V3_SWAP_ROUTER,
  WLD_ADDRESS,
} from './constants';
import { publicClient } from './tokens';
import type { BuildSweepResponse, SweepQuote, WalletToken } from './types';

function applySlippage(amount: bigint, slippageBps: number): bigint {
  return (amount * BigInt(10_000 - slippageBps)) / BigInt(10_000);
}

const quoterErrorAbi = [
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

async function quoteTokenToWld(
  token: WalletToken,
): Promise<{ feeTier: number; amountOut: bigint } | null> {
  const amountIn = BigInt(token.balance);

  for (const feeTier of FEE_TIERS) {
    try {
      await publicClient.call({
        to: UNISWAP_V3_QUOTER_V2,
        data: encodeFunctionData({
          abi: quoterV2Abi,
          functionName: 'quoteExactInputSingle',
          args: [
            {
              tokenIn: token.address as Address,
              tokenOut: WLD_ADDRESS,
              amountIn,
              fee: feeTier,
              sqrtPriceLimitX96: BigInt(0),
            },
          ],
        }),
      });
    } catch (error) {
      const data = getRevertData(error);
      if (!data) {
        continue;
      }

      try {
        const decoded = decodeErrorResult({
          abi: quoterErrorAbi,
          data,
        });

        if (decoded.args[0] > BigInt(0)) {
          return { feeTier, amountOut: decoded.args[0] };
        }
      } catch {
        continue;
      }
    }
  }

  return null;
}

function getRevertData(error: unknown): `0x${string}` | null {
  if (!error || typeof error !== 'object') {
    return null;
  }

  const candidate = error as {
    data?: `0x${string}`;
    cause?: { data?: `0x${string}` };
    shortMessage?: string;
  };

  return candidate.data ?? candidate.cause?.data ?? null;
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
    const quote = await quoteTokenToWld(token);

    if (!quote) {
      skippedTokens.push({
        address: token.address,
        symbol: token.symbol,
        reason: 'No Uniswap V3 liquidity route to WLD',
      });
      continue;
    }

    const minWldOut = applySlippage(quote.amountOut, SLIPPAGE_BPS);
    estimatedWldTotal += minWldOut;

    quotes.push({
      tokenAddress: token.address,
      symbol: token.symbol,
      amountIn: token.balance,
      estimatedWldOut: quote.amountOut.toString(),
      minWldOut: minWldOut.toString(),
      feeTier: quote.feeTier,
    });

    transactions.push({
      to: UNISWAP_V3_SWAP_ROUTER,
      data: encodeFunctionData({
        abi: swapRouterAbi,
        functionName: 'exactInputSingle',
        args: [
          {
            tokenIn: token.address as Address,
            tokenOut: WLD_ADDRESS,
            fee: quote.feeTier,
            recipient,
            deadline,
            amountIn: BigInt(token.balance),
            amountOutMinimum: minWldOut,
            sqrtPriceLimitX96: BigInt(0),
          },
        ],
      }),
    });
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
    transactions.push({
      to: WLD_ADDRESS,
      data: encodeFunctionData({
        abi: erc20Abi,
        functionName: 'transfer',
        args: [feeWallet, platformFeeWld],
      }),
    });
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
  return `${formatUnits(BigInt(amount), 18)} WLD`;
}

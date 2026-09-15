export type WalletToken = {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  balance: string;
  balanceFormatted: string;
  logoUrl?: string | null;
  /** USD spot from DexScreener — display only, never a swap input. */
  priceUsd?: number | null;
  /** Dex pair liquidity in USD — market signal, never a swap input. */
  liquidityUsd?: number | null;
  /** 24h percent change from DexScreener — display only. */
  priceChange24h?: number | null;
  /** Serialized Uniswap route from the full liquidity scan. */
  cachedRoute?: CachedRouteQuote | null;
};

export type CachedRouteQuote = {
  hops: Array<{
    tokenIn: string;
    tokenOut: string;
    fee: number;
  }>;
  amountOut: string;
  label: string;
};

export type SweepQuote = {
  tokenAddress: string;
  symbol: string;
  amountIn: string;
  estimatedWldOut: string;
  minWldOut: string;
  feeTier: number;
  routeLabel: string;
};

export type SweepTransaction = {
  to: `0x${string}`;
  data: `0x${string}`;
  value?: string;
};

export type BuildSweepResponse = {
  quotes: SweepQuote[];
  skippedTokens: Array<{ address: string; symbol: string; reason: string }>;
  transactions: SweepTransaction[];
  estimatedWldTotal: string;
  platformFeeWld: string;
  userReceivesWld: string;
};

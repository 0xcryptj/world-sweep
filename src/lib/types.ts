export type WalletToken = {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  balance: string;
  balanceFormatted: string;
  logoUrl?: string | null;
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

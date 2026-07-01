export const WORLD_CHAIN_ID = 480;

export const RPC_URL =
  process.env.NEXT_PUBLIC_WORLDCHAIN_RPC_URL ??
  'https://worldchain-mainnet.g.alchemy.com/public';

export const WLD_ADDRESS =
  '0x2cFc85d8E48F8EAB294be644d9E25C3030863003' as const;

export const WETH_ADDRESS =
  '0x4200000000000000000000000000000000000006' as const;

export const USDC_ADDRESS =
  '0x79a02482a880bce3f13e09da970dc34db4cd24d1' as const;

export const WBTC_ADDRESS =
  '0x03c7054bcb39f7b2e5b2c7acb37583e32d70cfa3' as const;

export const PROTECTED_TOKEN_ADDRESSES = new Set([
  WLD_ADDRESS.toLowerCase(),
  WETH_ADDRESS.toLowerCase(),
  USDC_ADDRESS.toLowerCase(),
  WBTC_ADDRESS.toLowerCase(),
]);

export const UNISWAP_V3_QUOTER_V2 =
  '0x10158D43e6cc414deE1Bd1eB0EfC6a5cBCfF244c' as const;

// World Chain genesis Uniswap SwapRouter deployment.
export const UNISWAP_V3_SWAP_ROUTER =
  '0x091AD9e2e6e5eD44c1c66dB50e49A601F9f36cF6' as const;

export const PERMIT2_ADDRESS =
  '0x000000000022D473030F116dDEE9F6B43aC78BA3' as const;

export const PLATFORM_FEE_BPS = 500; // 5%

export const PLATFORM_FEE_WALLET =
  process.env.NEXT_PUBLIC_PLATFORM_FEE_WALLET ?? '';

export const FEE_TIERS = [500, 3000, 10_000] as const;

export const SLIPPAGE_BPS = 300; // 3%

export const MAX_TOKENS_PER_SWEEP = 4;

/** Minimum quoted WLD output (wei) for a swap to be included. */
export const MIN_WLD_OUT_WEI = BigInt('1000000000000'); // 0.000001 WLD

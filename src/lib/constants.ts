export const WORLD_CHAIN_ID = 480;

/**
 * Client-safe World Chain RPC. MUST stay keyless — this value is inlined into
 * client bundles (it is referenced by client components for userOp receipt
 * polling). Never put an API-keyed Alchemy URL in NEXT_PUBLIC_WORLDCHAIN_RPC_URL;
 * server code builds its own keyed endpoint from ALCHEMY_API_KEY (see tokens.ts).
 */
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

/**
 * World Chain tokens that are opted-in to being non-foragable regardless of
 * liquidity — rug pulls, scams, or tokens whose swap path griefs the batch in
 * ways the transferability sim doesn't catch. All lowercase addresses. Any
 * token on Worldchain not in this set is treated as foragable if it clears the
 * liquidity + transferability checks.
 */
export const MALICIOUS_TOKEN_ADDRESSES = new Set<string>([
  // Dust-pool / honeypot-style junk that still returns a tiny Uniswap quoter
  // amount but is not worth (or safe) to forage.
  '0x8206cecc0eede8c1f85ac1a1115ee42aa145befe', // MXT Mexico
  '0xa29b7a179adc80d628cc5a7c7a181920c2325762', // POTAS President Axo
  '0x8092511af4ecd82461e3f214cfe07261c16a7979', // $DNTB DONT BUY
]);

export const UNISWAP_V3_QUOTER_V2 =
  '0x10158D43e6cc414deE1Bd1eB0EfC6a5cBCfF244c' as const;

// World Chain genesis Uniswap SwapRouter02 deployment.
export const UNISWAP_V3_SWAP_ROUTER =
  '0x091AD9e2e6e5eD44c1c66dB50e49A601F9f36cF6' as const;

/**
 * World Chain ApprovalSwap helper — atomically approves the Uniswap router
 * then executes exactInputSingle. Prefer this for single-hop MiniKit batches so
 * World App only needs the helper (+ WLD fee transfer) as top-level `to`s.
 */
export const UNISWAP_APPROVAL_SWAP =
  '0xf4305dd6256dc2b0d07caaf2953688defbc86e9d' as const;

export const PERMIT2_ADDRESS =
  '0x000000000022D473030F116dDEE9F6B43aC78BA3' as const;

export const PLATFORM_FEE_BPS = 500; // 5%

export const PLATFORM_FEE_WALLET =
  process.env.NEXT_PUBLIC_PLATFORM_FEE_WALLET ?? '';

/** Include 100 (0.01%) — liquid World Chain bags often sit on that tier. */
export const FEE_TIERS = [500, 3_000, 10_000, 100] as const;

export const SLIPPAGE_BPS = 300; // 3%

export const MAX_TOKENS_PER_SWEEP = 4;

/**
 * Minimum quoted WLD output (wei) for a swap to count as forageable.
 * Dust honeypots (MXT/POTAS/DNTB et al) quote ~1e-5 WLD and are also blocked by
 * MALICIOUS_TOKEN_ADDRESSES. Keep this well above dust (~10×) but low enough
 * that real junk with thin-but-real Uniswap depth (often ~1e-3–1e-2 WLD) still
 * appears — a 0.01 WLD floor was falsely emptying the forageable list.
 */
export const MIN_WLD_OUT_WEI = BigInt('100000000000000'); // 0.0001 WLD

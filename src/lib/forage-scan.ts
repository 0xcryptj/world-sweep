import {
  isPermit2Allowlisted,
  KNOWN_LIQUID_PORTAL_TOKENS,
} from './allowlist';
import { mapPool } from './async-pool';
import { MIN_WLD_OUT_WEI, SLIPPAGE_BPS } from './constants';
import { tokenUsdValue } from './format-token-value';
import { withTimeout } from './fetch-with-timeout';
import { queuePortalAllowlistSync } from './portal-sync';
import {
  applySlippage,
  quoteRouteToWld,
  QuoteTransportError,
  serializeRoute,
  type RouteQuote,
} from './swap-quotes';
import {
  exclusionReasonLabel,
  getTokenExclusionReason,
  type TokenExclusionReason,
} from './token-filters';
import type { WalletToken } from './types';

export type LiquidityExclusionReason =
  | 'no_liquidity'
  | 'not_allowlisted'
  | 'output_too_small'
  | 'transfer_restricted'
  | 'honeypot'
  | 'allowlist_pending'
  | 'scan_deferred';

export type ScanExclusionReason = TokenExclusionReason | LiquidityExclusionReason;

export type ScannedExclusion = {
  address: string;
  symbol: string;
  name: string;
  decimals?: number;
  balance?: string;
  balanceFormatted: string;
  logoUrl?: string | null;
  priceUsd?: number | null;
  priceChange24h?: number | null;
  reason: ScanExclusionReason;
  reasonLabel: string;
};

export type ForageScanMode = 'fast' | 'full';

const SCAN_CONCURRENCY = {
  fast: process.env.VERCEL === '1' ? 10 : 18,
  full: process.env.VERCEL === '1' ? 8 : 16,
} as const;

const MAX_LIQUIDITY_SCAN_CANDIDATES = {
  /** Quote as many junk holdings as the budget allows. */
  fast: 48,
  full: 72,
} as const;

const DEFAULT_SCAN_BUDGET_MS = {
  fast: process.env.VERCEL === '1' ? 8_000 : 12_000,
  full: process.env.VERCEL === '1' ? 28_000 : 40_000,
} as const;

const PER_TOKEN_QUOTE_MS = {
  fast: 2_200,
  full: 3_200,
} as const;

function scanExclusionLabel(reason: ScanExclusionReason): string {
  switch (reason) {
    case 'no_liquidity':
      return 'No Uniswap route to WLD';
    case 'not_allowlisted':
    case 'allowlist_pending':
      return 'Verified — waiting on World App allowlist';
    case 'output_too_small':
      return 'Too little liquidity to WLD';
    case 'transfer_restricted':
      return 'Transfer blocked — cannot reach the router';
    case 'honeypot':
      return 'Unsafe / honeypot — sell path failed';
    case 'scan_deferred':
      return 'Still checking WLD route…';
    default:
      return exclusionReasonLabel(reason);
  }
}

function toExclusion(
  token: WalletToken,
  reason: ScanExclusionReason,
  reasonLabel?: string,
): ScannedExclusion {
  return {
    address: token.address,
    symbol: token.symbol,
    name: token.name,
    decimals: token.decimals,
    balance: token.balance,
    balanceFormatted: token.balanceFormatted,
    logoUrl: token.logoUrl,
    priceUsd: token.priceUsd,
    priceChange24h: token.priceChange24h,
    reason,
    reasonLabel: reasonLabel ?? scanExclusionLabel(reason),
  };
}

/**
 * Rank bags so liquid / known-market tokens get quoted before hyperinflation dust.
 * Raw wei sorting buried real tickers (ORO, SUSHI) under 1e24 meme balances.
 */
function balancePriorityScore(token: WalletToken): number {
  const formatted = Number(token.balanceFormatted);
  if (Number.isFinite(formatted) && formatted > 0) {
    if (formatted > 1e12) {
      return Math.log10(formatted) - 8;
    }
    return Math.log10(formatted + 1);
  }
  try {
    const raw = BigInt(token.balance);
    if (raw <= BigInt(0)) {
      return 0;
    }
    const decimals = Math.max(0, Math.min(36, token.decimals || 18));
    const whole = raw / BigInt(10) ** BigInt(decimals);
    const asNumber = Number(whole);
    if (!Number.isFinite(asNumber) || asNumber <= 0) {
      return 1;
    }
    if (asNumber > 1e12) {
      return Math.log10(asNumber) - 8;
    }
    return Math.log10(asNumber + 1);
  } catch {
    return 0;
  }
}

const knownLiquidSet = new Set(
  KNOWN_LIQUID_PORTAL_TOKENS.map((token) => token.address.toLowerCase()),
);

function compareScanCandidates(a: WalletToken, b: WalletToken): number {
  const aListed = isPermit2Allowlisted(a.address) ? 0 : 1;
  const bListed = isPermit2Allowlisted(b.address) ? 0 : 1;
  if (aListed !== bListed) {
    return aListed - bListed;
  }

  const aKnown = knownLiquidSet.has(a.address.toLowerCase()) ? 0 : 1;
  const bKnown = knownLiquidSet.has(b.address.toLowerCase()) ? 0 : 1;
  if (aKnown !== bKnown) {
    return aKnown - bKnown;
  }

  // DexScreener / Alchemy logos usually mean a real market exists.
  const aMarket = a.logoUrl ? 0 : 1;
  const bMarket = b.logoUrl ? 0 : 1;
  if (aMarket !== bMarket) {
    return aMarket - bMarket;
  }

  const aScore = balancePriorityScore(a);
  const bScore = balancePriorityScore(b);
  if (aScore !== bScore) {
    return bScore - aScore;
  }

  return a.symbol.localeCompare(b.symbol);
}

function holdingQty(token: WalletToken): number {
  const qty = Number(String(token.balanceFormatted).replace(/,/g, ''));
  return Number.isFinite(qty) && qty > 0 ? qty : 0;
}

function hasSpendableUsd(token: WalletToken): boolean {
  const usd = tokenUsdValue(token);
  if (usd != null && usd >= 0.01) {
    return true;
  }
  // Wrong decimals can shrink qty so USD looks like dust while Dex has a price.
  return (
    typeof token.priceUsd === 'number' &&
    token.priceUsd > 0 &&
    holdingQty(token) > 0
  );
}

function hasDexMarket(token: WalletToken): boolean {
  if (typeof token.priceUsd === 'number' && token.priceUsd > 0) {
    return true;
  }
  return typeof token.liquidityUsd === 'number' && token.liquidityUsd >= 1;
}

/** Allowlisted bag with a Dex/USD signal — must stay forageable even if the scan quote missed. */
function isValuedHolding(token: WalletToken): boolean {
  if (!isPermit2Allowlisted(token.address)) {
    return false;
  }
  return (
    hasSpendableUsd(token) ||
    hasDexMarket(token) ||
    knownLiquidSet.has(token.address.toLowerCase())
  );
}

async function quoteTokenLiquidity(
  token: WalletToken,
  mode: ForageScanMode,
): Promise<{
  route: RouteQuote | null;
  reason: LiquidityExclusionReason | null;
}> {
  // Pending-allowlist never enters the forage quoter — same path as build-sweep.
  if (!isPermit2Allowlisted(token.address)) {
    const looksVerified =
      knownLiquidSet.has(token.address.toLowerCase()) ||
      (typeof token.priceUsd === 'number' && token.priceUsd > 0) ||
      Boolean(token.logoUrl);
    return {
      route: null,
      reason: looksVerified ? 'allowlist_pending' : 'not_allowlisted',
    };
  }

  void mode;
  // Match preview/build: retry flakes. Fast used to skip retries and drop real bags.
  const route = await quoteRouteToWld(token, {
    skipRetry: false,
  });
  if (!route) {
    // Dex/USD-valued bags are not "no Uniswap route" — the quoter missed or
    // timed out. Keep them selectable and quote again at preview/build.
    return {
      route: null,
      reason: isValuedHolding(token) ? 'scan_deferred' : 'no_liquidity',
    };
  }

  const minWldOut = applySlippage(route.amountOut, SLIPPAGE_BPS);
  if (minWldOut < MIN_WLD_OUT_WEI) {
    return { route: null, reason: 'output_too_small' };
  }

  return { route, reason: null };
}

export type ScanWalletOptions = {
  budgetMs?: number;
  mode?: ForageScanMode;
};

/**
 * Splits wallet holdings into swappable tokens (verified Uniswap liquidity)
 * and excluded tokens (staked Re, protected, no route, etc.).
 */
export async function scanWalletForForage(
  tokens: WalletToken[],
  walletAddress: string | null = null,
  options?: ScanWalletOptions,
): Promise<{
  swappable: WalletToken[];
  excluded: ScannedExclusion[];
}> {
  const mode: ForageScanMode = options?.mode ?? 'full';
  const excluded: ScannedExclusion[] = [];
  const candidates: WalletToken[] = [];
  const budgetMs = options?.budgetMs ?? DEFAULT_SCAN_BUDGET_MS[mode];
  const startedAt = Date.now();
  void walletAddress;

  for (const token of tokens) {
    const staticReason = getTokenExclusionReason(token);
    if (staticReason) {
      excluded.push(toExclusion(token, staticReason));
      continue;
    }

    candidates.push(token);
  }

  candidates.sort(compareScanCandidates);

  let scanCandidates: WalletToken[];

  if (mode === 'fast') {
    const allowlisted = candidates.filter((token) =>
      isPermit2Allowlisted(token.address),
    );
    const knownLiquid = candidates.filter((token) =>
      knownLiquidSet.has(token.address.toLowerCase()),
    );
    const other = candidates.filter(
      (token) =>
        !isPermit2Allowlisted(token.address) &&
        !knownLiquidSet.has(token.address.toLowerCase()),
    );
    // Prefer market-known (logo) bags in the non-allowlisted slice.
    const marketOther = other.filter((token) => Boolean(token.logoUrl));
    const plainOther = other.filter((token) => !token.logoUrl);
    const merged = [
      ...allowlisted,
      ...knownLiquid,
      ...marketOther.slice(0, 24),
      ...plainOther.slice(0, 16),
    ];
    // Dedupe while preserving priority order.
    const seen = new Set<string>();
    scanCandidates = [];
    for (const token of merged) {
      const key = token.address.toLowerCase();
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      scanCandidates.push(token);
      if (scanCandidates.length >= MAX_LIQUIDITY_SCAN_CANDIDATES[mode]) {
        break;
      }
    }
  } else {
    // Always pin known-liquid bags into the full pass even if ranking buried them.
    const knownLiquid = candidates.filter((token) =>
      knownLiquidSet.has(token.address.toLowerCase()),
    );
    const rest = candidates.filter(
      (token) => !knownLiquidSet.has(token.address.toLowerCase()),
    );
    const merged = [...knownLiquid, ...rest];
    const seen = new Set<string>();
    scanCandidates = [];
    for (const token of merged) {
      const key = token.address.toLowerCase();
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      scanCandidates.push(token);
      if (scanCandidates.length >= MAX_LIQUIDITY_SCAN_CANDIDATES[mode]) {
        break;
      }
    }
  }

  const swappable: WalletToken[] = [];
  let budgetExhausted = false;

  // Quote-only during scan. Router transfer sims run in build-sweep — eth_call
  // transfer gates false-positive on liquid World Chain bags (SUSHI / ORO).
  const quoteResults = await mapPool(
    scanCandidates,
    SCAN_CONCURRENCY[mode],
    async (token) => {
      if (Date.now() - startedAt >= budgetMs) {
        budgetExhausted = true;
        return {
          token,
          route: null as RouteQuote | null,
          reason: 'scan_deferred' as LiquidityExclusionReason,
        };
      }

      try {
        const outcome = await withTimeout(
          quoteTokenLiquidity(token, mode),
          PER_TOKEN_QUOTE_MS[mode],
          `Token quote timed out for ${token.symbol}`,
        );
        return { token, ...outcome };
      } catch (error) {
        const transport =
          error instanceof QuoteTransportError ||
          /timed out|busy|rate|429|network/i.test(
            error instanceof Error ? error.message : String(error),
          );
        console.warn(
          `[forage-scan] ${transport ? 'deferring' : 'skipping'} ${token.symbol} after quote timeout/error`,
          error instanceof Error ? error.message : error,
        );
        return {
          token,
          route: null as RouteQuote | null,
          reason: 'scan_deferred' as LiquidityExclusionReason,
        };
      }
    },
  );

  const portalQueue: Array<{ address: string; symbol: string }> = [];

  for (const { token, route, reason } of quoteResults) {
    if (reason === 'allowlist_pending') {
      excluded.push(toExclusion(token, 'allowlist_pending'));
      portalQueue.push({ address: token.address, symbol: token.symbol });
      continue;
    }
    if (route) {
      swappable.push({
        ...token,
        cachedRoute: serializeRoute(route),
      });
      portalQueue.push({ address: token.address, symbol: token.symbol });
      continue;
    }
    if (reason === 'output_too_small') {
      excluded.push(toExclusion(token, 'output_too_small'));
      continue;
    }
    if (isValuedHolding(token)) {
      // Dex-valued bags stay visible as "still checking" — never "no Uniswap
      // route", and never selectable until a live quote exists so preview
      // counts match the built transaction.
      excluded.push(toExclusion(token, 'scan_deferred'));
      portalQueue.push({ address: token.address, symbol: token.symbol });
      continue;
    }
    if (reason === 'scan_deferred') {
      continue;
    }
    if (reason) {
      excluded.push(toExclusion(token, reason));
    }
  }

  const scannedAddresses = new Set(
    quoteResults.map((result) => result.token.address.toLowerCase()),
  );
  for (const token of candidates) {
    if (scannedAddresses.has(token.address.toLowerCase())) {
      continue;
    }
    if (!isValuedHolding(token)) {
      continue;
    }
    excluded.push(toExclusion(token, 'scan_deferred'));
    portalQueue.push({ address: token.address, symbol: token.symbol });
  }

  if (budgetExhausted) {
    console.warn(
      `[forage-scan] ${mode} budget ${budgetMs}ms exhausted — returning partial results (${swappable.length} forageable)`,
    );
  }

  // Always refresh the liquid-token portal queue (discovery + forageable finds).
  queuePortalAllowlistSync(
    portalQueue.map((token) => ({
      address: token.address,
      symbol: token.symbol,
    })),
  );

  return { swappable, excluded };
}

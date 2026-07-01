import { isPermit2Allowlisted } from './allowlist';
import { mapPool } from './async-pool';
import { MIN_WLD_OUT_WEI, SLIPPAGE_BPS } from './constants';
import {
  applySlippage,
  quoteRouteToWld,
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
  | 'output_too_small';

export type ScanExclusionReason = TokenExclusionReason | LiquidityExclusionReason;

export type ScannedExclusion = {
  address: string;
  symbol: string;
  name: string;
  balanceFormatted: string;
  logoUrl?: string | null;
  reason: ScanExclusionReason;
  reasonLabel: string;
};

const SCAN_CONCURRENCY = 16;
const MAX_LIQUIDITY_SCAN_CANDIDATES = 35;

function scanExclusionLabel(reason: ScanExclusionReason): string {
  switch (reason) {
    case 'no_liquidity':
      return 'No liquidity — cannot swap to WLD';
    case 'not_allowlisted':
      return 'Not allowlisted in Developer Portal';
    case 'output_too_small':
      return 'Output too small — not worth swapping';
    default:
      return exclusionReasonLabel(reason);
  }
}

async function scanTokenLiquidity(token: WalletToken): Promise<{
  route: RouteQuote | null;
  reason: LiquidityExclusionReason | null;
}> {
  if (!isPermit2Allowlisted(token.address)) {
    return { route: null, reason: 'not_allowlisted' };
  }

  const route = await quoteRouteToWld(token);
  if (!route) {
    return { route: null, reason: 'no_liquidity' };
  }

  const minWldOut = applySlippage(route.amountOut, SLIPPAGE_BPS);
  if (minWldOut < MIN_WLD_OUT_WEI) {
    return { route: null, reason: 'output_too_small' };
  }

  return { route, reason: null };
}

/**
 * Splits wallet holdings into swappable tokens (verified Uniswap liquidity)
 * and excluded tokens (staked Re, protected, no route, etc.).
 */
export async function scanWalletForForage(tokens: WalletToken[]): Promise<{
  swappable: WalletToken[];
  excluded: ScannedExclusion[];
}> {
  const excluded: ScannedExclusion[] = [];
  const candidates: WalletToken[] = [];

  for (const token of tokens) {
    const staticReason = getTokenExclusionReason(token);
    if (staticReason) {
      excluded.push({
        address: token.address,
        symbol: token.symbol,
        name: token.name,
        balanceFormatted: token.balanceFormatted,
        logoUrl: token.logoUrl,
        reason: staticReason,
        reasonLabel: scanExclusionLabel(staticReason),
      });
      continue;
    }

    candidates.push(token);
  }

  const scanCandidates = candidates.slice(0, MAX_LIQUIDITY_SCAN_CANDIDATES);
  const skippedCandidates = candidates.slice(MAX_LIQUIDITY_SCAN_CANDIDATES);

  for (const token of skippedCandidates) {
    excluded.push({
      address: token.address,
      symbol: token.symbol,
      name: token.name,
      balanceFormatted: token.balanceFormatted,
      logoUrl: token.logoUrl,
      reason: 'no_liquidity',
      reasonLabel: 'Not scanned — too many tokens (rescan after clearing others)',
    });
  }

  const swappable: WalletToken[] = [];

  const results = await mapPool(
    scanCandidates,
    SCAN_CONCURRENCY,
    async (token) => ({
      token,
      ...(await scanTokenLiquidity(token)),
    }),
  );

  for (const { token, route, reason } of results) {
    if (reason) {
      excluded.push({
        address: token.address,
        symbol: token.symbol,
        name: token.name,
        balanceFormatted: token.balanceFormatted,
        logoUrl: token.logoUrl,
        reason,
        reasonLabel: scanExclusionLabel(reason),
      });
      continue;
    }

    swappable.push({
      ...token,
      cachedRoute: route ? serializeRoute(route) : null,
    });
  }

  return { swappable, excluded };
}

import { isPermit2Allowlisted } from './allowlist';
import { MIN_WLD_OUT_WEI, SLIPPAGE_BPS } from './constants';
import { applySlippage, quoteRouteToWld } from './swap-quotes';
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
  reason: ScanExclusionReason;
  reasonLabel: string;
};

const SCAN_CONCURRENCY = 8;

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

async function getLiquidityExclusion(
  token: WalletToken,
): Promise<LiquidityExclusionReason | null> {
  if (!isPermit2Allowlisted(token.address)) {
    return 'not_allowlisted';
  }

  const route = await quoteRouteToWld(token);
  if (!route) {
    return 'no_liquidity';
  }

  const minWldOut = applySlippage(route.amountOut, SLIPPAGE_BPS);
  if (minWldOut < MIN_WLD_OUT_WEI) {
    return 'output_too_small';
  }

  return null;
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
        reason: staticReason,
        reasonLabel: scanExclusionLabel(staticReason),
      });
      continue;
    }

    candidates.push(token);
  }

  const swappable: WalletToken[] = [];

  for (let index = 0; index < candidates.length; index += SCAN_CONCURRENCY) {
    const batch = candidates.slice(index, index + SCAN_CONCURRENCY);
    const results = await Promise.all(
      batch.map(async (token) => ({
        token,
        liquidityReason: await getLiquidityExclusion(token),
      })),
    );

    for (const { token, liquidityReason } of results) {
      if (liquidityReason) {
        excluded.push({
          address: token.address,
          symbol: token.symbol,
          name: token.name,
          balanceFormatted: token.balanceFormatted,
          reason: liquidityReason,
          reasonLabel: scanExclusionLabel(liquidityReason),
        });
      } else {
        swappable.push(token);
      }
    }
  }

  return { swappable, excluded };
}

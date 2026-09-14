import { formatUnits } from 'viem';
import type { WalletToken } from './types';

function quoteWldToUsd(
  amountOutWei: string | null | undefined,
  wldUsd?: number | null,
): number | null {
  if (!amountOutWei || wldUsd == null || !Number.isFinite(wldUsd) || wldUsd <= 0) {
    return null;
  }
  try {
    const value = Number(formatUnits(BigInt(amountOutWei), 18)) * wldUsd;
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

export function tokenUsdValue(
  token: {
    balanceFormatted: string;
    priceUsd?: number | null;
    cachedRoute?: { amountOut?: string } | null;
    quoteWldWei?: string | null;
  },
  wldUsd?: number | null,
): number | null {
  if (token.priceUsd != null && Number.isFinite(token.priceUsd) && token.priceUsd > 0) {
    const qty = Number(String(token.balanceFormatted).replace(/,/g, ''));
    if (Number.isFinite(qty) && qty > 0) {
      const value = token.priceUsd * qty;
      if (Number.isFinite(value) && value > 0) {
        return value;
      }
    }
  }

  return quoteWldToUsd(
    token.quoteWldWei ?? token.cachedRoute?.amountOut,
    wldUsd,
  );
}
export function formatTokenUsd(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value) || value <= 0) {
    return '';
  }
  if (value < 0.01) {
    return '<$0.01';
  }
  return `$${value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatPctChange(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) {
    return '';
  }
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

export function tokenMarketUsd(
  token: Pick<WalletToken, 'balanceFormatted' | 'priceUsd' | 'cachedRoute'>,
  wldUsd?: number | null,
) {
  return formatTokenUsd(tokenUsdValue(token, wldUsd));
}

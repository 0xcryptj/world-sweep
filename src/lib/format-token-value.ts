import type { WalletToken } from './types';

export function tokenUsdValue(token: {
  balanceFormatted: string;
  priceUsd?: number | null;
}): number | null {
  if (token.priceUsd == null || !Number.isFinite(token.priceUsd) || token.priceUsd <= 0) {
    return null;
  }
  const qty = Number(String(token.balanceFormatted).replace(/,/g, ''));
  if (!Number.isFinite(qty) || qty <= 0) {
    return null;
  }
  const value = token.priceUsd * qty;
  return Number.isFinite(value) ? value : null;
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

export function tokenMarketUsd(token: Pick<WalletToken, 'balanceFormatted' | 'priceUsd'>) {
  return formatTokenUsd(tokenUsdValue(token));
}

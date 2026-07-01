import type { RouteQuote } from './swap-quotes';

import type { ScannedExclusion } from './forage-scan';
import type { WalletToken } from './types';

type CacheEntry = {
  route: RouteQuote | null;
  expires: number;
};

const routeCache = new Map<string, CacheEntry>();

const DEFAULT_TTL_MS = 120_000;

export function routeCacheKey(address: string, balance: string): string {
  return `${address.toLowerCase()}:${balance}`;
}

export function getCachedRoute(key: string): RouteQuote | null | undefined {
  const entry = routeCache.get(key);
  if (!entry) {
    return undefined;
  }

  if (Date.now() > entry.expires) {
    routeCache.delete(key);
    return undefined;
  }

  return entry.route;
}

export function setCachedRoute(
  key: string,
  route: RouteQuote | null,
  ttlMs = DEFAULT_TTL_MS,
): void {
  routeCache.set(key, {
    route,
    expires: Date.now() + ttlMs,
  });
}

type WalletScanResult = {
  tokens: WalletToken[];
  excluded: ScannedExclusion[];
};

const walletScanCache = new Map<
  string,
  { result: WalletScanResult; expires: number }
>();

export function getCachedWalletScan(
  walletAddress: string,
): WalletScanResult | undefined {
  const entry = walletScanCache.get(walletAddress.toLowerCase());
  if (!entry) {
    return undefined;
  }

  if (Date.now() > entry.expires) {
    walletScanCache.delete(walletAddress.toLowerCase());
    return undefined;
  }

  return entry.result;
}

export function setCachedWalletScan(
  walletAddress: string,
  result: WalletScanResult,
  ttlMs = 60_000,
): void {
  walletScanCache.set(walletAddress.toLowerCase(), {
    result,
    expires: Date.now() + ttlMs,
  });
}

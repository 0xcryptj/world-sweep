import type { RouteQuote } from './swap-quotes';

import type { ScannedExclusion } from './forage-scan';
import type { WalletToken } from './types';

type CacheEntry = {
  route: RouteQuote | null;
  expires: number;
};

const routeCache = new Map<string, CacheEntry>();

const DEFAULT_TTL_MS = 120_000;

/** `first` = fast-scan firstSuccess; `best` = full best-of tiers (build-sweep). */
export type RouteQuoteStrategy = 'first' | 'best';

export function routeCacheKey(
  address: string,
  balance: string,
  strategy: RouteQuoteStrategy = 'best',
): string {
  return `${address.toLowerCase()}:${balance}:${strategy}`;
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

/** Positive quotes stay warm; nulls expire fast so RPC flakes don't poison scan. */
const NULL_ROUTE_TTL_MS = 15_000;

export function setCachedRoute(
  key: string,
  route: RouteQuote | null,
  ttlMs = DEFAULT_TTL_MS,
): void {
  const existing = routeCache.get(key);
  if (existing && Date.now() <= existing.expires && existing.route) {
    // Never let a timeout miss or a worse retry replace a warm positive quote.
    if (!route) {
      return;
    }
    if (route.amountOut < existing.route.amountOut) {
      return;
    }
  }

  routeCache.set(key, {
    route,
    expires: Date.now() + (route === null ? Math.min(ttlMs, NULL_ROUTE_TTL_MS) : ttlMs),
  });
}

const inflightRoutes = new Map<string, Promise<RouteQuote | null>>();

export function getInflightRoute(
  key: string,
): Promise<RouteQuote | null> | undefined {
  return inflightRoutes.get(key);
}

export function setInflightRoute(
  key: string,
  promise: Promise<RouteQuote | null>,
): void {
  inflightRoutes.set(key, promise);
  void promise.finally(() => {
    if (inflightRoutes.get(key) === promise) {
      inflightRoutes.delete(key);
    }
  });
}

type WalletScanResult = {
  tokens: WalletToken[];
  excluded: ScannedExclusion[];
  mode?: string;
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

export function clearCachedWalletScan(walletAddress?: string): void {
  if (!walletAddress) {
    walletScanCache.clear();
    return;
  }
  walletScanCache.delete(walletAddress.toLowerCase());
}

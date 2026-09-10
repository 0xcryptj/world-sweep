import 'server-only';

import { fetchWldBalance } from './balance';
import { cacheDelete, cacheGet, cacheGetOrLoad, cacheSet } from './data-cache';
import { withTimeout } from './fetch-with-timeout';
import {
  scanWalletForForage,
  type ForageScanMode,
  type ScannedExclusion,
} from './forage-scan';
import { loadDynamicAllowlistAddresses } from './portal-allowlist-store';
import {
  clearCachedWalletScan,
  getCachedWalletScan,
  setCachedWalletScan,
} from './quote-cache';
import { fetchAllWalletTokens, enrichTokenMetadata } from './tokens';
import { formatUnitsCapped } from './format-balance';
import { WLD_ADDRESS } from './constants';
import type { WalletToken } from './types';

function formatBalanceKeepRaw(
  token: WalletToken,
  meta: WalletToken,
): string {
  try {
    return formatUnitsCapped(BigInt(token.balance), meta.decimals);
  } catch {
    return meta.balanceFormatted || token.balanceFormatted;
  }
}

const HOLDINGS_NS = 'wallet-holdings';
const ALLOWLIST_NS = 'portal-allowlist';
const WLD_NS = 'wld-balance';

/** Fresh holdings stay hot briefly; stale covers wallet panel / chip opens. */
const HOLDINGS_FRESH_MS = 20_000;
const HOLDINGS_STALE_MS = 90_000;

const ALLOWLIST_FRESH_MS = 60_000;
const ALLOWLIST_STALE_MS = 5 * 60_000;

const WLD_FRESH_MS = 15_000;
const WLD_STALE_MS = 60_000;

const HOLDINGS_TIMEOUT_MS = 14_000;
const SCAN_TIMEOUT_MS = {
  fast: 12_000,
  full: 38_000,
} as const;
const SCAN_BUDGET_MS = {
  fast: 9_000,
  full: 32_000,
} as const;

const SCAN_HIT_TTL_MS = {
  fast: 45_000,
  full: 90_000,
} as const;
const SCAN_EMPTY_TTL_MS = {
  fast: 15_000,
  full: 30_000,
} as const;

export type ForageScanPayload = {
  tokens: WalletToken[];
  excluded: ScannedExclusion[];
  mode: ForageScanMode;
};

type WldBalanceValue = {
  balance: bigint;
  balanceFormatted: string;
  symbol: string;
};

function scanCacheKey(walletAddress: string, mode: ForageScanMode): string {
  return `${walletAddress.toLowerCase()}:${mode}`;
}

function wldFromHoldings(holdings: WalletToken[]): WldBalanceValue | null {
  const wld = holdings.find(
    (token) => token.address.toLowerCase() === WLD_ADDRESS.toLowerCase(),
  );
  if (!wld) {
    return {
      balance: BigInt(0),
      balanceFormatted: '0',
      symbol: 'WLD',
    };
  }
  try {
    return {
      balance: BigInt(wld.balance),
      balanceFormatted: wld.balanceFormatted,
      symbol: 'WLD',
    };
  } catch {
    return {
      balance: BigInt(0),
      balanceFormatted: wld.balanceFormatted || '0',
      symbol: 'WLD',
    };
  }
}

/** Seed the WLD cache from a full ERC-20 holdings list so /balance skips a second Alchemy call. */
function seedWldCacheFromHoldings(
  walletAddress: string,
  holdings: WalletToken[],
): void {
  const derived = wldFromHoldings(holdings);
  if (!derived) {
    return;
  }
  cacheSet(WLD_NS, walletAddress, derived, WLD_FRESH_MS, WLD_STALE_MS);
}

export function bustWalletDataCaches(walletAddress: string): void {
  const key = walletAddress.toLowerCase();
  cacheDelete(HOLDINGS_NS, key);
  cacheDelete(WLD_NS, key);
  clearCachedWalletScan(walletAddress);
  clearCachedWalletScan(scanCacheKey(walletAddress, 'fast'));
  clearCachedWalletScan(scanCacheKey(walletAddress, 'full'));
}

export async function loadAllowlistOverlayCached(): Promise<string[]> {
  const { value } = await cacheGetOrLoad(
    ALLOWLIST_NS,
    'dynamic',
    () => loadDynamicAllowlistAddresses().catch(() => [] as string[]),
    { freshMs: ALLOWLIST_FRESH_MS, staleMs: ALLOWLIST_STALE_MS },
  );
  return value;
}

export async function loadWalletHoldingsCached(
  walletAddress: string,
  options?: { force?: boolean; maxEnrich?: number; enrichMetadata?: boolean },
): Promise<{ holdings: WalletToken[]; fromCache: boolean; stale: boolean }> {
  const maxEnrich = options?.maxEnrich ?? 48;
  const enrichMetadata = options?.enrichMetadata !== false;
  const { value, fromCache, stale } = await cacheGetOrLoad(
    HOLDINGS_NS,
    walletAddress,
    async () => {
      const holdings = await withTimeout(
        fetchAllWalletTokens(walletAddress, { maxEnrich, enrichMetadata }),
        HOLDINGS_TIMEOUT_MS,
        'Loading token balances timed out. Tap Rescan Wallet to try again.',
      );
      seedWldCacheFromHoldings(walletAddress, holdings);
      return holdings;
    },
    {
      freshMs: HOLDINGS_FRESH_MS,
      staleMs: HOLDINGS_STALE_MS,
      force: options?.force,
    },
  );
  // Cache hits also keep the chip warm without another Token API call.
  if (fromCache && !options?.force) {
    seedWldCacheFromHoldings(walletAddress, value);
  }
  return { holdings: value, fromCache, stale };
}

export async function loadWldBalanceCached(
  walletAddress: string,
  options?: { force?: boolean },
) {
  if (!options?.force) {
    // Prefer a fresh WLD entry seeded from holdings (one Alchemy balances call).
    const cachedWld = cacheGet<WldBalanceValue>(WLD_NS, walletAddress);
    if (cachedWld.hit && !cachedWld.stale) {
      return { value: cachedWld.value, fromCache: true, stale: false };
    }

    const holdingsLookup = cacheGet<WalletToken[]>(HOLDINGS_NS, walletAddress);
    if (holdingsLookup.hit) {
      const derived = wldFromHoldings(holdingsLookup.value);
      if (derived) {
        cacheSet(
          WLD_NS,
          walletAddress,
          derived,
          WLD_FRESH_MS,
          WLD_STALE_MS,
        );
        return {
          value: derived,
          fromCache: true,
          stale: holdingsLookup.stale,
        };
      }
    }
  }

  return cacheGetOrLoad(
    WLD_NS,
    walletAddress,
    () => fetchWldBalance(walletAddress),
    {
      freshMs: WLD_FRESH_MS,
      staleMs: WLD_STALE_MS,
      force: options?.force,
    },
  );
}

/**
 * Home forage scan: memory-first.
 * `fast` = allowlisted direct quotes only (instant paint).
 * `full` = bridges + transfer checks (background / Rescan).
 */
export async function loadForageScanCached(
  walletAddress: string,
  options?: { force?: boolean; mode?: ForageScanMode },
): Promise<
  ForageScanPayload & { fromCache: boolean; holdingsStale: boolean }
> {
  const mode: ForageScanMode = options?.mode ?? 'full';
  await loadAllowlistOverlayCached();

  const keyed = scanCacheKey(walletAddress, mode);

  if (options?.force) {
    if (mode === 'full') {
      bustWalletDataCaches(walletAddress);
    } else {
      clearCachedWalletScan(keyed);
      clearCachedWalletScan(walletAddress);
      cacheDelete(HOLDINGS_NS, walletAddress);
    }
  } else {
    // Mode-scoped cache only. Do not let a fast hit short-circuit a full pass
    // via the legacy wallet key — full still needs to quote more + transfer-check.
    const cached = getCachedWalletScan(keyed);
    if (cached) {
      return {
        ...cached,
        mode: (cached as ForageScanPayload).mode ?? mode,
        fromCache: true,
        holdingsStale: false,
      };
    }
    if (mode === 'fast') {
      const fullCached = getCachedWalletScan(
        scanCacheKey(walletAddress, 'full'),
      );
      if (fullCached) {
        return {
          ...fullCached,
          mode: 'full',
          fromCache: true,
          holdingsStale: false,
        };
      }
      const legacy = getCachedWalletScan(walletAddress);
      if (legacy) {
        return {
          ...legacy,
          mode: (legacy as ForageScanPayload).mode ?? mode,
          fromCache: true,
          holdingsStale: false,
        };
      }
    }
  }

  const { holdings, stale: holdingsStale } = await loadWalletHoldingsCached(
    walletAddress,
    {
      force: Boolean(options?.force),
      // Fast path: lighter metadata so quotes start sooner.
      maxEnrich: mode === 'fast' ? 36 : 72,
      enrichMetadata: true,
    },
  );

  const { swappable, excluded } = await withTimeout(
    scanWalletForForage(holdings, walletAddress, {
      budgetMs: SCAN_BUDGET_MS[mode],
      mode,
    }),
    SCAN_TIMEOUT_MS[mode],
    'Liquidity scan timed out. Tap Rescan Wallet to try again.',
  );

  // Guarantee display metadata on forageable + a slice of visible junk.
  // Cap excluded enrich so DexScreener fan-out cannot starve the response.
  // Skip tokens holdings already enriched (real symbol/name/logo) — avoid a
  // second Alchemy metadata + DexScreener pass for the same addresses.
  const holdingsMeta = new Map(
    holdings.map((token) => [token.address.toLowerCase(), token]),
  );
  const needsMetadataEnrich = (token: {
    address: string;
    symbol?: string;
    name?: string;
    logoUrl?: string | null;
  }) => {
    const fromHoldings = holdingsMeta.get(token.address.toLowerCase());
    const symbol = fromHoldings?.symbol ?? token.symbol;
    const name = fromHoldings?.name ?? token.name;
    const logoUrl = fromHoldings?.logoUrl ?? token.logoUrl;
    if (
      logoUrl &&
      symbol &&
      !/^unknown$/i.test(symbol) &&
      !/^0x[a-f0-9]{4}…/i.test(symbol) &&
      !/^unknown(\s+token)?$/i.test(name ?? '') &&
      !/^token$/i.test(name ?? '')
    ) {
      return false;
    }
    return (
      !logoUrl ||
      !symbol ||
      /^unknown$/i.test(symbol) ||
      /^0x[a-f0-9]{4}…/i.test(symbol) ||
      /^unknown(\s+token)?$/i.test(name ?? '') ||
      /^token$/i.test(name ?? '')
    );
  };

  const visibleExcluded = excluded.filter(
    (token) =>
      token.reason !== 'protected' &&
      token.reason !== 'zero_balance' &&
      token.reason !== 'staked_re' &&
      token.reason !== 'scan_deferred',
  );
  const enrichTargets: WalletToken[] = [
    ...swappable,
    ...(mode === 'fast' ? [] : visibleExcluded.slice(0, 16)).map(
      (token) => {
        const fromHoldings = holdingsMeta.get(token.address.toLowerCase());
        return {
          address: token.address,
          symbol: fromHoldings?.symbol ?? token.symbol,
          name: fromHoldings?.name ?? token.name,
          decimals: fromHoldings?.decimals ?? 18,
          balance: fromHoldings?.balance ?? '0',
          balanceFormatted:
            fromHoldings?.balanceFormatted ?? token.balanceFormatted,
          logoUrl: fromHoldings?.logoUrl ?? token.logoUrl,
        } satisfies WalletToken;
      },
    ),
  ].filter(needsMetadataEnrich);

  // Prefer holdings metadata even when we skip a second Alchemy enrich pass.
  let enrichedSwappable = swappable.map((token) => {
    const meta = holdingsMeta.get(token.address.toLowerCase());
    if (!meta) {
      return token;
    }
    return {
      ...token,
      symbol: meta.symbol || token.symbol,
      name: meta.name || token.name,
      decimals: meta.decimals || token.decimals,
      logoUrl: meta.logoUrl ?? token.logoUrl,
      balanceFormatted: formatBalanceKeepRaw(token, meta),
    };
  });
  let enrichedExcluded = excluded.map((token) => {
    const meta = holdingsMeta.get(token.address.toLowerCase());
    if (!meta) {
      return token;
    }
    return {
      ...token,
      symbol: meta.symbol || token.symbol,
      name: meta.name || token.name,
      logoUrl: meta.logoUrl ?? token.logoUrl,
    };
  });
  if (enrichTargets.length > 0) {
    const enriched = await enrichTokenMetadata(enrichTargets);
    const byAddress = new Map(
      enriched.map((token) => [token.address.toLowerCase(), token]),
    );
    enrichedSwappable = enrichedSwappable.map((token) => {
      const meta = byAddress.get(token.address.toLowerCase());
      return meta
        ? {
            ...token,
            symbol: meta.symbol,
            name: meta.name,
            decimals: meta.decimals,
            logoUrl: meta.logoUrl ?? token.logoUrl,
            balanceFormatted: formatBalanceKeepRaw(token, meta),
          }
        : token;
    });
    enrichedExcluded = enrichedExcluded.map((token) => {
      const meta = byAddress.get(token.address.toLowerCase());
      return meta
        ? {
            ...token,
            symbol: meta.symbol,
            name: meta.name,
            logoUrl: meta.logoUrl ?? token.logoUrl,
          }
        : token;
    });
  }

  const payload: ForageScanPayload = {
    tokens: enrichedSwappable,
    excluded: enrichedExcluded,
    mode,
  };

  // Never let a starved full pass replace a warm forageable list with [].
  if (enrichedSwappable.length === 0 && mode === 'full' && !options?.force) {
    const previous =
      getCachedWalletScan(scanCacheKey(walletAddress, 'fast')) ??
      getCachedWalletScan(walletAddress);
    if (previous?.tokens?.length) {
      return {
        tokens: previous.tokens,
        excluded: enrichedExcluded.length
          ? enrichedExcluded
          : previous.excluded,
        mode: 'full',
        fromCache: true,
        holdingsStale,
      };
    }
  }

  const ttl =
    enrichedSwappable.length > 0
      ? SCAN_HIT_TTL_MS[mode]
      : SCAN_EMPTY_TTL_MS[mode];
  setCachedWalletScan(keyed, payload, ttl);
  // Keep legacy key warm for /wallet forageable labels.
  if (mode === 'full' || enrichedSwappable.length > 0) {
    setCachedWalletScan(walletAddress, payload, ttl);
  }

  return { ...payload, fromCache: false, holdingsStale };
}

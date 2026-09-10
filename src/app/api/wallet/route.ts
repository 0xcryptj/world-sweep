import {
  bustWalletDataCaches,
  loadAllowlistOverlayCached,
  loadForageScanCached,
  loadWalletHoldingsCached,
  loadWldBalanceCached,
} from '@/lib/wallet-data';
import { WLD_ADDRESS } from '@/lib/constants';
import { getCachedWalletScan } from '@/lib/quote-cache';
import { sanitizeErrorMessage } from '@/lib/safe-error';
import { clientKeyFromRequest, rateLimit } from '@/lib/rate-limit';
import type { WalletToken } from '@/lib/types';
import { NextResponse } from 'next/server';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const limit = rateLimit(
    `wallet:${clientKeyFromRequest(request)}`,
    40,
    60_000,
  );
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Too many requests. Slow down and try again.' },
      {
        status: 429,
        headers: {
          'Retry-After': String(Math.ceil(limit.retryAfterMs / 1000)),
        },
      },
    );
  }

  const { searchParams } = new URL(request.url);
  const address = searchParams.get('address');
  const refresh = searchParams.get('refresh') === '1';

  if (!address) {
    return NextResponse.json(
      { error: 'Missing wallet address' },
      { status: 400 },
    );
  }

  try {
    if (refresh) {
      bustWalletDataCaches(address);
    }

    await loadAllowlistOverlayCached();

    // Holdings first so WLD can be derived from the same Token API response.
    const holdingsResult = await loadWalletHoldingsCached(address, {
      force: refresh,
      maxEnrich: 48,
    });
    // Never force a second Alchemy balances call — holdings just seeded WLD.
    const wldResult = await loadWldBalanceCached(address);

    const cachedScan = refresh ? undefined : getCachedWalletScan(address);
    let forageableByAddress: Map<string, WalletToken>;
    let scanFromCache = Boolean(cachedScan);

    if (cachedScan) {
      forageableByAddress = new Map(
        cachedScan.tokens.map((token) => [
          token.address.toLowerCase(),
          token,
        ]),
      );
    } else {
      // Holdings already warmed above — do not force-bust again or we pay
      // Alchemy twice on Rescan. Scan cache was cleared when refresh=1.
      const scan = await loadForageScanCached(address, { force: false });
      forageableByAddress = new Map(
        scan.tokens.map((token) => [token.address.toLowerCase(), token]),
      );
      scanFromCache = scan.fromCache;
    }

    const tokens = holdingsResult.holdings.map((token) => {
      const matched = forageableByAddress.get(token.address.toLowerCase());
      if (!matched?.cachedRoute) {
        return token;
      }
      return { ...token, cachedRoute: matched.cachedRoute };
    });

    const wldFromList =
      tokens.find(
        (token) => token.address.toLowerCase() === WLD_ADDRESS.toLowerCase(),
      ) ?? null;

    const cacheParts = [
      wldResult.fromCache ? 'wld' : null,
      holdingsResult.fromCache ? 'holdings' : null,
      scanFromCache ? 'scan' : null,
    ].filter(Boolean);

    return NextResponse.json(
      {
        tokens,
        forageableAddresses: [...forageableByAddress.keys()],
        wldBalance:
          wldResult.value.balanceFormatted ||
          wldFromList?.balanceFormatted ||
          '0',
        wldSymbol: wldResult.value.symbol,
        tokenCount: tokens.length,
        forageableCount: forageableByAddress.size,
      },
      {
        headers: {
          'Cache-Control': 'private, max-age=0, stale-while-revalidate=30',
          'X-Forager-Cache': cacheParts.length > 0 ? cacheParts.join('+') : 'MISS',
        },
      },
    );
  } catch (error) {
    const rawMessage = error instanceof Error ? error.message : '';
    const message = sanitizeErrorMessage(
      error,
      "Couldn't load your balances. Tap retry in a moment.",
    );

    if (rawMessage.includes('timed out')) {
      return NextResponse.json({ error: message }, { status: 504 });
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}

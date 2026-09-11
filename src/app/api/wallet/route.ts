import {
  bustWalletDataCaches,
  loadAllowlistOverlayCached,
  loadWalletHoldingsCached,
  loadWldBalanceCached,
  peekForageScanCache,
} from '@/lib/wallet-data';
import { WLD_ADDRESS } from '@/lib/constants';
import { sanitizeErrorMessage } from '@/lib/safe-error';
import { clientKeyFromRequest, rateLimit } from '@/lib/rate-limit';
import type { WalletToken } from '@/lib/types';
import { NextResponse } from 'next/server';

export const maxDuration = 30;
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

    // Holdings + overlay in parallel. Do NOT wait on a forage scan —
    // Sweep owns fast/full quoting; this route only paints balances.
    const [holdingsResult] = await Promise.all([
      loadWalletHoldingsCached(address, {
        force: refresh,
        maxEnrich: 24,
      }),
      loadAllowlistOverlayCached(),
    ]);
    const wldResult = await loadWldBalanceCached(address);

    const cachedScan = peekForageScanCache(address);
    const forageableByAddress = new Map<string, WalletToken>(
      (cachedScan?.tokens ?? []).map((token) => [
        token.address.toLowerCase(),
        token,
      ]),
    );
    const pendingAllowlistAddresses = (cachedScan?.excluded ?? [])
      .filter((token) => token.reason === 'allowlist_pending')
      .map((token) => token.address.toLowerCase());

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
      cachedScan ? 'scan' : null,
    ].filter(Boolean);

    return NextResponse.json(
      {
        tokens,
        forageableAddresses: [...forageableByAddress.keys()],
        pendingAllowlistAddresses,
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

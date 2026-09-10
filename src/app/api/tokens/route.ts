import { loadForageScanCached } from '@/lib/wallet-data';
import { sanitizeErrorMessage } from '@/lib/safe-error';
import type { ForageScanMode } from '@/lib/forage-scan';
import { clientKeyFromRequest, rateLimit } from '@/lib/rate-limit';
import { NextResponse } from 'next/server';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  // Quoter-heavy route — brake retry storms that burn Alchemy CU.
  const limit = rateLimit(
    `tokens:${clientKeyFromRequest(request)}`,
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
  const modeParam = searchParams.get('mode');
  const mode: ForageScanMode =
    modeParam === 'full' || modeParam === 'fast' ? modeParam : 'fast';

  if (!address) {
    return NextResponse.json(
      { error: 'Missing wallet address' },
      { status: 400 },
    );
  }

  try {
    const result = await loadForageScanCached(address, {
      force: refresh,
      mode,
    });
    const payload = {
      tokens: result.tokens,
      excluded: result.excluded,
      mode: result.mode,
    };

    return NextResponse.json(payload, {
      headers: {
        'Cache-Control': 'private, max-age=0, stale-while-revalidate=30',
        'X-Forager-Cache': result.fromCache
          ? 'HIT'
          : result.holdingsStale
            ? 'HOLDINGS-STALE'
            : 'MISS',
        'X-Forager-Scan-Mode': result.mode,
      },
    });
  } catch (error) {
    const rawMessage = error instanceof Error ? error.message : '';
    const message = sanitizeErrorMessage(
      error,
      "Couldn't scan your wallet. Tap Rescan to try again.",
    );

    if (rawMessage.includes('timed out')) {
      return NextResponse.json({ error: message }, { status: 504 });
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}

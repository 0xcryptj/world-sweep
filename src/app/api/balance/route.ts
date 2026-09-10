import { loadWldBalanceCached } from '@/lib/wallet-data';
import { sanitizeErrorMessage } from '@/lib/safe-error';
import { NextResponse } from 'next/server';

export const maxDuration = 30;
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
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
    const { value: wld, fromCache } = await loadWldBalanceCached(address, {
      force: refresh,
    });
    return NextResponse.json(
      {
        wldBalance: wld.balanceFormatted,
        wldSymbol: wld.symbol,
        wldBalanceWei: wld.balance.toString(),
      },
      {
        headers: {
          'Cache-Control': 'private, max-age=0, stale-while-revalidate=30',
          'X-Forager-Cache': fromCache ? 'HIT' : 'MISS',
        },
      },
    );
  } catch (error) {
    const message = sanitizeErrorMessage(
      error,
      "Couldn't load your WLD balance.",
    );
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

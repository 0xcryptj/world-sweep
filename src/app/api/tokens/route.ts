import { scanWalletForForage } from '@/lib/forage-scan';
import {
  getCachedWalletScan,
  setCachedWalletScan,
} from '@/lib/quote-cache';
import { fetchWalletTokensWithLogos } from '@/lib/wallet-tokens.server';
import { NextResponse } from 'next/server';

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
    if (!refresh) {
      const cached = getCachedWalletScan(address);
      if (cached) {
        return NextResponse.json(cached);
      }
    }

    const holdings = await fetchWalletTokensWithLogos(address);
    const { swappable, excluded } = await scanWalletForForage(holdings);
    const payload = { tokens: swappable, excluded };

    setCachedWalletScan(address, payload);

    return NextResponse.json(payload);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to load tokens';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

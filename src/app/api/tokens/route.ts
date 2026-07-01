import { scanWalletForForage } from '@/lib/forage-scan';
import { fetchAllWalletTokens } from '@/lib/tokens';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const address = searchParams.get('address');

  if (!address) {
    return NextResponse.json(
      { error: 'Missing wallet address' },
      { status: 400 },
    );
  }

  try {
    const holdings = await fetchAllWalletTokens(address);
    const { swappable, excluded } = await scanWalletForForage(holdings);

    return NextResponse.json({ tokens: swappable, excluded });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to load tokens';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

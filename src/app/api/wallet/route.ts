import { fetchWalletTokensWithLogos } from '@/lib/wallet-tokens.server';
import { isForageableToken } from '@/lib/token-filters';
import { WLD_ADDRESS } from '@/lib/constants';
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
    const tokens = await fetchWalletTokensWithLogos(address);
    const wld =
      tokens.find(
        (token) => token.address.toLowerCase() === WLD_ADDRESS.toLowerCase(),
      ) ?? null;
    const forageableCount = tokens.filter(isForageableToken).length;

    return NextResponse.json({
      tokens,
      wldBalance: wld?.balanceFormatted ?? '0',
      wldSymbol: wld?.symbol ?? 'WLD',
      tokenCount: tokens.length,
      forageableCount,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to load wallet';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

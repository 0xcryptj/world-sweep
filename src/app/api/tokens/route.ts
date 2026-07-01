import { NextResponse } from 'next/server';
import { fetchWalletTokens } from '@/lib/tokens';

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
    const tokens = await fetchWalletTokens(address);
    return NextResponse.json({ tokens });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to load tokens';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

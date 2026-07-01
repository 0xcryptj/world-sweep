import { fetchAlchemyTokenMetadata } from '@/lib/tokens';
import { getAddress, isAddress } from 'viem';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const addressParam = searchParams.get('address');

  if (!addressParam || !isAddress(addressParam)) {
    return NextResponse.json({ error: 'Invalid address' }, { status: 400 });
  }

  const address = getAddress(addressParam);

  try {
    const metadata = await fetchAlchemyTokenMetadata(address);
    const logoUrl = metadata?.logo?.trim();

    if (!logoUrl) {
      return NextResponse.json({ error: 'No logo found' }, { status: 404 });
    }

    const imageResponse = await fetch(logoUrl, {
      next: { revalidate: 86_400 },
    });

    if (!imageResponse.ok) {
      return NextResponse.json(
        { error: 'Failed to fetch token logo' },
        { status: 502 },
      );
    }

    const bytes = await imageResponse.arrayBuffer();
    const contentType =
      imageResponse.headers.get('content-type') ?? 'image/png';

    return new NextResponse(bytes, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to load token icon';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

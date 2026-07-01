import { TOKEN_ICON_FALLBACK } from '@/lib/token-icons';
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
      return NextResponse.redirect(new URL(TOKEN_ICON_FALLBACK, request.url));
    }

    const imageResponse = await fetch(logoUrl, {
      next: { revalidate: 86_400 },
    });

    if (!imageResponse.ok) {
      return NextResponse.redirect(new URL(TOKEN_ICON_FALLBACK, request.url));
    }

    const bytes = await imageResponse.arrayBuffer();
    const contentType =
      imageResponse.headers.get('content-type') ?? 'image/png';

    if (bytes.byteLength < 32) {
      return NextResponse.redirect(new URL(TOKEN_ICON_FALLBACK, request.url));
    }

    return new NextResponse(bytes, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
      },
    });
  } catch {
    return NextResponse.redirect(new URL(TOKEN_ICON_FALLBACK, request.url));
  }
}

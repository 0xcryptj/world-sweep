import { fetchAlchemyTokenMetadata } from '@/lib/tokens';
import {
  getDexScreenerTokenIconUrl,
  normalizeTokenLogoUrl,
  TOKEN_ICON_OVERRIDES,
} from '@/lib/token-icons';
import { isSafePublicHttpUrl } from '@/lib/safe-url';
import { getAddress, isAddress } from 'viem';
import { NextResponse } from 'next/server';

export const maxDuration = 30;

const SUCCESS_CACHE_CONTROL =
  'public, max-age=86400, s-maxage=604800, stale-while-revalidate=2592000';
// Cache misses briefly so newly listed tokens can pick up icons later without
// hammering upstream APIs on every render in the meantime.
const MISS_CACHE_CONTROL = 'public, max-age=3600, s-maxage=21600';

const JSON_FETCH_INIT: RequestInit & { next: { revalidate: number } } = {
  headers: {
    Accept: 'application/json',
    'User-Agent': 'ForagerWorldMiniApp/1.0 (+https://forag3r.app/world)',
  },
  next: { revalidate: 86_400 },
};

async function fetchJson(url: string): Promise<unknown | null> {
  try {
    const response = await fetch(url, {
      ...JSON_FETCH_INIT,
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) {
      return null;
    }
    return await response.json();
  } catch {
    return null;
  }
}

/**
 * DexScreener pairs API: tokens with a DexScreener token profile expose
 * `pairs[].info.imageUrl`. Covers most actively traded World Chain mini-app
 * tokens even when the static dd.dexscreener.com CDN path 404s.
 */
async function fetchDexScreenerImageUrl(address: string): Promise<string | null> {
  const json = (await fetchJson(
    `https://api.dexscreener.com/latest/dex/tokens/${address}`,
  )) as {
    pairs?: Array<{
      chainId?: string;
      baseToken?: { address?: string };
      info?: { imageUrl?: string };
    }> | null;
  } | null;

  const lower = address.toLowerCase();
  const pair = json?.pairs?.find(
    (p) =>
      p?.chainId === 'worldchain' &&
      p?.info?.imageUrl &&
      p?.baseToken?.address?.toLowerCase() === lower,
  );
  return pair?.info?.imageUrl ?? null;
}

/** GeckoTerminal token metadata (network slug for chain 480 is `world-chain`). */
async function fetchGeckoTerminalImageUrl(address: string): Promise<string | null> {
  const json = (await fetchJson(
    `https://api.geckoterminal.com/api/v2/networks/world-chain/tokens/${address.toLowerCase()}`,
  )) as {
    data?: { attributes?: { image_url?: string | null } };
  } | null;

  const imageUrl = json?.data?.attributes?.image_url;
  if (!imageUrl || imageUrl === 'missing.png') {
    return null;
  }
  return imageUrl;
}

/** World Chain Blockscout explorer; returns `icon_url` for CoinGecko-listed tokens. */
async function fetchBlockscoutImageUrl(address: string): Promise<string | null> {
  const json = (await fetchJson(
    `https://worldchain-mainnet.explorer.alchemy.com/api/v2/tokens/${address}`,
  )) as { icon_url?: string | null } | null;

  return json?.icon_url ?? null;
}

/** CoinGecko contract endpoint — covers a partially disjoint set from GeckoTerminal
 *  and stays available when GT's per-IP quota is exhausted. */
async function fetchCoinGeckoImageUrl(address: string): Promise<string | null> {
  const json = (await fetchJson(
    `https://api.coingecko.com/api/v3/coins/world-chain/contract/${address.toLowerCase()}`,
  )) as {
    image?: { large?: string | null; small?: string | null };
  } | null;

  return json?.image?.large ?? json?.image?.small ?? null;
}

async function proxyImageUrl(logoUrl: string): Promise<NextResponse | null> {
  // SSRF guard: this route fetches (partly) caller-influenced URLs and streams
  // the bytes back. Refuse anything that isn't a public http(s) host so it can't
  // be turned into a proxy for internal services or cloud metadata endpoints.
  if (!isSafePublicHttpUrl(logoUrl)) {
    return null;
  }

  try {
    const imageResponse = await fetch(logoUrl, {
      headers: {
        Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
        'User-Agent': 'ForagerWorldMiniApp/1.0 (+https://forag3r.app/world)',
      },
      next: { revalidate: 86_400 },
      signal: AbortSignal.timeout(10_000),
    });

    if (!imageResponse.ok) {
      return null;
    }

    const contentType =
      imageResponse.headers.get('content-type') ?? 'image/png';
    if (contentType.includes('text/html')) {
      return null;
    }

    const bytes = await imageResponse.arrayBuffer();
    if (bytes.byteLength < 32) {
      return null;
    }

    return new NextResponse(bytes, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': SUCCESS_CACHE_CONTROL,
      },
    });
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const addressParam = searchParams.get('address');
  const symbolParam = searchParams.get('symbol')?.trim().toLowerCase() ?? '';
  const logoUrlParam = normalizeTokenLogoUrl(searchParams.get('logoUrl'));

  if (!addressParam || !isAddress(addressParam)) {
    return NextResponse.json({ error: 'Invalid address' }, { status: 400 });
  }

  const address = getAddress(addressParam);
  const addressLower = address.toLowerCase();

  try {
    // Fast path: known-good direct URLs (caller-provided logo, curated
    // overrides, DexScreener static CDN).
    const directCandidates = [
      logoUrlParam,
      TOKEN_ICON_OVERRIDES[addressLower],
      TOKEN_ICON_OVERRIDES[symbolParam],
      getDexScreenerTokenIconUrl(addressLower),
    ]
      .map((url) => normalizeTokenLogoUrl(url))
      .filter((url): url is string => Boolean(url));

    const seen = new Set<string>();
    for (const candidate of directCandidates) {
      if (seen.has(candidate)) {
        continue;
      }
      seen.add(candidate);
      const proxied = await proxyImageUrl(candidate);
      if (proxied) {
        return proxied;
      }
    }

    // Slow path: try metadata APIs sequentially and stop on first usable image.
    // Parallel fan-out burned Dex/Gecko/Alchemy quotas on every cold icon miss.
    const metadataFetchers = [
      () => fetchDexScreenerImageUrl(address),
      () => fetchGeckoTerminalImageUrl(address),
      () => fetchCoinGeckoImageUrl(address),
      () => fetchBlockscoutImageUrl(address),
      () => fetchAlchemyTokenMetadata(address).then((m) => m?.logo ?? null),
    ];

    for (const fetchUrl of metadataFetchers) {
      const rawUrl = await fetchUrl();
      const candidate = normalizeTokenLogoUrl(rawUrl);
      if (!candidate || seen.has(candidate)) {
        continue;
      }
      seen.add(candidate);
      const proxied = await proxyImageUrl(candidate);
      if (proxied) {
        return proxied;
      }
    }

    return NextResponse.json(
      { error: 'No logo found' },
      { status: 404, headers: { 'Cache-Control': MISS_CACHE_CONTROL } },
    );
  } catch {
    return NextResponse.json(
      { error: 'Failed to load logo' },
      { status: 404, headers: { 'Cache-Control': MISS_CACHE_CONTROL } },
    );
  }
}

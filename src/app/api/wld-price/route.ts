import { NextResponse } from 'next/server';
import { WLD_ADDRESS } from '@/lib/constants';
import { SUPPORTED_FIAT } from '@/lib/fiat';

export const revalidate = 120;

const GECKOTERMINAL_URL = `https://api.geckoterminal.com/api/v2/simple/networks/world-chain/token_price/${WLD_ADDRESS}`;

type PriceCache = {
  prices: Record<string, number>;
  fetchedAt: number;
};

let cached: PriceCache | null = null;
const CACHE_TTL_MS = 120_000;

function normalizeCurrency(raw: string | null): string {
  const code = (raw ?? 'usd').trim().toLowerCase();
  return SUPPORTED_FIAT.has(code) ? code : 'usd';
}

async function fetchFromCoinGecko(
  currencies: string[],
): Promise<Record<string, number> | null> {
  const vs = Array.from(new Set(['usd', ...currencies])).join(',');
  const response = await fetch(
    `https://api.coingecko.com/api/v3/simple/price?ids=worldcoin-wld&vs_currencies=${vs}`,
    {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(5_000),
    },
  );
  if (!response.ok) return null;
  const body = (await response.json()) as {
    'worldcoin-wld'?: Record<string, number>;
  };
  const row = body['worldcoin-wld'];
  if (!row) return null;

  const prices: Record<string, number> = {};
  for (const [key, value] of Object.entries(row)) {
    if (typeof value === 'number' && value > 0) {
      prices[key.toLowerCase()] = value;
    }
  }
  return Object.keys(prices).length > 0 ? prices : null;
}

async function fetchUsdFromGeckoTerminal(): Promise<number | null> {
  const response = await fetch(GECKOTERMINAL_URL, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok) return null;
  const body = (await response.json()) as {
    data?: { attributes?: { token_prices?: Record<string, string> } };
  };
  const prices = body.data?.attributes?.token_prices ?? {};
  const raw = prices[WLD_ADDRESS.toLowerCase()] ?? Object.values(prices)[0];
  const usd = raw ? Number(raw) : NaN;
  return Number.isFinite(usd) && usd > 0 ? usd : null;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const currency = normalizeCurrency(searchParams.get('currency'));

  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    const price = cached.prices[currency] ?? cached.prices.usd;
    if (price) {
      return NextResponse.json(
        {
          usd: cached.prices.usd ?? price,
          currency: currency.toUpperCase(),
          price,
          cached: true,
        },
        {
          headers: {
            'Cache-Control': 's-maxage=120, stale-while-revalidate=600',
          },
        },
      );
    }
  }

  let prices: Record<string, number> | null = null;
  try {
    prices = await fetchFromCoinGecko([currency]);
  } catch {
    prices = null;
  }

  if (!prices?.usd) {
    try {
      const usd = await fetchUsdFromGeckoTerminal();
      if (usd) {
        prices = { ...(prices ?? {}), usd };
      }
    } catch {
      // keep null
    }
  }

  if (!prices?.usd && cached?.prices.usd) {
    const price = cached.prices[currency] ?? cached.prices.usd;
    return NextResponse.json({
      usd: cached.prices.usd,
      currency: currency.toUpperCase(),
      price,
      cached: true,
      stale: true,
    });
  }

  if (!prices?.usd) {
    return NextResponse.json(
      { error: 'WLD price unavailable' },
      { status: 503 },
    );
  }

  cached = { prices, fetchedAt: Date.now() };
  const price = prices[currency] ?? prices.usd;

  return NextResponse.json(
    {
      usd: prices.usd,
      currency: currency.toUpperCase(),
      price,
    },
    {
      headers: { 'Cache-Control': 's-maxage=120, stale-while-revalidate=600' },
    },
  );
}

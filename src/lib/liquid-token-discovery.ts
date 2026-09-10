import 'server-only';

import { cacheGetOrLoad } from './data-cache';
import {
  isSafePortalTokenAddress,
  normalizePortalAddress,
} from './allowlist';
import {
  USDC_ADDRESS,
  WETH_ADDRESS,
  WLD_ADDRESS,
} from './constants';

export type DiscoveredLiquidToken = {
  address: string;
  symbol: string;
  liquidityUsd: number;
};

const MIN_LIQUIDITY_USD = 400;
const MAX_PAGES = 3;
const MAX_TOKENS = 180;

const CORE_SKIP = new Set(
  [WLD_ADDRESS, WETH_ADDRESS, USDC_ADDRESS, '0x0000000000000000000000000000000000000000'].map(
    (address) => address.toLowerCase(),
  ),
);

type GeckoPool = {
  attributes?: {
    name?: string;
    reserve_in_usd?: string;
  };
  relationships?: {
    base_token?: { data?: { id?: string } };
    quote_token?: { data?: { id?: string } };
  };
};

function addressFromGeckoId(id: string | undefined): string | null {
  if (!id) {
    return null;
  }
  // e.g. world-chain_0xab09…
  const parts = id.split('_');
  const address = parts[parts.length - 1];
  return normalizePortalAddress(address);
}

function symbolsFromPoolName(name: string | undefined): [string, string] {
  if (!name) {
    return ['TOKEN', 'TOKEN'];
  }
  const cleaned = name.replace(/\s+\d+(\.\d+)?%\s*$/, '').trim();
  const [left, right] = cleaned.split(/\s*\/\s*/);
  return [(left || 'TOKEN').trim(), (right || 'TOKEN').trim()];
}

async function fetchGeckoPoolsPage(page: number): Promise<GeckoPool[]> {
  const response = await fetch(
    `https://api.geckoterminal.com/api/v2/networks/world-chain/pools?page=${page}`,
    {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(8_000),
      next: { revalidate: 300 },
    },
  );
  if (response.status === 429) {
    console.warn('[liquid-discovery] GeckoTerminal rate limited on page', page);
    return [];
  }
  if (!response.ok) {
    throw new Error(`GeckoTerminal HTTP ${response.status}`);
  }
  const json = (await response.json()) as { data?: GeckoPool[] };
  return json.data ?? [];
}

/**
 * Discover World Chain ERC-20s that currently have Uniswap-style pool liquidity.
 * Cached so scans/cron don't burn the public GeckoTerminal rate limit.
 */
export async function discoverLiquidWorldTokens(): Promise<
  DiscoveredLiquidToken[]
> {
  const { value } = await cacheGetOrLoad(
    'liquid-world-tokens',
    'world-chain',
    async () => {
      const byAddress = new Map<string, DiscoveredLiquidToken>();

      for (let page = 1; page <= MAX_PAGES; page += 1) {
        let pools: GeckoPool[] = [];
        try {
          pools = await fetchGeckoPoolsPage(page);
        } catch (error) {
          console.warn(
            '[liquid-discovery] page failed',
            page,
            error instanceof Error ? error.message : error,
          );
          break;
        }
        if (pools.length === 0) {
          break;
        }

        for (const pool of pools) {
          const liquidityUsd = Number(pool.attributes?.reserve_in_usd ?? 0);
          if (!Number.isFinite(liquidityUsd) || liquidityUsd < MIN_LIQUIDITY_USD) {
            continue;
          }

          const [baseSymbol, quoteSymbol] = symbolsFromPoolName(
            pool.attributes?.name,
          );
          const pairs: Array<{ address: string | null; symbol: string }> = [
            {
              address: addressFromGeckoId(
                pool.relationships?.base_token?.data?.id,
              ),
              symbol: baseSymbol,
            },
            {
              address: addressFromGeckoId(
                pool.relationships?.quote_token?.data?.id,
              ),
              symbol: quoteSymbol,
            },
          ];

          for (const pair of pairs) {
            if (!pair.address || CORE_SKIP.has(pair.address)) {
              continue;
            }
            if (!isSafePortalTokenAddress(pair.address)) {
              continue;
            }

            const existing = byAddress.get(pair.address);
            if (!existing || liquidityUsd > existing.liquidityUsd) {
              byAddress.set(pair.address, {
                address: pair.address,
                symbol: pair.symbol.slice(0, 24) || 'TOKEN',
                liquidityUsd,
              });
            }
          }
        }

        // Be gentle with the free GeckoTerminal tier.
        if (page < MAX_PAGES) {
          await new Promise((resolve) => setTimeout(resolve, 350));
        }
      }

      return [...byAddress.values()]
        .sort((a, b) => b.liquidityUsd - a.liquidityUsd)
        .slice(0, MAX_TOKENS);
    },
    {
      freshMs: 30 * 60_000,
      staleMs: 6 * 60 * 60_000,
    },
  );

  return value;
}

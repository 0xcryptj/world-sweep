import { formatUnitsCapped } from './format-balance';
import {
  createPublicClient,
  getAddress,
  http,
  isAddress,
  type Address,
} from 'viem';
import { worldchain } from 'viem/chains';
import { erc20Abi } from './abis';
import { PORTAL_PERMIT2_TOKEN_ADDRESSES } from './allowlist';
import { mapPool } from './async-pool';
import { PROTECTED_TOKEN_ADDRESSES, RPC_URL, WLD_ADDRESS } from './constants';
import { cacheGetOrLoad } from './data-cache';
import { isForageableToken } from './token-filters';
import type { WalletToken } from './types';

/**
 * Server-side RPC URL. Built from the non-public ALCHEMY_API_KEY so the keyed
 * Alchemy endpoint never ships in a client bundle. On the client, ALCHEMY_API_KEY
 * is undefined, so this falls back to the keyless public RPC_URL — but this
 * client is only ever exercised in server code (API routes / sweep building).
 */
const SERVER_RPC_URL = process.env.ALCHEMY_API_KEY
  ? `https://worldchain-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`
  : RPC_URL;

const client = createPublicClient({
  chain: worldchain,
  // `batch` collapses many eth_calls into a single JSON-RPC request and
  // `retryCount` adds viem's own 429/5xx backoff — both cut the request volume
  // that triggers Alchemy free-tier rate limiting.
  transport: http(SERVER_RPC_URL, {
    batch: true,
    retryCount: 2,
    retryDelay: 250,
    timeout: 8_000,
  }),
});

type AlchemyTokenBalance = {
  contractAddress: string;
  tokenBalance: string;
};

const MAX_RPC_ATTEMPTS = 4;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function rateLimitedError(): Error & { isRateLimited: boolean } {
  const error = new Error(
    'The network is busy right now. Please try again in a moment.',
  ) as Error & { isRateLimited: boolean };
  error.isRateLimited = true;
  return error;
}

/** Exponential backoff with jitter, honoring an upstream Retry-After header. */
function backoffMs(attempt: number, retryAfterHeader: string | null): number {
  const retryAfterSeconds = retryAfterHeader ? Number(retryAfterHeader) : NaN;
  if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
    return Math.min(retryAfterSeconds * 1000, 4000);
  }
  const base = 300 * 2 ** attempt;
  return Math.min(base, 4000) + Math.floor(Math.random() * 150);
}

type AlchemyTokenMetadata = {
  name?: string | null;
  symbol?: string | null;
  decimals?: number | null;
  logo?: string | null;
};

async function alchemyRpc<T>(method: string, params: unknown[]): Promise<T> {
  const apiKey = process.env.ALCHEMY_API_KEY;
  if (!apiKey) {
    throw new Error(
      'ALCHEMY_API_KEY is not configured. Create a free key at alchemy.com (World Chain supported).',
    );
  }

  // NOTE: `url` contains the secret API key. It must never appear in a thrown
  // error message — the catch/return paths below only surface generic strings.
  const url = `https://worldchain-mainnet.g.alchemy.com/v2/${apiKey}`;
  let lastError: Error = rateLimitedError();

  for (let attempt = 0; attempt < MAX_RPC_ATTEMPTS; attempt++) {
    let response: Response;
    try {
      // Metadata is stable; balances must never be served from Next's fetch
      // cache or the wallet chip/panel lag Alchemy by up to 30s after swaps.
      const isMetadata = method === 'alchemy_getTokenMetadata';
      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
        ...(isMetadata
          ? { next: { revalidate: 3600 } }
          : { cache: 'no-store' as const }),
      });
    } catch {
      // Network hiccup — retry without leaking the (keyed) request URL.
      lastError = new Error(`Alchemy ${method} request failed`);
      if (attempt < MAX_RPC_ATTEMPTS - 1) {
        await sleep(backoffMs(attempt, null));
        continue;
      }
      throw lastError;
    }

    if (response.status === 429 || response.status >= 500) {
      lastError = rateLimitedError();
      if (attempt < MAX_RPC_ATTEMPTS - 1) {
        await sleep(backoffMs(attempt, response.headers.get('retry-after')));
        continue;
      }
      throw lastError;
    }

    const payload = (await response.json()) as {
      error?: { message: string };
      result?: T;
    };

    if (payload.error) {
      const rawMessage = payload.error.message || '';
      if (/rate[- ]?limit|too many requests|\b429\b/i.test(rawMessage)) {
        lastError = rateLimitedError();
        if (attempt < MAX_RPC_ATTEMPTS - 1) {
          await sleep(backoffMs(attempt, response.headers.get('retry-after')));
          continue;
        }
        throw lastError;
      }
      // Surface a generic message — upstream errors can echo request details.
      throw new Error(`Alchemy ${method} failed`);
    }

    return payload.result as T;
  }

  throw lastError;
}

/**
 * Reads specific token balances in one batched Alchemy call (no per-token
 * eth_call fan-out, no viem error string that would embed the keyed RPC URL).
 */
export async function fetchTokenBalancesWei(
  walletAddress: Address,
  tokenAddresses: readonly string[],
): Promise<Map<string, bigint>> {
  const result = await alchemyRpc<{ tokenBalances: AlchemyTokenBalance[] }>(
    'alchemy_getTokenBalances',
    [walletAddress, tokenAddresses],
  );

  const balances = new Map<string, bigint>();
  for (const entry of result.tokenBalances ?? []) {
    balances.set(
      entry.contractAddress.toLowerCase(),
      BigInt(entry.tokenBalance || '0x0'),
    );
  }
  return balances;
}

export async function fetchTokenBalanceWei(
  walletAddress: Address,
  tokenAddress: string,
): Promise<bigint> {
  const balances = await fetchTokenBalancesWei(walletAddress, [tokenAddress]);
  return balances.get(tokenAddress.toLowerCase()) ?? BigInt(0);
}

async function fetchAllowlistedWalletTokens(
  walletAddress: Address,
): Promise<WalletToken[]> {
  const balances = await client.multicall({
    contracts: PORTAL_PERMIT2_TOKEN_ADDRESSES.map((tokenAddress) => ({
      address: getAddress(tokenAddress),
      abi: erc20Abi,
      functionName: 'balanceOf',
      args: [walletAddress],
    })),
    allowFailure: true,
  });

  const tokens: WalletToken[] = [];

  for (let index = 0; index < PORTAL_PERMIT2_TOKEN_ADDRESSES.length; index++) {
    const result = balances[index];
    if (result.status !== 'success') {
      continue;
    }

    const balance = BigInt(result.result);
    if (balance <= BigInt(0)) {
      continue;
    }

    const address = getAddress(PORTAL_PERMIT2_TOKEN_ADDRESSES[index]);

    tokens.push({
      address,
      symbol: shortTokenLabel(address),
      name: 'Token',
      decimals: 18,
      balance: balance.toString(),
      balanceFormatted: formatUnitsCapped(balance, 18),
    });
  }

  return tokens;
}

export async function fetchAlchemyTokenMetadata(
  address: string,
): Promise<AlchemyTokenMetadata | null> {
  try {
    const { value } = await cacheGetOrLoad(
      'token-metadata',
      address,
      async () => {
        const meta = await alchemyRpc<AlchemyTokenMetadata>(
          'alchemy_getTokenMetadata',
          [address],
        );
        return meta ?? null;
      },
      { freshMs: 60 * 60_000, staleMs: 6 * 60 * 60_000 },
    );
    return value;
  } catch {
    return null;
  }
}

type MarketTokenMeta = {
  symbol?: string;
  name?: string;
  logoUrl?: string | null;
  priceUsd?: number | null;
  priceChange24h?: number | null;
  liquidityUsd?: number;
};

/** Prefer a real ticker over Alchemy's empty / UNKNOWN placeholders. */
function isPlaceholderSymbol(symbol: string | null | undefined): boolean {
  const value = symbol?.trim() ?? '';
  return !value || /^unknown$/i.test(value) || value === '???';
}

function isPlaceholderName(name: string | null | undefined): boolean {
  const value = name?.trim() ?? '';
  return !value || /^unknown(\s+token)?$/i.test(value);
}

function shortTokenLabel(address: string): string {
  const normalized = address.toLowerCase();
  return `${normalized.slice(0, 6)}…${normalized.slice(-4)}`;
}

/** Batch DexScreener `/tokens/v1/worldchain/{addrs}` — up to 30 per request. */
async function fetchDexScreenerTokenMetaBatch(
  addresses: string[],
): Promise<Map<string, MarketTokenMeta>> {
  const result = new Map<string, MarketTokenMeta>();
  const unique = [
    ...new Set(addresses.map((address) => address.toLowerCase()).filter(Boolean)),
  ];
  if (unique.length === 0) {
    return result;
  }

  for (let i = 0; i < unique.length; i += 30) {
    const chunk = unique.slice(i, i + 30);
    try {
      const response = await fetch(
        `https://api.dexscreener.com/tokens/v1/worldchain/${chunk.join(',')}`,
        {
          headers: { Accept: 'application/json' },
          signal: AbortSignal.timeout(8_000),
          next: { revalidate: 300 },
        },
      );
      if (!response.ok) {
        continue;
      }
      const pairs = (await response.json()) as Array<{
        chainId?: string;
        baseToken?: { address?: string; name?: string; symbol?: string };
        quoteToken?: { address?: string; name?: string; symbol?: string };
        info?: { imageUrl?: string };
        liquidity?: { usd?: number };
        priceUsd?: string | number;
        priceChange?: { h24?: number };
      }>;

      for (const pair of pairs ?? []) {
        const addr = pair.baseToken?.address?.toLowerCase();
        const quoteAddr = pair.quoteToken?.address?.toLowerCase();
        const liq =
          typeof pair.liquidity?.usd === 'number' ? pair.liquidity.usd : 0;
        if (addr && chunk.includes(addr)) {
          const parsedPrice =
            typeof pair.priceUsd === 'number'
              ? pair.priceUsd
              : typeof pair.priceUsd === 'string'
                ? Number(pair.priceUsd)
                : NaN;
          const next: MarketTokenMeta = {
            symbol: pair.baseToken?.symbol?.trim() || undefined,
            name: pair.baseToken?.name?.trim() || undefined,
            logoUrl: pair.info?.imageUrl?.trim() || null,
            priceUsd:
              Number.isFinite(parsedPrice) && parsedPrice > 0
                ? parsedPrice
                : null,
            priceChange24h:
              typeof pair.priceChange?.h24 === 'number' &&
              Number.isFinite(pair.priceChange.h24)
                ? pair.priceChange.h24
                : null,
            liquidityUsd: liq,
          };
          const existing = result.get(addr);
          if (
            !existing ||
            (next.liquidityUsd ?? 0) > (existing.liquidityUsd ?? 0)
          ) {
            result.set(addr, { ...existing, ...next });
          }
        }

        // Quote-side holdings still have a Dex market even when they aren't
        // the pair's base token — keep liquidity so scan doesn't dump them.
        if (
          quoteAddr &&
          quoteAddr !== addr &&
          chunk.includes(quoteAddr)
        ) {
          const existingQuote = result.get(quoteAddr);
          if (!existingQuote || liq > (existingQuote.liquidityUsd ?? 0)) {
            result.set(quoteAddr, {
              ...existingQuote,
              symbol:
                pair.quoteToken?.symbol?.trim() || existingQuote?.symbol,
              name: pair.quoteToken?.name?.trim() || existingQuote?.name,
              liquidityUsd: Math.max(liq, existingQuote?.liquidityUsd ?? 0),
            });
          }
        }
      }
    } catch {
      /* skip chunk — fall back to per-token later if needed */
    }
  }

  return result;
}

/** Batch on-chain ERC-20 meta for many tokens in one multicall. */
async function readOnChainMetadataBatch(
  addresses: Address[],
): Promise<Map<string, { symbol?: string; name?: string; decimals?: number }>> {
  const result = new Map<
    string,
    { symbol?: string; name?: string; decimals?: number }
  >();
  if (addresses.length === 0) {
    return result;
  }

  const contracts = addresses.flatMap((address) => [
    { address, abi: erc20Abi, functionName: 'symbol' as const },
    { address, abi: erc20Abi, functionName: 'name' as const },
    { address, abi: erc20Abi, functionName: 'decimals' as const },
  ]);

  try {
    const results = await client.multicall({
      contracts,
      allowFailure: true,
    });

    for (let i = 0; i < addresses.length; i++) {
      const base = i * 3;
      const symbolResult = results[base];
      const nameResult = results[base + 1];
      const decimalsResult = results[base + 2];
      result.set(addresses[i]!.toLowerCase(), {
        symbol:
          symbolResult?.status === 'success'
            ? String(symbolResult.result)
            : undefined,
        name:
          nameResult?.status === 'success'
            ? String(nameResult.result)
            : undefined,
        decimals:
          decimalsResult?.status === 'success'
            ? Number(decimalsResult.result)
            : undefined,
      });
    }
  } catch {
    /* leave empty — callers fall back to Alchemy */
  }

  return result;
}

function tokenNeedsMetadataEnrich(token: WalletToken): boolean {
  return (
    isPlaceholderSymbol(token.symbol) ||
    isPlaceholderName(token.name) ||
    !token.logoUrl ||
    /^0x[a-f0-9]{4}…/i.test(token.symbol) ||
    /^token$/i.test(token.name ?? '')
  );
}

export async function fetchWalletTokens(
  walletAddress: string,
): Promise<WalletToken[]> {
  const tokens = await fetchAllWalletTokens(walletAddress);
  return tokens.filter(isForageableToken);
}

function sortWalletHoldings(tokens: WalletToken[]): WalletToken[] {
  const wld = WLD_ADDRESS.toLowerCase();

  return [...tokens].sort((a, b) => {
    const aAddress = a.address.toLowerCase();
    const bAddress = b.address.toLowerCase();

    if (aAddress === wld) return -1;
    if (bAddress === wld) return 1;

    const aProtected = PROTECTED_TOKEN_ADDRESSES.has(aAddress);
    const bProtected = PROTECTED_TOKEN_ADDRESSES.has(bAddress);
    if (aProtected !== bProtected) {
      return aProtected ? -1 : 1;
    }

    const aBalance = BigInt(a.balance);
    const bBalance = BigInt(b.balance);
    if (aBalance === bBalance) {
      return a.symbol.localeCompare(b.symbol);
    }

    return aBalance > bBalance ? -1 : 1;
  });
}

const MAX_METADATA_ENRICH = 96;

export async function fetchAllWalletTokens(
  walletAddress: string,
  options?: { enrichMetadata?: boolean; maxEnrich?: number },
): Promise<WalletToken[]> {
  if (!isAddress(walletAddress)) {
    throw new Error('Invalid wallet address');
  }

  const normalizedWallet = getAddress(walletAddress);
  let tokens: WalletToken[];

  try {
    // Alchemy paginates erc20 discovery via pageKey — without following it we
    // silently drop junk holdings past the first page and the scan looks empty.
    const tokenBalances: AlchemyTokenBalance[] = [];
    let pageKey: string | undefined;
    const maxPages = 8;

    for (let page = 0; page < maxPages; page++) {
      const params: unknown[] = pageKey
        ? [normalizedWallet, 'erc20', { pageKey }]
        : [normalizedWallet, 'erc20'];
      const balanceResult = await alchemyRpc<{
        tokenBalances?: AlchemyTokenBalance[];
        pageKey?: string | null;
      }>('alchemy_getTokenBalances', params);

      tokenBalances.push(...(balanceResult.tokenBalances ?? []));
      const nextKey = balanceResult.pageKey;
      if (!nextKey || typeof nextKey !== 'string') {
        break;
      }
      pageKey = nextKey;
    }

    tokens = tokenBalances
      .map((token) => {
        const address = getAddress(token.contractAddress);
        const balance = BigInt(token.tokenBalance || '0x0');

        return {
          address,
          symbol: shortTokenLabel(address),
          name: 'Token',
          decimals: 18,
          balance: balance.toString(),
          balanceFormatted: formatUnitsCapped(balance, 18),
        } satisfies WalletToken;
      })
      .filter((token) => token.balance !== '0');
  } catch (error) {
    const isRateLimited =
      error instanceof Error &&
      'isRateLimited' in error &&
      Boolean((error as Error & { isRateLimited?: boolean }).isRateLimited);

    if (!isRateLimited) {
      throw error;
    }

    tokens = await fetchAllowlistedWalletTokens(normalizedWallet);
  }

  if (options?.enrichMetadata === false) {
    return sortWalletHoldings(tokens);
  }

  const enrichLimit = options?.maxEnrich ?? MAX_METADATA_ENRICH;
  const prioritized = sortWalletHoldings(tokens);
  const toEnrich = prioritized.slice(0, enrichLimit);
  const remainder = prioritized.slice(enrichLimit);
  const enriched = await enrichTokenMetadata(toEnrich);

  return sortWalletHoldings([...enriched, ...remainder]);
}

function applyMarketQuote(
  token: WalletToken,
  market?: MarketTokenMeta,
): WalletToken {
  if (!market) {
    return token;
  }
  return {
    ...token,
    priceUsd: market.priceUsd ?? token.priceUsd ?? null,
    priceChange24h: market.priceChange24h ?? token.priceChange24h ?? null,
    liquidityUsd: market.liquidityUsd ?? token.liquidityUsd ?? null,
  };
}

export async function enrichTokenMetadata(
  tokens: WalletToken[],
): Promise<WalletToken[]> {
  if (tokens.length === 0) {
    return tokens;
  }

  const [onChainMap, marketMap] = await Promise.all([
    readOnChainMetadataBatch(
      tokens.map((token) => getAddress(token.address) as Address),
    ),
    fetchDexScreenerTokenMetaBatch(tokens.map((token) => token.address)),
  ]);

  // Alchemy only for tokens still incomplete after on-chain + Dex batch.
  const stillNeedAlchemy = tokens
    .filter((token) => {
    const key = token.address.toLowerCase();
    const onChain = onChainMap.get(key);
    const market = marketMap.get(key);
    const symbol =
      (!isPlaceholderSymbol(onChain?.symbol) ? onChain?.symbol : null) ||
      (!isPlaceholderSymbol(market?.symbol) ? market?.symbol : null) ||
      (!isPlaceholderSymbol(token.symbol) ? token.symbol : null);
    const name =
      (!isPlaceholderName(onChain?.name) ? onChain?.name : null) ||
      (!isPlaceholderName(market?.name) ? market?.name : null) ||
      (!isPlaceholderName(token.name) ? token.name : null);
    const logo = market?.logoUrl || token.logoUrl;
    return (
      isPlaceholderSymbol(symbol) ||
      isPlaceholderName(name) ||
      !logo
    );
  })
    .slice(0, 24);

  const alchemyByAddress = new Map<string, AlchemyTokenMetadata | null>();
  await mapPool(stillNeedAlchemy, 6, async (token) => {
    const meta = await fetchAlchemyTokenMetadata(token.address);
    alchemyByAddress.set(token.address.toLowerCase(), meta);
  });

  return tokens.map((token) => {
    const key = token.address.toLowerCase();
    const market = marketMap.get(key);
    const alchemy = alchemyByAddress.get(key);
    const onChain = onChainMap.get(key);

    const symbol =
      (!isPlaceholderSymbol(alchemy?.symbol) ? alchemy?.symbol?.trim() : null) ||
      (!isPlaceholderSymbol(onChain?.symbol) ? onChain?.symbol?.trim() : null) ||
      (!isPlaceholderSymbol(market?.symbol) ? market?.symbol?.trim() : null) ||
      (!isPlaceholderSymbol(token.symbol) ? token.symbol.trim() : null) ||
      shortTokenLabel(token.address);

    const name =
      (!isPlaceholderName(alchemy?.name) ? alchemy?.name?.trim() : null) ||
      (!isPlaceholderName(onChain?.name) ? onChain?.name?.trim() : null) ||
      (!isPlaceholderName(market?.name) ? market?.name?.trim() : null) ||
      (!isPlaceholderName(token.name) ? token.name.trim() : null) ||
      symbol;

    const decimals =
      onChain?.decimals ?? alchemy?.decimals ?? token.decimals;
    const logoUrl =
      market?.logoUrl?.trim() ||
      alchemy?.logo?.trim() ||
      token.logoUrl ||
      null;

    return applyMarketQuote(
      {
        ...token,
        symbol,
        name,
        decimals,
        logoUrl,
        balanceFormatted: formatUnitsCapped(BigInt(token.balance), decimals),
      },
      market,
    );
  });
}

export { client as publicClient };

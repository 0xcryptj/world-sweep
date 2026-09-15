import { createPublicClient, fallback, http, type Transport } from 'viem';
import { worldchain } from 'viem/chains';

/**
 * Keyless World Chain RPCs used for Uniswap quoter eth_calls, simulations,
 * and receipt polling. Alchemy is first (World’s default); Tenderly is the
 * verified fallback when Alchemy 429s or drops. Other public endpoints are
 * tried last — some edge networks 403 from desktop but work on Vercel.
 *
 * Never put a keyed URL in NEXT_PUBLIC_* — that ships to the browser.
 *
 * Providers (World Chain docs): Alchemy, QuickNode, Tenderly, Blast (legacy).
 * Blast’s public World Chain API now redirects to Alchemy.
 */
export const PUBLIC_WORLDCHAIN_RPC_URLS = [
  'https://worldchain-mainnet.g.alchemy.com/public',
  'https://worldchain-mainnet.gateway.tenderly.co',
  'https://worldchain.drpc.org',
  'https://480.rpc.thirdweb.com',
  'https://lb.routeme.sh/rpc/evm/480',
] as const;

function uniqueUrls(urls: Array<string | undefined | null>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const url of urls) {
    const trimmed = url?.trim();
    if (!trimmed || seen.has(trimmed)) {
      continue;
    }
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

function extraServerUrls(): string[] {
  const extras = [
    process.env.WORLDCHAIN_QUICKNODE_URL,
    process.env.WORLDCHAIN_TENDERLY_RPC_URL,
    process.env.WORLDCHAIN_BLAST_RPC_URL,
    ...(process.env.WORLDCHAIN_RPC_URLS ?? '')
      .split(',')
      .map((url) => url.trim()),
  ];
  return uniqueUrls(extras);
}

function keyedAlchemyUrl(): string | undefined {
  const key = process.env.ALCHEMY_API_KEY?.trim();
  if (!key) {
    return undefined;
  }
  return `https://worldchain-mainnet.g.alchemy.com/v2/${key}`;
}

/** Client-safe list (no secrets). */
export function clientRpcUrls(): string[] {
  return uniqueUrls([
    process.env.NEXT_PUBLIC_WORLDCHAIN_RPC_URL,
    ...PUBLIC_WORLDCHAIN_RPC_URLS,
  ]);
}

/** Server list: keyed Alchemy / QuickNode / Tenderly first, then public. */
export function serverRpcUrls(): string[] {
  return uniqueUrls([
    keyedAlchemyUrl(),
    ...extraServerUrls(),
    process.env.NEXT_PUBLIC_WORLDCHAIN_RPC_URL,
    ...PUBLIC_WORLDCHAIN_RPC_URLS,
  ]);
}

function httpTransport(url: string): Transport {
  return http(url, {
    batch: true,
    retryCount: 0,
    retryDelay: 200,
    timeout: 8_000,
  });
}

export function createWorldChainTransport(urls: string[]): Transport {
  const list = uniqueUrls(urls);
  if (list.length === 0) {
    return httpTransport(PUBLIC_WORLDCHAIN_RPC_URLS[0]);
  }
  if (list.length === 1) {
    return httpTransport(list[0]);
  }
  return fallback(
    list.map((url) => httpTransport(url)),
    {
      retryCount: 2,
      retryDelay: 200,
    },
  );
}

export function createWorldChainPublicClient(options?: {
  server?: boolean;
}) {
  const urls = options?.server ? serverRpcUrls() : clientRpcUrls();
  return createPublicClient({
    chain: worldchain,
    transport: createWorldChainTransport(urls),
  });
}

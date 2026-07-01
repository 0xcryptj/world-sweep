import {
  createPublicClient,
  formatUnits,
  getAddress,
  http,
  isAddress,
  type Address,
} from 'viem';
import { worldchain } from 'viem/chains';
import { erc20Abi } from './abis';
import { RPC_URL } from './constants';
import { isForageableToken } from './token-filters';
import type { WalletToken } from './types';

const client = createPublicClient({
  chain: worldchain,
  transport: http(RPC_URL),
});

type AlchemyTokenBalance = {
  contractAddress: string;
  tokenBalance: string;
};

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

  const response = await fetch(
    `https://worldchain-mainnet.g.alchemy.com/v2/${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method,
        params,
      }),
      next: { revalidate: method === 'alchemy_getTokenMetadata' ? 3600 : 30 },
    },
  );

  const payload = (await response.json()) as {
    error?: { message: string };
    result?: T;
  };

  if (payload.error) {
    throw new Error(payload.error.message || `Alchemy ${method} failed`);
  }

  return payload.result as T;
}

async function fetchAlchemyTokenMetadata(
  address: string,
): Promise<AlchemyTokenMetadata | null> {
  try {
    return await alchemyRpc<AlchemyTokenMetadata>(
      'alchemy_getTokenMetadata',
      [address],
    );
  } catch {
    return null;
  }
}

async function readOnChainMetadata(address: Address): Promise<{
  symbol?: string;
  name?: string;
  decimals?: number;
}> {
  const results = await Promise.allSettled([
    client.readContract({
      address,
      abi: erc20Abi,
      functionName: 'symbol',
    }),
    client.readContract({
      address,
      abi: erc20Abi,
      functionName: 'name',
    }),
    client.readContract({
      address,
      abi: erc20Abi,
      functionName: 'decimals',
    }),
  ]);

  return {
    symbol:
      results[0].status === 'fulfilled' ? String(results[0].value) : undefined,
    name: results[1].status === 'fulfilled' ? String(results[1].value) : undefined,
    decimals:
      results[2].status === 'fulfilled' ? Number(results[2].value) : undefined,
  };
}

export async function fetchWalletTokens(
  walletAddress: string,
): Promise<WalletToken[]> {
  if (!isAddress(walletAddress)) {
    throw new Error('Invalid wallet address');
  }

  const balanceResult = await alchemyRpc<{
    tokenBalances: AlchemyTokenBalance[];
  }>('alchemy_getTokenBalances', [walletAddress, 'erc20']);

  const tokens = balanceResult.tokenBalances
    .map((token) => {
      const address = getAddress(token.contractAddress);
      const balance = BigInt(token.tokenBalance || '0x0');

      return {
        address,
        symbol: 'UNKNOWN',
        name: 'Unknown Token',
        decimals: 18,
        balance: balance.toString(),
        balanceFormatted: formatUnits(balance, 18),
      } satisfies WalletToken;
    })
    .filter((token) => token.balance !== '0')
    .sort((a, b) => Number(b.balance) - Number(a.balance));

  const enriched = await enrichTokenMetadata(tokens);

  return enriched.filter(isForageableToken);
}

export async function enrichTokenMetadata(
  tokens: WalletToken[],
): Promise<WalletToken[]> {
  return Promise.all(
    tokens.map(async (token) => {
      const address = token.address as Address;
      const [alchemy, onChain] = await Promise.all([
        fetchAlchemyTokenMetadata(token.address),
        readOnChainMetadata(address),
      ]);

      const symbol =
        alchemy?.symbol?.trim() ||
        onChain.symbol?.trim() ||
        token.symbol;
      const name =
        alchemy?.name?.trim() || onChain.name?.trim() || token.name;
      const decimals =
        alchemy?.decimals ?? onChain.decimals ?? token.decimals;
      const logoUrl = alchemy?.logo ?? null;

      return {
        ...token,
        symbol,
        name,
        decimals,
        logoUrl,
        balanceFormatted: formatUnits(BigInt(token.balance), decimals),
      };
    }),
  );
}

export { client as publicClient };

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
import {
  PROTECTED_TOKEN_ADDRESSES,
  RPC_URL,
  WLD_ADDRESS,
} from './constants';
import type { WalletToken } from './types';

const client = createPublicClient({
  chain: worldchain,
  transport: http(RPC_URL),
});

type EtherscanToken = {
  contractAddress: string;
  tokenSymbol: string;
  tokenName: string;
  tokenDecimal: string;
  balance: string;
};

export async function fetchWalletTokens(
  walletAddress: string,
): Promise<WalletToken[]> {
  if (!isAddress(walletAddress)) {
    throw new Error('Invalid wallet address');
  }

  const apiKey = process.env.ETHERSCAN_API_KEY;
  if (!apiKey) {
    throw new Error(
      'ETHERSCAN_API_KEY is not configured. Add a free key from etherscan.io to scan wallet tokens.',
    );
  }

  const url = new URL('https://api.etherscan.io/v2/api');
  url.searchParams.set('chainid', '480');
  url.searchParams.set('module', 'account');
  url.searchParams.set('action', 'tokenlist');
  url.searchParams.set('address', walletAddress);
  url.searchParams.set('apikey', apiKey);

  const response = await fetch(url, { next: { revalidate: 30 } });
  const payload = (await response.json()) as {
    status: string;
    message: string;
    result: EtherscanToken[] | string;
  };

  if (payload.status !== '1' || !Array.isArray(payload.result)) {
    const message =
      typeof payload.result === 'string'
        ? payload.result
        : payload.message || 'Failed to load wallet tokens';
    throw new Error(message);
  }

  return payload.result
    .map((token) => {
      const address = getAddress(token.contractAddress);
      const decimals = Number(token.tokenDecimal || 18);
      const balance = BigInt(token.balance || '0');

      return {
        address,
        symbol: token.tokenSymbol || 'UNKNOWN',
        name: token.tokenName || 'Unknown Token',
        decimals,
        balance: balance.toString(),
        balanceFormatted: formatUnits(balance, decimals),
      } satisfies WalletToken;
    })
    .filter(
      (token) =>
        token.balance !== '0' &&
        !PROTECTED_TOKEN_ADDRESSES.has(token.address.toLowerCase()) &&
        token.address.toLowerCase() !== WLD_ADDRESS.toLowerCase(),
    )
    .sort((a, b) => Number(b.balance) - Number(a.balance));
}

export async function enrichTokenMetadata(
  tokens: WalletToken[],
): Promise<WalletToken[]> {
  return Promise.all(
    tokens.map(async (token) => {
      try {
        const [symbol, name, decimals] = await Promise.all([
          client.readContract({
            address: token.address as Address,
            abi: erc20Abi,
            functionName: 'symbol',
          }),
          client.readContract({
            address: token.address as Address,
            abi: erc20Abi,
            functionName: 'name',
          }),
          client.readContract({
            address: token.address as Address,
            abi: erc20Abi,
            functionName: 'decimals',
          }),
        ]);

        return {
          ...token,
          symbol,
          name,
          decimals,
          balanceFormatted: formatUnits(BigInt(token.balance), decimals),
        };
      } catch {
        return token;
      }
    }),
  );
}

export { client as publicClient };

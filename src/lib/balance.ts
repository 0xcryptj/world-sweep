import { formatUnitsCapped } from './format-balance';
import { getAddress, isAddress, type Address } from 'viem';
import { WLD_ADDRESS } from './constants';
import { fetchTokenBalanceWei } from './tokens';

export async function fetchWldBalance(walletAddress: string): Promise<{
  balance: bigint;
  balanceFormatted: string;
  symbol: string;
}> {
  if (!isAddress(walletAddress)) {
    throw new Error('Invalid wallet address');
  }

  const address = getAddress(walletAddress) as Address;
  // Batched Alchemy read (single JSON-RPC call). Avoids the viem readContract
  // path whose error string would embed the keyed RPC URL on a 429.
  const balance = await fetchTokenBalanceWei(address, WLD_ADDRESS);

  return {
    balance,
    balanceFormatted: formatUnitsCapped(balance, 18),
    symbol: 'WLD',
  };
}

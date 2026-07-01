import { PROTECTED_TOKEN_ADDRESSES, WLD_ADDRESS } from './constants';
import type { WalletToken } from './types';

/** Re-prefixed symbols/names are staked yield tokens and cannot be swapped. */
export function isStakedYieldToken(symbol: string, name?: string): boolean {
  const normalizedSymbol = symbol.trim();
  const normalizedName = (name ?? '').trim();

  return (
    normalizedSymbol.startsWith('Re') ||
    normalizedName.startsWith('Re') ||
    /^re[a-z0-9]/i.test(normalizedSymbol)
  );
}

export function isForageableToken(
  token: Pick<WalletToken, 'address' | 'symbol' | 'name' | 'balance'>,
): boolean {
  if (token.balance === '0') {
    return false;
  }

  const address = token.address.toLowerCase();

  if (
    PROTECTED_TOKEN_ADDRESSES.has(address) ||
    address === WLD_ADDRESS.toLowerCase()
  ) {
    return false;
  }

  if (isStakedYieldToken(token.symbol, token.name)) {
    return false;
  }

  return true;
}

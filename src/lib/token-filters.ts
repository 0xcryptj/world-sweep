import { PROTECTED_TOKEN_ADDRESSES, WLD_ADDRESS } from './constants';
import type { WalletToken } from './types';

/**
 * World Chain staked / yield tokens use a Re prefix (ReWLD, RePUF, reWLD, etc.).
 * They cannot be swapped in mini apps and must never enter a forage batch.
 */
export function isStakedYieldToken(symbol: string, name?: string): boolean {
  for (const value of [symbol, name ?? '']) {
    const normalized = value.trim();
    if (!normalized) {
      continue;
    }

    if (/^(Re|re)[A-Z0-9]/.test(normalized)) {
      return true;
    }

    if (/restaked|re[\s-]?staked|staked\s+yield|yield[\s-]?bearing/i.test(normalized)) {
      return true;
    }
  }

  return false;
}

export type TokenExclusionReason =
  | 'zero_balance'
  | 'protected'
  | 'staked_re';

export function getTokenExclusionReason(
  token: Pick<WalletToken, 'address' | 'symbol' | 'name' | 'balance'>,
): TokenExclusionReason | null {
  if (token.balance === '0') {
    return 'zero_balance';
  }

  const address = token.address.toLowerCase();

  if (
    PROTECTED_TOKEN_ADDRESSES.has(address) ||
    address === WLD_ADDRESS.toLowerCase()
  ) {
    return 'protected';
  }

  if (isStakedYieldToken(token.symbol, token.name)) {
    return 'staked_re';
  }

  return null;
}

export function exclusionReasonLabel(reason: TokenExclusionReason): string {
  switch (reason) {
    case 'staked_re':
      return 'Staked yield (Re) — cannot forage';
    case 'protected':
      return 'Protected asset — not foraged';
    case 'zero_balance':
      return 'Zero balance';
  }
}

export function isForageableToken(
  token: Pick<WalletToken, 'address' | 'symbol' | 'name' | 'balance'>,
): boolean {
  return getTokenExclusionReason(token) === null;
}

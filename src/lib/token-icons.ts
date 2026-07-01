import type { WalletToken } from './types';

export const TOKEN_ICON_OVERRIDES: Record<string, string> = {};

function checksumLower(address: string): string {
  return address.toLowerCase();
}

export function getTokenIconUrl(address: string): string {
  return `/api/token-icon?address=${checksumLower(address)}`;
}

export function getTokenIconSources(
  token: Pick<WalletToken, 'address' | 'symbol' | 'logoUrl'>,
): string[] {
  const address = checksumLower(token.address);
  const symbol = token.symbol.toLowerCase();
  const sources: string[] = [getTokenIconUrl(address)];

  const override =
    TOKEN_ICON_OVERRIDES[address] ?? TOKEN_ICON_OVERRIDES[symbol];
  if (override) {
    sources.unshift(override);
  }

  const logo = token.logoUrl?.trim();
  if (logo && !sources.includes(logo)) {
    sources.push(logo);
  }

  // Only real logos — smold/trustwallet return letter placeholders that look worse than coin.svg.
  return [...new Set(sources)];
}

export function tokenIconHue(address: string): number {
  let hash = 0;
  for (let i = 2; i < address.length; i += 1) {
    hash = address.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash) % 360;
}

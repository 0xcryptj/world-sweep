import { PIXEL_ICONS } from './pixel-icons';
import type { WalletToken } from './types';

export const TOKEN_ICON_OVERRIDES: Record<string, string> = {};

export const DEFAULT_TOKEN_ICON = PIXEL_ICONS.coin;

export function resolveTokenIconUrl(
  token: Pick<WalletToken, 'address' | 'symbol' | 'logoUrl'>,
): string {
  const address = token.address.toLowerCase();
  const symbol = token.symbol.toLowerCase();

  return (
    TOKEN_ICON_OVERRIDES[address] ??
    TOKEN_ICON_OVERRIDES[symbol] ??
    token.logoUrl ??
    DEFAULT_TOKEN_ICON
  );
}

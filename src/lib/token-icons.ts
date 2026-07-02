import { PIXEL_ICONS } from './pixel-icons';
import {
  USDC_ADDRESS,
  WBTC_ADDRESS,
  WETH_ADDRESS,
  WLD_ADDRESS,
} from './constants';
import type { WalletToken } from './types';

/** Reliable logos for core World Chain assets (Alchemy often has no logo for WLD). */
export const TOKEN_ICON_OVERRIDES: Record<string, string> = {
  [WLD_ADDRESS.toLowerCase()]:
    'https://assets.coingecko.com/coins/images/31069/small/worldcoin.jpeg',
  wld: 'https://assets.coingecko.com/coins/images/31069/small/worldcoin.jpeg',
  [WETH_ADDRESS.toLowerCase()]:
    'https://assets.coingecko.com/coins/images/2518/small/weth.png',
  weth: 'https://assets.coingecko.com/coins/images/2518/small/weth.png',
  [USDC_ADDRESS.toLowerCase()]:
    'https://assets.coingecko.com/coins/images/6319/small/usdc.png',
  usdc: 'https://assets.coingecko.com/coins/images/6319/small/usdc.png',
  [WBTC_ADDRESS.toLowerCase()]:
    'https://assets.coingecko.com/coins/images/7598/small/wrapped_bitcoin_wbtc.png',
  wbtc: 'https://assets.coingecko.com/coins/images/7598/small/wrapped_bitcoin_wbtc.png',
};

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
  const sources: string[] = [];

  const override =
    TOKEN_ICON_OVERRIDES[address] ?? TOKEN_ICON_OVERRIDES[symbol];
  if (override) {
    sources.push(override);
  }

  const logo = token.logoUrl?.trim();
  if (logo) {
    sources.push(logo);
  }

  // Server-side proxy tries Alchemy, GeckoTerminal, Uniswap list, and DexScreener.
  sources.push(getTokenIconUrl(address));

  return [...new Set(sources)];
}

export const TOKEN_ICON_FALLBACK = PIXEL_ICONS.coin;

export function tokenIconHue(address: string): number {
  let hash = 0;
  for (let i = 2; i < address.length; i += 1) {
    hash = address.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash) % 360;
}

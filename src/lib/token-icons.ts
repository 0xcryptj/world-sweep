import { apiPath, withBasePath } from './base-path';
import {
  USDC_ADDRESS,
  WBTC_ADDRESS,
  WETH_ADDRESS,
  WLD_ADDRESS,
} from './constants';
import { getLocalTokenIconPath } from './token-icon-manifest';
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

export function normalizeTokenLogoUrl(rawUrl: string | null | undefined): string | null {
  const value = rawUrl?.trim();
  if (!value) {
    return null;
  }

  if (value.startsWith('ipfs://')) {
    const path = value.slice('ipfs://'.length).replace(/^ipfs\//, '');
    if (!path) {
      return null;
    }
    return `https://ipfs.io/ipfs/${path}`;
  }

  if (value.startsWith('//')) {
    return `https:${value}`;
  }

  if (/^https?:\/\//i.test(value)) {
    return value;
  }

  return null;
}

/**
 * DexScreener's static token-image CDN. Case-insensitive on the address, but
 * we lowercase for cache-friendliness. Only has images for tokens whose teams
 * bought a DexScreener token profile (~1/6 of World Chain junk tokens).
 */
export function getDexScreenerTokenIconUrl(address: string): string {
  return `https://dd.dexscreener.com/ds-data/tokens/worldchain/${address.toLowerCase()}.png`;
}

/**
 * Ordered icon sources for a token. The server-side /token-icon proxy is the
 * primary source: it also queries the DexScreener, GeckoTerminal and
 * Blockscout metadata APIs (which cover tokens the direct CDN patterns miss)
 * and caches results. The remaining entries are client-side fallbacks in case
 * the proxy route itself fails.
 */
export function getTokenIconSources(
  token: Pick<WalletToken, 'address' | 'symbol' | 'logoUrl'>,
): string[] {
  const address = token.address.toLowerCase();
  const symbol = token.symbol.toLowerCase();
  const sources: string[] = [];
  const normalizedLogo = normalizeTokenLogoUrl(token.logoUrl);

  const localPath = getLocalTokenIconPath(address);
  if (localPath) {
    sources.push(withBasePath(localPath));
  }

  const override =
    TOKEN_ICON_OVERRIDES[address] ?? TOKEN_ICON_OVERRIDES[symbol];
  if (override) {
    sources.push(override);
  }

  const query = new URLSearchParams({ address });
  if (token.symbol) {
    query.set('symbol', token.symbol);
  }
  if (normalizedLogo) {
    query.set('logoUrl', normalizedLogo);
  }
  // Proxy first — it pulls DexScreener pair images, Gecko, and explorer logos
  // instead of 404ing on the static CDN for most World Chain junk tokens.
  sources.push(apiPath(`/token-icon?${query.toString()}`));

  if (normalizedLogo) {
    sources.push(normalizedLogo);
  }

  sources.push(
    `https://cdn.jsdelivr.net/gh/SmolDapp/tokenAssets@master/tokens/480/${address}/logo-128.png`,
  );

  return [...new Set(sources)];
}

export function tokenIconHue(address: string): number {
  let hash = 0;
  for (let i = 2; i < address.length; i += 1) {
    hash = address.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash) % 360;
}

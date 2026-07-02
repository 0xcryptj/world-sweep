import 'server-only';

import { getAddress } from 'viem';
import { WORLD_CHAIN_ID } from './constants';
import { TOKEN_ICON_OVERRIDES } from './token-icons';

const GECKO_NETWORK = 'world-chain';
const GECKO_API = 'https://api.geckoterminal.com/api/v2';
const UNISWAP_TOKEN_LIST_URL = 'https://tokens.uniswap.org';
const DEXSCREENER_CHAIN = 'worldchain';

type GeckoTokenAttributes = {
  address?: string;
  image_url?: string | null;
  image?: {
    small?: string | null;
    thumb?: string | null;
    large?: string | null;
  } | null;
};

type UniswapTokenList = {
  tokens: Array<{
    chainId: number;
    address: string;
    logoURI?: string;
  }>;
};

let uniswapLogoCache: Map<string, string> | null = null;

function normalizeAddress(address: string): string {
  return getAddress(address).toLowerCase();
}

function pickGeckoImage(attributes: GeckoTokenAttributes): string | null {
  const image =
    attributes.image?.small?.trim() ||
    attributes.image?.thumb?.trim() ||
    attributes.image?.large?.trim() ||
    attributes.image_url?.trim();

  return image || null;
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

async function getUniswapLogos(): Promise<Map<string, string>> {
  if (uniswapLogoCache) {
    return uniswapLogoCache;
  }

  const logos = new Map<string, string>();

  try {
    const response = await fetch(UNISWAP_TOKEN_LIST_URL, {
      next: { revalidate: 86_400 },
    });

    if (!response.ok) {
      return logos;
    }

    const payload = (await response.json()) as UniswapTokenList;

    for (const token of payload.tokens ?? []) {
      if (token.chainId !== WORLD_CHAIN_ID) {
        continue;
      }

      const logo = token.logoURI?.trim();
      if (!logo) {
        continue;
      }

      logos.set(normalizeAddress(token.address), logo);
    }

    uniswapLogoCache = logos;
  } catch {
    // Best-effort cache warm-up.
  }

  return logos;
}

async function fetchGeckoTerminalLogos(
  addresses: string[],
): Promise<Map<string, string>> {
  const logos = new Map<string, string>();

  for (const group of chunk(addresses, 30)) {
    if (group.length === 0) {
      continue;
    }

    try {
      const joined = group.map((address) => normalizeAddress(address)).join(',');
      const response = await fetch(
        `${GECKO_API}/networks/${GECKO_NETWORK}/tokens/multi/${joined}`,
        {
          next: { revalidate: 3600 },
          headers: { Accept: 'application/json' },
        },
      );

      if (!response.ok) {
        continue;
      }

      const payload = (await response.json()) as {
        data?: Array<{ attributes?: GeckoTokenAttributes }>;
      };

      for (const item of payload.data ?? []) {
        const attributes = item.attributes;
        const address = attributes?.address;
        const image = attributes ? pickGeckoImage(attributes) : null;

        if (!address || !image) {
          continue;
        }

        logos.set(normalizeAddress(address), image);
      }
    } catch {
      // Try the next batch.
    }
  }

  return logos;
}

async function fetchDexScreenerLogo(address: string): Promise<string | null> {
  try {
    const checksum = getAddress(address);
    const response = await fetch(
      `https://api.dexscreener.com/token-pairs/v1/${DEXSCREENER_CHAIN}/${checksum}`,
      { next: { revalidate: 3600 } },
    );

    if (!response.ok) {
      return null;
    }

    const pairs = (await response.json()) as Array<{
      info?: { imageUrl?: string | null };
    }>;

    for (const pair of pairs ?? []) {
      const image = pair.info?.imageUrl?.trim();
      if (image) {
        return image;
      }
    }
  } catch {
    // No DexScreener profile for this token.
  }

  return null;
}

export async function resolveTokenLogos(
  addresses: string[],
): Promise<Map<string, string>> {
  const logos = new Map<string, string>();
  const uniqueAddresses = [
    ...new Set(addresses.map((address) => normalizeAddress(address))),
  ];

  const unresolved = new Set(uniqueAddresses);

  for (const address of uniqueAddresses) {
    const override = TOKEN_ICON_OVERRIDES[address];
    if (override) {
      logos.set(address, override);
      unresolved.delete(address);
    }
  }

  if (unresolved.size > 0) {
    const geckoLogos = await fetchGeckoTerminalLogos([...unresolved]);
    for (const [address, logo] of geckoLogos) {
      logos.set(address, logo);
      unresolved.delete(address);
    }
  }

  if (unresolved.size > 0) {
    const uniswapLogos = await getUniswapLogos();
    for (const address of [...unresolved]) {
      const logo = uniswapLogos.get(address);
      if (logo) {
        logos.set(address, logo);
        unresolved.delete(address);
      }
    }
  }

  return logos;
}

export async function resolveTokenLogoUrl(
  address: string,
  alchemyLogo?: string | null,
): Promise<string | null> {
  const normalized = normalizeAddress(address);
  const override = TOKEN_ICON_OVERRIDES[normalized];
  if (override) {
    return override;
  }

  const alchemy = alchemyLogo?.trim();
  if (alchemy) {
    return alchemy;
  }

  const resolved = await resolveTokenLogos([address]);
  const cached = resolved.get(normalized);
  if (cached) {
    return cached;
  }

  return fetchDexScreenerLogo(address);
}

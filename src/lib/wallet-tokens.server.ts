import 'server-only';

import { resolveTokenLogos } from './token-logo-resolver';
import { fetchAllWalletTokens } from './tokens';
import type { WalletToken } from './types';

export async function applyResolvedTokenLogos(
  tokens: WalletToken[],
): Promise<WalletToken[]> {
  const missingLogoAddresses = tokens
    .filter((token) => !token.logoUrl?.trim())
    .map((token) => token.address);

  if (missingLogoAddresses.length === 0) {
    return tokens;
  }

  const resolvedLogos = await resolveTokenLogos(missingLogoAddresses);

  return tokens.map((token) => {
    const resolvedLogo = resolvedLogos.get(token.address.toLowerCase());
    if (!resolvedLogo || token.logoUrl?.trim()) {
      return token;
    }

    return {
      ...token,
      logoUrl: resolvedLogo,
    };
  });
}

export async function fetchWalletTokensWithLogos(
  walletAddress: string,
): Promise<WalletToken[]> {
  const tokens = await fetchAllWalletTokens(walletAddress);
  return applyResolvedTokenLogos(tokens);
}

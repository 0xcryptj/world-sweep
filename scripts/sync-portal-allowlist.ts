import { pathToFileURL } from 'node:url';
import { getAddress } from 'viem';
import { PORTAL_CONTRACTS, PORTAL_PERMIT2_TOKENS } from '../src/lib/allowlist';

/**
 * Prints checksummed addresses for Developer Portal Advanced settings.
 * Run: npx tsx scripts/sync-portal-allowlist.ts
 */
export function getPortalAllowlistPayload() {
  return {
    contracts: PORTAL_CONTRACTS.map((address) => getAddress(address)),
    permit2_tokens: PORTAL_PERMIT2_TOKENS.map((address) =>
      getAddress(address),
    ),
  };
}

const isMain =
  typeof process !== 'undefined' &&
  Boolean(process.argv[1]) &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  console.log(JSON.stringify(getPortalAllowlistPayload(), null, 2));
}

import { pathToFileURL } from 'node:url';
import { getAddress } from 'viem';
import {
  PORTAL_PERMIT2_TOKEN_ADDRESSES,
  buildPortalContracts,
  buildPortalPermit2Tokens,
} from '../src/lib/allowlist';

/**
 * Prints checksummed addresses for Developer Portal Advanced settings.
 * Prefer POST /api/portal-allowlist (auto-sync) when WORLD_DEVELOPER_API_KEY is set.
 * Run: npx tsx scripts/sync-portal-allowlist.ts
 */
export function getPortalAllowlistPayload() {
  const permit2_tokens = buildPortalPermit2Tokens(
    PORTAL_PERMIT2_TOKEN_ADDRESSES,
  ).map((address) => getAddress(address));
  const contracts = buildPortalContracts(permit2_tokens).map((address) =>
    getAddress(address),
  );
  return { contracts, permit2_tokens };
}

const isMain =
  typeof process !== 'undefined' &&
  Boolean(process.argv[1]) &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  console.log(JSON.stringify(getPortalAllowlistPayload(), null, 2));
}

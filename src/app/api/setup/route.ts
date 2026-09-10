import { NextResponse } from 'next/server';
import {
  PORTAL_CORE_CONTRACTS,
  PORTAL_PERMIT2_TOKEN_ADDRESSES,
} from '@/lib/allowlist';

/** Checklist for World Developer Portal setup (no secrets) */
export async function GET() {
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() || 'https://forag3r.app/world';

  return NextResponse.json({
    developerPortal: 'https://developer.worldcoin.org/',
    docs: 'https://docs.world.org/mini-apps/commands/send-transaction#allowlisting-contracts-and-tokens',
    recommendedAppUrl: `${siteUrl.replace(/\/$/, '')}/enter`,
    homePath: '/enter',
    env: {
      appId: 'NEXT_PUBLIC_APP_ID',
      developerApiKey: 'WORLD_DEVELOPER_API_KEY',
      syncSecret: 'PORTAL_SYNC_SECRET',
    },
    permissions: {
      contractEntrypoints: PORTAL_CORE_CONTRACTS.map((address) => ({
        address,
        label: 'Core contract (router, Permit2, or WLD)',
      })),
      permit2TokenSeedCount: PORTAL_PERMIT2_TOKEN_ADDRESSES.length,
      permit2TokensSample: PORTAL_PERMIT2_TOKEN_ADDRESSES.slice(0, 8).map(
        (address) => ({
          address,
          label: 'Junk token (auto-synced when forage scan verifies liquidity)',
        }),
      ),
      note:
        'Every ERC-20 sold must be on Permit2 Tokens AND Contract Entrypoints (approve() targets). Scans auto-upsert verified non-malicious tokens via /api/portal-allowlist. After portal updates, wait a few minutes and fully reopen World App. Apps awaiting_review cannot edit allowlists until review is withdrawn or finished.',
    },
  });
}

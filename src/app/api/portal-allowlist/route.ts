import { NextResponse } from 'next/server';
import {
  getPendingAllowlistTokens,
  getSyncState,
  loadDynamicAllowlistAddresses,
} from '@/lib/portal-allowlist-store';
import { KNOWN_LIQUID_PORTAL_TOKENS } from '@/lib/allowlist';
import { discoverLiquidWorldTokens } from '@/lib/liquid-token-discovery';
import { syncPortalAllowlist } from '@/lib/portal-sync';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * POST — merge forageable / discovered token addresses into Developer Portal allowlists.
 * Body: { tokens?: { address, symbol? }[], force?: boolean }
 * Auth: optional PORTAL_SYNC_SECRET via Authorization: Bearer … or x-portal-sync-secret.
 */
export async function POST(request: Request) {
  const secret = process.env.PORTAL_SYNC_SECRET?.trim();
  if (secret) {
    const header =
      request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ||
      request.headers.get('x-portal-sync-secret') ||
      '';
    if (header !== secret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  let body: {
    tokens?: Array<{ address: string; symbol?: string }>;
    force?: boolean;
  } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    body = {};
  }

  const result = await syncPortalAllowlist({
    tokens: body.tokens,
    force: body.force === true,
  });

  return NextResponse.json(result, {
    status: result.ok || result.skipped ? 200 : 502,
  });
}

/** GET — current allowlist sync health (no secrets). */
export async function GET() {
  const [dynamicAddresses, pending, syncState, discovered] = await Promise.all([
    loadDynamicAllowlistAddresses(),
    getPendingAllowlistTokens(),
    getSyncState(),
    discoverLiquidWorldTokens().catch(() => []),
  ]);

  return NextResponse.json({
    appId:
      process.env.NEXT_PUBLIC_APP_ID?.trim() ||
      'app_a05e0d4389f6fa77f5380724caf300bb',
    discoveredLiquidCount: discovered.length,
    discoveredSample: discovered.slice(0, 12),
    dynamicTokenCount: dynamicAddresses.length,
    pendingTokenCount: pending.length,
    pendingTokens: pending.slice(0, 20),
    knownLiquid: KNOWN_LIQUID_PORTAL_TOKENS,
    hasDeveloperApiKey: Boolean(
      process.env.WORLD_DEVELOPER_API_KEY?.trim() ||
        process.env.WORLD_DEVELOPER_PORTAL_API_KEY?.trim(),
    ),
    lastSuccessAt: syncState?.last_success_at ?? null,
    lastAttemptAt: syncState?.last_attempt_at ?? null,
    lastError: syncState?.last_error ?? null,
    note:
      'Forager auto-discovers liquid World Chain tokens and queues them. World App still requires each address on Permit2 + Contract Entrypoints — configure_mini_app pushes the full list. Set WORLD_DEVELOPER_API_KEY on Vercel, then open an unverified draft once if status is changes_requested. After that, no manual token entry.',
  });
}

import 'server-only';

import { after } from 'next/server';
import { getAddress } from 'viem';
import {
  KNOWN_LIQUID_PORTAL_TOKENS,
  PORTAL_CORE_CONTRACTS,
  PORTAL_PERMIT2_TOKEN_ADDRESSES,
  buildPortalContracts,
  buildPortalPermit2Tokens,
  isSafePortalTokenAddress,
  normalizePortalAddress,
} from './allowlist';
import {
  getPendingAllowlistTokens,
  getSyncState,
  loadDynamicAllowlistAddresses,
  markTokensPortalSynced,
  updateSyncState,
  upsertAllowlistTokens,
} from './portal-allowlist-store';
import { discoverLiquidWorldTokens } from './liquid-token-discovery';

const APP_ID =
  process.env.NEXT_PUBLIC_APP_ID?.trim() ||
  'app_a05e0d4389f6fa77f5380724caf300bb';

const DEVELOPER_PORTAL_MCP_URL = 'https://developer.world.org/api/mcp';

/** Minimum gap between portal configure calls (rate / draft churn). */
const MIN_SYNC_INTERVAL_MS = 60_000;

export type PortalSyncResult = {
  ok: boolean;
  skipped: boolean;
  reason?: string;
  added?: number;
  tokenCount?: number;
  contractCount?: number;
  draftCreated?: boolean;
  error?: string;
};

function getDeveloperApiKey(): string | null {
  const key =
    process.env.WORLD_DEVELOPER_API_KEY?.trim() ||
    process.env.WORLD_DEVELOPER_PORTAL_API_KEY?.trim();
  return key || null;
}

function checksumAddresses(addresses: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const address of addresses) {
    const normalized = normalizePortalAddress(address);
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    try {
      out.push(getAddress(normalized));
    } catch {
      // skip invalid
    }
  }
  return out;
}

/**
 * Call Developer Portal MCP `configure_mini_app` over HTTP.
 * Requires WORLD_DEVELOPER_API_KEY (team API key starting with api_).
 */
async function callConfigureMiniApp(payload: {
  contracts: string[];
  permit2_tokens: string[];
}): Promise<{ draft_created?: boolean; raw: unknown }> {
  const apiKey = getDeveloperApiKey();
  if (!apiKey) {
    throw new Error(
      'WORLD_DEVELOPER_API_KEY is not set — cannot sync Developer Portal allowlist',
    );
  }

  const response = await fetch(DEVELOPER_PORTAL_MCP_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'tools/call',
      params: {
        name: 'configure_mini_app',
        arguments: {
          app_id: APP_ID,
          contracts: payload.contracts,
          permit2_tokens: payload.permit2_tokens,
        },
      },
    }),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(
      `Developer Portal MCP HTTP ${response.status}: ${text.slice(0, 400)}`,
    );
  }

  // Streamable HTTP may return SSE (`data: {...}`) or plain JSON.
  const jsonLine =
    text
      .split('\n')
      .map((line) => line.trim())
      .find((line) => line.startsWith('data:'))
      ?.replace(/^data:\s*/, '') ?? text;

  let parsed: {
    error?: { message?: string; code?: number; data?: { reason?: string } };
    result?: { content?: Array<{ type?: string; text?: string }>; structuredContent?: unknown };
  };
  try {
    parsed = JSON.parse(jsonLine) as typeof parsed;
  } catch {
    throw new Error(`Developer Portal MCP returned non-JSON: ${text.slice(0, 400)}`);
  }

  if (parsed.error) {
    const reason =
      parsed.error.data?.reason ||
      parsed.error.message ||
      `MCP error ${parsed.error.code ?? ''}`.trim();
    throw new Error(reason);
  }

  const textContent = parsed.result?.content?.find(
    (item) => item.type === 'text' && item.text,
  )?.text;
  let draftCreated = false;
  if (textContent) {
    try {
      const body = JSON.parse(textContent) as { draft_created?: boolean };
      draftCreated = Boolean(body.draft_created);
    } catch {
      draftCreated = /draft_created["']?\s*:\s*true/i.test(textContent);
    }
  }

  return { draft_created: draftCreated, raw: parsed.result };
}

/**
 * Merge seed + dynamic DB tokens (never wipe unrelated entries), filter
 * malicious, and upsert into Developer Portal Contract Entrypoints + Permit2.
 */
export async function syncPortalAllowlist(options?: {
  tokens?: Array<{ address: string; symbol?: string }>;
  force?: boolean;
}): Promise<PortalSyncResult> {
  const now = Date.now();
  const priorState = await getSyncState();

  // Discover liquid World Chain markets (GeckoTerminal) so we know ORB/ORO/…
  // without hand curation, then merge scan-found + known seed bags.
  let discovered: Array<{ address: string; symbol?: string }> = [];
  try {
    discovered = (await discoverLiquidWorldTokens()).map((token) => ({
      address: token.address,
      symbol: token.symbol,
    }));
  } catch (error) {
    console.warn(
      '[portal-sync] liquid discovery failed',
      error instanceof Error ? error.message : error,
    );
  }

  const incoming = [
    ...KNOWN_LIQUID_PORTAL_TOKENS.map((token) => ({
      address: token.address,
      symbol: token.symbol,
    })),
    ...discovered,
    ...(options?.tokens ?? []),
  ];

  let added = 0;
  if (incoming.length > 0) {
    const safe = incoming.filter((token) =>
      isSafePortalTokenAddress(token.address),
    );
    const inserted = await upsertAllowlistTokens(safe, 'discovery');
    added = inserted.length;
  }

  const dynamic = await loadDynamicAllowlistAddresses();
  const mergedTokens = buildPortalPermit2Tokens([
    ...PORTAL_PERMIT2_TOKEN_ADDRESSES,
    ...dynamic,
  ]);
  const contracts = buildPortalContracts(mergedTokens);
  const pending = await getPendingAllowlistTokens();

  if (!options?.force) {
    const lastSuccess = priorState?.last_success_at
      ? Date.parse(priorState.last_success_at)
      : 0;
    const lastAttempt = priorState?.last_attempt_at
      ? Date.parse(priorState.last_attempt_at)
      : 0;

    // Keep retrying while anything is still unsynced to the portal.
    if (pending.length === 0) {
      if (
        added === 0 &&
        priorState?.last_success_at &&
        now - lastSuccess < MIN_SYNC_INTERVAL_MS
      ) {
        return {
          ok: true,
          skipped: true,
          reason: 'Recently synced; no new tokens',
          added: 0,
          tokenCount: mergedTokens.length,
          contractCount: contracts.length,
        };
      }

      if (
        added === 0 &&
        priorState?.last_success_at &&
        priorState.token_count === mergedTokens.length &&
        now - Math.max(lastSuccess, lastAttempt) < 5 * 60_000
      ) {
        return {
          ok: true,
          skipped: true,
          reason: 'Allowlist unchanged since last successful sync',
          added: 0,
          tokenCount: mergedTokens.length,
          contractCount: contracts.length,
        };
      }
    }
  }

  await updateSyncState({ last_attempt_at: new Date(now).toISOString() });

  if (!getDeveloperApiKey()) {
    const message =
      'WORLD_DEVELOPER_API_KEY missing — liquid tokens are queued automatically in Supabase; set the team API key on Vercel so Forager can push Permit2/Contracts without manual portal edits';
    await updateSyncState({ last_error: message, token_count: mergedTokens.length });
    return {
      ok: false,
      skipped: false,
      reason: message,
      added,
      tokenCount: mergedTokens.length,
      contractCount: contracts.length,
      error: message,
    };
  }

  try {
    const result = await callConfigureMiniApp({
      contracts: checksumAddresses([
        ...PORTAL_CORE_CONTRACTS,
        ...contracts,
      ]),
      permit2_tokens: checksumAddresses(mergedTokens),
    });

    await markTokensPortalSynced(mergedTokens);
    await updateSyncState({
      last_success_at: new Date().toISOString(),
      last_error: null,
      token_count: mergedTokens.length,
    });

    return {
      ok: true,
      skipped: false,
      added,
      tokenCount: mergedTokens.length,
      contractCount: contracts.length,
      draftCreated: result.draft_created,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await updateSyncState({
      last_error: message,
      token_count: mergedTokens.length,
    });

    // awaiting_review / changes_requested locks metadata edits.
    const locked =
      /only unverified|awaiting_review|changes_requested|cannot be edited/i.test(
        message,
      );

    return {
      ok: false,
      skipped: false,
      added,
      tokenCount: mergedTokens.length,
      contractCount: contracts.length,
      error: locked
        ? `${message} — open Developer Portal once and create/edit an unverified draft; Forager will keep auto-pushing liquid tokens after that`
        : message,
      reason: locked ? 'portal_metadata_locked' : 'portal_sync_failed',
    };
  }
}

/**
 * Fire-and-forget sync after a forage scan (or cron).
 * Always runs — even with zero scan tokens — so liquid-market discovery
 * keeps the portal queue warm (ORB and every other liquid bag).
 */
export function queuePortalAllowlistSync(
  tokens: Array<{ address: string; symbol?: string }> = [],
): void {
  const safe = tokens.filter((token) => isSafePortalTokenAddress(token.address));

  const run = () =>
    void syncPortalAllowlist({ tokens: safe }).then((result) => {
      if (!result.ok && result.error) {
        console.warn('[portal-sync]', result.error);
      } else if (result.added && result.added > 0) {
        console.info(
          `[portal-sync] queued/synced ${result.added} new token(s); portal tokens=${result.tokenCount}`,
        );
      }
    });

  try {
    after(run);
  } catch {
    run();
  }
}

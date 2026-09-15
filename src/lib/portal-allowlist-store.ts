import 'server-only';

import {
  normalizePortalAddress,
  isSafePortalTokenAddress,
  setDynamicPermit2Overlay,
} from './allowlist';

type AllowlistRow = {
  address: string;
  symbol: string | null;
  source: string;
  portal_synced_at: string | null;
};

function getSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return null;
  }
  return { url, serviceKey };
}

async function supabaseFetch<T>(
  endpoint: string,
  init?: RequestInit,
): Promise<T | null> {
  const config = getSupabaseConfig();
  if (!config) {
    return null;
  }

  const response = await fetch(`${config.url}/rest/v1/${endpoint}`, {
    ...init,
    headers: {
      apikey: config.serviceKey,
      Authorization: `Bearer ${config.serviceKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(init?.headers ?? {}),
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || 'Supabase request failed');
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

/**
 * Load dynamic portal tokens for sync payloads.
 * Soft-skip overlay only includes tokens already confirmed on the Developer
 * Portal (`portal_synced_at`) — queued-but-unsynced tokens must not enter
 * forage batches or World App rejects with invalid_contract.
 */
export async function loadDynamicAllowlistAddresses(): Promise<string[]> {
  try {
    const rows = await supabaseFetch<AllowlistRow[]>(
      'portal_allowlist_tokens?select=address,symbol,source,portal_synced_at&order=created_at.asc',
    );
    if (!rows) {
      return [];
    }
    const addresses: string[] = [];
    const confirmed: string[] = [];
    for (const row of rows) {
      if (row.source === 'cleanup') {
        continue;
      }
      const address = normalizePortalAddress(row.address);
      if (!address || !isSafePortalTokenAddress(address)) {
        continue;
      }
      addresses.push(address);
      if (row.portal_synced_at) {
        confirmed.push(address);
      }
    }
    setDynamicPermit2Overlay(confirmed);
    return addresses;
  } catch (error) {
    console.warn(
      '[portal-allowlist] failed to load dynamic tokens',
      error instanceof Error ? error.message : error,
    );
    return [];
  }
}

/** Contract-only leftovers — never added to Permit2 / forage. */
export async function loadCleanupContractAddresses(): Promise<string[]> {
  try {
    const rows = await supabaseFetch<AllowlistRow[]>(
      'portal_allowlist_tokens?select=address,source&source=eq.cleanup&order=created_at.asc',
    );
    if (!rows) {
      return [];
    }
    const addresses: string[] = [];
    const seen = new Set<string>();
    for (const row of rows) {
      const address = normalizePortalAddress(row.address);
      if (!address || !isSafePortalTokenAddress(address) || seen.has(address)) {
        continue;
      }
      seen.add(address);
      addresses.push(address);
    }
    return addresses;
  } catch (error) {
    console.warn(
      '[portal-allowlist] failed to load cleanup contracts',
      error instanceof Error ? error.message : error,
    );
    return [];
  }
}

/**
 * Upsert forageable token addresses discovered by scan.
 * Skips malicious / invalid addresses. Returns newly inserted addresses.
 */
export async function upsertAllowlistTokens(
  tokens: Array<{ address: string; symbol?: string }>,
  source = 'scan',
): Promise<string[]> {
  const config = getSupabaseConfig();
  if (!config) {
    return [];
  }

  const payload: Array<{ address: string; symbol: string | null; source: string }> =
    [];
  const seen = new Set<string>();

  for (const token of tokens) {
    const address = normalizePortalAddress(token.address);
    if (!address || !isSafePortalTokenAddress(address) || seen.has(address)) {
      continue;
    }
    seen.add(address);
    payload.push({
      address,
      symbol: token.symbol?.trim() || null,
      source,
    });
  }

  if (payload.length === 0) {
    return [];
  }

  try {
    const existing = await supabaseFetch<Array<{ address: string }>>(
      `portal_allowlist_tokens?select=address&address=in.(${payload
        .map((row) => `"${row.address}"`)
        .join(',')})`,
    );
    const existingSet = new Set(
      (existing ?? []).map((row) => row.address.toLowerCase()),
    );

    const toWrite =
      source === 'cleanup'
        ? payload.filter((row) => !existingSet.has(row.address))
        : payload;

    if (toWrite.length === 0) {
      return [];
    }

    await supabaseFetch('portal_allowlist_tokens', {
      method: 'POST',
      headers: {
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify(toWrite),
    });

    const inserted = toWrite
      .map((row) => row.address)
      .filter((address) => !existingSet.has(address));

    if (inserted.length > 0 || payload.length > 0) {
      await loadDynamicAllowlistAddresses();
    }

    return inserted;
  } catch (error) {
    console.warn(
      '[portal-allowlist] upsert failed',
      error instanceof Error ? error.message : error,
    );
    return [];
  }
}

export async function markTokensPortalSynced(
  addresses: string[],
): Promise<void> {
  const normalized = addresses
    .map((address) => normalizePortalAddress(address))
    .filter((address): address is string => Boolean(address));
  if (normalized.length === 0) {
    return;
  }

  const now = new Date().toISOString();
  try {
    await supabaseFetch(
      `portal_allowlist_tokens?address=in.(${normalized
        .map((address) => `"${address}"`)
        .join(',')})`,
      {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ portal_synced_at: now }),
      },
    );
  } catch (error) {
    console.warn(
      '[portal-allowlist] mark synced failed',
      error instanceof Error ? error.message : error,
    );
  }
}

export async function updateSyncState(update: {
  last_attempt_at?: string;
  last_success_at?: string | null;
  last_error?: string | null;
  token_count?: number;
}): Promise<void> {
  try {
    await supabaseFetch('portal_allowlist_sync_state?id=eq.1', {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        ...update,
        updated_at: new Date().toISOString(),
      }),
    });
  } catch (error) {
    console.warn(
      '[portal-allowlist] sync state update failed',
      error instanceof Error ? error.message : error,
    );
  }
}

export async function getSyncState(): Promise<{
  last_attempt_at: string | null;
  last_success_at: string | null;
  last_error: string | null;
  token_count: number;
} | null> {
  try {
    const rows = await supabaseFetch<
      Array<{
        last_attempt_at: string | null;
        last_success_at: string | null;
        last_error: string | null;
        token_count: number;
      }>
    >('portal_allowlist_sync_state?id=eq.1&select=*&limit=1');
    return rows?.[0] ?? null;
  } catch {
    return null;
  }
}

/** Tokens queued in Supabase that have not been confirmed on Developer Portal. */
export async function getPendingAllowlistTokens(): Promise<
  Array<{ address: string; symbol: string | null }>
> {
  try {
    const rows = await supabaseFetch<AllowlistRow[]>(
      'portal_allowlist_tokens?select=address,symbol,portal_synced_at&portal_synced_at=is.null&order=created_at.asc',
    );
    if (!rows) {
      return [];
    }
    return rows
      .map((row) => {
        const address = normalizePortalAddress(row.address);
        if (!address || !isSafePortalTokenAddress(address)) {
          return null;
        }
        return { address, symbol: row.symbol };
      })
      .filter((row): row is { address: string; symbol: string | null } =>
        Boolean(row),
      );
  } catch (error) {
    console.warn(
      '[portal-allowlist] pending load failed',
      error instanceof Error ? error.message : error,
    );
    return [];
  }
}

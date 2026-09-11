import { apiPath } from './base-path';

const STORAGE_PREFIX = 'forager:wld:';
const FRESH_MS = 8_000;
const STALE_MS = 5 * 60_000;

const inflight = new Map<string, Promise<string | null>>();

type CachedWld = {
  balance: string;
  at: number;
};

function storageKey(walletAddress: string): string {
  return `${STORAGE_PREFIX}${walletAddress.toLowerCase()}`;
}

export function readWldClientCache(
  walletAddress: string,
): { balance: string; ageMs: number } | null {
  if (typeof window === 'undefined' || !walletAddress) {
    return null;
  }

  try {
    const raw = sessionStorage.getItem(storageKey(walletAddress));
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as CachedWld;
    if (parsed.balance == null || typeof parsed.at !== 'number') {
      return null;
    }
    const ageMs = Date.now() - parsed.at;
    if (ageMs > STALE_MS) {
      return null;
    }
    return { balance: parsed.balance, ageMs };
  } catch {
    return null;
  }
}

export function writeWldClientCache(
  walletAddress: string,
  balance: string,
): void {
  if (typeof window === 'undefined' || !walletAddress) {
    return;
  }

  try {
    sessionStorage.setItem(
      storageKey(walletAddress),
      JSON.stringify({ balance, at: Date.now() } satisfies CachedWld),
    );
  } catch {
    /* private mode / quota */
  }
}

export function clearWldClientCache(walletAddress: string): void {
  if (typeof window === 'undefined' || !walletAddress) {
    return;
  }
  try {
    sessionStorage.removeItem(storageKey(walletAddress));
  } catch {
    /* ignore */
  }
}

export function isWldClientCacheFresh(ageMs: number): boolean {
  return ageMs < FRESH_MS;
}

/** One in-flight /balance request per wallet — chip, panel, and scan share it. */
export async function fetchWldBalanceClient(
  walletAddress: string,
  options?: { force?: boolean },
): Promise<string | null> {
  const key = walletAddress.toLowerCase();
  if (!options?.force) {
    const existing = inflight.get(key);
    if (existing) {
      return existing;
    }
  }

  const request = (async () => {
    const query = new URLSearchParams({ address: walletAddress });
    if (options?.force) {
      query.set('refresh', '1');
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 6_000);
    try {
      const response = await fetch(apiPath(`/balance?${query.toString()}`), {
        cache: 'no-store',
        signal: controller.signal,
      });
      const payload = (await response.json()) as {
        wldBalance?: string;
        error?: string;
      };
      if (!response.ok || payload.wldBalance == null) {
        return null;
      }
      writeWldClientCache(walletAddress, payload.wldBalance);
      return payload.wldBalance;
    } catch {
      return null;
    } finally {
      window.clearTimeout(timer);
    }
  })().finally(() => {
    inflight.delete(key);
  });

  inflight.set(key, request);
  return request;
}

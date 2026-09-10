const STORAGE_PREFIX = 'forager:scan:v1:';

export type ClientScanCache = {
  walletAddress: string;
  tokens: unknown[];
  excluded: unknown[];
  savedAt: number;
  mode?: string;
};

export function readClientScanCache(
  walletAddress: string,
): ClientScanCache | null {
  if (typeof window === 'undefined' || !walletAddress) {
    return null;
  }

  try {
    const raw = window.sessionStorage.getItem(
      `${STORAGE_PREFIX}${walletAddress.toLowerCase()}`,
    );
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as ClientScanCache;
    if (
      !parsed ||
      parsed.walletAddress?.toLowerCase() !== walletAddress.toLowerCase()
    ) {
      return null;
    }
    // Drop after 30 minutes — balances go stale.
    if (Date.now() - parsed.savedAt > 30 * 60_000) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function writeClientScanCache(
  walletAddress: string,
  payload: { tokens: unknown[]; excluded: unknown[]; mode?: string },
): void {
  if (typeof window === 'undefined' || !walletAddress) {
    return;
  }

  try {
    const entry: ClientScanCache = {
      walletAddress,
      tokens: payload.tokens,
      excluded: payload.excluded,
      mode: payload.mode,
      savedAt: Date.now(),
    };
    window.sessionStorage.setItem(
      `${STORAGE_PREFIX}${walletAddress.toLowerCase()}`,
      JSON.stringify(entry),
    );
  } catch {
    // Quota / private mode — ignore.
  }
}

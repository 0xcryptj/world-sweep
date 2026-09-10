/**
 * Tiny in-memory TTL cache with optional stale-while-revalidate.
 * Serverless-friendly: lives per isolate, never cross-request durable.
 */

type Entry<T> = {
  value: T;
  freshUntil: number;
  staleUntil: number;
};

const stores = new Map<string, Map<string, Entry<unknown>>>();

function bucket(namespace: string): Map<string, Entry<unknown>> {
  let map = stores.get(namespace);
  if (!map) {
    map = new Map();
    stores.set(namespace, map);
  }
  return map;
}

function prune(map: Map<string, Entry<unknown>>, now: number) {
  if (map.size < 200) {
    return;
  }
  for (const [key, entry] of map) {
    if (entry.staleUntil <= now) {
      map.delete(key);
    }
  }
}

export type CacheLookup<T> =
  | { hit: true; stale: false; value: T }
  | { hit: true; stale: true; value: T }
  | { hit: false; stale: false; value?: undefined };

export function cacheGet<T>(
  namespace: string,
  key: string,
): CacheLookup<T> {
  const map = bucket(namespace);
  const entry = map.get(key.toLowerCase()) as Entry<T> | undefined;
  if (!entry) {
    return { hit: false, stale: false };
  }

  const now = Date.now();
  if (now <= entry.freshUntil) {
    return { hit: true, stale: false, value: entry.value };
  }
  if (now <= entry.staleUntil) {
    return { hit: true, stale: true, value: entry.value };
  }

  map.delete(key.toLowerCase());
  return { hit: false, stale: false };
}

export function cacheSet<T>(
  namespace: string,
  key: string,
  value: T,
  freshMs: number,
  staleMs = freshMs,
): void {
  const map = bucket(namespace);
  const now = Date.now();
  prune(map, now);
  map.set(key.toLowerCase(), {
    value,
    freshUntil: now + Math.max(0, freshMs),
    staleUntil: now + Math.max(freshMs, staleMs),
  });
}

export function cacheDelete(namespace: string, key?: string): void {
  if (!key) {
    stores.delete(namespace);
    return;
  }
  bucket(namespace).delete(key.toLowerCase());
}

/**
 * Return a fresh value, or serve stale while a single in-flight refresh runs.
 * Concurrent callers share the same refresh promise.
 */
const inflight = new Map<string, Promise<unknown>>();

export async function cacheGetOrLoad<T>(
  namespace: string,
  key: string,
  loader: () => Promise<T>,
  options: { freshMs: number; staleMs?: number; force?: boolean },
): Promise<{ value: T; fromCache: boolean; stale: boolean }> {
  const normalized = key.toLowerCase();
  const freshMs = options.freshMs;
  const staleMs = options.staleMs ?? freshMs * 3;
  const flightKey = `${namespace}:${normalized}`;

  if (!options.force) {
    const cached = cacheGet<T>(namespace, normalized);
    if (cached.hit && !cached.stale) {
      return { value: cached.value, fromCache: true, stale: false };
    }

    if (cached.hit && cached.stale) {
      // Kick a background refresh; return stale immediately.
      if (!inflight.has(flightKey)) {
        const refresh = loader()
          .then((value) => {
            cacheSet(namespace, normalized, value, freshMs, staleMs);
            return value;
          })
          .finally(() => {
            inflight.delete(flightKey);
          });
        inflight.set(flightKey, refresh);
      }
      return { value: cached.value, fromCache: true, stale: true };
    }
  } else {
    cacheDelete(namespace, normalized);
  }

  const existing = inflight.get(flightKey) as Promise<T> | undefined;
  if (existing && !options.force) {
    const value = await existing;
    return { value, fromCache: false, stale: false };
  }

  const refresh = loader()
    .then((value) => {
      cacheSet(namespace, normalized, value, freshMs, staleMs);
      return value;
    })
    .finally(() => {
      inflight.delete(flightKey);
    });
  inflight.set(flightKey, refresh);

  const value = await refresh;
  return { value, fromCache: false, stale: false };
}

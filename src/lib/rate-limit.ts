/**
 * Minimal in-memory sliding-window rate limiter.
 *
 * NOTE: State lives in a single serverless instance's memory, so limits are
 * per-instance and reset on cold start. This is a best-effort abuse/cost brake
 * for expensive routes — not a substitute for an edge/WAF rate limit. Swap the
 * backing store for Redis/Upstash if you need global guarantees.
 */
const buckets = new Map<string, number[]>();

const MAX_TRACKED_KEYS = 10_000;

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
};

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now();
  const windowStart = now - windowMs;

  const hits = (buckets.get(key) ?? []).filter(
    (timestamp) => timestamp > windowStart,
  );

  if (hits.length >= limit) {
    const oldest = hits[0];
    return {
      allowed: false,
      remaining: 0,
      retryAfterMs: Math.max(0, oldest + windowMs - now),
    };
  }

  hits.push(now);
  buckets.set(key, hits);

  // Bound memory: drop an arbitrary key if the map grows unbounded.
  if (buckets.size > MAX_TRACKED_KEYS) {
    const firstKey = buckets.keys().next().value;
    if (firstKey !== undefined) {
      buckets.delete(firstKey);
    }
  }

  return {
    allowed: true,
    remaining: limit - hits.length,
    retryAfterMs: 0,
  };
}

/** Best-effort client identifier from proxy headers, falling back to a constant. */
export function clientKeyFromRequest(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0]!.trim();
  }
  return (
    request.headers.get('x-real-ip')?.trim() ||
    request.headers.get('cf-connecting-ip')?.trim() ||
    'unknown'
  );
}

// In-memory per-key fixed-window rate limiter.
//
// Suitable for a single serverless instance / hackathon scale. For multi-region
// production scale, swap the Map for Upstash Redis (the interface stays the
// same). Keys are typically `${userId}:${bucket}`.

interface Window {
  count: number;
  resetAt: number;
}

const store = new Map<string, Window>();

export interface RateLimitResult {
  success: boolean;
  remaining: number;
  limit: number;
  resetAt: number;
}

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now();
  const existing = store.get(key);

  if (!existing || existing.resetAt <= now) {
    const resetAt = now + windowMs;
    store.set(key, { count: 1, resetAt });
    return { success: true, remaining: limit - 1, limit, resetAt };
  }

  if (existing.count >= limit) {
    return { success: false, remaining: 0, limit, resetAt: existing.resetAt };
  }

  existing.count += 1;
  return {
    success: true,
    remaining: limit - existing.count,
    limit,
    resetAt: existing.resetAt,
  };
}

// Opportunistically evict expired windows so the Map does not grow unbounded.
function sweep() {
  const now = Date.now();
  for (const [key, win] of store) {
    if (win.resetAt <= now) store.delete(key);
  }
}

if (typeof setInterval !== "undefined") {
  const t = setInterval(sweep, 60_000);
  // Do not keep the event loop alive just for the sweeper.
  (t as unknown as { unref?: () => void }).unref?.();
}

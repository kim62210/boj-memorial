const WINDOW_MS = 60_000;
const MAX_REQ = 60;

interface GlobalWithRateMap {
  __bojHttpRateMap?: Map<string, number[]>;
}

const ref = globalThis as unknown as GlobalWithRateMap;

function store(): Map<string, number[]> {
  if (!ref.__bojHttpRateMap) ref.__bojHttpRateMap = new Map();
  return ref.__bojHttpRateMap;
}

export interface HttpRateLimitResult {
  ok: boolean;
  remaining: number;
  resetMs: number;
}

/**
 * Sliding-window per-IP HTTP rate limiter. 60 requests / 60 s.
 *
 * Returns `ok:false` when the caller has already consumed the budget.
 * The caller remains responsible for translating `ok:false` into a 429
 * response; this function has no side effects beyond bookkeeping.
 */
export function checkHttpRate(
  ip: string,
  now: number = Date.now(),
): HttpRateLimitResult {
  const map = store();
  const bucket = (map.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (bucket.length >= MAX_REQ) {
    const oldest = bucket[0] ?? now;
    return {
      ok: false,
      remaining: 0,
      resetMs: Math.max(0, WINDOW_MS - (now - oldest)),
    };
  }
  bucket.push(now);
  map.set(ip, bucket);
  return {
    ok: true,
    remaining: MAX_REQ - bucket.length,
    resetMs: WINDOW_MS,
  };
}

// Exposed for tests only — the runtime cleanup interval belongs to the
// custom server (BRI-21), not the route handler surface.
export function __resetHttpRateStoreForTests(): void {
  ref.__bojHttpRateMap = new Map();
}

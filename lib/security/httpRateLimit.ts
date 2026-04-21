const WINDOW_MS = 60_000;
const MAX_REQ = 60;
const CLEANUP_INTERVAL_MS = 60_000;

interface GlobalWithRateMap {
  __bojHttpRateMap?: Map<string, number[]>;
  __bojHttpRateCleanupTimer?: ReturnType<typeof setInterval>;
}

const ref = globalThis as unknown as GlobalWithRateMap;

function store(): Map<string, number[]> {
  if (!ref.__bojHttpRateMap) ref.__bojHttpRateMap = new Map();
  ensureCleanupTimer();
  return ref.__bojHttpRateMap;
}

function cleanupHttpRateStore(now: number = Date.now()): void {
  const map = ref.__bojHttpRateMap;
  if (!map) return;
  for (const [ip, bucket] of map.entries()) {
    const active = bucket.filter((t) => now - t < WINDOW_MS);
    if (active.length === 0) {
      map.delete(ip);
    } else if (active.length !== bucket.length) {
      map.set(ip, active);
    }
  }
}

function ensureCleanupTimer(): void {
  if (ref.__bojHttpRateCleanupTimer) return;
  ref.__bojHttpRateCleanupTimer = setInterval(cleanupHttpRateStore, CLEANUP_INTERVAL_MS);
  ref.__bojHttpRateCleanupTimer.unref?.();
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

export function __cleanupHttpRateStoreForTests(now: number): void {
  cleanupHttpRateStore(now);
}

export function __getHttpRateStoreSizeForTests(): number {
  return ref.__bojHttpRateMap?.size ?? 0;
}

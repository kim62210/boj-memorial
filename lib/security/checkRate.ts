import { rateLimitsRepo } from '@/src/db/repositories/rate-limits';
import type { Database } from '@/src/db/client';

interface GlobalWithRateLimits {
  __bojActionRateMap?: Map<string, number>;
}

const ref = globalThis as unknown as GlobalWithRateLimits;

function store(): Map<string, number> {
  if (!ref.__bojActionRateMap) ref.__bojActionRateMap = new Map();
  return ref.__bojActionRateMap;
}

export interface CheckRateOptions {
  ip: string;
  action: string;
  cooldownMs: number;
  deviceToken?: string | null;
  /**
   * Drizzle database handle. Persistence through the `rate_limits` table is
   * best-effort only — in-memory Map is the authoritative read path, so if the
   * DB write fails the check still behaves correctly. Omit (or pass null) in
   * tests that should not touch the DB.
   */
  db?: Database | null;
  now?: number;
}

/**
 * Returns true when the (ip|deviceToken)+action pair is outside the cooldown
 * window (request allowed). Returns false when still cooling down.
 *
 * When allowed, updates the in-memory Map immediately and fires a DB upsert
 * to `rate_limits` (if `db` is provided) so that container restarts don't
 * reset active cooldowns.
 */
export function checkRate(opts: CheckRateOptions): boolean {
  const { ip, action, cooldownMs, deviceToken, db, now = Date.now() } = opts;
  const map = store();

  const keyIp = `${ip}:${action}`;
  const keyDt = deviceToken ? `dt:${deviceToken}:${action}` : null;

  const lastIp = map.get(keyIp) ?? 0;
  const lastDt = keyDt ? (map.get(keyDt) ?? 0) : 0;

  if (now - lastIp < cooldownMs || now - lastDt < cooldownMs) {
    return false;
  }

  map.set(keyIp, now);
  if (keyDt) map.set(keyDt, now);

  if (db) {
    const repo = rateLimitsRepo(db);
    // Fire-and-forget: tests can await separately if they need ordering.
    void repo.upsert(keyIp).catch((e: unknown) => {
      console.error('rate_limits upsert failed:', (e as Error).message);
    });
    if (keyDt) {
      void repo.upsert(keyDt).catch((e: unknown) => {
        console.error('rate_limits upsert failed:', (e as Error).message);
      });
    }
  }

  return true;
}

export function __resetActionRateStoreForTests(): void {
  ref.__bojActionRateMap = new Map();
}

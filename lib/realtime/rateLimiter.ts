/**
 * IP + deviceToken 기반 액션 쿨다운. 기존 server.js L120-179 동등.
 * Map 기반 슬라이딩 쿨다운 + DB 백업 (재시작 생존) 패턴.
 * BRI-20 완료 시 lib/security/rateLimiter.ts 로 이관 예정.
 */
import { getPool } from '@/lib/db/pool'

export const RATE_LIMIT_TTL_MS = 3_600_000

const state = {
  map: new Map<string, number>(),
  restored: false,
}

function persistRateLimit(key: string): void {
  getPool()
    .query(
      'INSERT INTO rate_limits (key, last_action) VALUES ($1, NOW()) ON CONFLICT (key) DO UPDATE SET last_action = NOW()',
      [key],
    )
    .catch((e: unknown) => {
      const msg = e instanceof Error ? e.message : String(e)
      console.error('Rate limit persist failed:', msg)
    })
}

export async function restoreRateLimits(): Promise<number> {
  if (state.restored) return state.map.size
  const res = await getPool().query<{ key: string; last_action: Date }>(
    "SELECT key, last_action FROM rate_limits WHERE last_action > NOW() - INTERVAL '1 hour'",
  )
  for (const row of res.rows) {
    state.map.set(row.key, new Date(row.last_action).getTime())
  }
  state.restored = true
  console.log(`Restored ${res.rows.length} rate limit entries from DB`)
  return res.rows.length
}

export function checkRate(
  ip: string,
  action: string,
  cooldownMs: number,
  deviceToken: string | null = null,
): boolean {
  const keyIp = `${ip}:${action}`
  const keyDt = deviceToken ? `dt:${deviceToken}:${action}` : null
  const now = Date.now()
  const lastIp = state.map.get(keyIp) ?? 0
  const lastDt = keyDt ? (state.map.get(keyDt) ?? 0) : 0
  if (now - lastIp < cooldownMs || now - lastDt < cooldownMs) return false
  state.map.set(keyIp, now)
  persistRateLimit(keyIp)
  if (keyDt) {
    state.map.set(keyDt, now)
    persistRateLimit(keyDt)
  }
  return true
}

/** 메모리 정리: TTL 초과 키 삭제. instrumentation.ts 에서 1분 주기로 호출. */
export function cleanupRateLimitsMemory(now: number = Date.now()): number {
  let removed = 0
  for (const [key, ts] of state.map) {
    if (now - ts > RATE_LIMIT_TTL_MS) {
      state.map.delete(key)
      removed++
    }
  }
  return removed
}

/** DB 정리: 1시간 초과 행 삭제. instrumentation.ts 에서 10분 주기로 호출. */
export async function cleanupRateLimitsDb(): Promise<void> {
  try {
    await getPool().query("DELETE FROM rate_limits WHERE last_action < NOW() - INTERVAL '1 hour'")
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('Rate limit DB cleanup failed:', msg)
  }
}

/** 테스트 전용 리셋. */
export function __resetRateLimits(): void {
  state.map.clear()
  state.restored = false
}

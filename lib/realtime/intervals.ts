/**
 * 백그라운드 interval 레지스트리. instrumentation.ts 의 register() 에서 호출되어
 * flushFlowers(1s) / cleanupRateLimits(1m) / incense tick(1s) / online emit(5s) 을 관리한다.
 *
 * RFC-BE D4 + BRI-21 Tasks#3 기준. HMR / 중복 register 방지를 위해 globalThis 캐시를 사용한다.
 */
import { flushFlowers } from './flowerBuffer'
import { cleanupRateLimitsDb, cleanupRateLimitsMemory } from './rateLimiter'
import { resetEventCounters } from './socketRateLimit'
import { broadcastOnline, runIncenseTick, type TypedServer } from './socketHandlers'
import { hydrateRealtimeState } from './hydration'

export interface IntervalTunables {
  flushFlowersMs: number
  cleanupRateLimitsMemoryMs: number
  cleanupRateLimitsDbMs: number
  resetEventCountersMs: number
  incenseTickMs: number
  onlineBroadcastMs: number
  hydrateRetryMs: number
}

export const DEFAULT_INTERVALS: IntervalTunables = {
  // BRI-21 Spec: flushFlowers 는 1초 주기 (기존 10초 → 단축)
  flushFlowersMs: 1_000,
  // BRI-21 Spec: cleanupRateLimits 는 1분 주기 (메모리 TTL 정리)
  cleanupRateLimitsMemoryMs: 60_000,
  // DB 정리는 비용이 크므로 기존과 동일 10분 주기 유지
  cleanupRateLimitsDbMs: 600_000,
  // per-socket flood counter 는 기존과 동일 1분 주기
  resetEventCountersMs: 60_000,
  // BRI-21 Spec: incense tick 은 1초 주기 (종료 조건 폴링)
  incenseTickMs: 1_000,
  // online 카운터 브로드캐스트는 기존과 동일 5초 주기
  onlineBroadcastMs: 5_000,
  // 부팅 시 DB hydrate 실패 후 자연 복구되도록 주기적으로 재시도
  hydrateRetryMs: 60_000,
}

const REGISTRY_KEY = Symbol.for('bojmemorial.realtime.intervals')

interface Registry {
  timers: NodeJS.Timeout[]
}

type GlobalWithRegistry = typeof globalThis & {
  [REGISTRY_KEY]?: Registry
}

const globalWithRegistry = globalThis as GlobalWithRegistry

function each(timers: NodeJS.Timeout[], ms: number, fn: () => unknown): void {
  const timer = setInterval(() => {
    try {
      const maybe = fn()
      if (maybe && typeof (maybe as { then?: unknown }).then === 'function') {
        ;(maybe as Promise<unknown>).catch((e: unknown) => {
          const msg = e instanceof Error ? e.message : String(e)
          console.error('Interval task failed:', msg)
        })
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      console.error('Interval task threw:', msg)
    }
  }, ms)
  if (typeof timer.unref === 'function') timer.unref()
  timers.push(timer)
}

/**
 * 전역 interval 을 1회만 등록. 이미 등록돼 있으면 no-op.
 * 반환된 `stop()` 을 SIGTERM 핸들러에서 호출해 타이머를 정리한다.
 */
export function registerIntervals(
  io: TypedServer,
  opts: Partial<IntervalTunables> = {},
): { stop: () => void } {
  if (globalWithRegistry[REGISTRY_KEY]) {
    return { stop: stopIntervals }
  }
  const cfg: IntervalTunables = { ...DEFAULT_INTERVALS, ...opts }
  const timers: NodeJS.Timeout[] = []

  each(timers, cfg.flushFlowersMs, () => flushFlowers())
  each(timers, cfg.cleanupRateLimitsMemoryMs, () => {
    cleanupRateLimitsMemory()
  })
  each(timers, cfg.cleanupRateLimitsDbMs, () => cleanupRateLimitsDb())
  each(timers, cfg.resetEventCountersMs, () => {
    resetEventCounters()
  })
  each(timers, cfg.incenseTickMs, () => runIncenseTick(io))
  each(timers, cfg.onlineBroadcastMs, () => broadcastOnline(io))
  each(timers, cfg.hydrateRetryMs, () => hydrateRealtimeState())

  globalWithRegistry[REGISTRY_KEY] = { timers }
  return { stop: stopIntervals }
}

export function stopIntervals(): void {
  const reg = globalWithRegistry[REGISTRY_KEY]
  if (!reg) return
  for (const t of reg.timers) clearInterval(t)
  delete globalWithRegistry[REGISTRY_KEY]
}

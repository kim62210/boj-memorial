import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  flushFlowers: vi.fn(),
  cleanupRateLimitsMemory: vi.fn(),
  cleanupRateLimitsDb: vi.fn(),
  resetEventCounters: vi.fn(),
  broadcastOnline: vi.fn(),
  runIncenseTick: vi.fn(),
  hydrateRealtimeState: vi.fn(),
}))

vi.mock('./flowerBuffer.js', () => ({
  flushFlowers: mocks.flushFlowers,
}))

vi.mock('./rateLimiter.js', () => ({
  cleanupRateLimitsMemory: mocks.cleanupRateLimitsMemory,
  cleanupRateLimitsDb: mocks.cleanupRateLimitsDb,
}))

vi.mock('./socketRateLimit.js', () => ({
  resetEventCounters: mocks.resetEventCounters,
}))

vi.mock('./socketHandlers.js', () => ({
  broadcastOnline: mocks.broadcastOnline,
  runIncenseTick: mocks.runIncenseTick,
}))

vi.mock('./hydration.js', () => ({
  hydrateRealtimeState: mocks.hydrateRealtimeState,
}))

import { registerIntervals, stopIntervals } from './intervals.js'
import type { TypedServer } from './socketHandlers.js'

describe('realtime intervals', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    stopIntervals()
  })

  afterEach(() => {
    stopIntervals()
    vi.useRealTimers()
  })

  it('periodically retries hydration', async () => {
    registerIntervals({} as TypedServer, {
      hydrateRetryMs: 100,
      flushFlowersMs: 60_000,
      cleanupRateLimitsMemoryMs: 60_000,
      cleanupRateLimitsDbMs: 60_000,
      resetEventCountersMs: 60_000,
      incenseTickMs: 60_000,
      onlineBroadcastMs: 60_000,
    })

    await vi.advanceTimersByTimeAsync(100)

    expect(mocks.hydrateRealtimeState).toHaveBeenCalledTimes(1)
  })
})

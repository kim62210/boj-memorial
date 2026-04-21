import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  hydrateFlowerTotal: vi.fn(),
  hydrateIncenseTotal: vi.fn(),
  restoreRateLimits: vi.fn(),
}))

vi.mock('./flowerBuffer.js', () => ({
  hydrateFlowerTotal: mocks.hydrateFlowerTotal,
}))

vi.mock('./incenseState.js', () => ({
  hydrateIncenseTotal: mocks.hydrateIncenseTotal,
}))

vi.mock('./rateLimiter.js', () => ({
  restoreRateLimits: mocks.restoreRateLimits,
}))

import {
  __resetHydrationState,
  getRealtimeHydrationStatus,
  hydrateRealtimeState,
} from './hydration.js'

describe('realtime hydration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    __resetHydrationState()
    mocks.hydrateFlowerTotal.mockResolvedValue(10)
    mocks.hydrateIncenseTotal.mockResolvedValue(20)
    mocks.restoreRateLimits.mockResolvedValue(2)
  })

  it('stays unhealthy after a failed hydrate and succeeds on a retry', async () => {
    mocks.hydrateFlowerTotal.mockRejectedValueOnce(new Error('db unavailable'))

    await expect(hydrateRealtimeState()).resolves.toBe(false)
    expect(getRealtimeHydrationStatus()).toMatchObject({ hydrated: false, attempts: 1 })

    await expect(hydrateRealtimeState()).resolves.toBe(true)
    expect(getRealtimeHydrationStatus()).toMatchObject({ hydrated: true, attempts: 2 })
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
}))

vi.mock('@/lib/db/pool', () => ({
  getPool: () => mocks,
}))

import {
  RATE_LIMIT_TTL_MS,
  __resetRateLimits,
  checkRate,
  cleanupRateLimitsDb,
  cleanupRateLimitsMemory,
  restoreRateLimits,
} from './rateLimiter.js'

describe('realtime rateLimiter', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-22T00:00:00.000Z'))
    vi.clearAllMocks()
    __resetRateLimits()
    mocks.query.mockResolvedValue({ rows: [] })
  })

  it('applies cooldown to both IP and device token keys', () => {
    expect(checkRate('10.0.0.1', 'comment', 5_000, 'device-a')).toBe(true)
    expect(checkRate('10.0.0.1', 'comment', 5_000, 'device-b')).toBe(false)
    expect(checkRate('10.0.0.2', 'comment', 5_000, 'device-a')).toBe(false)

    vi.advanceTimersByTime(5_000)
    expect(checkRate('10.0.0.1', 'comment', 5_000, 'device-a')).toBe(true)
  })

  it('restores persisted keys once and short-circuits matching actions', async () => {
    mocks.query.mockResolvedValueOnce({
      rows: [{ key: '10.0.0.3:flower', last_action: new Date() }],
    })

    await expect(restoreRateLimits()).resolves.toBe(1)
    await expect(restoreRateLimits()).resolves.toBe(1)

    expect(mocks.query).toHaveBeenCalledTimes(1)
    expect(checkRate('10.0.0.3', 'flower', 2_000)).toBe(false)
  })

  it('drops memory entries after the ttl window', () => {
    expect(checkRate('10.0.0.4', 'incense', 3_000)).toBe(true)
    expect(cleanupRateLimitsMemory(Date.now() + RATE_LIMIT_TTL_MS - 1)).toBe(0)
    expect(cleanupRateLimitsMemory(Date.now() + RATE_LIMIT_TTL_MS + 1)).toBe(1)
  })

  it('swallows database cleanup failures', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mocks.query.mockRejectedValueOnce(new Error('cleanup failed'))

    await expect(cleanupRateLimitsDb()).resolves.toBeUndefined()
    expect(err).toHaveBeenCalledWith('Rate limit DB cleanup failed:', 'cleanup failed')

    err.mockRestore()
  })
})

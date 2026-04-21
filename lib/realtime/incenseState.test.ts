import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
}))

vi.mock('@/lib/db/pool', () => ({
  getPool: () => mocks,
}))

import {
  INCENSE_REPLACE_MS,
  __resetIncenseState,
  beginReplace,
  getEndsAt,
  getIncenseTotal,
  hydrateIncenseTotal,
  isReplacing,
  snapshot,
  tick,
} from './incenseState.js'

describe('realtime incenseState', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    __resetIncenseState()
    mocks.query.mockResolvedValue({ rows: [{ count: 0 }] })
  })

  it('hydrates incense total from the database', async () => {
    mocks.query.mockResolvedValueOnce({ rows: [{ count: 12 }] })

    await expect(hydrateIncenseTotal()).resolves.toBe(12)
    expect(getIncenseTotal()).toBe(12)
    expect(snapshot(100)).toEqual({ replacing: false, durationMs: 0, count: 12 })
  })

  it('starts one replacement at a time and ends on tick', async () => {
    mocks.query.mockResolvedValueOnce({ rows: [{ count: 1 }] })

    const started = await beginReplace(1_000)
    expect(started).toEqual({ durationMs: INCENSE_REPLACE_MS, count: 1, endsAt: 3_800 })
    expect(isReplacing()).toBe(true)
    expect(getEndsAt()).toBe(3_800)
    expect(await beginReplace(1_001)).toBeNull()
    expect(tick(3_799)).toBeNull()
    expect(tick(3_800)).toEqual({ count: 1 })
    expect(isReplacing()).toBe(false)
  })

  it('keeps optimistic count when database increment fails', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mocks.query.mockRejectedValueOnce(new Error('write failed'))

    const started = await beginReplace(5_000)
    expect(started?.count).toBe(1)
    expect(getIncenseTotal()).toBe(1)
    expect(err).toHaveBeenCalledWith('Incense count persist failed:', 'write failed')

    err.mockRestore()
  })
})

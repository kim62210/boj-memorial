import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
}))

vi.mock('@/lib/db/pool', () => ({
  getPool: () => mocks,
}))

import {
  __resetFlowerBuffer,
  flushFlowers,
  getFlowerTotal,
  hydrateFlowerTotal,
  placeFlower,
} from './flowerBuffer.js'

describe('realtime flowerBuffer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    __resetFlowerBuffer()
    mocks.query.mockResolvedValue({ rows: [{ count: 0 }] })
  })

  it('hydrates total and tracks optimistic flower placement', async () => {
    mocks.query.mockResolvedValueOnce({ rows: [{ count: 7 }] })

    await expect(hydrateFlowerTotal()).resolves.toBe(7)
    expect(getFlowerTotal()).toBe(7)
    expect(placeFlower()).toBe(8)
    expect(placeFlower()).toBe(9)
  })

  it('flushes buffered increments and leaves empty buffers untouched', async () => {
    placeFlower()
    placeFlower()

    await expect(flushFlowers()).resolves.toBe(2)
    expect(mocks.query).toHaveBeenCalledWith('UPDATE flowers SET count = count + $1 WHERE id = 1', [
      2,
    ])
    await expect(flushFlowers()).resolves.toBe(0)
  })

  it('requeues buffered flowers when persistence fails', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mocks.query.mockRejectedValueOnce(new Error('db down'))
    placeFlower()

    await expect(flushFlowers()).rejects.toThrow('db down')
    expect(err).toHaveBeenCalledWith('Flower flush failed, re-queued:', 'db down')

    mocks.query.mockResolvedValueOnce({ rows: [] })
    await expect(flushFlowers()).resolves.toBe(1)
    err.mockRestore()
  })
})

import { beforeEach, describe, expect, it } from 'vitest'
import { flowersRepo } from '../repositories/flowers.js'
import { testDb, truncateAll, withRollback } from './fixtures.js'

describe('flowersRepo', () => {
  beforeEach(async () => {
    await truncateAll()
  })

  it('returns 0 after truncate', async () => {
    const repo = flowersRepo(testDb())
    await repo.ensureRow()
    expect(await repo.getCount()).toBe(0)
  })

  it('increments atomically by a delta and returns the new value', async () => {
    await withRollback(async (tx) => {
      const repo = flowersRepo(tx)
      await repo.ensureRow()
      const a = await repo.increment(3)
      const b = await repo.increment(7)
      expect(a).toBe(3)
      expect(b).toBe(10)
    })
  })

  it('rejects non-integer deltas', async () => {
    await withRollback(async (tx) => {
      const repo = flowersRepo(tx)
      await expect(repo.increment(1.5)).rejects.toThrow()
    })
  })
})

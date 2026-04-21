import { beforeEach, describe, expect, it } from 'vitest'
import { incenseRepo } from '../repositories/incense.js'
import { testDb, truncateAll } from './fixtures.js'

describe('incenseRepo', () => {
  beforeEach(async () => {
    await truncateAll()
  })

  it('increments by 1 by default', async () => {
    const repo = incenseRepo(testDb())
    expect(await repo.getCount()).toBe(0)
    const next = await repo.increment()
    expect(next).toBe(1)
    expect(await repo.getCount()).toBe(1)
  })

  it('is atomic under 10 concurrent increments', async () => {
    const repo = incenseRepo(testDb())
    expect(await repo.getCount()).toBe(0)

    const N = 10
    // Fire all increments in parallel. UPDATE ... SET count = count + 1
    // must serialise under row-level locks.
    const results = await Promise.all(Array.from({ length: N }, () => repo.increment(1)))

    expect(results).toHaveLength(N)
    // All returned counts should be distinct and in range [1..N]
    const sorted = [...results].sort((a, b) => a - b)
    expect(sorted).toEqual(Array.from({ length: N }, (_, i) => i + 1))

    expect(await repo.getCount()).toBe(N)
  })
})

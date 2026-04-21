import { beforeEach, describe, expect, it } from 'vitest'
import { rateLimitsRepo } from '../repositories/rate-limits.js'
import { testDb, testPool, truncateAll } from './fixtures.js'

describe('rateLimitsRepo', () => {
  beforeEach(async () => {
    await truncateAll()
  })

  it('upsert inserts once and updates last_action on conflict', async () => {
    const repo = rateLimitsRepo(testDb())
    await repo.upsert('1.2.3.4:flower')

    const first = await testPool().query('SELECT last_action FROM rate_limits WHERE key = $1', [
      '1.2.3.4:flower',
    ])
    const firstTime: Date = first.rows[0].last_action

    // small pause so the timestamp definitely advances
    await new Promise((r) => setTimeout(r, 25))

    await repo.upsert('1.2.3.4:flower')
    const second = await testPool().query('SELECT last_action FROM rate_limits WHERE key = $1', [
      '1.2.3.4:flower',
    ])
    const secondTime: Date = second.rows[0].last_action

    expect(secondTime.getTime()).toBeGreaterThan(firstTime.getTime())
  })

  it('listRecent returns entries within the interval only', async () => {
    const pool = testPool()
    const repo = rateLimitsRepo(testDb())

    await repo.upsert('fresh')
    await pool.query(
      "INSERT INTO rate_limits (key, last_action) VALUES ($1, NOW() - INTERVAL '2 hours')",
      ['stale'],
    )

    const recent = await repo.listRecent(1)
    const keys = recent.map((r) => r.key)
    expect(keys).toContain('fresh')
    expect(keys).not.toContain('stale')
  })

  it('cleanup deletes rows older than the interval', async () => {
    const pool = testPool()
    const repo = rateLimitsRepo(testDb())

    await pool.query(
      "INSERT INTO rate_limits (key, last_action) VALUES ($1, NOW() - INTERVAL '2 hours')",
      ['old-1'],
    )
    await pool.query(
      "INSERT INTO rate_limits (key, last_action) VALUES ($1, NOW() - INTERVAL '90 minutes')",
      ['old-2'],
    )
    await repo.upsert('fresh')

    const deleted = await repo.cleanup(1)
    expect(deleted).toBe(2)

    const res = await pool.query('SELECT key FROM rate_limits ORDER BY key')
    expect(res.rows.map((r) => r.key)).toEqual(['fresh'])
  })
})

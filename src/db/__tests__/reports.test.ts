import { describe, expect, it } from 'vitest'
import { reportsRepo } from '../repositories/reports.js'
import { withRollback } from './fixtures.js'

describe('reportsRepo', () => {
  it('inserts a report with all fields', async () => {
    await withRollback(async (tx) => {
      const repo = reportsRepo(tx)
      const row = await repo.insert({
        commentId: 42,
        reason: 'spam',
        ip: '1.2.3.4',
      })
      expect(row.id).toBeGreaterThan(0)
      expect(row.reason).toBe('spam')
      expect(row.commentId).toBe(42)
      expect(row.ip).toBe('1.2.3.4')
      expect(row.createdAt).toBeInstanceOf(Date)
    })
  })

  it('allows null comment_id (report without specific target)', async () => {
    await withRollback(async (tx) => {
      const repo = reportsRepo(tx)
      const row = await repo.insert({ reason: 'general', ip: '1.1.1.1' })
      expect(row.commentId).toBeNull()
    })
  })
})

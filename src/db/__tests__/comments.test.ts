import { describe, expect, it } from 'vitest'
import { commentsRepo } from '../repositories/comments.js'
import { withRollback } from './fixtures.js'

describe('commentsRepo', () => {
  it('inserts and reads back a comment with default nickname', async () => {
    await withRollback(async (tx) => {
      const repo = commentsRepo(tx)
      const inserted = await repo.insert({
        message: '안녕히 가세요',
        ip: '127.0.0.1',
        deviceToken: 'dt-1',
        userAgent: 'test-ua',
      })
      expect(inserted.id).toBeGreaterThan(0)
      expect(inserted.nickname).toBe('익명의 개발자')
      expect(inserted.message).toBe('안녕히 가세요')
      expect(inserted.createdAt).toBeInstanceOf(Date)
    })
  })

  it('respects provided nickname and returns it intact', async () => {
    await withRollback(async (tx) => {
      const repo = commentsRepo(tx)
      const inserted = await repo.insert({
        nickname: 'Alice',
        message: 'rest in peace',
      })
      expect(inserted.nickname).toBe('Alice')
    })
  })

  it('lists comments ordered by created_at DESC with pagination', async () => {
    await withRollback(async (tx) => {
      const repo = commentsRepo(tx)
      // Inside a Postgres transaction NOW() is frozen at tx start, so multiple
      // inserts collide on created_at. Pass explicit timestamps to keep ordering
      // deterministic.
      const base = Date.now()
      for (let i = 0; i < 5; i++) {
        await repo.insert({
          nickname: `user${i}`,
          message: `msg${i}`,
          createdAt: new Date(base + i * 1000),
        })
      }

      const page0 = await repo.list({ limit: 3, offset: 0 })
      expect(page0).toHaveLength(3)
      const page1 = await repo.list({ limit: 3, offset: 3 })
      expect(page1).toHaveLength(2)

      // newest first
      const allIds = [...page0, ...page1].map((c) => c.id)
      const sortedDesc = [...allIds].sort((a, b) => b - a)
      expect(allIds).toEqual(sortedDesc)
    })
  })

  it('counts comments scoped to the transaction', async () => {
    await withRollback(async (tx) => {
      const repo = commentsRepo(tx)
      const before = await repo.count()
      await repo.insert({ nickname: 'x', message: 'y' })
      await repo.insert({ nickname: 'x', message: 'z' })
      const after = await repo.count()
      expect(after).toBe(before + 2)
    })
  })

  it('getById returns null for missing id', async () => {
    await withRollback(async (tx) => {
      const repo = commentsRepo(tx)
      const found = await repo.getById(-1)
      expect(found).toBeNull()
    })
  })
})

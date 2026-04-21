import { eq, sql } from 'drizzle-orm'
import type { Database } from '../client.js'
import { flowers } from '../schema.js'

const SINGLETON_ID = 1 as const

export function flowersRepo(db: Database) {
  return {
    async ensureRow(): Promise<void> {
      await db.insert(flowers).values({ id: SINGLETON_ID, count: 0 }).onConflictDoNothing()
    },

    async getCount(): Promise<number> {
      const [row] = await db
        .select({ count: flowers.count })
        .from(flowers)
        .where(eq(flowers.id, SINGLETON_ID))
      return row?.count ?? 0
    },

    async increment(by: number): Promise<number> {
      if (!Number.isInteger(by)) {
        throw new Error('flowers.increment requires an integer delta')
      }
      const [row] = await db
        .update(flowers)
        .set({ count: sql`${flowers.count} + ${by}` })
        .where(eq(flowers.id, SINGLETON_ID))
        .returning({ count: flowers.count })
      if (!row) {
        throw new Error('flowers row (id=1) is missing — call ensureRow() first')
      }
      return row.count
    },
  }
}

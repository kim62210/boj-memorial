import { eq, sql } from 'drizzle-orm';
import type { Database } from '../client';
import { incense } from '../schema';

const SINGLETON_ID = 1 as const

export function incenseRepo(db: Database) {
  return {
    async ensureRow(): Promise<void> {
      await db.insert(incense).values({ id: SINGLETON_ID, count: 0 }).onConflictDoNothing()
    },

    async getCount(): Promise<number> {
      const [row] = await db
        .select({ count: incense.count })
        .from(incense)
        .where(eq(incense.id, SINGLETON_ID))
      return row?.count ?? 0
    },

    async increment(by = 1): Promise<number> {
      if (!Number.isInteger(by)) {
        throw new Error('incense.increment requires an integer delta')
      }
      const [row] = await db
        .update(incense)
        .set({ count: sql`${incense.count} + ${by}` })
        .where(eq(incense.id, SINGLETON_ID))
        .returning({ count: incense.count })
      if (!row) {
        throw new Error('incense row (id=1) is missing — call ensureRow() first')
      }
      return row.count
    },
  }
}

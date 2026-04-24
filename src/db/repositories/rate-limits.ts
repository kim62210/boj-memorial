import { sql } from 'drizzle-orm';
import type { Database } from '../client';
import { rateLimits, type RateLimit } from '../schema';

export function rateLimitsRepo(db: Database) {
  return {
    async upsert(key: string): Promise<void> {
      await db
        .insert(rateLimits)
        .values({ key })
        .onConflictDoUpdate({
          target: rateLimits.key,
          set: { lastAction: sql`NOW()` },
        })
    },

    async listRecent(intervalHours = 1): Promise<RateLimit[]> {
      return db
        .select()
        .from(rateLimits)
        .where(sql`${rateLimits.lastAction} > NOW() - make_interval(hours => ${intervalHours})`)
    },

    async cleanup(intervalHours = 1): Promise<number> {
      const rows = await db
        .delete(rateLimits)
        .where(sql`${rateLimits.lastAction} < NOW() - make_interval(hours => ${intervalHours})`)
        .returning({ key: rateLimits.key })
      return rows.length
    },
  }
}

import { count, desc, eq } from 'drizzle-orm';
import type { Database } from '../client';
import { comments, type Comment, type NewComment } from '../schema';

export interface ListCommentsOptions {
  limit: number
  offset: number
}

export interface PublicComment {
  id: number
  nickname: string
  message: string
  createdAt: Date | null
}

export function commentsRepo(db: Database) {
  return {
    async list({ limit, offset }: ListCommentsOptions): Promise<PublicComment[]> {
      return db
        .select({
          id: comments.id,
          nickname: comments.nickname,
          message: comments.message,
          createdAt: comments.createdAt,
        })
        .from(comments)
        .orderBy(desc(comments.createdAt))
        .limit(limit)
        .offset(offset)
    },

    async count(): Promise<number> {
      const [row] = await db.select({ cnt: count() }).from(comments)
      return row ? Number(row.cnt) : 0
    },

    async insert(input: NewComment): Promise<PublicComment> {
      const [row] = await db.insert(comments).values(input).returning({
        id: comments.id,
        nickname: comments.nickname,
        message: comments.message,
        createdAt: comments.createdAt,
      })
      if (!row) {
        throw new Error('INSERT into comments returned no rows')
      }
      return row
    },

    async getById(id: number): Promise<Comment | null> {
      const rows = await db.select().from(comments).where(eq(comments.id, id)).limit(1)
      return rows[0] ?? null
    },
  }
}

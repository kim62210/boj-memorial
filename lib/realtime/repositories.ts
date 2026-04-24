/**
 * 임시 repository 어댑터. BRI-19 (Drizzle ORM) 병합 전까지 raw pg 로 동작하며
 * commentsRepo / reportsRepo 의 공개 API 형태를 미리 고정한다.
 * BRI-19 병합 시 이 파일은 `@/db/repositories` 재export 로 치환 예정.
 */
import { getPool } from '@/lib/db/pool'
import type { CommentRow } from './types'

export interface InsertCommentInput {
  nickname: string
  message: string
  ip: string
  deviceToken: string | null
  userAgent: string
}

export const commentsRepo = {
  async insert(input: InsertCommentInput): Promise<CommentRow> {
    const { nickname, message, ip, deviceToken, userAgent } = input
    const res = await getPool().query<CommentRow>(
      `INSERT INTO comments (nickname, message, ip, device_token, user_agent)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, nickname, message, created_at`,
      [nickname, message, ip, deviceToken, userAgent],
    )
    const row = res.rows[0]
    if (!row) throw new Error('Comment insert returned no row')
    return row
  },
}

export interface InsertReportInput {
  commentId: number | null
  reason: string
  ip: string
}

export const reportsRepo = {
  async insert(input: InsertReportInput): Promise<void> {
    await getPool().query('INSERT INTO reports (comment_id, reason, ip) VALUES ($1, $2, $3)', [
      input.commentId,
      input.reason,
      input.ip,
    ])
  },
}

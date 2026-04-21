import { sql } from 'drizzle-orm'
import { check, index, integer, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core'

// Note: index column order is expressed via `.desc()` rather than a raw
// `sql`${col} DESC`` template, so that `drizzle-kit introspect` and the schema
// round-trip to identical DDL against the live production DB.

export const comments = pgTable(
  'comments',
  {
    id: serial('id').primaryKey(),
    nickname: text('nickname').notNull().default('익명의 개발자'),
    message: text('message').notNull(),
    ip: text('ip'),
    deviceToken: text('device_token'),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (t) => [
    index('idx_comments_created').on(t.createdAt.desc()),
    index('idx_comments_device_token').on(t.deviceToken),
  ],
)

export const flowers = pgTable(
  'flowers',
  {
    id: integer('id').primaryKey(),
    count: integer('count').notNull().default(0),
  },
  (t) => [check('flowers_singleton', sql`${t.id} = 1`)],
)

export const reports = pgTable('reports', {
  id: serial('id').primaryKey(),
  commentId: integer('comment_id'),
  reason: text('reason'),
  ip: text('ip'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
})

export const rateLimits = pgTable(
  'rate_limits',
  {
    key: text('key').primaryKey(),
    lastAction: timestamp('last_action', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('idx_rate_limits_time').on(t.lastAction)],
)

export const incense = pgTable(
  'incense',
  {
    id: integer('id').primaryKey(),
    count: integer('count').notNull().default(0),
  },
  (t) => [check('incense_singleton', sql`${t.id} = 1`)],
)

export type Comment = typeof comments.$inferSelect
export type NewComment = typeof comments.$inferInsert
export type Flower = typeof flowers.$inferSelect
export type Report = typeof reports.$inferSelect
export type NewReport = typeof reports.$inferInsert
export type RateLimit = typeof rateLimits.$inferSelect
export type Incense = typeof incense.$inferSelect

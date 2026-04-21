import { drizzle } from 'drizzle-orm/node-postgres'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { Pool } from 'pg'
import { beforeAll, afterAll } from 'vitest'
import type { Database } from '../client.js'
import * as schema from '../schema.js'

class RollbackSignal extends Error {
  constructor() {
    super('test-rollback')
    this.name = 'RollbackSignal'
  }
}

let pool: Pool | null = null
let db: Database | null = null
let schemaReady = false

export function testPool(): Pool {
  if (!pool) {
    const url = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL
    if (!url) {
      throw new Error('TEST_DATABASE_URL (or DATABASE_URL) must be set for repository tests')
    }
    pool = new Pool({
      connectionString: url,
      max: 10,
      idleTimeoutMillis: 10000,
      connectionTimeoutMillis: 5000,
    })
  }
  return pool
}

export function testDb(): Database {
  if (!db) {
    db = drizzle({ client: testPool(), schema })
  }
  return db
}

/**
 * Run `fn` inside a transaction, then roll back. Returns whatever `fn` returns.
 * Use this to isolate integration tests from each other without truncating.
 */
export async function withRollback<T>(fn: (tx: Database) => Promise<T>): Promise<T> {
  let result: T | undefined
  let captured: unknown = null
  try {
    await testDb().transaction(async (tx) => {
      try {
        result = await fn(tx as unknown as Database)
      } catch (e) {
        captured = e
      }
      throw new RollbackSignal()
    })
  } catch (e) {
    if (!(e instanceof RollbackSignal)) throw e
  }
  if (captured) throw captured
  return result as T
}

export async function truncateAll(): Promise<void> {
  const client = testPool()
  await client.query('TRUNCATE TABLE comments, reports, rate_limits RESTART IDENTITY CASCADE')
  await client.query('UPDATE flowers SET count = 0 WHERE id = 1')
  await client.query('UPDATE incense SET count = 0 WHERE id = 1')
}

async function ensureSchema(): Promise<void> {
  if (schemaReady) return
  const migration = readFileSync(resolve(process.cwd(), 'drizzle/migrations/0000_init.sql'), 'utf8')
  await testPool().query(migration)
  schemaReady = true
}

beforeAll(async () => {
  // Ensure singleton rows exist (mirrors legacy initDB seed behaviour).
  await ensureSchema()
  const client = testPool()
  await client.query('INSERT INTO flowers (id, count) VALUES (1, 0) ON CONFLICT DO NOTHING')
  await client.query('INSERT INTO incense (id, count) VALUES (1, 0) ON CONFLICT DO NOTHING')
})

afterAll(async () => {
  if (pool) {
    await pool.end()
    pool = null
    db = null
    schemaReady = false
  }
})

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

export type Database = ReturnType<typeof drizzle<typeof schema>>

interface GlobalWithPool {
  __bojMemorialPool?: Pool
  __bojMemorialDb?: Database
}

const globalRef = globalThis as unknown as GlobalWithPool

export function getDatabaseUrl(): string {
  const url = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL
  if (!url) {
    throw new Error('TEST_DATABASE_URL or DATABASE_URL environment variable is not set')
  }
  return url
}

function buildPool(): Pool {
  const url = getDatabaseUrl()
  return new Pool({
    connectionString: url,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  })
}

export function getPool(): Pool {
  if (!globalRef.__bojMemorialPool) {
    globalRef.__bojMemorialPool = buildPool()
  }
  return globalRef.__bojMemorialPool
}

export function getDb(): Database {
  if (!globalRef.__bojMemorialDb) {
    globalRef.__bojMemorialDb = drizzle({ client: getPool(), schema })
  }
  return globalRef.__bojMemorialDb
}

export async function closeDb(): Promise<void> {
  if (globalRef.__bojMemorialPool) {
    await globalRef.__bojMemorialPool.end()
    globalRef.__bojMemorialPool = undefined
    globalRef.__bojMemorialDb = undefined
  }
}

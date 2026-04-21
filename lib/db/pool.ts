/**
 * pg.Pool 싱글턴. BRI-19 (Drizzle ORM) 완료 시 db/client.ts 로 이관 예정이며
 * repository 모듈이 이 pool 을 주입받아 사용한다.
 *
 * HMR 안전: globalThis 캐시를 통해 dev 서버 재로드 시 중복 Pool 생성을 방지한다.
 */
import { Pool, type PoolConfig } from 'pg'

const POOL_KEY = Symbol.for('bojmemorial.pg.pool')

type GlobalWithPool = typeof globalThis & {
  [POOL_KEY]?: Pool
}

const globalWithPool = globalThis as GlobalWithPool

function buildPool(): Pool {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error('FATAL: DATABASE_URL environment variable is not set')
  }
  const config: PoolConfig = {
    connectionString,
    max: 20,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  }
  return new Pool(config)
}

export function getPool(): Pool {
  if (!globalWithPool[POOL_KEY]) {
    globalWithPool[POOL_KEY] = buildPool()
  }
  return globalWithPool[POOL_KEY]
}

export async function closePool(): Promise<void> {
  const existing = globalWithPool[POOL_KEY]
  if (existing) {
    delete globalWithPool[POOL_KEY]
    await existing.end()
  }
}

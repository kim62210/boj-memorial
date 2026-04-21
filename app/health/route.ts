import { getDb } from '@/src/db/client';
import { sql } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

const startedAt = Date.now();

/**
 * Caddy blue/green health check contract. MUST return `200 "ok"` (text/plain)
 * when the DB is reachable, `503` when it is not. Do not change the response
 * body without updating the Caddy upstream probe in `brian-dev-cloud`.
 */
export async function GET(): Promise<Response> {
  try {
    const db = getDb();
    await db.execute(sql`SELECT 1`);
    const uptimeMs = Date.now() - startedAt;
    return new Response('ok', {
      status: 200,
      headers: {
        'content-type': 'text/plain; charset=utf-8',
        'cache-control': 'no-store',
        'x-uptime-ms': String(uptimeMs),
      },
    });
  } catch (e) {
    console.error('/health DB ping failed:', (e as Error).message);
    return new Response('unavailable', {
      status: 503,
      headers: {
        'content-type': 'text/plain; charset=utf-8',
        'cache-control': 'no-store',
      },
    });
  }
}

import { NextResponse } from 'next/server';

import { getRequestContext } from '@/lib/api/context';
import { internalError, rateLimited } from '@/lib/api/errors';
import { checkHttpRate } from '@/lib/security/httpRateLimit';
import { getDb } from '@/src/db/client';
import { commentsRepo } from '@/src/db/repositories/comments';
import { flowersRepo } from '@/src/db/repositories/flowers';

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  const { ip } = getRequestContext(request);
  const rate = checkHttpRate(ip);
  if (!rate.ok) return rateLimited(Math.ceil(rate.resetMs / 1000));

  try {
    const db = getDb();
    const [comments, flowers] = await Promise.all([
      commentsRepo(db).count(),
      flowersRepo(db).getCount(),
    ]);
    return NextResponse.json({ flowers, comments });
  } catch (e) {
    console.error('GET /api/stats failed:', (e as Error).message);
    return internalError();
  }
}

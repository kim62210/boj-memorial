import { NextResponse } from 'next/server';

import { internalError, rateLimited, validationError } from '@/lib/api/errors';
import { getRequestContext } from '@/lib/api/context';
import { checkHttpRate } from '@/lib/security/httpRateLimit';
import { listHistoryQuerySchema } from '@/lib/validation/schemas';
import { getDb } from '@/src/db/client';
import { commentsRepo } from '@/src/db/repositories/comments';

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  const { ip } = getRequestContext(request);
  const rate = checkHttpRate(ip);
  if (!rate.ok) return rateLimited(Math.ceil(rate.resetMs / 1000));

  const url = new URL(request.url);
  const parsed = listHistoryQuerySchema.safeParse({
    page: url.searchParams.get('page') ?? undefined,
    limit: url.searchParams.get('limit') ?? undefined,
  });
  if (!parsed.success) return validationError(parsed.error);

  const { page, limit } = parsed.data;
  const offset = page * limit;

  try {
    const repo = commentsRepo(getDb());
    const [items, total] = await Promise.all([repo.list({ limit, offset }), repo.count()]);
    return NextResponse.json(
      {
        comments: items.map((c) => ({
          id: c.id,
          nickname: c.nickname,
          message: c.message,
          created_at: c.createdAt,
        })),
        total,
        page,
        hasMore: offset + limit < total,
      },
      { headers: { 'Cache-Control': 'public, max-age=5' } },
    );
  } catch (e) {
    console.error('GET /api/history failed:', (e as Error).message);
    return internalError();
  }
}

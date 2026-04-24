import { NextResponse } from 'next/server';
import { z } from 'zod';

import { getRequestContext, readJsonBody } from '@/lib/api/context';
import {
  badRequest,
  internalError,
  rateLimited,
  validationError,
} from '@/lib/api/errors';
import { checkRate } from '@/lib/security/checkRate';
import { escapeHtml } from '@/lib/security/escapeHtml';
import { checkHttpRate } from '@/lib/security/httpRateLimit';
import { isNicknameForbidden } from '@/lib/security/forbiddenNicknames';
import {
  createCommentSchema,
  listCommentsQuerySchema,
} from '@/lib/validation/schemas';
import { getDb } from '@/src/db/client';
import { commentsRepo } from '@/src/db/repositories/comments';
import { flowersRepo } from '@/src/db/repositories/flowers';

// Next.js App Router Route Handlers are dynamic by default for POST, but
// explicit opt-out of static caching keeps GET behaviour consistent with
// the previous Express handler (no caching at the app layer; Caddy/CDN may
// still add Cache-Control as needed).
export const dynamic = 'force-dynamic';

const DEFAULT_NICKNAME = '익명의 개발자';
const COMMENT_COOLDOWN_MS = 5000;

export async function GET(request: Request): Promise<Response> {
  const { ip } = getRequestContext(request);
  const rate = checkHttpRate(ip);
  if (!rate.ok) return rateLimited(Math.ceil(rate.resetMs / 1000));

  const url = new URL(request.url);
  const parsed = listCommentsQuerySchema.safeParse({
    page: url.searchParams.get('page') ?? undefined,
    limit: url.searchParams.get('limit') ?? undefined,
  });
  if (!parsed.success) return validationError(parsed.error);

  const { page, limit } = parsed.data;
  const offset = page * limit;

  try {
    const db = getDb();
    const repo = commentsRepo(db);
    const [items, total] = await Promise.all([repo.list({ limit, offset }), repo.count()]);
    return NextResponse.json({
      comments: items.map((c) => ({
        id: c.id,
        nickname: c.nickname,
        message: c.message,
        created_at: c.createdAt,
      })),
      total,
      page,
      hasMore: offset + items.length < total,
    });
  } catch (e) {
    console.error('GET /api/comments failed:', (e as Error).message);
    return internalError();
  }
}

export async function POST(request: Request): Promise<Response> {
  const { ip, userAgent } = getRequestContext(request);

  const httpRate = checkHttpRate(ip);
  if (!httpRate.ok) return rateLimited(Math.ceil(httpRate.resetMs / 1000));

  const body = await readJsonBody(request);
  if (body === null) return badRequest('Request body must be JSON ≤ 1KiB');

  const parsed = createCommentSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);

  const { nickname: rawNickname, content, message, deviceToken } = parsed.data;
  const nickname = rawNickname.length > 0 ? rawNickname.slice(0, 30) : DEFAULT_NICKNAME;
  if (isNicknameForbidden(nickname)) {
    return NextResponse.json(
      { detail: '사용할 수 없는 닉네임입니다.', code: 'FORBIDDEN_NICKNAME' },
      { status: 400 },
    );
  }

  const dt = deviceToken ?? null;
  const db = getDb();

  if (!checkRate({ ip, action: 'comment', cooldownMs: COMMENT_COOLDOWN_MS, deviceToken: dt, db })) {
    return rateLimited(Math.ceil(COMMENT_COOLDOWN_MS / 1000));
  }

  const escapedNickname = escapeHtml(nickname);
  const text = escapeHtml((content ?? message ?? '').slice(0, 500));

  try {
    const inserted = await commentsRepo(db).insert({
      nickname: escapedNickname,
      message: text,
      ip,
      deviceToken: dt,
      userAgent,
    });
    // Legacy parity: each comment increments the flower counter by 1.
    await flowersRepo(db).increment(1).catch((e: unknown) => {
      console.error('flowers.increment (from comment) failed:', (e as Error).message);
    });
    return NextResponse.json(
      {
        id: inserted.id,
        nickname: inserted.nickname,
        message: inserted.message,
        created_at: inserted.createdAt,
      },
      { status: 201 },
    );
  } catch (e) {
    const msg = (e as Error).message ?? 'unknown';
    console.error('POST /api/comments failed:', msg);
    return internalError();
  }
}

// Surface the schema type for tests / clients that import the handler module.
export type { z };

import { NextResponse } from 'next/server';

import { getRequestContext, readJsonBody } from '@/lib/api/context';
import {
  badRequest,
  internalError,
  rateLimited,
  validationError,
} from '@/lib/api/errors';
import { checkRate } from '@/lib/security/checkRate';
import { checkHttpRate } from '@/lib/security/httpRateLimit';
import { createReportSchema } from '@/lib/validation/schemas';
import { getDb } from '@/src/db/client';
import { reportsRepo } from '@/src/db/repositories/reports';

export const dynamic = 'force-dynamic';

const REPORT_COOLDOWN_MS = 30_000;

export async function POST(request: Request): Promise<Response> {
  const { ip } = getRequestContext(request);

  const httpRate = checkHttpRate(ip);
  if (!httpRate.ok) return rateLimited(Math.ceil(httpRate.resetMs / 1000));

  const body = await readJsonBody(request);
  if (body === null) return badRequest('Request body must be JSON ≤ 1KiB');

  const parsed = createReportSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);

  const { target_comment_id, commentId, reason, deviceToken } = parsed.data;
  const dt = deviceToken ?? null;
  const commentIdRef = target_comment_id ?? commentId ?? null;
  const db = getDb();

  if (!checkRate({ ip, action: 'report', cooldownMs: REPORT_COOLDOWN_MS, deviceToken: dt, db })) {
    return rateLimited(Math.ceil(REPORT_COOLDOWN_MS / 1000));
  }

  try {
    const inserted = await reportsRepo(db).insert({
      commentId: commentIdRef,
      reason: reason.slice(0, 500),
      ip,
    });
    return NextResponse.json({ id: inserted.id }, { status: 201 });
  } catch (e) {
    console.error('POST /api/report failed:', (e as Error).message);
    return internalError();
  }
}

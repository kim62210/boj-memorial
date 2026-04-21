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
import { createIncenseSchema } from '@/lib/validation/schemas';
import { getDb } from '@/src/db/client';
import { incenseRepo } from '@/src/db/repositories/incense';

export const dynamic = 'force-dynamic';

const INCENSE_COOLDOWN_MS = 3000;

export async function GET(request: Request): Promise<Response> {
  const { ip } = getRequestContext(request);
  const rate = checkHttpRate(ip);
  if (!rate.ok) return rateLimited(Math.ceil(rate.resetMs / 1000));

  try {
    const db = getDb();
    const count = await incenseRepo(db).getCount();
    return NextResponse.json({ count, lastUpdate: new Date().toISOString() });
  } catch (e) {
    console.error('GET /api/incense failed:', (e as Error).message);
    return internalError();
  }
}

export async function POST(request: Request): Promise<Response> {
  const { ip } = getRequestContext(request);

  const httpRate = checkHttpRate(ip);
  if (!httpRate.ok) return rateLimited(Math.ceil(httpRate.resetMs / 1000));

  const body = await readJsonBody(request);
  if (body === null) return badRequest('Request body must be JSON ≤ 1KiB');

  const parsed = createIncenseSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);

  const { count: delta, deviceToken } = parsed.data;
  const dt = deviceToken ?? null;
  const db = getDb();

  if (!checkRate({ ip, action: 'incense', cooldownMs: INCENSE_COOLDOWN_MS, deviceToken: dt, db })) {
    return rateLimited(Math.ceil(INCENSE_COOLDOWN_MS / 1000));
  }

  try {
    const count = await incenseRepo(db).increment(delta);
    return NextResponse.json({ count });
  } catch (e) {
    console.error('POST /api/incense failed:', (e as Error).message);
    return internalError();
  }
}

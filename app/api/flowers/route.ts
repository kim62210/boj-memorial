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
import { createFlowerSchema } from '@/lib/validation/schemas';
import { getDb } from '@/src/db/client';
import { flowersRepo } from '@/src/db/repositories/flowers';

export const dynamic = 'force-dynamic';

const FLOWER_COOLDOWN_MS = 2000;

export async function GET(request: Request): Promise<Response> {
  const { ip } = getRequestContext(request);
  const rate = checkHttpRate(ip);
  if (!rate.ok) return rateLimited(Math.ceil(rate.resetMs / 1000));

  try {
    const db = getDb();
    const count = await flowersRepo(db).getCount();
    // The live deployment does not persist flower positions (DB stores a
    // single counter). Emit an empty positions array to satisfy the spec's
    // "count + positions snapshot" shape; future iterations can hydrate
    // this from a positions table without breaking callers.
    return NextResponse.json({ count, positions: [] });
  } catch (e) {
    console.error('GET /api/flowers failed:', (e as Error).message);
    return internalError();
  }
}

export async function POST(request: Request): Promise<Response> {
  const { ip } = getRequestContext(request);

  const httpRate = checkHttpRate(ip);
  if (!httpRate.ok) return rateLimited(Math.ceil(httpRate.resetMs / 1000));

  const body = await readJsonBody(request);
  if (body === null) return badRequest('Request body must be JSON ≤ 1KiB');

  const parsed = createFlowerSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);

  const dt = parsed.data.deviceToken ?? null;
  const db = getDb();

  if (!checkRate({ ip, action: 'flower', cooldownMs: FLOWER_COOLDOWN_MS, deviceToken: dt, db })) {
    return rateLimited(Math.ceil(FLOWER_COOLDOWN_MS / 1000));
  }

  try {
    const total = await flowersRepo(db).increment(1);
    return NextResponse.json({ total }, { status: 201 });
  } catch (e) {
    console.error('POST /api/flowers failed:', (e as Error).message);
    return internalError();
  }
}

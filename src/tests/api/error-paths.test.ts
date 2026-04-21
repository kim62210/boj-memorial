import { describe, expect, it } from 'vitest';

import { GET as getComments } from '../../../app/api/comments/route.js';
import { GET as getFlowers } from '../../../app/api/flowers/route.js';
import { GET as getHistory } from '../../../app/api/history/route.js';
import { GET as getIncense } from '../../../app/api/incense/route.js';
import { GET as getStats } from '../../../app/api/stats/route.js';
import { closeDb } from '../../db/client.js';
import { getRequest } from './fixtures.js';

async function withoutDatabaseUrl(fn: () => Promise<void>): Promise<void> {
  const original = process.env.DATABASE_URL;
  await closeDb();
  delete process.env.DATABASE_URL;
  try {
    await fn();
  } finally {
    if (original === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = original;
    await closeDb();
  }
}

describe('app/api error paths', () => {
  it('returns 500 for GET handlers when the DB is unavailable', async () => {
    await withoutDatabaseUrl(async () => {
      const cases: Array<[string, Promise<Response>]> = [
        ['comments', getComments(getRequest('http://test/api/comments', '19.0.0.1'))],
        ['flowers', getFlowers(getRequest('http://test/api/flowers', '19.0.0.2'))],
        ['history', getHistory(getRequest('http://test/api/history', '19.0.0.3'))],
        ['incense', getIncense(getRequest('http://test/api/incense', '19.0.0.4'))],
        ['stats', getStats(getRequest('http://test/api/stats', '19.0.0.5'))],
      ];

      for (const [name, pending] of cases) {
        const res = await pending;
        expect(res.status, name).toBe(500);
        await expect(res.json()).resolves.toMatchObject({ code: 'INTERNAL' });
      }
    });
  });
});

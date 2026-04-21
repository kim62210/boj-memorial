import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { GET } from '../../../app/api/stats/route.js';
import { getDb } from '../../db/client.js';
import { commentsRepo } from '../../db/repositories/comments.js';
import { flowersRepo } from '../../db/repositories/flowers.js';
import { getRequest, resetApiState } from './fixtures.js';

describe('app/api/stats', () => {
  beforeEach(async () => {
    await resetApiState();
  });
  afterAll(async () => {
    await resetApiState();
  });

  it('GET returns legacy { flowers, comments } aggregate', async () => {
    const db = getDb();
    await commentsRepo(db).insert({ nickname: 'Alice', message: 'one' });
    await commentsRepo(db).insert({ nickname: 'Bob', message: 'two' });
    await flowersRepo(db).increment(3);

    const res = await GET(getRequest('http://test/api/stats', '16.0.0.1'));
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body).toEqual({ flowers: 3, comments: 2 });
  });
});

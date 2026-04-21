import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { GET } from '../../../app/api/history/route.js';
import { getDb } from '../../db/client.js';
import { commentsRepo } from '../../db/repositories/comments.js';
import { getRequest, resetApiState } from './fixtures.js';

describe('app/api/history', () => {
  beforeEach(async () => {
    await resetApiState();
  });
  afterAll(async () => {
    await resetApiState();
  });

  it('GET returns legacy history shape with default 30 item limit', async () => {
    const repo = commentsRepo(getDb());
    const base = Date.now();
    for (let i = 0; i < 31; i++) {
      await repo.insert({
        nickname: `u${i}`,
        message: `m${i}`,
        createdAt: new Date(base + i * 1000),
      });
    }

    const res = await GET(getRequest('http://test/api/history?page=0', '15.0.0.1'));
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=5');

    const body = await res.json() as Record<string, unknown>;
    expect(body.total).toBe(31);
    expect(body.page).toBe(0);
    expect(body.hasMore).toBe(true);
    const comments = body.comments as Array<Record<string, unknown>>;
    expect(comments).toHaveLength(30);
    expect(comments[0]).toHaveProperty('created_at');
  });

  it('GET rejects limit values above legacy max 30', async () => {
    const res = await GET(getRequest('http://test/api/history?limit=31', '15.0.0.2'));
    expect(res.status).toBe(400);
    const body = await res.json() as Record<string, unknown>;
    expect(body.code).toBe('VALIDATION_FAILED');
  });
});

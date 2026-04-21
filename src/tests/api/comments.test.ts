import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { GET, POST } from '../../../app/api/comments/route.js';
import { getDb } from '../../db/client.js';
import { commentsRepo } from '../../db/repositories/comments.js';
import { flowersRepo } from '../../db/repositories/flowers.js';
import { getRequest, jsonRequest, resetApiState } from './fixtures.js';

describe('app/api/comments', () => {
  beforeEach(async () => {
    await resetApiState();
  });
  afterAll(async () => {
    await resetApiState();
  });

  it('POST accepts content + nickname and returns 201 with legacy shape', async () => {
    const res = await POST(
      jsonRequest('http://test/api/comments', {
        nickname: 'Alice',
        content: '편히 잠드시길',
      }, { ip: '10.0.0.1' }),
    );
    expect(res.status).toBe(201);
    const body = await res.json() as Record<string, unknown>;
    expect(body).toMatchObject({ nickname: 'Alice', message: '편히 잠드시길' });
    expect(typeof body.id).toBe('number');
    expect(typeof body.created_at).toBe('string');

    // Persisted
    const repo = commentsRepo(getDb());
    const stored = await repo.getById(body.id as number);
    expect(stored?.message).toBe('편히 잠드시길');

    // Legacy parity: comment increments flower counter by 1
    const flowerCount = await flowersRepo(getDb()).getCount();
    expect(flowerCount).toBe(1);
  });

  it('POST accepts legacy message field and defaults nickname', async () => {
    const res = await POST(
      jsonRequest('http://test/api/comments', {
        message: '안녕히',
      }, { ip: '10.0.0.2' }),
    );
    expect(res.status).toBe(201);
    const body = await res.json() as Record<string, unknown>;
    expect(body.nickname).toBe('익명의 개발자');
    expect(body.message).toBe('안녕히');
  });

  it('POST rejects forbidden nickname with FORBIDDEN_NICKNAME code', async () => {
    const res = await POST(
      jsonRequest('http://test/api/comments', {
        nickname: '관리자',
        content: 'spoof',
      }, { ip: '10.0.0.3' }),
    );
    expect(res.status).toBe(400);
    const body = await res.json() as Record<string, unknown>;
    expect(body.code).toBe('FORBIDDEN_NICKNAME');
  });

  it('POST returns 400 VALIDATION_FAILED on missing content+message', async () => {
    const res = await POST(
      jsonRequest('http://test/api/comments', { nickname: 'x' }, { ip: '10.0.0.4' }),
    );
    expect(res.status).toBe(400);
    const body = await res.json() as Record<string, unknown>;
    expect(body.code).toBe('VALIDATION_FAILED');
  });

  it('POST cools down the same IP within 5s', async () => {
    const first = await POST(
      jsonRequest('http://test/api/comments', { content: 'a' }, { ip: '10.0.0.5' }),
    );
    expect(first.status).toBe(201);
    const second = await POST(
      jsonRequest('http://test/api/comments', { content: 'b' }, { ip: '10.0.0.5' }),
    );
    expect(second.status).toBe(429);
    expect(second.headers.get('Retry-After')).toBe('5');
  });

  it('GET returns paginated comments with legacy shape', async () => {
    const db = getDb();
    const repo = commentsRepo(db);
    const base = Date.now();
    for (let i = 0; i < 4; i++) {
      await repo.insert({
        nickname: `u${i}`,
        message: `m${i}`,
        createdAt: new Date(base + i * 1000),
      });
    }
    const res = await GET(getRequest('http://test/api/comments?page=0&limit=2', '10.0.0.6'));
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(Array.isArray(body.comments)).toBe(true);
    expect(body.total).toBe(4);
    expect(body.page).toBe(0);
    expect(body.hasMore).toBe(true);
    const comments = body.comments as Array<Record<string, unknown>>;
    expect(comments).toHaveLength(2);
    expect(comments[0]).toHaveProperty('created_at');
  });
});

import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { POST } from '../../../app/api/report/route.js';
import { jsonRequest, resetApiState } from './fixtures.js';

describe('app/api/report', () => {
  beforeEach(async () => {
    await resetApiState();
  });
  afterAll(async () => {
    await resetApiState();
  });

  it('POST accepts target_comment_id + reason and returns 201 with { id }', async () => {
    const res = await POST(
      jsonRequest('http://test/api/report', {
        target_comment_id: 1,
        reason: '스팸 댓글',
      }, { ip: '13.0.0.1' }),
    );
    expect(res.status).toBe(201);
    const body = await res.json() as Record<string, unknown>;
    expect(typeof body.id).toBe('number');
  });

  it('POST accepts legacy commentId alias', async () => {
    const res = await POST(
      jsonRequest('http://test/api/report', {
        commentId: 7,
        reason: '욕설',
      }, { ip: '13.0.0.2' }),
    );
    expect(res.status).toBe(201);
  });

  it('POST accepts report without a target comment id', async () => {
    const res = await POST(
      jsonRequest('http://test/api/report', { reason: '부적절한 사이트' }, { ip: '13.0.0.3' }),
    );
    expect(res.status).toBe(201);
  });

  it('POST rejects empty reason with 400', async () => {
    const res = await POST(
      jsonRequest('http://test/api/report', { reason: '   ' }, { ip: '13.0.0.4' }),
    );
    expect(res.status).toBe(400);
    const body = await res.json() as Record<string, unknown>;
    expect(body.code).toBe('VALIDATION_FAILED');
  });

  it('POST cools down the same IP within 30s', async () => {
    const a = await POST(
      jsonRequest('http://test/api/report', { reason: 'a' }, { ip: '13.0.0.5' }),
    );
    expect(a.status).toBe(201);
    const b = await POST(
      jsonRequest('http://test/api/report', { reason: 'b' }, { ip: '13.0.0.5' }),
    );
    expect(b.status).toBe(429);
    expect(b.headers.get('Retry-After')).toBe('30');
  });
});

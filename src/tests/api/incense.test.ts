import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { GET, POST } from '../../../app/api/incense/route.js';
import { getRequest, jsonRequest, resetApiState } from './fixtures.js';

describe('app/api/incense', () => {
  beforeEach(async () => {
    await resetApiState();
  });
  afterAll(async () => {
    await resetApiState();
  });

  it('GET returns { count, lastUpdate }', async () => {
    const res = await GET(getRequest('http://test/api/incense', '12.0.0.1'));
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.count).toBe(0);
    expect(typeof body.lastUpdate).toBe('string');
  });

  it('POST default count=1 returns 200 with updated count', async () => {
    const res = await POST(
      jsonRequest('http://test/api/incense', {}, { ip: '12.0.0.2' }),
    );
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.count).toBe(1);
  });

  it('POST accepts count=3 and increments by 3', async () => {
    const res = await POST(
      jsonRequest('http://test/api/incense', { count: 3 }, { ip: '12.0.0.3' }),
    );
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.count).toBe(3);
  });

  it('POST rejects count=2 with 400', async () => {
    const res = await POST(
      jsonRequest('http://test/api/incense', { count: 2 }, { ip: '12.0.0.4' }),
    );
    expect(res.status).toBe(400);
    const body = await res.json() as Record<string, unknown>;
    expect(body.code).toBe('VALIDATION_FAILED');
  });

  it('POST cools down the same IP within 3s', async () => {
    const a = await POST(jsonRequest('http://test/api/incense', {}, { ip: '12.0.0.5' }));
    expect(a.status).toBe(200);
    const b = await POST(jsonRequest('http://test/api/incense', {}, { ip: '12.0.0.5' }));
    expect(b.status).toBe(429);
    expect(b.headers.get('Retry-After')).toBe('3');
  });
});

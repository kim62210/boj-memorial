import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { GET, POST } from '../../../app/api/flowers/route.js';
import { getRequest, jsonRequest, resetApiState } from './fixtures.js';

describe('app/api/flowers', () => {
  beforeEach(async () => {
    await resetApiState();
  });
  afterAll(async () => {
    await resetApiState();
  });

  it('GET returns { count, positions } with empty positions array', async () => {
    const res = await GET(getRequest('http://test/api/flowers', '11.0.0.1'));
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.count).toBe(0);
    expect(body.positions).toEqual([]);
  });

  it('POST increments and returns 201 with { total }', async () => {
    const res = await POST(
      jsonRequest('http://test/api/flowers', {}, { ip: '11.0.0.2' }),
    );
    expect(res.status).toBe(201);
    const body = await res.json() as Record<string, unknown>;
    expect(body.total).toBe(1);

    const after = await GET(getRequest('http://test/api/flowers', '11.0.0.2b'));
    const afterBody = await after.json() as Record<string, unknown>;
    expect(afterBody.count).toBe(1);
  });

  it('POST accepts optional position/nickname/deviceToken', async () => {
    const res = await POST(
      jsonRequest('http://test/api/flowers', {
        nickname: 'Bob',
        position: { x: 1.5, y: 2, z: -3 },
        deviceToken: 'dt-xyz',
      }, { ip: '11.0.0.3' }),
    );
    expect(res.status).toBe(201);
  });

  it('POST rejects NaN coordinates with 400 VALIDATION_FAILED', async () => {
    const res = await POST(
      jsonRequest('http://test/api/flowers', {
        position: { x: NaN, y: 0, z: 0 },
      }, { ip: '11.0.0.4' }),
    );
    expect(res.status).toBe(400);
    const body = await res.json() as Record<string, unknown>;
    expect(body.code).toBe('VALIDATION_FAILED');
  });

  it('POST cools down the same IP within 2s', async () => {
    const a = await POST(jsonRequest('http://test/api/flowers', {}, { ip: '11.0.0.5' }));
    expect(a.status).toBe(201);
    const b = await POST(jsonRequest('http://test/api/flowers', {}, { ip: '11.0.0.5' }));
    expect(b.status).toBe(429);
    expect(b.headers.get('Retry-After')).toBe('2');
  });
});

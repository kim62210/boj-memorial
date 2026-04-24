import { describe, expect, it } from 'vitest';
import { GET } from '../../../app/health/route.js';

describe('app/health', () => {
  it('returns 200 "ok" text when DB is reachable', async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toBe('ok');
    expect(res.headers.get('content-type')).toContain('text/plain');
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(res.headers.get('x-uptime-ms')).toMatch(/^\d+$/);
  });
});

import { describe, expect, it } from 'vitest';

import { readJsonBody } from './context';

describe('readJsonBody', () => {
  it('enforces the body limit by UTF-8 byte length, not JS string length', async () => {
    const body = JSON.stringify({ content: '가'.repeat(400) });
    expect(body.length).toBeLessThan(1024);
    expect(new TextEncoder().encode(body).byteLength).toBeGreaterThan(1024);

    const parsed = await readJsonBody(new Request('http://test', { method: 'POST', body }));

    expect(parsed).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const proxySource = fileURLToPath(new URL('../../proxy.ts', import.meta.url));

describe('proxy middleware matcher', () => {
  it('excludes /health from locale rewrites so the health route handles probes', () => {
    expect(readFileSync(proxySource, 'utf8')).toContain(
      "matcher: ['/((?!api|health|_next|_vercel|socket.io|.*\\\\..*).*)']",
    );
  });
});

import { testPool } from '../../db/__tests__/fixtures.js';
import { __resetActionRateStoreForTests } from '../../../lib/security/checkRate.js';
import { __resetHttpRateStoreForTests } from '../../../lib/security/httpRateLimit.js';

export async function resetApiState(): Promise<void> {
  __resetHttpRateStoreForTests();
  __resetActionRateStoreForTests();
  const client = testPool();
  await client.query(
    'TRUNCATE TABLE comments, reports, rate_limits RESTART IDENTITY CASCADE',
  );
  await client.query('UPDATE flowers SET count = 0 WHERE id = 1');
  await client.query('UPDATE incense SET count = 0 WHERE id = 1');
}

export function jsonRequest(
  url: string,
  body: unknown,
  opts: { ip?: string; method?: string } = {},
): Request {
  const headers = new Headers({ 'content-type': 'application/json' });
  if (opts.ip) headers.set('x-forwarded-for', opts.ip);
  return new Request(url, {
    method: opts.method ?? 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

export function getRequest(url: string, ip?: string): Request {
  const headers = new Headers();
  if (ip) headers.set('x-forwarded-for', ip);
  return new Request(url, { method: 'GET', headers });
}

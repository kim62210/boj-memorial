import { afterEach, describe, expect, it, vi } from 'vitest';

import { getDatabaseUrl } from './client';

describe('getDatabaseUrl', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('prefers TEST_DATABASE_URL for route-handler integration tests', () => {
    vi.stubEnv('DATABASE_URL', 'postgres://prod');
    vi.stubEnv('TEST_DATABASE_URL', 'postgres://test');

    expect(getDatabaseUrl()).toBe('postgres://test');
  });

  it('falls back to DATABASE_URL outside tests', () => {
    vi.stubEnv('DATABASE_URL', 'postgres://prod');
    vi.stubEnv('TEST_DATABASE_URL', '');

    expect(getDatabaseUrl()).toBe('postgres://prod');
  });
});

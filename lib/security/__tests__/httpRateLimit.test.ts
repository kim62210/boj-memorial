import { beforeEach, describe, expect, it } from 'vitest';
import {
  __resetHttpRateStoreForTests,
  checkHttpRate,
} from '../httpRateLimit';

describe('checkHttpRate', () => {
  beforeEach(() => {
    __resetHttpRateStoreForTests();
  });

  it('permits up to 60 requests within a one-minute window', () => {
    const now = 1_000_000;
    for (let i = 0; i < 60; i++) {
      const r = checkHttpRate('1.1.1.1', now + i);
      expect(r.ok).toBe(true);
      expect(r.remaining).toBe(59 - i);
    }
  });

  it('rejects the 61st request inside the window', () => {
    const now = 2_000_000;
    for (let i = 0; i < 60; i++) checkHttpRate('2.2.2.2', now + i);
    const blocked = checkHttpRate('2.2.2.2', now + 61);
    expect(blocked.ok).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.resetMs).toBeGreaterThan(0);
  });

  it('releases capacity once oldest entries fall outside the window', () => {
    const base = 3_000_000;
    for (let i = 0; i < 60; i++) checkHttpRate('3.3.3.3', base + i);
    const stillBlocked = checkHttpRate('3.3.3.3', base + 1000);
    expect(stillBlocked.ok).toBe(false);
    // Jump the clock one window forward: now only entries from (base+60001..)
    // are considered — the bucket empties.
    const later = base + 60_500;
    const unblocked = checkHttpRate('3.3.3.3', later);
    expect(unblocked.ok).toBe(true);
  });

  it('tracks IPs independently', () => {
    const now = 4_000_000;
    for (let i = 0; i < 60; i++) checkHttpRate('4.4.4.4', now + i);
    expect(checkHttpRate('4.4.4.4', now + 60).ok).toBe(false);
    expect(checkHttpRate('5.5.5.5', now + 60).ok).toBe(true);
  });
});

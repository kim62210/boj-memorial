import { beforeEach, describe, expect, it } from 'vitest';
import {
  __resetActionRateStoreForTests,
  __cleanupActionRateStoreForTests,
  __getActionRateStoreSizeForTests,
  checkRate,
} from '../checkRate';

describe('checkRate', () => {
  beforeEach(() => {
    __resetActionRateStoreForTests();
  });

  it('permits the first request then rejects inside the cooldown', () => {
    const now = 1_000_000;
    expect(
      checkRate({ ip: '1.1.1.1', action: 'comment', cooldownMs: 5000, now }),
    ).toBe(true);
    expect(
      checkRate({
        ip: '1.1.1.1',
        action: 'comment',
        cooldownMs: 5000,
        now: now + 100,
      }),
    ).toBe(false);
  });

  it('releases the cooldown once enough time has passed', () => {
    const now = 2_000_000;
    checkRate({ ip: '2.2.2.2', action: 'comment', cooldownMs: 5000, now });
    expect(
      checkRate({
        ip: '2.2.2.2',
        action: 'comment',
        cooldownMs: 5000,
        now: now + 5001,
      }),
    ).toBe(true);
  });

  it('scopes cooldowns per action', () => {
    const now = 3_000_000;
    checkRate({ ip: '3.3.3.3', action: 'flower', cooldownMs: 2000, now });
    expect(
      checkRate({
        ip: '3.3.3.3',
        action: 'comment',
        cooldownMs: 5000,
        now: now + 100,
      }),
    ).toBe(true);
  });

  it('rejects when the deviceToken has cooled-down even if IP differs', () => {
    const now = 4_000_000;
    checkRate({
      ip: '4.4.4.4',
      action: 'comment',
      cooldownMs: 5000,
      deviceToken: 'dt-x',
      now,
    });
    const blocked = checkRate({
      ip: '9.9.9.9',
      action: 'comment',
      cooldownMs: 5000,
      deviceToken: 'dt-x',
      now: now + 100,
    });
    expect(blocked).toBe(false);
  });

  it('drops stale cooldown keys during cleanup', () => {
    const now = 5_000_000;
    checkRate({
      ip: '5.5.5.5',
      action: 'report',
      cooldownMs: 30_000,
      deviceToken: 'dt-y',
      now,
    });
    expect(__getActionRateStoreSizeForTests()).toBe(2);

    __cleanupActionRateStoreForTests(now + 3_600_001);
    expect(__getActionRateStoreSizeForTests()).toBe(0);
  });
});

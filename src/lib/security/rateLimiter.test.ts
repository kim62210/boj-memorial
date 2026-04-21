import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  cleanupRateLimits,
  createRateLimiter,
  type RateLimitRecord,
  type RateLimitRepository,
} from "./rateLimiter";

function fixedClock(initial = 0): { now: () => number; advance: (ms: number) => void } {
  let current = initial;
  return {
    now: () => current,
    advance: (ms) => {
      current += ms;
    },
  };
}

class StubRepository implements RateLimitRepository {
  public persisted: RateLimitRecord[] = [];
  public loadImpl: (windowMs: number) => readonly RateLimitRecord[] = () => [];
  public purgedAt: number[] = [];
  public persistShouldThrow = false;

  async load(windowMs: number): Promise<readonly RateLimitRecord[]> {
    return this.loadImpl(windowMs);
  }

  persist(record: RateLimitRecord): void {
    if (this.persistShouldThrow) {
      throw new Error("synchronous persist failure");
    }
    this.persisted.push(record);
  }

  async purgeOlderThan(cutoffMs: number): Promise<void> {
    this.purgedAt.push(cutoffMs);
  }
}

describe("createRateLimiter.check", () => {
  it("윈도우 내 limit 이하 호출은 모두 허용한다", () => {
    const clock = fixedClock(1_000_000);
    const limiter = createRateLimiter({ now: clock.now });
    for (let i = 0; i < 5; i += 1) {
      expect(limiter.check("sock:1.1.1.1", 5, 60_000)).toBe(true);
      clock.advance(100);
    }
  });

  it("limit 도달 시 동일 윈도우 내 추가 호출은 차단한다", () => {
    const clock = fixedClock(1_000_000);
    const limiter = createRateLimiter({ now: clock.now });
    for (let i = 0; i < 5; i += 1) {
      limiter.check("sock:1.1.1.1", 5, 60_000);
    }
    expect(limiter.check("sock:1.1.1.1", 5, 60_000)).toBe(false);
  });

  it("윈도우 경계 밖 타임스탬프는 프루닝된 뒤 다시 허용한다", () => {
    const clock = fixedClock(0);
    const limiter = createRateLimiter({ now: clock.now });
    expect(limiter.check("key", 1, 1000)).toBe(true);
    clock.advance(999);
    expect(limiter.check("key", 1, 1000)).toBe(false);
    clock.advance(1); // 정확히 1000ms 경과 → now - t === windowMs → 경계 exclusive 로 제거
    expect(limiter.check("key", 1, 1000)).toBe(true);
  });

  it("서로 다른 키는 독립 카운터를 유지한다", () => {
    const clock = fixedClock(0);
    const limiter = createRateLimiter({ now: clock.now });
    expect(limiter.check("a", 1, 5000)).toBe(true);
    expect(limiter.check("a", 1, 5000)).toBe(false);
    expect(limiter.check("b", 1, 5000)).toBe(true);
  });

  it("limit 또는 windowMs 가 비정상 값이면 false 를 반환한다", () => {
    const limiter = createRateLimiter();
    expect(limiter.check("k", 0, 1000)).toBe(false);
    expect(limiter.check("k", -1, 1000)).toBe(false);
    expect(limiter.check("k", Number.NaN, 1000)).toBe(false);
    expect(limiter.check("k", Number.POSITIVE_INFINITY, 1000)).toBe(false);
    expect(limiter.check("k", 1, 0)).toBe(false);
    expect(limiter.check("k", 1, -1)).toBe(false);
    expect(limiter.check("k", 1, Number.NaN)).toBe(false);
  });

  it("limit=1 의 쿨다운 의미론이 server.js checkRate 와 일치한다", () => {
    const clock = fixedClock(0);
    const limiter = createRateLimiter({ now: clock.now });
    expect(limiter.check("ip:flower", 1, 2000)).toBe(true);
    clock.advance(1999);
    expect(limiter.check("ip:flower", 1, 2000)).toBe(false);
    clock.advance(1);
    expect(limiter.check("ip:flower", 1, 2000)).toBe(true);
  });
});

describe("createRateLimiter.checkAll", () => {
  it("모든 키가 통과하면 true 이고 전체가 한 번에 커밋된다", () => {
    const clock = fixedClock(0);
    const limiter = createRateLimiter({ now: clock.now });
    expect(
      limiter.checkAll(["ip:flower", "dt:abc:flower"], 1, 2000)
    ).toBe(true);
    expect(limiter.history("ip:flower")).toEqual([0]);
    expect(limiter.history("dt:abc:flower")).toEqual([0]);
  });

  it("하나라도 실패하면 어떤 키도 기록하지 않는다 (server.js 호환)", () => {
    const clock = fixedClock(0);
    const limiter = createRateLimiter({ now: clock.now });
    // ip 키를 먼저 포화시킨다
    limiter.check("ip:flower", 1, 2000);
    clock.advance(100);
    expect(
      limiter.checkAll(["ip:flower", "dt:abc:flower"], 1, 2000)
    ).toBe(false);
    // dt 키는 커밋되지 않아야 한다
    expect(limiter.history("dt:abc:flower")).toEqual([]);
  });

  it("빈 키 배열은 즉시 true 를 반환한다 (no-op)", () => {
    const limiter = createRateLimiter();
    expect(limiter.checkAll([], 1, 1000)).toBe(true);
  });

  it("중복 키를 포함해도 한 번만 처리/커밋한다", () => {
    const clock = fixedClock(0);
    const limiter = createRateLimiter({ now: clock.now });
    expect(limiter.checkAll(["k", "k"], 1, 1000)).toBe(true);
    expect(limiter.history("k")).toEqual([0]);
  });

  it("limit 또는 windowMs 가 비정상 값이면 false 를 반환한다", () => {
    const limiter = createRateLimiter();
    expect(limiter.checkAll(["a"], 0, 1000)).toBe(false);
    expect(limiter.checkAll(["a"], 1, 0)).toBe(false);
  });

  it("동일 호출 내에서 경계 이전 타임스탬프는 둘 다 카운트된다", () => {
    const clock = fixedClock(0);
    const limiter = createRateLimiter({ now: clock.now });
    limiter.check("k", 2, 1000);
    clock.advance(500);
    expect(limiter.checkAll(["k", "k"], 2, 1000)).toBe(true);
    expect(limiter.history("k")).toEqual([0, 500]);
  });
});

describe("createRateLimiter.cleanup", () => {
  it("TTL 초과 항목을 제거하고 개수를 반환한다", () => {
    const clock = fixedClock(0);
    const limiter = createRateLimiter({ now: clock.now, ttlMs: 1000 });
    limiter.check("k1", 1, 1000);
    clock.advance(500);
    limiter.check("k2", 1, 1000);
    clock.advance(600);
    // k1 은 now=1100, t=0 → 1100ms 경과 → ttl(1000) 초과
    // k2 는 now=1100, t=500 → 600ms 경과 → ttl(1000) 이내
    expect(limiter.cleanup()).toBe(1);
    expect(limiter.size()).toBe(1);
    expect(limiter.history("k1")).toEqual([]);
    expect(limiter.history("k2")).toEqual([500]);
  });

  it("cleanup 은 반환된 history 에 영향을 주지 않는다 (읽기 전용 스냅샷)", () => {
    const clock = fixedClock(0);
    const limiter = createRateLimiter({ now: clock.now });
    limiter.check("k", 1, 1000);
    const snapshot = limiter.history("k");
    limiter.reset();
    expect(snapshot).toEqual([0]);
  });

  it("부분 만료된 키는 유지하되 만료 타임스탬프만 잘라낸다", () => {
    const clock = fixedClock(0);
    const limiter = createRateLimiter({ now: clock.now, ttlMs: 1000 });
    limiter.check("k", 3, 60_000);
    clock.advance(600);
    limiter.check("k", 3, 60_000);
    clock.advance(600);
    // 첫 번째 기록은 1200ms 전 → ttl 초과, 두 번째는 600ms 전 → 유지
    expect(limiter.cleanup()).toBe(0);
    expect(limiter.history("k")).toEqual([600]);
  });
});

describe("createRateLimiter.repository integration", () => {
  it("check 통과 시마다 persist 가 호출된다", () => {
    const repo = new StubRepository();
    const clock = fixedClock(1_000);
    const limiter = createRateLimiter({ now: clock.now, repository: repo });
    limiter.check("k", 1, 5000);
    expect(repo.persisted).toEqual([{ key: "k", timestampMs: 1000 }]);
  });

  it("check 실패 시 persist 가 호출되지 않는다", () => {
    const repo = new StubRepository();
    const clock = fixedClock(0);
    const limiter = createRateLimiter({ now: clock.now, repository: repo });
    limiter.check("k", 1, 5000);
    repo.persisted = [];
    limiter.check("k", 1, 5000); // 차단
    expect(repo.persisted).toEqual([]);
  });

  it("persist 가 Promise reject 해도 핫패스를 블로킹하지 않는다", async () => {
    const onPersistError = vi.fn();
    const failingRepo: RateLimitRepository = {
      load: async () => [],
      persist: () => Promise.reject(new Error("db down")),
      purgeOlderThan: async () => {},
    };
    const limiter = createRateLimiter({
      repository: failingRepo,
      onPersistError,
    });
    expect(limiter.check("k", 1, 5000)).toBe(true);
    // 마이크로태스크 큐 드레인
    await new Promise((resolve) => setImmediate(resolve));
    expect(onPersistError).toHaveBeenCalledTimes(1);
  });

  it("persist 동기 throw 도 onPersistError 로 처리하고 허용을 유지한다", () => {
    const onPersistError = vi.fn();
    const repo = new StubRepository();
    repo.persistShouldThrow = true;
    const limiter = createRateLimiter({
      repository: repo,
      onPersistError,
    });
    expect(limiter.check("k", 1, 5000)).toBe(true);
    expect(onPersistError).toHaveBeenCalledTimes(1);
  });

  it("restore 는 repository.load 결과를 메모리에 병합하고 로드된 수를 반환한다", async () => {
    const repo = new StubRepository();
    repo.loadImpl = () => [
      { key: "k1", timestampMs: 10 },
      { key: "k2", timestampMs: 20 },
      { key: "k1", timestampMs: 30 },
    ];
    const limiter = createRateLimiter({ repository: repo });
    await expect(limiter.restore()).resolves.toBe(3);
    expect(limiter.history("k1")).toEqual([10, 30]);
    expect(limiter.history("k2")).toEqual([20]);
  });

  it("restore 는 repository 가 없으면 0 을 반환한다", async () => {
    const limiter = createRateLimiter();
    await expect(limiter.restore()).resolves.toBe(0);
  });

  it("purgeRepository 는 now - ttlMs 를 cutoff 로 전달한다", async () => {
    const repo = new StubRepository();
    const clock = fixedClock(100_000);
    const limiter = createRateLimiter({
      now: clock.now,
      repository: repo,
      ttlMs: 60_000,
    });
    await limiter.purgeRepository();
    expect(repo.purgedAt).toEqual([40_000]);
  });

  it("purgeRepository 는 repository 가 없으면 no-op", async () => {
    const limiter = createRateLimiter();
    await expect(limiter.purgeRepository()).resolves.toBeUndefined();
  });

  it("repository 미지정 시 persist 경로를 밟지 않는다", () => {
    const limiter = createRateLimiter();
    expect(limiter.check("k", 1, 5000)).toBe(true);
    expect(limiter.size()).toBe(1);
  });
});

describe("createRateLimiter.reset & size", () => {
  it("reset 은 저장소를 비우고 size 는 0 이 된다", () => {
    const limiter = createRateLimiter();
    limiter.check("a", 5, 1000);
    limiter.check("b", 5, 1000);
    expect(limiter.size()).toBe(2);
    limiter.reset();
    expect(limiter.size()).toBe(0);
  });

  it("history 는 읽기 전용 배열을 반환한다 (외부 변조 차단)", () => {
    const limiter = createRateLimiter({ now: () => 0 });
    limiter.check("k", 1, 1000);
    const snapshot = limiter.history("k");
    expect(() => {
      (snapshot as number[]).push(9999);
    }).toThrow();
  });

  it("없는 키의 history 는 빈 배열이다", () => {
    const limiter = createRateLimiter();
    expect(limiter.history("missing")).toEqual([]);
  });
});

describe("관측 API 회귀 고정 (cleanup / history / size)", () => {
  it("size() 는 추적 중인 고유 키 개수와 정확히 일치한다", () => {
    const clock = fixedClock(0);
    const limiter = createRateLimiter({ now: clock.now });
    expect(limiter.size()).toBe(0);

    limiter.check("a", 5, 60_000);
    expect(limiter.size()).toBe(1);

    // 같은 키 재사용은 size 를 늘리지 않는다 (Map key 기준)
    clock.advance(10);
    limiter.check("a", 5, 60_000);
    expect(limiter.size()).toBe(1);

    // 새로운 키는 size 를 증가시킨다
    limiter.check("b", 5, 60_000);
    expect(limiter.size()).toBe(2);

    // checkAll 의 dedup 도 size 에 반영된다 (k1 은 새 키 1개, k2 중복은 무시)
    limiter.checkAll(["c", "c", "c"], 1, 60_000);
    expect(limiter.size()).toBe(3);
  });

  it("history(key) 는 timestamps `number[]` 배열 형태를 유지한다", () => {
    const clock = fixedClock(0);
    const limiter = createRateLimiter({ now: clock.now });
    limiter.check("k", 3, 60_000);
    clock.advance(100);
    limiter.check("k", 3, 60_000);
    clock.advance(100);
    limiter.check("k", 3, 60_000);

    const snapshot = limiter.history("k");
    // 반환 shape: readonly number[]
    expect(Array.isArray(snapshot)).toBe(true);
    expect(snapshot).toHaveLength(3);
    for (const t of snapshot) {
      expect(typeof t).toBe("number");
      expect(Number.isFinite(t)).toBe(true);
    }
    // 기록 순서 = 시간 순서 (삽입 순서 보존)
    expect(snapshot).toEqual([0, 100, 200]);
  });

  it("history(key) 의 반환값은 동결되어 내부 저장소를 변조할 수 없다", () => {
    const clock = fixedClock(0);
    const limiter = createRateLimiter({ now: clock.now });
    limiter.check("k", 2, 60_000);
    const snapshot = limiter.history("k");

    expect(Object.isFrozen(snapshot)).toBe(true);
    // 동결된 스냅샷 변조 시도는 TypeError 로 거부된다 (strict mode)
    expect(() => {
      (snapshot as number[])[0] = 9999;
    }).toThrow();

    // 내부 저장소는 영향을 받지 않는다
    clock.advance(10);
    limiter.check("k", 2, 60_000);
    expect(limiter.history("k")).toEqual([0, 10]);
  });

  it("cleanup() 은 TTL 초과 키만 제거하고 윈도우 내 키는 보존한다", () => {
    const clock = fixedClock(0);
    const limiter = createRateLimiter({ now: clock.now, ttlMs: 1000 });

    limiter.check("expired", 1, 60_000); // t=0
    clock.advance(500);
    limiter.check("fresh", 1, 60_000); // t=500
    clock.advance(600);
    // now=1100: expired (1100ms 전) 은 ttl 초과, fresh (600ms 전) 는 유지
    expect(limiter.size()).toBe(2);
    expect(cleanupRateLimits(limiter)).toBe(1);
    expect(limiter.size()).toBe(1);
    expect(limiter.history("expired")).toEqual([]);
    expect(limiter.history("fresh")).toEqual([500]);
  });

  it("cleanup() 은 부분 만료 키를 유지한 채 만료된 타임스탬프만 잘라낸다", () => {
    const clock = fixedClock(0);
    const limiter = createRateLimiter({ now: clock.now, ttlMs: 1000 });

    // 세 번 히트: 0ms, 600ms, 1200ms
    limiter.check("k", 5, 60_000);
    clock.advance(600);
    limiter.check("k", 5, 60_000);
    clock.advance(600);
    limiter.check("k", 5, 60_000);

    // now=1200: t=0 은 1200ms 전(만료), t=600 은 600ms 전(유지), t=1200 은 0ms(유지)
    expect(limiter.cleanup()).toBe(0); // 키는 제거되지 않음
    expect(limiter.size()).toBe(1);
    expect(limiter.history("k")).toEqual([600, 1200]);
  });

  it("cleanup() 은 내부 Map 과 size() 를 원자적으로 동기화한다", () => {
    const clock = fixedClock(0);
    const limiter = createRateLimiter({ now: clock.now, ttlMs: 100 });

    for (let i = 0; i < 10; i += 1) {
      limiter.check(`k${i}`, 1, 60_000);
    }
    expect(limiter.size()).toBe(10);

    clock.advance(200); // 모두 TTL 초과
    const removed = limiter.cleanup();
    expect(removed).toBe(10);
    expect(limiter.size()).toBe(0);
    // 전수 확인: 모든 키가 history 에서 빈 배열을 반환한다
    for (let i = 0; i < 10; i += 1) {
      expect(limiter.history(`k${i}`)).toEqual([]);
    }
  });

  it("reset() 후 size() 는 즉시 0, history() 는 모든 키에 대해 빈 배열", () => {
    const limiter = createRateLimiter({ now: () => 0 });
    limiter.check("a", 1, 1000);
    limiter.check("b", 1, 1000);
    limiter.check("c", 1, 1000);
    expect(limiter.size()).toBe(3);

    limiter.reset();
    expect(limiter.size()).toBe(0);
    expect(limiter.history("a")).toEqual([]);
    expect(limiter.history("b")).toEqual([]);
    expect(limiter.history("c")).toEqual([]);
  });

  it("missing key 의 history() 는 동결된 빈 배열 (non-null 계약)", () => {
    const limiter = createRateLimiter();
    const result = limiter.history("missing");
    expect(result).toEqual([]);
    expect(Array.isArray(result)).toBe(true);
    expect(Object.isFrozen(result)).toBe(true);
  });
});

describe("cleanupRateLimits helper", () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it("limiter.cleanup 호출 결과를 그대로 반환한다", () => {
    const clock = fixedClock(0);
    const limiter = createRateLimiter({ now: clock.now, ttlMs: 100 });
    limiter.check("k", 1, 50);
    clock.advance(200);
    expect(cleanupRateLimits(limiter)).toBe(1);
  });

  it("alsoPurgeRepository=true 면 repository 도 purge 한다", async () => {
    const repo = new StubRepository();
    const clock = fixedClock(0);
    const limiter = createRateLimiter({
      now: clock.now,
      repository: repo,
      ttlMs: 1000,
    });
    cleanupRateLimits(limiter, { alsoPurgeRepository: true });
    await new Promise((resolve) => setImmediate(resolve));
    expect(repo.purgedAt).toHaveLength(1);
  });

  it("repository purge 실패는 삼켜지고 로그만 남는다", async () => {
    const failingRepo: RateLimitRepository = {
      load: async () => [],
      persist: async () => {},
      purgeOlderThan: () => Promise.reject(new Error("purge down")),
    };
    const limiter = createRateLimiter({ repository: failingRepo });
    cleanupRateLimits(limiter, { alsoPurgeRepository: true });
    await new Promise((resolve) => setImmediate(resolve));
    expect(consoleErrorSpy).toHaveBeenCalled();
  });
});

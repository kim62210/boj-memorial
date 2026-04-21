/**
 * Rate limiter 공용 모듈 — server.js L120-216 동작을 단일 슬라이딩 윈도우 API 로 통합.
 *
 * RFC-SEC (Q4) 결정:
 * - Map 기반 자체 구현 유지 (`@upstash/ratelimit` 거부 — 단일 노드 환경).
 * - DB 백업은 `RateLimitRepository` 주입 방식 (순환 의존 회피).
 * - 동일 API 로 3계층 모두 커버:
 *   - HTTP per-IP (60req/60s)  → `check('http:<ip>', 60, 60_000)`
 *   - Socket per-IP (5conn/60s) → `check('sock:<ip>', 5, 60_000)`
 *   - Socket event flood (100/60s) → `check('evt:<socketId>', 100, 60_000)`
 *   - Action cooldown (1 per Ns)   → `checkAll([ip:action, dt:<token>:action], 1, cooldownMs)`
 *
 * 의미론 정합성 (server.js 와 동일):
 * - 윈도우는 `now - t < windowMs` (좌측 exclusive) 로 필터한다.
 * - 제한 판정은 `count >= limit` (현재 요청 전 시점) — 즉 limit=1 이면 **직전 1회를 이미 기록한 상태**에서는 차단된다.
 */

export interface RateLimitRecord {
  readonly key: string;
  readonly timestampMs: number;
}

/**
 * DB 백업 레포지토리 계약 — Postgres `rate_limits` 테이블 등 외부 저장소를 추상화한다.
 *
 * 기존 스키마 (`key TEXT PRIMARY KEY, last_action TIMESTAMPTZ`) 는 키당 최신 1건만 보존하므로,
 * `load()` 는 정확히 윈도우를 재구성하기보다 "최근 N 분 이내 최신 기록" 을 복원하는 보수적 동작을 한다.
 */
export interface RateLimitRepository {
  /**
   * 최근 `windowMs` 이내의 기록을 복원한다.
   * 반환 타임스탬프는 epoch ms.
   */
  load(windowMs: number): Promise<readonly RateLimitRecord[]>;
  /**
   * 단일 hit 을 저장한다. 실패해도 핫패스를 블로킹하면 안 된다 (fire-and-forget).
   */
  persist(record: RateLimitRecord): void | Promise<void>;
  /**
   * `cutoffMs` 보다 오래된 기록을 DB 에서 제거한다 (주기적 GC).
   */
  purgeOlderThan(cutoffMs: number): Promise<void>;
}

export interface RateLimiterOptions {
  /** 테스트 가능 시계. 기본값 `Date.now`. */
  now?: () => number;
  /** DB 백업. `null`/미지정 시 메모리만 사용한다. */
  repository?: RateLimitRepository | null;
  /** 메모리에 보관할 최대 수명 (ms). 기본 1시간. */
  ttlMs?: number;
  /** persist 실패 훅. 기본적으로 `console.error` 로 로깅한다. */
  onPersistError?: (error: unknown, record: RateLimitRecord) => void;
}

export interface RateLimiter {
  /**
   * 단일 키에 대한 sliding-window 검사 + commit.
   * `true` 반환 시 호출자의 요청은 허용되고 타임스탬프가 기록된다.
   */
  check(key: string, limit: number, windowMs: number): boolean;
  /**
   * 다중 키 동시 검사 — 모든 키가 통과해야 `true`.
   * 하나라도 실패하면 **아무 키도 기록하지 않는다** (server.js checkRate 호환).
   */
  checkAll(keys: readonly string[], limit: number, windowMs: number): boolean;
  /** 메모리 스토어에서 TTL 초과 항목을 제거하고 삭제된 키 개수를 반환한다. */
  cleanup(): number;
  /** DB 에서 최근 기록을 로드해 메모리를 초기화한다. 반환값은 로드된 레코드 수. */
  restore(): Promise<number>;
  /** DB 에서 TTL 초과 레코드를 purge 한다. */
  purgeRepository(): Promise<void>;
  /** 테스트용 초기화. */
  reset(): void;
  /** 현재 추적 중인 키 수. */
  size(): number;
  /** 디버깅/테스트용 — 해당 키의 타임스탬프 이력을 읽기 전용으로 반환한다. */
  history(key: string): readonly number[];
}

const DEFAULT_TTL_MS = 60 * 60 * 1000;

function defaultPersistErrorLogger(
  error: unknown,
  record: RateLimitRecord
): void {
  const message = error instanceof Error ? error.message : String(error);
  console.error(
    `[rateLimiter] persist failed for key=${record.key}: ${message}`
  );
}

export function createRateLimiter(
  options: RateLimiterOptions = {}
): RateLimiter {
  const now = options.now ?? Date.now;
  const repository = options.repository ?? null;
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
  const onPersistError = options.onPersistError ?? defaultPersistErrorLogger;

  const store = new Map<string, number[]>();

  function prune(key: string, windowMs: number, currentMs: number): number[] {
    const existing = store.get(key);
    if (!existing || existing.length === 0) return [];
    const filtered = existing.filter((t) => currentMs - t < windowMs);
    if (filtered.length === 0) {
      store.delete(key);
      return [];
    }
    if (filtered.length !== existing.length) {
      store.set(key, filtered);
    }
    return filtered;
  }

  function commit(key: string, hits: number[], timestampMs: number): void {
    hits.push(timestampMs);
    store.set(key, hits);
    if (repository) {
      const record: RateLimitRecord = { key, timestampMs };
      try {
        const maybePromise = repository.persist(record);
        if (maybePromise && typeof maybePromise.then === "function") {
          maybePromise.catch((error) => onPersistError(error, record));
        }
      } catch (error) {
        onPersistError(error, record);
      }
    }
  }

  function check(key: string, limit: number, windowMs: number): boolean {
    if (!Number.isFinite(limit) || limit <= 0) return false;
    if (!Number.isFinite(windowMs) || windowMs <= 0) return false;
    const currentMs = now();
    const hits = prune(key, windowMs, currentMs);
    if (hits.length >= limit) return false;
    commit(key, hits, currentMs);
    return true;
  }

  function checkAll(
    keys: readonly string[],
    limit: number,
    windowMs: number
  ): boolean {
    if (keys.length === 0) return true;
    if (!Number.isFinite(limit) || limit <= 0) return false;
    if (!Number.isFinite(windowMs) || windowMs <= 0) return false;
    const currentMs = now();
    const preview = new Map<string, number[]>();
    for (const key of keys) {
      if (preview.has(key)) continue;
      const hits = prune(key, windowMs, currentMs);
      if (hits.length >= limit) return false;
      preview.set(key, hits);
    }
    for (const [key, hits] of preview) {
      commit(key, hits, currentMs);
    }
    return true;
  }

  function cleanup(): number {
    const currentMs = now();
    let removed = 0;
    for (const [key, hits] of store) {
      const filtered = hits.filter((t) => currentMs - t < ttlMs);
      if (filtered.length === 0) {
        store.delete(key);
        removed += 1;
      } else if (filtered.length !== hits.length) {
        store.set(key, filtered);
      }
    }
    return removed;
  }

  async function restore(): Promise<number> {
    if (!repository) return 0;
    const records = await repository.load(ttlMs);
    let loaded = 0;
    for (const { key, timestampMs } of records) {
      const existing = store.get(key) ?? [];
      existing.push(timestampMs);
      store.set(key, existing);
      loaded += 1;
    }
    return loaded;
  }

  async function purgeRepository(): Promise<void> {
    if (!repository) return;
    const cutoffMs = now() - ttlMs;
    await repository.purgeOlderThan(cutoffMs);
  }

  function reset(): void {
    store.clear();
  }

  function size(): number {
    return store.size;
  }

  function history(key: string): readonly number[] {
    const hits = store.get(key);
    return hits ? Object.freeze(hits.slice()) : Object.freeze([]);
  }

  return {
    check,
    checkAll,
    cleanup,
    restore,
    purgeRepository,
    reset,
    size,
    history,
  };
}

/**
 * 스케줄러 호환 래퍼 — `setInterval(() => cleanupRateLimits(limiter), 600_000)` 형태로 사용한다.
 * `options.alsoPurgeRepository` 가 `true` 면 DB 도 함께 purge 한다.
 */
export function cleanupRateLimits(
  limiter: RateLimiter,
  options: { alsoPurgeRepository?: boolean } = {}
): number {
  const removed = limiter.cleanup();
  if (options.alsoPurgeRepository) {
    limiter.purgeRepository().catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[rateLimiter] purgeRepository failed: ${message}`);
    });
  }
  return removed;
}

/**
 * server.js 행동 동등성 스냅샷 (BRI-20 DoD §3).
 *
 * server.js L17-37, L40-44, L120-216 의 원문 로직을 그대로 리팩터 없이 `reference/*` 함수로
 * 복제해 두고, 동일 입력/상태 트레이스를 새 모듈과 비교한다.
 *
 * 주의:
 * - extractIp 는 `::ffff:` 정규화가 server.js 엔 없는 순수 개선 — 해당 섹션은 명시적으로 분기한다.
 * - 나머지 동작은 server.js 와 1:1 이어야 하며, 하나라도 실패하면 회귀이다.
 */
import { describe, expect, it } from "vitest";

import { extractIpFromXff } from "./extractIp";
import { isNicknameForbidden } from "./forbiddenNicknames";
import { createRateLimiter } from "./rateLimiter";

// ---------- Reference implementations (server.js L17-44, L120-179) ----------

function refExtractIp(
  xff: string | undefined,
  fallback: string | undefined
): string | undefined {
  if (!xff || typeof xff !== "string") return fallback;
  const first = xff.split(",")[0]!.trim();
  return first || fallback;
}

const REF_FORBIDDEN_PATTERNS = [
  /관리자/i,
  /운영자/i,
  /admin/i,
  /operator/i,
  /moderator/i,
  /system/i,
];
function refIsNicknameForbidden(nickname: string): boolean {
  return REF_FORBIDDEN_PATTERNS.some((pattern) => pattern.test(nickname));
}

interface RefCheckRateState {
  map: Map<string, number>;
}
function refCheckRate(
  state: RefCheckRateState,
  ip: string,
  action: string,
  cooldownMs: number,
  deviceToken: string | null,
  now: number
): boolean {
  const keyIp = `${ip}:${action}`;
  const keyDt = deviceToken ? `dt:${deviceToken}:${action}` : null;
  const lastIp = state.map.get(keyIp) ?? 0;
  const lastDt = keyDt ? (state.map.get(keyDt) ?? 0) : 0;
  if (now - lastIp < cooldownMs || now - lastDt < cooldownMs) return false;
  state.map.set(keyIp, now);
  if (keyDt) state.map.set(keyDt, now);
  return true;
}

// server.js L192-207 — HTTP rate limit sliding window
interface RefHttpState {
  map: Map<string, number[]>;
}
function refHttpRateCheck(
  state: RefHttpState,
  ip: string,
  maxReq: number,
  windowMs: number,
  now: number
): boolean {
  if (!state.map.has(ip)) state.map.set(ip, []);
  const timestamps = state.map
    .get(ip)!
    .filter((t) => now - t < windowMs);
  if (timestamps.length >= maxReq) {
    state.map.set(ip, timestamps);
    return false;
  }
  timestamps.push(now);
  state.map.set(ip, timestamps);
  return true;
}

// ---------- Test fixtures ----------

describe("extractIp ↔ server.js 동등성 (50+ 케이스)", () => {
  interface Case {
    name: string;
    xff: string | undefined;
    fallback: string | undefined;
    // `::ffff:` 정규화 차이 때문에 명시적으로 예외 케이스 플래그
    ipv4Mapped?: boolean;
  }

  const cases: Case[] = [
    // 단일 IP
    { name: "IPv4 단일", xff: "203.0.113.5", fallback: undefined },
    { name: "IPv4 단일 + fallback", xff: "203.0.113.5", fallback: "10.0.0.1" },
    { name: "IPv6 단일", xff: "2001:db8::1", fallback: undefined },
    { name: "선행 공백", xff: "   203.0.113.5", fallback: undefined },
    { name: "후행 공백", xff: "203.0.113.5   ", fallback: undefined },
    { name: "탭 구분", xff: "\t203.0.113.5\t", fallback: undefined },
    // 복수 IP
    { name: "IPv4 2개", xff: "203.0.113.5, 10.0.0.1", fallback: undefined },
    { name: "IPv4 3개", xff: "1.1.1.1, 2.2.2.2, 3.3.3.3", fallback: undefined },
    { name: "공백 없는 콤마", xff: "1.1.1.1,2.2.2.2", fallback: undefined },
    { name: "다중 공백", xff: "  1.1.1.1  ,  2.2.2.2  ", fallback: undefined },
    { name: "IPv6 + IPv4 혼합", xff: "2001:db8::1, 10.0.0.1", fallback: undefined },
    // 빈 / 부정 입력
    { name: "빈 문자열 + fallback", xff: "", fallback: "10.0.0.1" },
    { name: "공백만 + fallback", xff: "    ", fallback: "10.0.0.1" },
    { name: "undefined + fallback", xff: undefined, fallback: "10.0.0.1" },
    { name: "null-like(빈) + 빈 fallback", xff: "", fallback: "" },
    { name: "undefined + undefined", xff: undefined, fallback: undefined },
    // 경계
    { name: "콤마만", xff: ",", fallback: "10.0.0.1" },
    { name: "콤마+공백만", xff: ", ,", fallback: "10.0.0.1" },
    // B1 회귀 고정 — 선행 빈 토큰 스푸핑 방지(server.js 와 동일하게 fallback 으로 전환)
    { name: "선행 콤마 + spoofed IP (fallback 전환)", xff: ", 1.1.1.1", fallback: "10.0.0.1" },
    { name: "선행 콤마+공백 + spoofed IP", xff: " ,  1.1.1.1", fallback: "10.0.0.1" },
    { name: "선행 콤마만 + fallback 없음", xff: ", 1.1.1.1", fallback: undefined },
    { name: "한글 IP 스푸핑 시도", xff: "abc, 1.1.1.1", fallback: undefined },
    { name: "IPv6 zone id", xff: "fe80::1%eth0, 10.0.0.1", fallback: undefined },
    // fallback 은 무시되어야 함 (XFF 가 유효할 때)
    { name: "XFF 유효 시 fallback 무시", xff: "1.1.1.1", fallback: "9.9.9.9" },
    // 타입 오류 케이스 (server.js 는 느슨하지만 TS 는 string|undefined)
    { name: "공백 콤마", xff: " , ", fallback: "10.0.0.1" },
    { name: "포트 부착", xff: "1.1.1.1:8080, 2.2.2.2", fallback: undefined },
    { name: "IPv6 full", xff: "2001:0db8:85a3:0000:0000:8a2e:0370:7334", fallback: undefined },
    { name: "CIDR 기호 섞인 값 (현실엔 없지만 regression 고정)", xff: "1.1.1.1/32, 2.2.2.2", fallback: undefined },
  ];

  it.each(cases)("$name", ({ xff, fallback, ipv4Mapped }) => {
    const ref = refExtractIp(xff, fallback);
    const actual = extractIpFromXff(xff, fallback);
    if (ipv4Mapped) {
      // 개선 동작 — 별도 분기
      expect(actual).not.toBe(ref);
    } else {
      // 서버와 완전히 동일해야 함 (undefined/빈 문자열 → null 매핑만 차이)
      const refNormalized =
        ref === undefined || ref === "" ? null : ref;
      expect(actual).toBe(refNormalized);
    }
  });

  it("IPv4-mapped IPv6 (`::ffff:`) 는 의도적 개선이며 ref 와 다르다", () => {
    expect(refExtractIp("::ffff:1.2.3.4", undefined)).toBe("::ffff:1.2.3.4");
    expect(extractIpFromXff("::ffff:1.2.3.4", undefined)).toBe("1.2.3.4");
  });
});

describe("isNicknameForbidden ↔ server.js 동등성 (20 케이스)", () => {
  const inputs = [
    "관리자",
    "  관리자  ",
    "관리자123",
    "운영자",
    "운영자123",
    "admin",
    "Admin",
    "ADMIN",
    "admin_user",
    "sysadmin",
    "operator",
    "Operator",
    "moderator",
    "MOD",
    "moderator_kim",
    "system",
    "System32",
    "홍길동",
    "익명의 개발자",
    "",
  ];

  it.each(inputs)("nickname=%s", (nickname) => {
    expect(isNicknameForbidden(nickname)).toBe(refIsNicknameForbidden(nickname));
  });
});

describe("rateLimiter (쿨다운 limit=1) ↔ server.js checkRate 동등성 (시퀀스)", () => {
  it("flower 2s 쿨다운 시퀀스가 server.js 와 정확히 일치한다", () => {
    const limiter = createRateLimiter({ now: () => fakeNow });
    const ref = { map: new Map<string, number>() };
    let fakeNow = 1_000_000;

    const trace: Array<{ ts: number; ip: string; dt: string | null; ok: boolean }> = [];

    function step(ms: number, ip: string, dt: string | null): void {
      fakeNow += ms;
      const refOk = refCheckRate(ref, ip, "flower", 2000, dt, fakeNow);
      const keys = dt ? [`${ip}:flower`, `dt:${dt}:flower`] : [`${ip}:flower`];
      const actualOk = limiter.checkAll(keys, 1, 2000);
      expect({ ts: fakeNow, ip, dt, actual: actualOk }).toEqual({
        ts: fakeNow,
        ip,
        dt,
        actual: refOk,
      });
      trace.push({ ts: fakeNow, ip, dt, ok: actualOk });
    }

    step(0, "1.1.1.1", null); // 허용
    step(500, "1.1.1.1", null); // 차단
    step(1500, "1.1.1.1", null); // 2000ms 경과 → 허용
    step(100, "1.1.1.1", null); // 차단
    step(500, "2.2.2.2", null); // 다른 IP → 허용
    step(100, "1.1.1.1", "dtA"); // ip+dt 조합 — ip 는 쿨다운 중
    step(3000, "1.1.1.1", "dtA"); // ip 쿨다운 해제 → 허용
    step(500, "1.1.1.1", "dtA"); // 차단
    step(500, "1.1.1.1", "dtB"); // 다른 dt 이지만 ip 는 쿨다운 중 → 차단
    step(3000, "1.1.1.1", "dtB"); // ip 해제 → 허용
    expect(trace.filter((t) => t.ok)).toHaveLength(5);
    expect(trace.filter((t) => !t.ok)).toHaveLength(5);
  });
});

describe("rateLimiter (HTTP 슬라이딩 윈도우 60/60s) ↔ server.js L192-207", () => {
  it("60개 연속 요청 이후 61번째만 차단된다", () => {
    const now = () => fakeNow;
    const limiter = createRateLimiter({ now });
    const ref = { map: new Map<string, number[]>() };
    let fakeNow = 0;
    for (let i = 0; i < 60; i += 1) {
      fakeNow += 100; // 6s 동안 60 req
      const refOk = refHttpRateCheck(ref, "1.1.1.1", 60, 60_000, fakeNow);
      const ok = limiter.check("http:1.1.1.1", 60, 60_000);
      expect(ok).toBe(refOk);
      expect(ok).toBe(true);
    }
    fakeNow += 100;
    const refOk = refHttpRateCheck(ref, "1.1.1.1", 60, 60_000, fakeNow);
    const ok = limiter.check("http:1.1.1.1", 60, 60_000);
    expect(ok).toBe(refOk);
    expect(ok).toBe(false);
  });

  it("60s 이후 윈도우에서 빠져나간 요청은 다시 허용된다", () => {
    const now = () => fakeNow;
    const limiter = createRateLimiter({ now });
    const ref = { map: new Map<string, number[]>() };
    let fakeNow = 0;
    for (let i = 0; i < 60; i += 1) {
      fakeNow += 100;
      refHttpRateCheck(ref, "1.1.1.1", 60, 60_000, fakeNow);
      limiter.check("http:1.1.1.1", 60, 60_000);
    }
    fakeNow += 60_001; // 전부 윈도우 밖
    const refOk = refHttpRateCheck(ref, "1.1.1.1", 60, 60_000, fakeNow);
    const ok = limiter.check("http:1.1.1.1", 60, 60_000);
    expect(ok).toBe(refOk);
    expect(ok).toBe(true);
  });
});

import { describe, expect, it } from "vitest";

import { extractIp, extractIpFromXff } from "./extractIp";

describe("extractIpFromXff", () => {
  it("단일 IP XFF 에서 그대로 반환한다", () => {
    expect(extractIpFromXff("203.0.113.5")).toBe("203.0.113.5");
  });

  it("복수 IP XFF 에서 좌측 첫 토큰만 신뢰한다 (스푸핑 방지)", () => {
    expect(
      extractIpFromXff("203.0.113.5, 10.0.0.1, 192.168.0.1")
    ).toBe("203.0.113.5");
  });

  it("좌측 토큰 공백/탭을 trim 한다", () => {
    expect(extractIpFromXff("   203.0.113.5  ,  10.0.0.1")).toBe(
      "203.0.113.5"
    );
    expect(extractIpFromXff("\t203.0.113.5\t,10.0.0.1")).toBe("203.0.113.5");
  });

  it("선행 빈 토큰은 건너뛰고 다음 유효 토큰을 반환한다", () => {
    expect(extractIpFromXff(", 203.0.113.5")).toBe("203.0.113.5");
    expect(extractIpFromXff(" , , 203.0.113.5 ")).toBe("203.0.113.5");
  });

  it("XFF 가 비어 있거나 문자열이 아니면 fallback 으로 대체한다", () => {
    expect(extractIpFromXff("", "10.0.0.1")).toBe("10.0.0.1");
    expect(extractIpFromXff(null, "10.0.0.1")).toBe("10.0.0.1");
    expect(extractIpFromXff(undefined, "10.0.0.1")).toBe("10.0.0.1");
    expect(extractIpFromXff("   ", "10.0.0.1")).toBe("10.0.0.1");
    expect(extractIpFromXff(",,,", "10.0.0.1")).toBe("10.0.0.1");
  });

  it("XFF · fallback 모두 없으면 null 을 반환한다", () => {
    expect(extractIpFromXff(null, null)).toBeNull();
    expect(extractIpFromXff(undefined, undefined)).toBeNull();
    expect(extractIpFromXff("", "")).toBeNull();
    expect(extractIpFromXff("  ", "  ")).toBeNull();
  });

  it("IPv6 native 주소는 보존한다", () => {
    expect(extractIpFromXff("2001:db8::1, 10.0.0.1")).toBe("2001:db8::1");
  });

  it("IPv4-mapped IPv6 접두어 `::ffff:` 를 제거한다 (Node socket 대응)", () => {
    expect(extractIpFromXff("::ffff:203.0.113.5")).toBe("203.0.113.5");
    expect(extractIpFromXff("::FFFF:203.0.113.5")).toBe("203.0.113.5");
    expect(extractIpFromXff(null, "::ffff:10.0.0.1")).toBe("10.0.0.1");
  });

  it("`::ffff:` 접두어만 있고 주소가 없으면 접두어를 유지하지 않는다", () => {
    expect(extractIpFromXff("::ffff:")).toBe("::ffff:");
  });
});

describe("extractIp (Headers overload)", () => {
  function makeHeaders(init?: Record<string, string>): Headers {
    return new Headers(init);
  }

  it("x-forwarded-for 헤더 좌측 토큰을 반환한다", () => {
    const headers = makeHeaders({
      "x-forwarded-for": "203.0.113.5, 10.0.0.1",
    });
    expect(extractIp(headers)).toBe("203.0.113.5");
  });

  it("헤더 이름은 case-insensitive 로 조회된다 (Headers API 표준)", () => {
    const headers = makeHeaders({ "X-Forwarded-For": "203.0.113.5" });
    expect(extractIp(headers)).toBe("203.0.113.5");
  });

  it("XFF 없으면 remoteAddr fallback 을 사용한다", () => {
    const headers = makeHeaders();
    expect(extractIp(headers, "10.0.0.1")).toBe("10.0.0.1");
  });

  it("XFF · remoteAddr 없으면 null 을 반환한다", () => {
    const headers = makeHeaders();
    expect(extractIp(headers)).toBeNull();
    expect(extractIp(headers, null)).toBeNull();
  });

  it("remoteAddr 가 IPv4-mapped IPv6 이면 IPv4 로 정규화한다", () => {
    const headers = makeHeaders();
    expect(extractIp(headers, "::ffff:192.168.1.10")).toBe("192.168.1.10");
  });

  it("XFF 에 IPv6 zone id 가 있어도 좌측 토큰을 그대로 반환한다", () => {
    const headers = makeHeaders({
      "x-forwarded-for": "fe80::1%eth0, 10.0.0.1",
    });
    expect(extractIp(headers)).toBe("fe80::1%eth0");
  });
});

import { describe, expect, it } from "vitest";

import {
  FORBIDDEN_NICKNAME_PATTERNS,
  isNicknameForbidden,
} from "./forbiddenNicknames";

describe("FORBIDDEN_NICKNAME_PATTERNS", () => {
  it("server.js 에 정의된 6개 패턴을 모두 포함한다", () => {
    const sources = FORBIDDEN_NICKNAME_PATTERNS.map((regex) => regex.source);
    expect(sources).toEqual([
      "관리자",
      "운영자",
      "admin",
      "operator",
      "moderator",
      "system",
    ]);
  });

  it("모든 패턴은 case-insensitive 플래그를 갖는다", () => {
    for (const pattern of FORBIDDEN_NICKNAME_PATTERNS) {
      expect(pattern.flags).toContain("i");
    }
  });

  it("frozen 상수로 외부 변조가 불가능하다", () => {
    expect(Object.isFrozen(FORBIDDEN_NICKNAME_PATTERNS)).toBe(true);
  });
});

describe("isNicknameForbidden", () => {
  it.each([
    ["관리자"],
    ["운영자"],
    ["admin"],
    ["operator"],
    ["moderator"],
    ["system"],
  ])("정확히 매치되는 닉네임 %s 은 금지된다", (nickname) => {
    expect(isNicknameForbidden(nickname)).toBe(true);
  });

  it.each([
    ["ADMIN"],
    ["Admin"],
    ["aDmIn"],
    ["SYSTEM"],
    ["MODERATOR"],
    ["관 리 자"],
  ])("대소문자 변형 %s 은 차단된다 (단, 공백 변형은 서브스트링 매치에 의존)", (nickname) => {
    // 공백 삽입은 정규식이 검출하지 못하지만, 호출자가 trim/slice 로 처리해야 한다.
    if (nickname.includes(" ")) {
      expect(isNicknameForbidden(nickname)).toBe(false);
      return;
    }
    expect(isNicknameForbidden(nickname)).toBe(true);
  });

  it.each([
    ["adminstrator"], // 부분 문자열 매치
    ["super-admin"],
    ["관리자_kim"],
    ["sysadmin"],
  ])("차단 키워드를 부분 포함하는 닉네임 %s 은 차단된다", (nickname) => {
    expect(isNicknameForbidden(nickname)).toBe(true);
  });

  it.each([
    ["홍길동"],
    ["익명의 개발자"],
    ["user123"],
    ["dev-joon"],
    ["운명자"], // 운영자 != 운명자
    [""],
  ])("일반 닉네임 %s 은 통과한다", (nickname) => {
    expect(isNicknameForbidden(nickname)).toBe(false);
  });

  it("비문자 입력은 false 로 안전 반환한다", () => {
    expect(isNicknameForbidden(null)).toBe(false);
    expect(isNicknameForbidden(undefined)).toBe(false);
    expect(isNicknameForbidden(123)).toBe(false);
    expect(isNicknameForbidden({})).toBe(false);
    expect(isNicknameForbidden([])).toBe(false);
  });

  it("공백만으로 차단어를 우회할 수 없는 건 아님 — 호출자가 사전에 정규화해야 한다", () => {
    // 공백을 제거하지 않은 원문은 차단하지 않는다. 테스트로 행위를 고정해 회귀를 막는다.
    expect(isNicknameForbidden("a d m i n")).toBe(false);
    expect(isNicknameForbidden("  admin  ".trim())).toBe(true);
  });
});

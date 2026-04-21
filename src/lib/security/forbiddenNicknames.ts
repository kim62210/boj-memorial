/**
 * 금지 닉네임 패턴 — server.js L25-37 1:1 이식.
 *
 * RFC-SEC (Q3) 결정:
 * - env/외부 config 분리 없이 코드 상수 유지 (운영 부담 증가 방지).
 * - 정규식 리스트 + 공통 `isForbidden()` 함수로만 모듈화한다.
 * - 추가 패턴은 PR 리뷰 + 단위 테스트를 통해 확장한다.
 */

export const FORBIDDEN_NICKNAME_PATTERNS: readonly RegExp[] = Object.freeze([
  /관리자/i,
  /운영자/i,
  /admin/i,
  /operator/i,
  /moderator/i,
  /system/i,
]);

/**
 * 닉네임이 금지 패턴 중 하나에 매치되는지 판정한다.
 * - 비문자/비정상 입력은 안전하게 `false` 를 반환한다 (즉, 차단 대상 아님).
 * - 호출자는 별도로 trim/slice 검증을 해야 한다.
 */
export function isNicknameForbidden(nickname: unknown): boolean {
  if (typeof nickname !== "string") return false;
  if (nickname.length === 0) return false;
  return FORBIDDEN_NICKNAME_PATTERNS.some((pattern) => pattern.test(nickname));
}

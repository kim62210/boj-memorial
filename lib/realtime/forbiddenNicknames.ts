/**
 * 금지 닉네임 패턴. 기존 server.js L26-37 동등.
 * BRI-20 완료 시 lib/security/forbiddenNicknames.ts 로 이관 예정.
 */
const FORBIDDEN_NICKNAMES: readonly RegExp[] = [
  /관리자/i,
  /운영자/i,
  /admin/i,
  /operator/i,
  /moderator/i,
  /system/i,
]

export function isNicknameForbidden(nickname: string): boolean {
  return FORBIDDEN_NICKNAMES.some((p) => p.test(nickname))
}

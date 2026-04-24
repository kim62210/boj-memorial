const FORBIDDEN_NICKNAME_PATTERNS: readonly RegExp[] = [
  /관리자/i,
  /운영자/i,
  /admin/i,
  /operator/i,
  /moderator/i,
  /system/i,
] as const;

export function isNicknameForbidden(nickname: string): boolean {
  return FORBIDDEN_NICKNAME_PATTERNS.some((pattern) => pattern.test(nickname));
}

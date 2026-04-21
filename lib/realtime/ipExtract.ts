/**
 * X-Forwarded-For 좌측 첫 토큰만 신뢰 (업스트림 Caddy 1홉 전제).
 * BRI-20 완료 시 lib/security/extractIp.ts 로 이관 예정.
 */
export function extractIp(
  xff: string | string[] | undefined,
  fallback: string | undefined,
): string {
  if (!xff) return fallback ?? 'unknown'
  const raw = Array.isArray(xff) ? xff[0] : xff
  if (typeof raw !== 'string') return fallback ?? 'unknown'
  const first = raw.split(',')[0]?.trim()
  if (!first) return fallback ?? 'unknown'
  return first.startsWith('::ffff:') ? first.slice(7) : first
}

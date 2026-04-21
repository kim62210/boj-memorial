/**
 * IP 추출 공용 모듈 — server.js L40-44 1:1 이식.
 *
 * 정책 (RFC-SEC / [BRI-17]):
 * - Caddy 1홉 reverse-proxy 앞단 전제 → `X-Forwarded-For` 좌측 첫 토큰만 신뢰한다.
 * - 멀티홉 도입 시점엔 별도 RFC 에서 `NEXT_TRUSTED_PROXIES` CIDR 화이트리스트를 다룬다.
 * - IPv4-mapped IPv6 접두어 `::ffff:` 는 제거해 키 정합성을 유지한다 (Node `socket.remoteAddress` 대응).
 */

const IPV4_MAPPED_PREFIX = "::ffff:";

function stripIpv4MappedPrefix(ip: string): string {
  if (ip.length <= IPV4_MAPPED_PREFIX.length) return ip;
  return ip.toLowerCase().startsWith(IPV4_MAPPED_PREFIX)
    ? ip.slice(IPV4_MAPPED_PREFIX.length)
    : ip;
}

function normalize(ip: string | null | undefined): string | null {
  if (typeof ip !== "string") return null;
  const trimmed = ip.trim();
  if (!trimmed) return null;
  return stripIpv4MappedPrefix(trimmed);
}

/**
 * X-Forwarded-For 문자열에서 좌측 첫 토큰을 IP 로 추출한다.
 * 공백/콤마 구분 모두 허용하고, 빈 토큰은 건너뛴다 (`", 1.1.1.1"` → `1.1.1.1`).
 */
export function extractIpFromXff(
  xff: string | null | undefined,
  fallback?: string | null
): string | null {
  if (typeof xff === "string") {
    for (const token of xff.split(",")) {
      const resolved = normalize(token);
      if (resolved) return resolved;
    }
  }
  return normalize(fallback);
}

/**
 * Headers / remoteAddress 조합에서 클라이언트 IP 를 결정한다.
 *
 * Next.js Route Handler: `extractIp(req.headers)` — `req` 의 remote addr 는 Route Handler 에서
 * 직접 노출되지 않으므로 custom server 계층에서 전달받아 두 번째 인자로 주입한다.
 */
export function extractIp(
  headers: Headers,
  remoteAddr?: string | null
): string | null {
  return extractIpFromXff(headers.get("x-forwarded-for"), remoteAddr);
}

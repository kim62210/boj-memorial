/**
 * Parse the left-most IP from an X-Forwarded-For header.
 * Trusts the first entry only — valid when exactly one proxy hop sits in
 * front of the app (Caddy in this deployment). Reject and fall back if the
 * header is absent, empty, or not a string.
 */
export function extractIp(
  xff: string | null | undefined,
  fallback: string | null | undefined,
): string {
  if (typeof xff !== 'string' || xff.length === 0) {
    return fallback ?? 'unknown';
  }
  const first = xff.split(',')[0]?.trim();
  if (!first) return fallback ?? 'unknown';
  return first;
}

export function extractIpFromRequest(request: Request): string {
  const headers = request.headers;
  const xff = headers.get('x-forwarded-for');
  const real = headers.get('x-real-ip');
  const fallback = real ?? 'unknown';
  return extractIp(xff, fallback);
}

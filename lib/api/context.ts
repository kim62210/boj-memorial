import { extractIpFromRequest } from '@/lib/security/extractIp';

export interface RequestContext {
  ip: string;
  userAgent: string;
}

export function getRequestContext(request: Request): RequestContext {
  return {
    ip: extractIpFromRequest(request),
    userAgent: (request.headers.get('user-agent') ?? '').slice(0, 500),
  };
}

/**
 * Safely parse a JSON body with an explicit byte cap (defaults to 1 KiB to
 * match legacy `express.json({ limit: "1kb" })`). Returns `null` on any
 * parse or size failure; the caller is responsible for the 400 response.
 */
export async function readJsonBody<T = unknown>(
  request: Request,
  maxBytes = 1024,
): Promise<T | null> {
  const contentLength = request.headers.get('content-length');
  if (contentLength && Number(contentLength) > maxBytes) return null;
  try {
    const text = await request.text();
    if (new TextEncoder().encode(text).byteLength > maxBytes) return null;
    if (text.length === 0) return null;
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

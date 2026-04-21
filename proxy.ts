import createMiddleware from 'next-intl/middleware'
import { NextResponse, type NextRequest } from 'next/server'

import { routing } from './i18n/routing'

const HTTP_RATE_LIMIT = 60
const HTTP_RATE_WINDOW_MS = 60_000

const handleI18nRouting = createMiddleware(routing)
const httpRateMap = new Map<string, number[]>()

function compactCsp(value: string) {
  return value.replace(/\s{2,}/g, ' ').trim()
}

function buildCsp(nonce: string) {
  const isDev = process.env.NODE_ENV === 'development'
  return compactCsp(`
    default-src 'self';
    script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ''};
    style-src 'self' 'nonce-${nonce}';
    img-src 'self' data: blob:;
    connect-src 'self' wss:${isDev ? ' ws:' : ''};
    font-src 'self';
    object-src 'none';
    base-uri 'self';
    form-action 'self';
    frame-ancestors 'none';
    upgrade-insecure-requests;
  `)
}

function firstHeaderValue(value: string | null) {
  return value?.split(',')[0]?.trim() || null
}

function extractIp(headers: Headers) {
  return (
    firstHeaderValue(headers.get('x-forwarded-for')) ??
    firstHeaderValue(headers.get('x-real-ip')) ??
    firstHeaderValue(headers.get('cf-connecting-ip')) ??
    'unknown'
  )
}

function checkHttpRate(ip: string, now = Date.now()) {
  const timestamps = (httpRateMap.get(ip) ?? []).filter((ts) => now - ts < HTTP_RATE_WINDOW_MS)

  if (timestamps.length >= HTTP_RATE_LIMIT) {
    httpRateMap.set(ip, timestamps)
    return false
  }

  timestamps.push(now)
  httpRateMap.set(ip, timestamps)
  return true
}

function applySecurityHeaders(response: NextResponse, nonce: string, requestId: string) {
  response.headers.set('Content-Security-Policy', buildCsp(nonce))
  response.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload')
  response.headers.set('X-Frame-Options', 'DENY')
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('Referrer-Policy', 'no-referrer')
  response.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  )
  response.headers.set('x-nonce', nonce)
  response.headers.set('x-request-id', requestId)
  return response
}

function applyRequestHeaders(response: NextResponse, requestHeaders: Headers) {
  const headerCarrier = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  })

  for (const [key, value] of headerCarrier.headers) {
    if (key === 'x-middleware-override-headers' || key.startsWith('x-middleware-request-')) {
      response.headers.set(key, value)
    }
  }
}

export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64')
  const requestId = crypto.randomUUID()
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-nonce', nonce)
  requestHeaders.set('x-request-id', requestId)
  requestHeaders.set('Content-Security-Policy', buildCsp(nonce))

  const routedResponse = request.nextUrl.pathname.startsWith('/api/')
    ? NextResponse.next()
    : handleI18nRouting(request)
  const ip = extractIp(request.headers)

  if (!checkHttpRate(ip)) {
    const response = applySecurityHeaders(
      NextResponse.json(
        { detail: 'Too many requests. Please retry later.', code: 'RATE_LIMITED' },
        { status: 429, headers: { 'Retry-After': '60' } },
      ),
      nonce,
      requestId,
    )
    applyRequestHeaders(response, requestHeaders)
    return response
  }

  applyRequestHeaders(routedResponse, requestHeaders)
  return applySecurityHeaders(routedResponse, nonce, requestId)
}

export default proxy

export function resetProxyRateLimitsForTests() {
  httpRateMap.clear()
}

export const config = {
  matcher: ['/api/:path*', '/((?!api|_next|_vercel|socket.io|.*\\..*).*)'],
}

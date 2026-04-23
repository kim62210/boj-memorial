import createMiddleware from 'next-intl/middleware'
import { NextResponse, type NextRequest } from 'next/server'

import { routing } from './i18n/routing'

const HTTP_RATE_LIMIT = 60
const HTTP_RATE_WINDOW_MS = 60_000

const handleI18nRouting = createMiddleware(routing)
const httpRateMap = new Map<string, number[]>()

function generateNonce() {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString('base64')
}

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

function isLegacyHtmlEntrypoint(pathname: string) {
  return pathname === '/index.html'
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

function cleanupHttpRateMap(now = Date.now()) {
  for (const [ip, timestamps] of httpRateMap) {
    const active = timestamps.filter((ts) => now - ts < HTTP_RATE_WINDOW_MS)
    if (active.length > 0) {
      httpRateMap.set(ip, active)
    } else {
      httpRateMap.delete(ip)
    }
  }
}

const cleanupTimer = setInterval(cleanupHttpRateMap, 120_000)
if (typeof cleanupTimer !== 'number') {
  cleanupTimer.unref()
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

function mergeOverrideHeader(existing: string | null, incoming: string) {
  const names = new Set<string>()
  for (const value of [existing, incoming]) {
    if (!value) continue
    for (const name of value.split(',')) {
      const trimmed = name.trim()
      if (trimmed) names.add(trimmed)
    }
  }

  return [...names].join(',')
}

function applyRequestHeaders(response: NextResponse, requestHeaders: Headers) {
  const headerCarrier = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  })

  for (const [key, value] of headerCarrier.headers) {
    if (key === 'x-middleware-override-headers') {
      response.headers.set(key, mergeOverrideHeader(response.headers.get(key), value))
    } else if (key.startsWith('x-middleware-request-')) {
      response.headers.set(key, value)
    }
  }
}

export function proxy(request: NextRequest) {
  const nonce = generateNonce()
  const requestId = crypto.randomUUID()
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-nonce', nonce)
  requestHeaders.set('x-request-id', requestId)

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

  if (isLegacyHtmlEntrypoint(request.nextUrl.pathname)) {
    const target = new URL('/', request.url)
    const response = applySecurityHeaders(NextResponse.redirect(target, 308), nonce, requestId)
    applyRequestHeaders(response, requestHeaders)
    return response
  }

  const routedResponse = request.nextUrl.pathname.startsWith('/api/')
    ? NextResponse.next()
    : handleI18nRouting(request)

  applyRequestHeaders(routedResponse, requestHeaders)
  return applySecurityHeaders(routedResponse, nonce, requestId)
}

export default proxy

export function resetProxyRateLimitsForTests() {
  httpRateMap.clear()
}

export function cleanupProxyRateLimitsForTests(now?: number) {
  cleanupHttpRateMap(now)
}

export function getProxyRateLimitKeyCountForTests() {
  return httpRateMap.size
}

export const config = {
  matcher: ['/api/:path*', '/index.html', '/((?!api|_next|_vercel|socket.io|.*\\..*).*)'],
}

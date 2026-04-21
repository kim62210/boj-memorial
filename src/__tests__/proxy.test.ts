import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { proxy, resetProxyRateLimitsForTests } from '../../proxy'

vi.mock('next-intl/middleware', () => ({
  default: () => (request: { url: string }) => {
    const response = new Response(null, { status: 200 })
    response.headers.set('x-middleware-rewrite', new URL('/ko', request.url).toString())
    return response
  },
}))

type NextRequestInit = ConstructorParameters<typeof NextRequest>[1]

function request(path = '/', init: NextRequestInit = {}) {
  return new NextRequest(new URL(path, 'https://boj-memorial.example'), init)
}

describe('proxy security boundary', () => {
  beforeEach(() => {
    resetProxyRateLimitsForTests()
  })

  it('allows 60 requests per IP per minute and rejects the 61st request', () => {
    let response = proxy(
      request('/api/incense', { headers: { 'x-forwarded-for': '203.0.113.10' } }),
    )

    for (let i = 1; i < 60; i += 1) {
      response = proxy(request('/api/incense', { headers: { 'x-forwarded-for': '203.0.113.10' } }))
      expect(response.status).toBe(200)
    }

    const blocked = proxy(
      request('/api/incense', { headers: { 'x-forwarded-for': '203.0.113.10' } }),
    )

    expect(response.status).toBe(200)
    expect(blocked.status).toBe(429)
    expect(blocked.headers.get('content-type')).toContain('application/json')
    expect(blocked.headers.get('retry-after')).toBe('60')
    expect(blocked.headers.get('strict-transport-security')).toBe(
      'max-age=63072000; includeSubDomains; preload',
    )
    expect(blocked.headers.get('x-frame-options')).toBe('DENY')
  })

  it('generates a nonce-based strict CSP and request id on allowed requests', () => {
    const response = proxy(request('/', { headers: { 'x-forwarded-for': '198.51.100.20' } }))
    const nonce = response.headers.get('x-nonce')
    const csp = response.headers.get('content-security-policy')

    expect(response.status).toBe(200)
    expect(response.headers.get('x-middleware-rewrite')).toBe('https://boj-memorial.example/ko')
    expect(response.headers.get('x-request-id')).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    )
    expect(nonce).toBeTruthy()
    expect(csp).toContain(`script-src 'self' 'nonce-${nonce}'`)
    expect(csp).toContain(`style-src 'self' 'nonce-${nonce}'`)
    expect(csp).toContain("frame-ancestors 'none'")
    expect(csp).not.toContain("'unsafe-inline'")
  })
})

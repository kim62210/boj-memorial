import { beforeEach, describe, expect, it } from 'vitest'

import { escapeHtml } from './escapeHtml.js'
import { isNicknameForbidden } from './forbiddenNicknames.js'
import { extractIp } from './ipExtract.js'
import {
  __resetPresence,
  decrementOnline,
  getOnline,
  incrementOnline,
} from './presence.js'
import {
  SOCKET_RATE_LIMITS,
  __resetSocketRateLimit,
  admitConnection,
  registerEvent,
  resetEventCounters,
  trackSocketClose,
  trackSocketOpen,
} from './socketRateLimit.js'

describe('realtime primitive helpers', () => {
  beforeEach(() => {
    __resetPresence()
    __resetSocketRateLimit()
  })

  it('escapes user controlled HTML fields', () => {
    expect(escapeHtml('<b title="x">&</b>')).toBe('&lt;b title=&quot;x&quot;&gt;&amp;&lt;/b&gt;')
  })

  it('blocks privileged nickname impersonation patterns', () => {
    expect(isNicknameForbidden('관리자')).toBe(true)
    expect(isNicknameForbidden('system')).toBe(true)
    expect(isNicknameForbidden('평범한 이용자')).toBe(false)
  })

  it('extracts the first forwarded IP and falls back on empty values', () => {
    expect(extractIp(' 203.0.113.10, 10.0.0.1 ', '127.0.0.1')).toBe('203.0.113.10')
    expect(extractIp('', '127.0.0.1')).toBe('127.0.0.1')
    expect(extractIp(undefined, '127.0.0.1')).toBe('127.0.0.1')
  })

  it('tracks online presence without going below zero', () => {
    expect(incrementOnline()).toBe(1)
    expect(incrementOnline()).toBe(2)
    expect(decrementOnline()).toBe(1)
    expect(decrementOnline()).toBe(0)
    expect(decrementOnline()).toBe(0)
    expect(getOnline()).toBe(0)
  })

  it('limits handshakes per IP in a rolling window', () => {
    const now = Date.now()
    for (let i = 0; i < SOCKET_RATE_LIMITS.CONN_MAX; i++) {
      expect(admitConnection('10.40.0.1', now + i)).toBe(true)
    }
    expect(admitConnection('10.40.0.1', now + 10)).toBe(false)
    expect(admitConnection('10.40.0.1', now + SOCKET_RATE_LIMITS.CONN_WINDOW_MS + 1)).toBe(true)
  })

  it('disconnects sockets after the per-minute event flood limit', () => {
    trackSocketOpen('socket-1')
    for (let i = 0; i < SOCKET_RATE_LIMITS.EVENT_FLOOD_LIMIT; i++) {
      expect(registerEvent('socket-1')).toBe(true)
    }
    expect(registerEvent('socket-1')).toBe(false)

    resetEventCounters()
    expect(registerEvent('socket-1')).toBe(true)

    trackSocketClose('socket-1')
    expect(registerEvent('socket-1')).toBe(true)
  })
})

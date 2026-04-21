/**
 * Socket.IO handshake rate limit (IP 당 5 conn/min) 및
 * per-socket event flood protection (100 event/min).
 *
 * 기존 server.js L327-346, L354-366 동등.
 */
const CONN_WINDOW_MS = 60_000
const CONN_MAX = 5
const EVENT_FLOOD_LIMIT = 100

const connMap = new Map<string, number[]>()
const eventCounters = new Map<string, number>()

/**
 * 주어진 IP 가 연결 허용 윈도우 안에 있는지 확인하고 타임스탬프를 기록한다.
 * 반환값이 false 면 handshake 를 거절해야 한다.
 */
export function admitConnection(ip: string, now: number = Date.now()): boolean {
  const fresh = (connMap.get(ip) ?? []).filter((t) => now - t < CONN_WINDOW_MS)
  if (fresh.length >= CONN_MAX) {
    connMap.set(ip, fresh)
    return false
  }
  fresh.push(now)
  connMap.set(ip, fresh)
  return true
}

export function trackSocketOpen(socketId: string): void {
  eventCounters.set(socketId, 0)
}

export function trackSocketClose(socketId: string): void {
  eventCounters.delete(socketId)
}

/**
 * socket.onevent 훅에서 호출. 반환값 false 면 해당 소켓을 끊어야 한다.
 */
export function registerEvent(socketId: string): boolean {
  const next = (eventCounters.get(socketId) ?? 0) + 1
  eventCounters.set(socketId, next)
  return next <= EVENT_FLOOD_LIMIT
}

/** 1분 주기 flood 카운터 전체 초기화. */
export function resetEventCounters(): void {
  eventCounters.clear()
}

/** 테스트 전용. */
export function __resetSocketRateLimit(): void {
  connMap.clear()
  eventCounters.clear()
}

export const SOCKET_RATE_LIMITS = {
  CONN_WINDOW_MS,
  CONN_MAX,
  EVENT_FLOOD_LIMIT,
} as const

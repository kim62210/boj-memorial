/**
 * Socket.IO 이벤트 오케스트레이션. 기존 server.js L314-486 을 TypeScript 로 이식한다.
 *
 * 계약:
 *   - 서버→클라 11개: online, flower:update, flower:animation, comment:new, comment:error,
 *     rate:limited, report:ack, incense:state, incense:busy, incense:replacing:start,
 *     incense:replacing:end
 *   - 클라→서버 4개: flower, comment, report, incense:replace
 *
 * 상태는 모듈 scope 객체로 공유되며, 멀티 인스턴스 운영 시 RFC-BE D3 에 따라 Redis 외부화 단계에서 대체된다.
 */
import type { Server, Socket } from 'socket.io'
import { extractIp } from './ipExtract'
import { isNicknameForbidden } from './forbiddenNicknames'
import { escapeHtml } from './escapeHtml'
import { checkRate } from './rateLimiter'
import {
  admitConnection,
  registerEvent,
  resetEventCounters as _resetEventCounters,
  trackSocketClose,
  trackSocketOpen,
} from './socketRateLimit'
import { flushFlowers, getFlowerTotal, placeFlower } from './flowerBuffer'
import {
  beginReplace,
  getIncenseTotal,
  getEndsAt,
  isReplacing,
  snapshot as incenseSnapshot,
  tick as incenseTick,
} from './incenseState'
import { decrementOnline, getOnline, incrementOnline } from './presence'
import { commentsRepo, reportsRepo } from './repositories'
import type {
  ClientToServerEvents,
  InterServerEvents,
  ServerToClientEvents,
  SocketData,
} from './types'

export type TypedServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>
type TypedSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>

export const COOLDOWN_MS = {
  flower: 2_000,
  comment: 5_000,
  report: 30_000,
  incense: 3_000,
} as const

const COMMENT_MAX_LEN = 500
const NICKNAME_MAX_LEN = 30
const DEVICE_TOKEN_MAX_LEN = 100
const USER_AGENT_MAX_LEN = 500
const REASON_MAX_LEN = 500
const DEFAULT_NICKNAME = '익명의 개발자'

function normalizeDeviceToken(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  return trimmed.slice(0, DEVICE_TOKEN_MAX_LEN)
}

function socketIp(socket: TypedSocket): string {
  return extractIp(socket.handshake.headers['x-forwarded-for'], socket.handshake.address)
}

function userAgentOf(socket: TypedSocket): string {
  const raw = socket.handshake.headers['user-agent']
  return typeof raw === 'string' ? raw.slice(0, USER_AGENT_MAX_LEN) : ''
}

export function registerSocketHandlers(io: TypedServer): void {
  // Handshake gate: connection rate limit per IP
  io.use((socket, next) => {
    const ip = socketIp(socket as TypedSocket)
    if (!admitConnection(ip)) {
      next(new Error('Too many connections'))
      return
    }
    next()
  })

  io.on('connection', (socket: TypedSocket) => {
    const ip = socketIp(socket)
    const userAgent = userAgentOf(socket)
    socket.data.ip = ip
    socket.data.userAgent = userAgent

    const online = incrementOnline()
    io.emit('online', online)

    // per-socket event flood protection — socket.use() 는 공식 middleware API.
    trackSocketOpen(socket.id)
    socket.use((_event, next) => {
      if (!registerEvent(socket.id)) {
        console.error('Socket flood detected, disconnecting:', socket.id)
        socket.disconnect(true)
        return
      }
      next()
    })

    socket.on('flower', (data) => {
      const dt = normalizeDeviceToken(data?.deviceToken)
      if (!checkRate(ip, 'flower', COOLDOWN_MS.flower, dt)) {
        socket.emit('rate:limited', { seconds: COOLDOWN_MS.flower / 1000 })
        return
      }
      const total = placeFlower()
      io.emit('flower:update', total)
      io.emit('flower:animation', {})
    })

    socket.on('comment', async (data) => {
      const dt = normalizeDeviceToken(data?.deviceToken)
      if (!checkRate(ip, 'comment', COOLDOWN_MS.comment, dt)) {
        socket.emit('rate:limited', { seconds: COOLDOWN_MS.comment / 1000 })
        return
      }
      const rawMessage = typeof data?.message === 'string' ? data.message.trim() : ''
      if (!rawMessage) return
      const message = rawMessage.slice(0, COMMENT_MAX_LEN)

      const rawNickname = typeof data?.nickname === 'string' ? data.nickname.trim() : ''
      const nickname = (rawNickname || DEFAULT_NICKNAME).slice(0, NICKNAME_MAX_LEN)

      if (isNicknameForbidden(nickname)) {
        socket.emit('comment:error', { error: '사용할 수 없는 닉네임입니다.' })
        return
      }

      try {
        const row = await commentsRepo.insert({
          nickname: escapeHtml(nickname),
          message: escapeHtml(message),
          ip,
          deviceToken: dt,
          userAgent,
        })
        // 댓글 1건 = 헌화 1건 동반 (기존 server.js L409-414 동등)
        const total = placeFlower()
        io.emit('comment:new', row)
        io.emit('flower:update', total)
        io.emit('flower:animation', {})
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        console.error('Comment insert error:', msg)
      }
    })

    socket.on('report', async (data) => {
      const dt = normalizeDeviceToken(data?.deviceToken)
      if (!checkRate(ip, 'report', COOLDOWN_MS.report, dt)) {
        socket.emit('rate:limited', { seconds: COOLDOWN_MS.report / 1000 })
        return
      }
      const raw = typeof data?.reason === 'string' ? data.reason.trim() : ''
      if (!raw) return
      const reason = raw.slice(0, REASON_MAX_LEN)
      const commentId =
        Number.isInteger(data?.commentId) && (data?.commentId ?? 0) > 0
          ? (data?.commentId as number)
          : null
      try {
        await reportsRepo.insert({ commentId, reason, ip })
        socket.emit('report:ack')
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        console.error('Report insert error:', msg)
      }
    })

    socket.on('incense:replace', async () => {
      if (!checkRate(ip, 'incense', COOLDOWN_MS.incense, null)) {
        socket.emit('rate:limited', { seconds: COOLDOWN_MS.incense / 1000 })
        return
      }
      if (isReplacing()) {
        socket.emit('incense:busy', { endsAt: getEndsAt() })
        return
      }
      const started = await beginReplace()
      if (!started) {
        socket.emit('incense:busy', { endsAt: getEndsAt() })
        return
      }
      io.emit('incense:replacing:start', {
        durationMs: started.durationMs,
        count: started.count,
      })
      // 종료 브로드캐스트는 instrumentation.ts 의 incense tick(1초) 이 담당
    })

    // 신규 접속자에게 현재 incense 스냅샷을 전달 (진행 중이면 남은 시간 포함)
    socket.emit('incense:state', incenseSnapshot())

    socket.on('disconnect', () => {
      const remaining = decrementOnline()
      io.emit('online', remaining)
      trackSocketClose(socket.id)
    })
  })
}

/**
 * instrumentation.ts 에서 tick 호출 시 사용하는 헬퍼.
 * incense tick 이 종료 조건 충족을 감지하면 브로드캐스트한다.
 */
export function runIncenseTick(io: TypedServer): void {
  const ended = incenseTick()
  if (ended) {
    io.emit('incense:replacing:end', ended)
  }
}

export function broadcastOnline(io: TypedServer): void {
  io.emit('online', getOnline())
}

/** 헌화 총합을 외부에서 조회해야 할 때 (e.g. /api/stats). */
export { getFlowerTotal, getIncenseTotal }

/** 테스트 편의. */
export const __internals = {
  flushFlowers,
  resetEventCounters: _resetEventCounters,
}

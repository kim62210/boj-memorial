#!/usr/bin/env node
/**
 * 2-session Socket.IO smoke test. BRI-21 Definition of Done 검증용.
 *
 * 기대:
 *   - session A 가 comment 를 emit 하면 session B 가 comment:new 를 수신
 *   - incense:replace 를 session A 에서 방출하면 둘 다 incense:replacing:start 수신
 *   - `/health` 가 200 OK 반환
 *
 * 실행:
 *   PORT=4100 npm run dev    # (다른 터미널)
 *   npm run smoke:ws
 */
import { io } from 'socket.io-client'

const PORT = process.env.PORT ?? '4100'
const BASE = process.env.BASE_URL ?? `http://localhost:${PORT}`
const TIMEOUT = Number.parseInt(process.env.SMOKE_TIMEOUT_MS ?? '10000', 10)

function log(step, ok, detail = '') {
  const mark = ok ? 'PASS' : 'FAIL'
  const line = `[${mark}] ${step}${detail ? ` — ${detail}` : ''}`
  console.log(line)
  if (!ok) process.exitCode = 1
}

function connect(label) {
  return new Promise((resolve, reject) => {
    const sock = io(BASE, { transports: ['websocket'], forceNew: true })
    const timer = setTimeout(() => {
      reject(new Error(`${label} connect timeout`))
    }, TIMEOUT)
    sock.once('connect', () => {
      clearTimeout(timer)
      resolve(sock)
    })
    sock.once('connect_error', (err) => {
      clearTimeout(timer)
      reject(err)
    })
  })
}

function waitFor(sock, event) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`timeout waiting for ${event}`))
    }, TIMEOUT)
    sock.once(event, (payload) => {
      clearTimeout(timer)
      resolve(payload)
    })
  })
}

async function healthCheck() {
  const res = await fetch(`${BASE}/health`)
  log('GET /health', res.ok, `status=${res.status}`)
  if (res.ok) {
    const body = await res.json().catch(() => ({}))
    log('/health payload', typeof body.status === 'string', JSON.stringify(body))
  }
}

async function main() {
  await healthCheck()

  const a = await connect('A')
  log('session A connected', true, a.id)
  const b = await connect('B')
  log('session B connected', true, b.id)

  const nickname = `smoke-${Date.now().toString(36)}`
  const message = 'smoke test ping'

  // B 가 먼저 listener 를 걸고 A 가 발행한다.
  const received = waitFor(b, 'comment:new')
  a.emit('comment', { nickname, message, deviceToken: `smoke-dt-${a.id}` })

  try {
    const payload = await received
    const ok = !!payload && payload.nickname === nickname && payload.message === message
    log('comment:new broadcast', ok, `id=${payload?.id}`)
  } catch (e) {
    log('comment:new broadcast', false, String(e))
  }

  // incense:replace flow
  const incenseStart = waitFor(b, 'incense:replacing:start')
  a.emit('incense:replace')
  try {
    const payload = await incenseStart
    log(
      'incense:replacing:start',
      typeof payload?.durationMs === 'number' && typeof payload?.count === 'number',
      `count=${payload?.count} duration=${payload?.durationMs}`,
    )
  } catch (e) {
    log('incense:replacing:start', false, String(e))
  }

  // incense tick (1s) 가 종료 이벤트를 브로드캐스트하는지 확인
  const incenseEnd = waitFor(b, 'incense:replacing:end')
  try {
    const payload = await incenseEnd
    log('incense:replacing:end', typeof payload?.count === 'number', `count=${payload?.count}`)
  } catch (e) {
    log('incense:replacing:end', false, String(e))
  }

  a.close()
  b.close()
}

main().catch((e) => {
  console.error('smoke-ws fatal:', e)
  process.exit(1)
})

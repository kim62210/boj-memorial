/**
 * Custom Next.js 16 entrypoint. Next.js App Router 는 WebSocket upgrade 를
 * route handler 로 지원하지 않으므로 (vercel/next.js#58698) RFC-BE D1 에 따라
 * custom Node 서버로 Next + Socket.IO 를 공존시킨다.
 *
 * 기동 순서:
 *   1. next().prepare() 로 Next 앱 초기화
 *   2. http.createServer 로 Next handler + `/health` 엔드포인트 구성
 *   3. Socket.IO 를 동일 http server 에 attach, CORS origin 은 ALLOWED_ORIGINS env 로 통제
 *   4. lib/realtime 의 핸들러 등록 + hydrate + interval 부팅
 *   5. SIGTERM/SIGINT 수신 시 클라이언트에 shutdown 신호 emit → 최대 30s drain 후 종료
 *
 * 실행: `node server.js` (ts-node 등은 운영 배포에 불필요, Dockerfile 에서 `tsc` 산출물 사용).
 * 개발 중에는 `ts-node-dev server.ts` 혹은 `node --loader tsx server.ts` 로 기동한다.
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { parse } from 'node:url'
import next from 'next'
import { Server as IOServer } from 'socket.io'
import { setIo } from '@/lib/realtime/io'
import { registerSocketHandlers, type TypedServer } from '@/lib/realtime/socketHandlers'
import { registerIntervals, stopIntervals } from '@/lib/realtime/intervals'
import { flushFlowers } from '@/lib/realtime/flowerBuffer'
import { getRealtimeHydrationStatus, hydrateRealtimeState } from '@/lib/realtime/hydration'
import { closePool } from '@/lib/db/pool'

const PORT = Number.parseInt(process.env.PORT ?? '4100', 10)
const HOST = process.env.HOSTNAME ?? '0.0.0.0'
const DEV = process.env.NODE_ENV !== 'production'
const SHUTDOWN_DRAIN_MS = Number.parseInt(process.env.SHUTDOWN_DRAIN_MS ?? '30000', 10)

function parseAllowedOrigins(raw: string | undefined): string[] | true {
  if (!raw) return DEV ? true : []
  const list = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  return list.length > 0 ? list : DEV ? true : []
}

async function main(): Promise<void> {
  const app = next({ dev: DEV, hostname: HOST, port: PORT })
  const handle = app.getRequestHandler()
  await app.prepare()

  const httpServer = createServer((req: IncomingMessage, res: ServerResponse) => {
    // /health 는 Next 라우트 밖에서 처리해 빌드 최적화와 무관하게 O(1) 응답.
    if (req.url === '/health' || req.url === '/healthz') {
      const hydration = getRealtimeHydrationStatus()
      const statusCode = hydration.hydrated ? 200 : 503
      res.writeHead(statusCode, { 'Content-Type': 'application/json' })
      res.end(
        JSON.stringify({
          status: hydration.hydrated ? 'ok' : 'starting',
          uptime: Math.round(process.uptime()),
          hydration,
        }),
      )
      return
    }
    // Socket.IO 경로는 io.attach 가 알아서 가로챈다.
    const parsed = parse(req.url ?? '/', true)
    handle(req, res, parsed).catch((e: unknown) => {
      const msg = e instanceof Error ? e.message : String(e)
      console.error('Next handler error:', msg)
      if (!res.headersSent) {
        res.writeHead(500)
        res.end('Internal Server Error')
      }
    })
  })

  const origin = parseAllowedOrigins(process.env.ALLOWED_ORIGINS)
  const io = new IOServer(httpServer, {
    perMessageDeflate: false,
    maxHttpBufferSize: 1e6,
    pingTimeout: 30_000,
    pingInterval: 25_000,
    transports: ['websocket', 'polling'],
    cors: { origin },
  }) as unknown as TypedServer

  setIo(io)
  registerSocketHandlers(io)
  await hydrateRealtimeState()
  registerIntervals(io)

  await new Promise<void>((resolve) => {
    httpServer.listen(PORT, HOST, () => resolve())
  })
  console.log(`> boj-memorial ready on http://${HOST}:${PORT} (dev=${DEV})`)

  installShutdownHooks(io, httpServer)
}

function installShutdownHooks(io: TypedServer, httpServer: ReturnType<typeof createServer>): void {
  let shuttingDown = false
  const signals: NodeJS.Signals[] = ['SIGTERM', 'SIGINT']

  async function shutdown(signal: NodeJS.Signals): Promise<void> {
    if (shuttingDown) return
    shuttingDown = true
    console.log(`[shutdown] received ${signal}, draining…`)

    // 클라이언트에 상태를 알려 재연결 로직이 빠르게 동작하도록 유도.
    try {
      io.emit('online', 0)
    } catch {
      // ignore
    }

    stopIntervals()

    // 새 연결 거부
    io.engine.close?.()

    // 기존 소켓에 30초 drain 시간 부여 후 강제 종료
    const drainMs = Math.max(1_000, SHUTDOWN_DRAIN_MS)
    const deadline = Date.now() + drainMs

    const closeIo = new Promise<void>((resolve) => {
      io.close(() => resolve())
    })
    const hardTimeout = new Promise<void>((resolve) => {
      const ms = Math.max(100, deadline - Date.now())
      const t = setTimeout(() => resolve(), ms)
      if (typeof t.unref === 'function') t.unref()
    })
    await Promise.race([closeIo, hardTimeout])

    try {
      await flushFlowers()
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      console.error('[shutdown] final flushFlowers failed:', msg)
    }

    await new Promise<void>((resolve) => {
      httpServer.close(() => resolve())
    })

    try {
      await closePool()
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      console.error('[shutdown] pool.end failed:', msg)
    }

    console.log('[shutdown] clean exit')
    process.exit(0)
  }

  for (const sig of signals) {
    process.once(sig, (received) => {
      void shutdown(received as NodeJS.Signals)
    })
  }
}

main().catch((e: unknown) => {
  const msg = e instanceof Error ? (e.stack ?? e.message) : String(e)
  console.error('Fatal server startup error:', msg)
  process.exit(1)
})

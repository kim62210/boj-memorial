import { once } from 'node:events'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { createServer } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { io as createClient, type Socket } from 'socket.io-client'

import { truncateAll } from '../../src/db/__tests__/fixtures.js'

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL

async function freePort(): Promise<number> {
  const server = createServer()
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  const port = typeof address === 'object' && address ? address.port : 0
  server.close()
  await once(server, 'close')
  return port
}

async function waitForHealth(baseUrl: string, timeoutMs = 45_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  let lastStatus = 0
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${baseUrl}/health`)
      lastStatus = res.status
      if (res.status === 200) return
    } catch {
      // server not accepting connections yet
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error(`server.ts health check did not become ready; last status=${lastStatus}`)
}

function connect(baseUrl: string, ip: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = createClient(baseUrl, {
      transports: ['websocket'],
      reconnection: false,
      extraHeaders: { 'x-forwarded-for': ip },
    })
    socket.once('connect', () => resolve(socket))
    socket.once('connect_error', reject)
  })
}

function waitForEvent<T>(socket: Socket, event: string, timeoutMs = 10_000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout waiting for ${event}`)), timeoutMs)
    socket.once(event, (payload: T) => {
      clearTimeout(timer)
      resolve(payload)
    })
  })
}

describe.skipIf(!TEST_DATABASE_URL)('server.ts Socket.IO integration', () => {
  let child: ChildProcessWithoutNullStreams
  let baseUrl: string

  beforeAll(async () => {
    await truncateAll()
    const port = await freePort()
    baseUrl = `http://127.0.0.1:${port}`
    child = spawn('npx', ['tsx', 'server.ts'], {
      cwd: process.cwd(),
      detached: process.platform !== 'win32',
      env: {
        ...process.env,
        DATABASE_URL: TEST_DATABASE_URL,
        TEST_DATABASE_URL,
        NODE_ENV: 'test',
        HOSTNAME: '127.0.0.1',
        PORT: String(port),
        ALLOWED_ORIGINS: baseUrl,
        SHUTDOWN_DRAIN_MS: '1000',
      },
    })
    child.stderr.on('data', (chunk) => {
      const text = String(chunk)
      if (!text.includes('The CJS build of Vite')) process.stderr.write(text)
    })
    await waitForHealth(baseUrl)
  }, 60_000)

  afterAll(async () => {
    if (process.platform !== 'win32' && child.pid) {
      process.kill(-child.pid, 'SIGTERM')
    } else {
      child.kill('SIGTERM')
    }
    await Promise.race([
      once(child, 'exit'),
      new Promise((resolve) => setTimeout(resolve, 3_000)),
    ])
    if (child.exitCode === null && child.pid) {
      if (process.platform !== 'win32') process.kill(-child.pid, 'SIGKILL')
      else child.kill('SIGKILL')
    }
  })

  it('serves the Caddy health contract from the actual custom server', async () => {
    const res = await fetch(`${baseUrl}/health`)

    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/plain')
    await expect(res.text()).resolves.toBe('ok')
  })

  it('broadcasts comments and incense lifecycle between two sessions', async () => {
    const a = await connect(baseUrl, '10.30.0.1')
    const b = await connect(baseUrl, '10.30.0.2')

    const commentPromise = waitForEvent<{ nickname: string; message: string }>(b, 'comment:new')
    a.emit('comment', {
      nickname: 'socket-A',
      message: 'server.ts broadcast',
      deviceToken: `socket-comment-${Date.now()}`,
    })
    await expect(commentPromise).resolves.toMatchObject({
      nickname: 'socket-A',
      message: 'server.ts broadcast',
    })

    const startPromise = waitForEvent<{ durationMs: number; count: number }>(
      b,
      'incense:replacing:start',
    )
    const endPromise = waitForEvent<{ count: number }>(b, 'incense:replacing:end', 15_000)
    a.emit('incense:replace')
    const started = await startPromise
    expect(started.durationMs).toBe(2_800)
    await expect(endPromise).resolves.toMatchObject({ count: started.count })

    a.close()
    b.close()
  }, 30_000)

  it('does not consume comment cooldown for invalid socket payloads', async () => {
    const a = await connect(baseUrl, '10.30.1.1')
    const b = await connect(baseUrl, '10.30.1.2')
    const token = `socket-invalid-comment-${Date.now()}`

    a.emit('comment', {
      nickname: 'socket-invalid',
      message: '   ',
      deviceToken: token,
    })

    const commentPromise = waitForEvent<{ nickname: string; message: string }>(b, 'comment:new')
    a.emit('comment', {
      nickname: 'socket-valid',
      message: 'valid after invalid',
      deviceToken: token,
    })

    await expect(commentPromise).resolves.toMatchObject({
      nickname: 'socket-valid',
      message: 'valid after invalid',
    })

    a.close()
    b.close()
  }, 15_000)

  it('does not consume report cooldown for invalid socket payloads', async () => {
    const a = await connect(baseUrl, '10.30.2.1')
    const token = `socket-invalid-report-${Date.now()}`

    a.emit('report', {
      reason: '   ',
      deviceToken: token,
    })

    const ackPromise = waitForEvent<void>(a, 'report:ack')
    a.emit('report', {
      reason: 'valid after invalid',
      deviceToken: token,
    })

    await expect(ackPromise).resolves.toBeUndefined()

    a.close()
  }, 15_000)
})

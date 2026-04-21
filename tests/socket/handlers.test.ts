import { once } from 'node:events'
import { createServer, type Server as HttpServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Server as IOServer } from 'socket.io'
import { io as createClient, type Socket } from 'socket.io-client'

import { __resetFlowerBuffer, flushFlowers } from '../../lib/realtime/flowerBuffer'
import { __resetIncenseState } from '../../lib/realtime/incenseState'
import { __resetPresence } from '../../lib/realtime/presence'
import { __resetRateLimits } from '../../lib/realtime/rateLimiter'
import {
  broadcastOnline,
  registerSocketHandlers,
  type TypedServer,
} from '../../lib/realtime/socketHandlers'
import { __resetSocketRateLimit } from '../../lib/realtime/socketRateLimit'
import { truncateAll } from '../../src/db/__tests__/fixtures.js'

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL

function waitForEvent<T>(socket: Socket, event: string, timeoutMs = 5_000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout waiting for ${event}`)), timeoutMs)
    socket.once(event, (payload: T) => {
      clearTimeout(timer)
      resolve(payload)
    })
  })
}

describe.skipIf(!TEST_DATABASE_URL)('registerSocketHandlers', () => {
  let httpServer: HttpServer
  let io: TypedServer
  let baseUrl: string
  const sockets: Socket[] = []

  async function connect(ip: string): Promise<Socket> {
    const socket = createClient(baseUrl, {
      transports: ['websocket'],
      reconnection: false,
      extraHeaders: { 'x-forwarded-for': ip },
    })
    sockets.push(socket)
    await new Promise<void>((resolve, reject) => {
      socket.once('connect', resolve)
      socket.once('connect_error', reject)
    })
    return socket
  }

  beforeEach(async () => {
    await truncateAll()
    __resetFlowerBuffer()
    __resetIncenseState()
    __resetPresence()
    __resetRateLimits()
    __resetSocketRateLimit()

    httpServer = createServer()
    io = new IOServer(httpServer, {
      cors: { origin: true },
      transports: ['websocket', 'polling'],
    }) as unknown as TypedServer
    registerSocketHandlers(io)

    httpServer.listen(0, '127.0.0.1')
    await once(httpServer, 'listening')
    const address = httpServer.address() as AddressInfo
    baseUrl = `http://127.0.0.1:${address.port}`
  })

  afterEach(async () => {
    for (const socket of sockets.splice(0)) socket.close()
    await new Promise<void>((resolve) => io.close(() => resolve()))
    await new Promise<void>((resolve) => httpServer.close(() => resolve()))
  })

  it('broadcasts online, flower, comment, and report events without placeholder assertions', async () => {
    const a = await connect('10.40.0.1')
    const b = await connect('10.40.0.2')

    const flowerUpdate = waitForEvent<number>(b, 'flower:update')
    const flowerAnimation = waitForEvent<Record<string, never>>(b, 'flower:animation')
    a.emit('flower', { deviceToken: `flower-${Date.now()}` })
    await expect(flowerUpdate).resolves.toBe(1)
    await expect(flowerAnimation).resolves.toEqual({})
    await expect(flushFlowers()).resolves.toBe(1)

    const flowerLimited = waitForEvent<{ seconds: number }>(a, 'rate:limited')
    a.emit('flower', { deviceToken: `flower-${Date.now()}` })
    await expect(flowerLimited).resolves.toEqual({ seconds: 2 })

    const comment = waitForEvent<{ nickname: string; message: string }>(b, 'comment:new')
    a.emit('comment', {
      nickname: 'socket-user',
      message: 'hello from handler',
      deviceToken: `comment-${Date.now()}`,
    })
    await expect(comment).resolves.toMatchObject({
      nickname: 'socket-user',
      message: 'hello from handler',
    })

    const ack = waitForEvent<void>(a, 'report:ack')
    a.emit('report', {
      reason: 'valid report',
      deviceToken: `report-${Date.now()}`,
    })
    await expect(ack).resolves.toBeUndefined()
  })

  it('validates socket comment payloads before consuming cooldown', async () => {
    const a = await connect('10.40.1.1')
    const b = await connect('10.40.1.2')
    const token = `comment-invalid-${Date.now()}`

    a.emit('comment', { nickname: 'ignored', message: '   ', deviceToken: token })

    const comment = waitForEvent<{ nickname: string; message: string }>(b, 'comment:new')
    a.emit('comment', {
      nickname: 'valid-after-invalid',
      message: 'valid message',
      deviceToken: token,
    })
    await expect(comment).resolves.toMatchObject({
      nickname: 'valid-after-invalid',
      message: 'valid message',
    })

    const limited = waitForEvent<{ seconds: number }>(a, 'rate:limited')
    a.emit('comment', {
      nickname: 'rate-limited',
      message: 'too soon',
      deviceToken: token,
    })
    await expect(limited).resolves.toEqual({ seconds: 5 })
  })

  it('validates report payloads before consuming cooldown', async () => {
    const a = await connect('10.40.2.1')
    const token = `report-invalid-${Date.now()}`

    a.emit('report', { reason: '   ', deviceToken: token })

    const ack = waitForEvent<void>(a, 'report:ack')
    a.emit('report', { reason: 'valid after invalid', deviceToken: token })
    await expect(ack).resolves.toBeUndefined()

    const limited = waitForEvent<{ seconds: number }>(a, 'rate:limited')
    a.emit('report', { reason: 'too soon', deviceToken: token })
    await expect(limited).resolves.toEqual({ seconds: 30 })
  })

  it('guards forbidden nicknames and concurrent incense replacement', async () => {
    const a = await connect('10.40.3.1')
    const b = await connect('10.40.3.2')

    const commentError = waitForEvent<{ error: string }>(a, 'comment:error')
    a.emit('comment', {
      nickname: '관리자',
      message: 'spoof',
      deviceToken: `forbidden-${Date.now()}`,
    })
    await expect(commentError).resolves.toEqual({ error: '사용할 수 없는 닉네임입니다.' })

    const replacing = waitForEvent<{ durationMs: number; count: number }>(b, 'incense:replacing:start')
    a.emit('incense:replace')
    await expect(replacing).resolves.toMatchObject({ durationMs: 2_800, count: 1 })

    const limited = waitForEvent<{ seconds: number }>(a, 'rate:limited')
    a.emit('incense:replace')
    await expect(limited).resolves.toEqual({ seconds: 3 })

    const busy = waitForEvent<{ endsAt: number }>(b, 'incense:busy')
    b.emit('incense:replace')
    const busyPayload = await busy
    expect(busyPayload.endsAt).toBeGreaterThan(Date.now())
  })

  it('rejects excessive handshakes from the same IP', async () => {
    const connected: Socket[] = []
    for (let i = 0; i < 5; i++) {
      connected.push(await connect('10.40.4.1'))
    }

    const rejected = createClient(baseUrl, {
      transports: ['websocket'],
      reconnection: false,
      extraHeaders: { 'x-forwarded-for': '10.40.4.1' },
    })
    sockets.push(rejected)

    const error = await waitForEvent<Error>(rejected, 'connect_error')
    expect(error.message).toBe('Too many connections')

    for (const socket of connected) expect(socket.connected).toBe(true)
  })

  it('disconnects sockets that exceed the event flood limit', async () => {
    const socket = await connect('10.40.5.1')
    const disconnected = waitForEvent<string>(socket, 'disconnect')

    for (let i = 0; i < 101; i++) {
      socket.emit('unhandled:test', i)
    }

    await expect(disconnected).resolves.toBe('io server disconnect')
  })

  it('broadcasts the current online count on demand', async () => {
    const a = await connect('10.40.6.1')
    const b = await connect('10.40.6.2')
    const online = waitForEvent<number>(b, 'online')

    broadcastOnline(io)

    await expect(online).resolves.toBe(2)
    expect(a.connected).toBe(true)
  })
})

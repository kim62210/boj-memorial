/**
 * Socket.IO 서버 싱글턴 레지스트리.
 * server.ts 가 생성한 io 인스턴스를 instrumentation.ts 에서 참조할 수 있도록 전역에 보관한다.
 * HMR 안전: dev 서버 재로드 시에도 동일 인스턴스를 가리킨다.
 */
import type { TypedServer } from './socketHandlers'

const IO_KEY = Symbol.for('bojmemorial.socketio.server')

type GlobalWithIo = typeof globalThis & {
  [IO_KEY]?: TypedServer
}

const globalWithIo = globalThis as GlobalWithIo

export function setIo(io: TypedServer): void {
  globalWithIo[IO_KEY] = io
}

export function getIo(): TypedServer | undefined {
  return globalWithIo[IO_KEY]
}

export function clearIo(): void {
  delete globalWithIo[IO_KEY]
}

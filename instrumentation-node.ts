/**
 * Node runtime 전용 instrumentation. server.ts 와 Next 의 `register()` 훅 모두
 * 여기에 도달하며, 중복 호출은 REGISTERED_KEY 로 차단한다.
 *
 * 책임:
 *   1. flower / incense 상태 DB hydrate, rate_limits 복원
 *   2. Socket.IO 서버가 이미 attached 된 경우 백그라운드 interval 등록
 *   3. 프로세스 SIGTERM/SIGINT 수신 시 interval 정리 (실제 서버 종료는 server.ts 가 담당)
 */
import { getIo } from '@/lib/realtime/io'
import { registerIntervals, stopIntervals } from '@/lib/realtime/intervals'
import { hydrateRealtimeState } from '@/lib/realtime/hydration'

const REGISTERED_KEY = Symbol.for('bojmemorial.instrumentation.registered')

type GlobalWithFlag = typeof globalThis & { [REGISTERED_KEY]?: boolean }
const globalWithFlag = globalThis as GlobalWithFlag

export async function registerNode(): Promise<void> {
  if (globalWithFlag[REGISTERED_KEY]) return
  globalWithFlag[REGISTERED_KEY] = true

  await hydrateRealtimeState()

  const io = getIo()
  if (!io) {
    console.warn(
      '[instrumentation] Socket.IO server not yet attached; server.ts 가 등록을 담당한다.',
    )
    return
  }

  registerIntervals(io)

  const onShutdown = (signal: NodeJS.Signals): void => {
    console.log(`[instrumentation] received ${signal}, stopping intervals`)
    stopIntervals()
  }
  process.once('SIGTERM', onShutdown)
  process.once('SIGINT', onShutdown)
}

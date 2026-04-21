/**
 * 전역 접속자 카운터. Socket.IO 연결/해제 시점에 증감되고
 * instrumentation.ts 에서 5초 간격으로 `io.emit('online', count)` 브로드캐스트.
 *
 * 기존 server.js L325, L348-350, L481-485, L488-491 동등.
 */
const state = {
  online: 0,
}

export function incrementOnline(): number {
  state.online += 1
  return state.online
}

export function decrementOnline(): number {
  state.online = Math.max(0, state.online - 1)
  return state.online
}

export function getOnline(): number {
  return state.online
}

/** 테스트 전용. */
export function __resetPresence(): void {
  state.online = 0
}

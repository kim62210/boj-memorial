/**
 * 헌화 카운터 버퍼. 개별 socket 이벤트마다 DB UPDATE 를 치지 않고
 * 일정 주기로 모아서 `UPDATE flowers SET count = count + $1 WHERE id = 1` 로 플러시한다.
 *
 * 기존 server.js L102-118 동등. BRI-21 Spec 에 따라 플러시 주기는 instrumentation.ts
 * 에서 1초(기존 10초에서 단축)로 register 한다.
 */
import { getPool } from '@/lib/db/pool'

const state = {
  buffer: 0,
  total: 0,
  hydrated: false,
}

export async function hydrateFlowerTotal(): Promise<number> {
  const res = await getPool().query<{ count: number }>('SELECT count FROM flowers WHERE id = 1')
  state.total = Number(res.rows[0]?.count ?? 0)
  state.hydrated = true
  return state.total
}

export function getFlowerTotal(): number {
  return state.total
}

/** 새 꽃 1개 등록. 반환값은 갱신된 총합(옵티미스틱). */
export function placeFlower(): number {
  state.buffer += 1
  state.total += 1
  return state.total
}

/**
 * 버퍼에 쌓인 증가량을 DB 에 플러시한다.
 * 반환값: 실제 DB 에 쓴 증가량 (0 이면 쓰기 없음).
 */
export async function flushFlowers(): Promise<number> {
  if (state.buffer <= 0) return 0
  const buf = state.buffer
  state.buffer = 0
  try {
    await getPool().query('UPDATE flowers SET count = count + $1 WHERE id = 1', [buf])
    return buf
  } catch (e) {
    state.buffer += buf
    const msg = e instanceof Error ? e.message : String(e)
    console.error('Flower flush failed, re-queued:', msg)
    throw e
  }
}

/** 테스트 전용. */
export function __resetFlowerBuffer(): void {
  state.buffer = 0
  state.total = 0
  state.hydrated = false
}

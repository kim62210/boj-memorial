/**
 * 향 교체 상태. 전역 단일 writer 로 동시 치환 충돌을 막고
 * incense tick(1초) 으로 `endsAt` 도래 시 자동으로 `replacing:end` 를 방출한다.
 *
 * 기존 server.js L106-109 + L441-467 동등. BRI-21 Spec 에 따라 setTimeout 대신
 * instrumentation.ts 에서 register 된 tick 이 종료 이벤트를 책임진다.
 */
import { getPool } from '@/lib/db/pool'

export const INCENSE_REPLACE_MS = 2_800

interface InternalState {
  replacing: boolean
  endsAt: number
  total: number
  hydrated: boolean
}

const state: InternalState = {
  replacing: false,
  endsAt: 0,
  total: 0,
  hydrated: false,
}

export async function hydrateIncenseTotal(): Promise<number> {
  const res = await getPool().query<{ count: number }>('SELECT count FROM incense WHERE id = 1')
  state.total = Number(res.rows[0]?.count ?? 0)
  state.hydrated = true
  return state.total
}

export function getIncenseTotal(): number {
  return state.total
}

export function isReplacing(): boolean {
  return state.replacing
}

export function getEndsAt(): number {
  return state.endsAt
}

export function snapshot(now: number = Date.now()): {
  replacing: boolean
  durationMs: number
  count: number
} {
  const remaining = state.replacing ? Math.max(0, state.endsAt - now) : 0
  return {
    replacing: state.replacing,
    durationMs: remaining,
    count: state.total,
  }
}

/**
 * 교체 시도. 이미 진행 중이면 null 을 반환한다.
 * 성공 시 교체 시작 payload 를 반환하며, 호출자가 `incense:replacing:start` 를 브로드캐스트한다.
 * DB UPDATE 는 atomic (`count = count + 1`) 으로 동시성 안전.
 */
export async function beginReplace(
  now: number = Date.now(),
): Promise<{ durationMs: number; count: number; endsAt: number } | null> {
  if (state.replacing) return null
  state.replacing = true
  state.endsAt = now + INCENSE_REPLACE_MS
  try {
    const res = await getPool().query<{ count: number }>(
      'UPDATE incense SET count = count + 1 WHERE id = 1 RETURNING count',
    )
    state.total = Number(res.rows[0]?.count ?? state.total + 1)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('Incense count persist failed:', msg)
    state.total += 1
  }
  return { durationMs: INCENSE_REPLACE_MS, count: state.total, endsAt: state.endsAt }
}

/**
 * tick 은 incense 종료 시각 경과 여부를 확인한다.
 * 반환값이 `null` 이 아니면 호출자가 `incense:replacing:end` 를 브로드캐스트해야 한다.
 */
export function tick(now: number = Date.now()): { count: number } | null {
  if (!state.replacing) return null
  if (now < state.endsAt) return null
  state.replacing = false
  state.endsAt = 0
  return { count: state.total }
}

/** 테스트 전용. */
export function __resetIncenseState(): void {
  state.replacing = false
  state.endsAt = 0
  state.total = 0
  state.hydrated = false
}

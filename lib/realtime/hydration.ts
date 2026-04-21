import { hydrateFlowerTotal } from './flowerBuffer'
import { hydrateIncenseTotal } from './incenseState'
import { restoreRateLimits } from './rateLimiter'

interface HydrationStatus {
  hydrated: boolean
  attempts: number
  lastAttemptAt: number | null
  hydratedAt: number | null
  lastError: string | null
}

const state: HydrationStatus = {
  hydrated: false,
  attempts: 0,
  lastAttemptAt: null,
  hydratedAt: null,
  lastError: null,
}

function errorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason)
}

export async function hydrateRealtimeState(): Promise<boolean> {
  if (state.hydrated) return true

  state.attempts += 1
  state.lastAttemptAt = Date.now()

  const results = await Promise.allSettled([
    hydrateFlowerTotal(),
    hydrateIncenseTotal(),
    restoreRateLimits(),
  ])

  const rejected = results.find(
    (result): result is PromiseRejectedResult => result.status === 'rejected',
  )
  if (rejected) {
    state.hydrated = false
    state.lastError = errorMessage(rejected.reason)
    console.error('[hydration] realtime state hydrate failed:', state.lastError)
    return false
  }

  state.hydrated = true
  state.hydratedAt = Date.now()
  state.lastError = null
  return true
}

export function getRealtimeHydrationStatus(): HydrationStatus {
  return { ...state }
}

export function isRealtimeHydrated(): boolean {
  return state.hydrated
}

/** 테스트 전용. */
export function __resetHydrationState(): void {
  state.hydrated = false
  state.attempts = 0
  state.lastAttemptAt = null
  state.hydratedAt = null
  state.lastError = null
}

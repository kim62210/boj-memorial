'use client'

import { useSyncExternalStore } from 'react'

const QUERY = '(prefers-reduced-motion: reduce)'

function subscribe(callback: () => void): () => void {
  const mq = window.matchMedia(QUERY)
  mq.addEventListener('change', callback)
  return () => mq.removeEventListener('change', callback)
}

function getSnapshot(): boolean {
  return window.matchMedia(QUERY).matches
}

function getServerSnapshot(): boolean {
  return false
}

/**
 * prefers-reduced-motion 미디어 쿼리를 구독하는 boolean 훅.
 *
 * BRI-24 (3D scene) 와 BRI-25 (DOM UI) 가 공통 소비하도록 분리.
 * useSyncExternalStore 패턴으로 SSR/CSR 간 tearing 없이 동기화한다.
 */
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}

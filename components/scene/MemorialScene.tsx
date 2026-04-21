'use client'

import { useEffect, useRef } from 'react'
import * as THREE from 'three'

import { usePrefersReducedMotion } from '@/lib/hooks/use-prefers-reduced-motion'

import { createAnimateLoop, type AnimateState } from './animate'
import { createFlowerController } from './flowers'
import { createIncense } from './incense'
import { createLighting } from './lighting'
import { buildMemorialWorld, createSceneContext, handleResize } from './setup'

/**
 * 백준 추모 3D scene Client Component.
 *
 * ── DOM 레이어 계약 (BRI-25 와 공유) ──────────────────────────────
 * - #scene-root (이 컴포넌트 루트 div): 전체 뷰포트. position: relative + overflow: hidden.
 *   z-index base = 0. canvas 가 이 안에 mount 된다.
 * - canvas[data-scene-canvas]: WebGLRenderer.domElement. absolute fill. z-index 0.
 * - DOM UI 패널 (BRI-25 에서 이관될 overlay 들):
 *     z-index 5  = 묘비/꽃 overlay (tombstone, flower count)
 *     z-index 8  = 상단 카운터, footer links
 *     z-index 100 = 하단 bottom-bar (입력, BGM 토글 등)
 *     z-index 8000+ = modal, history panel, 카운트다운 바
 *     z-index 99999 = enter overlay
 *   → scene canvas 는 항상 0 레이어. DOM 패널이 pointer-events 를 가져간다.
 *
 * ── animate 루프 외부 state 구독 (BRI-25 sceneStore 스키마 기준) ──
 * - cameraMode: 'parallax' | 'orbit' — 창 width < 768 에서 orbit 으로 전환
 * - reducedMotion: prefers-reduced-motion boolean (usePrefersReducedMotion 훅)
 * - mouse.x / mouse.y: 데스크톱 parallax 용, -1..1 normalized
 * - flower count / incense 상태는 imperative handle(createFlowerController,
 *   createIncense) 로 노출되며 BRI-25 에서 store → handle 로 push.
 */

export default function MemorialScene(): React.ReactNode {
  const containerRef = useRef<HTMLDivElement>(null)
  const reducedMotion = usePrefersReducedMotion()
  const reducedMotionRef = useRef<boolean>(reducedMotion)

  useEffect(() => {
    reducedMotionRef.current = reducedMotion
  }, [reducedMotion])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const ctx = createSceneContext(container)
    buildMemorialWorld(ctx.scene)
    const lighting = createLighting(ctx.scene)
    const flowers = createFlowerController(ctx.scene)
    const incense = createIncense(ctx.scene)

    // canvas 를 DOM 에 삽입 + 식별자 부여 (BRI-25 z-index 계약)
    ctx.renderer.domElement.setAttribute('data-scene-canvas', 'true')
    Object.assign(ctx.renderer.domElement.style, {
      display: 'block',
      height: '100%',
      inset: '0',
      position: 'absolute',
      width: '100%',
      zIndex: '0',
    })
    container.appendChild(ctx.renderer.domElement)

    // animate 루프가 읽는 외부 state (BRI-25 에서 sceneStore 와 sync)
    const state: AnimateState = {
      cameraMode: window.innerWidth < 768 ? 'orbit' : 'parallax',
      reducedMotion: reducedMotionRef.current,
      mouse: { x: 0, y: 0 },
    }

    // mouse parallax (데스크톱만) — reducedMotion 일 땐 무시
    const onPointerMove = (e: PointerEvent): void => {
      if (state.cameraMode !== 'parallax') return
      state.mouse.x = (e.clientX / window.innerWidth - 0.5) * 2
      state.mouse.y = (e.clientY / window.innerHeight - 0.5) * 2
    }
    window.addEventListener('pointermove', onPointerMove, { passive: true })

    // resize — camera aspect / fov / renderer size + cameraMode 재판정
    const onResize = (): void => {
      handleResize(container, ctx.camera, ctx.renderer)
      state.cameraMode = window.innerWidth < 768 ? 'orbit' : 'parallax'
    }
    window.addEventListener('resize', onResize)

    // 향초 pointer burst (canvas 영역만)
    const raycaster = new THREE.Raycaster()
    const pointer = new THREE.Vector2()
    const onCanvasPointerDown = (e: PointerEvent): void => {
      const rect = ctx.renderer.domElement.getBoundingClientRect()
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1
      raycaster.setFromCamera(pointer, ctx.camera)
      if (incense.isPointerOnStick(raycaster)) incense.burstSmoke()
    }
    ctx.renderer.domElement.addEventListener('pointerdown', onCanvasPointerDown, {
      passive: true,
    })

    // reducedMotion 변화 반영 — ref 의 최신값을 animate loop 시작마다 push
    const syncReducedMotion = (): void => {
      state.reducedMotion = reducedMotionRef.current
    }

    const anim = createAnimateLoop({ ctx, lighting, incense, flowers, state, syncState: syncReducedMotion })
    anim.start()

    // WebGLContext loss / restore — renderer 재초기화 없이 RAF 만 정지/재개
    const canvas = ctx.renderer.domElement
    const onContextLost = (e: Event): void => {
      e.preventDefault()
      anim.stop()
    }
    const onContextRestored = (): void => {
      anim.start()
    }
    canvas.addEventListener('webglcontextlost', onContextLost, false)
    canvas.addEventListener('webglcontextrestored', onContextRestored, false)

    return () => {
      anim.stop()
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('resize', onResize)
      canvas.removeEventListener('webglcontextlost', onContextLost)
      canvas.removeEventListener('webglcontextrestored', onContextRestored)
      canvas.removeEventListener('pointerdown', onCanvasPointerDown)

      // Three 자원 정리 — scene traverse 로 geometry / material 해제
      ctx.scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh || obj instanceof THREE.Sprite) {
          obj.geometry?.dispose?.()
          const mat = obj.material as THREE.Material | THREE.Material[]
          if (Array.isArray(mat)) mat.forEach((m) => m.dispose())
          else mat?.dispose?.()
        }
      })
      ctx.renderer.dispose()
      if (canvas.parentElement === container) container.removeChild(canvas)
    }
  }, [])

  return (
    <div
      id="scene-root"
      ref={containerRef}
      aria-hidden="true"
      className="relative h-dvh w-full overflow-hidden"
    />
  )
}

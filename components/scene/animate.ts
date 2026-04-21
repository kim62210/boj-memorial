import * as THREE from 'three'

import type { FlowerController } from './flowers'
import type { IncenseController } from './incense'
import type { LightingHandles } from './lighting'
import type { SceneContext } from './setup'

/**
 * BRI-25 가 읽을 수 있는 animate 루프 외부 state.
 * sceneStore 스키마 설계 시 이 인터페이스를 기준으로 맞춘다.
 *
 * - cameraMode: 'parallax' | 'orbit' — 데스크톱/모바일 전환
 * - reducedMotion: prefers-reduced-motion 사용자용 애니메이션 축소
 * - mouse: 데스크톱 parallax 용 정규화 좌표 (-1..1)
 */
export interface AnimateState {
  cameraMode: 'parallax' | 'orbit'
  reducedMotion: boolean
  mouse: { x: number; y: number }
}

export interface AnimateHandle {
  start(): void
  stop(): void
  isRunning(): boolean
}

export interface AnimateDeps {
  ctx: SceneContext
  lighting: LightingHandles
  incense: IncenseController
  flowers: FlowerController
  state: AnimateState
}

/**
 * requestAnimationFrame 기반 animate 루프.
 *
 * Legacy (public/index.html L2186-2234) 이식.
 * - candle flicker / flame scale flicker
 * - floating particle drift
 * - mouse parallax (데스크톱) / auto-orbit (모바일)
 * - flower 낙하 애니메이션, 향 업데이트
 * - 마지막 renderer.render(scene, camera)
 *
 * reducedMotion 일 때는 per-frame 랜덤성을 제거하고 camera/꽃/향만 고정 값으로 업데이트.
 */
export function createAnimateLoop(deps: AnimateDeps): AnimateHandle {
  const { ctx, lighting, incense, flowers, state } = deps
  let tick = 0
  let rafId: number | null = null

  const loop = (): void => {
    rafId = requestAnimationFrame(loop)
    tick++

    if (!state.reducedMotion) {
      // 촛불 flicker
      const flickerL =
        0.5 + Math.sin(tick * 0.08) * 0.15 + Math.sin(tick * 0.13) * 0.1 + Math.random() * 0.05
      const flickerR =
        0.5 + Math.cos(tick * 0.09) * 0.15 + Math.cos(tick * 0.11) * 0.1 + Math.random() * 0.05
      lighting.candleL.intensity = flickerL
      lighting.candleR.intensity = flickerR

      // 불꽃 mesh scale flicker
      const flameScaleL = 0.8 + Math.sin(tick * 0.12) * 0.2 + Math.random() * 0.1
      const flameScaleR = 0.8 + Math.cos(tick * 0.11) * 0.2 + Math.random() * 0.1
      lighting.flameMeshL.scale.set(1, flameScaleL, 1)
      lighting.flameMeshR.scale.set(1, flameScaleR, 1)

      // 떠다니는 먼지 파티클
      for (let pi = 0; pi < lighting.particles.length; pi++) {
        const p = lighting.particles[pi]
        if (!p) continue
        const ud = p.userData as {
          speed: number
          driftX: number
          driftZ: number
          baseOpacity: number
          phase: number
        }
        p.position.y += ud.speed
        p.position.x += ud.driftX
        p.position.z += ud.driftZ
        ;(p.material as THREE.MeshBasicMaterial).opacity =
          ud.baseOpacity * (0.5 + 0.5 * Math.sin(tick * 0.02 + ud.phase))
        if (p.position.y > 4.5) {
          p.position.y = -0.5
          p.position.x = (Math.random() - 0.5) * 6
          p.position.z = (Math.random() - 0.5) * 4 + 1
        }
      }
    } else {
      // reduced motion: 촛불 고정, 파티클 정지
      lighting.candleL.intensity = 0.5
      lighting.candleR.intensity = 0.5
      lighting.flameMeshL.scale.set(1, 0.8, 1)
      lighting.flameMeshR.scale.set(1, 0.8, 1)
    }

    // 카메라 — parallax (데스크톱) 또는 orbit (모바일).
    // reducedMotion 사용자는 고정 위치만 유지.
    if (state.reducedMotion) {
      ctx.camera.position.set(0, 3.5, 8.0)
    } else if (state.cameraMode === 'parallax') {
      ctx.camera.position.x = state.mouse.x * 0.4
      ctx.camera.position.y = 3.5 - state.mouse.y * 0.3
    } else {
      ctx.camera.position.x = Math.sin(tick * 0.003) * 0.3
    }
    ctx.camera.lookAt(0, 0.0, 1.0)

    flowers.updateFlowerAnimations()
    incense.update(tick)

    ctx.renderer.render(ctx.scene, ctx.camera)
  }

  return {
    start: () => {
      if (rafId !== null) return
      loop()
    },
    stop: () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId)
        rafId = null
      }
    },
    isRunning: () => rafId !== null,
  }
}

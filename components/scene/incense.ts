import * as THREE from 'three'

/**
 * 향로 (censer) + 향초 (incense stick) + 연기 sprites + 교체 lighter 애니메이션.
 *
 * Legacy (public/index.html L1463-1900).
 * BRI-24 에서는 시각 요소·애니메이션만 이식하고,
 * 외부 상태(타이머 시작시각, 교체 요청 등)는 imperative handle 로 노출한다.
 * BRI-25 에서 socket.io / localStorage / DOM 버튼을 이 handle 에 연결한다.
 */

export interface IncenseController {
  /** animate 루프에서 매 프레임 호출 */
  update(tick: number, options?: IncenseUpdateOptions): void

  /** 향이 켜진 시각(ms). undefined 면 BRI-25 가 설정하기 전까지는 Date.now() fallback. */
  setStartTime(startMs: number): void

  /** 교체 애니메이션 트리거 (서버가 승인한 시점에 호출) */
  startReplaceAnim(durationMs?: number): void

  /** 서버가 교체 완료를 broadcast 한 직후 — start 시각 갱신 + 연기 재정렬 */
  performReplace(): void

  /** pointer 가 향초에 닿았을 때 호출 — 120 프레임 동안 연기 amplify */
  burstSmoke(): void

  /** pointer 가 향초 hitbox 에 닿았는지 raycast 검사 */
  isPointerOnStick(raycaster: THREE.Raycaster): boolean
}

export interface IncenseUpdateOptions {
  reducedMotion?: boolean
}

const INCENSE_DURATION_MS = 180000
const INCENSE_ORIGINAL_HEIGHT = 0.7
const INCENSE_BASE_Y = 0.06
const SMOKE_COUNT = 150
const SMOKE_MAX_H = 2.5
const SMOKE_LIFE_SPEED = 0.0015

export function createIncense(scene: THREE.Scene): IncenseController {
  const incenseGroup = new THREE.Group()
  incenseGroup.position.set(0, -0.62, 2.4)
  scene.add(incenseGroup)

  // 금색 향로 (lathe)
  const censerMat = new THREE.MeshStandardMaterial({
    color: 0xd4a13a,
    roughness: 0.28,
    metalness: 0.82,
    emissive: 0x2a1a00,
    emissiveIntensity: 0.15,
  })
  const censerPts = [
    new THREE.Vector2(0.0, 0.0),
    new THREE.Vector2(0.085, 0.002),
    new THREE.Vector2(0.098, 0.012),
    new THREE.Vector2(0.105, 0.028),
    new THREE.Vector2(0.102, 0.046),
    new THREE.Vector2(0.088, 0.06),
    new THREE.Vector2(0.072, 0.062),
    new THREE.Vector2(0.074, 0.05),
  ]
  const censer = new THREE.Mesh(new THREE.LatheGeometry(censerPts, 24), censerMat)
  censer.castShadow = true
  censer.receiveShadow = true
  incenseGroup.add(censer)

  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.086, 0.006, 6, 20), censerMat)
  rim.rotation.x = Math.PI / 2
  rim.position.y = 0.062
  incenseGroup.add(rim)

  const ash = new THREE.Mesh(
    new THREE.CircleGeometry(0.07, 20),
    new THREE.MeshStandardMaterial({ color: 0x1a1208, roughness: 1.0 }),
  )
  ash.rotation.x = -Math.PI / 2
  ash.position.y = 0.055
  incenseGroup.add(ash)

  // 향초
  const incenseStickMat = new THREE.MeshStandardMaterial({
    color: 0x4a8a3a,
    roughness: 0.9,
    metalness: 0.0,
  })
  const incenseStick = new THREE.Mesh(
    new THREE.CylinderGeometry(0.008, 0.01, INCENSE_ORIGINAL_HEIGHT, 8),
    incenseStickMat,
  )
  incenseStick.castShadow = true
  incenseStick.position.y = INCENSE_BASE_Y + INCENSE_ORIGINAL_HEIGHT / 2
  incenseStick.userData.isIncense = true
  incenseGroup.add(incenseStick)

  const incenseHit = new THREE.Mesh(
    new THREE.CylinderGeometry(0.04, 0.045, INCENSE_ORIGINAL_HEIGHT, 6),
    new THREE.MeshBasicMaterial({ visible: false }),
  )
  incenseHit.position.y = INCENSE_BASE_Y + INCENSE_ORIGINAL_HEIGHT / 2
  incenseHit.userData.isIncense = true
  incenseGroup.add(incenseHit)

  const incenseTipMat = new THREE.MeshBasicMaterial({
    color: 0xff5522,
    transparent: true,
    opacity: 0.9,
  })
  const incenseTip = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), incenseTipMat)
  incenseTip.position.y = INCENSE_BASE_Y + INCENSE_ORIGINAL_HEIGHT
  incenseGroup.add(incenseTip)

  const incenseLight = new THREE.PointLight(0xff8833, 0.35, 1.5)
  incenseLight.position.y = INCENSE_BASE_Y + INCENSE_ORIGINAL_HEIGHT
  incenseGroup.add(incenseLight)

  // 연기 텍스처 — 2D canvas 로 radial gradient + per-pixel noise
  const smokeTexture = createSmokeTexture()

  const smokeParticles: THREE.Sprite[] = []
  for (let si = 0; si < SMOKE_COUNT; si++) {
    const smokeMat = new THREE.SpriteMaterial({
      map: smokeTexture,
      color: 0xd0d0d0,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      depthTest: false,
    })
    const sm = new THREE.Sprite(smokeMat)
    sm.userData = { life: si / 150, burst: false }
    incenseGroup.add(sm)
    smokeParticles.push(sm)
  }

  // 라이터 — 교체 애니메이션 때만 visible
  const lighterGroup = new THREE.Group()
  lighterGroup.visible = false
  lighterGroup.position.set(0.35, INCENSE_BASE_Y + INCENSE_ORIGINAL_HEIGHT, 0)
  incenseGroup.add(lighterGroup)

  const lighterBody = new THREE.Mesh(
    new THREE.BoxGeometry(0.06, 0.1, 0.035),
    new THREE.MeshStandardMaterial({ color: 0x7a1a1a, roughness: 0.4, metalness: 0.3 }),
  )
  lighterBody.position.y = -0.05
  lighterGroup.add(lighterBody)

  const lighterCap = new THREE.Mesh(
    new THREE.BoxGeometry(0.06, 0.02, 0.035),
    new THREE.MeshStandardMaterial({ color: 0xbfbfbf, roughness: 0.3, metalness: 0.85 }),
  )
  lighterCap.position.y = 0.01
  lighterGroup.add(lighterCap)

  const lighterFlameMat = new THREE.MeshBasicMaterial({
    color: 0xffaa33,
    transparent: true,
    opacity: 0.95,
  })
  const lighterFlame = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.07, 6), lighterFlameMat)
  lighterFlame.position.y = 0.06
  lighterFlame.visible = false
  lighterGroup.add(lighterFlame)

  const lighterLight = new THREE.PointLight(0xffaa33, 0, 0.8)
  lighterLight.position.y = 0.06
  lighterGroup.add(lighterLight)

  const incenseAnim = { active: false, startAt: 0, duration: 2800 }
  let startTime = Date.now()
  let smokeBurstUntil = 0
  let lastTick = 0

  function setStartTime(startMs: number): void {
    if (!Number.isFinite(startMs)) return
    startTime = startMs
  }

  function clamp01(value: number): number {
    return Math.min(1, Math.max(0, value))
  }

  function getRemaining(): number {
    const elapsed = Date.now() - startTime
    return clamp01(1 - elapsed / INCENSE_DURATION_MS)
  }

  function startReplaceAnim(durationMs = 2800): void {
    incenseAnim.active = true
    incenseAnim.startAt = performance.now()
    incenseAnim.duration = durationMs
    lighterGroup.position.set(0.5, INCENSE_BASE_Y + INCENSE_ORIGINAL_HEIGHT * 0.4, 0)
    lighterGroup.rotation.z = -0.4
    lighterGroup.visible = false
    lighterFlame.visible = false
    lighterLight.intensity = 0
  }

  function performReplace(): void {
    startTime = Date.now()
    const len = smokeParticles.length
    for (let si = 0; si < len; si++) {
      const sm = smokeParticles[si]
      if (!sm) continue
      sm.userData.life = si / len
      sm.userData.burst = false
      sm.material.opacity = 0
    }
  }

  function burstSmoke(): void {
    const remaining = getRemaining()
    if (remaining <= 0.002) return
    smokeBurstUntil = lastTick + 120
    incenseLight.intensity = 0.8
    incenseTipMat.opacity = 1.0
  }

  function isPointerOnStick(raycaster: THREE.Raycaster): boolean {
    const hits = raycaster.intersectObjects([incenseHit, incenseStick], false)
    return hits.length > 0
  }

  function updateReplaceAnim(): boolean {
    if (!incenseAnim.active) return false
    const t = (performance.now() - incenseAnim.startAt) / incenseAnim.duration
    if (t >= 1) {
      incenseAnim.active = false
      lighterGroup.visible = false
      lighterFlame.visible = false
      lighterLight.intensity = 0
      incenseStickMat.opacity = 1
      incenseStickMat.transparent = false
      applyStickState(1)
      return true
    }

    incenseStickMat.transparent = true
    if (t < 0.22) {
      const u = t / 0.22
      const lift = INCENSE_ORIGINAL_HEIGHT * 0.5 * u
      incenseStick.visible = true
      incenseHit.visible = true
      incenseStick.scale.y = 1
      incenseStick.position.y = INCENSE_BASE_Y + INCENSE_ORIGINAL_HEIGHT / 2 + lift
      incenseStickMat.opacity = 1 - u
      incenseTip.visible = false
      incenseLight.visible = false
      lighterGroup.visible = false
    } else if (t < 0.28) {
      incenseStick.visible = false
      incenseHit.visible = false
      incenseTip.visible = false
      incenseLight.visible = false
      lighterGroup.visible = false
    } else if (t < 0.5) {
      const u = (t - 0.28) / 0.22
      const drop = INCENSE_ORIGINAL_HEIGHT * 0.5 * (1 - u)
      incenseStick.visible = true
      incenseHit.visible = true
      incenseStick.scale.y = 1
      incenseStick.position.y = INCENSE_BASE_Y + INCENSE_ORIGINAL_HEIGHT / 2 + drop
      incenseStickMat.opacity = u
      incenseTip.visible = false
      incenseLight.visible = false
      lighterGroup.visible = false
    } else if (t < 0.7) {
      const u = (t - 0.5) / 0.2
      incenseStick.visible = true
      incenseHit.visible = true
      incenseStick.position.y = INCENSE_BASE_Y + INCENSE_ORIGINAL_HEIGHT / 2
      incenseStickMat.opacity = 1
      lighterGroup.visible = true
      const x = 0.5 - 0.38 * u
      const tipY = INCENSE_BASE_Y + INCENSE_ORIGINAL_HEIGHT - 0.02
      lighterGroup.position.set(x, tipY, 0)
      lighterGroup.rotation.z = -0.4 + 0.2 * u
      lighterFlame.visible = false
      lighterLight.intensity = 0
    } else if (t < 0.88) {
      const u = (t - 0.7) / 0.18
      lighterGroup.visible = true
      lighterGroup.position.set(0.12, INCENSE_BASE_Y + INCENSE_ORIGINAL_HEIGHT - 0.02, 0)
      lighterGroup.rotation.z = -0.2
      lighterFlame.visible = true
      lighterFlame.scale.set(1, 0.6 + Math.sin(u * 30) * 0.3 + u * 0.4, 1)
      lighterFlameMat.opacity = 0.9 + Math.random() * 0.1
      lighterLight.intensity = 0.5 + Math.random() * 0.3
      incenseTip.visible = true
      incenseTipMat.opacity = Math.min(1, u * 1.2)
      incenseTip.position.y = INCENSE_BASE_Y + INCENSE_ORIGINAL_HEIGHT
      incenseLight.visible = true
      incenseLight.position.y = INCENSE_BASE_Y + INCENSE_ORIGINAL_HEIGHT
      incenseLight.intensity = 0.2 * u + Math.random() * 0.05
    } else {
      const u = (t - 0.88) / 0.12
      lighterGroup.visible = true
      const x = 0.12 + 0.4 * u
      lighterGroup.position.set(x, INCENSE_BASE_Y + INCENSE_ORIGINAL_HEIGHT - 0.02, 0)
      lighterGroup.rotation.z = -0.2 - 0.3 * u
      lighterFlame.visible = u < 0.3
      lighterLight.intensity = Math.max(0, 0.6 * (1 - u * 3))
      incenseTip.visible = true
      incenseTipMat.opacity = 0.9
      incenseLight.visible = true
      incenseLight.intensity = 0.3
    }
    return true
  }

  function applyStickState(remaining: number): boolean {
    const currentHeight = INCENSE_ORIGINAL_HEIGHT * remaining
    const burning = remaining > 0.002

    incenseStick.visible = burning
    incenseHit.visible = burning
    incenseTip.visible = burning
    incenseLight.visible = burning

    if (burning) {
      incenseStick.scale.y = remaining
      incenseStick.position.y = INCENSE_BASE_Y + currentHeight / 2
      incenseHit.scale.y = remaining
      incenseHit.position.y = INCENSE_BASE_Y + currentHeight / 2
      const tipY = INCENSE_BASE_Y + currentHeight
      incenseTip.position.y = tipY
      incenseLight.position.y = tipY
    }

    return burning
  }

  function hideSmokeParticles(): void {
    for (let si = 0; si < SMOKE_COUNT; si++) {
      const sm = smokeParticles[si]
      if (!sm) continue
      sm.material.opacity = 0
    }
  }

  function updateSmokeParticles(burning: boolean, emitY: number, tick: number): void {
    const t = tick * 0.012
    const isBursting = tick < smokeBurstUntil
    for (let si = 0; si < SMOKE_COUNT; si++) {
      const sm = smokeParticles[si]
      if (!sm) continue
      const ud = sm.userData

      ud.life += SMOKE_LIFE_SPEED
      if (ud.life >= 1) {
        if (burning) ud.life -= 1
        else {
          sm.material.opacity = 0
          continue
        }
      }
      if (!burning) {
        sm.material.opacity = 0
        continue
      }

      const p = ud.life as number
      const h = p * SMOKE_MAX_H
      sm.position.y = emitY + h

      const turb = Math.max(0, p - 0.15) / 0.85
      const burstBoost = isBursting ? 1.5 : 1.0
      sm.position.x =
        (Math.sin(h * 3.0 + t) * turb * 0.6 + Math.sin(h * 6.5 + t * 2.1) * turb * turb * 0.25) *
        burstBoost
      sm.position.z = 0

      let size = 0.035 + turb * turb * 0.25
      if (isBursting) size *= 1.4
      sm.scale.set(size, size, 1)

      let alpha: number
      if (p < 0.08) alpha = (p / 0.08) * 0.65
      else if (p < 0.55) alpha = 0.65
      else alpha = 0.65 * Math.max(0, 1 - (p - 0.55) / 0.45)
      if (isBursting) alpha = Math.min(0.8, alpha * 1.3)
      sm.material.opacity = alpha
      sm.material.rotation += 0.002
    }
  }

  function update(tick: number, options: IncenseUpdateOptions = {}): void {
    lastTick = tick
    const reducedMotion = options.reducedMotion ?? false

    if (reducedMotion) {
      if (incenseAnim.active) {
        incenseAnim.active = false
        lighterGroup.visible = false
        lighterFlame.visible = false
        lighterLight.intensity = 0
        incenseStickMat.opacity = 1
        incenseStickMat.transparent = false
      }

      const remaining = getRemaining()
      const burning = applyStickState(remaining)
      if (burning) {
        incenseLight.intensity = 0.32
        incenseTipMat.opacity = 0.85
      }
      hideSmokeParticles()
      return
    }

    if (updateReplaceAnim()) {
      const animT = (performance.now() - incenseAnim.startAt) / incenseAnim.duration
      const animBurning = animT >= 0.88
      updateSmokeParticles(animBurning, INCENSE_BASE_Y + INCENSE_ORIGINAL_HEIGHT, tick)
      return
    }

    const remaining = getRemaining()
    const currentHeight = INCENSE_ORIGINAL_HEIGHT * remaining
    const burning = applyStickState(remaining)

    if (burning) {
      incenseLight.intensity = 0.32 + Math.random() * 0.1
      incenseTipMat.opacity = 0.85 + Math.random() * 0.15
    }

    updateSmokeParticles(burning, INCENSE_BASE_Y + currentHeight, tick)
  }

  return {
    update,
    setStartTime,
    startReplaceAnim,
    performReplace,
    burstSmoke,
    isPointerOnStick,
  }
}

/**
 * Wispy noise smoke texture: radial gradient + per-pixel noise.
 * 겹치는 sprite 들이 연속된 연기 막 처럼 보이게 한다.
 */
function createSmokeTexture(): THREE.CanvasTexture {
  const sz = 128
  const c = document.createElement('canvas')
  c.width = sz
  c.height = sz
  const ctx = c.getContext('2d')!
  const grad = ctx.createRadialGradient(sz / 2, sz / 2, 0, sz / 2, sz / 2, sz / 2)
  grad.addColorStop(0.0, 'rgba(230,230,230,0.50)')
  grad.addColorStop(0.15, 'rgba(215,215,215,0.38)')
  grad.addColorStop(0.35, 'rgba(200,200,200,0.22)')
  grad.addColorStop(0.6, 'rgba(185,185,185,0.08)')
  grad.addColorStop(1.0, 'rgba(170,170,170,0.00)')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, sz, sz)
  const imgData = ctx.getImageData(0, 0, sz, sz)
  const d = imgData.data
  for (let i = 0; i < d.length; i += 4) {
    const px = (i / 4) % sz
    const py = Math.floor(i / 4 / sz)
    const dx = px - sz / 2
    const dy = py - sz / 2
    const dist = Math.sqrt(dx * dx + dy * dy) / (sz / 2)
    const edgeNoise = 0.6 + Math.random() * 0.8 * (0.5 + dist * 0.5)
    // noUncheckedIndexedAccess: 안전한 접근
    const cur = d[i + 3] ?? 0
    d[i + 3] = Math.min(255, Math.round(cur * edgeNoise))
  }
  ctx.putImageData(imgData, 0, 0)
  const t = new THREE.CanvasTexture(c)
  t.minFilter = THREE.LinearFilter
  t.magFilter = THREE.LinearFilter
  return t
}

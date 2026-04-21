import * as THREE from 'three'

export interface FlowerAnimationEntry {
  flower: THREE.Group
  startTime: number
  duration: number
  startY: number
  targetY: number
}

export interface FlowerController {
  placeFlowerInstant(idx: number): void
  addFlowerAnimated(): void
  updateFlowerAnimations(reducedMotion?: boolean): void
  renderInitialFlowers(count: number): void
  getFlowerCount(): number
}

const MAX_VISIBLE_FLOWERS = 200

/**
 * Chrysanthemum (국화) 꽃 생성·배치·상승 애니메이션.
 *
 * Legacy (public/index.html L1901-2142).
 * - 외/중/내 꽃잎 3 layer × 각도 랜덤 + 노란 중심부 + 줄기 + 잎
 * - placeFlowerInstant(): 즉시 배치 (초기 렌더)
 * - addFlowerAnimated(): 상공에서 낙하하며 bounce easing (헌화 시)
 */
export function createFlowerController(scene: THREE.Scene): FlowerController {
  // Shared materials
  const petalMat = new THREE.MeshStandardMaterial({
    color: 0xf0ebe0,
    side: THREE.DoubleSide,
    roughness: 0.6,
    metalness: 0.0,
  })
  const petalMat2 = new THREE.MeshStandardMaterial({
    color: 0xf5f0e8,
    side: THREE.DoubleSide,
    roughness: 0.6,
    metalness: 0.0,
  })
  const petalMat3 = new THREE.MeshStandardMaterial({
    color: 0xfaf5ee,
    side: THREE.DoubleSide,
    roughness: 0.6,
    metalness: 0.0,
  })
  const centerMat = new THREE.MeshStandardMaterial({
    color: 0xd4a574,
    roughness: 0.5,
    metalness: 0.1,
  })
  const stemMat = new THREE.MeshStandardMaterial({
    color: 0x4a7a3a,
    roughness: 0.8,
    metalness: 0.0,
  })
  const leafMat = new THREE.MeshStandardMaterial({
    color: 0x4a7a3a,
    side: THREE.DoubleSide,
    roughness: 0.7,
    metalness: 0.0,
  })

  const petalShapeOuter = createPetalShape(0.02, 0.06)
  const petalShapeMid = createPetalShape(0.018, 0.048)
  const petalShapeInner = createPetalShape(0.015, 0.035)
  const petalGeoOuter = new THREE.ShapeGeometry(petalShapeOuter)
  const petalGeoMid = new THREE.ShapeGeometry(petalShapeMid)
  const petalGeoInner = new THREE.ShapeGeometry(petalShapeInner)
  const leafShapeGeo = new THREE.ShapeGeometry(createLeafShape())
  const centerGeo = new THREE.SphereGeometry(0.015, 6, 4)
  const stemGeo = new THREE.CylinderGeometry(0.004, 0.004, 0.3, 4)

  function createFlowerGroup(seedInit: number): THREE.Group {
    let seed = seedInit
    const pseudoRand = (): number => {
      seed = (seed * 16807 + 11) % 2147483647
      return seed / 2147483647
    }

    const group = new THREE.Group()
    const headGroup = new THREE.Group()

    const outerCount = 10 + Math.floor(pseudoRand() * 4)
    for (let i = 0; i < outerCount; i++) {
      const angle = ((Math.PI * 2) / outerCount) * i + pseudoRand() * 0.2
      const petal = new THREE.Mesh(petalGeoOuter, petalMat)
      petal.position.set(Math.cos(angle) * 0.02, Math.sin(angle) * 0.02, 0)
      petal.rotation.z = angle - Math.PI / 2
      petal.rotation.x = (pseudoRand() - 0.5) * 0.3
      headGroup.add(petal)
    }

    const midCount = 8 + Math.floor(pseudoRand() * 3)
    for (let i = 0; i < midCount; i++) {
      const angle = ((Math.PI * 2) / midCount) * i + pseudoRand() * 0.3 + 0.15
      const petal = new THREE.Mesh(petalGeoMid, petalMat2)
      petal.position.set(Math.cos(angle) * 0.012, Math.sin(angle) * 0.012, 0.001)
      petal.rotation.z = angle - Math.PI / 2
      petal.rotation.x = (pseudoRand() - 0.5) * 0.2
      headGroup.add(petal)
    }

    const innerCount = 6 + Math.floor(pseudoRand() * 3)
    for (let i = 0; i < innerCount; i++) {
      const angle = ((Math.PI * 2) / innerCount) * i + pseudoRand() * 0.4 + 0.1
      const petal = new THREE.Mesh(petalGeoInner, petalMat3)
      petal.position.set(Math.cos(angle) * 0.006, Math.sin(angle) * 0.006, 0.002)
      petal.rotation.z = angle - Math.PI / 2
      headGroup.add(petal)
    }

    const center = new THREE.Mesh(centerGeo, centerMat)
    center.position.set(0, 0, 0.003)
    headGroup.add(center)

    headGroup.position.set(0, 0.15, 0)
    group.add(headGroup)

    const stem = new THREE.Mesh(stemGeo, stemMat)
    stem.position.set(0, 0, 0)
    group.add(stem)

    const leaf1 = new THREE.Mesh(leafShapeGeo, leafMat)
    leaf1.position.set(0.008, 0.06, 0)
    leaf1.rotation.z = -0.4
    leaf1.scale.set(1.2, 1.2, 1)
    group.add(leaf1)

    const leaf2 = new THREE.Mesh(leafShapeGeo, leafMat)
    leaf2.position.set(-0.008, -0.02, 0)
    leaf2.rotation.z = 0.5 + Math.PI
    leaf2.scale.set(1.0, 1.0, 1)
    group.add(leaf2)

    group.rotation.x = -Math.PI / 2.1
    group.scale.set(1.8, 1.8, 1.8)

    return group
  }

  const flowers3D: THREE.Group[] = []
  const animatingFlowers: FlowerAnimationEntry[] = []

  function placeFlowerInstant(idx: number): void {
    if (idx >= MAX_VISIBLE_FLOWERS) return
    const seed = idx * 9973 + 12345
    const flower = createFlowerGroup(seed)
    const pos = getFlowerPosition(idx)
    flower.position.set(pos.x, pos.y, pos.z)
    flower.rotation.y = pseudoRandSimple(idx * 13 + 7) * Math.PI * 2
    scene.add(flower)
    flowers3D.push(flower)
  }

  function addFlowerAnimated(): void {
    const idx = flowers3D.length
    if (idx >= MAX_VISIBLE_FLOWERS) return
    const seed = Date.now() + Math.floor(Math.random() * 100000)
    const flower = createFlowerGroup(seed)
    const pos = getFlowerPosition(idx)
    flower.position.set(pos.x, 3.0, pos.z)
    flower.rotation.y = Math.random() * Math.PI * 2
    scene.add(flower)
    flowers3D.push(flower)

    animatingFlowers.push({
      flower,
      startTime: performance.now(),
      duration: 3000,
      startY: 3.0,
      targetY: pos.y,
    })
  }

  function settleFlowerAnimations(): void {
    for (let i = animatingFlowers.length - 1; i >= 0; i--) {
      const anim = animatingFlowers[i]
      if (!anim) continue
      anim.flower.position.y = anim.targetY
      animatingFlowers.splice(i, 1)
    }
  }

  function updateFlowerAnimations(reducedMotion = false): void {
    if (reducedMotion) {
      settleFlowerAnimations()
      return
    }

    const now = performance.now()
    for (let i = animatingFlowers.length - 1; i >= 0; i--) {
      const anim = animatingFlowers[i]
      if (!anim) continue
      const elapsed = now - anim.startTime
      const t = Math.min(elapsed / anim.duration, 1.0)

      let eased: number
      if (t < 0.6) {
        const e = t / 0.6
        eased = (1 - (1 - e) * (1 - e)) * 1.08
      } else if (t < 0.8) {
        const bt = (t - 0.6) / 0.2
        eased = 1.08 - Math.sin(bt * Math.PI) * 0.08
      } else {
        const bt = (t - 0.8) / 0.2
        eased = 1.0 - (1 - bt) * 0.02
      }

      anim.flower.position.y = anim.startY + (anim.targetY - anim.startY) * eased

      if (t >= 1.0) {
        anim.flower.position.y = anim.targetY
        animatingFlowers.splice(i, 1)
      }
    }
  }

  function renderInitialFlowers(count: number): void {
    const n = Math.min(count, MAX_VISIBLE_FLOWERS)
    for (let i = 0; i < n; i++) placeFlowerInstant(i)
  }

  return {
    placeFlowerInstant,
    addFlowerAnimated,
    updateFlowerAnimations,
    renderInitialFlowers,
    getFlowerCount: () => flowers3D.length,
  }
}

function createPetalShape(w: number, h: number): THREE.Shape {
  const petalShape = new THREE.Shape()
  petalShape.moveTo(0, 0)
  petalShape.quadraticCurveTo(w * 0.6, h * 0.3, w * 0.3, h)
  petalShape.quadraticCurveTo(0, h * 1.05, -w * 0.3, h)
  petalShape.quadraticCurveTo(-w * 0.6, h * 0.3, 0, 0)
  return petalShape
}

function createLeafShape(): THREE.Shape {
  const s = new THREE.Shape()
  s.moveTo(0, 0)
  s.quadraticCurveTo(0.02, 0.03, 0.008, 0.06)
  s.quadraticCurveTo(0, 0.065, -0.008, 0.06)
  s.quadraticCurveTo(-0.02, 0.03, 0, 0)
  return s
}

function getFlowerPosition(idx: number): { x: number; y: number; z: number } {
  const r = pseudoRandSimple(idx)
  const r2 = pseudoRandSimple(idx * 7 + 3)
  const r3 = pseudoRandSimple(idx * 13 + 17)
  const x = (r - 0.5) * 1.1 + (r3 - 0.5) * 0.2
  const z = 1.3 + r2 * 0.5 + (r3 - 0.5) * 0.2
  const layer = Math.floor(idx / 7)
  const y = -0.62 + layer * 0.04 + r * 0.02
  return { x, y, z }
}

function pseudoRandSimple(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453
  return x - Math.floor(x)
}

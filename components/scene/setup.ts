import * as THREE from 'three'

export interface SceneContext {
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  renderer: THREE.WebGLRenderer
}

/**
 * Scene / Camera / Renderer 초기화.
 *
 * Legacy (public/index.html L1247-1268) 의 값을 그대로 이식했다.
 * - FogExp2 density 0.05
 * - PerspectiveCamera fov 40, near 0.1, far 100
 * - WebGLRenderer antialias + alpha, PCFSoftShadowMap
 * - pixelRatio cap 2 (모바일 과도한 GPU 사용 방지)
 */
export function createSceneContext(container: HTMLElement): SceneContext {
  const scene = new THREE.Scene()
  scene.fog = new THREE.FogExp2(0x1a1a18, 0.05)

  const camera = new THREE.PerspectiveCamera(
    40,
    container.clientWidth / container.clientHeight,
    0.1,
    100,
  )
  camera.position.set(0, 3.5, 8.0)
  camera.lookAt(0, 0.0, 1.0)

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setSize(container.clientWidth, container.clientHeight)
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap

  return { scene, camera, renderer }
}

/**
 * 묘비, 받침, 초상화, 액자, 검은 리본, 바닥, 어두운 패치.
 * 모두 scene 에 add 되며 별도 핸들 필요 없음.
 */
export function buildMemorialWorld(scene: THREE.Scene): void {
  // Tombstone shape
  const shape = new THREE.Shape()
  const W = 1.0
  const H = 2.8
  const R = 1.0
  shape.moveTo(-W, 0)
  shape.lineTo(-W, H - R)
  shape.quadraticCurveTo(-W, H, -W + R * 0.3, H)
  shape.lineTo(0, H + 0.15)
  shape.lineTo(W - R * 0.3, H)
  shape.quadraticCurveTo(W, H, W, H - R)
  shape.lineTo(W, 0)
  shape.lineTo(-W, 0)

  const extrudeSettings: THREE.ExtrudeGeometryOptions = {
    depth: 0.3,
    bevelEnabled: true,
    bevelThickness: 0.03,
    bevelSize: 0.03,
    bevelSegments: 3,
  }
  const tombGeo = new THREE.ExtrudeGeometry(shape, extrudeSettings)
  const tombMat = new THREE.MeshStandardMaterial({
    color: 0x7a7a7a,
    roughness: 0.92,
    metalness: 0.08,
  })
  const tombstone = new THREE.Mesh(tombGeo, tombMat)
  tombstone.castShadow = true
  tombstone.receiveShadow = true
  tombstone.position.set(0, -0.5, 0)
  scene.add(tombstone)

  // Base slab
  const baseGeo = new THREE.BoxGeometry(2.6, 0.2, 0.6)
  const baseMat = new THREE.MeshStandardMaterial({
    color: 0x6a6a6a,
    roughness: 0.95,
    metalness: 0.05,
  })
  const baseSlab = new THREE.Mesh(baseGeo, baseMat)
  baseSlab.position.set(0, -0.6, 0.15)
  baseSlab.castShadow = true
  baseSlab.receiveShadow = true
  scene.add(baseSlab)

  // Portrait
  const texLoader = new THREE.TextureLoader()
  const portraitTex = texLoader.load('/boj-portrait.png')
  const portraitGeo = new THREE.PlaneGeometry(1.3, 0.85)
  const portraitMat = new THREE.MeshStandardMaterial({
    map: portraitTex,
    roughness: 0.5,
    metalness: 0.0,
  })
  const portrait = new THREE.Mesh(portraitGeo, portraitMat)
  portrait.position.set(0, 1.35, 0.35)
  scene.add(portrait)

  // Portrait frame
  const frameThick = 0.04
  const frameDepth = 0.06
  const frameMat = new THREE.MeshStandardMaterial({
    color: 0x3a2a1a,
    roughness: 0.7,
    metalness: 0.15,
  })
  const makeFrameBar = (w: number, h: number, d: number): THREE.Mesh => {
    return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), frameMat)
  }
  const fTop = makeFrameBar(1.3 + frameThick * 2, frameThick, frameDepth)
  fTop.position.set(0, 1.35 + 0.425 + frameThick / 2, 0.36)
  scene.add(fTop)
  const fBot = makeFrameBar(1.3 + frameThick * 2, frameThick, frameDepth)
  fBot.position.set(0, 1.35 - 0.425 - frameThick / 2, 0.36)
  scene.add(fBot)
  const fLeft = makeFrameBar(frameThick, 0.85, frameDepth)
  fLeft.position.set(-0.65 - frameThick / 2, 1.35, 0.36)
  scene.add(fLeft)
  const fRight = makeFrameBar(frameThick, 0.85, frameDepth)
  fRight.position.set(0.65 + frameThick / 2, 1.35, 0.36)
  scene.add(fRight)

  // Black ribbon (V)
  const ribbonMat = new THREE.MeshStandardMaterial({
    color: 0x111111,
    roughness: 0.5,
    side: THREE.DoubleSide,
  })
  const ribbonGeoL = new THREE.PlaneGeometry(0.045, 0.684)
  const ribbonL = new THREE.Mesh(ribbonGeoL, ribbonMat)
  ribbonL.position.set(-0.325, 1.669, 0.39)
  ribbonL.rotation.z = -1.255
  scene.add(ribbonL)
  const ribbonGeoR = new THREE.PlaneGeometry(0.045, 0.684)
  const ribbonR = new THREE.Mesh(ribbonGeoR, ribbonMat)
  ribbonR.position.set(0.325, 1.669, 0.39)
  ribbonR.rotation.z = 1.255
  scene.add(ribbonR)

  // Ground
  const groundGeo = new THREE.PlaneGeometry(20, 20)
  const groundMat = new THREE.MeshStandardMaterial({
    color: 0x222218,
    roughness: 1.0,
    metalness: 0.0,
  })
  const ground = new THREE.Mesh(groundGeo, groundMat)
  ground.rotation.x = -Math.PI / 2
  ground.position.y = -0.7
  ground.receiveShadow = true
  scene.add(ground)

  // Dark patch near tombstone base
  const darkPatchGeo = new THREE.PlaneGeometry(3.5, 2.0)
  const darkPatchMat = new THREE.MeshStandardMaterial({
    color: 0x2a2820,
    roughness: 1.0,
    metalness: 0.0,
  })
  const darkPatch = new THREE.Mesh(darkPatchGeo, darkPatchMat)
  darkPatch.rotation.x = -Math.PI / 2
  darkPatch.position.set(0, -0.695, 0.8)
  darkPatch.receiveShadow = true
  scene.add(darkPatch)
}

export function handleResize(
  container: HTMLElement,
  camera: THREE.PerspectiveCamera,
  renderer: THREE.WebGLRenderer,
): void {
  const w = container.clientWidth
  const h = container.clientHeight
  camera.aspect = w / h
  camera.fov = window.innerWidth < 768 ? 55 : 45
  camera.updateProjectionMatrix()
  renderer.setSize(w, h)
}

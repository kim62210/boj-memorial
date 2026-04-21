import * as THREE from 'three'

export interface LightingHandles {
  candleL: THREE.PointLight
  candleR: THREE.PointLight
  flameMeshL: THREE.Mesh
  flameMeshR: THREE.Mesh
  particles: THREE.Mesh[]
}

/**
 * Ambient / Directional + 향초 PointLight × 2 + 촛불 콘 mesh × 2 + 촛대 body.
 * + 30 개의 떠다니는 먼지/반딧불 파티클.
 *
 * Legacy (public/index.html L1270-1334).
 */
export function createLighting(scene: THREE.Scene): LightingHandles {
  const ambient = new THREE.AmbientLight(0xffe8d0, 0.55)
  scene.add(ambient)

  const dirLight = new THREE.DirectionalLight(0xfff5e8, 0.8)
  dirLight.position.set(-3, 5, 4)
  dirLight.castShadow = true
  dirLight.shadow.mapSize.set(1024, 1024)
  dirLight.shadow.camera.near = 0.5
  dirLight.shadow.camera.far = 15
  dirLight.shadow.camera.left = -4
  dirLight.shadow.camera.right = 4
  dirLight.shadow.camera.top = 5
  dirLight.shadow.camera.bottom = -2
  scene.add(dirLight)

  const candleL = new THREE.PointLight(0xff9933, 0.6, 4)
  candleL.position.set(-1.4, 0.6, 0.8)
  scene.add(candleL)
  const candleR = new THREE.PointLight(0xff9933, 0.6, 4)
  candleR.position.set(1.4, 0.6, 0.8)
  scene.add(candleR)

  const flameMat = new THREE.MeshBasicMaterial({
    color: 0xff8833,
    transparent: true,
    opacity: 0.8,
  })
  const flameGeoL = new THREE.ConeGeometry(0.03, 0.1, 6)
  const flameMeshL = new THREE.Mesh(flameGeoL, flameMat)
  flameMeshL.position.set(-1.4, 0.55, 0.8)
  scene.add(flameMeshL)
  const flameGeoR = new THREE.ConeGeometry(0.03, 0.1, 6)
  const flameMeshR = new THREE.Mesh(flameGeoR, flameMat)
  flameMeshR.position.set(1.4, 0.55, 0.8)
  scene.add(flameMeshR)

  const candleBodyMat = new THREE.MeshStandardMaterial({
    color: 0xf5e6d3,
    roughness: 0.9,
  })
  const candleBodyGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.25, 8)
  const candleBodyL = new THREE.Mesh(candleBodyGeo, candleBodyMat)
  candleBodyL.position.set(-1.4, 0.38, 0.8)
  scene.add(candleBodyL)
  const candleBodyR = new THREE.Mesh(candleBodyGeo, candleBodyMat)
  candleBodyR.position.set(1.4, 0.38, 0.8)
  scene.add(candleBodyR)

  // 떠다니는 먼지/반딧불 파티클 30개
  const particles: THREE.Mesh[] = []
  const particleGeo = new THREE.SphereGeometry(0.01, 4, 4)
  const particleMat = new THREE.MeshBasicMaterial({
    color: 0xffcc88,
    transparent: true,
    opacity: 0.6,
  })
  for (let pi = 0; pi < 30; pi++) {
    const pMesh = new THREE.Mesh(particleGeo, particleMat.clone())
    pMesh.position.set(
      (Math.random() - 0.5) * 6,
      -0.5 + Math.random() * 5,
      (Math.random() - 0.5) * 4 + 1,
    )
    pMesh.userData = {
      speed: 0.002 + Math.random() * 0.004,
      driftX: (Math.random() - 0.5) * 0.003,
      driftZ: (Math.random() - 0.5) * 0.002,
      baseOpacity: 0.3 + Math.random() * 0.4,
      phase: Math.random() * Math.PI * 2,
    }
    scene.add(pMesh)
    particles.push(pMesh)
  }

  return { candleL, candleR, flameMeshL, flameMeshR, particles }
}

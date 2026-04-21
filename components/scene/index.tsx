'use client'

import dynamic from 'next/dynamic'

/**
 * Three.js scene — SSR 불가(WebGLRenderer 는 브라우저 전용).
 * next/dynamic 으로 감싸 Client Component 로만 로드한다.
 * Next.js 16 에서는 `ssr: false` 가 Client Component 경계 안에서만 허용되므로
 * 이 barrel 파일 자체가 'use client' 여야 한다.
 */
export const MemorialScene = dynamic(() => import('./MemorialScene'), {
  ssr: false,
  loading: () => <div id="scene-root" className="relative h-dvh w-full bg-[#0a0a0a]" />,
})

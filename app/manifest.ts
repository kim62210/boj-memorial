import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'BOJ Memorial - 백준 온라인 저지 추모 공간',
    short_name: 'BOJ Memorial',
    description: 'Baekjoon Online Judge 추모 공간. 2010년부터 함께한 백준, 감사했습니다.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#09090b',
    theme_color: '#09090b',
    lang: 'ko-KR',
    dir: 'ltr',
    categories: ['memorial', 'tribute'],
    icons: [
      {
        src: '/icon.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/apple-icon.png',
        sizes: '180x180',
        type: 'image/png',
        purpose: 'any',
      },
    ],
  }
}

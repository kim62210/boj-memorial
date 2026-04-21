import { describe, expect, it, vi } from 'vitest'

import { generateMetadata, viewport } from '../../../app/[locale]/layout'

const translations: Record<string, string> = {
  title: 'BOJ Memorial',
  description: 'Baekjoon Online Judge memorial space.',
  keywords: 'boj,baekjoon,memorial',
  ogTitle: 'BOJ Memorial',
  ogDescription: 'Baekjoon Online Judge memorial space.',
  twitterTitle: 'BOJ Memorial',
  twitterDescription: 'Baekjoon Online Judge memorial space.',
}

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async () => (key: string) => translations[key] ?? key),
  setRequestLocale: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => {
    throw new Error('notFound')
  }),
}))

describe('locale layout metadata', () => {
  it('uses App Router metadata file conventions for icons and current social image routes', async () => {
    const metadata = await generateMetadata({ params: Promise.resolve({ locale: 'ko' }) })

    expect(metadata.icons).toBeUndefined()
    expect(metadata.openGraph?.images).toEqual([
      {
        url: '/opengraph-image.png',
        width: 1200,
        height: 630,
        alt: 'ogImageAlt',
      },
    ])
    expect(metadata.twitter?.images).toEqual([
      {
        url: '/twitter-image.png',
        alt: 'twitterImageAlt',
      },
    ])
  })

  it('restores original head metadata parity fields', async () => {
    const metadata = await generateMetadata({ params: Promise.resolve({ locale: 'ko' }) })

    expect(metadata.authors).toEqual([{ name: 'BOJ Memorial' }])
    expect(metadata.alternates).toEqual({ canonical: '/' })
    expect(metadata.robots).toEqual({
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        'max-image-preview': 'large',
        'max-snippet': -1,
        'max-video-preview': -1,
      },
    })
    expect(metadata.openGraph).toEqual(
      expect.objectContaining({
        type: 'website',
        url: '/',
        siteName: 'BOJ Memorial',
        locale: 'ko_KR',
      }),
    )
    expect(viewport).toEqual({
      width: 'device-width',
      initialScale: 1,
      maximumScale: 1,
      userScalable: false,
      themeColor: '#09090b',
      colorScheme: 'dark',
    })
  })
})

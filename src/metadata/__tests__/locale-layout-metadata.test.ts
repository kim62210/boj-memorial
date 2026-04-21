import { describe, expect, it, vi } from 'vitest'

import { generateMetadata, viewport } from '../../../app/[locale]/layout'
import sitemap from '../../../app/sitemap'

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
  it('does not override App Router icon and social image file conventions', async () => {
    const metadata = await generateMetadata({ params: Promise.resolve({ locale: 'ko' }) })

    expect(metadata.icons).toBeUndefined()
    expect(metadata.openGraph?.images).toBeUndefined()
    expect(metadata.twitter?.images).toBeUndefined()
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

describe('sitemap metadata', () => {
  it('uses a stable lastModified date', () => {
    expect(sitemap()).toEqual([
      {
        url: 'https://boj-memorial.brian-dev.cloud/',
        lastModified: new Date('2026-04-21T00:00:00.000Z'),
        changeFrequency: 'weekly',
        priority: 1,
      },
    ])
  })
})
